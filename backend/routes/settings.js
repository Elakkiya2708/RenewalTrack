/* ==========================================================================
   backend/routes/settings.js — Notification Settings Endpoints
   ========================================================================== */

const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/settings/notifications — Get current notification settings
router.get("/notifications", async (req, res) => {
  try {
    const settings = await db.getNotificationSettings();
    res.json({ ok: true, data: settings });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/settings/notifications — Update notification settings
router.put("/notifications", async (req, res) => {
  try {
    const {
      emailNotificationsEnabled,
      reminderDays,
      cronSchedule,
      defaultRecipientEmail,
      sendOnExpiryDay,
      emailProvider,
    } = req.body;

    const updates = {};
    if (emailNotificationsEnabled !== undefined) {
      updates.emailNotificationsEnabled = Boolean(emailNotificationsEnabled);
    }
    if (Array.isArray(reminderDays)) {
      updates.reminderDays = reminderDays;
    }
    if (cronSchedule) {
      updates.cronSchedule = cronSchedule;
    }
    if (defaultRecipientEmail) {
      updates.defaultRecipientEmail = defaultRecipientEmail.trim();
    }
    if (sendOnExpiryDay !== undefined) {
      updates.sendOnExpiryDay = Boolean(sendOnExpiryDay);
    }
    if (emailProvider) {
      updates.emailProvider = emailProvider;
    }

    const updated = await db.updateNotificationSettings(updates);
    res.json({ ok: true, message: "Notification settings updated successfully.", data: updated });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/settings/admin-info — Securely fetch active system administrator information
router.get("/admin-info", async (req, res) => {
  try {
    const users = await db.getUsers();
    const admin =
      users.find((u) => u.role === "Admin" && (u.status === "active" || !u.status)) ||
      users.find((u) => u.email && u.email.toLowerCase() === "elakkiya270806@gmail.com") || {
        id: "usr-1791890845906",
        fullName: "Elakkiya",
        email: "elakkiya270806@gmail.com",
        role: "Admin",
        status: "active",
        mobile: "+91 98765 43210",
      };

    res.json({
      ok: true,
      data: {
        id: admin.id || "usr-1791890845906",
        fullName: admin.fullName || "Elakkiya",
        email: admin.email || "elakkiya270806@gmail.com",
        role: admin.role || "Admin",
        status: admin.status || "active",
        mobile: admin.mobile || "+91 98765 43210",
        isPrimaryAdmin: true,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
