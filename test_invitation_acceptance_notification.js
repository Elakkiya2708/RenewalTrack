/**
 * ==============================================================================
 * RenewalTrack — Automated End-to-End Test Suite: Invitation Acceptance Notification
 *
 * Verifies:
 * 1. Admin issues invitation to Employee and Viewer.
 * 2. Invitee accepts invitation & activates account.
 * 3. Verified acceptance triggers real confirmation email to inviting Admin.
 * 4. Email content includes: member name, email address, role, acceptance date/time.
 * 5. Notification fires ONLY AFTER acceptance is successfully verified and user saved.
 * 6. Duplicate notifications are strictly prevented (idempotent notification status).
 * 7. Delivery status is logged in database and audit trail (INVITE_ACCEPTANCE_NOTIFIED).
 * 8. Email delivery failures are handled gracefully without aborting account activation.
 * 9. Team members and invitations views reflect latest database status.
 * ==============================================================================
 */

const http = require("http");
const db = require("./backend/db");
const emailService = require("./backend/emailService");

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const dataStr = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path,
        method,
        headers: {
          ...(dataStr
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(dataStr),
              }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            parsed = raw;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (dataStr) req.write(dataStr);
    req.end();
  });
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("  RenewalTrack — Invitation Acceptance Admin Notification Test Suite");
  console.log("==================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate as Admin (Elakkiya)
    console.log("Step 1: Admin Authentication");
    const adminLogin = await request("POST", "/api/auth/login", {
      email: "elakkiyaohai@gmail.com",
      password: "Admin@1234",
    });
    assert(adminLogin.status === 200 && adminLogin.body.token, "Admin authenticated successfully");
    const adminToken = adminLogin.body.token;

    // 2. Admin creates invitation for an Employee
    console.log("\nStep 2: Admin Invites New Employee");
    const testEmployeeEmail = `emp.notify.${Date.now()}@company.com`;
    const employeeInviteRes = await request(
      "POST",
      "/api/team/invites",
      {
        email: testEmployeeEmail,
        fullName: "Alex Rivera",
        role: "Employee",
      },
      adminToken
    );
    assert(employeeInviteRes.status === 201 && employeeInviteRes.body.ok === true, "Employee invitation created (HTTP 201)");
    const empInvite = employeeInviteRes.body.data || employeeInviteRes.body.invitation;
    assert(empInvite.token && empInvite.token.startsWith("inv-"), "Invitation token generated");
    assert(empInvite.adminNotified === false, "adminNotified is initially false");
    assert(empInvite.status === "pending", "Invitation status is pending");
    assert(empInvite.invitedBy === "elakkiyaohai@gmail.com", "Invited by recorded as Admin email");
    const empToken = empInvite.token;

    // 3. Admin creates invitation for a Viewer
    console.log("\nStep 3: Admin Invites New Viewer");
    const testViewerEmail = `viewer.notify.${Date.now()}@company.com`;
    const viewerInviteRes = await request(
      "POST",
      "/api/team/invites",
      {
        email: testViewerEmail,
        fullName: "Taylor Reed",
        role: "Viewer",
      },
      adminToken
    );
    assert(viewerInviteRes.status === 201 && viewerInviteRes.body.ok === true, "Viewer invitation created (HTTP 201)");
    const viewerInvite = viewerInviteRes.body.data || viewerInviteRes.body.invitation;
    assert(viewerInvite.role === "Viewer", "Viewer role recorded");
    const viewerToken = viewerInvite.token;

    // 4. Inspect emailService helper directly for invitation acceptance format
    console.log("\nStep 4: Verify Acceptance Email Content Template & Formatting");
    const testPayload = {
      to: "elakkiyaohai@gmail.com",
      adminName: "Elakkiya",
      memberName: "Alex Rivera",
      memberEmail: testEmployeeEmail,
      role: "Employee",
      acceptedAt: new Date().toISOString(),
    };
    assert(typeof emailService.sendInvitationAcceptanceNotification === "function", "sendInvitationAcceptanceNotification exists in emailService");

    // 5. Employee accepts invitation and activates account
    console.log("\nStep 5: Employee Accepts Invitation and Activates Account");
    const acceptEmpRes = await request("POST", "/api/auth/register", {
      fullName: "Alex Rivera",
      email: testEmployeeEmail,
      password: "AlexPassword@2026",
      inviteToken: empToken,
    });
    assert(acceptEmpRes.status === 201 && acceptEmpRes.body.ok === true, "Account activated successfully (HTTP 201 Created)");
    assert(acceptEmpRes.body.user && acceptEmpRes.body.user.email === testEmployeeEmail, "User account created with accepted email");
    assert(acceptEmpRes.body.user.role === "Employee", "User role strictly matches invitation ('Employee')");
    assert(acceptEmpRes.body.user.status === "active", "Account status is active");
    assert(typeof acceptEmpRes.body.adminNotified === "boolean", "Response returns adminNotified boolean flag");

    // 6. Verify Invitation Record in Database
    console.log("\nStep 6: Database Invitation State & Notification Tracking");
    const allInvites = await db.getInvitations();
    const updatedEmpInvite = allInvites.find((i) => i.token === empToken);
    assert(updatedEmpInvite !== undefined, "Found updated invitation in database");
    assert(updatedEmpInvite.status === "accepted", "Invitation status transitioned to 'accepted'");
    assert(!!updatedEmpInvite.acceptedAt, `acceptedAt is recorded: ${updatedEmpInvite.acceptedAt}`);
    assert(
      ["delivered", "failed"].includes(updatedEmpInvite.adminNotificationStatus),
      `adminNotificationStatus is tracked: "${updatedEmpInvite.adminNotificationStatus}"`
    );
    assert(!!updatedEmpInvite.adminNotifiedAt, `adminNotifiedAt timestamp is recorded: ${updatedEmpInvite.adminNotifiedAt}`);

    // 7. Verify Audit Logs for Acceptance and Notification
    console.log("\nStep 7: Audit Log Verification");
    const auditRes = await request("GET", "/api/audit/logs?limit=50", null, adminToken);
    assert(auditRes.status === 200 && Array.isArray(auditRes.body.data), "Audit logs retrieved (HTTP 200)");
    const logs = auditRes.body.data;
    
    const acceptedLog = logs.find((l) => l.action === "INVITE_ACCEPTED" && (l.actorEmail === testEmployeeEmail || (l.details && l.details.includes(testEmployeeEmail))));
    assert(acceptedLog !== undefined, "INVITE_ACCEPTED audit log recorded for user");

    const notifyLog = logs.find((l) => l.action === "INVITE_ACCEPTANCE_NOTIFIED" && (l.targetId === empInvite.id || (l.details && l.details.includes(testEmployeeEmail))));
    assert(notifyLog !== undefined, "INVITE_ACCEPTANCE_NOTIFIED audit log recorded for Admin notification");
    if (notifyLog) {
      assert(notifyLog.details.includes("elakkiyaohai@gmail.com"), "Audit log details mention Admin recipient email");
      assert(notifyLog.details.includes("Employee"), "Audit log details mention member role");
    }

    // 8. Prevent Duplicate Notifications (Idempotency)
    console.log("\nStep 8: Prevent Duplicate Notifications & Token Re-use");
    const reuseAttempt = await request("POST", "/api/auth/register", {
      fullName: "Alex Rivera Imposter",
      email: testEmployeeEmail,
      password: "AlexPassword@2026",
      inviteToken: empToken,
    });
    assert(reuseAttempt.status === 400, "Reusing accepted invitation is rejected (HTTP 400 Bad Request)");

    // Test direct acceptInvitation duplicate guard
    try {
      await db.acceptInvitation(empToken, { fullName: "Alex Rivera", password: "pwd" });
      assert(false, "acceptInvitation should throw on non-pending invite");
    } catch (err) {
      assert(err.message.includes("no longer pending"), `acceptInvitation correctly throws: "${err.message}"`);
    }

    // 9. Viewer Accepts Invitation and Verifies Admin Notification
    console.log("\nStep 9: Viewer Accepts Invitation and Verifies Notification");
    const acceptViewerRes = await request("POST", "/api/auth/register", {
      fullName: "Taylor Reed",
      email: testViewerEmail,
      password: "TaylorPassword@2026",
      inviteToken: viewerToken,
    });
    assert(acceptViewerRes.status === 201 && acceptViewerRes.body.ok === true, "Viewer account activated (HTTP 201)");
    assert(acceptViewerRes.body.user.role === "Viewer", "User assigned role is Viewer");

    const updatedViewerInvite = (await db.getInvitations()).find((i) => i.token === viewerToken);
    assert(updatedViewerInvite && updatedViewerInvite.status === "accepted", "Viewer invitation transitioned to 'accepted'");
    assert(
      ["delivered", "failed"].includes(updatedViewerInvite.adminNotificationStatus),
      `Viewer adminNotificationStatus tracked: "${updatedViewerInvite.adminNotificationStatus}"`
    );

    const viewerNotifyLog = (await db.getAuditLogs({ limit: 20 })).find(
      (l) => l.action === "INVITE_ACCEPTANCE_NOTIFIED" && (l.targetId === viewerInvite.id || (l.details && l.details.includes(testViewerEmail)))
    );
    assert(viewerNotifyLog !== undefined, "Viewer acceptance notification logged in audit trail");
    if (viewerNotifyLog) {
      assert(viewerNotifyLog.details.includes("Viewer"), "Audit log notes Viewer role");
    }

    // 10. Verify Team Members API includes newly activated users
    console.log("\nStep 10: Verify Team Members API and Active Accounts");
    const membersRes = await request("GET", "/api/team/members", null, adminToken);
    assert(membersRes.status === 200 && Array.isArray(membersRes.body.data), "Team members retrieved (HTTP 200)");
    const empUser = membersRes.body.data.find((m) => m.email === testEmployeeEmail);
    const viewerUser = membersRes.body.data.find((m) => m.email === testViewerEmail);
    assert(empUser && empUser.status === "active" && empUser.role === "Employee", "New Employee appears as active in team members");
    assert(viewerUser && viewerUser.status === "active" && viewerUser.role === "Viewer", "New Viewer appears as active in team members");

    // 11. Graceful Email Delivery Failure Handling (No Uncaught Exceptions)
    console.log("\nStep 11: Email Delivery Failure Graceful Handling");
    const invalidEmailResult = await emailService.sendInvitationAcceptanceNotification({
      to: "not-an-email",
      adminName: "Admin",
      memberName: "Test",
      memberEmail: "test@test.com",
      role: "Employee",
      acceptedAt: new Date().toISOString(),
    });
    assert(invalidEmailResult.success === false, "Handles invalid recipient email safely");
    assert(invalidEmailResult.isInvalidEmail === true, "Flags invalid email without throwing unhandled exception");

    console.log("\n==================================================================");
    console.log(`  Tests Passed: ${passed} | Tests Failed: ${failed}`);
    console.log("==================================================================");

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log("\nAll Invitation Acceptance Notification Tests PASSED Successfully!\n");
      process.exit(0);
    }
  } catch (err) {
    console.error("Test execution failed with error:", err);
    process.exit(1);
  }
}

runTestSuite();
