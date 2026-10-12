/* ==========================================================================
   assigned.js — Assigned to Me page (Redesigned with Navy & Purple Theme)
   Allows employees to view, track, and manage renewals assigned to their
   authenticated account with strict RBAC enforcement, urgency badges,
   quick editing of permitted renewal fields, and audit trails.
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
  };

  let isLoading = false;
  let currentAssignedList = [];

  function getUser() {
    return RTS.auth.getCurrentUser();
  }

  function getMyRenewals() {
    const user = getUser();
    const uId = user.id ? String(user.id) : "";
    const uEmail = (user.email || "").toLowerCase();
    const uName = (user.fullName || user.name || "").toLowerCase();

    const all = RTS.data.getRenewals();
    return all.filter((r) => {
      const assignedId = r.assignedToId || r.assigned_to_id ? String(r.assignedToId || r.assigned_to_id) : "";
      const assignedEmail = (r.assignedToEmail || r.assigned_to_email || r.responsibleEmail || r.responsible_email || "").toLowerCase();
      const assignedName = (r.assignedToName || r.assigned_to_name || r.responsiblePerson || r.responsible_person || "").toLowerCase();
      const createdBy = (r.createdBy || "").toLowerCase();

      return (
        (uId && assignedId === uId) ||
        (uEmail && assignedEmail === uEmail) ||
        (uName && assignedName === uName) ||
        (uEmail && createdBy === uEmail)
      );
    });
  }

  function updateKpis(myList) {
    const totalEl = document.getElementById("statTotalAssigned");
    const dueSoonEl = document.getElementById("statDueSoonAssigned");
    const overdueEl = document.getElementById("statOverdueAssigned");
    const completedEl = document.getElementById("statCompletedAssigned");

    let dueSoonCount = 0;
    let overdueCount = 0;
    let completedCount = 0;

    myList.forEach((r) => {
      const status = RTS.computeStatus(r);
      const days = RTS.daysRemaining(r.expiryDate);

      if (status === "renewed") {
        completedCount++;
      } else if (status === "expired" || days < 0) {
        overdueCount++;
      } else if (status === "due-soon" || (days <= 30 && days >= 0)) {
        dueSoonCount++;
      }
    });

    if (totalEl) totalEl.textContent = myList.length;
    if (dueSoonEl) dueSoonEl.textContent = dueSoonCount;
    if (overdueEl) overdueEl.textContent = overdueCount;
    if (completedEl) completedEl.textContent = completedCount;
  }

  function renderUrgencyBadge(record, status) {
    if (status === "renewed") {
      return `<span class="urgency-pill urgency-completed"><i data-lucide="check" style="width:12px;height:12px;"></i> Renewed</span>`;
    }

    const days = RTS.daysRemaining(record.expiryDate);
    if (days < 0) {
      return `<span class="urgency-pill urgency-overdue"><i data-lucide="alert-octagon" style="width:12px;height:12px;"></i> ${Math.abs(days)}d overdue</span>`;
    }
    if (days === 0) {
      return `<span class="urgency-pill urgency-today"><i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> Expires today</span>`;
    }
    if (days <= 30) {
      return `<span class="urgency-pill urgency-soon"><i data-lucide="clock" style="width:12px;height:12px;"></i> ${days}d remaining</span>`;
    }
    return `<span class="urgency-pill urgency-safe"><i data-lucide="shield-check" style="width:12px;height:12px;"></i> ${days}d remaining</span>`;
  }

  function populateSelects() {
    const catFilter = document.getElementById("assignedFilterCategory");
    const qeCat = document.getElementById("qe_category");
    if (catFilter) {
      catFilter.innerHTML = `<option value="">All Categories</option>`;
      RTS.CATEGORIES.forEach((c) => {
        catFilter.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      });
    }
    if (qeCat) {
      qeCat.innerHTML = `<option value="">Select a category</option>`;
      RTS.CATEGORIES.forEach((c) => {
        qeCat.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      });
    }

    const qeCurr = document.getElementById("qe_currency");
    if (qeCurr) {
      qeCurr.innerHTML = "";
      RTS.CURRENCIES.forEach((c) => {
        qeCurr.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      });
    }

    const qeCycle = document.getElementById("qe_cycle");
    const renewCycle = document.getElementById("renew_recurringCycle");
    if (qeCycle) {
      qeCycle.innerHTML = "";
      RTS.RECURRING_CYCLES.forEach((c) => {
        qeCycle.insertAdjacentHTML("beforeend", `<option value="${c}">${RTS.cycleLabel(c)}</option>`);
      });
    }
    if (renewCycle) {
      renewCycle.innerHTML = "";
      RTS.RECURRING_CYCLES.forEach((c) => {
        renewCycle.insertAdjacentHTML("beforeend", `<option value="${c}">${RTS.cycleLabel(c)}</option>`);
      });
    }

    const renewCurr = document.getElementById("renew_currency");
    if (renewCurr) {
      renewCurr.innerHTML = "";
      RTS.CURRENCIES.forEach((c) => {
        renewCurr.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      });
    }
  }

  function getFilteredSorted() {
    currentAssignedList = getMyRenewals();
    updateKpis(currentAssignedList);

    let list = currentAssignedList.slice();
    const q = state.search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.organization || "").toLowerCase().includes(q) ||
          (r.referenceNumber || "").toLowerCase().includes(q) ||
          (r.code || "").toLowerCase().includes(q) ||
          (r.category || "").toLowerCase().includes(q)
      );
    }
    if (state.category) list = list.filter((r) => r.category === state.category);
    if (state.status) list = list.filter((r) => RTS.computeStatus(r) === state.status);
    if (state.priority) list = list.filter((r) => r.priority === state.priority);

    list.sort((a, b) => {
      if (a.expiryDate === b.expiryDate) return 0;
      const cmp = a.expiryDate < b.expiryDate ? -1 : 1;
      return state.sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }

  function renderTable() {
    const tbody = document.getElementById("assignedTableBody");
    const emptyState = document.getElementById("assignedEmptyState");
    const noMatchesState = document.getElementById("assignedNoMatchesState");
    const tableEl = document.getElementById("assignedTable");
    const resultCountEl = document.getElementById("assignedResultCount");

    if (isLoading) {
      document.getElementById("assignedSkeletonWrap").style.display = "block";
      if (tableEl) tableEl.style.display = "none";
      if (emptyState) emptyState.classList.add("hidden");
      if (noMatchesState) noMatchesState.classList.add("hidden");
      return;
    }

    document.getElementById("assignedSkeletonWrap").style.display = "none";
    if (tableEl) tableEl.style.display = "";

    const all = getFilteredSorted();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = all.slice(start, start + PAGE_SIZE);

    if (resultCountEl) {
      resultCountEl.textContent = `${total} assigned renewal${total === 1 ? "" : "s"}`;
    }

    if (currentAssignedList.length === 0) {
      // 0 total assigned to this employee
      if (tableEl) tableEl.style.display = "none";
      if (emptyState) emptyState.classList.remove("hidden");
      if (noMatchesState) noMatchesState.classList.add("hidden");
      tbody.innerHTML = "";
      renderPagination(1);
      return;
    }

    if (!pageItems.length) {
      // Filters produced 0 matches
      if (tableEl) tableEl.style.display = "none";
      if (emptyState) emptyState.classList.add("hidden");
      if (noMatchesState) noMatchesState.classList.remove("hidden");
      tbody.innerHTML = "";
      renderPagination(1);
      return;
    }

    // Has matching records
    if (tableEl) tableEl.style.display = "";
    if (emptyState) emptyState.classList.add("hidden");
    if (noMatchesState) noMatchesState.classList.add("hidden");

    tbody.innerHTML = pageItems
      .map((r) => {
        const status = RTS.computeStatus(r);
        const docsCount = (r.documents || []).length;
        const urgencyHtml = renderUrgencyBadge(r, status);

        return `
        <tr>
          <td class="cell-primary" style="font-family:monospace;font-size:12px;">${r.code}</td>
          <td>
            <div style="line-height:1.25;">
              <span class="cell-primary"><a href="details.html?id=${r.id}" style="color:inherit;text-decoration:none;font-weight:600;">${RTS.escapeHtml(r.name)}</a></span>
              <div class="cell-sub" style="font-size:11.5px;margin-top:2px;display:flex;align-items:center;gap:6px;">
                ${docsCount > 0 ? `<span style="color:var(--accent-text);"><i data-lucide="paperclip" style="width:11px;height:11px;vertical-align:-1px;display:inline-block;"></i> ${docsCount} doc(s)</span> · ` : ""}
                <span>${r.recurringCycle || "Yearly"}</span>
              </div>
            </div>
          </td>
          <td><span class="badge" style="background:var(--bg-surface-2);color:var(--text-primary);border:1px solid var(--border);">${RTS.escapeHtml(r.category)}</span></td>
          <td>${RTS.escapeHtml(r.organization || "—")}</td>
          <td style="font-weight:500;">${RTS.formatDate(r.expiryDate)}</td>
          <td>${RTS.priorityBadgeHtml(r.priority)}</td>
          <td>${RTS.statusBadgeHtml(status)}</td>
          <td>${urgencyHtml}</td>
          <td style="text-align:right;">
            <div class="row-actions" style="justify-content:flex-end;">
              <a class="icon-btn" href="details.html?id=${r.id}" aria-label="View details" title="View full details"><i data-lucide="eye" class="icon"></i></a>
              <button class="icon-btn" aria-label="Renew" title="Mark as Renewed" onclick="AssignedPage.openRenew('${r.id}')"><i data-lucide="refresh-cw" class="icon"></i></button>
              <button class="icon-btn" aria-label="Edit" title="Update permitted renewal info" onclick="AssignedPage.openQuickEdit('${r.id}')"><i data-lucide="edit-3" class="icon"></i></button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    renderPagination(totalPages);
    RTS.refreshIcons();
  }

  function renderPagination(totalPages) {
    const pag = document.getElementById("assignedPagination");
    if (!pag) return;
    if (totalPages <= 1) {
      pag.innerHTML = "";
      return;
    }
    let html = `
      <button class="page-btn" ${state.page <= 1 ? "disabled" : ""} onclick="AssignedPage.goToPage(${state.page - 1})">
        <i data-lucide="chevron-left" class="icon"></i>
      </button>`;
    for (let p = 1; p <= totalPages; p++) {
      html += `<button class="page-btn ${p === state.page ? "active" : ""}" onclick="AssignedPage.goToPage(${p})">${p}</button>`;
    }
    html += `
      <button class="page-btn" ${state.page >= totalPages ? "disabled" : ""} onclick="AssignedPage.goToPage(${state.page + 1})">
        <i data-lucide="chevron-right" class="icon"></i>
      </button>`;
    pag.innerHTML = html;
    RTS.refreshIcons();
  }

  /* ---------------------------- Quick Edit Modal (Employee) --------------------------- */

  function clearQeErrors() {
    document.querySelectorAll("#quickEditForm .field").forEach((f) => f.classList.remove("has-error"));
  }

  function openQuickEdit(id) {
    const record = RTS.data.getRenewalById(id);
    if (!record) return;

    // RBAC: verify employee can edit
    if (RTS.auth.isEmployee() && !RTS.auth.canEditRenewal(record)) {
      RTS.toast("Access denied. You can only update renewals assigned to your account.", "error");
      return;
    }

    clearQeErrors();
    document.getElementById("qe_id").value = id;
    document.getElementById("qe_name").value = record.name || "";
    document.getElementById("qe_category").value = record.category || "";
    document.getElementById("qe_priority").value = record.priority || "Medium";
    document.getElementById("qe_organization").value = record.organization || "";
    document.getElementById("qe_reference").value = record.referenceNumber || "";
    document.getElementById("qe_issueDate").value = record.issueDate || "";
    document.getElementById("qe_expiryDate").value = record.expiryDate || "";
    document.getElementById("qe_cost").value = record.cost != null ? record.cost : "";
    document.getElementById("qe_currency").value = record.currency || "USD";
    document.getElementById("qe_cycle").value = record.recurringCycle || "Yearly";
    document.getElementById("qe_notes").value = record.notes || "";

    RTS.modal.open("quickEditModal");
  }

  function handleQuickEditSubmit(e) {
    e.preventDefault();
    clearQeErrors();

    const id = document.getElementById("qe_id").value;
    const existing = RTS.data.getRenewalById(id);
    if (!existing) return;

    let valid = true;
    const req = (inputId, fieldId) => {
      const el = document.getElementById(inputId);
      if (!el || !el.value.trim()) {
        const f = document.getElementById(fieldId);
        if (f) f.classList.add("has-error");
        valid = false;
      }
    };

    req("qe_name", "qef_name");
    req("qe_category", "qef_category");
    req("qe_organization", "qef_organization");
    req("qe_issueDate", "qef_issueDate");
    req("qe_expiryDate", "qef_expiryDate");

    const issue = document.getElementById("qe_issueDate").value;
    const expiry = document.getElementById("qe_expiryDate").value;
    if (issue && expiry && expiry <= issue) {
      document.getElementById("qef_expiryDate").classList.add("has-error");
      valid = false;
    }

    const costVal = document.getElementById("qe_cost").value;
    if (costVal !== "" && Number(costVal) < 0) {
      document.getElementById("qef_cost").classList.add("has-error");
      valid = false;
    }

    if (!valid) {
      RTS.toast("Please fix the highlighted fields.", "error");
      return;
    }

    // Preserve existing assignment ownership strictly
    const updates = {
      name: document.getElementById("qe_name").value.trim(),
      category: document.getElementById("qe_category").value,
      priority: document.getElementById("qe_priority").value,
      organization: document.getElementById("qe_organization").value.trim(),
      referenceNumber: document.getElementById("qe_reference").value.trim(),
      issueDate: document.getElementById("qe_issueDate").value,
      expiryDate: document.getElementById("qe_expiryDate").value,
      cost: costVal === "" ? null : Number(costVal),
      currency: document.getElementById("qe_currency").value,
      recurringCycle: document.getElementById("qe_cycle").value,
      notes: document.getElementById("qe_notes").value.trim(),
      assignedToId: existing.assignedToId || existing.assigned_to_id,
      assignedToName: existing.assignedToName || existing.assigned_to_name,
      assignedToEmail: existing.assignedToEmail || existing.assigned_to_email,
    };

    RTS.data.updateRenewal(id, updates);
    RTS.modal.close("quickEditModal");
    RTS.toast("Renewal details updated successfully.", "success");
    renderTable();
  }

  /* ---------------------------- Mark as Renewed Modal --------------------------- */

  let renewTargetId = null;

  function openRenew(id) {
    renewTargetId = id;
    const record = RTS.data.getRenewalById(id);
    if (!record) return;

    if (RTS.auth.isEmployee() && !RTS.auth.canEditRenewal(record)) {
      RTS.toast("Access denied. You can only renew contracts assigned to your account.", "error");
      return;
    }

    document.getElementById("renewTargetId").value = id;
    document.getElementById("renewRecordTitle").textContent = record.name;
    const user = getUser();
    document.getElementById("renew_renewedBy").value = user.fullName || user.name || "Employee";
    document.getElementById("renew_notes").value = "";
    document.getElementById("renew_cost").value = record.cost != null ? record.cost : "";
    document.getElementById("renew_currency").value = record.currency || "USD";
    document.getElementById("renew_recurringCycle").value = record.recurringCycle || "Yearly";

    // Set new expiry calculated from current expiry
    const cycle = record.recurringCycle || "Yearly";
    const nextExp = RTS.addRecurringCycle(record.expiryDate, cycle);
    document.getElementById("renew_newExpiry").value = nextExp;

    const notice = document.getElementById("renewCycleNotice");
    if (notice) notice.textContent = `Preset: ${RTS.cycleLabel(cycle)}`;

    RTS.modal.open("renewModal");
  }

  function handleRenewSubmit(e) {
    e.preventDefault();
    const id = document.getElementById("renewTargetId").value;
    const record = RTS.data.getRenewalById(id);
    if (!record) return;

    const newExpiry = document.getElementById("renew_newExpiry").value;
    const renewedBy = document.getElementById("renew_renewedBy").value.trim();

    if (!newExpiry || newExpiry <= record.expiryDate) {
      document.getElementById("rf_newExpiry").classList.add("has-error");
      RTS.toast("New expiry date must be strictly after the current expiry date.", "error");
      return;
    }
    if (!renewedBy) {
      document.getElementById("rf_renewedBy").classList.add("has-error");
      RTS.toast("Please specify who processed this renewal.", "error");
      return;
    }

    const costVal = document.getElementById("renew_cost").value;
    const newCost = costVal === "" ? record.cost : Number(costVal);
    const notes = document.getElementById("renew_notes").value.trim();
    const cycle = document.getElementById("renew_recurringCycle").value;

    RTS.data.markRenewed(id, {
      newExpiry,
      renewedBy,
      cost: newCost,
      currency: document.getElementById("renew_currency").value,
      recurringCycle: cycle,
      notes,
    });

    RTS.modal.close("renewModal");
    RTS.toast(`Record "${record.name}" has been marked as renewed!`, "success");
    renderTable();
  }

  function wireCyclePresets() {
    const group = document.getElementById("cyclePresetGroup");
    if (!group) return;
    group.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = document.getElementById("renewTargetId").value;
      const record = RTS.data.getRenewalById(id);
      const baseDate = record ? record.expiryDate : RTS.todayISO();

      let nextDate = baseDate;
      if (btn.dataset.addMonths) {
        nextDate = RTS.addMonths(baseDate, Number(btn.dataset.addMonths));
      } else if (btn.dataset.addYears) {
        nextDate = RTS.addYears(baseDate, Number(btn.dataset.addYears));
      }
      document.getElementById("renew_newExpiry").value = nextDate;

      group.querySelectorAll("button").forEach((b) => b.classList.replace("btn-secondary", "btn-ghost"));
      btn.classList.replace("btn-ghost", "btn-secondary");
    });
  }

  /* ---------------------------- CSV Export --------------------------- */

  function exportCsv() {
    const list = getFilteredSorted();
    if (!list.length) {
      RTS.toast("No assigned renewals to export.", "info");
      return;
    }
    const headers = [
      "Record ID",
      "Renewal Name",
      "Category",
      "Organization",
      "Expiry Date",
      "Remaining Days",
      "Priority",
      "Status",
      "Cost",
      "Currency",
      "Cycle",
    ];
    const rows = list.map((r) => [
      `"${r.code || ""}"`,
      `"${(r.name || "").replace(/"/g, '""')}"`,
      `"${r.category || ""}"`,
      `"${(r.organization || "").replace(/"/g, '""')}"`,
      r.expiryDate || "",
      RTS.daysRemaining(r.expiryDate),
      r.priority || "",
      RTS.computeStatus(r),
      r.cost != null ? r.cost : "",
      r.currency || "USD",
      r.recurringCycle || "Yearly",
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `renewals-assigned-to-${(getUser().name || "me").toLowerCase().replace(/\s+/g, "_")}-${RTS.todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    RTS.toast("Exported assigned renewals to CSV.", "success");
  }

  /* ---------------------------- Wire Events --------------------------- */

  function wireEvents() {
    const searchInput = document.getElementById("assignedSearch");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.search = e.target.value;
        state.page = 1;
        renderTable();
      });
    }

    const catFilter = document.getElementById("assignedFilterCategory");
    if (catFilter) {
      catFilter.addEventListener("change", (e) => {
        state.category = e.target.value;
        state.page = 1;
        renderTable();
      });
    }

    const statusFilter = document.getElementById("assignedFilterStatus");
    if (statusFilter) {
      statusFilter.addEventListener("change", (e) => {
        state.status = e.target.value;
        state.page = 1;
        renderTable();
      });
    }

    const priorityFilter = document.getElementById("assignedFilterPriority");
    if (priorityFilter) {
      priorityFilter.addEventListener("change", (e) => {
        state.priority = e.target.value;
        state.page = 1;
        renderTable();
      });
    }

    const sortExpiryTh = document.getElementById("sortExpiry");
    if (sortExpiryTh) {
      sortExpiryTh.addEventListener("click", () => {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        const icon = sortExpiryTh.querySelector(".sort-icon");
        if (icon) {
          icon.setAttribute("data-lucide", state.sortDir === "asc" ? "arrow-up" : "arrow-down");
          RTS.refreshIcons();
        }
        renderTable();
      });
    }

    const resetBtn = document.getElementById("resetFiltersBtn");
    const clearBtn = document.getElementById("clearFiltersBtn");
    const resetHandler = () => {
      state.search = "";
      state.category = "";
      state.status = "";
      state.priority = "";
      state.page = 1;
      if (searchInput) searchInput.value = "";
      if (catFilter) catFilter.value = "";
      if (statusFilter) statusFilter.value = "";
      if (priorityFilter) priorityFilter.value = "";
      renderTable();
    };
    if (resetBtn) resetBtn.addEventListener("click", resetHandler);
    if (clearBtn) clearBtn.addEventListener("click", resetHandler);

    const exportBtn = document.getElementById("exportMyCsvBtn");
    if (exportBtn) exportBtn.addEventListener("click", exportCsv);

    const refreshBtn = document.getElementById("refreshBtn");
    const retryBtn = document.getElementById("retryLoadBtn");
    const refreshHandler = async () => {
      isLoading = true;
      renderTable();
      try {
        if (RTS.data && RTS.data.syncWithServer) {
          await RTS.data.syncWithServer();
        }
        document.getElementById("assignedErrorAlert").style.display = "none";
      } catch (err) {
        console.warn("Error refreshing renewals:", err);
        document.getElementById("assignedErrorAlert").style.display = "flex";
      } finally {
        isLoading = false;
        renderTable();
      }
    };
    if (refreshBtn) refreshBtn.addEventListener("click", refreshHandler);
    if (retryBtn) retryBtn.addEventListener("click", refreshHandler);

    // Wire Forms
    const qeForm = document.getElementById("quickEditForm");
    if (qeForm) qeForm.addEventListener("submit", handleQuickEditSubmit);

    const renewForm = document.getElementById("renewForm");
    if (renewForm) renewForm.addEventListener("submit", handleRenewSubmit);

    wireCyclePresets();
  }

  /* ---------------------------- Initialization --------------------------- */

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initCommon();

    const u = getUser();
    const nameEl = document.getElementById("employeeBadgeName");
    if (nameEl) {
      nameEl.textContent = `Logged in as: ${u.fullName || u.name} (${u.email})`;
    }

    populateSelects();
    wireEvents();
    renderTable();

    window.addEventListener("rts-renewal-updated", () => {
      renderTable();
    });
  });

  window.AssignedPage = {
    openQuickEdit,
    openRenew,
    goToPage: (p) => {
      state.page = p;
      renderTable();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    render: renderTable,
  };
})();
