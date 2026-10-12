/* ==========================================================================
   records.js — Renewal Records page
   Supports:
   - Full CRUD with localStorage persistence
   - Multi-field filtering & sorting
   - Recurring renewal cycle
   - Bulk actions (select all, bulk renew, bulk delete, bulk CSV & .ics export)
   - CSV / Excel spreadsheet import with drag-and-drop & live preview
   - Multi-language support (English & தமிழ்)
   ========================================================================== */

(function () {
  "use strict";

  const PAGE_SIZE = 8;
  let state = {
    page: 1,
    sortDir: "asc",
    search: "",
    category: "",
    status: "",
    priority: "",
    assignment: "",
  };
  let editingId = null;
  let pendingDocs = []; // documents staged in the current modal session
  let deleteTargetId = null;
  let selectedIds = new Set();
  let stagedImportRecords = [];

  let assignableEmployees = [];

  function fileTypeFromName(name) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") return "PDF";
    if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "Image";
    if (["doc", "docx"].includes(ext)) return "Word";
    if (["xls", "xlsx", "csv"].includes(ext)) return "Spreadsheet";
    return "File";
  }

  let assigneesStatus = "idle"; // "idle" | "loading" | "success" | "empty" | "error"
  let loadAssigneesPromise = null;

  async function loadAssignableEmployees(forceRefresh = false) {
    if (loadAssigneesPromise && !forceRefresh) {
      return loadAssigneesPromise;
    }
    assigneesStatus = "loading";
    const sel = document.getElementById("in_assignedTo");
    if (sel && (!assignableEmployees || !assignableEmployees.length)) {
      sel.innerHTML = `<option value="" disabled selected>⏳ Loading active employees from database…</option>`;
    }
    loadAssigneesPromise = (async () => {
      try {
        let list = [];
        if (RTS.team && RTS.team.getAssignableEmployees) {
          list = await RTS.team.getAssignableEmployees();
        } else {
          const res = await fetch("/api/renewals/assignees");
          const json = await res.json();
          if (json && json.ok && Array.isArray(json.data)) list = json.data;
        }
        assignableEmployees = Array.isArray(list) ? list : [];
        assigneesStatus = assignableEmployees.length > 0 ? "success" : "empty";
      } catch (e) {
        console.warn("Could not load assignees from database:", e);
        assigneesStatus = "error";
      }
      return assignableEmployees;
    })();
    return loadAssigneesPromise;
  }

  function populateAssigneeSelect(selectedId = null, fallback = null) {
    const sel = document.getElementById("in_assignedTo");
    if (!sel) return;
    const currentVal = selectedId !== null ? selectedId : sel.value;

    if (assigneesStatus === "loading") {
      sel.innerHTML = `<option value="" disabled selected>⏳ Loading active employees from database…</option>`;
      return;
    }

    if (assigneesStatus === "error") {
      sel.innerHTML = `
        <option value="">— Unassigned —</option>
        <option value="" disabled>⚠️ Failed to load employees from database</option>
      `;
      if (currentVal && fallback && fallback.fullName) {
        sel.insertAdjacentHTML(
          "beforeend",
          `<option value="${RTS.escapeHtml(currentVal)}" selected>${RTS.escapeHtml(fallback.fullName)} (Current Assignee)</option>`
        );
      }
      return;
    }

    if (assigneesStatus === "empty" || !assignableEmployees.length) {
      sel.innerHTML = `<option value="">— Unassigned — (No active employees found in database)</option>`;
      if (currentVal && fallback && fallback.fullName) {
        sel.insertAdjacentHTML(
          "beforeend",
          `<option value="${RTS.escapeHtml(currentVal)}" selected>${RTS.escapeHtml(fallback.fullName)} (Current Assignee)</option>`
        );
      }
      return;
    }

    // Successfully loaded active employees
    sel.innerHTML = `<option value="">— Unassigned —</option>`;
    let hasMatched = !currentVal;

    assignableEmployees.forEach((emp) => {
      const name = emp.fullName || emp.name || "Employee";
      const email = emp.email || "";
      const role = emp.role ? ` (${emp.role})` : "";
      const isSelected = currentVal && String(emp.id) === String(currentVal);
      if (isSelected) hasMatched = true;
      sel.insertAdjacentHTML(
        "beforeend",
        `<option value="${emp.id}" ${isSelected ? "selected" : ""} data-name="${RTS.escapeHtml(name)}" data-email="${RTS.escapeHtml(email)}">${RTS.escapeHtml(name)}${role} — ${RTS.escapeHtml(email)}</option>`
      );
    });

    // If record has an assignee not present in active list (e.g. deactivated account, or unlisted), dynamically preserve it
    if (currentVal && !hasMatched) {
      const fbName = fallback ? (fallback.fullName || fallback.name) : "Assigned User";
      const fbEmail = fallback ? fallback.email : "";
      sel.insertAdjacentHTML(
        "beforeend",
        `<option value="${RTS.escapeHtml(currentVal)}" selected>${RTS.escapeHtml(fbName)} ${fbEmail ? "— " + RTS.escapeHtml(fbEmail) : ""}</option>`
      );
    }

    if (currentVal) {
      sel.value = currentVal;
    } else {
      sel.value = "";
    }
  }

  function renderAssigneeCell(r) {
    const name = r.assignedToName || r.assigned_to_name || r.responsiblePerson || r.responsible_person || "";
    const email = r.assignedToEmail || r.assigned_to_email || r.responsibleEmail || "";
    if (!name || name === "Unassigned") {
      return `<span class="cell-sub" style="color:var(--text-muted);display:inline-flex;align-items:center;gap:4px;font-size:12px;">Unassigned</span>`;
    }
    const initials = name
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";
    return `
      <div style="display:inline-flex;align-items:center;gap:7px;max-width:160px;" title="${RTS.escapeHtml(name + (email ? ' (' + email + ')' : ''))}">
        <span style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg, #6366f1, #8b5cf6);color:#ffffff;font-size:10px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">${initials}</span>
        <div style="min-width:0;line-height:1.2;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${RTS.escapeHtml(name)}</div>
          ${email ? `<div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${RTS.escapeHtml(email)}</div>` : ""}
        </div>
      </div>`;
  }

  function populateSelects() {
    const catFilter = document.getElementById("filterCategory");
    const catInput = document.getElementById("in_category");
    if (catFilter && catInput) {
      catFilter.innerHTML = `<option value="">${RTS.i18n.t("allCategories", "All Categories")}</option>`;
      catInput.innerHTML = `<option value="">Select a category</option>`;
      RTS.CATEGORIES.forEach((c) => {
        catFilter.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
        catInput.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      });
    }

    const currencyInput = document.getElementById("in_currency");
    if (currencyInput) {
      currencyInput.innerHTML = "";
      RTS.CURRENCIES.forEach((c) => {
        currencyInput.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      });
    }

    const cycleInput = document.getElementById("in_recurringCycle");
    if (cycleInput) {
      cycleInput.innerHTML = "";
      RTS.RECURRING_CYCLES.forEach((c) => {
        cycleInput.insertAdjacentHTML("beforeend", `<option value="${c}">${RTS.cycleLabel(c)}</option>`);
      });
    }

    loadAssignableEmployees();
  }

  function getFilteredSorted() {
    let list = RTS.data.getRenewals();
    const q = state.search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.organization || "").toLowerCase().includes(q) ||
          (r.referenceNumber || "").toLowerCase().includes(q) ||
          (r.code || "").toLowerCase().includes(q)
      );
    }
    if (state.category) list = list.filter((r) => r.category === state.category);
    if (state.status) list = list.filter((r) => RTS.computeStatus(r) === state.status);
    if (state.priority) list = list.filter((r) => r.priority === state.priority);
    if (state.assignment === "assigned") {
      const curUser = RTS.auth.getCurrentUser();
      const uEmail = (curUser.email || "").toLowerCase();
      const uName = (curUser.fullName || "").toLowerCase();
      const uId = curUser.id || "";
      list = list.filter((r) => {
        const assignedId = r.assignedToId || r.assigned_to_id || "";
        const respEmail = (r.assignedToEmail || r.assigned_to_email || r.responsibleEmail || r.responsible_email || "").toLowerCase();
        const respName = (r.assignedToName || r.assigned_to_name || r.responsiblePerson || r.responsible_person || "").toLowerCase();
        const createdBy = (r.createdBy || "").toLowerCase();
        return (
          (uId && assignedId === uId) ||
          (uEmail && respEmail === uEmail) ||
          (uName && respName === uName) ||
          (uName && respName.includes(uName)) ||
          (uEmail && createdBy === uEmail)
        );
      });
    }

    list.sort((a, b) => {
      if (a.expiryDate === b.expiryDate) return 0;
      const cmp = a.expiryDate < b.expiryDate ? -1 : 1;
      return state.sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }

  function updateBulkActionBar() {
    const bar = document.getElementById("bulkActionBar");
    const countEl = document.getElementById("bulkSelectedCount");
    const selectAllCheckbox = document.getElementById("selectAllRecords");
    if (RTS.auth.isViewer()) {
      if (bar) bar.style.display = "none";
      if (selectAllCheckbox) selectAllCheckbox.style.display = "none";
      return;
    }
    if (!bar || !countEl) return;

    const count = selectedIds.size;
    countEl.textContent = count;
    bar.style.display = count > 0 ? "flex" : "none";

    const allCurrent = getFilteredSorted();
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = allCurrent.length > 0 && allCurrent.every((r) => selectedIds.has(r.id));
      selectAllCheckbox.indeterminate = count > 0 && !selectAllCheckbox.checked;
    }
  }

  function renderTable() {
    const isViewer = RTS.auth.isViewer();
    const thSelect = document.querySelector(".data-table thead tr th:first-child");
    if (thSelect) {
      thSelect.style.display = isViewer ? "none" : "";
    }

    const all = getFilteredSorted();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = all.slice(start, start + PAGE_SIZE);

    const resultCountEl = document.getElementById("resultCount");
    if (resultCountEl) {
      resultCountEl.textContent = `${total} record${total === 1 ? "" : "s"} found`;
    }

    const tbody = document.getElementById("recordsTableBody");
    const emptyState = document.getElementById("recordsEmptyState");

    if (!pageItems.length) {
      tbody.innerHTML = "";
      emptyState.classList.remove("hidden");
    } else {
      emptyState.classList.add("hidden");
      tbody.innerHTML = pageItems
        .map((r) => {
          const status = RTS.computeStatus(r);
          const isChecked = !isViewer && selectedIds.has(r.id);
          const cycleTxt = RTS.cycleLabel(r.recurringCycle || "Yearly");
          const canEdit = !isViewer && RTS.auth.canEditRenewal(r);
          const canDelete = !isViewer && (RTS.auth.isAdmin() || (RTS.auth.isEmployee() && canEdit));
          return `
          <tr class="${isChecked ? "row-selected" : ""}">
            ${
              isViewer
                ? ""
                : `<td style="text-align:center;">
              <input type="checkbox" class="record-select-checkbox" data-id="${r.id}" ${isChecked ? "checked" : ""} style="cursor:pointer;" />
            </td>`
            }
            <td class="cell-primary">${r.code}</td>
            <td>
              <span class="cell-primary"><a href="details.html?id=${r.id}" style="color:inherit;text-decoration:none;">${RTS.escapeHtml(r.name)}</a></span>
              <span class="cell-sub">${(r.documents || []).length} document(s)</span>
            </td>
            <td>${RTS.escapeHtml(r.category)}</td>
            <td>${RTS.escapeHtml(r.organization || "—")}</td>
            <td>${renderAssigneeCell(r)}</td>
            <td>${RTS.formatDate(r.issueDate)}</td>
            <td>${RTS.formatDate(r.expiryDate)}</td>
            <td>${RTS.formatDate(r.reminderDate)}</td>
            <td><span class="badge badge-cycle"><i data-lucide="repeat" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;"></i> ${RTS.escapeHtml(cycleTxt)}</span></td>
            <td>${RTS.statusBadgeHtml(status)}</td>
            <td>${RTS.priorityBadgeHtml(r.priority)}</td>
            <td>
              <div class="row-actions">
                <a class="icon-btn" href="details.html?id=${r.id}" aria-label="View details" title="View details"><i data-lucide="eye" class="icon"></i></a>
                ${canEdit ? `<button class="icon-btn" aria-label="Renew" title="Mark as Renewed" onclick="RecordsPage.openRenew('${r.id}')"><i data-lucide="refresh-cw" class="icon"></i></button>` : ""}
                ${canEdit ? `<button class="icon-btn" aria-label="Edit" title="Edit" onclick="RecordsPage.openEdit('${r.id}')"><i data-lucide="edit-3" class="icon"></i></button>` : ""}
                ${canDelete ? `<button class="icon-btn" aria-label="Delete" title="Delete" onclick="RecordsPage.openDelete('${r.id}')"><i data-lucide="trash-2" class="icon"></i></button>` : ""}
              </div>
            </td>
          </tr>`;
        })
        .join("");
    }

    // Wire row checkboxes
    tbody.querySelectorAll(".record-select-checkbox").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const id = e.target.getAttribute("data-id");
        if (e.target.checked) {
          selectedIds.add(id);
        } else {
          selectedIds.delete(id);
        }
        updateBulkActionBar();
        const tr = e.target.closest("tr");
        if (tr) tr.classList.toggle("row-selected", e.target.checked);
      });
    });

    renderPagination(totalPages);
    updateBulkActionBar();
    RTS.refreshIcons();
  }

  function renderPagination(totalPages) {
    const el = document.getElementById("pagination");
    if (!el) return;
    let buttons = "";
    for (let i = 1; i <= totalPages; i++) {
      buttons += `<button class="${i === state.page ? "active" : ""}" onclick="RecordsPage.goToPage(${i})">${i}</button>`;
    }
    el.innerHTML = `
      <span>Page ${state.page} of ${totalPages}</span>
      <div class="pagination-controls">
        <button ${state.page === 1 ? "disabled" : ""} onclick="RecordsPage.goToPage(${state.page - 1})"><i data-lucide="chevron-left" class="icon" style="width:14px;height:14px;"></i></button>
        ${buttons}
        <button ${state.page === totalPages ? "disabled" : ""} onclick="RecordsPage.goToPage(${state.page + 1})"><i data-lucide="chevron-right" class="icon" style="width:14px;height:14px;"></i></button>
      </div>`;
  }

  /* ---------------------------- Modal: Add/Edit --------------------------- */

  function clearFieldErrors() {
    document.querySelectorAll("#renewalForm .field").forEach((f) => f.classList.remove("has-error"));
  }

  function resetForm() {
    document.getElementById("renewalForm").reset();
    document.getElementById("in_priority").value = "Medium";
    document.getElementById("in_currency").value = "USD";
    const cycleInput = document.getElementById("in_recurringCycle");
    if (cycleInput) cycleInput.value = "Yearly";
    clearFieldErrors();
    pendingDocs = [];
    renderUploadList();
  }

  async function openAdd() {
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access and cannot create renewals.", "error");
      return;
    }
    editingId = null;
    resetForm();

    const sel = document.getElementById("in_assignedTo");
    const help = document.getElementById("assignedToHelp");
    const respInput = document.getElementById("in_responsible");
    const emailInput = document.getElementById("in_responsibleEmail");

    if (sel) {
      sel.innerHTML = `<option value="" disabled selected>⏳ Loading active employees from database…</option>`;
    }

    await loadAssignableEmployees();

    if (RTS.auth.isEmployee()) {
      const u = RTS.auth.getCurrentUser();
      const matched = assignableEmployees.find((e) => String(e.id) === String(u.id) || (e.email && e.email.toLowerCase() === (u.email || "").toLowerCase()));
      const empId = matched ? matched.id : u.id;
      populateAssigneeSelect(empId, { id: empId, fullName: u.fullName || u.name, email: u.email });
      if (sel) {
        sel.value = empId || "";
        sel.disabled = true;
      }
      if (help) {
        help.textContent = "Automatically assigned to your employee account.";
      }
      if (respInput) respInput.value = (matched && (matched.fullName || matched.name)) || u.fullName || u.name || "";
      if (emailInput) emailInput.value = (matched && matched.email) || u.email || "";
    } else {
      populateAssigneeSelect("");
      if (sel) {
        sel.disabled = false;
        sel.value = "";
      }
      if (help) {
        help.textContent = "Select an active employee or administrator, or leave as Unassigned.";
      }
      if (respInput) respInput.value = "";
      if (emailInput) emailInput.value = "";
    }

    document.getElementById("renewalModalTitle").textContent = RTS.i18n.t("addNewRenewal", "Add New Renewal");
    RTS.modal.open("renewalModal");
  }

  async function openEdit(id) {
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access and cannot edit renewals.", "error");
      return;
    }
    const record = RTS.data.getRenewalById(id);
    if (!record) return;
    if (RTS.auth.isEmployee() && !RTS.auth.canEditRenewal(record)) {
      RTS.toast("Access denied. You can only edit renewals assigned to you.", "error");
      return;
    }
    editingId = id;
    resetForm();

    const sel = document.getElementById("in_assignedTo");
    const help = document.getElementById("assignedToHelp");

    let targetAssigneeId = record.assignedToId || record.assigned_to_id || "";
    const fallbackName = record.assignedToName || record.assigned_to_name || record.responsiblePerson || record.responsible_person || "";
    const fallbackEmail = record.assignedToEmail || record.assigned_to_email || record.responsibleEmail || record.responsible_email || "";

    if (sel) {
      sel.innerHTML = `<option value="" disabled selected>⏳ Loading active employees from database…</option>`;
    }

    await loadAssignableEmployees();

    if (!targetAssigneeId && (fallbackEmail || fallbackName)) {
      const fEmail = fallbackEmail.toLowerCase();
      const fName = fallbackName.toLowerCase();
      const found = assignableEmployees.find(
        (e) => (e.email && e.email.toLowerCase() === fEmail) || ((e.fullName || e.name || "").toLowerCase() === fName)
      );
      if (found) targetAssigneeId = found.id;
    }

    populateAssigneeSelect(targetAssigneeId, { id: targetAssigneeId, fullName: fallbackName, email: fallbackEmail });

    if (sel) {
      if (targetAssigneeId) {
        sel.value = targetAssigneeId;
      } else {
        sel.value = "";
      }
      if (RTS.auth.isEmployee()) {
        sel.disabled = true;
        if (help) help.textContent = "Assignment is locked. Only Admins can reassign renewals.";
      } else {
        sel.disabled = false;
        if (help) help.textContent = "Assign or reassign to an active employee, or leave Unassigned.";
      }
    }

    document.getElementById("renewalModalTitle").textContent = "Edit Renewal";
    document.getElementById("in_name").value = record.name || "";
    document.getElementById("in_category").value = record.category || "";
    document.getElementById("in_priority").value = record.priority || "Medium";
    document.getElementById("in_description").value = record.description || "";
    document.getElementById("in_organization").value = record.organization || "";
    document.getElementById("in_reference").value = record.referenceNumber || "";
    document.getElementById("in_responsible").value = record.assignedToName || record.assigned_to_name || record.responsiblePerson || "";
    const emailField = document.getElementById("in_responsibleEmail");
    if (emailField) emailField.value = record.assignedToEmail || record.assigned_to_email || record.responsibleEmail || record.responsible_email || "";
    document.getElementById("in_issueDate").value = record.issueDate || "";
    document.getElementById("in_expiryDate").value = record.expiryDate || "";
    document.getElementById("in_reminderDate").value = record.reminderDate || "";
    document.getElementById("in_cost").value = record.cost != null ? record.cost : "";
    document.getElementById("in_currency").value = record.currency || "USD";
    const cycleInput = document.getElementById("in_recurringCycle");
    if (cycleInput) cycleInput.value = record.recurringCycle || "Yearly";
    document.getElementById("in_notes").value = record.notes || "";
    pendingDocs = (record.documents || []).slice();
    renderUploadList();
    RTS.modal.open("renewalModal");
  }

  function renderUploadList() {
    const el = document.getElementById("uploadFileList");
    if (!el) return;
    if (!pendingDocs.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = pendingDocs
      .map(
        (d, i) => `
      <div class="upload-file-item">
        <i data-lucide="file-text" class="icon"></i>
        <div class="file-meta"><strong>${RTS.escapeHtml(d.name)}</strong><span>${d.type} · ${d.size}</span></div>
        <button type="button" onclick="RecordsPage.removeDoc(${i})" aria-label="Remove file"><i data-lucide="x" class="icon"></i></button>
      </div>`
      )
      .join("");
    RTS.refreshIcons();
  }

  function removeDoc(index) {
    pendingDocs.splice(index, 1);
    renderUploadList();
  }

  function wireUpload() {
    const zone = document.getElementById("uploadZone");
    const input = document.getElementById("fileInput");
    if (!zone || !input) return;
    zone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      Array.from(input.files).forEach((file) => {
        pendingDocs.unshift({
          id: RTS.uid("doc"),
          name: file.name,
          type: fileTypeFromName(file.name),
          size: (file.size / 1024).toFixed(1) + " KB",
          uploadDate: RTS.todayISO(),
        });
      });
      input.value = "";
      renderUploadList();
    });
  }

  function validate() {
    clearFieldErrors();
    let valid = true;
    const req = (id, fieldId) => {
      const el = document.getElementById(id);
      if (!el || !el.value.trim()) {
        const f = document.getElementById(fieldId);
        if (f) f.classList.add("has-error");
        valid = false;
      }
    };
    req("in_name", "f_name");
    req("in_category", "f_category");
    req("in_organization", "f_organization");
    // in_assignedTo is optional to support Unassigned state
    req("in_issueDate", "f_issueDate");
    req("in_expiryDate", "f_expiryDate");

    const issue = document.getElementById("in_issueDate").value;
    const expiry = document.getElementById("in_expiryDate").value;
    if (issue && expiry && expiry <= issue) {
      document.getElementById("f_expiryDate").classList.add("has-error");
      valid = false;
    }

    const reminder = document.getElementById("in_reminderDate").value;
    if (reminder && expiry && reminder > expiry) {
      document.getElementById("f_reminderDate").classList.add("has-error");
      valid = false;
    }

    const cost = document.getElementById("in_cost").value;
    if (cost !== "" && Number(cost) < 0) {
      document.getElementById("f_cost").classList.add("has-error");
      valid = false;
    }

    return valid;
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) {
      RTS.toast("Please fix the highlighted fields.", "error");
      return;
    }

    const cycleInput = document.getElementById("in_recurringCycle");
    const sel = document.getElementById("in_assignedTo");
    const assignedId = sel && sel.value ? sel.value.trim() : null;
    let assignedName = null;
    let assignedEmail = null;

    if (assignedId) {
      const matchedEmp = assignableEmployees.find((emp) => String(emp.id) === String(assignedId));
      assignedName = matchedEmp ? (matchedEmp.fullName || matchedEmp.name) : (document.getElementById("in_responsible").value.trim() || null);
      assignedEmail = matchedEmp ? (matchedEmp.email || "") : (document.getElementById("in_responsibleEmail").value.trim() || "");
    }

    const data = {
      name: document.getElementById("in_name").value.trim(),
      category: document.getElementById("in_category").value,
      priority: document.getElementById("in_priority").value,
      recurringCycle: cycleInput ? cycleInput.value : "Yearly",
      description: document.getElementById("in_description").value.trim(),
      organization: document.getElementById("in_organization").value.trim(),
      referenceNumber: document.getElementById("in_reference").value.trim(),
      assignedToId: assignedId || null,
      assignedToName: assignedName,
      assignedToEmail: assignedEmail,
      responsiblePerson: assignedName || "",
      responsibleEmail: assignedEmail || "",
      issueDate: document.getElementById("in_issueDate").value,
      expiryDate: document.getElementById("in_expiryDate").value,
      reminderDate: document.getElementById("in_reminderDate").value,
      cost: document.getElementById("in_cost").value === "" ? null : Number(document.getElementById("in_cost").value),
      currency: document.getElementById("in_currency").value,
      notes: document.getElementById("in_notes").value.trim(),
      documents: pendingDocs,
    };

    if (editingId) {
      RTS.data.updateRenewal(editingId, data);
      RTS.toast("Renewal record updated successfully.", "success");
    } else {
      RTS.data.addRenewal(data);
      RTS.toast("Renewal record added successfully.", "success");
    }
    RTS.modal.close("renewalModal");
    renderTable();
  }

  /* ------------------------------ Delete ---------------------------------- */

  function openDelete(id) {
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access and cannot delete renewals.", "error");
      return;
    }
    const record = RTS.data.getRenewalById(id);
    if (!record) return;
    if (RTS.auth.isEmployee() && !RTS.auth.canDeleteRenewal(record)) {
      RTS.toast("Access denied. You can only delete renewals assigned to you.", "error");
      return;
    }
    deleteTargetId = id;
    document.getElementById("deleteRecordName").textContent = record.name;
    RTS.modal.open("deleteModal");
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    RTS.data.deleteRenewal(deleteTargetId);
    selectedIds.delete(deleteTargetId);
    RTS.toast("Renewal record deleted.", "success");
    deleteTargetId = null;
    RTS.modal.close("deleteModal");
    renderTable();
  }

  /* ---------------------------- Bulk Actions ------------------------------ */

  function wireBulkActions() {
    const selectAll = document.getElementById("selectAllRecords");
    if (selectAll) {
      selectAll.addEventListener("change", (e) => {
        const allCurrent = getFilteredSorted();
        if (e.target.checked) {
          allCurrent.forEach((r) => selectedIds.add(r.id));
        } else {
          allCurrent.forEach((r) => selectedIds.delete(r.id));
        }
        renderTable();
      });
    }

    const clearBtn = document.getElementById("bulkClearBtn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        selectedIds.clear();
        renderTable();
      });
    }

    const renewBtn = document.getElementById("bulkRenewBtn");
    if (renewBtn) {
      renewBtn.addEventListener("click", () => {
        if (!selectedIds.size) return;
        if (RTS.auth.isViewer()) {
          RTS.toast("Viewer role has read-only access.", "error");
          return;
        }
        if (RTS.auth.isEmployee()) {
          const unauthorized = Array.from(selectedIds).filter((id) => {
            const r = RTS.data.getRenewalById(id);
            return !RTS.auth.canEditRenewal(r);
          });
          if (unauthorized.length > 0) {
            RTS.toast(`Cannot renew ${unauthorized.length} record(s) assigned to other team members.`, "warning");
            return;
          }
        }
        const count = RTS.data.bulkRenew(Array.from(selectedIds));
        RTS.toast(`Successfully marked ${count} record(s) as renewed!`, "success");
        selectedIds.clear();
        renderTable();
      });
    }

    const exportCsvBtn = document.getElementById("bulkExportCsvBtn");
    if (exportCsvBtn) {
      exportCsvBtn.addEventListener("click", () => {
        if (!selectedIds.size) return;
        const renewals = RTS.data.getRenewals().filter((r) => selectedIds.has(r.id));
        const columns = [
          { label: "Record ID", value: "code" },
          { label: "Name", value: "name" },
          { label: "Category", value: "category" },
          { label: "Organization", value: "organization" },
          { label: "Assigned To", value: (r) => r.assignedToName || r.assigned_to_name || r.responsiblePerson || "Unassigned" },
          { label: "Assigned Email", value: (r) => r.assignedToEmail || r.assigned_to_email || r.responsibleEmail || "" },
          { label: "Expiry Date", value: "expiryDate" },
          { label: "Cost", value: "cost" },
          { label: "Currency", value: "currency" },
          { label: "Recurring Cycle", value: (r) => r.recurringCycle || "Yearly" },
          { label: "Priority", value: "priority" },
          { label: "Status", value: (r) => RTS.computeStatus(r) },
        ];
        RTS.exportCSV("selected_renewals.csv", renewals, columns);
        RTS.toast(`Exported ${renewals.length} selected record(s) to CSV.`, "success");
      });
    }

    const exportIcsBtn = document.getElementById("bulkExportIcsBtn");
    if (exportIcsBtn) {
      exportIcsBtn.addEventListener("click", () => {
        if (!selectedIds.size) return;
        const renewals = RTS.data.getRenewals().filter((r) => selectedIds.has(r.id));
        RTS.exportICS("selected_renewals.ics", renewals);
        RTS.toast(`Exported ${renewals.length} selected record(s) to Calendar (.ics).`, "success");
      });
    }

    const deleteBtn = document.getElementById("bulkDeleteBtn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        if (!selectedIds.size) return;
        if (RTS.auth.isViewer()) {
          RTS.toast("Viewer role has read-only access.", "error");
          return;
        }
        if (RTS.auth.isEmployee()) {
          const unauthorized = Array.from(selectedIds).filter((id) => {
            const r = RTS.data.getRenewalById(id);
            return !RTS.auth.canDeleteRenewal(r);
          });
          if (unauthorized.length > 0) {
            RTS.toast(`Cannot delete ${unauthorized.length} record(s) assigned to other team members.`, "warning");
            return;
          }
        }
        const modal = document.getElementById("bulkConfirmModal");
        document.getElementById("bulkConfirmTitle").textContent = "Delete Selected Records";
        document.getElementById("bulkConfirmMessage").textContent = `Are you sure you want to permanently delete ${selectedIds.size} selected renewal record(s)? This action cannot be undone.`;
        const proceedBtn = document.getElementById("bulkConfirmProceedBtn");
        proceedBtn.className = "btn btn-danger";
        proceedBtn.onclick = () => {
          const removed = RTS.data.bulkDelete(Array.from(selectedIds));
          RTS.toast(`Deleted ${removed} record(s).`, "success");
          selectedIds.clear();
          RTS.modal.close("bulkConfirmModal");
          renderTable();
        };
        RTS.modal.open("bulkConfirmModal");
      });
    }
  }

  /* ---------------------------- CSV / Spreadsheet Import ----------------- */

  function wireImport() {
    const openBtn = document.getElementById("openImportBtn");
    const previewSec = document.getElementById("importPreviewSection");
    const confirmBtn = document.getElementById("confirmImportBtn");
    const fileInfo = document.getElementById("importFileInfo");
    const errAlert = document.getElementById("importErrorAlert");
    const dropzone = document.getElementById("importDropzone");
    const fileInput = document.getElementById("csvFileInput");
    const clearBtn = document.getElementById("importClearFileBtn");

    function resetModalState() {
      stagedImportRecords = [];
      if (previewSec) previewSec.style.display = "none";
      if (confirmBtn) {
        confirmBtn.disabled = true;
        const confirmText = document.getElementById("confirmImportText");
        if (confirmText) confirmText.textContent = "Import Records";
      }
      if (fileInfo) fileInfo.style.display = "none";
      if (errAlert) {
        errAlert.style.display = "none";
        errAlert.textContent = "";
      }
      if (fileInput) fileInput.value = "";
    }

    if (openBtn) {
      openBtn.addEventListener("click", () => {
        resetModalState();
        RTS.modal.open("importModal");
      });
    }

    const tplBtn = document.getElementById("downloadTemplateBtn");
    if (tplBtn) {
      tplBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        RTS.downloadCSVTemplate();
        RTS.toast("Downloaded sample CSV template.", "info");
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        resetModalState();
        if (fileInput) fileInput.click();
      });
    }

    if (!dropzone || !fileInput) return;

    // Make entire dropzone box clickable
    dropzone.addEventListener("click", (e) => {
      if (e.target.closest("#downloadTemplateBtn") || e.target.closest("button") || e.target.closest("a")) return;
      fileInput.click();
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("drag-over");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("drag-over");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("drag-over");
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        processSpreadsheetFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length) {
        processSpreadsheetFile(e.target.files[0]);
      }
    });

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        if (!stagedImportRecords.length) return;
        const count = RTS.importRecords(stagedImportRecords);
        RTS.toast(`Successfully imported ${count} renewal record(s)!`, "success");
        stagedImportRecords = [];
        resetModalState();
        RTS.modal.close("importModal");
        renderTable();
      });
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function showImportError(msg) {
    const errAlert = document.getElementById("importErrorAlert");
    const previewSec = document.getElementById("importPreviewSection");
    const confirmBtn = document.getElementById("confirmImportBtn");
    if (previewSec) previewSec.style.display = "none";
    if (confirmBtn) confirmBtn.disabled = true;
    if (errAlert) {
      errAlert.innerHTML = `<strong>Import Warning:</strong> ${RTS.escapeHtml(msg)}<br><small style="display:block;margin-top:4px;color:var(--text-mid);">Tip: Click 'Download Sample CSV' in the box above to see the recommended header format.</small>`;
      errAlert.style.display = "block";
    }
    RTS.toast(msg, "error");
  }

  function processSpreadsheetFile(file) {
    const errAlert = document.getElementById("importErrorAlert");
    if (errAlert) errAlert.style.display = "none";

    const name = file.name || "uploaded_file";
    const ext = name.split(".").pop().toLowerCase();
    const isExcel = ["xlsx", "xls", "xlsm", "xlsb"].includes(ext);

    // Update File Info display
    const fileInfo = document.getElementById("importFileInfo");
    const fileNameEl = document.getElementById("importFileName");
    const fileSizeEl = document.getElementById("importFileSize");
    if (fileNameEl) fileNameEl.textContent = name;
    if (fileSizeEl) fileSizeEl.textContent = `(${formatBytes(file.size)})`;
    if (fileInfo) fileInfo.style.display = "flex";

    // Handle Excel files with SheetJS if available
    if (isExcel) {
      if (typeof window.XLSX !== "undefined") {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = window.XLSX.read(data, { type: "array", cellDates: true });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
              showImportError("The Excel workbook does not contain any sheets.");
              return;
            }
            const sheet = workbook.Sheets[sheetName];
            const rawRows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
            if (!rawRows.length) {
              showImportError("The selected Excel sheet appears to be empty.");
              return;
            }
            const parsed = RTS.parseSheetRows ? RTS.parseSheetRows(rawRows) : [];
            if (!parsed.length) {
              showImportError("Could not detect renewal records in this sheet. Please make sure the first row contains column headers like Record Name, Expiry Date, etc.");
              return;
            }
            stagedImportRecords = parsed;
            renderImportPreview(parsed);
          } catch (err) {
            console.error("Excel parse error:", err);
            showImportError("Failed to parse Excel file: " + (err.message || "Unknown error"));
          }
        };
        reader.onerror = () => showImportError("Could not read file from disk.");
        reader.readAsArrayBuffer(file);
        return;
      } else {
        showImportError("Excel parser is unavailable or loading. Please convert to .csv or retry in a moment.");
        return;
      }
    }

    // Handle CSV / TSV / Text files
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        let parsed = [];
        if (typeof window.XLSX !== "undefined") {
          try {
            const workbook = window.XLSX.read(text, { type: "string" });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
            if (rawRows.length && RTS.parseSheetRows) {
              parsed = RTS.parseSheetRows(rawRows);
            }
          } catch (e2) {}
        }
        if (!parsed.length) {
          parsed = RTS.parseCSVText(text);
        }

        if (!parsed.length) {
          showImportError("Could not find valid renewal rows in this file. Please verify column headers (e.g. Record Name, Expiry Date).");
          return;
        }
        stagedImportRecords = parsed;
        renderImportPreview(parsed);
      } catch (err) {
        console.error("CSV parse error:", err);
        showImportError("Error processing CSV: " + (err.message || "Invalid structure"));
      }
    };
    reader.onerror = () => showImportError("Could not read file from disk.");
    reader.readAsText(file);
  }

  function renderImportPreview(records) {
    const previewSec = document.getElementById("importPreviewSection");
    const countEl = document.getElementById("parsedRowCount");
    const validEl = document.getElementById("validRowCount");
    const tbody = document.getElementById("importPreviewBody");
    const confirmBtn = document.getElementById("confirmImportBtn");
    const confirmText = document.getElementById("confirmImportText");
    const errAlert = document.getElementById("importErrorAlert");

    if (errAlert) errAlert.style.display = "none";
    if (previewSec) previewSec.style.display = "block";
    if (countEl) countEl.textContent = records.length;
    if (validEl) validEl.textContent = `${records.length} valid`;
    if (confirmBtn) confirmBtn.disabled = false;
    if (confirmText) confirmText.textContent = `Import ${records.length} Record(s)`;

    if (tbody) {
      tbody.innerHTML = records
        .slice(0, 20)
        .map(
          (r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${RTS.escapeHtml(r.name)}</strong></td>
          <td>${RTS.escapeHtml(r.category)}</td>
          <td>${RTS.escapeHtml(r.organization || "—")}</td>
          <td>${RTS.formatDate(r.expiryDate)}</td>
          <td>${RTS.formatCurrency(r.cost, r.currency)}</td>
          <td><span class="badge badge-cycle">${RTS.escapeHtml(r.recurringCycle || "Yearly")}</span></td>
          <td>${RTS.priorityBadgeHtml(r.priority)}</td>
        </tr>`
        )
        .join("");
    }
    RTS.refreshIcons();
  }

  /* ------------------------------- Wiring ---------------------------------- */

  function wireToolbar() {
    document.getElementById("recordSearch").addEventListener(
      "input",
      RTS.debounce((e) => {
        state.search = e.target.value;
        state.page = 1;
        renderTable();
      }, 200)
    );
    document.getElementById("filterCategory").addEventListener("change", (e) => {
      state.category = e.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById("filterStatus").addEventListener("change", (e) => {
      state.status = e.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById("filterPriority").addEventListener("change", (e) => {
      state.priority = e.target.value;
      state.page = 1;
      renderTable();
    });
    const filterAssignment = document.getElementById("filterAssignment");
    if (filterAssignment) {
      filterAssignment.addEventListener("change", (e) => {
        state.assignment = e.target.value;
        state.page = 1;
        renderTable();
      });
    }
    document.getElementById("sortExpiry").addEventListener("click", () => {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      renderTable();
    });
    const openAddBtn = document.getElementById("openAddBtn");
    if (openAddBtn) openAddBtn.addEventListener("click", openAdd);
    const resetFormBtn = document.getElementById("resetFormBtn");
    if (resetFormBtn) resetFormBtn.addEventListener("click", resetForm);
    const renewalForm = document.getElementById("renewalForm");
    if (renewalForm) renewalForm.addEventListener("submit", handleSubmit);
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", confirmDelete);

    const assignedSelect = document.getElementById("in_assignedTo");
    if (assignedSelect) {
      assignedSelect.addEventListener("change", () => {
        const selectedId = assignedSelect.value;
        const emp = assignableEmployees.find((e) => String(e.id) === String(selectedId));
        const respHidden = document.getElementById("in_responsible");
        const emailInput = document.getElementById("in_responsibleEmail");
        if (emp) {
          if (respHidden) respHidden.value = emp.fullName || emp.name || "";
          if (emailInput) emailInput.value = emp.email || "";
        } else {
          if (respHidden) respHidden.value = "";
          if (emailInput) emailInput.value = "";
        }
      });
    }
  }

  function applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      document.getElementById("recordSearch").value = q;
      state.search = q;
    }
    const assigned = params.get("assigned");
    if (assigned === "me" || assigned === "assigned") {
      state.assignment = "assigned";
      const filterAssignment = document.getElementById("filterAssignment");
      if (filterAssignment) filterAssignment.value = "assigned";
    }
    const editId = params.get("edit");
    if (editId) {
      history.replaceState(null, "", window.location.pathname);
      openEdit(editId);
    }
    if (window.location.hash === "#add") {
      history.replaceState(null, "", window.location.pathname);
      if (!RTS.auth.isViewer()) openAdd();
    } else if (window.location.hash === "#import") {
      history.replaceState(null, "", window.location.pathname);
      setTimeout(() => {
        const openBtn = document.getElementById("openImportBtn");
        if (openBtn && !RTS.auth.isViewer()) openBtn.click();
      }, 50);
    }
  }

  /* ---------------------------- Modal: Mark as Renewed --------------------------- */

  function openRenew(id) {
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access and cannot renew records.", "error");
      return;
    }
    const curRecord = RTS.data.getRenewalById(id);
    if (!curRecord) return;
    if (RTS.auth.isEmployee() && !RTS.auth.canEditRenewal(curRecord)) {
      RTS.toast("Access denied. You can only renew records assigned to you.", "error");
      return;
    }
    const targetInput = document.getElementById("renewTargetId");
    if (targetInput) targetInput.value = id;

    const titleEl = document.getElementById("renewRecordTitle");
    if (titleEl) titleEl.textContent = `— ${curRecord.name}`;

    const renewForm = document.getElementById("renewForm");
    if (renewForm) renewForm.reset();

    const cycleSelect = document.getElementById("renew_recurringCycle");
    if (cycleSelect) {
      cycleSelect.innerHTML = "";
      RTS.RECURRING_CYCLES.forEach((c) => {
        cycleSelect.insertAdjacentHTML("beforeend", `<option value="${c}">${RTS.cycleLabel(c)}</option>`);
      });
      cycleSelect.value = curRecord.recurringCycle || "Yearly";
    }

    const currencySelect = document.getElementById("renew_currency");
    if (currencySelect) {
      currencySelect.innerHTML = "";
      RTS.CURRENCIES.forEach((c) => currencySelect.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));
      currencySelect.value = curRecord.currency || "USD";
    }

    const cycle = curRecord.recurringCycle || "Yearly";
    const autoNewExpiry = RTS.calculateNextExpiry(curRecord.expiryDate, cycle);
    const expInput = document.getElementById("renew_newExpiry");
    if (expInput) expInput.value = autoNewExpiry;

    const costInput = document.getElementById("renew_cost");
    if (costInput) costInput.value = curRecord.cost != null ? curRecord.cost : "";

    const user = RTS.auth && RTS.auth.getCurrentUser ? RTS.auth.getCurrentUser() : null;
    const byInput = document.getElementById("renew_renewedBy");
    if (byInput) byInput.value = (user && user.fullName) || "System User";

    const notice = document.getElementById("renewCycleNotice");
    if (notice) notice.textContent = `Auto-calculated (${RTS.cycleLabel(cycle)})`;

    document.querySelectorAll("#renewForm .field").forEach((f) => f.classList.remove("has-error"));
    RTS.modal.open("renewModal");
  }

  function wireRenewModal() {
    const presetGroup = document.getElementById("cyclePresetGroup");
    const cycleSelect = document.getElementById("renew_recurringCycle");
    if (presetGroup) {
      presetGroup.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = document.getElementById("renewTargetId") ? document.getElementById("renewTargetId").value : null;
          const curRecord = id ? RTS.data.getRenewalById(id) : null;
          if (!curRecord) return;
          presetGroup.querySelectorAll("button").forEach((b) => b.classList.replace("btn-secondary", "btn-ghost"));
          btn.classList.replace("btn-ghost", "btn-secondary");

          let nextExpiry = "";
          let cycleName = "Yearly";
          if (btn.hasAttribute("data-add-months")) {
            const m = parseInt(btn.getAttribute("data-add-months"), 10);
            cycleName = m === 1 ? "Monthly" : "Quarterly";
            nextExpiry = RTS.calculateNextExpiry(curRecord.expiryDate, cycleName);
          } else if (btn.hasAttribute("data-add-years")) {
            const y = parseInt(btn.getAttribute("data-add-years"), 10);
            cycleName = y === 1 ? "Yearly" : y === 2 ? "2-Year" : "3-Year";
            nextExpiry = RTS.calculateNextExpiry(curRecord.expiryDate, cycleName);
          }
          const expInput = document.getElementById("renew_newExpiry");
          if (expInput) expInput.value = nextExpiry;
          if (cycleSelect) cycleSelect.value = cycleName;
          const notice = document.getElementById("renewCycleNotice");
          if (notice) notice.textContent = `Preset applied (${RTS.cycleLabel(cycleName)})`;
        });
      });
    }

    const renewForm = document.getElementById("renewForm");
    if (renewForm) {
      renewForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = document.getElementById("renewTargetId") ? document.getElementById("renewTargetId").value : null;
        if (!id) return;
        const curRecord = RTS.data.getRenewalById(id);
        const newExpiry = document.getElementById("renew_newExpiry").value;
        const renewedBy = document.getElementById("renew_renewedBy").value.trim();
        const nextCycle = cycleSelect ? cycleSelect.value : (curRecord && curRecord.recurringCycle) || "Yearly";
        let valid = true;

        document.querySelectorAll("#renewForm .field").forEach((f) => f.classList.remove("has-error"));

        if (!newExpiry) {
          document.getElementById("rf_newExpiry").classList.add("has-error");
          valid = false;
        } else if (curRecord && curRecord.expiryDate) {
          const oldStr = String(curRecord.expiryDate).slice(0, 10);
          const newStr = String(newExpiry).slice(0, 10);
          if (oldStr && newStr && newStr <= oldStr) {
            document.getElementById("rf_newExpiry").classList.add("has-error");
            RTS.toast("New expiry date must be after current expiry date (" + RTS.formatDate(curRecord.expiryDate) + ").", "warning");
            valid = false;
          }
        }

        if (!renewedBy) {
          document.getElementById("rf_renewedBy").classList.add("has-error");
          valid = false;
        }
        if (!valid) return;

        RTS.data.markAsRenewed(id, {
          newExpiryDate: newExpiry,
          cost: document.getElementById("renew_cost").value ? Number(document.getElementById("renew_cost").value) : (curRecord ? curRecord.cost : null),
          currency: document.getElementById("renew_currency").value,
          recurringCycle: nextCycle,
          renewedBy,
          notes: document.getElementById("renew_notes").value.trim(),
        });
        RTS.toast("Record marked as renewed! Renewal history updated.", "success");
        RTS.modal.close("renewModal");
        renderTable();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    populateSelects();
    wireToolbar();
    wireUpload();
    wireBulkActions();
    wireImport();
    wireRenewModal();
    applyUrlParams();
    renderTable();

    if (RTS.auth.isViewer()) {
      const openAddBtn = document.getElementById("openAddBtn");
      const openImportBtn = document.getElementById("openImportBtn");
      const bulkBar = document.getElementById("bulkActionBar");
      if (openAddBtn) openAddBtn.style.display = "none";
      if (openImportBtn) openImportBtn.style.display = "none";
      if (bulkBar) bulkBar.style.display = "none";
      if (RTS.auth.applyViewerRestrictions) {
        RTS.auth.applyViewerRestrictions();
      }
    }

    RTS.refreshIcons();

    window.addEventListener("rts-language-changed", () => {
      populateSelects();
      renderTable();
    });

    window.addEventListener("rts-renewal-updated", () => {
      renderTable();
    });
  });

  // Exposed for inline onclick handlers & cross-script calls
  window.RecordsPage = {
    openAdd,
    openEdit,
    openRenew,
    openDelete,
    removeDoc,
    render: renderTable,
    goToPage: (p) => {
      state.page = p;
      renderTable();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  };
})();
