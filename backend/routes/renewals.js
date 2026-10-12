/* ==========================================================================
   backend/routes/renewals.js — Renewal Records API Endpoints (with RBAC)
   ========================================================================== */

const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../db");

const router = express.Router();

// Helper to extract authenticated user from token (strictly verified against database)
async function getReqUser(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], config.JWT_SECRET);
      if (decoded && decoded.email) {
        const cleanEmail = decoded.email.trim().toLowerCase();
        if (cleanEmail === "demo@renewaltrack.com") return null;
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
    } catch (e) {}
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

    const data = req.body;
    if (!data.name || !data.expiryDate || !data.category) {
      return res.status(400).json({
        ok: false,
        error: "Name, category, and expiryDate are required.",
      });
    }

    // Auto-assign to Employee creator if not specified
    if (actor.role === "Employee" && !data.responsibleEmail && !data.responsiblePerson) {
      data.responsibleEmail = actor.email;
      data.responsiblePerson = actor.fullName;
    }
    data.createdBy = actor.email;

    const saved = await db.saveRenewal(data);

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

    res.status(201).json({ ok: true, data: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/renewals/:id — Update renewal
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

    // RBAC: Employees can only manage their assigned renewals
    if (actor.role === "Employee") {
      const respEmail = (existing.responsibleEmail || existing.responsible_email || "").toLowerCase();
      const respName = (existing.responsiblePerson || existing.responsible_person || "").toLowerCase();
      const createdBy = (existing.createdBy || "").toLowerCase();
      const isAssigned =
        respEmail === actor.email.toLowerCase() ||
        respName === actor.fullName.toLowerCase() ||
        createdBy === actor.email.toLowerCase();

      if (!isAssigned) {
        return res.status(403).json({
          ok: false,
          error: "Access denied. Employees may only modify renewals assigned to them.",
        });
      }
    }

    const updated = await db.saveRenewal({ ...existing, ...req.body, id: req.params.id });

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

// DELETE /api/renewals/:id — Delete single renewal
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

    // RBAC: Employees can only delete their assigned renewals
    if (actor.role === "Employee") {
      const respEmail = (existing.responsibleEmail || existing.responsible_email || "").toLowerCase();
      const respName = (existing.responsiblePerson || existing.responsible_person || "").toLowerCase();
      const isAssigned = respEmail === actor.email.toLowerCase() || respName === actor.fullName.toLowerCase();
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

// POST /api/renewals/:id/mark-renewed — Mark as renewed
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

    if (actor.role === "Employee") {
      const respEmail = (record.responsibleEmail || record.responsible_email || "").toLowerCase();
      const respName = (record.responsiblePerson || record.responsible_person || "").toLowerCase();
      const isAssigned = respEmail === actor.email.toLowerCase() || respName === actor.fullName.toLowerCase();
      if (!isAssigned) {
        return res.status(403).json({
          ok: false,
          error: "Access denied. Employees may only renew records assigned to them.",
        });
      }
    }

    const { renewalDate, newExpiryDate, cost, currency, notes, recurringCycle } = req.body;
    const historyEntry = {
      id: `hist-${Date.now()}`,
      previousExpiry: record.expiryDate,
      newExpiry: newExpiryDate,
      renewalDate: renewalDate || new Date().toISOString().slice(0, 10),
      cost: cost !== undefined ? Number(cost) : record.cost,
      currency: currency || record.currency,
      renewedBy: actor.fullName || "System User",
      notes: notes || "",
    };

    const updatedRecord = {
      ...record,
      history: [historyEntry, ...(record.history || [])],
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
