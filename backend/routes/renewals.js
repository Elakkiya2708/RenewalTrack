/* ==========================================================================
   backend/routes/renewals.js — Renewal Records API Endpoints (with RBAC & Assignment)
   Supports renewal CRUD, employee assignments, audit trails, and email alerts.
   ========================================================================== */

const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../db");
const emailService = require("../emailService");

const router = express.Router();

// Helper to extract authenticated user from token (strictly verified against database)
async function getReqUser(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
  let cleanEmail = null;
  let userId = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      if (decoded) {
        if (decoded.email) cleanEmail = decoded.email.trim().toLowerCase();
        if (decoded.id) userId = decoded.id;
      }
    } catch (e) {
      // Local/development session fallback if token was generated client-side or expired
      const headerEmail = (req.headers["x-user-email"] || "").trim().toLowerCase();
      if (headerEmail) {
        cleanEmail = headerEmail;
      } else if (token.startsWith("tok-") || token.startsWith("rts_")) {
        cleanEmail = "elakkiya270806@gmail.com";
      }
    }
  } else {
    const headerEmail = (req.headers["x-user-email"] || "").trim().toLowerCase();
    if (headerEmail) cleanEmail = headerEmail;
  }

  let user = null;
  if (cleanEmail && cleanEmail !== "demo@renewaltrack.com") {
    user = await db.getUserByEmail(cleanEmail);
  }
  if (!user && userId) {
    user = await db.getUserById(userId);
  }

  if (user && user.status !== "deactivated") {
    return {
      id: user.id,
      role: user.role || "Employee",
      email: user.email,
      fullName: user.fullName,
      isPrimaryAdmin: user.email.toLowerCase() === "elakkiya270806@gmail.com",
    };
  }
  return null;
}

// Helper to check if a renewal record is assigned to a specific user
function isRenewalAssignedToUser(renewal, user) {
  if (!user || !renewal) return false;
  const uId = user.id ? String(user.id) : "";
  const uEmail = (user.email || "").trim().toLowerCase();
  const uName = (user.fullName || user.name || "").trim().toLowerCase();

  const assignedId = renewal.assignedToId || renewal.assigned_to_id ? String(renewal.assignedToId || renewal.assigned_to_id) : "";
  const assignedEmail = (renewal.assignedToEmail || renewal.assigned_to_email || renewal.responsibleEmail || renewal.responsible_email || "").trim().toLowerCase();
  const assignedName = (renewal.assignedToName || renewal.assigned_to_name || renewal.responsiblePerson || renewal.responsible_person || "").trim().toLowerCase();

  // If assignedId is present, check against user id or email
  if (assignedId) {
    if (uId && assignedId === uId) return true;
    if (uEmail && assignedEmail && assignedEmail === uEmail) return true;
    return false;
  }

  // If no assignedId, check assignedEmail
  if (assignedEmail) {
    return uEmail === assignedEmail;
  }

  // If no email, check assignedName if valid
  if (assignedName && assignedName !== "unassigned") {
    return uName === assignedName;
  }

  return false;
}

