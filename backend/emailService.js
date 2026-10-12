/* ==========================================================================
   backend/emailService.js — Real Email Delivery Engine (Nodemailer & Resend)
   Supports SMTP, Resend API, safe development simulation, and HTML templates.
   ========================================================================== */

const nodemailer = require("nodemailer");
const { Resend } = require("resend");
const config = require("./config");

// Simple email format validator (RFC 5322 compatible)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  return EMAIL_REGEX.test(email.trim());
}

// Format priority badge in HTML
function getPriorityColor(priority) {
  switch ((priority || "").toLowerCase()) {
    case "high":
      return { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" };
    case "low":
      return { bg: "#e0f2fe", text: "#0369a1", border: "#bae6fd" };
    default:
      return { bg: "#fef3c7", text: "#b45309", border: "#fde68a" };
  }
}

// Format days badge in HTML
function getDaysBadge(days) {
  if (days <= 0) {
    return { label: "EXPIRES TODAY", bg: "#dc2626", text: "#ffffff" };
  }
  if (days <= 7) {
    return { label: `${days} DAYS REMAINING (CRITICAL)`, bg: "#ea580c", text: "#ffffff" };
  }
  if (days <= 15) {
    return { label: `${days} DAYS REMAINING (URGENT)`, bg: "#d97706", text: "#ffffff" };
  }
  return { label: `${days} DAYS REMAINING`, bg: "#4f46e5", text: "#ffffff" };
}

// Generate responsive HTML email template
function generateEmailHtml({ renewal, daysRemaining, interval, recipientName, appUrl }) {
  const pStyle = getPriorityColor(renewal.priority);
  const dBadge = getDaysBadge(daysRemaining);
  const detailUrl = `${appUrl}/details.html?id=${encodeURIComponent(renewal.id)}`;
  const settingsUrl = `${appUrl}/settings.html`;
  const costFormatted = renewal.cost
    ? `${renewal.currency || "USD"} $${Number(renewal.cost).toLocaleString()}`
    : "—";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Renewal Reminder: ${renewal.name}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.07),0 2px 4px -2px rgba(0,0,0,0.05);border:1px solid #e2e8f0;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;border-bottom:3px solid #6366f1;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                      <span style="color:#818cf8;">Renew</span>Guard
                    </div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
                      Automated Renewal &amp; Compliance Management
                    </div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:6px 14px;background-color:${dBadge.bg};color:${dBadge.text};font-size:11px;font-weight:700;border-radius:20px;letter-spacing:0.5px;text-transform:uppercase;">
                      ${dBadge.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:32px;">
              <p style="font-size:15px;margin:0 0 12px;color:#475569;">
                Hello <strong>${recipientName || "Team"}</strong>,
              </p>
              <p style="font-size:15px;margin:0 0 24px;color:#334155;">
                This is an automated reminder that the following tracked renewal is approaching its expiration deadline:
              </p>

              <!-- Renewal Details Card -->
              <table role="presentation" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:28px;">
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#64748b;width:35%;">Renewal Name</td>
                  <td style="padding:8px 0;font-size:15px;font-weight:700;color:#0f172a;">${renewal.name}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Category</td>
                  <td style="padding:8px 0;font-size:14px;font-weight:600;color:#334155;border-top:1px solid #edf2f7;">${renewal.category}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Organization / Vendor</td>
                  <td style="padding:8px 0;font-size:14px;color:#334155;border-top:1px solid #edf2f7;">${renewal.organization || "—"}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Expiry Date</td>
                  <td style="padding:8px 0;font-size:15px;font-weight:700;color:${daysRemaining <= 7 ? "#dc2626" : "#4338ca"};border-top:1px solid #edf2f7;">
                    ${renewal.expiryDate} (${daysRemaining <= 0 ? "Expires Today" : `${daysRemaining} days remaining`})
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Priority</td>
                  <td style="padding:8px 0;border-top:1px solid #edf2f7;">
                    <span style="display:inline-block;padding:2px 8px;background-color:${pStyle.bg};color:${pStyle.text};border:1px solid ${pStyle.border};border-radius:4px;font-size:12px;font-weight:600;">
                      ${renewal.priority || "Medium"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Reference Number</td>
                  <td style="padding:8px 0;font-size:13px;color:#475569;border-top:1px solid #edf2f7;">${renewal.referenceNumber || "—"}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Renewal Cost</td>
                  <td style="padding:8px 0;font-size:14px;font-weight:600;color:#0f172a;border-top:1px solid #edf2f7;">${costFormatted}</td>
                </tr>
                ${
                  renewal.notes
                    ? `<tr>
                        <td style="padding:8px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Notes</td>
                        <td style="padding:8px 0;font-size:13px;color:#475569;border-top:1px solid #edf2f7;">${renewal.notes}</td>
                       </tr>`
                    : ""
                }
              </table>

              <!-- Call to Action Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="${detailUrl}" target="_blank" style="display:inline-block;padding:14px 28px;background-color:#4f46e5;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;box-shadow:0 2px 4px rgba(79,70,229,0.3);">
                      View Record &amp; Mark Renewed &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:12px;color:#64748b;margin:24px 0 0;text-align:center;">
                Please ensure necessary approvals and renewals are processed before the expiration date to maintain regulatory compliance.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
              <div>This is an automated notification from RenewGuard.</div>
              <div style="margin-top:6px;">
                <a href="${settingsUrl}" style="color:#6366f1;text-decoration:underline;">Manage Notification Preferences</a>
                &nbsp;&bull;&nbsp;
                <a href="${appUrl}/dashboard.html" style="color:#6366f1;text-decoration:underline;">Open RenewGuard Dashboard</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Generate plain text email
function generateEmailText({ renewal, daysRemaining, interval, recipientName, appUrl }) {
  const detailUrl = `${appUrl}/details.html?id=${encodeURIComponent(renewal.id)}`;
  return `RENEWGUARD - RENEWAL REMINDER (${daysRemaining <= 0 ? "EXPIRES TODAY" : `${daysRemaining} DAYS REMAINING`})
--------------------------------------------------------------------------------

Hello ${recipientName || "Team"},

This is an automated reminder that the following tracked renewal is approaching its expiration deadline:

- Renewal Name:        ${renewal.name}
- Category:            ${renewal.category}
- Organization/Vendor: ${renewal.organization || "—"}
- Expiry Date:         ${renewal.expiryDate} (${daysRemaining <= 0 ? "EXPIRES TODAY" : `${daysRemaining} days left`})
- Priority:            ${renewal.priority || "Medium"}
- Reference Number:    ${renewal.referenceNumber || "—"}
- Renewal Cost:        ${renewal.cost ? `${renewal.currency || "USD"} ${renewal.cost}` : "—"}
- Notes:               ${renewal.notes || "—"}

Action Required:
Review and process this renewal at: ${detailUrl}

--------------------------------------------------------------------------------
Sent automatically by RenewGuard Renewal & Compliance Management System.
Notification Preferences: ${appUrl}/settings.html
`;
}

// Main Email Service
const emailService = {
  // Validate an email address
  isValidEmail,

  // Send a renewal reminder email
  async sendReminderEmail({ renewal, recipientEmail, recipientName, daysRemaining, interval }) {
    if (!isValidEmail(recipientEmail)) {
      const err = `Invalid recipient email address: "${recipientEmail}"`;
      console.warn(`[Email Validation] ${err} for renewal "${renewal.name}" (${renewal.id})`);
      return { success: false, error: err, isInvalidEmail: true };
    }

    const appUrl = config.APP_URL;
    const intervalLabel =
      daysRemaining <= 0
        ? "EXPIRES TODAY"
        : `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Remaining`;

    const subject =
      daysRemaining <= 0
        ? `🚨 URGENT: [${renewal.name}] EXPIRES TODAY - Action Required`
        : daysRemaining <= 7
        ? `⚠️ URGENT: [${renewal.name}] expires in ${daysRemaining} days`
        : `🔔 Reminder: [${renewal.name}] expires in ${daysRemaining} days`;

    const htmlContent = generateEmailHtml({
      renewal,
      daysRemaining,
      interval,
      recipientName,
      appUrl,
    });

    const textContent = generateEmailText({
      renewal,
      daysRemaining,
      interval,
      recipientName,
      appUrl,
    });

    const fromAddress = `"${config.FROM_NAME}" <${config.FROM_EMAIL}>`;

    // ------------------------------------------------------------------------
    // Development / Simulation Mode:
    // If EMAIL_SEND_ENABLED is false (default), log and record without sending real email
    // ------------------------------------------------------------------------
    if (!config.EMAIL_SEND_ENABLED) {
      console.log("\n================================================================================");
      console.log(`[EMAIL SIMULATION] Reminder Notification for "${renewal.name}"`);
      console.log(`To:        ${recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail}`);
      console.log(`From:      ${fromAddress}`);
      console.log(`Subject:   ${subject}`);
      console.log(`Interval:  ${interval} (${intervalLabel})`);
      console.log(`Renewal:   ${renewal.name} (${renewal.category} - ${renewal.expiryDate})`);
      console.log(`Provider:  ${config.EMAIL_PROVIDER} (Simulation Mode - Set EMAIL_SEND_ENABLED=true in .env for live delivery)`);
      console.log("================================================================================\n");

      return {
        success: true,
        simulated: true,
        messageId: `simulated-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        provider: `${config.EMAIL_PROVIDER}-simulation`,
      };
    }

    // ------------------------------------------------------------------------
    // Live Email Delivery Mode:
    // ------------------------------------------------------------------------
    try {
      if (config.EMAIL_PROVIDER === "resend") {
        return await this._sendViaResend({
          from: fromAddress,
          to: recipientEmail,
          subject,
          html: htmlContent,
          text: textContent,
          renewal,
        });
      } else {
        return await this._sendViaNodemailer({
          from: fromAddress,
          to: recipientEmail,
          subject,
          html: htmlContent,
          text: textContent,
          renewal,
        });
      }
    } catch (err) {
      console.error(`[Email Delivery Error] Failed sending to ${recipientEmail}: ${err.message}`);
      return {
        success: false,
        error: err.message,
      };
    }
  },

  // Internal: Send via Nodemailer (SMTP)
  async _sendViaNodemailer({ from, to, subject, html, text, renewal }) {
    if (!config.SMTP_HOST) {
      const err = "SMTP_HOST is not configured in environment variables.";
      console.error(`[Nodemailer Error] ${err}`);
      return { success: false, error: err };
    }

    const transportOptions = {
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
    };

    if (config.SMTP_USER && config.SMTP_PASS) {
      transportOptions.auth = {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      };
    }

    const transporter = nodemailer.createTransport(transportOptions);

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });

    console.log(`[Nodemailer Success] Sent email to ${to} for "${renewal.name}". Message ID: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId,
      provider: "nodemailer",
    };
  },

  // Internal: Send via Resend
  async _sendViaResend({ from, to, subject, html, text, renewal }) {
    if (!config.RESEND_API_KEY) {
      const err = "RESEND_API_KEY is not configured in environment variables.";
      console.error(`[Resend Error] ${err}`);
      return { success: false, error: err };
    }

    const resend = new Resend(config.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error(`[Resend Error] ${error.message}`);
      return { success: false, error: error.message };
    }

    console.log(`[Resend Success] Sent email to ${to} for "${renewal.name}". Message ID: ${data.id}`);
    return {
      success: true,
      simulated: false,
      messageId: data.id,
      provider: "resend",
    };
  },

  // Send a direct test email (for testing configuration in settings)
  async sendTestEmail(targetEmail) {
    if (!isValidEmail(targetEmail)) {
      return { success: false, error: `Invalid test email address: "${targetEmail}"` };
    }

    const sampleRenewal = {
      id: "ren-test-sample",
      name: "Microsoft 365 Enterprise Test License",
      category: "License",
      organization: "Microsoft Corporation",
      expiryDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
      priority: "High",
      cost: 18500,
      currency: "USD",
      referenceNumber: "TEST-REF-9921",
      notes: "This is a test notification generated from RenewGuard Settings.",
    };

    return await this.sendReminderEmail({
      renewal: sampleRenewal,
      recipientEmail: targetEmail,
      recipientName: "RenewGuard Administrator",
      daysRemaining: 15,
      interval: "15_days",
    });
  },
};

module.exports = emailService;
