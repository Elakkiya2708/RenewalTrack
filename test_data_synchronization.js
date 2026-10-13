/* ==========================================================================
   test_data_synchronization.js
   Comprehensive test suite for RenewalTrack Data Synchronization & Persistence:
   - Create, Edit, Assign/Reassign, Snooze, Renew, Complete/Reopen, Delete
   - Verifies real database persistence (db.js / store.json)
   - Verifies history deduplication and proper reminder date updates
   - Verifies audit log generation and querying
   - Verifies role-based access control (Admin, Employee, Viewer)
   ========================================================================== */

const http = require("http");
const jwt = require("jsonwebtoken");
const config = require("./backend/config");
const db = require("./backend/db");

const BASE_URL = "http://localhost:3000";

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

function loginUser(email, password) {
  return makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email, password }
  );
}

async function runTests() {
  console.log("\n================================================================================");
  console.log("   RENEWALTRACK DATA SYNCHRONIZATION & PERSISTENCE TEST SUITE");
  console.log("================================================================================\n");

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      testsPassed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      testsFailed++;
    }
  }

  // 1. Authenticate users
  console.log("[Setup] Authenticating test accounts...");
  const adminLogin = await loginUser("elakkiyaohai@gmail.com", "Admin@1234");
  assert(adminLogin.data && adminLogin.data.ok, "Admin login successful");
  const adminToken = adminLogin.data.token;

  // Ensure test employee and viewer are active in database
  await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/team/members/usr-2/status",
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: "active" }
  );

  await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/team/members/usr-3/status",
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
    },
    { status: "active" }
  );

  const empLogin = await loginUser("david.kim@renewaltrack.com", "Demo@1234");
  assert(empLogin.data && empLogin.data.ok, "Employee login successful (david.kim@renewaltrack.com)");
  const empToken = empLogin.data.token;
  const empUser = empLogin.data.user;

  const viewerLogin = await loginUser("priya.nair@renewaltrack.com", "Demo@1234");
  assert(viewerLogin.data && viewerLogin.data.ok, "Viewer login successful (priya.nair@renewaltrack.com)");
  const viewerToken = viewerLogin.data.token;

  let testRenewalId = null;

  // TEST 1: CREATE RENEWAL & ASSIGNMENT
  console.log("\n[Test 1] Renewal Creation, Assignment & Database Persistence");
  const createPayload = {
    name: "Sync Test AWS Enterprise Subscription",
    category: "Software",
    organization: "Amazon Web Services",
    cost: 15000,
    currency: "USD",
    priority: "High",
    recurringCycle: "Yearly",
    issueDate: "2026-10-13",
    expiryDate: "2027-10-13",
    reminderDate: "2027-09-29",
    assignedToId: empUser.id,
    notes: "Created via automated synchronization test suite",
  };

  const createRes = await makeRequest(
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
    createPayload
  );

  assert(createRes.status === 201 && createRes.data.ok, "Admin can create renewal record");
  const createdRecord = createRes.data.data;
  testRenewalId = createdRecord.id;
  assert(createdRecord.assignedToId === empUser.id, "Renewal correctly assigned to Employee in API response");

  // Verify Database Persistence directly from db.js
  const dbRecord1 = await db.getRenewalById(testRenewalId);
  assert(dbRecord1 !== null, "Record persisted directly in database store");
  assert(dbRecord1.name === createPayload.name, "Database stored correct renewal name");
  assert(dbRecord1.assignedToEmail === empUser.email, "Database stored correct assigned employee email");

  // Verify Employee view receives assigned record
  const empListRes = await makeRequest({
    hostname: "localhost",
    port: 3000,
    path: "/api/renewals",
    method: "GET",
    headers: { Authorization: `Bearer ${empToken}` },
  });
  const empSeesRenewal = (empListRes.data.data || []).some((r) => r.id === testRenewalId);
  assert(empSeesRenewal, "Employee view automatically reflects newly assigned renewal from DB");

  // TEST 2: EDIT & REASSIGN
  console.log("\n[Test 2] Edit & Reassignment with Audit Trail");
  const editPayload = {
    name: "Sync Test AWS Enterprise Subscription (Updated)",
    cost: 18500,
    notes: "Updated cost and name during test",
  };

  const editRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${testRenewalId}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
    },
    editPayload
  );

  assert(editRes.status === 200 && editRes.data.ok, "Admin can edit renewal record");
  const dbRecord2 = await db.getRenewalById(testRenewalId);
  assert(dbRecord2.cost === 18500, "Updated cost saved to database (18500)");
  assert(dbRecord2.name === editPayload.name, "Updated name saved to database");

  // TEST 3: SNOOZE REMINDER
  console.log("\n[Test 3] Snooze Reminder Persistence");
  const snoozePayload = {
    days: 14,
    reminderDate: "2027-10-10",
  };

  const snoozeRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${testRenewalId}/snooze`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
    },
    snoozePayload
  );

  assert(snoozeRes.status === 200 && snoozeRes.data.ok, "Assigned Employee can snooze reminder");
  const dbRecord3 = await db.getRenewalById(testRenewalId);
  assert(dbRecord3.reminderDate === "2027-10-10", "Snoozed reminder date persisted in database");
  assert(dbRecord3.reminderCompleted === false, "Reminder completed status is false after snooze");

  // TEST 4: MARK AS RENEWED & HISTORY DEDUPLICATION
  console.log("\n[Test 4] Mark as Renewed, Expiry Advance, and History Deduplication");
  const renewPayload = {
    newExpiryDate: "2028-10-13",
    renewalDate: "2026-10-13",
    cost: 19000,
    currency: "USD",
    notes: "Renewed for another year via automated test",
    recurringCycle: "Yearly",
  };

  const renewRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${testRenewalId}/mark-renewed`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
    },
    renewPayload
  );

  assert(renewRes.status === 200 && renewRes.data.ok, "Assigned Employee can renew record");
  const dbRecord4 = await db.getRenewalById(testRenewalId);
  assert(dbRecord4.expiryDate === "2028-10-13", "New expiry date persisted in database (2028-10-13)");
  assert(dbRecord4.reminderDate === "2028-09-29", "Reminder date automatically updated to new cycle (2028-09-29)");
  assert(dbRecord4.reminderCompleted === false, "Reminder completed reset to false on renewal");
  assert(Array.isArray(dbRecord4.history) && dbRecord4.history.length === 1, "Renewal history entry appended to database record");

  // Attempt duplicate renewal with identical transition
  console.log("[Test 4b] Testing duplicate history entry prevention...");
  const duplicateRenewRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${testRenewalId}/mark-renewed`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
    },
    renewPayload
  );
  assert(duplicateRenewRes.status === 200, "Second call succeeds gracefully");
  const dbRecord4b = await db.getRenewalById(testRenewalId);
  assert(dbRecord4b.history.length === 1, "Duplicate history entry prevented: history length remains 1");

  // Verify GET /api/renewals/history endpoint
  const historyListRes = await makeRequest({
    hostname: "localhost",
    port: 3000,
    path: "/api/renewals/history",
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const histEntries = (historyListRes.data.data || []).filter((h) => h.renewalId === testRenewalId);
  assert(histEntries.length === 1, "GET /api/renewals/history returns exactly 1 entry (no duplicates)");

  // TEST 5: REMINDER COMPLETION STATUS TOGGLE
  console.log("\n[Test 5] Reminder Completed & Reopened Status");
  const completeRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${testRenewalId}/reminder-status`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
    },
    { reminderCompleted: true }
  );

  assert(completeRes.status === 200 && completeRes.data.ok, "Assigned employee can mark reminder completed");
  const dbRecord5 = await db.getRenewalById(testRenewalId);
  assert(dbRecord5.reminderCompleted === true, "reminderCompleted: true persisted in database");

  const reopenRes = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${testRenewalId}/reminder-status`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
    },
    { reminderCompleted: false }
  );

  assert(reopenRes.status === 200 && reopenRes.data.ok, "Assigned employee can reopen reminder");
  const dbRecord5b = await db.getRenewalById(testRenewalId);
  assert(dbRecord5b.reminderCompleted === false, "reminderCompleted: false persisted in database");

  // TEST 6: RBAC PERMISSIONS ENFORCEMENT
  console.log("\n[Test 6] Role-Based Access Control (RBAC) Enforcement");

  // 6a: Viewer cannot create
  const viewerCreate = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/renewals",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerToken}`,
      },
    },
    { name: "Unauthorized Viewer Renewal", category: "License", expiryDate: "2027-01-01" }
  );
  assert(viewerCreate.status === 403, "Viewer cannot create renewals (403 Forbidden)");

  // 6b: Viewer cannot edit
  const viewerEdit = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${testRenewalId}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerToken}`,
      },
    },
    { cost: 99999 }
  );
  assert(viewerEdit.status === 403, "Viewer cannot edit renewals (403 Forbidden)");

  // 6c: Viewer cannot delete
  const viewerDelete = await makeRequest({
    hostname: "localhost",
    port: 3000,
    path: `/api/renewals/${testRenewalId}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert(viewerDelete.status === 403, "Viewer cannot delete renewals (403 Forbidden)");

  // 6d: Employee cannot edit
  const empEdit = await makeRequest(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${testRenewalId}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
    },
    { cost: 77777 }
  );
  assert(empEdit.status === 403, "Employee cannot edit renewals (403 Forbidden)");

  // 6e: Employee cannot delete
  const empDelete = await makeRequest({
    hostname: "localhost",
    port: 3000,
    path: `/api/renewals/${testRenewalId}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${empToken}` },
  });
  assert(empDelete.status === 403, "Employee cannot delete renewals (403 Forbidden)");

  // TEST 7: AUDIT LOGS GENERATION & QUERYING
  console.log("\n[Test 7] Audit Logs Generation & Querying");
  const auditRes = await makeRequest({
    hostname: "localhost",
    port: 3000,
    path: "/api/audit/logs?limit=50",
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert(auditRes.status === 200 && auditRes.data.ok, "Admin can query audit logs");
  const auditLogs = auditRes.data.logs || [];
  const testActions = auditLogs
    .filter((l) => l.targetId === testRenewalId || (l.details && l.details.includes("Sync Test AWS")))
    .map((l) => l.action);

  console.log("    Logged actions for test record:", testActions);
  assert(testActions.includes("RENEWAL_CREATED"), "Audit log recorded RENEWAL_CREATED");
  assert(testActions.includes("RENEWAL_ASSIGNED"), "Audit log recorded RENEWAL_ASSIGNED");
  assert(testActions.includes("RENEWAL_UPDATED"), "Audit log recorded RENEWAL_UPDATED");
  assert(testActions.includes("REMINDER_SNOOZED"), "Audit log recorded REMINDER_SNOOZED");
  assert(testActions.includes("RENEWAL_MARKED_RENEWED"), "Audit log recorded RENEWAL_MARKED_RENEWED");
  assert(testActions.includes("REMINDER_COMPLETED"), "Audit log recorded REMINDER_COMPLETED");
  assert(testActions.includes("REMINDER_REOPENED"), "Audit log recorded REMINDER_REOPENED");

  // TEST 8: DELETE RENEWAL & PERSISTENCE
  console.log("\n[Test 8] Delete Renewal Action & Clean Removal");
  const deleteRes = await makeRequest({
    hostname: "localhost",
    port: 3000,
    path: `/api/renewals/${testRenewalId}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert(deleteRes.status === 200 && deleteRes.data.ok, "Admin can delete renewal record");

  // Verify DB reflects deletion
  const dbRecordDeleted = await db.getRenewalById(testRenewalId);
  assert(dbRecordDeleted === null, "Deleted renewal record no longer exists in database");

  // Verify GET /api/renewals/:id returns 404
  const getDeletedRes = await makeRequest({
    hostname: "localhost",
    port: 3000,
    path: `/api/renewals/${testRenewalId}`,
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(getDeletedRes.status === 404, "GET /api/renewals/:id returns 404 for deleted record");

  // Verify Audit Log records RENEWAL_DELETED
  const finalAuditRes = await makeRequest({
    hostname: "localhost",
    port: 3000,
    path: "/api/audit/logs?limit=10",
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const recentLogs = finalAuditRes.data.logs || [];
  const hasDeleteAudit = recentLogs.some((l) => l.action === "RENEWAL_DELETED" && l.targetId === testRenewalId);
  assert(hasDeleteAudit, "Audit log recorded RENEWAL_DELETED with targetId");

  console.log("\n================================================================================");
  console.log(`TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
