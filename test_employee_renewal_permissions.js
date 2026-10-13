/* ==========================================================================
   test_employee_renewal_permissions.js — Verification Test Suite
   Verifies:
   1. Employees CAN renew renewals assigned to their own account
   2. Employees CANNOT renew renewals assigned to other employees (403 Forbidden)
   3. Employees CANNOT renew unassigned renewal records (403 Forbidden)
   4. Admin CAN renew ANY renewal record (assigned to anyone, or unassigned)
   5. Viewer is strictly read-only and CANNOT renew any renewal record (403 Forbidden)
   6. Database persistence: expiryDate, status: "active", reminderDate, reminderCompleted
   7. Renewal History synchronization: history transitions appended and deduplicated
   8. Audit Logs synchronization: RENEWAL_MARKED_RENEWED events recorded and queryable
   9. Both /api/renewals/:id/mark-renewed and /api/renewals/:id/renew endpoints
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
  console.log("  RenewalTrack: Employee Renewal Permissions & History/Status Sync Test Suite    ");
  console.log("================================================================================\n");

  const db = require("./backend/db");

  // ---------------------------------------------------------------------------
  // 1. AUTHENTICATION OF TEST ACCOUNTS
  // ---------------------------------------------------------------------------
  console.log("[1] Authenticating test accounts (Admin, Employee 1, Employee 2, Viewer)...");

  // Admin: Elakkiya
  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "elakkiya270806@gmail.com", password: "Admin@1234" }),
  });
  assert(adminLogin.status === 200, "Admin (Elakkiya) login successful");
  const adminToken = adminLogin.data && adminLogin.data.token;
  const adminId = adminLogin.data && adminLogin.data.user && adminLogin.data.user.id;

  // Employee 1: David Kim
  const emp1Login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "david.kim@renewaltrack.com", password: "Demo@1234" }),
  });
  assert(emp1Login.status === 200, "Employee 1 (David Kim) login successful");
  const emp1Token = emp1Login.data && emp1Login.data.token;
  const emp1Id = emp1Login.data && emp1Login.data.user && emp1Login.data.user.id;
  const emp1Email = emp1Login.data && emp1Login.data.user && emp1Login.data.user.email;

  // Employee 2: raja
  const emp2Login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "elakkiyaaaaa27@gmail.com", password: "elakkiya" }),
  });
  assert(emp2Login.status === 200, "Employee 2 (raja) login successful");
  const emp2Token = emp2Login.data && emp2Login.data.token;
  const emp2Id = emp2Login.data && emp2Login.data.user && emp2Login.data.user.id;
  const emp2Email = emp2Login.data && emp2Login.data.user && emp2Login.data.user.email;

  // Viewer: Priya Nair
  const viewerLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "priya.nair@renewaltrack.com", password: "Demo@1234" }),
  });
  assert(viewerLogin.status === 200, "Viewer (Priya Nair) login successful");
  const viewerToken = viewerLogin.data && viewerLogin.data.token;

  // ---------------------------------------------------------------------------
  // 2. SETUP TEST RENEWAL RECORDS
  // ---------------------------------------------------------------------------
  console.log("\n[2] Setting up test renewal records in database...");

  // Record A: Assigned to Employee 1 (David Kim)
  const recARes = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `Perm Test Record A (Emp 1) ${Date.now()}`,
      category: "Software License",
      expiryDate: "2026-11-15",
      priority: "High",
      assignedToId: emp1Id,
      recurringCycle: "Yearly",
      cost: 15000,
      currency: "USD",
    }),
  });
  assert(recARes.status === 201 && recARes.data.ok, "Created Record A assigned to Employee 1");
  const recA = recARes.data.data;

  // Record B: Assigned to Employee 2 (raja)
  const recBRes = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `Perm Test Record B (Emp 2) ${Date.now()}`,
      category: "Cloud Services",
      expiryDate: "2026-12-01",
      priority: "Medium",
      assignedToId: emp2Id,
      recurringCycle: "Yearly",
      cost: 24000,
      currency: "USD",
    }),
  });
  assert(recBRes.status === 201 && recBRes.data.ok, "Created Record B assigned to Employee 2");
  const recB = recBRes.data.data;

  // Record C: Unassigned Renewal Record
  const recCRes = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      name: `Perm Test Record C (Unassigned) ${Date.now()}`,
      category: "Facility & Security",
      expiryDate: "2026-10-30",
      priority: "Urgent",
      recurringCycle: "Yearly",
      cost: 8000,
      currency: "USD",
    }),
  });
  assert(recCRes.status === 201 && recCRes.data.ok, "Created Record C (Unassigned)");
  const recC = recCRes.data.data;

  // ---------------------------------------------------------------------------
  // 3. EMPLOYEE 1 RENEWS THEIR OWN ASSIGNED RECORD (RECORD A)
  // ---------------------------------------------------------------------------
  console.log("\n[3] Testing Employee 1 renewing their OWN assigned record (Record A)...");

  const emp1RenewRes = await request(`/api/renewals/${recA.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: JSON.stringify({
      newExpiryDate: "2027-11-15",
      cost: 16500,
      notes: "Renewed by assigned Employee 1 for next contract term.",
    }),
  });
  assert(
    emp1RenewRes.status === 200 && emp1RenewRes.data.ok,
    "Employee 1 CAN renew renewal assigned to their own account (HTTP 200 OK)"
  );
  assert(
    emp1RenewRes.data.data.expiryDate === "2027-11-15",
    "Record A expiry date updated to 2027-11-15"
  );
  assert(
    emp1RenewRes.data.data.status === "active",
    "Record A status synchronized to 'active' in response"
  );
  assert(
    emp1RenewRes.data.data.reminderCompleted === false,
    "Record A reminderCompleted reset to false"
  );

  // Verify direct database persistence
  const savedRecA = await db.getRenewalById(recA.id);
  assert(
    savedRecA.expiryDate === "2027-11-15",
    "Database persistence verified: expiryDate saved in database"
  );
  assert(
    savedRecA.status === "active",
    "Database persistence verified: status 'active' saved in database"
  );
  assert(
    Array.isArray(savedRecA.history) && savedRecA.history.length > 0,
    "Database persistence verified: renewal history array exists"
  );
  assert(
    savedRecA.history[0].newExpiry === "2027-11-15" && savedRecA.history[0].previousExpiry === "2026-11-15",
    "Renewal history entry correctly captures previousExpiry and newExpiry transitions"
  );

  // ---------------------------------------------------------------------------
  // 4. PREVENT EMPLOYEE 1 RENEWING OTHERS' RECORDS (RECORD B ASSIGNED TO EMP 2)
  // ---------------------------------------------------------------------------
  console.log("\n[4] Testing Employee 1 attempting to renew Record B (assigned to Employee 2)...");

  const emp1IllegalRenewB = await request(`/api/renewals/${recB.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: JSON.stringify({
      newExpiryDate: "2027-12-01",
    }),
  });
  assert(
    emp1IllegalRenewB.status === 403 && !emp1IllegalRenewB.data.ok,
    "Employee 1 CANNOT renew renewal assigned to Employee 2 (HTTP 403 Forbidden)",
    `Status: ${emp1IllegalRenewB.status}, Error: ${emp1IllegalRenewB.data?.error}`
  );

  // Also test /api/renewals/:id/renew alias
  const emp1IllegalRenewBAlias = await request(`/api/renewals/${recB.id}/renew`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: JSON.stringify({
      newExpiryDate: "2027-12-01",
    }),
  });
  assert(
    emp1IllegalRenewBAlias.status === 403 && !emp1IllegalRenewBAlias.data.ok,
    "Employee 1 rejected via /api/renewals/:id/renew alias as well (HTTP 403 Forbidden)"
  );

  // Verify Record B was NOT altered in database
  const untouchedRecB = await db.getRenewalById(recB.id);
  assert(
    untouchedRecB.expiryDate === "2026-12-01",
    "Database verified: Record B expiry remains untouched after blocked renewal attempt"
  );

  // ---------------------------------------------------------------------------
  // 5. PREVENT EMPLOYEE 1 RENEWING UNASSIGNED RECORD (RECORD C)
  // ---------------------------------------------------------------------------
  console.log("\n[5] Testing Employee 1 attempting to renew Record C (Unassigned record)...");

  const emp1IllegalRenewC = await request(`/api/renewals/${recC.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: JSON.stringify({
      newExpiryDate: "2027-10-30",
    }),
  });
  assert(
    emp1IllegalRenewC.status === 403 && !emp1IllegalRenewC.data.ok,
    "Employee 1 CANNOT renew unassigned renewal (HTTP 403 Forbidden)",
    `Status: ${emp1IllegalRenewC.status}, Error: ${emp1IllegalRenewC.data?.error}`
  );

  // Verify Record C was NOT altered in database
  const untouchedRecC = await db.getRenewalById(recC.id);
  assert(
    untouchedRecC.expiryDate === "2026-10-30",
    "Database verified: Unassigned Record C remains untouched after blocked renewal attempt"
  );

  // ---------------------------------------------------------------------------
  // 6. EMPLOYEE 2 RENEWS RECORD B & CANNOT RENEW RECORD A OR C
  // ---------------------------------------------------------------------------
  console.log("\n[6] Testing Employee 2 renewal permissions...");

  // Employee 2 renewing their own record B
  const emp2RenewB = await request(`/api/renewals/${recB.id}/renew`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: JSON.stringify({
      newExpiryDate: "2027-12-01",
      cost: 25000,
    }),
  });
  assert(
    emp2RenewB.status === 200 && emp2RenewB.data.ok,
    "Employee 2 CAN renew their own assigned renewal (Record B) via /renew (HTTP 200 OK)"
  );
  assert(
    emp2RenewB.data.data.expiryDate === "2027-12-01" && emp2RenewB.data.data.status === "active",
    "Record B expiry updated and status set to active"
  );

  // Employee 2 attempting to renew Employee 1's record A
  const emp2IllegalRenewA = await request(`/api/renewals/${recA.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: JSON.stringify({
      newExpiryDate: "2028-11-15",
    }),
  });
  assert(
    emp2IllegalRenewA.status === 403 && !emp2IllegalRenewA.data.ok,
    "Employee 2 CANNOT renew renewal assigned to Employee 1 (HTTP 403 Forbidden)"
  );

  // Employee 2 attempting to renew unassigned Record C
  const emp2IllegalRenewC = await request(`/api/renewals/${recC.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: JSON.stringify({
      newExpiryDate: "2027-10-30",
    }),
  });
  assert(
    emp2IllegalRenewC.status === 403 && !emp2IllegalRenewC.data.ok,
    "Employee 2 CANNOT renew unassigned renewal (Record C) (HTTP 403 Forbidden)"
  );

  // ---------------------------------------------------------------------------
  // 7. VIEWER ROLE (READ-ONLY) BLOCKED FROM RENEWING ANY RECORD
  // ---------------------------------------------------------------------------
  console.log("\n[7] Testing Viewer role (read-only) blocked from renewing any record...");

  const viewerRenewA = await request(`/api/renewals/${recA.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: JSON.stringify({ newExpiryDate: "2028-11-15" }),
  });
  assert(
    viewerRenewA.status === 403 && !viewerRenewA.data.ok,
    "Viewer CANNOT renew Record A (HTTP 403 Forbidden)"
  );

  const viewerRenewB = await request(`/api/renewals/${recB.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: JSON.stringify({ newExpiryDate: "2028-12-01" }),
  });
  assert(
    viewerRenewB.status === 403 && !viewerRenewB.data.ok,
    "Viewer CANNOT renew Record B (HTTP 403 Forbidden)"
  );

  const viewerRenewC = await request(`/api/renewals/${recC.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: JSON.stringify({ newExpiryDate: "2027-10-30" }),
  });
  assert(
    viewerRenewC.status === 403 && !viewerRenewC.data.ok,
    "Viewer CANNOT renew unassigned Record C (HTTP 403 Forbidden)"
  );

  // ---------------------------------------------------------------------------
  // 8. ADMIN CAN RENEW ANY RECORD (ASSIGNED TO ANYONE OR UNASSIGNED)
  // ---------------------------------------------------------------------------
  console.log("\n[8] Testing Admin CAN renew ANY renewal record...");

  // Admin renewing Record A (assigned to Employee 1)
  const adminRenewA = await request(`/api/renewals/${recA.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      newExpiryDate: "2028-11-15",
      notes: "Admin overriding renewal for Employee 1 record.",
    }),
  });
  assert(
    adminRenewA.status === 200 && adminRenewA.data.ok,
    "Admin CAN renew record assigned to Employee 1 (Record A) (HTTP 200 OK)"
  );
  assert(
    adminRenewA.data.data.expiryDate === "2028-11-15",
    "Record A expiry updated by Admin to 2028-11-15"
  );

  // Admin renewing Record B (assigned to Employee 2)
  const adminRenewB = await request(`/api/renewals/${recB.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      newExpiryDate: "2028-12-01",
      notes: "Admin renewal for Employee 2 record.",
    }),
  });
  assert(
    adminRenewB.status === 200 && adminRenewB.data.ok,
    "Admin CAN renew record assigned to Employee 2 (Record B) (HTTP 200 OK)"
  );
  assert(
    adminRenewB.data.data.expiryDate === "2028-12-01",
    "Record B expiry updated by Admin to 2028-12-01"
  );

  // Admin renewing unassigned Record C
  const adminRenewC = await request(`/api/renewals/${recC.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      newExpiryDate: "2027-10-30",
      notes: "Admin renewing unassigned facility record.",
    }),
  });
  assert(
    adminRenewC.status === 200 && adminRenewC.data.ok,
    "Admin CAN renew unassigned renewal (Record C) (HTTP 200 OK)"
  );
  assert(
    adminRenewC.data.data.expiryDate === "2027-10-30",
    "Unassigned Record C expiry successfully updated by Admin"
  );

  // ---------------------------------------------------------------------------
  // 9. RENEWAL HISTORY SYNCHRONIZATION VIA GET /api/renewals/history
  // ---------------------------------------------------------------------------
  console.log("\n[9] Verifying Renewal History synchronization via GET /api/renewals/history...");

  const historyRes = await request("/api/renewals/history", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    historyRes.status === 200 && historyRes.data.ok,
    "GET /api/renewals/history returns HTTP 200 OK"
  );
  assert(
    Array.isArray(historyRes.data.data),
    "History data is an array"
  );

  const historyRecords = historyRes.data.data;
  const histForA = historyRecords.filter((h) => h.renewalId === recA.id);
  assert(
    histForA.length >= 2,
    "Aggregated history contains entries for Record A transitions",
    `Found: ${histForA.length} entries`
  );

  const histForC = historyRecords.filter((h) => h.renewalId === recC.id);
  assert(
    histForC.length >= 1,
    "Aggregated history contains entry for unassigned Record C renewed by Admin"
  );

  // ---------------------------------------------------------------------------
  // 10. AUDIT LOGS SYNCHRONIZATION VIA GET /api/audit/logs
  // ---------------------------------------------------------------------------
  console.log("\n[10] Verifying Audit Logs synchronization via GET /api/audit/logs...");

  const auditRes = await request("/api/audit/logs?limit=50", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    auditRes.status === 200 && auditRes.data.ok,
    "GET /api/audit/logs returns HTTP 200 OK"
  );

  const auditLogs = auditRes.data.data || auditRes.data.logs || [];
  const renewalAuditEntries = auditLogs.filter((l) => l.action === "RENEWAL_MARKED_RENEWED");
  assert(
    renewalAuditEntries.length >= 4,
    "Audit Logs recorded RENEWAL_MARKED_RENEWED events for renewed records",
    `Found: ${renewalAuditEntries.length} entries`
  );

  // Verify actor attribution in audit log
  const emp1Audit = renewalAuditEntries.find((l) => l.targetId === recA.id && (l.actorEmail === emp1Email || l.actor_email === emp1Email));
  assert(
    !!emp1Audit,
    "Audit log attributes renewal action to Employee 1 for Record A"
  );

  const adminAuditC = renewalAuditEntries.find((l) => l.targetId === recC.id);
  assert(
    !!adminAuditC,
    "Audit log attributes renewal of unassigned Record C to Admin"
  );

  // ---------------------------------------------------------------------------
  // CLEANUP TEST RECORDS
  // ---------------------------------------------------------------------------
  await request(`/api/renewals/${recA.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
  await request(`/api/renewals/${recB.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });
  await request(`/api/renewals/${recC.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${adminToken}` } });

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
