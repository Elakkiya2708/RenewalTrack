/* ==========================================================================
   test_delivery_failure_alerts.js — Automated Verification Test Suite
   Verifies:
   1. Real delivery failure alert dispatched to elakkiyaohai@gmail.com on assignment failure
   2. Resend API error capture and sanitized reason inclusion
   3. Resend delivery webhooks (/api/webhooks/resend) for bounce & failure
   4. Duplicate alert suppression within deduplication window
   5. Infinite loop prevention circuit breaker on alert failures
   6. Fallback logging to Admin Audit Logs (with zero secrets exposed)
   7. Querying failure records via GET /api/audit/logs
   ========================================================================== */

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
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function runTests() {
  console.log("\n================================================================================");
  console.log("  RenewalTrack: Email Delivery Failure Alerts & Webhook Test Suite               ");
  console.log("================================================================================\n");

  const emailService = require("./backend/emailService");
  const db = require("./backend/db");
  const config = require("./backend/config");

  // Clear cache for clean test run
  emailService.clearAlertDeduplicationCache();

  // 1. Authenticate Admin
  console.log("[1] Authenticating Admin user...");
  const loginRes = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "elakkiya270806@gmail.com", password: "Admin@1234" }),
  });
  assert(loginRes.status === 200, "Admin login successful", `Status: ${loginRes.status}`);
  const adminToken = loginRes.data && loginRes.data.token;
  assert(Boolean(adminToken), "Admin token received");

  // 2. Test Secret Sanitization Helper
  console.log("\n[2] Testing Secret Sanitization (No credentials exposed)...");
  const rawSecretMsg = "Resend API call failed using key re_4t6mALaK_secret1234567890 with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 and password=SuperSecretPassword!";
  const sanitized = emailService.sanitizeSecrets(rawSecretMsg);
  assert(!sanitized.includes("re_4t6mALaK_secret1234567890"), "Resend API key is redacted");
  assert(sanitized.includes("[REDACTED_API_KEY]"), "Redacted key placeholder present");
  assert(!sanitized.includes("SuperSecretPassword"), "Password is redacted");
  assert(sanitized.includes("Bearer [REDACTED_TOKEN]"), "Bearer token is redacted");

  // 3. Test Employee Assignment Email Failure Alert (Real API Execution)
  console.log("\n[3] Testing Employee Assignment Delivery Failure Alert to Admin...");
  const testRenewal = {
    id: "ren-fail-test-" + Date.now(),
    name: "Enterprise Cloudflare SSL Certificate",
    category: "Security",
    expiryDate: "2026-12-31",
    priority: "High",
  };

  // Dispatch assignment email to invalid/unroutable recipient (guaranteed delivery failure across all providers)
  const invalidEmail = "david.kim-unroutable@invalid";
  const assignResult = await emailService.sendAssignmentNotification({
    to: invalidEmail,
    recipientName: "David Kim",
    renewal: testRenewal,
    assignedBy: "Elakkiya (Admin)",
    isReassignment: false,
  });

  // Verify assignment email failed as expected
  assert(assignResult.success === false, "Employee assignment email correctly failed for unverified domain recipient");
  assert(Boolean(assignResult.error), "Error reason was captured from email provider error");

  // Verify Audit Log has EMAIL_DELIVERY_FAILURE
  const recentLogs = await db.getAuditLogs({ limit: 10, action: "EMAIL_DELIVERY_FAILURE" });
  assert(recentLogs.length > 0, "Audit Log recorded EMAIL_DELIVERY_FAILURE entry");
  const latestFailure = recentLogs[0];
  assert(latestFailure.details.includes("David Kim") || latestFailure.details.includes(invalidEmail), "Audit Log contains employee details");
  assert(latestFailure.details.includes("Enterprise Cloudflare SSL Certificate"), "Audit Log contains renewal name");
  assert(!latestFailure.details.includes("re_"), "Audit Log contains ZERO plaintext Resend API keys");

  // 4. Test Duplicate Alert Suppression (15-Minute Dedup Window)
  console.log("\n[4] Testing Duplicate Alert Suppression...");
  const duplicateAlertResult = await emailService.notifyDeliveryFailure({
    recipientEmail: invalidEmail,
    recipientName: "David Kim",
    employeeDetails: { name: "David Kim", email: invalidEmail, role: "Employee" },
    renewalName: testRenewal.name,
    failureTime: new Date().toISOString(),
    reason: assignResult.error,
    emailType: "Renewal Assignment",
  });
  assert(duplicateAlertResult.duplicateSuppressed === true, "Duplicate failure alert was suppressed within deduplication window");
  assert(duplicateAlertResult.success === true, "Suppressed duplicate returned success status");

  // 5. Test Resend Delivery Webhook Endpoint (/api/webhooks/resend)
  console.log("\n[5] Testing Resend Delivery Webhook Endpoints...");
  const webhookStatus = await request("/api/webhooks/status");
  assert(webhookStatus.status === 200, "GET /api/webhooks/status returned 200 OK");
  assert(webhookStatus.data && webhookStatus.data.ok === true, "Webhook listener is active");
  assert(webhookStatus.data.alertTarget === "elakkiya270806@gmail.com", "Webhook alert target is elakkiya270806@gmail.com");

  // Test email.bounced webhook event
  emailService.clearAlertDeduplicationCache(); // reset cache for unique test
  const bounceWebhookPayload = {
    type: "email.bounced",
    created_at: new Date().toISOString(),
    data: {
      email_id: "res-test-bounce-123",
      from: "RenewalTrack Alerts <onboarding@resend.dev>",
      to: ["raja@renewaltrack.com"],
      subject: "Renewal Assigned: AWS Production Infrastructure",
      bounce: {
        type: "Permanent",
        message: "550 5.1.1 Recipient mailbox unavailable or user unknown",
      },
    },
  };

  const bounceRes = await request("/api/webhooks/resend", {
    method: "POST",
    body: JSON.stringify(bounceWebhookPayload),
  });
  assert(bounceRes.status === 200, "POST /api/webhooks/resend accepted email.bounced event");
  assert(bounceRes.data && bounceRes.data.ok === true, "Webhook event processed successfully");

  // Verify bounce audit log
  const bounceLogs = await db.getAuditLogs({ limit: 10, search: "raja@renewaltrack.com" });
  assert(bounceLogs.length > 0, "Webhook bounce event recorded in Audit Logs");
  assert(bounceLogs[0].details.includes("AWS Production Infrastructure"), "Webhook audit log contains renewal name from subject");
  assert(bounceLogs[0].details.includes("Bounced (Permanent)"), "Webhook audit log contains bounce reason");

  // Test email.failed webhook event
  emailService.clearAlertDeduplicationCache();
  const failedWebhookPayload = {
    type: "email.failed",
    created_at: new Date().toISOString(),
    data: {
      email_id: "res-test-failed-456",
      to: ["inactive.employee@renewaltrack.com"],
      subject: "Renewal Reminder: GitHub Enterprise Subscription",
      error: {
        message: "Network connection refused by MX host",
      },
    },
  };

  const failedRes = await request("/api/webhooks/resend", {
    method: "POST",
    body: JSON.stringify(failedWebhookPayload),
  });
  assert(failedRes.status === 200, "POST /api/webhooks/resend accepted email.failed event");

  // 6. Test Infinite Retry & Recursion Circuit Breaker
  console.log("\n[6] Testing Infinite Retry Circuit Breaker & Fail-Safe Fallback...");
  // Attempting to alert on an alert failure must not recurse
  const breakerResult = await emailService.notifyDeliveryFailure({
    recipientEmail: "elakkiyaohai@gmail.com", // recipient is admin herself
    recipientName: "Elakkiya",
    renewalName: "Loop Prevention Test",
    reason: "Delivery dropped",
    context: { isAlertEmail: true },
  });
  assert(breakerResult.loopPrevented === true, "Circuit breaker tripped to prevent infinite alert recursion");
  assert(breakerResult.loggedToAudit === true, "Recursion attempt logged directly to Audit Logs");

  // Verify EMAIL_ALERT_FAILED logged
  const alertFailedLogs = await db.getAuditLogs({ limit: 5, action: "EMAIL_ALERT_FAILED" });
  assert(alertFailedLogs.length > 0, "EMAIL_ALERT_FAILED audit log recorded fail-safe entry");

  // 7. Verify Admin Audit Logs API Filter (/api/audit/logs)
  console.log("\n[7] Querying Admin Audit Logs via REST API...");
  const auditApiRes = await request("/api/audit/logs?limit=50", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(auditApiRes.status === 200, "GET /api/audit/logs returned 200 OK");
  const allLogs = auditApiRes.data && auditApiRes.data.data;
  assert(Array.isArray(allLogs), "Audit logs list returned as array");
  const emailFailureLogs = allLogs.filter((l) => (l.action || "").includes("EMAIL"));
  assert(emailFailureLogs.length >= 2, "Admin can view Email Delivery Failure logs via API", `Found: ${emailFailureLogs.length}`);

  console.log("\n================================================================================");
  console.log(`  Test Results: ${passedCount} Passed / ${failedCount} Failed (${failedCount === 0 ? "100% Success" : "Failures detected"})`);
  console.log("================================================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
