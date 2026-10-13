const http = require("http");

const BASE_URL = "http://localhost:3000";

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = options.headers || {};
    let body = options.body;
    if (body && typeof body === "object" && !(body instanceof Buffer)) {
      body = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }

    const req = http.request(
      url,
      {
        method: options.method || "GET",
        headers,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      }
    );

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("=================================================================");
  console.log(" RenewalTrack: Admin Dashboard Quick Add & Full Assignment Flow    ");
  console.log("=================================================================\n");

  // 1. Authenticate users
  console.log("1. Authenticating Admin and Employee accounts...");
  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiyaohai@gmail.com", password: "Admin@1234" },
  });
  assert(adminLogin.status === 200, "Admin authenticated");
  const adminToken = adminLogin.data.token;

  const emp1Login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "david.kim@renewaltrack.com", password: "Demo@1234" },
  });
  assert(emp1Login.status === 200, "Employee 1 (David Kim) authenticated");
  const emp1Token = emp1Login.data.token;
  const emp1Id = emp1Login.data.user.id;

  const emp2Login = await request("/api/auth/login", {
    method: "POST",
    body: { email: "elakkiyaaaaa27@gmail.com", password: "elakkiya" },
  });
  assert(emp2Login.status === 200, "Employee 2 (raja) authenticated");
  const emp2Token = emp2Login.data.token;
  const emp2Id = emp2Login.data.user.id;

  // 2. Fetch assignees from database
  console.log("\n2. Fetching assignees from database for Quick Add dropdown...");
  const assigneesRes = await request("/api/renewals/assignees", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(assigneesRes.status === 200 && assigneesRes.data.success, "Fetched active assignees");
  const assignees = assigneesRes.data.data;
  assert(Array.isArray(assignees) && assignees.length > 0, "Assignees list is non-empty");
  const emp1InList = assignees.find((e) => e.id === emp1Id);
  const emp2InList = assignees.find((e) => e.id === emp2Id);
  assert(!!emp1InList, "Employee 1 is in active assignees list");
  assert(!!emp2InList, "Employee 2 is in active assignees list");

  // 3. Admin creates renewal via Quick Add form payload with Assigned To set to Employee 1
  console.log("\n3. Admin creates renewal using Quick Add form payload assigned to Employee 1...");
  const quickAddPayload = {
    name: "Admin Quick Add ISO Compliance Cert",
    category: "Certification",
    priority: "High",
    organization: "Global Standards Institute",
    referenceNumber: "ISO-27001-2026",
    assignedToId: emp1Id,
    issueDate: "2026-01-15",
    expiryDate: "2027-01-15",
    reminderDate: "2026-12-15",
    cost: 4500,
    currency: "USD",
    recurringCycle: "Yearly",
    notes: "Created via Admin Dashboard Quick Add modal",
  };

  const createRes = await request("/api/renewals", {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: quickAddPayload,
  });
  assert(createRes.status === 201 && createRes.data.ok, "Renewal created successfully via Quick Add");
  const renewal = createRes.data.data;
  const renewalId = renewal.id;
  assert(renewal.assignedToId === emp1Id, `Renewal assignedToId matches Employee 1 ID (${emp1Id})`);
  assert(renewal.assignedToName === "David Kim", `Renewal assignedToName is populated (${renewal.assignedToName})`);
  assert(renewal.assignedToEmail === "david.kim@renewaltrack.com", `Renewal assignedToEmail is populated`);

  // 4. Verify Renewal Details endpoint returns assigned employee name and info
  console.log("\n4. Verifying Renewal Details endpoint returns assigned employee info...");
  const detailsRes = await request(`/api/renewals/${renewalId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(detailsRes.status === 200 && detailsRes.data.ok, "Details retrieved successfully");
  const details = detailsRes.data.data;
  assert(details.assignedToId === emp1Id, "Details has correct assignedToId");
  assert(details.assignedToName === "David Kim", "Details has correct assignedToName");

  // 5. Verify Assigned to Me page for Employee 1
  console.log("\n5. Verifying renewal appears in Employee 1's Assigned to Me list...");
  const emp1RenewalsRes = await request("/api/renewals", {
    headers: { Authorization: `Bearer ${emp1Token}` },
  });
  assert(emp1RenewalsRes.status === 200 && emp1RenewalsRes.data.ok, "Employee 1 fetched assigned renewals");
  const emp1List = emp1RenewalsRes.data.data;
  const foundInEmp1 = emp1List.find((r) => r.id === renewalId);
  assert(!!foundInEmp1, "Renewal is present in Employee 1's Assigned to Me list");
  assert(foundInEmp1.assignedToName === "David Kim", "Renewal shows Employee 1's name");

  // 6. Verify renewal does NOT appear in Employee 2's Assigned to Me list
  console.log("\n6. Verifying renewal does NOT appear in Employee 2's Assigned to Me list...");
  const emp2RenewalsRes = await request("/api/renewals", {
    headers: { Authorization: `Bearer ${emp2Token}` },
  });
  assert(emp2RenewalsRes.status === 200 && emp2RenewalsRes.data.ok, "Employee 2 fetched assigned renewals");
  const emp2List = emp2RenewalsRes.data.data;
  const foundInEmp2 = emp2List.find((r) => r.id === renewalId);
  assert(!foundInEmp2, "Renewal is NOT present in Employee 2's list (Role isolation verified)");

  // 7. Admin reassigns renewal to Employee 2
  console.log("\n7. Admin reassigns renewal to Employee 2...");
  const reassignRes = await request(`/api/renewals/${renewalId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      ...details,
      assignedToId: emp2Id,
    },
  });
  assert(reassignRes.status === 200 && reassignRes.data.ok, "Renewal reassigned successfully by Admin");
  const reassigned = reassignRes.data.data;
  assert(reassigned.assignedToId === emp2Id, `Reassigned assignedToId is Employee 2 ID (${emp2Id})`);
  assert(reassigned.assignedToName === "raja", `Reassigned assignedToName is updated to Employee 2 (${reassigned.assignedToName})`);

  // 8. Verify Employee 1 NO LONGER sees the renewal in Assigned to Me
  console.log("\n8. Verifying Employee 1 NO LONGER sees the renewal after reassignment...");
  const emp1AfterReassign = await request("/api/renewals", {
    headers: { Authorization: `Bearer ${emp1Token}` },
  });
  const foundInEmp1After = emp1AfterReassign.data.data.find((r) => r.id === renewalId);
  assert(!foundInEmp1After, "Renewal is no longer in Employee 1's Assigned to Me list");

  // 9. Verify Employee 2 NOW sees the renewal in Assigned to Me
  console.log("\n9. Verifying Employee 2 NOW sees the renewal after reassignment...");
  const emp2AfterReassign = await request("/api/renewals", {
    headers: { Authorization: `Bearer ${emp2Token}` },
  });
  const foundInEmp2After = emp2AfterReassign.data.data.find((r) => r.id === renewalId);
  assert(!!foundInEmp2After, "Renewal is now present in Employee 2's Assigned to Me list");
  assert(foundInEmp2After.assignedToId === emp2Id, "Assigned to Employee 2 verified in list");

  // 10. Clean up test renewal
  console.log("\n10. Cleaning up test renewal...");
  const cleanupRes = await request(`/api/renewals/${renewalId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(cleanupRes.status === 200, "Test renewal cleaned up");

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
