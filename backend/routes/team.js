/* ==========================================================================
   backend/routes/team.js — Team Management API Endpoints (Admin Only)
   Supports member listing, role changes, deactivation, and invitations.
   ========================================================================== */

const express = require("express");
const db = require("../db");
const { authenticateToken, requireRole } = require("./auth");

const router = express.Router();

// Enforce authentication & Admin role across all team management endpoints
router.use(authenticateToken);
router.use(requireRole("Admin"));

// GET /api/team/members — List all team members with renewal counts & status
router.get("/members", async (req, res) => {
  try {
    const members = await db.getUsers();
    // Remove password hashes from response
    const sanitized = members.map((m) => {
      const { password, passwordHash, ...rest } = m;
      return rest;
    });
    res.json({ ok: true, data: sanitized });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/team/members/:id/role — Change member role (Employee <-> Viewer)
router.put("/members/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ ok: false, error: "New role is required." });
    }

    const updated = await db.updateUserRole(req.params.id, role, req.user);
    const { password, passwordHash, ...safeUser } = updated;
    res.json({ ok: true, data: safeUser, message: `Role updated to ${role} successfully.` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// PUT /api/team/members/:id/status — Toggle member status (active / deactivated)
router.put("/members/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !["active", "deactivated"].includes(status)) {
      return res.status(400).json({ ok: false, error: "Valid status ('active' or 'deactivated') is required." });
    }

    const updated = await db.setUserStatus(req.params.id, status, req.user);
    const { password, passwordHash, ...safeUser } = updated;
    res.json({
      ok: true,
      data: safeUser,
      message: `Account ${status === "deactivated" ? "deactivated" : "activated"} successfully.`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// POST /api/team/invites — Invite a new member by email
router.post("/invites", async (req, res) => {
  try {
    const { email, fullName, role } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "A valid recipient work email is required." });
    }

    if (!role || !["Employee", "Viewer"].includes(role)) {
      return res.status(400).json({
        ok: false,
        error: "Invitations can only be sent for Employee or Viewer roles. Administrator privileges cannot be granted via invitation.",
      });
    }

    const invite = await db.createInvitation({ email, fullName, role }, req.user);
    res.status(201).json({
      ok: true,
      data: invite,
      invitation: invite,
      inviteUrl: invite.inviteUrl,
      emailSent: invite.emailSent,
      emailError: invite.emailError,
      message: invite.emailSent
        ? `Invitation email successfully dispatched to ${email}.`
        : `Invitation created, but email could not be delivered: ${invite.emailError || "Email provider credentials not configured in .env."}`,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// GET /api/team/invites — List pending/recent invitations
router.get("/invites", async (req, res) => {
  try {
    const invites = await db.getInvitations();
    res.json({ ok: true, data: invites, invitations: invites });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/team/invites/:id — Revoke a pending invitation
router.delete("/invites/:id", async (req, res) => {
  try {
    const revoked = await db.revokeInvitation(req.params.id, req.user);
    res.json({ ok: true, data: revoked, message: "Invitation revoked successfully." });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
