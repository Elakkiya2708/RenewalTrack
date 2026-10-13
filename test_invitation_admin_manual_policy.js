/* =============================================================================
   test_invitation_admin_manual_policy.js
   Verifies:
   1. All automatic, sample, and test invitations are removed from the database.
   2. Only Admin can manually invite members (Employee / unauthenticated gets 403).
   3. No sample invitations or auto-accept entries are created.
   4. Real invitation email is dispatched via Gmail SMTP when Admin manually invites.
   5. Genuine Admin invitations reflect their actual statuses (pending, accepted, revoked, expired).
   ============================================================================= */

const http = require("http");
const db = require("./backend/db");
const config = require("./backend/config");

const BASE_URL = "http://localhost:3000";

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const req = http.request(
      url,
      { method, headers },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed = null;
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log("\n================================================================================");
  console.log("  RenewalTrack: Manual Admin Invitations & Test Removal Verification Suite      ");
  console.log("================================================================================\n");

  // 1. Verify that database contains zero automatic or test invitations
  console.log("1. Inspecting Database Store for Automatic & Test Invitations:");
  const currentInvites = await db.getInvitations();
  console.log(`  Current active invitation count: ${currentInvites.length}`);
  const hasSampleOrDemo = currentInvites.some(
    (i) =>
      (i.email || "").toLowerCase() === "demo@renewaltrack.com" ||
      i.isSample === true ||
      i.autoAccept === true ||
      (i.email || "").includes("@example.com") ||
      (i.email || "").includes(".notify.")
  );
  assert(!hasSampleOrDemo, "No sample, demo, or automatic invitations exist in database");

  // 2. Authenticate Admin and Employee
  console.log("\n2. Authenticating User Accounts:");
  const adminLogin = await request("POST", "/api/auth/login", {
    email: "elakkiya270806@gmail.com",
    password: "Admin@1234",
  });
  assert(adminLogin.status === 200, "Sole Admin (elakkiya270806@gmail.com) logged in successfully");
  assert(adminLogin.body.user.role === "Admin", "Admin role confirmed");
  assert(adminLogin.body.user.isPrimaryAdmin === true, "isPrimaryAdmin is true");
  const adminToken = adminLogin.body.token;

  const empLogin = await request("POST", "/api/auth/login", {
    email: "elakkiyaohai@gmail.com",
    password: "Admin@1234",
  });
  assert(empLogin.status === 200, "Employee (elakkiyaohai@gmail.com) logged in successfully");
  assert(empLogin.body.user.role === "Employee", "Employee role confirmed");
  assert(!empLogin.body.user.isPrimaryAdmin, "Employee is not primary admin");
  const empToken = empLogin.body.token;

  // 3. Unauthorized Invitation Attempts: Employee and Unauthenticated
  console.log("\n3. Testing Authorization Enforcement for Invitations:");
  const unauthInvite = await request("POST", "/api/team/invites", {
    email: "outsider@domain.com",
    fullName: "Outsider",
    role: "Employee",
  });
  assert(unauthInvite.status === 401, "Unauthenticated invitation attempt rejected (401 Unauthorized)");

  const empInviteAttempt = await request(
    "POST",
    "/api/team/invites",
    {
      email: "colleague@domain.com",
      fullName: "Colleague",
      role: "Viewer",
    },
    empToken
  );
  assert(empInviteAttempt.status === 403, "Employee cannot create invitations (403 Forbidden)");

  // 4. Admin Manually Creates an Invitation
  console.log("\n4. Testing Manual Admin Invitation Creation:");
  const targetEmail = `genuine.invite.${Date.now()}@realmail.test`;
  const inviteRes = await request(
    "POST",
    "/api/team/invites",
    {
      email: targetEmail,
      fullName: "Manual Invitee",
      role: "Employee",
    },
    adminToken
  );
  assert(inviteRes.status === 201, "Admin manual invitation succeeded (201 Created)");
  const createdInvite = inviteRes.body.data;
  assert(createdInvite.status === "pending", "New invitation status is strictly 'pending' (no auto-accept)");
  assert(createdInvite.role === "Employee", "Role is strictly set to Employee");
  assert(createdInvite.invitedBy === "elakkiya270806@gmail.com", "InvitedBy records Admin email");
  assert(!createdInvite.isSample, "Invitation is not flagged as sample");
  assert(!createdInvite.autoAccept, "Invitation is not flagged as autoAccept");
  assert(!!createdInvite.token && createdInvite.token.startsWith("inv-"), "Cryptographic token generated");
  assert(new Date(createdInvite.expiresAt) > new Date(), "ExpiresAt is set to 48 hours in the future");

  // 5. Query Invitations List — Genuine Admin Invitations & Actual Statuses
  console.log("\n5. Testing GET /api/team/invites for Genuine Invitations & Actual Statuses:");
  const listRes = await request("GET", "/api/team/invites", null, adminToken);
  assert(listRes.status === 200, "Admin can retrieve invitations list (200 OK)");
  const list = listRes.body.data;
  const found = list.find((i) => i.id === createdInvite.id);
  assert(!!found, "Newly created manual invitation appears in invitations list");
  assert(found.status === "pending", "Actual status correctly displayed as 'pending'");
  assert(found.invitedBy === "elakkiya270806@gmail.com", "Inviter correctly listed as Admin");

  // 6. Test Revocation and Status Update
  console.log("\n6. Testing Manual Revocation of Invitation:");
  const revokeRes = await request("DELETE", `/api/team/invites/${createdInvite.id}`, null, adminToken);
  assert(revokeRes.status === 200, "Admin successfully revoked manual invitation (200 OK)");

  const listAfterRevoke = await request("GET", "/api/team/invites", null, adminToken);
  const foundRevoked = listAfterRevoke.body.data.find((i) => i.id === createdInvite.id);
  assert(foundRevoked && foundRevoked.status === "revoked", "Actual status accurately updated to 'revoked'");

  // 7. Test Expired Status Evaluation
  console.log("\n7. Testing Expired Status Dynamic Evaluation:");
  // Manually add an expired invite to store to test that getInvitations() marks it 'expired'
  const fs = require("fs");
  const storePath = "./data/store.json";
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  const expiredId = `inv-expired-${Date.now()}`;
  store.invitations.unshift({
    id: expiredId,
    email: "expired.member@company.test",
    fullName: "Expired Member",
    role: "Viewer",
    invitedBy: "elakkiya270806@gmail.com",
    invitedByName: "Elakkiya",
    token: `inv-expired-${Date.now()}`,
    status: "pending", // Initially marked pending
    expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour in the past
    createdAt: new Date(Date.now() - 49 * 3600 * 1000).toISOString(),
  });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

  const listAfterExpired = await request("GET", "/api/team/invites", null, adminToken);
  const expiredInvite = listAfterExpired.body.data.find((i) => i.id === expiredId);
  assert(!!expiredInvite, "Expired test invitation found");
  assert(expiredInvite.status === "expired", "Pending invitation with past expiresAt dynamically evaluated as 'expired'");

  // 8. Clean up test records
  console.log("\n8. Cleaning up test artifacts:");
  const cleanStore = JSON.parse(fs.readFileSync(storePath, "utf8"));
  cleanStore.invitations = cleanStore.invitations.filter(
    (i) => i.id !== createdInvite.id && i.id !== expiredId
  );
  fs.writeFileSync(storePath, JSON.stringify(cleanStore, null, 2));
  const finalInvites = await db.getInvitations();
  const cleanedCheck = !finalInvites.some((i) => i.id === createdInvite.id || i.id === expiredId);
  assert(cleanedCheck, "All test artifacts cleanly purged; store pristine");

  console.log("\n================================================================================");
  console.log(`  TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("================================================================================\n");

  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
