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
  console.log(" RenewalTrack: Primary Admin, Demo Removal & RBAC Automated Tests  ");
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

  // 1. Test Demo Admin Rejection
  console.log("1. Testing Demo Admin Rejection...");
  const demoLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "demo@renewaltrack.com", password: "Demo@1234" },
  });
  assert(
    demoLogin.status === 403,
    `demo@renewaltrack.com login rejected with 403 (got status: ${demoLogin.status})`
  );

  // 2. Test Primary Admin Login
  console.log("\n2. Testing Primary Admin (elakkiya270806@gmail.com)...");
  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiya270806@gmail.com", password: "Admin@1234" },
  });
  assert(
    adminLogin.status === 200 && adminLogin.data.ok === true,
    `Primary Admin elakkiya270806@gmail.com login succeeded with 200 OK`
  );
  assert(
    adminLogin.data.user.role === "Admin",
    `elakkiya270806@gmail.com role is Admin (got: ${adminLogin.data?.user?.role})`
  );
  assert(
    adminLogin.data.user.isPrimaryAdmin === true,
    `elakkiya270806@gmail.com is flagged as Primary Admin`
  );
  const adminToken = adminLogin.data.token;

  // 3. Test Employee Login
  console.log("\n3. Testing Employee Account (elakkiyaohai@gmail.com)...");
  const elakkiyaEmpLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiyaohai@gmail.com", password: "Admin@1234" },
  });
  assert(
    elakkiyaEmpLogin.status === 200 && elakkiyaEmpLogin.data.ok === true,
    `elakkiyaohai@gmail.com login succeeded with 200 OK`
  );
  assert(
    elakkiyaEmpLogin.data.user.role === "Employee",
    `elakkiyaohai@gmail.com role verified as Employee (got: ${elakkiyaEmpLogin.data?.user?.role})`
  );
  assert(
    !elakkiyaEmpLogin.data.user.isPrimaryAdmin,
    `elakkiyaohai@gmail.com is not flagged as Primary Admin`
  );
  const elakkiyaEmpToken = elakkiyaEmpLogin.data.token;

  console.log("\n3b. Testing Legacy Employee Account (David Kim)...");
  const empLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "david.kim@renewaltrack.com", password: "Demo@1234" },
  });
  assert(
    empLogin.status === 200 && empLogin.data.ok === true,
    `Employee login succeeded`
  );
  assert(
    empLogin.data.user.role === "Employee",
    `Employee role verified as Employee (got: ${empLogin.data?.user?.role})`
  );
  assert(
    !empLogin.data.user.isPrimaryAdmin,
    `Employee is not flagged as Primary Admin`
  );
  const empToken = empLogin.data.token;

  // 4. Test Viewer Login
  console.log("\n4. Testing Viewer Account (Priya Nair)...");
  const viewerLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "priya.nair@renewaltrack.com", password: "Demo@1234" },
  });
  assert(
    viewerLogin.status === 200 && viewerLogin.data.ok === true,
    `Viewer login succeeded`
  );
  assert(
    viewerLogin.data.user.role === "Viewer",
    `Viewer role verified as Viewer (got: ${viewerLogin.data?.user?.role})`
  );
  const viewerToken = viewerLogin.data.token;

  // 5. Team Members Access Control & Genuine Users
  console.log("\n5. Testing Team Members Access Control & Genuine Users List...");
  const adminMembersRes = await request("/api/team/members", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    adminMembersRes.status === 200 && adminMembersRes.data.ok === true,
    `Admin can access /api/team/members`
  );
  const members = adminMembersRes.data.data;
  const hasDemo = members.some((m) => (m.email || "").toLowerCase() === "demo@renewaltrack.com");
  assert(!hasDemo, `demo@renewaltrack.com is NOT present in Team Members list`);

  const primaryInList = members.find((m) => (m.email || "").toLowerCase() === "elakkiya270806@gmail.com");
  assert(
    !!primaryInList && primaryInList.isPrimaryAdmin === true && primaryInList.role === "Admin",
    `elakkiya270806@gmail.com is present in Team Members list and marked as Primary Admin`
  );

  const elakkiyaOhaiInList = members.find((m) => (m.email || "").toLowerCase() === "elakkiyaohai@gmail.com");
  assert(
    !!elakkiyaOhaiInList && elakkiyaOhaiInList.role === "Employee" && !elakkiyaOhaiInList.isPrimaryAdmin,
    `elakkiyaohai@gmail.com is present in Team Members list and marked as Employee`
  );

  const adminCount = members.filter((m) => m.role === "Admin").length;
  assert(
    adminCount === 1,
    `Exactly 1 Admin exists across all team members (found: ${adminCount})`
  );

  const viewerMembersRes = await request("/api/team/members", {
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert(
    viewerMembersRes.status === 403,
    `Viewer is denied access to /api/team/members (got 403)`
  );

  const empMembersRes = await request("/api/team/members", {
    headers: { Authorization: `Bearer ${empToken}` },
  });
  assert(
    empMembersRes.status === 403,
    `Employee is denied access to /api/team/members (got 403)`
  );

  const elakkiyaEmpMembersRes = await request("/api/team/members", {
    headers: { Authorization: `Bearer ${elakkiyaEmpToken}` },
  });
  assert(
    elakkiyaEmpMembersRes.status === 403,
    `elakkiyaohai@gmail.com as Employee is denied access to /api/team/members (got 403)`
  );

  // 6. Protecting Primary Admin from accidental demotion or deactivation
  console.log("\n6. Testing Primary Admin Protection...");
  const demoteRes = await request(`/api/team/members/${primaryInList.id}/role`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { role: "Viewer" },
  });
  assert(
    demoteRes.status === 400 || demoteRes.status === 403,
    `Demoting Primary Admin rejected (status: ${demoteRes.status}, error: "${demoteRes.data?.error}")`
  );

  const deactivateRes = await request(`/api/team/members/${primaryInList.id}/status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { status: "deactivated" },
  });
  assert(
    deactivateRes.status === 400 || deactivateRes.status === 403,
    `Deactivating Primary Admin rejected (status: ${deactivateRes.status}, error: "${deactivateRes.data?.error}")`
  );

  // 7. Testing Public Registration Security
  console.log("\n7. Testing Public Registration Security...");
  const regDemoAttempt = await request("/api/auth/register", {
    method: "POST",
    body: {
      fullName: "Test Demo",
      email: "demo@renewaltrack.com",
      password: "Password@123",
    },
  });
  assert(
    regDemoAttempt.status === 400,
    `Registration with demo email blocked (status: ${regDemoAttempt.status})`
  );

  const regAttempt = await request("/api/auth/register", {
    method: "POST",
    body: {
      fullName: "New Reg User",
      email: `testuser_${Date.now()}@test.com`,
      password: "Password@123",
      role: "Admin", // Attempt to request Admin role
    },
  });
  assert(
    regAttempt.status === 403 || (regAttempt.status === 201 && regAttempt.data.user.role === "Employee"),
    `Public registration cannot choose Admin (status: ${regAttempt.status})`
  );

  // 8. Role-Based Permissions for Renewals
  console.log("\n8. Testing Role-Based Renewal Permissions...");
  // Viewer attempts to create a renewal -> rejected
  const viewerCreate = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${viewerToken}` },
    body: {
      name: "Viewer Test Contract",
      category: "Contract",
      expiryDate: "2026-12-31",
    },
  });
  assert(
    viewerCreate.status === 403,
    `Viewer cannot create renewal (status 403: "${viewerCreate.data?.error}")`
  );

  // Employee creates a renewal -> succeeds
  const empCreate = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${empToken}` },
    body: {
      name: "Employee Project License",
      category: "License",
      expiryDate: "2026-12-31",
      responsibleEmail: "david.kim@renewaltrack.com",
      responsiblePerson: "David Kim",
    },
  });
  assert(
    empCreate.status === 201 && empCreate.data.ok === true,
    `Employee can create renewal record`
  );
  const createdRenewalId = empCreate.data.data.id;

  // Viewer attempts to delete -> rejected
  const viewerDelete = await request(`/api/renewals/${createdRenewalId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${viewerToken}` },
  });
  assert(
    viewerDelete.status === 403,
    `Viewer cannot delete renewal (status 403)`
  );

  // Clean up test record using Admin token
  const adminDelete = await request(`/api/renewals/${createdRenewalId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(
    adminDelete.status === 200,
    `Admin can delete renewal for cleanup (status 200)`
  );

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
