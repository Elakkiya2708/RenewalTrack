const http = require("http");
const fs = require("fs");
const path = require("path");

async function request(pathUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://localhost:3000${pathUrl}`,
      {
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ status: res.statusCode, text: body });
          }
        });
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTestSuite() {
  console.log("================================================================================");
  console.log("  RenewalTrack: Renewal Assignment & Permission Verification Test Suite           ");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
    }
  }

  // 1. Authenticate users
  console.log("[1] Authenticating test accounts...");
  const adminRes = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiyaohai@gmail.com", password: "Admin@1234" },
  });
  assert(adminRes.status === 200 && adminRes.data.token, "Admin (Elakkiya) authenticated");
  const adminToken = adminRes.data.token;

  const emp1Res = await request("/api/auth/login", {
    method: "POST",
    body: { email: "david.kim@renewaltrack.com", password: "Demo@1234" },
  });
  assert(emp1Res.status === 200 && emp1Res.data.token, "Employee 1 (David Kim) authenticated");
  const emp1Token = emp1Res.data.token;
  const emp1Id = emp1Res.data.user.id;
  const emp1Email = emp1Res.data.user.email;

  const emp2Res = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiyaaaaa27@gmail.com", password: "elakkiya" },
  });
  assert(emp2Res.status === 200 && emp2Res.data.token, "Employee 2 (raja) authenticated");
  const emp2Token = emp2Res.data.token;
  const emp2Id = emp2Res.data.user.id;
  const emp2Email = emp2Res.data.user.email;

  const viewerRes = await request("/api/auth/login", {
    method: "POST",
    body: { email: "priya.nair@renewaltrack.com", password: "Demo@1234" },
  });
  assert(viewerRes.status === 200 && viewerRes.data.token, "Viewer (Priya Nair) authenticated");
  const viewerToken = viewerRes.data.token;
  const viewerId = viewerRes.data.user.id;

  // 2. Active Employee Assignees List
  console.log("\n[2] Checking GET /api/renewals/assignees...");
  const assigneesRes = await request("/api/renewals/assignees", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(assigneesRes.status === 200 && assigneesRes.data.ok, "Assignees list returned HTTP 200");
  const assignees = assigneesRes.data.data;
  assert(
    assignees.every((u) => u.role === "Employee" && u.status !== "deactivated"),
    "Assignees list contains only active Employees"
  );
  assert(!assignees.some((u) => u.role === "Admin" || u.email === "elakkiyaohai@gmail.com"), "Assignees list strictly excludes Admin");
  assert(!assignees.some((u) => u.role === "Viewer" || u.email === "priya.nair@renewaltrack.com"), "Assignees list strictly excludes Viewer");

  // 3. Admin Assigns Existing Renewal without Creating Duplicates
  console.log("\n[3] Testing Admin assigning existing unassigned renewal to Employee 1...");
  const initialRenewalsRes = await request("/api/renewals", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(initialRenewalsRes.status === 200, "Fetched existing renewals");
  const initialCount = initialRenewalsRes.data.data.length;
  console.log(`      Total existing renewals count: ${initialCount}`);

  // Find an unassigned renewal or create a new test renewal to assign
  let testRecord = initialRenewalsRes.data.data.find((r) => !r.assignedToId && !r.assigned_to_id);
  let createdForTest = false;
  if (!testRecord) {
    const createRes = await request("/api/renewals", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: "Test Assignment Server Contract",
        category: "Software",
        expiryDate: "2027-06-30",
        recurringCycle: "Yearly",
        cost: 12000,
      },
    });
    testRecord = createRes.data.data;
    createdForTest = true;
  }

  const recordId = testRecord.id;
  const beforeAssignCount = (await request("/api/renewals", { headers: { Authorization: `Bearer ${adminToken}` } })).data.data.length;

  const assignRes = await request(`/api/renewals/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      assignedToId: emp1Id,
    },
  });
  assert(assignRes.status === 200 && assignRes.data.ok, "Admin successfully assigned existing renewal to Employee 1");
  assert(assignRes.data.data.assignedToId === emp1Id, "Renewal assignedToId matches Employee 1");
  assert(assignRes.data.data.assignedToEmail === emp1Email, "Renewal assignedToEmail matches Employee 1 email");

  const afterAssignCount = (await request("/api/renewals", { headers: { Authorization: `Bearer ${adminToken}` } })).data.data.length;
  assert(beforeAssignCount === afterAssignCount, "Assigning existing renewal does NOT create duplicate records (count identical)");

  // 4. Other Employee View Access vs Action Isolation
  console.log("\n[4] Testing Other Employee (Employee 2) view access vs action permissions...");
  // Employee 2 can view all renewals in list
  const emp2ListRes = await request("/api/renewals", {
    headers: { Authorization: `Bearer ${emp2Token}` },
  });
  assert(emp2ListRes.status === 200, "Employee 2 can fetch renewals list (HTTP 200)");
  const emp2CanSeeRecord = emp2ListRes.data.data.some((r) => r.id === recordId);
  assert(emp2CanSeeRecord, "Employee 2 CAN view renewal assigned to Employee 1 in renewals list");

  // Employee 2 can view single renewal details
  const emp2SingleRes = await request(`/api/renewals/${recordId}`, {
    headers: { Authorization: `Bearer ${emp2Token}` },
  });
  assert(emp2SingleRes.status === 200 && emp2SingleRes.data.ok, "Employee 2 CAN view single renewal details via GET /:id");

  // Employee 2 CANNOT renew Employee 1's assigned record
  const emp2RenewRes = await request(`/api/renewals/${recordId}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { newExpiryDate: "2028-06-30" },
  });
  assert(emp2RenewRes.status === 403, "Employee 2 CANNOT renew renewal assigned to Employee 1 (403 Forbidden)");

  // Employee 2 CANNOT edit renewal
  const emp2EditRes = await request(`/api/renewals/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { name: "Unauthorized Rename by Employee 2" },
  });
  assert(emp2EditRes.status === 403, "Employee 2 CANNOT edit renewal (403 Forbidden)");

  // Employee 2 CANNOT delete renewal
  const emp2DelRes = await request(`/api/renewals/${recordId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${emp2Token}` },
  });
  assert(emp2DelRes.status === 403, "Employee 2 CANNOT delete renewal (403 Forbidden)");

  // Employee 2 CANNOT snooze reminder on Employee 1's renewal
  const emp2SnoozeRes = await request(`/api/renewals/${recordId}/snooze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { days: 7 },
  });
  assert(emp2SnoozeRes.status === 403, "Employee 2 CANNOT snooze reminder on Employee 1's renewal (403 Forbidden)");

  // Employee 2 CANNOT toggle reminder on Employee 1's renewal
  const emp2StatusRes = await request(`/api/renewals/${recordId}/reminder-status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { reminderCompleted: true },
  });
  assert(emp2StatusRes.status === 403, "Employee 2 CANNOT update reminder on Employee 1's renewal (403 Forbidden)");

  // 5. Assigned Employee (Employee 1) Can Renew and Manage Record
  console.log("\n[5] Testing Assigned Employee (Employee 1) renewing their assigned renewal...");
  const oldExpiry = testRecord.expiryDate;
  const newExpiry = "2028-06-30";
  const emp1RenewRes = await request(`/api/renewals/${recordId}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: {
      newExpiryDate: newExpiry,
      recurringCycle: "Yearly",
      notes: "Renewed by assigned Employee David Kim",
    },
  });
  assert(emp1RenewRes.status === 200 && emp1RenewRes.data.ok, "Assigned Employee 1 CAN renew their assigned renewal (200 OK)");
  assert(emp1RenewRes.data.data.expiryDate === newExpiry, "Saved new expiry date matches in response");
  assert(emp1RenewRes.data.data.reminderCompleted === false, "Reminder completed reset to false");

  // Verify database persistence
  const dbVerified = await request(`/api/renewals/${recordId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(dbVerified.data.data.expiryDate === newExpiry, "Database persistence verified: newExpiryDate is saved");
  assert(dbVerified.data.data.reminderDate.startsWith("2028-06"), "Database persistence verified: reminderDate advanced to new cycle");
  assert(Array.isArray(dbVerified.data.data.history) && dbVerified.data.data.history.length > 0, "Database persistence verified: history entry saved");

  // Assigned Employee 1 can snooze and toggle reminders
  const emp1SnoozeRes = await request(`/api/renewals/${recordId}/snooze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: { days: 10 },
  });
  assert(emp1SnoozeRes.status === 200 && emp1SnoozeRes.data.ok, "Assigned Employee 1 CAN snooze reminder (200 OK)");

  const emp1DoneRes = await request(`/api/renewals/${recordId}/reminder-status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: { reminderCompleted: true },
  });
  assert(emp1DoneRes.status === 200 && emp1DoneRes.data.ok, "Assigned Employee 1 CAN complete reminder (200 OK)");

  // 6. Admin Reassigns Renewal to Employee 2
  console.log("\n[6] Testing Admin reassigning renewal to Employee 2...");
  const reassignRes = await request(`/api/renewals/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      assignedToId: emp2Id,
    },
  });
  assert(reassignRes.status === 200 && reassignRes.data.ok, "Admin reassigns renewal to Employee 2 successfully");
  assert(reassignRes.data.data.assignedToId === emp2Id, "Reassigned renewal has Employee 2 ID");

  // Now Employee 1 has read-only access (cannot renew)
  const emp1ReassignRenew = await request(`/api/renewals/${recordId}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: { newExpiryDate: "2029-06-30" },
  });
  assert(emp1ReassignRenew.status === 403, "Employee 1 CANNOT renew after reassignment to Employee 2 (403 Forbidden)");

  // Now Employee 2 CAN renew
  const emp2ReassignRenew = await request(`/api/renewals/${recordId}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { newExpiryDate: "2029-06-30", notes: "Renewed by newly assigned Employee 2 (raja)" },
  });
  assert(emp2ReassignRenew.status === 200 && emp2ReassignRenew.data.ok, "Employee 2 CAN renew their newly assigned renewal (200 OK)");
  assert(emp2ReassignRenew.data.data.expiryDate === "2029-06-30", "Expiry updated to 2029-06-30");

  // 7. Admin Can Renew ANY Renewal
  console.log("\n[7] Testing Admin can renew any renewal...");
  const adminRenewRes = await request(`/api/renewals/${recordId}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { newExpiryDate: "2030-06-30", notes: "Renewed by Admin Elakkiya" },
  });
  assert(adminRenewRes.status === 200 && adminRenewRes.data.ok, "Admin CAN renew any renewal regardless of assignee (200 OK)");

  // 8. Reassignment to Non-Employees (Viewer) is Blocked
  console.log("\n[8] Testing rejection of assignment to Viewer...");
  const assignViewerRes = await request(`/api/renewals/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { assignedToId: viewerId },
  });
  assert(assignViewerRes.status === 400, "Assigning renewal to Viewer rejected with HTTP 400 Bad Request");

  // 9. Viewer Role Permissions: View Only
  console.log("\n[9] Testing Viewer role permissions (Read-Only)...");
  const viewerGetRes = await request(`/api/renewals/${recordId}`, {
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert(viewerGetRes.status === 200, "Viewer CAN view renewal (200 OK)");

  const viewerRenewRes = await request(`/api/renewals/${recordId}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: { newExpiryDate: "2031-06-30" },
  });
  assert(viewerRenewRes.status === 403, "Viewer CANNOT renew (403 Forbidden)");

  const viewerEditRes = await request(`/api/renewals/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: { name: "Viewer Name Change" },
  });
  assert(viewerEditRes.status === 403, "Viewer CANNOT edit (403 Forbidden)");

  const viewerDeleteRes = await request(`/api/renewals/${recordId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert(viewerDeleteRes.status === 403, "Viewer CANNOT delete (403 Forbidden)");

  // 10. Unassigned Record Permissions
  console.log("\n[10] Testing Unassigned Renewal permissions...");
  // Unassign record
  await request(`/api/renewals/${recordId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { assignedToId: null },
  });
  const unassignedEmpRenew = await request(`/api/renewals/${recordId}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: { newExpiryDate: "2031-06-30" },
  });
  assert(unassignedEmpRenew.status === 403, "Employee CANNOT renew unassigned renewal (403 Forbidden)");

  const unassignedAdminRenew = await request(`/api/renewals/${recordId}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { newExpiryDate: "2031-06-30" },
  });
  assert(unassignedAdminRenew.status === 200, "Admin CAN renew unassigned renewal (200 OK)");

  // 11. Cleanup test record if created for test
  if (createdForTest) {
    console.log("\n[11] Cleaning up created test record...");
    const cleanup = await request(`/api/renewals/${recordId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(cleanup.status === 200, "Cleaned up temporary test record");
  }

  console.log("\n================================================================================");
  console.log(`  Test Results: ${passed} / ${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log("================================================================================\n");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
