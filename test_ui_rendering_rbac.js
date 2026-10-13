/* ==========================================================================
   test_ui_rendering_rbac.js — Verifies Frontend DOM Action Button Rendering
   Simulates records table row action generation for Admin, Employee, and Viewer.
   ========================================================================== */

function generateRowActionsHtml({ role, isAssigned }) {
  const isAdmin = role === "Admin";
  const isEmployee = role === "Employee";
  const isViewer = role === "Viewer";

  const canEdit = isAdmin;
  const canDelete = isAdmin;
  const canRenew = !isViewer && (isAdmin || (isEmployee && isAssigned));

  let buttons = [];
  // View is always visible
  buttons.push(`<a class="icon-btn" href="details.html?id=123" aria-label="View details" title="View details"><i data-lucide="eye"></i></a>`);

  if (canRenew) {
    buttons.push(`<button class="icon-btn" aria-label="Renew" title="Mark as Renewed"><i data-lucide="refresh-cw"></i></button>`);
  }
  if (canEdit) {
    buttons.push(`<button class="icon-btn" aria-label="Edit" title="Edit"><i data-lucide="edit-3"></i></button>`);
  }
  if (canDelete) {
    buttons.push(`<button class="icon-btn" aria-label="Delete" title="Delete"><i data-lucide="trash-2"></i></button>`);
  }

  return buttons.join("\n");
}

function runUiRbacTests() {
  console.log("=== Frontend Action Permissions Rendering Test ===\n");
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

  // 1. Admin rendering
  console.log("1. Admin Table Row Actions:");
  const adminHtml = generateRowActionsHtml({ role: "Admin", isAssigned: false });
  assert(adminHtml.includes('aria-label="View details"'), "Admin has View button");
  assert(adminHtml.includes('aria-label="Renew"'), "Admin has Renew button");
  assert(adminHtml.includes('aria-label="Edit"'), "Admin has Edit button");
  assert(adminHtml.includes('aria-label="Delete"'), "Admin has Delete button");

  // 2. Employee with assigned renewal
  console.log("\n2. Employee Table Row Actions (Assigned Renewal):");
  const empAssignedHtml = generateRowActionsHtml({ role: "Employee", isAssigned: true });
  assert(empAssignedHtml.includes('aria-label="View details"'), "Employee has View button");
  assert(empAssignedHtml.includes('aria-label="Renew"'), "Employee has Renew button for permitted assigned renewal");
  assert(!empAssignedHtml.includes('aria-label="Edit"'), "Employee DOES NOT have Edit button (Hidden)");
  assert(!empAssignedHtml.includes('aria-label="Delete"'), "Employee DOES NOT have Delete button (Hidden)");

  // 3. Employee with unassigned renewal
  console.log("\n3. Employee Table Row Actions (Unassigned Renewal):");
  const empUnassignedHtml = generateRowActionsHtml({ role: "Employee", isAssigned: false });
  assert(empUnassignedHtml.includes('aria-label="View details"'), "Employee has View button");
  assert(!empUnassignedHtml.includes('aria-label="Renew"'), "Employee DOES NOT have Renew button for unassigned renewal");
  assert(!empUnassignedHtml.includes('aria-label="Edit"'), "Employee DOES NOT have Edit button (Hidden)");
  assert(!empUnassignedHtml.includes('aria-label="Delete"'), "Employee DOES NOT have Delete button (Hidden)");

  // 4. Viewer (read-only)
  console.log("\n4. Viewer Table Row Actions (Read-Only):");
  const viewerHtml = generateRowActionsHtml({ role: "Viewer", isAssigned: false });
  assert(viewerHtml.includes('aria-label="View details"'), "Viewer has View button");
  assert(!viewerHtml.includes('aria-label="Renew"'), "Viewer DOES NOT have Renew button (Hidden)");
  assert(!viewerHtml.includes('aria-label="Edit"'), "Viewer DOES NOT have Edit button (Hidden)");
  assert(!viewerHtml.includes('aria-label="Delete"'), "Viewer DOES NOT have Delete button (Hidden)");

  console.log(`\n=== UI Rendering Test Summary: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) process.exit(1);
}

runUiRbacTests();
