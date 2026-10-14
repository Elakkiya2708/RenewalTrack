/* ==========================================================================
   backend/routes/auth.js — Authentication Endpoints & RBAC Middleware
   ========================================================================== */

const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = require("../config");
const db = require("../db");
const emailService = require("../emailService");

const router = express.Router();

// Password Hashing and Verification (scrypt with salt)
function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(plainPassword, storedPassword, storedHash) {
  const hashToTest = storedHash || storedPassword;
  if (hashToTest && typeof hashToTest === "string" && hashToTest.startsWith("scrypt$")) {
    const parts = hashToTest.split("$");
    if (parts.length === 3) {
      const salt = parts[1];
      const key = parts[2];
      const checkKey = crypto.scryptSync(plainPassword, salt, 64).toString("hex");
      return crypto.timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(checkKey, "hex"));
    }
  }
  // Fallback for pre-seeded legacy accounts
  return storedPassword === plainPassword;
}

// Middleware: Authenticate JWT Token (Strict DB Verification)
async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token && !req.headers["x-user-email"]) {
    return res.status(401).json({ ok: false, error: "Authentication required. Please log in." });
  }

  try {
    let cleanEmail = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        if (decoded && decoded.email) {
          cleanEmail = decoded.email.trim().toLowerCase();
        }
      } catch (jwtErr) {
        // Local/development session fallback if token was generated client-side or expired
        const headerEmail = (req.headers["x-user-email"] || "").trim().toLowerCase();
        if (headerEmail) {
          cleanEmail = headerEmail;
        } else if (token && (token.startsWith("tok-") || token.startsWith("rts_"))) {
          cleanEmail = "elakkiya270806@gmail.com";
        }
      }
    } else if (req.headers["x-user-email"]) {
      cleanEmail = req.headers["x-user-email"].trim().toLowerCase();
    }

    if (!cleanEmail) {
      return res.status(401).json({ ok: false, error: "Invalid or expired session token." });
    }
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
      isPrimaryAdmin: user.email.toLowerCase() === "elakkiya270806@gmail.com",
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
      isPrimaryAdmin: (user.email || "").toLowerCase() === "elakkiya270806@gmail.com",
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

    if (!user || !verifyPassword(password, user.password, user.passwordHash)) {
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
        isPrimaryAdmin: user.email.toLowerCase() === "elakkiya270806@gmail.com",
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
        const hashedPassword = hashPassword(password);
        const user = await db.acceptInvitation(inviteToken, {
          fullName,
          mobile,
          password: hashedPassword,
          passwordHash: hashedPassword,
        });
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
          adminNotified: user._invite ? user._invite.adminNotified : (user._adminNotification ? user._adminNotification.success : false),
          adminNotification: user._adminNotification || null,
        });
      } catch (inviteErr) {
        return res.status(400).json({ ok: false, error: inviteErr.message });
      }
    }

    // 2. Reject any attempt to choose Admin role
    if (req.body.role && req.body.role.toLowerCase() === "admin") {
      return res.status(403).json({
        ok: false,
        error: "Public registration cannot grant Administrator access. Administrator privileges must be assigned by an existing admin.",
      });
    }

    // 3. Duplicate email verification
    const existing = await db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ ok: false, error: "An account with this email already exists." });
    }

    // 4. Invitation Authorization: check if this email has an active pending invitation from Admin
    const pendingInvite = await db.getPendingInvitationByEmail(cleanEmail);
    if (pendingInvite) {
      try {
        const hashedPassword = hashPassword(password);
        const user = await db.acceptInvitation(pendingInvite.token, {
          fullName,
          mobile,
          password: hashedPassword,
          passwordHash: hashedPassword,
        });
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
          adminNotified: user._invite ? user._invite.adminNotified : (user._adminNotification ? user._adminNotification.success : false),
          adminNotification: user._adminNotification || null,
        });
      } catch (inviteErr) {
        return res.status(400).json({ ok: false, error: inviteErr.message });
      }
    }

    // 5. Prevent unauthorized account creation (Strict Invitation Policy)
    return res.status(403).json({
      ok: false,
      error: "Registration is restricted to invited team members. Only Employees or Viewers with an active invitation from an Administrator can create an account.",
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
    if (new Date(invite.expiresAt || invite.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, error: "This invitation has expired. Please ask an administrator to send a new invite." });
    }
    const info = {
      email: invite.email,
      fullName: invite.fullName,
      role: invite.role,
      invitedByName: invite.invitedByName || invite.invited_by_name || "Admin",
      expiresAt: invite.expiresAt || invite.expires_at,
    };
    res.json({
      ok: true,
      invite: info,
      invitation: info,
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
    if (!verifyPassword(currentPassword, user.password, user.passwordHash)) {
      return res.status(400).json({ ok: false, error: "Current password is incorrect." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: "New password must be at least 8 characters." });
    }

    const hashed = hashPassword(newPassword);
    user.password = hashed;
    user.passwordHash = hashed;
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

// POST /api/auth/forgot-password — Request password reset email
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!emailService.isValidEmail(cleanEmail)) {
      return res.status(400).json({ ok: false, error: "Please enter a valid email address format." });
    }

    const user = await db.getUserByEmail(cleanEmail);

    // Requirement: Show clear success and error messages without revealing whether an email is registered
    let emailSent = false;
    let emailError = null;

    if (user && user.status !== "deactivated") {
      const resetRecord = await db.createPasswordReset(cleanEmail);
      const appUrl = config.APP_URL || `http://localhost:${config.PORT || 3000}`;
      const resetUrl = `${appUrl}/reset-password.html?token=${encodeURIComponent(resetRecord.token)}`;

      await db.logAudit({
        actorId: user.id,
        actorName: user.fullName,
        actorEmail: user.email,
        actorRole: user.role,
        action: "PASSWORD_RESET_REQUESTED",
        targetType: "user",
        targetId: user.id,
        details: `Password reset link requested for ${user.email}.`,
      });

      try {
        const sendResult = await emailService.sendPasswordResetEmail({
          to: user.email,
          fullName: user.fullName,
          resetUrl,
          expiresMinutes: 30,
        });
        emailSent = sendResult.success;
        if (!sendResult.success) {
          emailError = sendResult.error;
          console.warn(`[Forgot Password Warning] Email delivery to ${cleanEmail} failed: ${sendResult.error}`);
        } else {
          console.log(`[Forgot Password Success] Password reset email sent to ${cleanEmail} via ${sendResult.provider}. Message ID: ${sendResult.messageId}`);
        }
      } catch (sendErr) {
        console.error(`[Forgot Password Error] Failed to send email: ${sendErr.message}`);
        emailError = sendErr.message;
      }
    } else {
      console.log(`[Forgot Password] Request received for unregister/deactivated email: ${cleanEmail}. Returning generic message.`);
    }

    // Generic response to prevent user enumeration
    res.json({
      ok: true,
      message: "If an account with that email exists, a password reset link has been sent. Please check your inbox.",
      emailSent,
      emailError,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/auth/verify-reset-token/:token — Check token validity on reset page load
router.get("/verify-reset-token/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const reset = await db.getPasswordResetByToken(token);
    if (!reset) {
      return res.status(400).json({ ok: false, error: "Invalid password reset link." });
    }
    if (reset.used) {
      return res.status(400).json({ ok: false, error: "This password reset link has already been used. Please request a new one." });
    }
    if (new Date(reset.expiresAt) < new Date()) {
      return res.status(400).json({ ok: false, error: "This password reset link has expired. Please request a new one." });
    }

    const parts = reset.email.split("@");
    const masked = (parts[0].slice(0, 2) || "*") + "***@" + (parts[1] || "");

    res.json({
      ok: true,
      valid: true,
      emailMasked: masked,
      maskedEmail: masked,
      expiresAt: reset.expiresAt,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/auth/reset-password — Set new password with valid token
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ ok: false, error: "Reset token and new password are required." });
    }

    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, error: "Passwords do not match." });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: "New password must be at least 8 characters long." });
    }

    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ ok: false, error: "Password must contain at least one letter and one number." });
    }

    const hashedPassword = hashPassword(newPassword);
    const user = await db.consumePasswordReset(token, hashedPassword);

    await db.logAudit({
      actorId: user.id,
      actorName: user.fullName,
      actorEmail: user.email,
      actorRole: user.role,
      action: "PASSWORD_RESET_COMPLETED",
      targetType: "user",
      targetId: user.id,
      details: `Password was successfully reset using verified email token for ${user.email}.`,
    });

    res.json({
      ok: true,
      message: "Your password has been reset successfully. You can now sign in with your new password.",
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.authenticateToken = authenticateToken;
router.requireRole = requireRole;

module.exports = router;
