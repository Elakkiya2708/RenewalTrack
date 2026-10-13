/* ==========================================================================
   assigned.js — Assigned to Me page
   Allows employees and admins to view, track, and manage renewals assigned to
   their authenticated account with role-based controls and audit logging.
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
  let deleteTargetId = null;

  function getUser() {
    return RTS.auth.getCurrentUser();
  }

  function getMyRenewals() {
    const all = RTS.data.getRenewals();
    return all.filter((r) => RTS.auth.isAssignedRenewal(r));
  }

  function updateKpis(myList) {
    const totalEl = document.getElementById("statTotalAssigned");
    const activeEl = document.getElementById("statActiveAssigned");
    const dueSoonEl = document.getElementById("statDueSoonAssigned");
    const expiredEl = document.getElementById("statExpiredAssigned");

    let activeCount = 0;
    let dueSoonCount = 0;
    let expiredCount = 0;

    myList.forEach((r) => {
      const status = RTS.computeStatus(r);
      if (status === "active") activeCount++;
      else if (status === "due-soon") dueSoonCount++;
      else if (status === "expired") expiredCount++;
    });

    if (totalEl) totalEl.textContent = myList.length;
    if (activeEl) activeEl.textContent = activeCount;
    if (dueSoonEl) dueSoonEl.textContent = dueSoonCount;
    if (expiredEl) expiredEl.textContent = expiredCount;
  }

  function populateCategories() {
    const catFilter = document.getElementById("assignedFilterCategory");
    if (!catFilter) return;
    catFilter.innerHTML = `<option value="">All Categories</option>`;
    RTS.CATEGORIES.forEach((c) => {
      catFilter.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
    });
  }

  function getFilteredSorted() {
    let list = getMyRenewals();
    updateKpis(list);

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

    list.sort((a, b) => {
      if (a.expiryDate === b.expiryDate) return 0;
      const cmp = a.expiryDate < b.expiryDate ? -1 : 1;
      return state.sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }

  function renderTable() {
    const all = getFilteredSorted();
    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = all.slice(start, start + PAGE_SIZE);

    const resultCountEl = document.getElementById("assignedResultCount");
    if (resultCountEl) {
      resultCountEl.textContent = `${total} assigned renewal${total === 1 ? "" : "s"}`;
    }

    const tbody = document.getElementById("assignedTableBody");
    const emptyState = document.getElementById("assignedEmptyState");

    if (!pageItems.length) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.classList.remove("hidden");
    } else {
      if (emptyState) emptyState.classList.add("hidden");
      tbody.innerHTML = pageItems
        .map((r) => {
          const status = RTS.computeStatus(r);
          const cycleTxt = RTS.cycleLabel(r.recurringCycle || "Yearly");
          return `
          <tr>
            <td class="cell-primary">${r.code}</td>
            <td>
              <span class="cell-primary"><a href="details.html?id=${r.id}" style="color:inherit;text-decoration:none;">${RTS.escapeHtml(r.name)}</a></span>
              <span class="cell-sub">${(r.documents || []).length} document(s)</span>
            </td>
            <td>${RTS.escapeHtml(r.category)}</td>
            <td>${RTS.escapeHtml(r.organization || "—")}</td>
            <td>${RTS.formatDate(r.expiryDate)}</td>
            <td><span class="badge badge-cycle"><i data-lucide="repeat" style="width:11px;height:11px;display:inline-block;vertical-align:-1px;"></i> ${RTS.escapeHtml(cycleTxt)}</span></td>
            <td>${RTS.formatCurrency(r.cost, r.currency)}</td>
            <td>${RTS.statusBadgeHtml(status)}</td>
            <td>${RTS.priorityBadgeHtml(r.priority)}</td>
            <td>
              <div class="row-actions">
                <a class="icon-btn" href="details.html?id=${r.id}" aria-label="View details" title="View details"><i data-lucide="eye" class="icon"></i></a>
                <button class="icon-btn" aria-label="Renew" title="Mark as Renewed" onclick="AssignedPage.openRenew('${r.id}')"><i data-lucide="refresh-cw" class="icon"></i></button>
              </div>
            </td>
          </tr>`;
        })
        .join("");
    }

    renderPagination(totalPages);
    RTS.refreshIcons();
  }

  function renderPagination(totalPages) {
    const el = document.getElementById("assignedPagination");
    if (!el) return;
    if (totalPages <= 1) {
      el.innerHTML = "";
      return;
    }
    let buttons = "";
    for (let i = 1; i <= totalPages; i++) {
      buttons += `<button class="${i === state.page ? "active" : ""}" onclick="AssignedPage.goToPage(${i})">${i}</button>`;
    }
    el.innerHTML = `
      <div class="pagination-wrap">
        <button ${state.page === 1 ? "disabled" : ""} onclick="AssignedPage.goToPage(${state.page - 1})"><i data-lucide="chevron-left" class="icon" style="width:14px;height:14px;"></i></button>
        ${buttons}
        <button ${state.page === totalPages ? "disabled" : ""} onclick="AssignedPage.goToPage(${state.page + 1})"><i data-lucide="chevron-right" class="icon" style="width:14px;height:14px;"></i></button>
      </div>`;
  }

  function openEdit(id) {
    if (!RTS.auth.isAdmin()) {
      RTS.toast("Access denied. Only Administrators can edit renewals.", "error");
      return;
    }
    window.location.href = `records.html?edit=${encodeURIComponent(id)}`;
  }

  function openRenew(id) {
    const curRecord = RTS.data.getRenewalById(id);
    if (!curRecord) return;
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access and cannot renew records.", "error");
      return;
    }
    if (RTS.auth.isEmployee() && !RTS.auth.canRenewRenewal(curRecord)) {
      RTS.toast("Access denied. You can only renew records assigned to your account.", "error");
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

    const user = getUser();
    const byInput = document.getElementById("renew_renewedBy");
    if (byInput) byInput.value = (user && (user.fullName || user.name)) || "User";

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
        RTS.toast("Renewal completed! Expiry date updated.", "success");
        RTS.modal.close("renewModal");
        renderTable();
      });
    }
  }

  function openDelete(id) {
    if (!RTS.auth.isAdmin()) {
      RTS.toast("Access denied. Only Administrators can delete renewals.", "error");
      return;
    }
    const record = RTS.data.getRenewalById(id);
    if (!record) return;
    deleteTargetId = id;
    document.getElementById("deleteRecordName").textContent = record.name;
    RTS.modal.open("deleteModal");
  }

  function confirmDelete() {
    if (!deleteTargetId) return;
    if (!RTS.auth.isAdmin()) {
      RTS.toast("Access denied. Only Administrators can delete renewals.", "error");
      return;
    }
    RTS.data.deleteRenewal(deleteTargetId);
    RTS.toast("Renewal record deleted.", "success");
    deleteTargetId = null;
    RTS.modal.close("deleteModal");
    renderTable();
  }

  function wireToolbar() {
    document.getElementById("assignedSearch").addEventListener(
      "input",
      RTS.debounce((e) => {
        state.search = e.target.value;
        state.page = 1;
        renderTable();
      }, 200)
    );
    document.getElementById("assignedFilterCategory").addEventListener("change", (e) => {
      state.category = e.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById("assignedFilterStatus").addEventListener("change", (e) => {
      state.status = e.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById("assignedFilterPriority").addEventListener("change", (e) => {
      state.priority = e.target.value;
      state.page = 1;
      renderTable();
    });
    document.getElementById("sortExpiry").addEventListener("click", () => {
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      renderTable();
    });

    const exportBtn = document.getElementById("exportMyCsvBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const renewals = getFilteredSorted();
        const columns = [
          { label: "Record ID", value: "code" },
          { label: "Name", value: "name" },
          { label: "Category", value: "category" },
          { label: "Organization", value: "organization" },
          { label: "Expiry Date", value: "expiryDate" },
          { label: "Cost", value: "cost" },
          { label: "Currency", value: "currency" },
          { label: "Recurring Cycle", value: (r) => r.recurringCycle || "Yearly" },
          { label: "Priority", value: "priority" },
          { label: "Status", value: (r) => RTS.computeStatus(r) },
        ];
        RTS.exportCSV("my_assigned_renewals.csv", renewals, columns);
        RTS.toast(`Exported ${renewals.length} assigned renewal(s) to CSV.`, "success");
      });
    }

    const confirmDelBtn = document.getElementById("confirmDeleteBtn");
    if (confirmDelBtn) confirmDelBtn.addEventListener("click", confirmDelete);
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();

    if (!RTS.auth.isEmployee()) {
      if (RTS.auth.isAdmin()) {
        window.location.replace("records.html");
      } else {
        window.location.replace("dashboard.html");
      }
      return;
    }

    const badge = document.getElementById("assignedRoleBadge");
    if (badge) {
      badge.textContent = "Employee Workspace";
    }

    populateCategories();
    wireToolbar();
    wireRenewModal();
    renderTable();

    if (RTS.data && RTS.data.syncFromBackend) {
      RTS.data.syncFromBackend().then(() => {
        renderTable();
      });
    }

    window.addEventListener("rts-renewal-updated", () => {
      renderTable();
    });
  });

  window.AssignedPage = {
    openEdit,
    openRenew,
    openDelete,
    render: renderTable,
    goToPage: (p) => {
      state.page = p;
      renderTable();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  };
})();
