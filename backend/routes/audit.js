/* ==========================================================================
   backend/routes/audit.js — Audit Logs API Endpoints (Admin Only)
   Provides queryable activity logs for renewals, roles, team changes, and auth.
   ========================================================================== */

const express = require("express");
const db = require("../db");
const { authenticateToken, requireRole } = require("./auth");

const router = express.Router();

// Enforce authentication & Admin role
router.use(authenticateToken);
router.use(requireRole("Admin"));

// GET /api/audit/logs — Query activity audit logs
router.get("/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const action = req.query.action || "ALL";
    const search = req.query.search || "";

    const logs = await db.getAuditLogs({ limit, action, search });
    res.json({ ok: true, data: logs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
