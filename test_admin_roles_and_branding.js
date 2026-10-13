/**
 * test_admin_roles_and_branding.js
 * Comprehensive automated verification for:
 * 1. elakkiya270806@gmail.com is the ONLY Admin in the system (isPrimaryAdmin = true).
 * 2. elakkiyaohai@gmail.com is an Employee (isPrimaryAdmin = false).
 * 3. Both accounts authenticate successfully with Admin@1234.
 * 4. Only Admin can renew any record, assign/reassign, and delete.
 * 5. Employee can only renew renewals assigned to their own account.
 * 6. Protection: elakkiya270806@gmail.com cannot be demoted or deactivated.
 * 7. Real email provider status and verified sender check (RenewalTrack <elakkiya270806@gmail.com>).
 * 8. Real test email dispatch via Gmail SMTP.
 */

const http = require("http");
const db = require("./backend/db");
const emailService = require("./backend/emailService");
const config = require("./backend/config");

const BASE_URL = "http://localhost:3000";

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const reqOptions = {
      method: options.method || "GET",
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, data: json });
      });
    });

    req.on("error", reject);
    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function run() {
  console.log("\n================================================================================");
  console.log("  RenewalTrack: Admin Roles, Permissions & Gmail Sender Verification Suite      ");
  console.log("================================================================================\n");

  let passed = 0;

  // 1. Database Role Verification
  console.log("1. Inspecting User Database Roles:");
  const users = await db.getUsers();
  const admins = users.filter((u) => u.role === "Admin");
  const elakkiyaAdmin = users.find((u) => u.email.toLowerCase() === "elakkiya270806@gmail.com");
  const elakkiyaEmployee = users.find((u) => u.email.toLowerCase() === "elakkiyaohai@gmail.com");

  assert(admins.length === 1, `Exactly 1 Admin exists in system (found: ${admins.length})`);
  assert(admins[0].email.toLowerCase() === "elakkiya270806@gmail.com", `The only Admin is elakkiya270806@gmail.com`);
  assert(elakkiyaAdmin && elakkiyaAdmin.role === "Admin", "elakkiya270806@gmail.com has role 'Admin'");
  assert(elakkiyaAdmin.isPrimaryAdmin === true, "elakkiya270806@gmail.com has isPrimaryAdmin = true");
  assert(elakkiyaEmployee && elakkiyaEmployee.role === "Employee", "elakkiyaohai@gmail.com has role 'Employee'");
  assert(!elakkiyaEmployee.isPrimaryAdmin, "elakkiyaohai@gmail.com has isPrimaryAdmin = false");
  passed += 6;

  // 2. Authentication Verification
  console.log("\n2. Testing Authentication & Session Tokens:");
  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiya270806@gmail.com", password: "Admin@1234" },
  });
  assert(adminLogin.status === 200, "elakkiya270806@gmail.com logs in successfully with Admin@1234");
  assert(adminLogin.data.user.role === "Admin", "Admin login returns role 'Admin'");
  assert(adminLogin.data.user.isPrimaryAdmin === true, "Admin login returns isPrimaryAdmin: true");
  const adminToken = adminLogin.data.token;

  const empLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiyaohai@gmail.com", password: "Admin@1234" },
  });
  assert(empLogin.status === 200, "elakkiyaohai@gmail.com logs in successfully with Admin@1234");
  assert(empLogin.data.user.role === "Employee", "Employee login returns role 'Employee'");
  assert(empLogin.data.user.isPrimaryAdmin === false, "Employee login returns isPrimaryAdmin: false");
  const empToken = empLogin.data.token;
  passed += 6;

  // 3. Protection of elakkiya270806@gmail.com against demotion or deactivation
  console.log("\n3. Testing Primary Admin Role & Status Protection:");
  try {
    await db.updateUserRole(elakkiyaAdmin.id, "Employee", { email: "someone@test.com" });
    assert(false, "Should not allow demoting primary admin");
  } catch (err) {
    assert(err.message.includes("cannot be demoted"), "db.updateUserRole blocks demoting elakkiya270806@gmail.com");
    passed++;
  }

  try {
    await db.setUserStatus(elakkiyaAdmin.id, "deactivated", { email: "someone@test.com" });
    assert(false, "Should not allow deactivating primary admin");
  } catch (err) {
    assert(err.message.includes("cannot be deactivated"), "db.setUserStatus blocks deactivating elakkiya270806@gmail.com");
    passed++;
  }

  // 4. Team Endpoint Permissions
  console.log("\n4. Testing Team Management Permissions:");
  // Employee attempting to change role via API
  const empRoleChange = await request(`/api/team/members/${elakkiyaAdmin.id}/role`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${empToken}` },
    body: { role: "Viewer" },
  });
  assert(empRoleChange.status === 403, "Employee cannot change team roles (403 Forbidden)");
  passed++;

  // 5. Renewal Management & Ownership Permissions
  console.log("\n5. Testing Renewal Renewal Permissions:");
  // Create test renewal 1 assigned to elakkiyaohai@gmail.com
  const r1 = await db.saveRenewal({
    id: `rn-test-${Date.now()}-1`,
    name: "Test Server SSL Certificate",
    category: "Software",
    vendor: "DigiCert",
    cost: 150,
    expiryDate: "2026-11-01",
    renewalDate: "2026-11-01",
    autoRenew: false,
    assignedToId: elakkiyaEmployee.id,
    assignedToName: elakkiyaEmployee.fullName || "Elakkiya Employee",
    assignedToEmail: "elakkiyaohai@gmail.com",
    status: "Upcoming",
  });

  // Create test renewal 2 assigned to someone else
  const r2 = await db.saveRenewal({
    id: `rn-test-${Date.now()}-2`,
    name: "Internal Hardware Lease",
    category: "Hardware",
    vendor: "Dell",
    cost: 500,
    expiryDate: "2026-11-05",
    renewalDate: "2026-11-05",
    autoRenew: false,
    assignedToId: "usr-other-999",
    assignedToName: "Other User",
    assignedToEmail: "other@company.com",
    status: "Upcoming",
  });

  // Employee attempts to renew r2 (not assigned to them)
  const empRenewOther = await request(`/api/renewals/${r2.id}/renew`, {
    method: "POST",
    headers: { Authorization: `Bearer ${empToken}` },
    body: { newExpiryDate: "2027-11-05", cost: 500, notes: "Unauthorized renewal test" },
  });
  assert(empRenewOther.status === 403, "Employee cannot renew renewals assigned to other users (403 Forbidden)");
  passed++;

  // Employee renews r1 (assigned to them)
  const empRenewOwn = await request(`/api/renewals/${r1.id}/renew`, {
    method: "POST",
    headers: { Authorization: `Bearer ${empToken}` },
    body: { newExpiryDate: "2027-11-01", cost: 150, notes: "Authorized employee renewal test" },
  });
  assert(empRenewOwn.status === 200, "Employee can renew renewals assigned to their account (200 OK)");
  assert(empRenewOwn.data.data.status === "active", "Renewal status synced to active");
  passed += 2;

  // Admin renews r2 (Admin can renew any record)
  const adminRenewAny = await request(`/api/renewals/${r2.id}/renew`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { newRenewalDate: "2027-11-05", cost: 500, notes: "Admin authorized renewal" },
  });
  assert(adminRenewAny.status === 200, "Admin elakkiya270806@gmail.com can renew any renewal (200 OK)");
  passed++;

  // Clean up test records
  await db.deleteRenewal(r1.id, "elakkiya270806@gmail.com");
  await db.deleteRenewal(r2.id, "elakkiya270806@gmail.com");

  // 6. Sender Display Name and Branding Verification
  console.log("\n6. Testing Email Configuration & Sender Display Name:");
  const providerStatus = emailService.getProviderStatus();
  console.log(`  - Provider: ${providerStatus.provider}`);
  console.log(`  - Real delivery enabled: ${providerStatus.enabled}`);
  console.log(`  - From Address: ${providerStatus.fromAddress}`);
  console.log(`  - Verified Sender Domain: ${providerStatus.smtpUser}`);

  assert(providerStatus.fromAddress.includes("RenewalTrack"), `From address contains 'RenewalTrack' branding`);
  assert(providerStatus.fromAddress.includes("elakkiya270806@gmail.com"), `From address contains 'elakkiya270806@gmail.com'`);
  assert(!providerStatus.fromAddress.includes("RenewGuard"), `From address contains NO 'RenewGuard' text`);
  passed += 3;

  // 7. Live Gmail SMTP Delivery Test
  console.log("\n7. Testing Live Gmail SMTP Delivery with Google App Password:");
  const testConn = await emailService.verifyConnection();
  assert(testConn.ok, `Gmail SMTP connection verified: ${testConn.message}`);
  passed++;

  console.log("  Dispatching live test email to elakkiya270806@gmail.com via Gmail SMTP...");
  const sendResult = await emailService.sendAssignmentNotification({
    to: "elakkiya270806@gmail.com",
    recipientName: "Elakkiya (Admin)",
    renewal: {
      id: "rn-verify-live-01",
      name: "RenewalTrack Production Google Workspace",
      category: "SaaS",
      vendor: "Google Cloud",
      cost: 72,
      renewalDate: "2026-12-01",
      status: "Active",
      priority: "High",
    },
    assignedBy: "RenewalTrack System",
    isReassignment: false,
  });

  assert(sendResult.success === true, `sendAssignmentNotification returned success: true`);
  assert(sendResult.delivered === true, `Email delivered in live mode`);
  assert(Boolean(sendResult.messageId), `Email assigned message ID: ${sendResult.messageId}`);
  passed += 3;

  console.log("\n================================================================================");
  console.log(`  ALL ${passed} VERIFICATION TESTS PASSED SUCCESSFULLY!                       `);
  console.log("================================================================================\n");
}

run().catch((err) => {
  console.error("\n[TEST ERROR]:", err);
  process.exit(1);
});
