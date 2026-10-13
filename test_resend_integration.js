/* ==========================================================================
   test_resend_integration.js — Resend Backend Integration Verification Suite
   Verifies:
   1. RESEND_API_KEY and EMAIL_FROM loaded properly from .env without exposure
   2. Resend API connection verification
   3. Real email delivery for all 5 required email types:
      - Renewal Assignment Notification
      - Team Member Invitation
      - Secure Password Reset
      - Invitation Acceptance Confirmation
      - Renewal Expiry Reminder
   4. Cryptographic single-use expiring tokens (Invitations: 48h, Password Resets: 30m)
   5. Proper error handling, invalid email validation, and secret sanitization
   6. Integration with backend routes (/api/renewals, /api/team, /api/auth)
   ========================================================================== */

require("dotenv").config();
const BASE_URL = "http://localhost:3000";

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = "") {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] ${testName} ${details ? "- " + details : ""}`);
  }
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runTests() {
  console.log("\n================================================================================");
  console.log("  RenewalTrack: Resend API Backend Integration Test Suite                        ");
  console.log("================================================================================\n");

  const emailService = require("./backend/emailService");
  const db = require("./backend/db");
  const config = require("./backend/config");

  // Reset deduplication cache for fresh test runs
  emailService.clearAlertDeduplicationCache();

  // ---------------------------------------------------------------------------
  // 1. CONFIGURATION & SECRET PROTECTION
  // ---------------------------------------------------------------------------
  console.log("[1] Checking Resend Configuration & Secret Protection...");

  assert(
    typeof config.RESEND_API_KEY === "string" && config.RESEND_API_KEY.startsWith("re_"),
    "RESEND_API_KEY is present and starts with 're_'"
  );
  assert(
    config.EMAIL_FROM === "onboarding@resend.dev" || !!config.EMAIL_FROM,
    "EMAIL_FROM is properly configured",
    `Configured EMAIL_FROM: ${config.EMAIL_FROM}`
  );
  assert(
    config.EMAIL_PROVIDER === "resend",
    "EMAIL_PROVIDER is set to 'resend'"
  );
  assert(
    config.EMAIL_SEND_ENABLED === true,
    "EMAIL_SEND_ENABLED is true (real email sending enabled, no mocks)"
  );

  const fromAddress = emailService.getFromAddress();
  assert(
    fromAddress.includes("onboarding@resend.dev") || fromAddress.includes(config.EMAIL_FROM),
    "getFromAddress() resolves to configured EMAIL_FROM",
    `From: ${fromAddress}`
  );

  // Secret sanitization checks
  const sampleWithKey = `Error: Authentication with re_secret_key_123456789 failed`;
  const sanitized = emailService.sanitizeSecrets(sampleWithKey);
  assert(
    !sanitized.includes("re_secret_key_123456789") && sanitized.includes("[REDACTED_API_KEY]"),
    "sanitizeSecrets() redacts Resend API keys from error messages and logs"
  );

  const statusObj = emailService.getProviderStatus();
  assert(
    statusObj.provider === "resend" && statusObj.hasResendKey === true && !JSON.stringify(statusObj).includes(config.RESEND_API_KEY),
    "getProviderStatus() reports Resend active without leaking the raw API key"
  );

  // ---------------------------------------------------------------------------
  // 2. RESEND API CONNECTION VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("\n[2] Verifying Resend API Connection...");
  const connCheck = await emailService.verifyConnection();
  assert(
    connCheck.ok === true && connCheck.provider === "resend",
    "verifyConnection() authenticates successfully with Resend API",
    connCheck.message || connCheck.error
  );

  // ---------------------------------------------------------------------------
  // 3. SECURE CRYPTOGRAPHIC EXPIRING TOKENS
  // ---------------------------------------------------------------------------
  console.log("\n[3] Testing Secure Tokens (Invitations & Password Resets)...");

  // Test Password Reset Token
  const resetEmail = "elakkiyaohai@gmail.com";
  const resetRecord = await db.createPasswordReset(resetEmail);
  assert(
    typeof resetRecord.token === "string" && resetRecord.token.length === 64,
    "Password reset token is a 64-character cryptographic hex string (crypto.randomBytes(32))"
  );
  assert(
    new Date(resetRecord.expiresAt) > new Date(Date.now() + 25 * 60 * 1000) &&
    new Date(resetRecord.expiresAt) <= new Date(Date.now() + 31 * 60 * 1000),
    "Password reset token has a 30-minute expiration window"
  );
  assert(
    resetRecord.used === false,
    "Password reset token is initialized with used: false"
  );

  // Verification via endpoint
  const verifyResetRes = await request(`/api/auth/verify-reset-token/${resetRecord.token}`);
  assert(
    verifyResetRes.status === 200 && verifyResetRes.data.valid === true,
    "GET /api/auth/verify-reset-token/:token verifies valid, active token"
  );
  assert(
    typeof verifyResetRes.data.maskedEmail === "string" && verifyResetRes.data.maskedEmail.includes("***@"),
    "Token verification returns masked email without leaking full user identity"
  );

  // Create another reset token for same email to verify previous token invalidation
  const resetRecord2 = await db.createPasswordReset(resetEmail);
  const verifyOldReset = await request(`/api/auth/verify-reset-token/${resetRecord.token}`);
  assert(
    verifyOldReset.status === 400 && verifyOldReset.data.ok === false,
    "Previous password reset token is invalidated when a new one is requested"
  );

  // Test Invitation Token
  const testInviteEmail = `test-user-${Date.now()}@example.com`;
  const inviteRecord = await db.createInvitation({
    email: testInviteEmail,
    fullName: "Resend Integration Tester",
    role: "Employee",
    actor: { id: "usr-admin-elakkiya", fullName: "Elakkiya", email: "elakkiyaohai@gmail.com", role: "Admin" },
  });
  assert(
    typeof inviteRecord.token === "string" &&
      inviteRecord.token.startsWith("inv-") &&
      inviteRecord.token.slice(4).length === 64,
    "Invitation token is a 64-character cryptographic hex string with inv- prefix (crypto.randomBytes(32))"
  );
  assert(
    new Date(inviteRecord.expiresAt) > new Date(Date.now() + 47 * 3600 * 1000) &&
    new Date(inviteRecord.expiresAt) <= new Date(Date.now() + 49 * 3600 * 1000),
    "Invitation token has a 48-hour expiration window"
  );
  assert(
    inviteRecord.status === "pending",
    "Invitation token is created in pending status"
  );

  const retrievedInvite = await db.getInvitationByToken(inviteRecord.token);
  assert(
    retrievedInvite && retrievedInvite.email === testInviteEmail.toLowerCase(),
    "getInvitationByToken() retrieves the correct invitation record"
  );

  // ---------------------------------------------------------------------------
  // 4. REAL EMAIL DELIVERY TESTING (ALL 5 REQUIRED TYPES VIA RESEND)
  // ---------------------------------------------------------------------------
  console.log("\n[4] Testing Actual Email Delivery via Resend (All 5 Types)...");
  // Note: Resend sandbox domain onboarding@resend.dev requires delivery to verified owner (elakkiyaohai@gmail.com)
  const targetRecipient = "elakkiyaohai@gmail.com";

  // Type 1: Renewal Assignment Notification
  console.log("  Testing Type 1: Renewal Assignment Notification...");
  const assignResult = await emailService.sendAssignmentNotification({
    to: targetRecipient,
    recipientName: "Elakkiya (Admin)",
    renewal: {
      id: "ren-test-assign-01",
      name: "AWS Cloud Enterprise Infrastructure",
      category: "Cloud Services",
      expiryDate: "2026-11-30",
      priority: "High",
      organization: "Amazon Web Services",
      referenceNumber: "AWS-ENT-8841",
    },
    assignedBy: "RenewalTrack Admin",
    isReassignment: false,
  });
  assert(
    assignResult.success === true && assignResult.provider === "resend",
    "Type 1: Renewal Assignment email delivered via Resend API",
    `Message ID: ${assignResult.messageId || "N/A"}`
  );
  assert(
    typeof assignResult.messageId === "string" && assignResult.messageId.length > 10,
    "Type 1: Real Resend Message ID returned for Renewal Assignment email"
  );

  // Type 2: Team Member Invitation
  console.log("  Testing Type 2: Team Member Invitation...");
  const inviteResult = await emailService.sendInvitationEmail({
    to: targetRecipient,
    fullName: "Elakkiya Ohai",
    role: "Employee",
    inviteUrl: `http://localhost:3000/register.html?invite=${inviteRecord.token}`,
    invitedBy: "RenewalTrack Team Admin",
  });
  assert(
    inviteResult.success === true && inviteResult.provider === "resend",
    "Type 2: Team Invitation email delivered via Resend API",
    `Message ID: ${inviteResult.messageId || "N/A"}`
  );
  assert(
    typeof inviteResult.messageId === "string" && inviteResult.messageId.length > 10,
    "Type 2: Real Resend Message ID returned for Team Invitation email"
  );

  // Type 3: Password Reset
  console.log("  Testing Type 3: Password Reset Email...");
  const resetResult = await emailService.sendPasswordResetEmail({
    to: targetRecipient,
    fullName: "Elakkiya",
    resetUrl: `http://localhost:3000/reset-password.html?token=${resetRecord2.token}`,
    expiresMinutes: 30,
  });
  assert(
    resetResult.success === true && resetResult.provider === "resend",
    "Type 3: Password Reset email delivered via Resend API",
    `Message ID: ${resetResult.messageId || "N/A"}`
  );
  assert(
    typeof resetResult.messageId === "string" && resetResult.messageId.length > 10,
    "Type 3: Real Resend Message ID returned for Password Reset email"
  );

  // Type 4: Invitation Acceptance Confirmation
  console.log("  Testing Type 4: Invitation Acceptance Confirmation...");
  const acceptanceResult = await emailService.sendInvitationAcceptanceNotification({
    to: targetRecipient,
    adminName: "Elakkiya (Admin)",
    memberName: "Alex Mercer",
    memberEmail: "alex.mercer@company.com",
    role: "Employee",
    acceptedAt: new Date().toISOString(),
  });
  assert(
    acceptanceResult.success === true && acceptanceResult.provider === "resend",
    "Type 4: Invitation Acceptance Confirmation delivered via Resend API",
    `Message ID: ${acceptanceResult.messageId || "N/A"}`
  );
  assert(
    typeof acceptanceResult.messageId === "string" && acceptanceResult.messageId.length > 10,
    "Type 4: Real Resend Message ID returned for Acceptance Confirmation email"
  );

  // Type 5: Renewal Expiry Reminder
  console.log("  Testing Type 5: Renewal Expiry Reminder...");
  const reminderResult = await emailService.sendReminderEmail({
    renewal: {
      id: "ren-test-reminder-01",
      name: "Datadog APM Enterprise Monitoring",
      category: "Software & SaaS",
      expiryDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      priority: "High",
      organization: "Datadog Inc.",
      cost: 14200,
      currency: "USD",
      referenceNumber: "DD-APM-2026",
      notes: "Critical infrastructure monitoring contract renewal approaching.",
    },
    recipientEmail: targetRecipient,
    recipientName: "Elakkiya",
    daysRemaining: 7,
    interval: "7_days",
  });
  assert(
    reminderResult.success === true && reminderResult.provider === "resend",
    "Type 5: Renewal Expiry Reminder email delivered via Resend API",
    `Message ID: ${reminderResult.messageId || "N/A"}`
  );
  assert(
    typeof reminderResult.messageId === "string" && reminderResult.messageId.length > 10,
    "Type 5: Real Resend Message ID returned for Renewal Reminder email"
  );

  // ---------------------------------------------------------------------------
  // 5. ERROR HANDLING & VALIDATION
  // ---------------------------------------------------------------------------
  console.log("\n[5] Testing Error Handling, Validation, and Secret Redaction...");

  // Invalid email format test
  const invalidEmailResult = await emailService.sendReminderEmail({
    renewal: { id: "ren-bad", name: "Bad Email Test" },
    recipientEmail: "not-an-email-address",
    recipientName: "Invalid User",
    daysRemaining: 5,
    interval: "5_days",
  });
  assert(
    invalidEmailResult.success === false && invalidEmailResult.isInvalidEmail === true,
    "Rejects invalid email format without crash or unhandled rejection"
  );

  // Resend API restriction / delivery error handling
  // Sending to an unverified third party email in sandbox produces 403 validation_error
  const thirdPartyResult = await emailService._sendViaResend({
    from: emailService.getFromAddress(),
    to: "some-unverified-external-recipient-992@example.com",
    subject: "Resend Domain Validation Test",
    html: "<p>Test</p>",
    text: "Test",
    renewal: { name: "Third Party Test" },
  });
  assert(
    thirdPartyResult.success === false && thirdPartyResult.provider === "resend",
    "Handles Resend API sandbox / unverified domain errors gracefully"
  );
  assert(
    !thirdPartyResult.error.includes(config.RESEND_API_KEY),
    "Delivery error message does not expose raw RESEND_API_KEY"
  );

  // ---------------------------------------------------------------------------
  // 6. END-TO-END BACKEND API ROUTES
  // ---------------------------------------------------------------------------
  console.log("\n[6] Testing Backend End-to-End API Routes with Resend Integration...");

  // Login as Admin
  const loginRes = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "elakkiyaohai@gmail.com", password: "Admin@1234" }),
  });
  assert(loginRes.status === 200, "Admin login successful", `Status: ${loginRes.status}`);
  const adminToken = loginRes.data && loginRes.data.token;

  // Forgot password API route
  const forgotRes = await request("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: "elakkiyaohai@gmail.com" }),
  });
  assert(
    forgotRes.status === 200 && forgotRes.data.ok === true,
    "POST /api/auth/forgot-password dispatches password reset email via Resend"
  );
  assert(
    forgotRes.data.emailSent === true,
    "POST /api/auth/forgot-password confirms emailSent: true"
  );

  // Fetch active assignees to get a valid employee ID
  const assigneesRes = await request("/api/renewals/assignees", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    assigneesRes.status === 200 && Array.isArray(assigneesRes.data.data) && assigneesRes.data.data.length > 0,
    "GET /api/renewals/assignees returns active employees"
  );
  const activeEmployee = assigneesRes.data.data[0];

  // Create renewal and assign to active employee to test API route assignment notification
  const createRenewalRes = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `Resend Integration Renewal Test ${Date.now()}`,
      category: "Software License",
      expiryDate: "2026-12-31",
      priority: "High",
      assignedToId: activeEmployee.id,
      cost: 9500,
      currency: "USD",
    }),
  });
  assert(
    createRenewalRes.status === 201 && createRenewalRes.data && createRenewalRes.data.ok === true,
    "POST /api/renewals creates renewal record assigned to active employee",
    `Status: ${createRenewalRes.status}, Data: ${JSON.stringify(createRenewalRes.data)}`
  );

  assert(
    createRenewalRes.data && createRenewalRes.data.emailNotification &&
      createRenewalRes.data.emailNotification.provider === "resend",
    "POST /api/renewals triggers assignment email notification through Resend API",
    `Provider: ${createRenewalRes.data && createRenewalRes.data.emailNotification ? createRenewalRes.data.emailNotification.provider : "none"}`
  );

  // Test reassignment via PUT /api/renewals/:id
  const createdRenewalId = createRenewalRes.data && createRenewalRes.data.data && createRenewalRes.data.data.id;
  if (createdRenewalId) {
    const secondEmployee = assigneesRes.data.data[1] || activeEmployee;
    const reassignRes = await request(`/api/renewals/${createdRenewalId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        assignedToId: secondEmployee.id,
      }),
    });
    assert(
      reassignRes.status === 200 && reassignRes.data && reassignRes.data.ok === true,
      "PUT /api/renewals/:id succeeds and updates assignee",
      `Status: ${reassignRes.status}, Data: ${JSON.stringify(reassignRes.data)}`
    );
    assert(
      reassignRes.data && reassignRes.data.emailNotification &&
        reassignRes.data.emailNotification.provider === "resend",
      "PUT /api/renewals/:id dispatches assignment notification through Resend API",
      `Provider: ${reassignRes.data && reassignRes.data.emailNotification ? reassignRes.data.emailNotification.provider : "none"}`
    );

    // Cleanup: delete test renewal
    await request(`/api/renewals/${createdRenewalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  } else {
    assert(false, "Cannot test reassignment because renewal creation failed");
  }

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(`  Tests Passed: ${passedCount}`);
  console.log(`  Tests Failed: ${failedCount}`);
  console.log(`  Pass Rate:    ${Math.round((passedCount / (passedCount + failedCount)) * 100)}%`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
