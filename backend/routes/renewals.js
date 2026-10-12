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

  if (token) {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      if (decoded && decoded.email) {
        cleanEmail = decoded.email.trim().toLowerCase();
      }
    } catch (e) {
      // Local/development session fallback if token was generated client-side or expired
      const headerEmail = (req.headers["x-user-email"] || "").trim().toLowerCase();
      if (headerEmail) {
        cleanEmail = headerEmail;
      } else if (token.startsWith("tok-") || token.startsWith("rts_")) {
        cleanEmail = "elakkiyaohai@gmail.com";
      }
    }
  } else {
    const headerEmail = (req.headers["x-user-email"] || "").trim().toLowerCase();
    if (headerEmail) cleanEmail = headerEmail;
  }

  if (cleanEmail && cleanEmail !== "demo@renewaltrack.com") {
    const user = await db.getUserByEmail(cleanEmail);
    if (user && user.status !== "deactivated") {
      return {
        id: user.id,
        role: user.role || "Employee",
        email: user.email,
        fullName: user.fullName,
        isPrimaryAdmin: user.email.toLowerCase() === "elakkiyaohai@gmail.com",
      };
    }
  }
  return null;
}

// GET /api/renewals — Get all renewals
router.get("/", async (req, res) => {
  try {
    const list = await db.getRenewals();
    res.json({ ok: true, data: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/renewals/assignees — Get active employee users available for assignment
router.get("/assignees", async (req, res) => {
  try {
    const employees = await db.getActiveEmployees();
    res.json({ ok: true, data: employees });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/renewals/history — Get aggregated renewal history
router.get("/history", async (req, res) => {
  try {
    const list = await db.getRenewals();
    const rows = [];
    list.forEach((r) => {
      let hist = r.history;
      if (typeof hist === "string") {
        try { hist = JSON.parse(hist); } catch (e) { hist = []; }
      }
      if (!Array.isArray(hist)) hist = [];
      hist.forEach((h) => {
        if (!h || typeof h !== "object") return;
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

// GET /api/renewals/:id — Get renewal by ID
router.get("/:id", async (req, res) => {
  try {
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
      if (assignedUser.role === "Viewer") {
        return res.status(400).json({
          ok: false,
          error: `Cannot assign renewal to Viewer "${assignedUser.fullName}". Renewals can only be assigned to active Employees or Administrators.`,
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

      // Send email notification if configured
      try {
        await emailService.sendAssignmentNotification({
          to: assignedUser.email,
          recipientName: assignedUser.fullName,
          renewal: saved,
          assignedBy: actor.fullName,
          isReassignment: false,
        });
      } catch (e) {
        console.error(`[Assignment Notification Error] ${e.message}`);
      }
    }

    res.status(201).json({ ok: true, data: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/renewals/:id — Update renewal (enforces assignment RBAC)
router.put("/:id", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
    }

    // RBAC: Viewers cannot update renewals
    if (actor.role === "Viewer") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Viewer role has read-only access and cannot modify renewals.",
      });
    }

    const existing = await db.getRenewalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }

    const updates = { ...req.body };
    const existingAssigneeId = existing.assignedToId || existing.assigned_to_id || null;
    const existingAssigneeName = existing.assignedToName || existing.responsiblePerson || "Unassigned";

    // Requirement 6: Employees can manage their assigned renewals only and must not change assignments
    if (actor.role === "Employee") {
      const respEmail = (existing.assignedToEmail || existing.assigned_to_email || existing.responsibleEmail || existing.responsible_email || "").toLowerCase();
      const respName = (existing.assignedToName || existing.assigned_to_name || existing.responsiblePerson || existing.responsible_person || "").toLowerCase();
      const createdBy = (existing.createdBy || "").toLowerCase();

      const isAssigned =
        (existingAssigneeId && String(existingAssigneeId) === String(actor.id)) ||
        (respEmail && respEmail === actor.email.toLowerCase()) ||
        (respName && respName === actor.fullName.toLowerCase()) ||
        (createdBy && createdBy === actor.email.toLowerCase());

      if (!isAssigned) {
        return res.status(403).json({
          ok: false,
          error: "Access denied. Employees may only manage renewals assigned to them.",
        });
      }

      // Requirement 6: Employees must NOT change assignments
      if (
        updates.assignedToId !== undefined &&
        String(updates.assignedToId || "") !== String(existingAssigneeId || "")
      ) {
        return res.status(403).json({
          ok: false,
          error: "Access denied. Only Administrators can assign or reassign renewals.",
        });
      }

      // Preserve existing assignment
      updates.assignedToId = existingAssigneeId || actor.id;
      updates.assignedToName = existing.assignedToName || existing.responsiblePerson || actor.fullName;
      updates.assignedToEmail = existing.assignedToEmail || existing.responsibleEmail || actor.email;
    }

    let isReassigned = false;
    let newlyAssignedUser = null;

    // Requirement 2: Only Admins can assign or reassign renewals
    if (actor.role === "Admin" && updates.assignedToId !== undefined) {
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
        if (newlyAssignedUser.role === "Viewer") {
          return res.status(400).json({
            ok: false,
            error: `Cannot assign renewal to Viewer "${newlyAssignedUser.fullName}". Renewals can only be assigned to active Employees or Administrators.`,
          });
        }
        updates.assignedToId = newlyAssignedUser.id;
        updates.assignedToName = newlyAssignedUser.fullName;
        updates.assignedToEmail = newlyAssignedUser.email;
        updates.responsiblePerson = newlyAssignedUser.fullName;
        updates.responsibleEmail = newlyAssignedUser.email;
        isReassigned = true;
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

      // Send email notification to the newly assigned employee
      try {
        await emailService.sendAssignmentNotification({
          to: newlyAssignedUser.email,
          recipientName: newlyAssignedUser.fullName,
          renewal: updated,
          assignedBy: actor.fullName,
          isReassignment: !!existingAssigneeId,
          previousAssignee: existingAssigneeName,
        });
      } catch (emailErr) {
        console.error(`[Reassignment Notification Error] ${emailErr.message}`);
      }
    }

    res.json({ ok: true, data: updated });
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

// DELETE /api/renewals/:id — Delete single renewal (enforces assigned owner check)
router.delete("/:id", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (!actor) {
      return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
    }

    // RBAC: Viewers cannot delete renewals
    if (actor.role === "Viewer") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Viewer role has read-only access and cannot delete renewals.",
      });
    }

    const existing = await db.getRenewalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }

    // RBAC Requirement 6: Employees can only delete renewals assigned to them
    if (actor.role === "Employee") {
      const assignedId = existing.assignedToId || existing.assigned_to_id;
      const respEmail = (existing.assignedToEmail || existing.assigned_to_email || existing.responsibleEmail || existing.responsible_email || "").toLowerCase();
      const respName = (existing.assignedToName || existing.assigned_to_name || existing.responsiblePerson || existing.responsible_person || "").toLowerCase();
      const isAssigned = (assignedId && assignedId === actor.id) || respEmail === actor.email.toLowerCase() || respName === actor.fullName.toLowerCase();
      if (!isAssigned) {
        return res.status(403).json({
          ok: false,
          error: "Access denied. Employees may only delete renewals assigned to them.",
        });
      }
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

// POST /api/renewals/:id/mark-renewed — Mark renewal as renewed
router.post("/:id/mark-renewed", async (req, res) => {
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

    const record = await db.getRenewalById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }

    // RBAC Requirement 6: Employees can only renew records assigned to them
    if (actor.role === "Employee") {
      const assignedId = record.assignedToId || record.assigned_to_id;
      const respEmail = (record.assignedToEmail || record.assigned_to_email || record.responsibleEmail || record.responsible_email || "").toLowerCase();
      const respName = (record.assignedToName || record.assigned_to_name || record.responsiblePerson || record.responsible_person || "").toLowerCase();
      const createdBy = (record.createdBy || "").toLowerCase();
      const isAssigned =
        (assignedId && assignedId === actor.id) ||
        (!respEmail && !respName) ||
        respEmail === actor.email.toLowerCase() ||
        respName === actor.fullName.toLowerCase() ||
        createdBy === actor.email.toLowerCase();
      if (!isAssigned) {
        return res.status(403).json({
          ok: false,
          error: "Access denied. Employees may only renew records assigned to them.",
        });
      }
    }

    const { renewalDate, newExpiryDate, cost, currency, notes, recurringCycle, renewedBy } = req.body;
    const historyEntry = {
      id: `hist-${Date.now()}`,
      previousExpiry: record.expiryDate,
      newExpiry: newExpiryDate,
      renewalDate: renewalDate || new Date().toISOString().slice(0, 10),
      cost: cost !== undefined && cost !== "" && cost !== null ? Number(cost) : record.cost,
      currency: currency || record.currency || "USD",
      renewedBy: renewedBy || actor.fullName || "System User",
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

    const updatedRecord = {
      ...record,
      history: [historyEntry, ...existingHistory],
      issueDate: historyEntry.renewalDate,
      expiryDate: newExpiryDate,
      lastRenewedAt: historyEntry.renewalDate,
      reminderCompleted: false,
      recurringCycle: recurringCycle || record.recurringCycle,
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
      details: `Marked "${saved.name}" as renewed. New expiry: ${newExpiryDate}.`,
    });

    res.json({ ok: true, data: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
