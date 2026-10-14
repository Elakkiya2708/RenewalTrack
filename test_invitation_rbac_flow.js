const http = require("http");

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function run() {
  console.log("\n========================================================");
  console.log("  RENEWALTRACK INVITATION & RBAC COMPLIANCE TEST SUITE  ");
  console.log("========================================================\n");

  // Step 1: Admin Login
  console.log("Step 1: Primary Admin Login");
  const adminLogin = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email: "elakkiya270806@gmail.com", password: "Admin@1234" }
  );

  assert(adminLogin.status === 200, `Admin login returns 200 (Got ${adminLogin.status})`);
  assert(adminLogin.body.ok === true, "Admin login body ok === true");
  assert(adminLogin.body.user.role === "Admin", "Admin has role Admin");
  assert(adminLogin.body.user.email === "elakkiya270806@gmail.com", "Admin email is elakkiya270806@gmail.com");
  assert(adminLogin.body.user.isPrimaryAdmin === true, "Admin isPrimaryAdmin is true");
  const adminToken = adminLogin.body.token;

  // Step 2: Check current team members - should only contain Admin
  console.log("\nStep 2: Team Members Inspection");
  const teamRes = await request({
    hostname: "localhost",
    port: 3000,
    path: "/api/team/members",
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` },
  });

  assert(teamRes.status === 200, `Team list returns 200 (Got ${teamRes.status})`);
  const members = teamRes.body.data || teamRes.body.members || [];
  console.log(`Active team members count: ${members.length}`);
  members.forEach((m) => console.log(` - ${m.fullName} (${m.email}) [${m.role}]`));
  assert(members.length === 1, `Team contains strictly 1 user (Got ${members.length})`);
  assert(members[0].email === "elakkiya270806@gmail.com", "Active user is Primary Admin");

  // Step 3: Uninvited registration rejection
  console.log("\nStep 3: Uninvited Registration Rejection");
  const uninvitedRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/register",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      fullName: "Random Stranger",
      email: "stranger@unknown-domain.com",
      mobile: "+1 555 9999",
      password: "Password@1234",
    }
  );

  assert(uninvitedRes.status === 403, `Uninvited registration rejected with 403 Forbidden (Got ${uninvitedRes.status})`);
  assert(
    uninvitedRes.body.error && uninvitedRes.body.error.includes("restricted to invited team members"),
    `Error explains workspace invitation restriction: "${uninvitedRes.body.error}"`
  );

  // Step 4: Admin invites Employee
  console.log("\nStep 4: Admin Invites New Employee");
  const inviteRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/team/invites",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      email: "genuine.employee@company.org",
      fullName: "Genuine Employee",
      role: "Employee",
    }
  );

  assert(inviteRes.status === 201, `Admin invite returns 201 Created (Got ${inviteRes.status})`);
  assert(inviteRes.body.ok === true, "Invite response ok === true");
  const invite = inviteRes.body.invitation;
  assert(invite && invite.token, "Invitation object has token");
  assert(invite.role === "Employee", "Invited role is Employee");
  console.log(`Generated invite token: ${invite.token.substring(0, 16)}...`);

  // Step 5: Admin cannot invite Admin role
  console.log("\nStep 5: Admin Role Escalation Prevention in Invites");
  const adminInviteRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/team/invites",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
    },
    {
      email: "sneaky.admin@company.org",
      fullName: "Sneaky Admin",
      role: "Admin",
    }
  );
  assert(adminInviteRes.status === 400, `Admin role invite is rejected with 400 (Got ${adminInviteRes.status})`);

  // Step 6: Invited user registers using their invited email
  console.log("\nStep 6: Invited User Registration");
  const regRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/register",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      fullName: "Genuine Employee",
      email: "genuine.employee@company.org",
      mobile: "+1 555 4321",
      password: "EmployeePass@123",
      inviteToken: invite.token,
    }
  );

  assert(regRes.status === 201, `Registration with valid invite returns 201 Created (Got ${regRes.status})`);
  assert(regRes.body.ok === true, "Registration response ok === true");
  assert(regRes.body.user.role === "Employee", "Registered user assigned invited role 'Employee'");
  assert(regRes.body.user.email === "genuine.employee@company.org", "Registered user email matches");

  // Step 7: Duplicate email registration rejection
  console.log("\nStep 7: Duplicate Email Registration Check");
  const dupRes = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/register",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    {
      fullName: "Another Person",
      email: "genuine.employee@company.org",
      mobile: "+1 555 9876",
      password: "AnotherPassword@123",
    }
  );

  assert(dupRes.status === 409, `Duplicate registration rejected with 409 Conflict (Got ${dupRes.status})`);
  assert(
    dupRes.body.error && dupRes.body.error.includes("already exists"),
    `Duplicate error message: "${dupRes.body.error}"`
  );

  // Step 8: Newly registered employee logs in
  console.log("\nStep 8: Newly Registered Employee Login");
  const empLogin = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    { email: "genuine.employee@company.org", password: "EmployeePass@123" }
  );

  assert(empLogin.status === 200, `Employee login returns 200 OK (Got ${empLogin.status})`);
  assert(empLogin.body.user.role === "Employee", "Logged in user role is Employee");
  const empToken = empLogin.body.token;

  // Step 9: Employee cannot invite others (RBAC protection)
  console.log("\nStep 9: Employee Cannot Invite (RBAC Verification)");
  const empInvite = await request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/api/team/invites",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${empToken}`,
      },
    },
    {
      email: "viewer@company.org",
      fullName: "Viewer User",
      role: "Viewer",
    }
  );
  assert(empInvite.status === 403, `Employee cannot send invites - returns 403 (Got ${empInvite.status})`);

  // Step 10: Clean up test user so workspace remains pristine
  console.log("\nStep 10: Clean up test user");
  const deleteRes = await request({
    hostname: "localhost",
    port: 3000,
    path: `/api/team/members/${regRes.body.user.id}`,
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(deleteRes.status === 200, `Cleaned up test user (Status ${deleteRes.status})`);

  // Verify only Primary Admin remains
  const finalTeamRes = await request({
    hostname: "localhost",
    port: 3000,
    path: "/api/team/members",
    method: "GET",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const finalMembers = finalTeamRes.body.data || finalTeamRes.body.members || [];
  assert(finalMembers.length === 1, `Workspace safely contains strictly 1 user (Got ${finalMembers.length})`);
  assert(finalMembers[0].email === "elakkiya270806@gmail.com", "Primary Admin remains safe and intact");

  console.log("\n🎉 ALL 10 INVITATION & RBAC COMPLIANCE TESTS PASSED SUCCESSFULLY! 🎉\n");
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
