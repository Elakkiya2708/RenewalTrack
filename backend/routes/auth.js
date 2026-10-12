/* ==========================================================================
   backend/routes/auth.js — Authentication Endpoints (JWT & Sessions)
   ========================================================================== */

const express = require("express");
const jwt = require("jsonwebtoken");
const config = require("../config");

const router = express.Router();

// Mock / Default seeded accounts
let accounts = [
  {
    id: "usr-demo",
    fullName: "Anita Sharma",
    email: "demo@renewaltrack.com",
    mobile: "+1 555 0102",
    password: "Demo@1234",
    role: "Admin",
  },
  {
    id: "usr-david",
    fullName: "David Kim",
    email: "david.kim@renewaltrack.com",
    mobile: "+1 555 0103",
    password: "Demo@1234",
    role: "Editor",
  },
];

// Helper: Generate JWT token
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role || "Admin",
    },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

// POST /api/auth/login
router.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Email and password are required." });
  }

  const account = accounts.find(
    (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password
  );

  if (!account) {
    return res.status(401).json({ ok: false, error: "Invalid email or password." });
  }

  const token = generateToken(account);
  res.json({
    ok: true,
    token,
    user: {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      mobile: account.mobile,
      role: account.role,
    },
  });
});

// POST /api/auth/register
router.post("/register", (req, res) => {
  const { fullName, email, mobile, password } = req.body;
  if (!fullName || !email || !password) {
    return res.status(400).json({ ok: false, error: "Full name, email, and password are required." });
  }

  const existing = accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) {
    return res.status(409).json({ ok: false, error: "An account with this email already exists." });
  }

  const newAccount = {
    id: `usr-${Date.now()}`,
    fullName: fullName.trim(),
    email: email.trim(),
    mobile: mobile || "",
    password,
    role: "Editor",
  };
  accounts.push(newAccount);

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
    },
  });
});

// GET /api/auth/me
router.get("/me", (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Authorization token required." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    res.json({ ok: true, user: decoded });
  } catch (err) {
    res.status(401).json({ ok: false, error: "Invalid or expired token." });
  }
});

// POST /api/auth/change-password
router.post("/change-password", (req, res) => {
  const { email, currentPassword, newPassword } = req.body;
  const user = accounts.find((a) => a.email.toLowerCase() === (email || "").toLowerCase());
  if (!user) {
    return res.status(404).json({ ok: false, error: "Account not found." });
  }
  if (user.password !== currentPassword) {
    return res.status(400).json({ ok: false, error: "Current password is incorrect." });
  }
  user.password = newPassword;
  res.json({ ok: true, message: "Password updated successfully." });
});

module.exports = router;