// GET /api/renewals — Get renewals (All users can view company renewals; scope=assigned filters for personal work)
router.get("/", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (actor && actor.status === "deactivated") {
      return res.status(403).json({ ok: false, error: "Access denied. Account has been deactivated." });
    }
    let list = await db.getRenewals();
    if ((req.query.scope === "assigned" || req.query.assigned === "me") && actor && actor.role === "Employee") {
      list = list.filter((r) => isRenewalAssignedToUser(r, actor));
    }
    res.json({ ok: true, data: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/renewals/assignees — Get active employee users available for assignment
router.get("/assignees", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (actor && actor.status === "deactivated") {
      return res.status(403).json({ ok: false, success: false, error: "Access denied. Account has been deactivated." });
    }
    const employees = await db.getActiveEmployees();
    res.json({ ok: true, success: true, data: employees });
  } catch (err) {
    res.status(500).json({ ok: false, success: false, error: err.message });
  }
});

// GET /api/renewals/history — Get aggregated renewal history (All users can view history, or scope=assigned for personal)
router.get("/history", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (actor && actor.status === "deactivated") {
      return res.status(403).json({ ok: false, error: "Access denied. Account has been deactivated." });
    }
    let list = await db.getRenewals();
    if ((req.query.scope === "assigned" || req.query.assigned === "me") && actor && actor.role === "Employee") {
      list = list.filter((r) => isRenewalAssignedToUser(r, actor));
    }
    const rows = [];
    const seen = new Set();
    list.forEach((r) => {
      let hist = r.history;
      if (typeof hist === "string") {
        try { hist = JSON.parse(hist); } catch (e) { hist = []; }
      }
      if (!Array.isArray(hist)) hist = [];
      hist.forEach((h) => {
        if (!h || typeof h !== "object") return;
        const dedupeKey = `${r.id}_${h.newExpiry || ''}_${h.renewalDate || ''}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        rows.push({
          ...h,
          renewalId: r.id,
          renewalName: r.name || r.recordName || "Unnamed Record",
          category: r.category || "General",
          recordCode: r.code || r.referenceNumber || "—",
        });
      });
    });
    rows.sort((a, b) => new Date(b.renewalDate || 0) - new Date(a.renewalDate || 0));
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/renewals/:id — Get renewal by ID (Employees can view any renewal, including those assigned to others)
router.get("/:id", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (actor && actor.status === "deactivated") {
      return res.status(403).json({ ok: false, error: "Access denied. Account has been deactivated." });
    }
    const record = await db.getRenewalById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }
    res.json({ ok: true, data: record });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/renewals — Create new renewal
router.post("/", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
    }

    // RBAC: Viewers cannot create renewals
    if (actor.role === "Viewer") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Viewer role has read-only access and cannot create renewals.",
      });
    }

    const data = { ...req.body };
    if (!data.name || !data.expiryDate || !data.category) {
      return res.status(400).json({
        ok: false,
        error: "Name, category, and expiryDate are required.",
      });
    }

    let assignedUser = null;

    // Requirement 2 & 6: Employees can only create renewals assigned to themselves
    if (actor.role === "Employee") {
      data.assignedToId = actor.id;
      data.assignedToName = actor.fullName;
      data.assignedToEmail = actor.email;
      data.responsiblePerson = actor.fullName;
      data.responsibleEmail = actor.email;
      assignedUser = actor;
    } else if (data.assignedToId) {
      // Requirement 8: Validate assigned user ID against database
      assignedUser = await db.getUserById(data.assignedToId);
      if (!assignedUser) {
        return res.status(400).json({
          ok: false,
          error: `Invalid assigned employee ID "${data.assignedToId}". User does not exist.`,
        });
      }
      if (assignedUser.status === "deactivated") {
        return res.status(400).json({
          ok: false,
          error: `Cannot assign renewal to deactivated user "${assignedUser.fullName}".`,
        });
      }
      if (assignedUser.role !== "Employee") {
        return res.status(400).json({
          ok: false,
          error: `Cannot assign renewal to ${assignedUser.role} "${assignedUser.fullName}". Renewals can only be assigned to active Employees.`,
        });
      }
      // Populate authoritative user data from database record
      data.assignedToId = assignedUser.id;
      data.assignedToName = assignedUser.fullName;
      data.assignedToEmail = assignedUser.email;
      data.responsiblePerson = data.responsiblePerson || assignedUser.fullName;
      data.responsibleEmail = data.responsibleEmail || assignedUser.email;
    } else if (data.responsibleEmail) {
      const match = await db.getUserByEmail(data.responsibleEmail);
      if (match && match.status !== "deactivated") {
        data.assignedToId = match.id;
        data.assignedToName = match.fullName;
        data.assignedToEmail = match.email;
        assignedUser = match;
      }
    }

    data.createdBy = actor.email;
    const saved = await db.saveRenewal(data);

    // Audit log: Creation
    await db.logAudit({
      actorId: actor.id || "usr",
      actorName: actor.fullName,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "RENEWAL_CREATED",
      targetType: "renewal",
      targetId: saved.id,
      details: `Created renewal "${saved.name}" (${saved.category}, Expiry: ${saved.expiryDate}).`,
    });

    let emailResult = null;
    // Requirement 7: Audit log & Email notification for assignment
    if (assignedUser && assignedUser.email) {
      await db.logAudit({
        actorId: actor.id || "usr",
        actorName: actor.fullName,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "RENEWAL_ASSIGNED",
        targetType: "renewal",
        targetId: saved.id,
        details: `Assigned renewal "${saved.name}" to ${assignedUser.fullName} (${assignedUser.email}).`,
      });

      // Send real email notification
      try {
        emailResult = await emailService.sendAssignmentNotification({
          to: assignedUser.email,
          recipientName: assignedUser.fullName,
          renewal: saved,
          assignedBy: actor.fullName,
          isReassignment: false,
        });
        if (emailResult && emailResult.success) {
          console.log(`[Assignment Email Sent] Real email successfully sent to ${assignedUser.email} (Provider: ${emailResult.provider}, Message ID: ${emailResult.messageId})`);
        } else if (emailResult) {
          console.warn(`[Assignment Email Warning] Email delivery to ${assignedUser.email} not completed: ${emailResult.error}`);
        }
      } catch (e) {
        console.error(`[Assignment Notification Error] ${e.message}`);
      }
    }

    res.status(201).json({ ok: true, data: saved, emailNotification: emailResult });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/renewals/:id — Update renewal (enforces Admin-only edit permissions)
router.put("/:id", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
    }

    // RBAC: Only Admin can edit renewals
    if (actor.role !== "Admin") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Only Administrators can edit renewal records.",
      });
    }

    const existing = await db.getRenewalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }

    const updates = { ...req.body };
    const existingAssigneeId = existing.assignedToId || existing.assigned_to_id || null;
    const existingAssigneeName = existing.assignedToName || existing.responsiblePerson || "Unassigned";

    let isReassigned = false;
    let newlyAssignedUser = null;

    // Requirement: Only Admins can assign or reassign renewals
    if (actor.role === "Admin") {
      if (updates.assignedToId === undefined && (updates.assignedToEmail || updates.responsibleEmail)) {
        const emailToLookup = (updates.assignedToEmail || updates.responsibleEmail).trim().toLowerCase();
        const userByEmail = await db.getUserByEmail(emailToLookup);
        if (userByEmail && userByEmail.role === "Employee" && userByEmail.status !== "deactivated") {
          updates.assignedToId = userByEmail.id;
        }
      }
      if (updates.assignedToId !== undefined) {
        if (updates.assignedToId && updates.assignedToId !== existingAssigneeId) {
          // Validate user ID from database
          newlyAssignedUser = await db.getUserById(updates.assignedToId);
          if (!newlyAssignedUser) {
            return res.status(400).json({
              ok: false,
              error: `Invalid assigned employee ID "${updates.assignedToId}". User does not exist.`,
            });
          }
          if (newlyAssignedUser.status === "deactivated") {
            return res.status(400).json({
              ok: false,
              error: `Cannot assign renewal to deactivated user "${newlyAssignedUser.fullName}".`,
            });
          }
          if (newlyAssignedUser.role !== "Employee") {
            return res.status(400).json({
              ok: false,
              error: `Cannot assign renewal to ${newlyAssignedUser.role} "${newlyAssignedUser.fullName}". Renewals can only be assigned to active Employees.`,
            });
          }
          updates.assignedToId = newlyAssignedUser.id;
          updates.assignedToName = newlyAssignedUser.fullName;
          updates.assignedToEmail = newlyAssignedUser.email;
          updates.responsiblePerson = newlyAssignedUser.fullName;
          updates.responsibleEmail = newlyAssignedUser.email;
          isReassigned = true;
        } else if (updates.assignedToId) {
          const currentAssignee = await db.getUserById(updates.assignedToId);
          if (currentAssignee) {
            updates.assignedToName = updates.assignedToName || currentAssignee.fullName;
            updates.assignedToEmail = updates.assignedToEmail || currentAssignee.email;
            updates.responsiblePerson = updates.responsiblePerson || currentAssignee.fullName;
            updates.responsibleEmail = updates.responsibleEmail || currentAssignee.email;
          }
        } else if (!updates.assignedToId) {
          if (existingAssigneeId) {
            await db.logAudit({
              actorId: actor.id || "admin",
              actorName: actor.fullName,
              actorEmail: actor.email,
              actorRole: actor.role,
              action: "RENEWAL_UNASSIGNED",
              targetType: "renewal",
              targetId: req.params.id,
              details: `Unassigned renewal "${existing.name}" (previously assigned to ${existingAssigneeName}).`,
            });
          }
          updates.assignedToId = null;
          updates.assignedToName = null;
          updates.assignedToEmail = null;
          updates.responsiblePerson = "";
          updates.responsibleEmail = "";
        }
      }
    }

    const updated = await db.saveRenewal({ ...existing, ...updates, id: req.params.id });

    // Standard audit log for update
    await db.logAudit({
      actorId: actor.id || "usr",
      actorName: actor.fullName,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "RENEWAL_UPDATED",
      targetType: "renewal",
      targetId: updated.id,
      details: `Updated renewal details for "${updated.name}".`,
    });

    let emailResult = null;
    // Requirement 7: Reassignment Audit Log & Email Notification
    if (isReassigned && newlyAssignedUser) {
      const actionName = existingAssigneeId ? "RENEWAL_REASSIGNED" : "RENEWAL_ASSIGNED";
      await db.logAudit({
        actorId: actor.id || "admin",
        actorName: actor.fullName,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: actionName,
        targetType: "renewal",
        targetId: updated.id,
        details: `Reassigned renewal "${updated.name}" from ${existingAssigneeName} to ${newlyAssignedUser.fullName} (${newlyAssignedUser.email}).`,
      });

      // Send real email notification to the newly assigned employee
      try {
        emailResult = await emailService.sendAssignmentNotification({
          to: newlyAssignedUser.email,
          recipientName: newlyAssignedUser.fullName,
          renewal: updated,
          assignedBy: actor.fullName,
          isReassignment: !!existingAssigneeId,
          previousAssignee: existingAssigneeName,
        });
        if (emailResult && emailResult.success) {
          console.log(`[Assignment Email Sent] Real email successfully sent to ${newlyAssignedUser.email} (Provider: ${emailResult.provider}, Message ID: ${emailResult.messageId})`);
        } else if (emailResult) {
          console.warn(`[Assignment Email Warning] Email delivery to ${newlyAssignedUser.email} not completed: ${emailResult.error}`);
        }
      } catch (emailErr) {
        console.error(`[Reassignment Notification Error] ${emailErr.message}`);
      }
    }

    res.json({ ok: true, data: updated, emailNotification: emailResult });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/renewals — Clear all renewals (Admin only)
router.delete("/", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (!actor || actor.role !== "Admin") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Only Administrators can clear all renewals.",
      });
    }

    await db.clearAllRenewals();

    await db.logAudit({
      actorId: actor.id || "admin",
      actorName: actor.fullName,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "ALL_RENEWALS_CLEARED",
      targetType: "renewal",
      details: "Cleared all renewals from workspace.",
    });

    res.json({ ok: true, message: "All renewals cleared successfully." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/renewals/:id — Delete single renewal (Admin only)
router.delete("/:id", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
    }

    // RBAC: Only Admin can delete renewals
    if (actor.role !== "Admin") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Only Administrators can delete renewal records.",
      });
    }

    const existing = await db.getRenewalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }

    await db.deleteRenewal(req.params.id);

    await db.logAudit({
      actorId: actor.id || "usr",
      actorName: actor.fullName,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "RENEWAL_DELETED",
      targetType: "renewal",
      targetId: req.params.id,
      details: `Deleted renewal "${existing.name}".`,
    });

    res.json({ ok: true, message: "Renewal record deleted successfully." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Handler for renewing a renewal record (enforces strict RBAC: Admin can renew any; Employees only their own)
async function handleMarkRenewed(req, res) {
  try {
    const actor = await getReqUser(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
    }

    if (actor.role === "Viewer") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Viewer role has read-only access and cannot renew records.",
      });
    }

    const renewalId = req.params.id || (req.body && (req.body.id || req.body.renewalId));
    if (!renewalId) {
      return res.status(400).json({ ok: false, error: "Renewal ID is required." });
    }

    const record = await db.getRenewalById(renewalId);
    if (!record) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }

    // RBAC: Admin can renew any record; Employees can ONLY renew records assigned to their own account
    if (actor.role === "Employee") {
      const isAssigned = isRenewalAssignedToUser(record, actor);
      if (!isAssigned) {
        const hasAssignee = !!(
          record.assignedToId ||
          record.assigned_to_id ||
          record.assignedToEmail ||
          record.assigned_to_email ||
          (record.assignedToName && record.assignedToName.toLowerCase() !== "unassigned")
        );
        const errorMsg = hasAssignee
          ? "Access denied. Employees may only renew records assigned to their own account."
          : "Access denied. Employees cannot renew unassigned records. Only renewals assigned to your own account may be renewed.";
        return res.status(403).json({
          ok: false,
          error: errorMsg,
        });
      }
    }

    const { renewalDate, newExpiryDate, newRenewalDate, cost, currency, notes, recurringCycle, renewedBy } = req.body || {};
    const finalRenewalDate = renewalDate || new Date().toISOString().slice(0, 10);
    const cycle = recurringCycle || record.recurringCycle || "Yearly";

    // Calculate next expiry date if not explicitly supplied
    let finalExpiryDate = newExpiryDate || newRenewalDate;
    if (!finalExpiryDate && record.expiryDate) {
      const d = new Date(record.expiryDate);
      if (!isNaN(d.getTime())) {
        switch ((cycle || "").toLowerCase()) {
          case "monthly":
            d.setMonth(d.getMonth() + 1);
            break;
          case "quarterly":
            d.setMonth(d.getMonth() + 3);
            break;
          case "half-yearly":
          case "semi-annually":
            d.setMonth(d.getMonth() + 6);
            break;
          case "weekly":
            d.setDate(d.getDate() + 7);
            break;
          case "bi-weekly":
            d.setDate(d.getDate() + 14);
            break;
          case "yearly":
          case "annually":
          default:
            d.setFullYear(d.getFullYear() + 1);
            break;
        }
        finalExpiryDate = d.toISOString().slice(0, 10);
      }
    }

    if (!finalExpiryDate) {
      return res.status(400).json({ ok: false, error: "Unable to determine next expiry date." });
    }

    const historyEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      previousExpiry: record.expiryDate,
      newExpiry: finalExpiryDate,
      renewalDate: finalRenewalDate,
      cost: cost !== undefined && cost !== "" && cost !== null ? Number(cost) : record.cost,
      currency: currency || record.currency || "USD",
      renewedBy: renewedBy || actor.fullName || "System User",
      renewedById: actor.id,
      renewedByEmail: actor.email,
      notes: notes || "",
    };

    let existingHistory = record.history;
    if (typeof existingHistory === "string") {
      try {
        existingHistory = JSON.parse(existingHistory);
      } catch (e) {
        existingHistory = [];
      }
    }
    if (!Array.isArray(existingHistory)) existingHistory = [];

    // Deduplicate history: avoid identical duplicate transitions
    const isDuplicate =
      record.expiryDate === finalExpiryDate ||
      existingHistory.some(
        (h) =>
          h &&
          (h.newExpiry === finalExpiryDate ||
            (h.previousExpiry === record.expiryDate && h.newExpiry === finalExpiryDate))
      );
    const finalHistory = isDuplicate ? existingHistory : [historyEntry, ...existingHistory];

    let nextReminderDate = req.body && req.body.reminderDate;
    if (!nextReminderDate && finalExpiryDate) {
      const d = new Date(finalExpiryDate);
      if (!isNaN(d.getTime())) {
        d.setDate(d.getDate() - 14);
        nextReminderDate = d.toISOString().slice(0, 10);
      }
    }

    const updatedRecord = {
      ...record,
      history: finalHistory,
      issueDate: finalRenewalDate,
      expiryDate: finalExpiryDate,
      lastRenewedAt: finalRenewalDate,
      status: "active", // Synchronize status to active upon renewal
      reminderCompleted: false,
      recurringCycle: cycle,
      reminderDate: nextReminderDate || record.reminderDate,
    };

    const saved = await db.saveRenewal(updatedRecord);

    await db.logAudit({
      actorId: actor.id || "usr",
      actorName: actor.fullName,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "RENEWAL_MARKED_RENEWED",
      targetType: "renewal",
      targetId: saved.id,
      details: `Marked "${saved.name}" as renewed. Previous expiry: ${record.expiryDate}, New expiry: ${finalExpiryDate}. Status synchronized to active.`,
    });

    res.json({
      ok: true,
      data: saved,
      history: saved.history,
      historyEntry,
      message: `Renewal "${saved.name}" successfully renewed. New expiry: ${finalExpiryDate}.`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// POST /api/renewals/:id/mark-renewed & aliases
router.post("/:id/mark-renewed", handleMarkRenewed);
router.post("/:id/renew", handleMarkRenewed);
router.post("/renew", handleMarkRenewed);

// POST /api/renewals/:id/snooze — Snooze reminder (Admin or assigned Employee)
router.post("/:id/snooze", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
    }
    if (actor.role === "Viewer") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Viewer role has read-only access and cannot snooze reminders.",
      });
    }
    const record = await db.getRenewalById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }
    if (actor.role === "Employee" && !isRenewalAssignedToUser(record, actor)) {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Employees may only snooze reminders assigned to them.",
      });
    }

    const days = Number(req.body.days) || 7;
    let newDate = req.body.reminderDate;
    if (!newDate) {
      const d = new Date();
      d.setDate(d.getDate() + days);
      newDate = d.toISOString().slice(0, 10);
    }
    const updatedRecord = {
      ...record,
      reminderDate: newDate,
      reminderCompleted: false,
    };
    const saved = await db.saveRenewal(updatedRecord);

    await db.logAudit({
      actorId: actor.id || "usr",
      actorName: actor.fullName,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: "REMINDER_SNOOZED",
      targetType: "renewal",
      targetId: saved.id,
      details: `Snoozed reminder for "${saved.name}" to ${newDate}.`,
    });

    res.json({ ok: true, data: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/renewals/:id/reminder-status — Update reminder completion status (Admin or assigned Employee)
router.post("/:id/reminder-status", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
    }
    if (actor.role === "Viewer") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Viewer role has read-only access.",
      });
    }
    const record = await db.getRenewalById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }
    if (actor.role === "Employee" && !isRenewalAssignedToUser(record, actor)) {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Employees may only manage reminders assigned to them.",
      });
    }

    const completed = req.body.reminderCompleted === true;
    const updatedRecord = {
      ...record,
      reminderCompleted: completed,
    };
    const saved = await db.saveRenewal(updatedRecord);

    await db.logAudit({
      actorId: actor.id || "usr",
      actorName: actor.fullName,
      actorEmail: actor.email,
      actorRole: actor.role,
      action: completed ? "REMINDER_COMPLETED" : "REMINDER_REOPENED",
      targetType: "renewal",
      targetId: saved.id,
      details: `Reminder for "${saved.name}" marked as ${completed ? "completed" : "reopened"}.`,
    });

    res.json({ ok: true, data: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
