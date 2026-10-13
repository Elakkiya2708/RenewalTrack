/* ==========================================================================
   backend/routes/webhooks.js — Resend & Email Delivery Webhook Handler
   Processes delivery failure, bounce, and complaint webhooks asynchronously,
   alerts elakkiya270806@gmail.com, and logs to Admin Audit Logs.
   ========================================================================== */

const express = require("express");
const db = require("../db");
const emailService = require("../emailService");
const config = require("../config");

const router = express.Router();

// GET /api/webhooks/status — Health check & status for delivery webhooks
router.get("/status", (req, res) => {
  res.json({
    ok: true,
    service: "RenewalTrack Email Webhook Listener",
    supportedEvents: [
      "email.bounced",
      "email.failed",
      "email.complained",
      "email.delivery_delayed",
      "email.delivered",
      "email.sent",
    ],
    alertTarget: config.ALERT_FALLBACK_EMAIL || "elakkiya270806@gmail.com",
    activeProvider: config.EMAIL_PROVIDER,
  });
});

// Common handler for webhook payloads
async function handleWebhookEvent(req, res) {
  try {
    const payload = req.body;
    if (!payload) {
      return res.status(400).json({ ok: false, error: "Empty webhook payload" });
    }

    const events = Array.isArray(payload) ? payload : [payload];
    const results = [];

    for (const event of events) {
      const type = event.type || event.event || "unknown";
      const data = event.data || event;
      const emailId = (data && (data.email_id || data.id)) || "N/A";
      const to = data && (Array.isArray(data.to) ? data.to[0] : data.to);
      const subject = (data && data.subject) || "";
      const createdAt = event.created_at || new Date().toISOString();

      console.log(`[Email Webhook] Received event: "${type}" | ID: "${emailId}" | Recipient: "${to}" | Subject: "${subject}"`);

      // Handle delivery failures, bounces, complaints, and delivery delays
      if (["email.bounced", "email.failed", "email.complained", "email.delivery_delayed"].includes(type)) {
        let reason = "Delivery failure reported by provider webhook";
        if (type === "email.bounced") {
          const bounce = data.bounce || {};
          reason = `Bounced (${bounce.type || "Permanent"}): ${bounce.message || "Recipient mail server rejected message"}`;
        } else if (type === "email.failed") {
          const err = data.error || {};
          reason = `Delivery Failed: ${err.message || (typeof err === "string" ? err : "Provider failed to transmit message")}`;
        } else if (type === "email.complained") {
          reason = "Spam Complaint: Recipient marked email as spam";
        } else if (type === "email.delivery_delayed") {
          reason = "Delivery Delayed: Temporary delay reported by receiving mail server";
        }

        // Sanitize error reason
        const cleanReason = emailService.sanitizeSecrets ? emailService.sanitizeSecrets(reason) : reason;

        // Resolve employee details from database if available
        let employeeDetails = {
          name: to ? to.split("@")[0] : "Employee",
          email: to || "unknown@domain.com",
          role: "Employee",
          id: null,
        };

        if (to) {
          try {
            const user = await db.getUserByEmail(to);
            if (user) {
              employeeDetails = {
                name: user.fullName || employeeDetails.name,
                email: user.email,
                role: user.role || "Employee",
                id: user.id,
              };
            }
          } catch (e) {
            console.warn(`[Webhook User Lookup] ${e.message}`);
          }
        }

        // Extract renewal name from subject if applicable
        let renewalName = "Renewal Record";
        if (subject) {
          if (subject.includes(":")) {
            renewalName = subject.split(":").slice(1).join(":").trim();
          } else {
            renewalName = subject;
          }
        }

        // Notify Admin and log into Admin Audit Logs
        const alertRes = await emailService.notifyDeliveryFailure({
          recipientEmail: to,
          recipientName: employeeDetails.name,
          employeeDetails,
          renewalName,
          failureTime: createdAt,
          reason: `Resend Webhook [${type}]: ${cleanReason}`,
          emailType: `Delivery Webhook (${type})`,
          context: {
            webhookEvent: type,
            emailId,
            subject,
          },
        });

        results.push({
          type,
          emailId,
          to,
          alertDispatched: alertRes.adminNotified === true,
          duplicateSuppressed: alertRes.duplicateSuppressed === true,
          adminAlertFailed: alertRes.adminAlertFailed === true,
          loggedToAudit: alertRes.loggedToAudit === true,
        });
      } else {
        // e.g. email.delivered, email.sent
        console.log(`[Email Webhook Info] Acknowledged "${type}" event for "${to}".`);
        results.push({ type, emailId, to, status: "acknowledged" });
      }
    }

    res.json({
      ok: true,
      message: `Successfully processed ${events.length} webhook event(s)`,
      events: results,
    });
  } catch (err) {
    console.error(`[Email Webhook Error] Failed to process webhook: ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// POST /api/webhooks/resend — Resend webhook event endpoint
router.post("/resend", handleWebhookEvent);

// POST /api/webhooks/email — Generic email webhook endpoint alias
router.post("/email", handleWebhookEvent);

module.exports = router;
