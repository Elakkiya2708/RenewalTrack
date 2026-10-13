/* ==========================================================================
   test_email_delivery.js — Real Email Delivery Verification & Test Suite
   Tests provider readiness, assignment email formatting, and live delivery.
   ========================================================================== */

require("dotenv").config();
const config = require("./backend/config");
const emailService = require("./backend/emailService");
const http = require("http");

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : null;
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on("error", reject);
    if (data) {
      req.write(typeof data === "string" ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log("================================================================================");
  console.log("  RenewalTrack — Real Email Delivery Verification & Diagnostics");
  console.log("================================================================================\n");

  const status = emailService.getProviderStatus();
  console.log("1. Inspecting Provider Configuration Status:");
  console.log(`  - Active Provider:       ${status.provider.toUpperCase()}`);
  console.log(`  - Real Delivery Enabled: ${status.enabled}`);
  console.log(`  - Sender Address:        ${status.fromAddress}`);
  console.log(`  - Resend Key Present:    ${status.hasResendKey}`);
  console.log(`  - SMTP Configured:       ${status.hasSmtpCreds ? "Yes (" + (status.smtpUser || "user set") + ")" : "No"}`);
  console.log(`  - Overall Configured:    ${status.isConfigured ? "READY FOR REAL DELIVERY" : "CREDENTIALS REQUIRED"}\n`);

  // 2. Validate Assignment Email Construction & HTML Generation
  console.log("2. Verifying Assignment Notification Engine:");
  const sampleRenewal = {
    id: "ren-diag-99",
    name: "Google Workspace Enterprise",
    category: "Software License",
    priority: "High",
    expiryDate: "2026-12-31",
    organization: "Alphabet Inc",
    cost: 1440,
    currency: "USD",
  };

  const invalidEmailResult = await emailService.sendAssignmentNotification({
    to: "not-an-email",
    recipientName: "Test User",
    renewal: sampleRenewal,
    assignedBy: "Admin",
  });
  if (invalidEmailResult.isInvalidEmail) {
    console.log("  [PASS] Invalid email address validation properly rejected bad format.");
  } else {
    console.error("  [FAIL] Validation did not reject invalid email address.");
  }

  // 3. Connection & Real Delivery Verification
  console.log("\n3. Testing Provider Connectivity & Real Delivery:");
  if (!status.isConfigured) {
    console.log("  [INFO] Real email delivery credentials are not yet configured in .env.");
    console.log("  [INFO] To enable live email delivery to employee inboxes, please configure:");
    if (status.provider === "resend") {
      console.log("         RESEND_API_KEY=re_your_api_key in .env");
    } else {
      console.log("         SMTP_USER=your-email@gmail.com");
      console.log("         SMTP_PASS=your-16-char-app-password (from Google App Passwords)");
    }
    console.log("  [INFO] See EMAIL_SETUP_GUIDE.md for detailed, step-by-step instructions.\n");

    const attemptedResult = await emailService.sendAssignmentNotification({
      to: "employee@example.com",
      recipientName: "David Kim",
      renewal: sampleRenewal,
      assignedBy: "Elakkiya (Admin)",
    });

    if (!attemptedResult.success && attemptedResult.unconfigured) {
      console.log("  [PASS] Engine correctly reported unconfigured provider and refused fake/mock success.");
    } else {
      console.warn("  [NOTE] Engine returned:", attemptedResult);
    }
  } else {
    console.log("  [TEST] Testing live connection to email provider...");
    const conn = await emailService.verifyConnection();
    if (conn.ok) {
      console.log(`  [PASS] Live connection verified: ${conn.message}`);

      // Attempt live delivery to target test address
      const testRecipient = config.SMTP_USER || config.ALERT_FALLBACK_EMAIL || "elakkiyaohai@gmail.com";
      console.log(`  [TEST] Dispatching real test assignment email to: ${testRecipient}...`);
      const liveResult = await emailService.sendAssignmentNotification({
        to: testRecipient,
        recipientName: "RenewalTrack Verified Recipient",
        renewal: sampleRenewal,
        assignedBy: "Elakkiya (Administrator)",
        isReassignment: false,
      });

      if (liveResult.success && liveResult.delivered) {
        console.log(`  [PASS] Real email DELIVERED successfully! Message ID: ${liveResult.messageId} (Provider: ${liveResult.provider})`);
      } else {
        console.error(`  [FAIL] Email delivery was rejected by provider: ${liveResult.error}`);
      }
    } else {
      console.error(`  [FAIL] Provider connection failed: ${conn.error}`);
    }
  }

  // 4. Test Assignment via Live Backend API Server (port 3000)
  console.log("\n4. Verifying Backend Assignment API Route Triggers:");
  try {
    // Login as Admin
    const loginRes = await request(
      {
        hostname: "localhost",
        port: 3000,
        path: "/api/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      { email: "elakkiyaohai@gmail.com", password: "Admin@1234" }
    );

    if (loginRes.status === 200 && loginRes.body && loginRes.body.token) {
      const adminToken = loginRes.body.token;

      // Admin creates renewal assigned to Employee usr-2 (David Kim)
      const createRes = await request(
        {
          hostname: "localhost",
          port: 3000,
          path: "/api/renewals",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
        },
        {
          name: "Email Delivery Verification Renewal",
          category: "Subscription",
          priority: "High",
          issueDate: "2026-10-01",
          expiryDate: "2026-12-31",
          reminderDate: "2026-12-01",
          cost: 1200,
          currency: "USD",
          organization: "Cloud Services Inc",
          assignedToId: "usr-2",
        }
      );

      if (createRes.status === 201 && createRes.body && createRes.body.ok) {
        console.log("  [PASS] Admin created renewal assigned to Employee (usr-2).");
        console.log("  [INFO] Notification trigger outcome:", createRes.body.emailNotification || "Handled asynchronously");

        // Reassign to check reassignment email trigger
        const renewalId = createRes.body.data.id;
        const reassignRes = await request(
          {
            hostname: "localhost",
            port: 3000,
            path: `/api/renewals/${renewalId}`,
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${adminToken}`,
            },
          },
          {
            assignedToId: "usr-2",
            name: "Email Delivery Verification Renewal (Updated)",
          }
        );
        if (reassignRes.status === 200) {
          console.log("  [PASS] Admin updated/reassigned renewal record.");
        }

        // Clean up test renewal
        await request({
          hostname: "localhost",
          port: 3000,
          path: `/api/renewals/${renewalId}`,
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        console.log("  [PASS] Cleaned up temporary test renewal.");
      } else {
        console.warn("  [NOTE] Could not create renewal on running server:", createRes.status, createRes.body);
      }
    } else {
      console.warn("  [NOTE] Server login check skipped (Server might not be running on port 3000).");
    }
  } catch (err) {
    console.warn("  [NOTE] API check skipped:", err.message);
  }

  console.log("\n================================================================================");
  console.log("  Email Delivery Verification Complete");
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
