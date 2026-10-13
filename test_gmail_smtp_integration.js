/**
 * test_gmail_smtp_integration.js
 * Comprehensive automated verification for Gmail SMTP integration via Nodemailer:
 * 1. Reads GMAIL_USER and GMAIL_APP_PASSWORD from .env
 * 2. Authenticates with Gmail SMTP (smtp.gmail.com) via Nodemailer
 * 3. Sends real emails for:
 *    - (a) Renewal assignment notification
 *    - (b) Team workspace invitation
 *    - (c) Account password reset
 *    - (d) Invitation acceptance admin confirmation
 *    - (e) Expiry renewal reminder
 *    - (f) Email delivery-failure alert
 * 4. Verifies error handling, sanitization (no plaintext passwords/secrets leaked)
 * 5. Reports all delivery message IDs and diagnostics
 */

require("dotenv").config();
const emailService = require("./backend/emailService");
const config = require("./backend/config");

function assert(condition, message, details = "") {
  if (!condition) {
    console.error(`  [FAIL] ${message} ${details}`);
    throw new Error(`Assertion failed: ${message} ${details}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runTests() {
  console.log("\n================================================================================");
  console.log("  RenewalTrack: Gmail SMTP (Nodemailer) Real Email Delivery Test Suite          ");
  console.log("================================================================================\n");

  let passed = 0;

  // 1. Configuration & Credential Inspection
  console.log("1. Inspecting Gmail SMTP Environment Configuration:");
  assert(Boolean(config.GMAIL_USER), "config.GMAIL_USER is loaded from .env");
  assert(Boolean(config.GMAIL_APP_PASSWORD), "config.GMAIL_APP_PASSWORD is loaded from .env");
  assert(config.EMAIL_PROVIDER === "nodemailer", "EMAIL_PROVIDER is set to 'nodemailer'");
  assert(config.EMAIL_SEND_ENABLED === true, "EMAIL_SEND_ENABLED is true (real sending enabled)");
  assert(config.SMTP_HOST === "smtp.gmail.com", "SMTP_HOST is configured for smtp.gmail.com");
  assert(config.SMTP_SERVICE === "gmail", "SMTP_SERVICE is configured as 'gmail'");
  passed += 6;

  // Verify credentials are sanitized in provider status
  const providerStatus = emailService.getProviderStatus();
  console.log(`  - Active Provider:   ${providerStatus.provider}`);
  console.log(`  - Sender Address:    ${providerStatus.fromAddress}`);
  console.log(`  - Sanitized User:    ${providerStatus.smtpUser}`);
  console.log(`  - Delivery Active:   ${providerStatus.enabled}`);
  assert(!JSON.stringify(providerStatus).includes(config.GMAIL_APP_PASSWORD), "getProviderStatus() NEVER exposes GMAIL_APP_PASSWORD");
  passed++;

  // 2. SMTP Connection Verification
  console.log("\n2. Verifying Gmail SMTP Connection & Authentication:");
  const connResult = await emailService.verifyConnection();
  assert(connResult.ok === true, "verifyConnection() succeeds with Gmail SMTP", connResult.message || connResult.error);
  assert(connResult.provider === "nodemailer", "verifyConnection() confirms provider is 'nodemailer'");
  passed += 2;

  const targetEmail = config.GMAIL_USER || "elakkiya270806@gmail.com";
  console.log(`\nUsing recipient address for verified live delivery: ${targetEmail}`);

  // 3. Real Delivery: Renewal Assignment
  console.log("\n3. Testing Real Email: Renewal Assignment Notification...");
  const assignResult = await emailService.sendAssignmentNotification({
    to: targetEmail,
    recipientName: "Elakkiya (Admin)",
    renewal: {
      id: "rn-gmail-assign-" + Date.now(),
      name: "AWS Production Cloud Infrastructure",
      category: "Cloud Hosting",
      vendor: "Amazon Web Services",
      cost: 4500,
      currency: "USD",
      renewalDate: "2026-11-30",
      expiryDate: "2026-11-30",
      priority: "High",
      status: "Upcoming",
    },
    assignedBy: "RenewalTrack Admin Team",
    isReassignment: false,
  });
  assert(assignResult.success === true, "Renewal assignment email dispatch returned success: true");
  assert(assignResult.delivered === true, "Email delivered in real mode (delivered: true)");
  assert(Boolean(assignResult.messageId), `Assigned Message ID: ${assignResult.messageId}`);
  assert(assignResult.provider === "nodemailer", "Delivered via 'nodemailer' provider");
  passed += 4;

  // 4. Real Delivery: Team Invitation
  console.log("\n4. Testing Real Email: Team Workspace Invitation...");
  const inviteResult = await emailService.sendInvitationEmail({
    to: targetEmail,
    fullName: "Elakkiya",
    role: "Employee",
    inviteUrl: `${config.APP_URL}/register.html?invite_token=test_gmail_token_${Date.now()}`,
    invitedBy: "RenewalTrack Primary Administrator",
  });
  assert(inviteResult.success === true, "Team invitation email dispatch returned success: true");
  assert(inviteResult.delivered === true, "Team invitation delivered in real mode");
  assert(Boolean(inviteResult.messageId), `Assigned Message ID: ${inviteResult.messageId}`);
  assert(inviteResult.provider === "nodemailer", "Delivered via 'nodemailer' provider");
  passed += 4;

  // 5. Real Delivery: Password Reset
  console.log("\n5. Testing Real Email: Password Reset Request...");
  const resetResult = await emailService.sendPasswordResetEmail({
    to: targetEmail,
    fullName: "Elakkiya",
    resetUrl: `${config.APP_URL}/reset-password.html?token=test_reset_token_${Date.now()}`,
    expiresMinutes: 30,
  });
  assert(resetResult.success === true, "Password reset email dispatch returned success: true");
  assert(resetResult.delivered === true, "Password reset delivered in real mode");
  assert(Boolean(resetResult.messageId), `Assigned Message ID: ${resetResult.messageId}`);
  assert(resetResult.provider === "nodemailer", "Delivered via 'nodemailer' provider");
  passed += 4;

  // 6. Real Delivery: Invitation Acceptance Confirmation (to Admin)
  console.log("\n6. Testing Real Email: Invitation Acceptance Admin Confirmation...");
  const acceptResult = await emailService.sendInvitationAcceptanceNotification({
    to: targetEmail,
    adminName: "Elakkiya",
    memberName: "Alex Rivera",
    memberEmail: "alex.rivera@renewaltrack.com",
    role: "Employee",
    acceptedAt: new Date().toISOString(),
  });
  assert(acceptResult.success === true, "Invitation acceptance email dispatch returned success: true");
  assert(acceptResult.delivered === true, "Invitation acceptance delivered in real mode");
  assert(Boolean(acceptResult.messageId), `Assigned Message ID: ${acceptResult.messageId}`);
  assert(acceptResult.provider === "nodemailer", "Delivered via 'nodemailer' provider");
  passed += 4;

  // 7. Real Delivery: Renewal Reminder
  console.log("\n7. Testing Real Email: Expiry Renewal Reminder...");
  const reminderResult = await emailService.sendReminderEmail({
    renewal: {
      id: "rn-gmail-reminder-" + Date.now(),
      name: "Microsoft 365 Enterprise Business Suite",
      category: "Software License",
      organization: "Microsoft Corporation",
      cost: 12000,
      currency: "USD",
      renewalDate: "2026-10-28",
      expiryDate: "2026-10-28",
      priority: "Critical",
      referenceNumber: "MSFT-SUB-8819",
      notes: "Annual renewal for 50 employee licenses.",
    },
    recipientEmail: targetEmail,
    recipientName: "Elakkiya",
    daysRemaining: 15,
    interval: "15_days",
  });
  assert(reminderResult.success === true, "Renewal reminder email dispatch returned success: true");
  assert(reminderResult.delivered === true, "Renewal reminder delivered in real mode");
  assert(Boolean(reminderResult.messageId), `Assigned Message ID: ${reminderResult.messageId}`);
  assert(reminderResult.provider === "nodemailer", "Delivered via 'nodemailer' provider");
  passed += 4;

  // 8. Real Delivery: Delivery-Failure Alert
  console.log("\n8. Testing Real Email: Email Delivery-Failure Alert...");
  emailService.clearAlertDeduplicationCache();
  const alertResult = await emailService.notifyDeliveryFailure({
    recipientEmail: "unreachable.contractor@external-vendor.com",
    recipientName: "External Contractor",
    employeeDetails: {
      name: "External Contractor",
      email: "unreachable.contractor@external-vendor.com",
      role: "Employee",
    },
    renewalName: "Datadog APM & Cloud Monitoring",
    failureTime: new Date().toISOString(),
    reason: "Recipient mailbox unavailable: 550 User unknown",
    emailType: "Employee Renewal Assignment",
    context: { provider: "nodemailer" },
    force: true,
  });
  assert(alertResult.success === true, "Delivery failure alert dispatch returned success: true");
  assert(Boolean(alertResult.messageId), `Assigned Message ID: ${alertResult.messageId}`);
  passed += 2;

  // 9. Error Handling & Secret Protection
  console.log("\n9. Testing Error Handling & Secret Sanitization:");
  const invalidEmailResult = await emailService.sendAssignmentNotification({
    to: "not-an-email",
    recipientName: "Invalid User",
    renewal: { name: "Test Renewal" },
  });
  assert(invalidEmailResult.success === false, "Invalid email address is rejected gracefully");
  assert(invalidEmailResult.isInvalidEmail === true, "Reports isInvalidEmail: true");

  const sanitizedOutput = emailService.sanitizeSecrets(
    `Failed SMTP connection with user=${config.GMAIL_USER} and pass=${config.GMAIL_APP_PASSWORD}`
  );
  assert(!sanitizedOutput.includes(config.GMAIL_APP_PASSWORD), "Sensitive GMAIL_APP_PASSWORD is redacted from logs/errors");
  assert(sanitizedOutput.includes("[REDACTED_PASSWORD]") || sanitizedOutput.includes("[REDACTED]"), "Password replaced with redaction placeholder");
  passed += 4;

  console.log("\n================================================================================");
  console.log(`  ALL ${passed} GMAIL SMTP VERIFICATION TESTS COMPLETED SUCCESSFULLY!         `);
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("\n[TEST FATAL ERROR]:", err);
  process.exit(1);
});
