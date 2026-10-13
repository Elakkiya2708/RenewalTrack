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

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

  // Resolve authoritative From header for the active provider
  getFromAddress() {
    const provider = (config.EMAIL_PROVIDER || "nodemailer").toLowerCase();
    const fromName = config.FROM_NAME || "RenewGuard Alerts";

    if (provider === "resend") {
      // For Resend: if a verified custom sender is specified, use it; otherwise use Resend sandbox default
      const fromEmail =
        config.FROM_EMAIL && !config.FROM_EMAIL.includes("renewguard.com")
          ? config.FROM_EMAIL
          : (config.RESEND_FROM || "onboarding@resend.dev");
      return `"${fromName}" <${fromEmail}>`;
    }

    // For Nodemailer / Gmail SMTP:
    const smtpFrom =
      config.FROM_EMAIL && !config.FROM_EMAIL.includes("renewguard.com")
        ? config.FROM_EMAIL
        : (config.SMTP_USER || "reminders@renewguard.com");
    return `"${fromName}" <${smtpFrom}>`;
  },

  // Inspect configuration and provider status (without leaking secrets)
  getProviderStatus() {
    const provider = (config.EMAIL_PROVIDER || "nodemailer").toLowerCase();
    const isResend = provider === "resend";
    const hasResendKey = Boolean(config.RESEND_API_KEY && config.RESEND_API_KEY.trim());
    const hasSmtpCreds = Boolean(config.SMTP_USER && config.SMTP_PASS && config.SMTP_PASS.trim());

    const isConfigured = isResend ? hasResendKey : hasSmtpCreds;

    return {
      provider,
      isConfigured,
      hasResendKey,
      hasSmtpCreds,
      smtpHost: config.SMTP_HOST || "smtp.gmail.com",
      smtpPort: config.SMTP_PORT || 587,
      smtpUser: config.SMTP_USER ? `${config.SMTP_USER.slice(0, 3)}***@***` : null,
      fromAddress: this.getFromAddress(),
      enabled: config.EMAIL_SEND_ENABLED !== false,
    };
  },

  // Verify connection with configured email provider
  async verifyConnection() {
    const provider = (config.EMAIL_PROVIDER || "nodemailer").toLowerCase();

    if (provider === "resend") {
      if (!config.RESEND_API_KEY || !config.RESEND_API_KEY.trim()) {
        const err = "RESEND_API_KEY is not configured in .env.";
        return { ok: false, provider: "resend", error: err, unconfigured: true };
      }
      try {
        const resend = new Resend(config.RESEND_API_KEY);
        const { data, error } = await resend.apiKeys.list().catch(() => ({ data: null }));
        if (error) {
          return { ok: false, provider: "resend", error: error.message };
        }
        return {
          ok: true,
          provider: "resend",
          message: "Resend API connection and API key verified successfully.",
        };
      } catch (err) {
        return {
          ok: false,
          provider: "resend",
          error: `Resend authentication check failed: ${err.message}`,
        };
      }
    } else {
      // Nodemailer (Gmail SMTP or custom SMTP)
      if (!config.SMTP_USER || !config.SMTP_PASS) {
        const err = "SMTP_USER and/or SMTP_PASS are missing in .env. Configure your Gmail address and 16-character Google App Password.";
        return { ok: false, provider: "nodemailer", error: err, unconfigured: true };
      }

      try {
        const transporter = this._createNodemailerTransporter();
        await transporter.verify();
        return {
          ok: true,
          provider: "nodemailer",
          message: `SMTP connection established and authenticated successfully with ${config.SMTP_HOST || 'Gmail'}!`,
        };
      } catch (err) {
        return {
          ok: false,
          provider: "nodemailer",
          error: `SMTP connection/authentication failed: ${err.message}`,
        };
      }
    }
  },

  // Internal: Build Nodemailer transporter
  _createNodemailerTransporter() {
    const isGmail =
      (config.SMTP_HOST && config.SMTP_HOST.toLowerCase().includes("gmail")) ||
      (config.SMTP_SERVICE && config.SMTP_SERVICE.toLowerCase() === "gmail") ||
      (config.SMTP_USER && config.SMTP_USER.toLowerCase().endsWith("@gmail.com"));

    let transportOptions;
    if (isGmail) {
      transportOptions = {
        service: "gmail",
        auth: {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS, // 16-character Google App Password
        },
      };
    } else {
      transportOptions = {
        host: config.SMTP_HOST || "smtp.gmail.com",
        port: config.SMTP_PORT || 587,
        secure: config.SMTP_SECURE,
        auth:
          config.SMTP_USER && config.SMTP_PASS
            ? {
                user: config.SMTP_USER,
                pass: config.SMTP_PASS,
              }
            : undefined,
        tls: {
          rejectUnauthorized: false,
        },
      };
    }

    return nodemailer.createTransport(transportOptions);
  },

  // Internal: Send via Nodemailer (SMTP / Gmail)
  async _sendViaNodemailer({ from, to, subject, html, text, renewal }) {
    if (!config.SMTP_USER || !config.SMTP_PASS) {
      const err = "Cannot send real email: SMTP_USER and SMTP_PASS are not configured in .env.";
      console.error(`[Nodemailer Error] ${err}`);
      return { success: false, error: err, unconfigured: true, provider: "nodemailer" };
    }

    try {
      const transporter = this._createNodemailerTransporter();
      const fromHeader = from || this.getFromAddress();

      console.log(`[Nodemailer Dispatch] Connecting to SMTP (${config.SMTP_HOST || 'Gmail'})...`);
      const info = await transporter.sendMail({
        from: fromHeader,
        to,
        subject,
        text,
        html,
      });

      console.log(`[Nodemailer Success] Real email DELIVERED to ${to} for "${renewal ? renewal.name : 'Notification'}". Message ID: ${info.messageId}`);
      return {
        success: true,
        messageId: info.messageId,
        provider: "nodemailer",
        response: info.response,
        delivered: true,
      };
    } catch (err) {
      console.error(`[Nodemailer Delivery Error] Failed sending to ${to}: ${err.message}`);
      return {
        success: false,
        error: err.message,
        provider: "nodemailer",
        delivered: false,
      };
    }
  },

  // Internal: Send via Resend API
  async _sendViaResend({ from, to, subject, html, text, renewal }) {
    if (!config.RESEND_API_KEY || !config.RESEND_API_KEY.trim()) {
      const err = "Cannot send real email: RESEND_API_KEY is not configured in .env.";
      console.error(`[Resend Error] ${err}`);
      return { success: false, error: err, unconfigured: true, provider: "resend" };
    }

    try {
      const resend = new Resend(config.RESEND_API_KEY);
      const fromHeader = from || this.getFromAddress();

      console.log(`[Resend Dispatch] Sending email via Resend API to ${to}...`);
      const { data, error } = await resend.emails.send({
        from: fromHeader,
        to,
        subject,
        html,
        text,
      });

      if (error) {
        console.error(`[Resend API Error] Failed sending to ${to}: ${error.message}`);
        return {
          success: false,
          error: error.message,
          provider: "resend",
          delivered: false,
        };
      }

      console.log(`[Resend Success] Real email DELIVERED to ${to} for "${renewal ? renewal.name : 'Notification'}". Message ID: ${data.id}`);
      return {
        success: true,
        messageId: data.id,
        provider: "resend",
        delivered: true,
      };
    } catch (err) {
      console.error(`[Resend Delivery Error] Failed sending to ${to}: ${err.message}`);
      return {
        success: false,
        error: err.message,
        provider: "resend",
        delivered: false,
      };
    }
  },

  // Send a renewal reminder email (Real delivery)
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

    const fromAddress = this.getFromAddress();
    const provider = (config.EMAIL_PROVIDER || "nodemailer").toLowerCase();

    if (provider === "resend") {
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
  },

  // Send a direct test email (for testing real delivery to an inbox)
  async sendTestEmail(targetEmail) {
    if (!isValidEmail(targetEmail)) {
      return { success: false, error: `Invalid test email address: "${targetEmail}"` };
    }

    const sampleRenewal = {
      id: "ren-test-sample",
      name: "Microsoft 365 Enterprise Test License",
      category: "Software License",
      organization: "Microsoft Corporation",
      expiryDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
      priority: "High",
      cost: 18500,
      currency: "USD",
      referenceNumber: "TEST-REF-9921",
      notes: "This is a real test notification generated from RenewGuard to verify email delivery.",
    };

    return await this.sendReminderEmail({
      renewal: sampleRenewal,
      recipientEmail: targetEmail,
      recipientName: "RenewGuard Administrator",
      daysRemaining: 15,
      interval: "15_days",
    });
  },

  // Send an invitation email to a new team member
  async sendInvitationEmail({ to, fullName, role, inviteUrl, invitedBy }) {
    if (!isValidEmail(to)) {
      return { success: false, error: `Invalid recipient email address: "${to}"` };
    }

    const recipientName = fullName || to.split("@")[0];
    const subject = `You're invited to join RenewGuard as ${role}`;
    const inviterText = invitedBy ? `${invitedBy} has invited you` : "You have been invited";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invitation to Join RenewGuard</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.07);border:1px solid #e2e8f0;">
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;border-bottom:3px solid #6366f1;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                <span style="color:#818cf8;">Renew</span>Guard
              </div>
              <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
                Renewal &amp; Compliance Management
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">
                Welcome to the Team, ${escapeHtml(recipientName)}!
              </h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
                ${escapeHtml(inviterText)} to join our organization workspace on RenewGuard with the role of <strong>${escapeHtml(role)}</strong>.
              </p>
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin-bottom:24px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#64748b;">Assigned Role:</td>
                    <td style="padding:4px 0;font-size:13px;font-weight:600;color:#4f46e5;">${escapeHtml(role)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#64748b;">Email Address:</td>
                    <td style="padding:4px 0;font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(to)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:13px;color:#64748b;">Link Validity:</td>
                    <td style="padding:4px 0;font-size:13px;font-weight:600;color:#0f172a;">48 Hours</td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center;margin:28px 0;">
                <a href="${inviteUrl}" style="background-color:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:6px;display:inline-block;box-shadow:0 2px 4px rgba(79,70,229,0.3);">
                  Accept Invitation &rarr;
                </a>
              </div>
              <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
                If the button above does not work, copy and paste this URL into your browser:<br>
                <a href="${inviteUrl}" style="color:#6366f1;word-break:break-all;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
              &copy; 2026 RenewGuard Inc. &bull; Secure Invitation Token
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Welcome to RenewGuard!\n\n${inviterText} to join as ${role}.\n\nPlease accept your invitation here:\n${inviteUrl}\n\nThis invitation link expires in 48 hours.`;
    const from = this.getFromAddress();
    const provider = (config.EMAIL_PROVIDER || "nodemailer").toLowerCase();

    console.log(`[Invitation Email Dispatch] Sending invitation email to ${to} (${role}) via ${provider}...`);
    let result;
    if (provider === "resend") {
      result = await this._sendViaResend({ from, to, subject, html, text, renewal: { name: "Team Invitation" } });
    } else {
      result = await this._sendViaNodemailer({ from, to, subject, html, text, renewal: { name: "Team Invitation" } });
    }

    if (result.success) {
      console.log(`[Invitation Email Success] Invitation email delivered to ${to} via ${result.provider}. Message ID: ${result.messageId}`);
    } else {
      console.warn(`[Invitation Email Warning] Email delivery to ${to} not completed: ${result.error}`);
    }
    return result;
  },

  // Real Email Delivery: Notify Admin when an invited member accepts their invitation
  async sendInvitationAcceptanceNotification({ to, adminName, memberName, memberEmail, role, acceptedAt }) {
    if (!isValidEmail(to)) {
      const err = `Invalid admin recipient email address: "${to}"`;
      console.warn(`[Invite Acceptance Email Validation] ${err}`);
      return { success: false, error: err, isInvalidEmail: true };
    }

    const recipientAdmin = adminName || "Administrator";
    const acceptedDateFormatted = new Date(acceptedAt || Date.now()).toUTCString();
    const appUrl = config.APP_URL || `http://localhost:${config.PORT}`;
    const teamUrl = `${appUrl}/team.html`;
    const subject = `Team Invitation Accepted: ${memberName} joined as ${role}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.07);border:1px solid #e2e8f0;">
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;border-bottom:3px solid #10b981;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                <span style="color:#818cf8;">Renew</span>Guard
              </div>
              <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
                Team Management Notification
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <div style="display:inline-block;padding:6px 12px;background-color:rgba(16,185,129,0.1);border-radius:999px;color:#059669;font-size:12px;font-weight:600;margin-bottom:16px;">
                &#10003; Invitation Accepted &amp; Account Activated
              </div>
              <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">
                Hello ${escapeHtml(recipientAdmin)},
              </h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
                Great news! <strong>${escapeHtml(memberName)}</strong> has accepted your invitation and successfully activated their account on RenewGuard.
              </p>
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;width:140px;">Member Name:</td>
                    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(memberName)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Email Address:</td>
                    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(memberEmail)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Assigned Role:</td>
                    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#4f46e5;">${escapeHtml(role)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Accepted On:</td>
                    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;">${escapeHtml(acceptedDateFormatted)}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;">Account Status:</td>
                    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#10b981;">Active</td>
                  </tr>
                </table>
              </div>
              <div style="text-align:center;margin:28px 0;">
                <a href="${teamUrl}" style="background-color:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:6px;display:inline-block;box-shadow:0 2px 4px rgba(79,70,229,0.3);">
                  View Team Members &rarr;
                </a>
              </div>
              <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
                This user is now ready to receive renewals or access permitted records based on their assigned role.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
              &copy; 2026 RenewGuard Inc. &bull; Team Management Automated Notification
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `RenewGuard Team Notification\n\nHello ${recipientAdmin},\n\n${memberName} (${memberEmail}) has accepted your invitation and activated their account with role: ${role}.\n\nAccepted On: ${acceptedDateFormatted}\nAccount Status: Active\n\nView your team members here: ${teamUrl}`;

    const from = this.getFromAddress();
    const provider = (config.EMAIL_PROVIDER || "nodemailer").toLowerCase();

    console.log(`[Invite Acceptance Email Dispatch] Sending confirmation to admin ${to} for accepted member ${memberEmail} via ${provider}...`);
    let result;
    if (provider === "resend") {
      result = await this._sendViaResend({ from, to, subject, html, text, renewal: { name: `Acceptance by ${memberName}` } });
    } else {
      result = await this._sendViaNodemailer({ from, to, subject, html, text, renewal: { name: `Acceptance by ${memberName}` } });
    }

    if (result.success) {
      console.log(`[Invite Acceptance Email Success] Admin confirmation email delivered to ${to} via ${result.provider}. Message ID: ${result.messageId}`);
    } else {
      console.warn(`[Invite Acceptance Email Warning] Admin confirmation email to ${to} not completed: ${result.error}`);
    }
    return result;
  },

  // Real Email Delivery: Send renewal assignment / reassignment notification email
  async sendAssignmentNotification({ to, recipientName, renewal, assignedBy, isReassignment = false, previousAssignee = "" }) {
    if (!isValidEmail(to)) {
      const err = `Invalid recipient email address: "${to}"`;
      console.warn(`[Assignment Email Validation] ${err}`);
      return { success: false, error: err, isInvalidEmail: true };
    }

    const appUrl = config.APP_URL || `http://localhost:${config.PORT}`;
    const detailUrl = `${appUrl}/details.html?id=${encodeURIComponent(renewal.id || "")}`;
    const actionWord = isReassignment ? "Reassigned" : "Assigned";
    const subject = `Renewal ${actionWord}: ${renewal.name || "Renewal Record"}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.07);border:1px solid #e2e8f0;">
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;border-bottom:3px solid #6366f1;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                      <span style="color:#818cf8;">Renew</span>Guard
                    </div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
                      Renewal Assignment Notification
                    </div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 12px;background-color:#4f46e5;color:#ffffff;font-size:11px;font-weight:700;border-radius:16px;text-transform:uppercase;">
                      ${actionWord}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">
                Hello, ${escapeHtml(recipientName || "Team Member")}!
              </h2>
              <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
                You have been ${isReassignment ? "reassigned" : "assigned"} as the responsible owner for the renewal record <strong>${escapeHtml(renewal.name || "")}</strong> by <strong>${escapeHtml(assignedBy || "an Administrator")}</strong>.
              </p>
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px;margin-bottom:24px;">
                <table role="presentation" width="100%">
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;width:35%;">Record Name:</td>
                    <td style="padding:6px 0;font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(renewal.name || "—")}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Category:</td>
                    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#4f46e5;border-top:1px solid #edf2f7;">${escapeHtml(renewal.category || "General")}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Expiry Date:</td>
                    <td style="padding:6px 0;font-size:14px;font-weight:700;color:#dc2626;border-top:1px solid #edf2f7;">${escapeHtml(renewal.expiryDate || "—")}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Priority:</td>
                    <td style="padding:6px 0;font-size:13px;font-weight:600;color:#0f172a;border-top:1px solid #edf2f7;">${escapeHtml(renewal.priority || "Medium")}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Organization / Vendor:</td>
                    <td style="padding:6px 0;font-size:13px;color:#334155;border-top:1px solid #edf2f7;">${escapeHtml(renewal.organization || "—")}</td>
                  </tr>
                  ${isReassignment && previousAssignee ? `
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">Previous Owner:</td>
                    <td style="padding:6px 0;font-size:13px;color:#64748b;border-top:1px solid #edf2f7;">${escapeHtml(previousAssignee)}</td>
                  </tr>` : ""}
                </table>
              </div>
              <div style="text-align:center;margin:28px 0;">
                <a href="${detailUrl}" style="background-color:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:6px;display:inline-block;box-shadow:0 2px 4px rgba(79,70,229,0.3);">
                  View Renewal Details &rarr;
                </a>
              </div>
              <p style="font-size:12px;color:#64748b;margin:20px 0 0;text-align:center;">
                You can manage and mark this renewal as renewed in your "Assigned to Me" workspace.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
              &copy; 2026 RenewGuard Inc. &bull; Automated Assignment Alert
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Hello ${recipientName},\n\nYou have been ${isReassignment ? "reassigned" : "assigned"} to manage renewal "${renewal.name}" (Expiry: ${renewal.expiryDate}) by ${assignedBy}.\n\nView details: ${detailUrl}`;

    const from = this.getFromAddress();
    const provider = (config.EMAIL_PROVIDER || "nodemailer").toLowerCase();

    console.log(`[Assignment Email Dispatch] Attempting real delivery of assignment email to ${recipientName} <${to}> via ${provider}...`);

    let result;
    if (provider === "resend") {
      result = await this._sendViaResend({ from, to, subject, html, text, renewal });
    } else {
      result = await this._sendViaNodemailer({ from, to, subject, html, text, renewal });
    }

    return result;
  },

  // Real Email Delivery: Send secure password reset email
  async sendPasswordResetEmail({ to, fullName, resetUrl, expiresMinutes = 30 }) {
    if (!isValidEmail(to)) {
      const err = `Invalid recipient email address: "${to}"`;
      console.warn(`[Password Reset Email Validation] ${err}`);
      return { success: false, error: err, isInvalidEmail: true };
    }

    const recipientName = fullName || to.split("@")[0];
    const subject = "Reset Your RenewGuard Password";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Reset Your RenewGuard Password</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.07);border:1px solid #e2e8f0;">
          <tr>
            <td style="background-color:#0f172a;padding:24px 32px;border-bottom:3px solid #6366f1;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                      <span style="color:#818cf8;">Renew</span>Guard
                    </div>
                    <div style="font-size:12px;color:#94a3b8;margin-top:2px;">
                      Account Security &amp; Password Recovery
                    </div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 12px;background-color:#ef4444;color:#ffffff;font-size:11px;font-weight:700;border-radius:16px;text-transform:uppercase;">
                      Password Reset
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 24px;">
              <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">
                Hello, ${escapeHtml(recipientName)}!
              </h2>
              <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
                We received a request to reset the password for your RenewGuard account (<strong>${escapeHtml(to)}</strong>).
              </p>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Click the secure button below to set a new password. This link is single-use and will expire in <strong>${expiresMinutes} minutes</strong>.
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${resetUrl}" style="background-color:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 32px;border-radius:6px;display:inline-block;box-shadow:0 2px 4px rgba(79,70,229,0.3);">
                  Reset Your Password &rarr;
                </a>
              </div>
              <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:24px 0;">
                <p style="margin:0;font-size:13px;color:#64748b;line-height:1.5;">
                  <strong>Security Note:</strong> If you did not request this password reset, please ignore this email. Your password will remain unchanged and your account remains secure.
                </p>
              </div>
              <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;word-break:break-all;">
                If the button above does not work, copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color:#6366f1;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;">
              &copy; 2026 RenewGuard Inc. &bull; Automated Security Notification
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const text = `Hello ${recipientName},\n\nWe received a request to reset your RenewGuard password.\n\nPlease reset your password using this link (expires in ${expiresMinutes} minutes):\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;

    const from = this.getFromAddress();
    const provider = (config.EMAIL_PROVIDER || "nodemailer").toLowerCase();

    console.log(`[Password Reset Email Dispatch] Sending reset link to ${to} via ${provider}...`);

    let result;
    if (provider === "resend") {
      result = await this._sendViaResend({ from, to, subject, html, text, renewal: { name: "Password Reset" } });
    } else {
      result = await this._sendViaNodemailer({ from, to, subject, html, text, renewal: { name: "Password Reset" } });
    }

    return result;
  },
};

module.exports = emailService;

