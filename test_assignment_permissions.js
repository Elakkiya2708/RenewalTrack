const http = require("http");

async function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://localhost:3000${path}`,
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

async function runTests() {
  console.log("=================================================================");
  console.log(" RenewGuard: Renewal Assignment & Role Isolation Verification    ");
  console.log("=================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
    }
  }

  // 1. Authenticate users
  console.log("1. Authenticating test users...");
  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiyaohai@gmail.com", password: "Admin@1234" },
  });
  assert(adminLogin.status === 200, "Admin (Elakkiya) logged in successfully");
  const adminToken = adminLogin.data.token;

  const emp1Login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "david.kim@renewaltrack.com", password: "Demo@1234" },
  });
  assert(emp1Login.status === 200, "Employee 1 (David Kim) logged in successfully");
  const emp1Token = emp1Login.data.token;
  const emp1Id = emp1Login.data.user.id;

  const emp2Login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiyaaaaa27@gmail.com", password: "elakkiya" },
  });
  assert(emp2Login.status === 200, "Employee 2 (raja) logged in successfully");
  const emp2Token = emp2Login.data.token;
  const emp2Id = emp2Login.data.user.id;

  const viewerLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "priya.nair@renewaltrack.com", password: "Demo@1234" },
  });
  assert(viewerLogin.status === 200, "Viewer (Priya Nair) logged in successfully");
  const viewerToken = viewerLogin.data.token;
  const viewerId = viewerLogin.data.user.id;

  // 2. Test Assignees Endpoint (Active Employees Only)
  console.log("\n2. Testing GET /api/renewals/assignees...");
  const assigneesRes = await request("/api/renewals/assignees", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(assigneesRes.status === 200 && assigneesRes.data.ok, "Assignees list returned successfully");
  const assignees = assigneesRes.data.data;
  const hasOnlyEmployees = assignees.every((u) => u.role === "Employee" && u.status !== "deactivated");
  assert(hasOnlyEmployees, "All users in assignees dropdown are active Employees only");
  const hasAdmin = assignees.some((u) => u.role === "Admin" || u.email === "elakkiyaohai@gmail.com");
  assert(!hasAdmin, "Assignees list strictly excludes Admin");
  const hasViewer = assignees.some((u) => u.role === "Viewer" || u.email === "priya.nair@renewaltrack.com");
  assert(!hasViewer, "Assignees list strictly excludes Viewer");

  // 3. Admin Assigns Renewal to Active Employee
  console.log("\n3. Testing Admin assigning renewal to Employee 1...");
  const createAssigned = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: "Cloud Server Contract Alpha",
      category: "Software",
      expiryDate: "2026-11-30",
      assignedToId: emp1Id,
    },
  });
  assert(createAssigned.status === 201 && createAssigned.data.ok, "Admin created renewal assigned to Employee 1");
  const renewal1 = createAssigned.data.data;
  assert(renewal1.assignedToId === emp1Id, "Renewal assignedToId matches Employee 1 ID");
  assert(renewal1.assignedToName === "David Kim", "Renewal assignedToName set to Employee 1");

  // 4. Admin Attempting to Assign to Viewer or Admin is Rejected
  console.log("\n4. Testing assignment rejection for non-Employees...");
  const assignToViewer = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: "Unauthorized Viewer Assignment",
      category: "Service",
      expiryDate: "2026-12-31",
      assignedToId: viewerId,
    },
  });
  assert(assignToViewer.status === 400, "Assigning renewal to Viewer rejected with 400 Bad Request");

  // 5. Admin Reassigns Renewal to Employee 2
  console.log("\n5. Testing Admin reassigning renewal to Employee 2...");
  const reassignRes = await request(`/api/renewals/${renewal1.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      assignedToId: emp2Id,
    },
  });
  assert(reassignRes.status === 200 && reassignRes.data.ok, "Admin reassigns renewal to Employee 2 successfully");
  assert(reassignRes.data.data.assignedToId === emp2Id, "Renewal reassignedToId matches Employee 2 ID");

  // 6. Admin Attempting to Reassign to Viewer is Rejected
  console.log("\n6. Testing reassignment rejection for non-Employees...");
  const reassignToViewer = await request(`/api/renewals/${renewal1.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      assignedToId: viewerId,
    },
  });
  assert(reassignToViewer.status === 400, "Reassigning renewal to Viewer rejected with 400 Bad Request");

  // 7. Employee 1 Isolation: Can view Employee 2's renewal, but has read-only access (no renew, no edit, no delete)
  console.log("\n7. Testing Employee view access and action isolation...");
  const emp1Renewals = await request("/api/renewals", {
    headers: { Authorization: `Bearer ${emp1Token}` },
  });
  assert(emp1Renewals.status === 200, "Employee 1 fetched renewals list");
  const emp1List = emp1Renewals.data.data;
  const canEmp1SeeRenewal1 = emp1List.some((r) => r.id === renewal1.id);
  assert(canEmp1SeeRenewal1, "Employee 1 CAN view renewal reassigned to Employee 2 in GET /api/renewals");

  // Employee 2 also sees it
  const emp2Renewals = await request("/api/renewals", {
    headers: { Authorization: `Bearer ${emp2Token}` },
  });
  const emp2List = emp2Renewals.data.data;
  const canEmp2SeeRenewal1 = emp2List.some((r) => r.id === renewal1.id);
  assert(canEmp2SeeRenewal1, "Employee 2 sees their assigned renewal in GET /api/renewals");

  // Employee 1 can view details via GET /api/renewals/:id
  const emp1GetSingle = await request(`/api/renewals/${renewal1.id}`, {
    headers: { Authorization: `Bearer ${emp1Token}` },
  });
  assert(emp1GetSingle.status === 200, "Employee 1 CAN view renewal details via GET /:id (200 OK)");

  // Employee 1 attempts PUT /api/renewals/:id on renewal1 -> 403 Forbidden
  const emp1Edit = await request(`/api/renewals/${renewal1.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: { name: "Hacked by unassigned employee" },
  });
  assert(emp1Edit.status === 403, "Employee 1 cannot edit unassigned renewal via PUT /:id (403 Forbidden)");

  // Employee 1 attempts DELETE /api/renewals/:id on renewal1 -> 403 Forbidden
  const emp1Del = await request(`/api/renewals/${renewal1.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${emp1Token}` },
  });
  assert(emp1Del.status === 403, "Employee 1 cannot delete unassigned renewal via DELETE /:id (403 Forbidden)");

  // Employee 1 attempts POST /api/renewals/:id/mark-renewed on renewal1 -> 403 Forbidden
  const emp1Renew = await request(`/api/renewals/${renewal1.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp1Token}` },
    body: { newExpiryDate: "2027-11-30" },
  });
  assert(emp1Renew.status === 403, "Employee 1 cannot mark-renew renewal assigned to Employee 2 (403 Forbidden)");

  // 8. Employee 2 Cannot Reassign their Renewal
  console.log("\n8. Testing Employee cannot reassign renewals...");
  const emp2ReassignAttempt = await request(`/api/renewals/${renewal1.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { assignedToId: emp1Id },
  });
  assert(emp2ReassignAttempt.status === 403, "Employee 2 cannot reassign renewal to another user (403 Forbidden)");

  // 9. Employee 2 Can Manage their Assigned Renewal
  console.log("\n9. Testing Employee 2 managing their assigned renewal...");
  const emp2EditAttempt = await request(`/api/renewals/${renewal1.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { notes: "Verified and up to date by raja." },
  });
  assert(emp2EditAttempt.status === 403, "Employee 2 cannot edit general renewal details (Admin only, 403 Forbidden)");

  const emp2ValidRenew = await request(`/api/renewals/${renewal1.id}/mark-renewed`, {
    method: "POST",
    headers: { Authorization: `Bearer ${emp2Token}` },
    body: { newExpiryDate: "2027-11-30", notes: "Renewed for 1 year" },
  });
  assert(emp2ValidRenew.status === 200 && emp2ValidRenew.data.ok, "Employee 2 CAN renew their assigned renewal (200 OK)");

  // 10. Clean up test record using Admin token
  console.log("\n10. Cleaning up test records...");
  const cleanup = await request(`/api/renewals/${renewal1.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(cleanup.status === 200, "Test renewal cleaned up by Admin");

  console.log("\n=================================================================");
  console.log(` Test Results: ${passed} / ${total} Passed (${Math.round((passed / total) * 100)}%)`);
  console.log("=================================================================\n");

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
