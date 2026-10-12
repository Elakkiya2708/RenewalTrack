/* ==========================================================================
   history.js — Renewal History page
   ========================================================================== */

(function () {
  "use strict";

  let state = { search: "", category: "" };

  function populateCategoryFilter() {
    const el = document.getElementById("filterHistoryCategory");
    RTS.CATEGORIES.forEach((c) => el.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));
  }

  function render() {
    let rows = RTS.data.getAllHistory();
    const q = state.search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.renewalName.toLowerCase().includes(q));
    if (state.category) rows = rows.filter((r) => r.category === state.category);

    document.getElementById("historyCount").textContent = `${rows.length} renewal(s)`;

    const tbody = document.getElementById("historyTableBody");
    const empty = document.getElementById("historyEmptyState");
    if (!rows.length) {
      tbody.innerHTML = "";
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");
    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td><a class="link" href="details.html?id=${r.renewalId}">${RTS.escapeHtml(r.renewalName)}</a><span class="cell-sub">${r.recordCode}</span></td>
        <td>${RTS.escapeHtml(r.category)}</td>
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

  function wire() {
    document.getElementById("historySearch").addEventListener(
      "input",
      RTS.debounce((e) => {
        state.search = e.target.value;
        render();
      }, 200)
    );
    document.getElementById("filterHistoryCategory").addEventListener("change", (e) => {
      state.category = e.target.value;
      render();
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    populateCategoryFilter();
    wire();
    render();
    RTS.refreshIcons();
  });
})();
