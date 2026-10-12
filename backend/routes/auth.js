/* ==========================================================================
   backend/routes/auth.js — Authentication Endpoints & RBAC Middleware
   ========================================================================== */

const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../db");

const router = express.Router();

// Middleware: Authenticate JWT Token (Strict DB Verification)
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (!decoded || !decoded.email) {
      return res.status(401).json({ ok: false, error: "Invalid token payload." });
    }

    const cleanEmail = decoded.email.trim().toLowerCase();
    if (cleanEmail === "demo@renewaltrack.com") {
      return res.status(403).json({
        ok: false,
        error: "The demo account (Anita Sharma) has been permanently removed.",
      });
    }

    // Always fetch latest authoritative user record from trusted DB (never trust client/token claims blindly)
    const user = await db.getUserByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ ok: false, error: "User account no longer exists." });
    }

    if (user.status === "deactivated") {
      return res.status(403).json({
        ok: false,
        error: "Your account has been deactivated. Please contact an administrator.",
      });
    }

    // Attach trusted user object from DB
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role || "Employee",
      status: user.status || "active",
      isPrimaryAdmin: user.email.toLowerCase() === "elakkiyaohai@gmail.com",
    };
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid or expired session token." });
  }
}

// Middleware: Require specific Role(s)
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ ok: false, error: "Access denied. Role not identified." });
    }
    const role = req.user.role;
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        ok: false,
        error: `Access denied. ${role} does not have permission for this action. Required: ${allowedRoles.join(" or ")}.`,
      });
    }
    next();
  };
}

// Helper: Generate JWT token
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role || "Employee",
      isPrimaryAdmin: (user.email || "").toLowerCase() === "elakkiyaohai@gmail.com",
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Reject unwanted demo account completely
    if (cleanEmail === "demo@renewaltrack.com") {
      return res.status(403).json({
        ok: false,
        error: "The demo account (Anita Sharma) has been permanently removed. Please log in with your registered account.",
      });
    }

    const user = await db.getUserByEmail(cleanEmail);

    if (!user || user.password !== password) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }

    // Check account deactivation
    if (user.status === "deactivated") {
      await db.logAudit({
        actorId: user.id,
        actorName: user.fullName,
        actorEmail: user.email,
        actorRole: user.role,
        action: "LOGIN_REJECTED_DEACTIVATED",
        targetType: "user",
        targetId: user.id,
        details: `Login attempt rejected: account is deactivated.`,
      });
      return res.status(403).json({
        ok: false,
        error: "Your account has been deactivated. Please contact an administrator.",
      });
    }

    // Log successful login audit
    await db.logAudit({
      actorId: user.id,
      actorName: user.fullName,
      actorEmail: user.email,
      actorRole: user.role,
      action: "USER_LOGIN",
      targetType: "auth",
      targetId: user.id,
      details: `User logged in successfully as ${user.role}.`,
    });

    const token = generateToken(user);
    res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile || "",
        role: user.role,
        status: user.status || "active",
        isPrimaryAdmin: user.email.toLowerCase() === "elakkiyaohai@gmail.com",
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { fullName, email, mobile, password, inviteToken } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ ok: false, error: "Full name, email, and password are required." });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail === "demo@renewaltrack.com") {
      return res.status(400).json({ ok: false, error: "Registration with the demo email address is not permitted." });
    }

    // 1. If invited with a token, process invitation acceptance
    if (inviteToken) {
      try {
        const user = await db.acceptInvitation(inviteToken, { fullName, mobile, password });
        const token = generateToken(user);
        return res.status(201).json({
          ok: true,
          token,
          user: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
            mobile: user.mobile || "",
            role: user.role,
            status: user.status,
          },
        });
      } catch (inviteErr) {
        return res.status(400).json({ ok: false, error: inviteErr.message });
      }
    }

    // 2. Public registration (without token)
    const existing = await db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists." });
    }

    // PUBLIC REGISTRATION MUST NEVER ALLOW USERS TO CHOOSE ADMIN
    // Default public registration to 'Employee'
    const newAccount = {
      id: `usr-${Date.now()}`,
      fullName: fullName.trim(),
      email: cleanEmail,
      mobile: mobile || "",
      password,
      role: "Employee",
      status: "active",
      createdAt: new Date().toISOString(),
    };

    await db.saveUser(newAccount);

    await db.logAudit({
      actorId: newAccount.id,
      actorName: newAccount.fullName,
      actorEmail: newAccount.email,
      actorRole: newAccount.role,
      action: "USER_REGISTERED",
      targetType: "user",
      targetId: newAccount.id,
      details: `New user registered via public registration (role assigned: ${newAccount.role}).`,
    });

    const token = generateToken(newAccount);
    res.status(201).json({
      ok: true,
      token,
      user: {
        id: newAccount.id,
        fullName: newAccount.fullName,
        email: newAccount.email,
        mobile: newAccount.mobile,
        role: newAccount.role,
        status: newAccount.status,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/auth/me
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserByEmail(req.user.email);
    if (!user) {
      return res.json({ ok: true, user: req.user });
    }
    res.json({
      ok: true,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile || "",
        role: user.role,
        status: user.status || "active",
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/auth/users — Directory of team members for dropdown assignment
router.get("/users", async (req, res) => {
  try {
    const list = await db.getUsers();
    const sanitized = list.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      status: u.status || "active",
    }));
    res.json({ ok: true, data: sanitized });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/auth/invite-info/:token — Validate invite token for registration page
router.get("/invite-info/:token", async (req, res) => {
  try {
    const invite = await db.getInvitationByToken(req.params.token);
    if (!invite) {
      return res.status(404).json({ ok: false, error: "Invitation not found or invalid." });
    }
    if (invite.status !== "pending") {
      return res.status(400).json({ ok: false, error: `This invitation has already been ${invite.status}.` });
    }
    res.json({
      ok: true,
      invite: {
        email: invite.email,
        fullName: invite.fullName,
        role: invite.role,
        invitedByName: invite.invitedByName,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/auth/change-password
router.post("/change-password", async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: "Email, current password, and new password are required." });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ ok: false, error: "Account not found." });
    }
    if (user.password !== currentPassword) {
      return res.status(400).json({ ok: false, error: "Current password is incorrect." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: "New password must be at least 8 characters." });
    }

    user.password = newPassword;
    await db.saveUser(user);

    await db.logAudit({
      actorId: user.id,
      actorName: user.fullName,
      actorEmail: user.email,
      actorRole: user.role,
      action: "PASSWORD_CHANGED",
      targetType: "user",
      targetId: user.id,
      details: `Password changed successfully for ${user.email}.`,
    });

    res.json({ ok: true, message: "Password updated successfully." });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.authenticateToken = authenticateToken;
router.requireRole = requireRole;

module.exports = router;
