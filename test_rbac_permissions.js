/* ==========================================================================
   test_rbac_permissions.js — Verification test for Role-Based Action Permissions
   Tests Admin, Employee, and Viewer accounts across API routes & data layer.
   ========================================================================== */

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

async function login(email, password) {
  const res = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email, password }
  );
  if (res.status === 200 && res.body && res.body.token) {
    return { token: res.body.token, user: res.body.user };
  }
  throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body || res.raw)}`);
}

async function run() {
  console.log("=== RenewGuard RBAC & Action Permissions Test Suite ===\n");
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

  // 1. Authenticate users
  console.log("1. Authenticating Admin, Employee, and Viewer accounts...");
  const adminAuth = await login("elakkiyaohai@gmail.com", "Admin@1234");
  assert(adminAuth.user.role === "Admin", "Admin logged in successfully (Role: Admin)");

  const empAuth = await login("david.kim@renewaltrack.com", "Demo@1234");
  assert(empAuth.user.role === "Employee", "Employee logged in successfully (Role: Employee, ID: usr-2)");

  const viewerAuth = await login("priya.nair@renewaltrack.com", "Demo@1234");
  assert(viewerAuth.user.role === "Viewer", "Viewer logged in successfully (Role: Viewer)");

  // 2. Admin creates an assigned renewal and an unassigned renewal for testing
  console.log("\n2. Admin creates test renewals...");
  const createAssignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/renewals",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAuth.token}`,
      },
    },
    {
      name: "RBAC Test - Assigned to David Kim",
      category: "Software License",
      priority: "High",
      issueDate: "2026-10-01",
      expiryDate: "2026-12-31",
      reminderDate: "2026-12-01",
      cost: 500,
      currency: "USD",
      organization: "Cloud Inc",
      assignedToId: "usr-2",
    }
  );
  assert(createAssignedRes.status === 201 && createAssignedRes.body.ok, "Admin can create renewal assigned to Employee (usr-2)");
  const assignedRenewal = createAssignedRes.body.data;

  const createUnassignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/renewals",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAuth.token}`,
      },
    },
    {
      name: "RBAC Test - Unassigned Record",
      category: "Warranty",
      priority: "Low",
      issueDate: "2026-10-01",
      expiryDate: "2026-11-30",
      reminderDate: "2026-11-01",
      cost: 250,
      currency: "USD",
      organization: "Hardware Corp",
    }
  );
  assert(createUnassignedRes.status === 201 && createUnassignedRes.body.ok, "Admin can create unassigned renewal");
  const unassignedRenewal = createUnassignedRes.body.data;

  // 3. Employee Permission Tests: Edit & Delete MUST be rejected
  console.log("\n3. Testing Employee Action Permissions (Edit & Delete restrictions)...");
  
  // 3a. Employee direct edit assigned renewal -> MUST FAIL (403)
  const empEditAssignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAuth.token}`,
      },
    },
    { name: "Attempted Name Edit by Employee" }
  );
  assert(
    empEditAssignedRes.status === 403 &&
    empEditAssignedRes.body &&
    empEditAssignedRes.body.error.includes("Only Administrators can edit"),
    "Employee CANNOT edit assigned renewal via PUT /api/renewals/:id (403 Forbidden)"
  );

  // 3b. Employee direct edit unassigned renewal -> MUST FAIL (403)
  const empEditUnassignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${unassignedRenewal.id}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAuth.token}`,
      },
    },
    { name: "Attempted Name Edit by Employee on Unassigned" }
  );
  assert(
    empEditUnassignedRes.status === 403,
    "Employee CANNOT edit unassigned renewal via PUT /api/renewals/:id (403 Forbidden)"
  );

  // 3c. Employee direct delete assigned renewal -> MUST FAIL (403)
  const empDeleteAssignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}`,
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${empAuth.token}`,
      },
    }
  );
  assert(
    empDeleteAssignedRes.status === 403 &&
    empDeleteAssignedRes.body &&
    empDeleteAssignedRes.body.error.includes("Only Administrators can delete"),
    "Employee CANNOT delete assigned renewal via DELETE /api/renewals/:id (403 Forbidden)"
  );

  // 3d. Employee direct delete unassigned renewal -> MUST FAIL (403)
  const empDeleteUnassignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${unassignedRenewal.id}`,
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${empAuth.token}`,
      },
    }
  );
  assert(
    empDeleteUnassignedRes.status === 403,
    "Employee CANNOT delete unassigned renewal via DELETE /api/renewals/:id (403 Forbidden)"
  );

  // 4. Employee Permitted Assigned-Renewal Actions
  console.log("\n4. Testing Employee Permitted Assigned-Renewal Actions (Renew, Snooze, Reminder Status)...");

  // 4a. Employee marks assigned renewal as renewed -> Allowed (200)
  const empRenewAssignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}/mark-renewed`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAuth.token}`,
      },
    },
    {
      newExpiryDate: "2027-12-31",
      notes: "Renewed by employee David Kim",
    }
  );
  assert(empRenewAssignedRes.status === 200 && empRenewAssignedRes.body.ok, "Employee CAN mark assigned renewal as renewed (200 OK)");

  // 4b. Employee snoozes reminder on assigned renewal -> Allowed (200)
  const empSnoozeAssignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}/snooze`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAuth.token}`,
      },
    },
    { days: 14 }
  );
  assert(empSnoozeAssignedRes.status === 200 && empSnoozeAssignedRes.body.ok, "Employee CAN snooze reminder on assigned renewal (200 OK)");

  // 4c. Employee updates reminder completion on assigned renewal -> Allowed (200)
  const empStatusAssignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}/reminder-status`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAuth.token}`,
      },
    },
    { reminderCompleted: true }
  );
  assert(empStatusAssignedRes.status === 200 && empStatusAssignedRes.body.ok, "Employee CAN update reminder completed status on assigned renewal (200 OK)");

  // 4d. Employee attempts permitted action on UNASSIGNED renewal -> MUST FAIL (403)
  const empRenewUnassignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${unassignedRenewal.id}/mark-renewed`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAuth.token}`,
      },
    },
    { newExpiryDate: "2027-11-30" }
  );
  assert(empRenewUnassignedRes.status === 403, "Employee CANNOT renew unassigned renewal (403 Forbidden)");

  const empSnoozeUnassignedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${unassignedRenewal.id}/snooze`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empAuth.token}`,
      },
    },
    { days: 7 }
  );
  assert(empSnoozeUnassignedRes.status === 403, "Employee CANNOT snooze unassigned renewal (403 Forbidden)");

  // 5. Viewer Permission Tests: Read-Only Access
  console.log("\n5. Testing Viewer Action Permissions (Strict Read-Only)...");

  // 5a. Viewer can view renewals
  const viewGetRes = await request({
    hostname: "localhost",
    port: 3000,
    path: "/api/renewals",
    method: "GET",
    headers: { Authorization: `Bearer ${viewerAuth.token}` },
  });
  assert(viewGetRes.status === 200 && Array.isArray(viewGetRes.body.data), "Viewer CAN view renewals (200 OK)");

  // 5b. Viewer cannot create
  const viewCreateRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/renewals",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerAuth.token}`,
      },
    },
    { name: "Viewer Renewal", category: "License", expiryDate: "2026-12-31" }
  );
  assert(viewCreateRes.status === 403, "Viewer CANNOT create renewal (403 Forbidden)");

  // 5c. Viewer cannot edit
  const viewEditRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerAuth.token}`,
      },
    },
    { name: "Viewer Edited Name" }
  );
  assert(viewEditRes.status === 403, "Viewer CANNOT edit renewal (403 Forbidden)");

  // 5d. Viewer cannot delete
  const viewDeleteRes = await request({
    hostname: "localhost",
    port: 3000,
    path: `/api/renewals/${assignedRenewal.id}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${viewerAuth.token}` },
  });
  assert(viewDeleteRes.status === 403, "Viewer CANNOT delete renewal (403 Forbidden)");

  // 5e. Viewer cannot renew
  const viewRenewRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}/mark-renewed`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerAuth.token}`,
      },
    },
    { newExpiryDate: "2027-12-31" }
  );
  assert(viewRenewRes.status === 403, "Viewer CANNOT mark renewal as renewed (403 Forbidden)");

  // 5f. Viewer cannot snooze
  const viewSnoozeRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}/snooze`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewerAuth.token}`,
      },
    },
    { days: 7 }
  );
  assert(viewSnoozeRes.status === 403, "Viewer CANNOT snooze reminder (403 Forbidden)");

  // 6. Admin Permitted Actions: Edit and Delete
  console.log("\n6. Testing Admin Full Permissions (Edit & Delete)...");

  // 6a. Admin edits renewal
  const adminEditRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: `/api/renewals/${assignedRenewal.id}`,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminAuth.token}`,
      },
    },
    { name: "RBAC Test - Admin Successfully Edited Record" }
  );
  assert(adminEditRes.status === 200 && adminEditRes.body.ok, "Admin CAN edit renewal record via PUT /api/renewals/:id (200 OK)");

  // 6b. Admin deletes renewal
  const adminDeleteAssignedRes = await request({
    hostname: "localhost",
    port: 3000,
    path: `/api/renewals/${assignedRenewal.id}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  assert(adminDeleteAssignedRes.status === 200 && adminDeleteAssignedRes.body.ok, "Admin CAN delete renewal record via DELETE /api/renewals/:id (200 OK)");

  const adminDeleteUnassignedRes = await request({
    hostname: "localhost",
    port: 3000,
    path: `/api/renewals/${unassignedRenewal.id}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  assert(adminDeleteUnassignedRes.status === 200 && adminDeleteUnassignedRes.body.ok, "Admin CAN delete unassigned renewal record (200 OK)");

  console.log(`\n=== RBAC Test Summary: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test Suite crashed:", err);
  process.exit(1);
});
