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
    const limit = parseInt(req.query.limit, 10) || 200;
    const action = req.query.action || "ALL";
    const search = req.query.search || "";

    const logs = await db.getAuditLogs({ limit, action, search });
    const normalized = (logs || []).map((l) => ({
      ...l,
      actor_name: l.actorName || l.actor_name || "System",
      actor_email: l.actorEmail || l.actor_email || "system@renewaltrack.com",
      actor_role: l.actorRole || l.actor_role || "User",
      target_type: l.targetType || l.target_type || "system",
      target_id: l.targetId || l.target_id || "",
      created_at: l.createdAt || l.created_at || new Date().toISOString(),
      actorName: l.actorName || l.actor_name || "System",
      actorEmail: l.actorEmail || l.actor_email || "system@renewaltrack.com",
      actorRole: l.actorRole || l.actor_role || "User",
      targetType: l.targetType || l.target_type || "system",
      targetId: l.targetId || l.target_id || "",
      createdAt: l.createdAt || l.created_at || new Date().toISOString(),
    }));
    res.json({ ok: true, data: normalized, logs: normalized });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
