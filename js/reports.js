/* ==========================================================================
   reports.js — Reports & Cost Forecasting page
   ========================================================================== */

(function () {
  "use strict";

  let activeHorizonDays = 90;

  function renderCostForecast(list, horizonDays) {
    const today = RTS.todayISO();
    const upcoming = list.filter((r) => {
      const days = RTS.daysRemaining(r.expiryDate);
      if (horizonDays === 9999) return days >= 0;
      return days >= 0 && days <= horizonDays;
    });

    const totalSpend = upcoming.reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
    const count = upcoming.length;
    const highPrioritySpend = upcoming
      .filter((r) => r.priority === "High")
      .reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
    const avgSpend = count > 0 ? totalSpend / count : 0;

    // Currency symbol preference: USD by default
    const preferredCurrency = upcoming[0] ? upcoming[0].currency || "USD" : "USD";

    const totalEl = document.getElementById("forecastTotalCost");
    const countEl = document.getElementById("forecastRecordCount");
    const highEl = document.getElementById("forecastHighPriorityCost");
    const avgEl = document.getElementById("forecastAvgCost");

    if (totalEl) totalEl.textContent = RTS.formatCurrency(totalSpend, preferredCurrency);
    if (countEl) countEl.textContent = count;
    if (highEl) highEl.textContent = RTS.formatCurrency(highPrioritySpend, preferredCurrency);
    if (avgEl) avgEl.textContent = RTS.formatCurrency(avgSpend, preferredCurrency);

    // Category breakdown
    const categoryTotals = {};
    upcoming.forEach((r) => {
      const cat = r.category || "Other";
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(r.cost) || 0);
    });

    const catSorted = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
    const catBarsContainer = document.getElementById("forecastCategoryBars");

    if (catBarsContainer) {
      if (!catSorted.length) {
        catBarsContainer.innerHTML = '<p class="text-mid" style="font-size:13px;">No renewal spending projected in this period.</p>';
      } else {
        catBarsContainer.innerHTML = catSorted
          .map((cat) => {
            const cost = categoryTotals[cat];
            const pct = totalSpend > 0 ? Math.round((cost / totalSpend) * 100) : 0;
            return `
            <div class="forecast-cat-row">
              <div class="forecast-cat-meta">
                <span class="cat-name"><strong>${RTS.escapeHtml(cat)}</strong></span>
                <span class="cat-amount">${RTS.formatCurrency(cost, preferredCurrency)} <span class="text-mid" style="font-size:11px;">(${pct}%)</span></span>
              </div>
              <div class="forecast-bar-track">
                <div class="forecast-bar-fill" style="width:${Math.max(pct, 2)}%;"></div>
              </div>
            </div>`;
          })
          .join("");
      }
    }

    // Top costly upcoming renewals
    const topRenewals = upcoming.slice().sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0)).slice(0, 5);
    const topRenewalsContainer = document.getElementById("forecastTopRenewals");
    if (topRenewalsContainer) {
      if (!topRenewals.length) {
        topRenewalsContainer.innerHTML = '<p class="text-mid" style="font-size:13px;">No upcoming renewals found in this window.</p>';
      } else {
        topRenewalsContainer.innerHTML = topRenewals
          .map((r) => {
            const daysLeft = RTS.daysRemaining(r.expiryDate);
            return `
            <div class="summary-row" style="padding:7px 0;">
              <div>
                <a class="link" href="details.html?id=${r.id}" style="font-weight:600;font-size:13px;">${RTS.escapeHtml(r.name)}</a>
                <span class="cell-sub" style="display:block;">${RTS.escapeHtml(r.category)} · ${daysLeft}d left</span>
              </div>
              <div style="text-align:right;">
                <strong style="font-size:13px;color:var(--text-hi);">${RTS.formatCurrency(r.cost, r.currency)}</strong>
                <span style="display:block;font-size:11px;">${RTS.priorityBadgeHtml(r.priority)}</span>
              </div>
            </div>`;
          })
          .join("");
      }
    }

    RTS.refreshIcons();
  }

  function wireForecastTabs(list) {
    const tabsContainer = document.getElementById("forecastTabs");
    if (!tabsContainer) return;

    tabsContainer.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        tabsContainer.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        activeHorizonDays = parseInt(btn.getAttribute("data-days"), 10) || 90;
        renderCostForecast(list, activeHorizonDays);
      });
    });
  }

  function renderStatusSummary(list) {
    const statuses = list.map(RTS.computeStatus);
    const total = list.length || 1;
    const counts = {
      active: statuses.filter((s) => s === "active").length,
      "due-soon": statuses.filter((s) => s === "due-soon").length,
      expired: statuses.filter((s) => s === "expired").length,
      renewed: statuses.filter((s) => s === "renewed").length,
    };
    const el = document.getElementById("statusSummary");
    if (!el) return;
    el.innerHTML = Object.keys(counts)
      .map(
        (key) => `
      <div class="summary-row">
        <span>${RTS.statusBadgeHtml(key)}</span>
        <span class="count">${counts[key]} <span class="text-mid" style="font-weight:400;font-size:11.5px;">(${Math.round((counts[key] / total) * 100)}%)</span></span>
      </div>`
      )
      .join("");
  }

  function renderCategorySummary(list) {
    const counts = {};
    RTS.CATEGORIES.forEach((c) => (counts[c] = 0));
    list.forEach((r) => (counts[r.category] = (counts[r.category] || 0) + 1));
    const el = document.getElementById("categorySummary");
    if (!el) return;
    el.innerHTML = RTS.CATEGORIES.map(
      (cat) => `
      <div class="summary-row">
        <span>${cat}</span>
        <span class="count">${counts[cat]}</span>
      </div>`
    ).join("");
  }

  function renderTrendChart(list) {
    const now = new Date();
    const buckets = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      buckets.push({ label: d.toLocaleDateString("en-US", { month: "short" }), year: d.getFullYear(), month: d.getMonth(), count: 0, cost: 0 });
    }
    list.forEach((r) => {
      const d = new Date(r.expiryDate + "T00:00:00");
      const bucket = buckets.find((b) => b.year === d.getFullYear() && b.month === d.getMonth());
      if (bucket) {
        bucket.count++;
        bucket.cost += Number(r.cost) || 0;
      }
    });
    const max = Math.max(...buckets.map((b) => b.count), 1);
    const el = document.getElementById("trendChart");
    if (!el) return;
    el.innerHTML = buckets
      .map(
        (b) => `
      <div class="bar-chart-col" title="${b.label}: ${b.count} renewal(s), $${b.cost.toLocaleString()}">
        <span style="font-size:11px;color:var(--text-mid);">${b.count}</span>
        <div class="bar-chart-bar" style="height:${Math.max((b.count / max) * 100, 4)}%;"></div>
        <div class="bar-chart-label">${b.label}</div>
      </div>`
      )
      .join("");
  }

  function renderExpired(list) {
    const rows = list
      .filter((r) => RTS.computeStatus(r) === "expired")
      .sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : 1));
    const el = document.getElementById("expiredReport");
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<p class="text-mid" style="font-size:13px;">No expired records. Nice work!</p>';
      return;
    }
    el.innerHTML = rows
      .map(
        (r) => `
      <div class="summary-row">
        <span><a class="link" href="details.html?id=${r.id}">${RTS.escapeHtml(r.name)}</a></span>
        <span class="count" style="color:var(--danger);font-size:12.5px;">${Math.abs(RTS.daysRemaining(r.expiryDate))}d overdue</span>
      </div>`
      )
      .join("");
  }

  function renderDueSoon(list) {
    const rows = list
      .filter((r) => RTS.computeStatus(r) === "due-soon")
      .sort((a, b) => (a.expiryDate < b.expiryDate ? -1 : 1));
    const el = document.getElementById("dueSoonReport");
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = '<p class="text-mid" style="font-size:13px;">Nothing due in the next 30 days.</p>';
      return;
    }
    el.innerHTML = rows
      .map(
        (r) => `
      <div class="summary-row">
        <span><a class="link" href="details.html?id=${r.id}">${RTS.escapeHtml(r.name)}</a></span>
        <span class="count" style="color:var(--warning);font-size:12.5px;">${RTS.daysRemaining(r.expiryDate)}d left</span>
      </div>`
      )
      .join("");
  }

  function wireExportPrint(list) {
    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        RTS.exportCSV("renewal-report-" + RTS.todayISO() + ".csv", list, [
          { label: "Record ID", value: "code" },
          { label: "Record Name", value: "name" },
          { label: "Category", value: "category" },
          { label: "Organization", value: "organization" },
          { label: "Issue Date", value: "issueDate" },
          { label: "Expiry Date", value: "expiryDate" },
          { label: "Reminder Date", value: "reminderDate" },
          { label: "Recurring Cycle", value: (r) => r.recurringCycle || "Yearly" },
          { label: "Status", value: (r) => RTS.statusLabel(RTS.computeStatus(r)) },
          { label: "Priority", value: "priority" },
          { label: "Cost", value: "cost" },
          { label: "Currency", value: "currency" },
          { label: "Responsible Person", value: "responsiblePerson" },
        ]);
        RTS.toast("CSV export downloaded successfully.", "success");
      });
    }

    const exportIcsBtn = document.getElementById("exportIcsBtn");
    if (exportIcsBtn) {
      exportIcsBtn.addEventListener("click", () => {
        RTS.exportICS("renewal-schedule-" + RTS.todayISO() + ".ics", list);
        RTS.toast("Calendar export (.ics) downloaded.", "success");
      });
    }

    const printBtn = document.getElementById("printBtn");
    if (printBtn) {
      printBtn.addEventListener("click", () => window.print());
    }
  }

  function renderAll() {
    const list = RTS.data.getRenewals();
    renderCostForecast(list, activeHorizonDays);
    renderStatusSummary(list);
    renderCategorySummary(list);
    renderTrendChart(list);
    renderExpired(list);
    renderDueSoon(list);
    wireExportPrint(list);
    wireForecastTabs(list);
    RTS.refreshIcons();
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    renderAll();

    if (RTS.data && RTS.data.syncFromBackend) {
      RTS.data.syncFromBackend().then(() => {
        renderAll();
      });
    }

    window.addEventListener("rts-renewal-updated", () => {
      renderAll();
    });

    window.addEventListener("rts-language-changed", () => {
      renderAll();
    });
  });
})();
