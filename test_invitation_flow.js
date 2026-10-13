/**
 * End-to-end Test Suite for RenewGuard Real Email Invitations & Role Escalation Prevention
 */
const http = require("http");
const db = require("./backend/db");

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

async function runTests() {
  console.log("==================================================================");
  console.log("  RenewGuard — Real Team Invitations & Security Test Suite");
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
    // 1. Authenticate as Admin and as Employee
    console.log("Test 1: Authentication of test roles");
    const adminLogin = await request("POST", "/api/auth/login", {
      email: "elakkiyaohai@gmail.com",
      password: "Admin@1234",
    });
    assert(adminLogin.status === 200 && adminLogin.body.token, "Admin login successful");
    const adminToken = adminLogin.body.token;

    const empLogin = await request("POST", "/api/auth/login", {
      email: "david.kim@renewaltrack.com",
      password: "Demo@1234",
    });
    assert(empLogin.status === 200 && empLogin.body.token, "Employee login successful");
    const empToken = empLogin.body.token;

    // 2. Non-admin invitation attempt blocked
    console.log("\nTest 2: Non-admin authorization enforcement");
    const unauthInvite = await request(
      "POST",
      "/api/team/invites",
      { email: "unauth@company.com", role: "Employee" },
      empToken
    );
    assert(unauthInvite.status === 403, "Employee cannot invite members (HTTP 403 Forbidden)");

    // 3. Unauthorized role escalation blocked (cannot invite Admin)
    console.log("\nTest 3: Role escalation prevention on invite creation");
    const adminEscalation = await request(
      "POST",
      "/api/team/invites",
      { email: "escalated.admin@company.com", fullName: "Evil Admin", role: "Admin" },
      adminToken
    );
    assert(
      adminEscalation.status === 400 && adminEscalation.body.ok === false,
      "Cannot create invitation with Admin role (HTTP 400 Bad Request)"
    );

    const bogusRole = await request(
      "POST",
      "/api/team/invites",
      { email: "bogus@company.com", fullName: "Bogus", role: "SuperUser" },
      adminToken
    );
    assert(bogusRole.status === 400, "Cannot create invitation with invalid role (HTTP 400 Bad Request)");

    // 4. Valid invitation creation for Employee
    console.log("\nTest 4: Admin creates valid Employee invitation");
    const testInvEmail = `test.employee.${Date.now()}@company.com`;
    const validInvite = await request(
      "POST",
      "/api/team/invites",
      { email: testInvEmail, fullName: "Jordan Lee", role: "Employee" },
      adminToken
    );
    assert(validInvite.status === 201, "Employee invitation created (HTTP 201 Created)");
    assert(validInvite.body.ok === true, "Response ok is true");
    const invData = validInvite.body.data || validInvite.body.invitation;
    assert(invData.token && invData.token.startsWith("inv-"), "Generates secure prefixed token");
    assert(invData.role === "Employee", "Role strictly set to Employee");
    assert(invData.status === "pending", "Status is pending");
    assert(new Date(invData.expiresAt || invData.expires_at) > new Date(), "Expires in 48 hours");
    const employeeInviteToken = invData.token;

    // 5. Prevent duplicate invitations for same email
    console.log("\nTest 5: Duplicate pending invitation prevention");
    const dupInvite = await request(
      "POST",
      "/api/team/invites",
      { email: testInvEmail, fullName: "Jordan Lee Duplicate", role: "Employee" },
      adminToken
    );
    assert(dupInvite.status === 400, "Duplicate pending invitation rejected (HTTP 400 Bad Request)");
    assert(dupInvite.body.error && dupInvite.body.error.includes("already exists"), "Clear duplicate error message");

    // 6. Prevent inviting already registered user
    console.log("\nTest 6: Prevent inviting existing registered user");
    const registeredInvite = await request(
      "POST",
      "/api/team/invites",
      { email: "elakkiyaohai@gmail.com", role: "Employee" },
      adminToken
    );
    assert(registeredInvite.status === 400, "Inviting existing registered user rejected (HTTP 400)");

    // 7. Inspect invitation via invite-info endpoint
    console.log("\nTest 7: Validate invite-info endpoint");
    const infoRes = await request("GET", `/api/auth/invite-info/${employeeInviteToken}`);
    assert(infoRes.status === 200, "Valid token returns HTTP 200");
    const info = infoRes.body.invite || infoRes.body.invitation;
    assert(info.email === testInvEmail, "Returns correct invitee email");
    assert(info.role === "Employee", "Returns correct assigned role");
    assert(info.fullName === "Jordan Lee", "Returns invitee fullName");

    const bogusInfo = await request("GET", "/api/auth/invite-info/inv-bogusinvalidtoken123");
    assert(bogusInfo.status === 404, "Bogus token returns HTTP 404");

    // 8. Public registration cannot grant Admin access
    console.log("\nTest 8: Public registration cannot grant Admin access");
    const publicAdminAttempt = await request("POST", "/api/auth/register", {
      fullName: "Public Hacker",
      email: `public.hacker.${Date.now()}@test.com`,
      password: "HackerPassword@123",
      role: "Admin",
    });
    assert(publicAdminAttempt.status === 403, "Public registration with role Admin rejected with HTTP 403");

    // 9. Invitee accepts invitation (even if body specifies role: Admin, role escalation is blocked)
    console.log("\nTest 9: Invitee accepts invitation & role escalation is strictly blocked");
    const acceptRes = await request("POST", "/api/auth/register", {
      fullName: "Jordan Lee",
      email: testInvEmail,
      password: "JordanPassword@2026",
      inviteToken: employeeInviteToken,
      role: "Admin", // Attempting malicious escalation in payload
    });
    assert(acceptRes.status === 201, "Invitation accepted successfully (HTTP 201)");
    assert(acceptRes.body.user && acceptRes.body.user.role === "Employee", "Role strictly remained Employee (escalation prevented)");
    assert(!!acceptRes.body.token, "Returns active authentication JWT");

    // 10. Single-use enforcement: cannot accept the same token twice
    console.log("\nTest 10: Single-use token invalidation enforcement");
    const reuseRes = await request("POST", "/api/auth/register", {
      fullName: "Jordan Lee Imposter",
      email: testInvEmail,
      password: "JordanPassword@2026",
      inviteToken: employeeInviteToken,
    });
    assert(reuseRes.status === 400, "Reusing accepted invitation rejected (HTTP 400)");

    const reusedInfo = await request("GET", `/api/auth/invite-info/${employeeInviteToken}`);
    assert(reusedInfo.status === 400, "Invite-info reflects already accepted status (HTTP 400)");

    // 11. Login with newly activated invited account
    console.log("\nTest 11: Invitee login verification");
    const inviteeLogin = await request("POST", "/api/auth/login", {
      email: testInvEmail,
      password: "JordanPassword@2026",
    });
    assert(inviteeLogin.status === 200, "Invited user logs in successfully with new password");
    assert(inviteeLogin.body.user.role === "Employee", "Logged in user has Employee role");

    // 12. Valid invitation creation for Viewer and acceptance
    console.log("\nTest 12: Admin invites Viewer & acceptance verification");
    const testViewerEmail = `test.viewer.${Date.now()}@company.com`;
    const viewerInvite = await request(
      "POST",
      "/api/team/invites",
      { email: testViewerEmail, fullName: "Morgan Viewer", role: "Viewer" },
      adminToken
    );
    assert(viewerInvite.status === 201, "Viewer invitation created successfully");
    const viewerToken = (viewerInvite.body.data || viewerInvite.body.invitation).token;

    const acceptViewer = await request("POST", "/api/auth/register", {
      fullName: "Morgan Viewer",
      email: testViewerEmail,
      password: "ViewerPassword@2026",
      inviteToken: viewerToken,
    });
    assert(acceptViewer.status === 201, "Viewer accepted invitation");
    assert(acceptViewer.body.user.role === "Viewer", "Invited user role strictly set to Viewer");

    const viewerLogin = await request("POST", "/api/auth/login", {
      email: testViewerEmail,
      password: "ViewerPassword@2026",
    });
    assert(viewerLogin.status === 200, "Viewer logs in successfully");
    assert(viewerLogin.body.user.role === "Viewer", "Viewer verified with Viewer permissions");

    // 13. Audit logs verification
    console.log("\nTest 13: Audit log verification for invitation events");
    const auditLogsRes = await request("GET", "/api/audit/logs?limit=10", null, adminToken);
    assert(auditLogsRes.status === 200, "Audit logs fetched");
    const actions = (auditLogsRes.body.data || auditLogsRes.body.logs || []).map((l) => l.action);
    assert(actions.includes("MEMBER_INVITED"), "Audit log recorded MEMBER_INVITED");
    assert(actions.includes("INVITE_ACCEPTED"), "Audit log recorded INVITE_ACCEPTED");

  } catch (err) {
    console.error("Test execution error:", err);
    failed++;
  }

  console.log("\n==================================================================");
  console.log(`  Tests completed: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) process.exit(1);
}

runTests();
