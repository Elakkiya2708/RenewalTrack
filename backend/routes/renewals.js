/* ==========================================================================
   backend/routes/renewals.js — Renewal Records API Endpoints
   ========================================================================== */

const express = require("express");
const db = require("../db");

const router = express.Router();

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
    const data = req.body;
    if (!data.name || !data.expiryDate || !data.category) {
      return res.status(400).json({
        ok: false,
        error: "Name, category, and expiryDate are required.",
      });
    }

    const saved = await db.saveRenewal(data);
    res.status(201).json({ ok: true, data: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/renewals/:id — Update renewal
router.put("/:id", async (req, res) => {
  try {
    const existing = await db.getRenewalById(req.params.id);
    if (!existing) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }

    const updated = await db.saveRenewal({ ...existing, ...req.body, id: req.params.id });
    res.json({ ok: true, data: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/renewals — Clear all renewals (clean slate)
router.delete("/", async (req, res) => {
  try {
    await db.clearAllRenewals();
    res.json({ ok: true, message: "All renewals cleared successfully." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/renewals/:id — Delete single renewal
router.delete("/:id", async (req, res) => {
  try {
    await db.deleteRenewal(req.params.id);
    res.json({ ok: true, message: "Renewal record deleted successfully." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/renewals/:id/mark-renewed — Mark as renewed
router.post("/:id/mark-renewed", async (req, res) => {
  try {
    const record = await db.getRenewalById(req.params.id);
    if (!record) {
      return res.status(404).json({ ok: false, error: "Renewal record not found." });
    }

    const { renewalDate, newExpiryDate, cost, currency, notes, recurringCycle } = req.body;
    const historyEntry = {
      id: `hist-${Date.now()}`,
      previousExpiry: record.expiryDate,
      newExpiry: newExpiryDate,
      renewalDate: renewalDate || new Date().toISOString().slice(0, 10),
      cost: cost !== undefined ? Number(cost) : record.cost,
      currency: currency || record.currency,
      renewedBy: "System User",
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
    res.json({ ok: true, data: saved });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
