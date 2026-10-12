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

module.exports = router;
