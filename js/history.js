/* ==========================================================================
   history.js — Renewal History page
   ========================================================================== */

(function () {
  "use strict";

  let state = { search: "", category: "" };

  function populateCategoryFilter() {
    const el = document.getElementById("filterHistoryCategory");
    if (!el) return;
    el.innerHTML = '<option value="">All Categories</option>';
    RTS.CATEGORIES.forEach((c) => el.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));
  }

  function render() {
    let rows = RTS.data.getAllHistory();
    const q = state.search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const name = (r.renewalName || "").toLowerCase();
        const code = (r.recordCode || "").toLowerCase();
        const cat = (r.category || "").toLowerCase();
        const by = (r.renewedBy || "").toLowerCase();
        const notes = (r.notes || "").toLowerCase();
        return name.includes(q) || code.includes(q) || cat.includes(q) || by.includes(q) || notes.includes(q);
      });
    }
    if (state.category) rows = rows.filter((r) => r.category === state.category);

    const countEl = document.getElementById("historyCount");
    if (countEl) countEl.textContent = `${rows.length} renewal${rows.length === 1 ? "" : "s"}`;

    const tbody = document.getElementById("historyTableBody");
    const empty = document.getElementById("historyEmptyState");
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");
    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td>
          <a class="link" href="details.html?id=${encodeURIComponent(r.renewalId || "")}">${RTS.escapeHtml(r.renewalName || "Unnamed")}</a>
          <span class="cell-sub">${RTS.escapeHtml(r.recordCode || "—")}</span>
        </td>
        <td>${RTS.escapeHtml(r.category || "General")}</td>
        <td>${RTS.formatDate(r.previousExpiry)}</td>
        <td>${RTS.formatDate(r.newExpiry)}</td>
        <td>${RTS.formatDate(r.renewalDate)}</td>
        <td>${RTS.formatCurrency(r.cost, r.currency)}</td>
        <td>${RTS.escapeHtml(r.renewedBy || "—")}</td>
        <td>${RTS.escapeHtml(r.notes || "—")}</td>
      </tr>`
      )
      .join("");
  }

  function exportHistoryCSV() {
    const rows = RTS.data.getAllHistory();
    if (!rows.length) {
      RTS.toast("No renewal history to export.", "info");
      return;
    }
    const columns = [
      { label: "Record Name", value: "renewalName" },
      { label: "Record Code", value: "recordCode" },
      { label: "Category", value: "category" },
      { label: "Previous Expiry", value: "previousExpiry" },
      { label: "New Expiry", value: "newExpiry" },
      { label: "Renewal Date", value: "renewalDate" },
      { label: "Cost", value: "cost" },
      { label: "Currency", value: "currency" },
      { label: "Renewed By", value: "renewedBy" },
      { label: "Notes", value: "notes" },
    ];
    RTS.exportCSV(`renewal_history_${RTS.todayISO()}.csv`, rows, columns);
    RTS.toast(`Exported ${rows.length} history record(s) to CSV.`, "success");
  }

  function wire() {
    const searchInput = document.getElementById("historySearch");
    if (searchInput) {
      searchInput.addEventListener(
        "input",
        RTS.debounce((e) => {
          state.search = e.target.value;
          render();
        }, 150)
      );
    }

    const catSelect = document.getElementById("filterHistoryCategory");
    if (catSelect) {
      catSelect.addEventListener("change", (e) => {
        state.category = e.target.value;
        render();
      });
    }

    const exportBtn = document.getElementById("exportHistoryBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", exportHistoryCSV);
    }

    // Auto-update if renewals are updated in other tabs or components
    window.addEventListener("rts-renewal-updated", () => {
      render();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === "rts_renewals" || (RTS.KEYS && e.key === RTS.KEYS.RENEWALS)) {
        render();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    populateCategoryFilter();
    wire();
    render();
    if (RTS.data && RTS.data.syncFromBackend) {
      RTS.data.syncFromBackend().then(() => {
        render();
      });
    }
    RTS.refreshIcons();
  });
})();
