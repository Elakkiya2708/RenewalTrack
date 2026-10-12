/* ==========================================================================
   dashboard.js
   ========================================================================== */

(function () {
  "use strict";

  const CATEGORY_ICONS = {
    Contract: "file-signature",
    License: "key-round",
    Certification: "badge-check",
    Warranty: "shield-check",
    Insurance: "umbrella",
    Subscription: "repeat",
    "Regulatory Permit": "landmark",
    Other: "file",
  };

  function renderStats() {
    const list = RTS.data.getRenewals();
    const statuses = list.map(RTS.computeStatus);
    const now = new Date();

    document.getElementById("statTotal").textContent = list.length;
    document.getElementById("statActive").textContent = statuses.filter((s) => s === "active").length;
    document.getElementById("statDueSoon").textContent = statuses.filter((s) => s === "due-soon").length;
    document.getElementById("statExpired").textContent = statuses.filter((s) => s === "expired").length;
    document.getElementById("statRenewedMonth").textContent = list.filter((r) => {
      if (!r.lastRenewedAt) return false;
      const d = new Date(r.lastRenewedAt + "T00:00:00");
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    document.getElementById("statDocs").textContent = list.reduce(
      (sum, r) => sum + (r.documents || []).length,
      0
    );

    return { list, statuses };
  }

  function renderUpcoming(list) {
    const el = document.getElementById("upcomingList");
    const upcoming = list
      .filter((r) => ["active", "due-soon", "renewed"].includes(RTS.computeStatus(r)))
      .sort((a, b) => (a.expiryDate > b.expiryDate ? 1 : -1))
      .slice(0, 6);

    if (!upcoming.length) {
      el.innerHTML =
        '<div class="empty-state"><i data-lucide="calendar-check" class="icon"></i><h4>No upcoming renewals</h4><p>All caught up — nothing due soon.</p></div>';
      return;
    }

    el.innerHTML = upcoming
      .map((r) => {
        const days = RTS.daysRemaining(r.expiryDate);
        const color = days <= 7 ? "var(--danger)" : days <= 30 ? "var(--warning)" : "var(--success)";
        return `
        <a class="upcoming-item" href="details.html?id=${r.id}" style="text-decoration:none;color:inherit;">
          <div class="upcoming-icon"><i data-lucide="${CATEGORY_ICONS[r.category] || "file"}" class="icon"></i></div>
          <div class="upcoming-body">
            <strong>${RTS.escapeHtml(r.name)}</strong>
            <span>${RTS.escapeHtml(r.category)} · ${RTS.escapeHtml(r.organization)}</span>
          </div>
          <div class="upcoming-days" style="color:${color};">${days} day${days === 1 ? "" : "s"}</div>
        </a>`;
      })
      .join("");
  }

  function renderStatusChart(statuses) {
    const counts = {
      active: statuses.filter((s) => s === "active").length,
      "due-soon": statuses.filter((s) => s === "due-soon").length,
      expired: statuses.filter((s) => s === "expired").length,
      renewed: statuses.filter((s) => s === "renewed").length,
    };
    const css = getComputedStyle(document.body);
    const cv = (name) => css.getPropertyValue(name).trim();
    const colors = { active: cv("--success"), "due-soon": cv("--warning"), expired: cv("--danger"), renewed: cv("--blue") };
    const actualTotal = statuses.length;
    const divisor = actualTotal || 1;

    let acc = 0;
    const segments = Object.keys(counts).map((key) => {
      const pct = (counts[key] / divisor) * 100;
      const seg = `${colors[key]} ${acc}% ${acc + pct}%`;
      acc += pct;
      return seg;
    });

    const donut = document.getElementById("statusDonut");
    donut.style.background =
      actualTotal === 0
        ? "var(--border-subtle)"
        : `conic-gradient(${segments.join(",")})`;
    donut.style.position = "relative";
    donut.innerHTML = `<div style="position:absolute;inset:14px;border-radius:50%;background:var(--bg-surface);display:flex;align-items:center;justify-content:center;flex-direction:column;">
        <span style="font-family:var(--font-display);font-size:20px;font-weight:700;">${actualTotal}</span>
        <span style="font-size:10.5px;color:var(--text-mid);">records</span>
      </div>`;

    const legend = document.getElementById("statusLegend");
    legend.innerHTML = Object.keys(counts)
      .map(
        (key) => `
      <div class="chart-legend-item">
        <span class="chart-legend-swatch" style="background:${colors[key]}"></span>
        ${RTS.statusLabel(key)} <strong style="color:var(--text-hi);margin-left:auto;">${counts[key]}</strong>
      </div>`
      )
      .join("");
  }

  function renderCategoryChart(list) {
    const counts = {};
    RTS.CATEGORIES.forEach((c) => (counts[c] = 0));
    list.forEach((r) => (counts[r.category] = (counts[r.category] || 0) + 1));
    const max = Math.max(...Object.values(counts), 1);

    const el = document.getElementById("categoryChart");
    el.innerHTML = RTS.CATEGORIES.map((cat) => {
      const height = Math.round((counts[cat] / max) * 100);
      return `
        <div class="bar-chart-col" title="${cat}: ${counts[cat]}">
          <span style="font-size:11px;color:var(--text-mid);">${counts[cat]}</span>
          <div class="bar-chart-bar" style="height:${Math.max(height, 3)}%;"></div>
          <div class="bar-chart-label">${cat.split(" ")[0]}</div>
        </div>`;
    }).join("");
  }

  function renderActivity(list) {
    const events = [];
    list.forEach((r) => {
      (r.history || []).forEach((h) => {
        events.push({
          date: h.renewalDate,
          text: `${r.name} was renewed`,
          detail: `New expiry: ${RTS.formatDate(h.newExpiry)}`,
          icon: "refresh-cw",
          color: "var(--blue)",
        });
      });
      events.push({
        date: (r.createdAt || "").slice(0, 10),
        text: `${r.name} added to tracking`,
        detail: r.category,
        icon: "plus-circle",
        color: "var(--accent)",
      });
    });
    events.sort((a, b) => (a.date < b.date ? 1 : -1));

    const el = document.getElementById("activityList");
    if (!events.length) {
      el.innerHTML = '<div class="empty-state"><p>No recent activity yet.</p></div>';
      return;
    }
    el.innerHTML = events
      .slice(0, 6)
      .map(
        (e) => `
      <div class="activity-item">
        <div class="upcoming-icon" style="color:${e.color};"><i data-lucide="${e.icon}" class="icon"></i></div>
        <div class="upcoming-body">
          <strong>${RTS.escapeHtml(e.text)}</strong>
          <span>${RTS.escapeHtml(e.detail)} · ${RTS.formatDate(e.date)}</span>
        </div>
      </div>`
      )
      .join("");
  }

  function renderMiniCalendar(list) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    document.getElementById("miniCalTitle").textContent =
      "Renewal Calendar — " + now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const eventsByDate = {};
    list.forEach((r) => {
      const status = RTS.computeStatus(r);
      if (!eventsByDate[r.expiryDate]) eventsByDate[r.expiryDate] = [];
      eventsByDate[r.expiryDate].push(status);
    });

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = RTS.todayISO();

    const dows = ["S", "M", "T", "W", "T", "F", "S"];
    let html = dows.map((d) => `<div class="calendar-dow">${d}</div>`).join("");

    for (let i = 0; i < startOffset; i++) {
      html += `<div class="calendar-cell other-month"></div>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr =
        year + "-" + String(month + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      const isToday = dateStr === todayStr;
      const statuses = eventsByDate[dateStr] || [];
      const dotsHtml = statuses
        .slice(0, 3)
        .map((s) => `<span class="calendar-event status-${s}">${RTS.statusLabel(s)}</span>`)
        .join("");
      html += `<div class="calendar-cell${isToday ? " today" : ""}" ${
        statuses.length ? 'onclick="window.location.href=\'calendar.html\'" style="cursor:pointer;"' : ""
      }>
          <div class="date-num">${day}</div>
          <div class="calendar-events">${dotsHtml}</div>
        </div>`;
    }
    document.getElementById("miniCalendar").innerHTML = html;
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    const { list, statuses } = renderStats();
    renderUpcoming(list);
    renderStatusChart(statuses);
    renderCategoryChart(list);
    renderActivity(list);
    renderMiniCalendar(list);
    RTS.refreshIcons();
  });
})();
