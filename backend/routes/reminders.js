/* ==========================================================================
   backend/routes/reminders.js — Reminder Execution & Audit Log Endpoints
   ========================================================================== */

const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");
const emailService = require("../emailService");
const reminderScheduler = require("../reminderScheduler");
const config = require("../config");

const router = express.Router();

async function getReqUser(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const decoded = jwt.verify(authHeader.split(" ")[1], config.JWT_SECRET);
      if (decoded && decoded.email) {
        const user = await db.getUserByEmail(decoded.email.trim().toLowerCase());
        if (user && user.status !== "deactivated") {
          return user;
        }
      }
    } catch (e) {}
  }
  return null;
}

// GET /api/reminders/logs — Retrieve sent reminder audit history
router.get("/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50", 10);
    const logs = await db.getReminderLogs(limit);
    res.json({
      ok: true,
      data: logs,
      count: logs.length,
      storageMode: db.isLiveSupabase() ? "supabase_postgresql" : "local_storage",
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/reminders/trigger — Manually trigger the scheduled reminder check
router.post("/trigger", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (actor && actor.role === "Viewer") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Viewer role has read-only access and cannot trigger reminders.",
      });
    }

    console.log("[API] Manual trigger request received for reminder check.");
    const force = req.body && req.body.force === true;
    const summary = await reminderScheduler.checkAndSendReminders({ force });
    res.json({
      ok: true,
      message: "Reminder check completed successfully.",
      summary,
    });
  } catch (err) {
    console.error(`[API Error] Failed to run reminder check: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/reminders/test-email — Send a test reminder email to verify email delivery
router.post("/test-email", async (req, res) => {
  try {
    const actor = await getReqUser(req);
    if (actor && actor.role === "Viewer") {
      return res.status(403).json({
        ok: false,
        error: "Access denied. Viewer role has read-only access and cannot send test emails.",
      });
    }

    const { targetEmail } = req.body;
    if (!targetEmail) {
      return res.status(400).json({ ok: false, error: "targetEmail is required." });
    }

    console.log(`[API] Sending test reminder email to: ${targetEmail}`);
    const result = await emailService.sendTestEmail(targetEmail);

    if (result.success) {
      res.json({
        ok: true,
        message: result.simulated
          ? `Test email simulated successfully for ${targetEmail}. (Check server console)`
          : `Test email successfully sent to ${targetEmail} via ${result.provider}!`,
        details: result,
      });
    } else {
      res.status(400).json({
        ok: false,
        error: result.error,
        details: result,
      });
    }
  } catch (err) {
    console.error(`[API Error] Error sending test email: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reminders/status — Get scheduler and email provider status
router.get("/status", async (req, res) => {
  try {
    const status = reminderScheduler.getStatus();
    const settings = await db.getNotificationSettings();

    res.json({
      ok: true,
      scheduler: status,
      settings,
      database: {
        isSupabase: db.isLiveSupabase(),
        type: db.isLiveSupabase() ? "Supabase PostgreSQL" : "Local Safe Store",
      },
      emailConfig: {
        provider: config.EMAIL_PROVIDER,
        isSendEnabled: config.EMAIL_SEND_ENABLED,
        fromEmail: config.FROM_EMAIL,
        fromName: config.FROM_NAME,
        smtpHost: config.SMTP_HOST ? `${config.SMTP_HOST}:${config.SMTP_PORT}` : "Not configured",
        hasResendKey: !!config.RESEND_API_KEY,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
