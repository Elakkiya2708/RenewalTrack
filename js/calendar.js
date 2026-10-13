/* ==========================================================================
   calendar.js — Calendar page
   ========================================================================== */

(function () {
  "use strict";

  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();

  function renderCalendar() {
    const list = RTS.data.getRenewals();
    const eventsByDate = {};
    list.forEach((r) => {
      const status = RTS.computeStatus(r);
      if (!eventsByDate[r.expiryDate]) eventsByDate[r.expiryDate] = [];
      eventsByDate[r.expiryDate].push({ id: r.id, name: r.name, status });
    });

    document.getElementById("calMonthTitle").textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" }
    );

    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayStr = RTS.todayISO();
    const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    let html = dows.map((d) => `<div class="calendar-dow">${d}</div>`).join("");

    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startOffset; i > 0; i--) {
      html += `<div class="calendar-cell other-month"><div class="date-num">${prevMonthDays - i + 1}</div></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = viewYear + "-" + String(viewMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
      const isToday = dateStr === todayStr;
      const events = eventsByDate[dateStr] || [];
      const eventsHtml = events
        .map(
          (e) =>
            `<span class="calendar-event status-${e.status}" title="${RTS.escapeHtml(e.name)}" onclick="window.location.href='details.html?id=${e.id}'">${RTS.escapeHtml(e.name)}</span>`
        )
        .join("");
      html += `<div class="calendar-cell${isToday ? " today" : ""}">
          <div class="date-num">${day}</div>
          <div class="calendar-events">${eventsHtml}</div>
        </div>`;
    }

    const totalCells = startOffset + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= trailing; i++) {
      html += `<div class="calendar-cell other-month"><div class="date-num">${i}</div></div>`;
    }

    document.getElementById("calendarGrid").innerHTML = html;
  }

  function renderUpcoming() {
    const list = RTS.data
      .getRenewals()
      .filter((r) => RTS.computeStatus(r) !== "expired")
      .sort((a, b) => (a.expiryDate > b.expiryDate ? 1 : -1))
      .slice(0, 10);

    const el = document.getElementById("calUpcomingList");
    if (!list.length) {
      el.innerHTML = '<div class="empty-state"><p>No upcoming renewals.</p></div>';
      return;
    }
    el.innerHTML = list
      .map((r) => {
        const status = RTS.computeStatus(r);
        const days = RTS.daysRemaining(r.expiryDate);
        return `
        <a class="upcoming-item" href="details.html?id=${r.id}" style="text-decoration:none;color:inherit;">
          <div class="upcoming-icon"><i data-lucide="calendar" class="icon"></i></div>
          <div class="upcoming-body">
            <strong>${RTS.escapeHtml(r.name)}</strong>
            <span>${RTS.formatDate(r.expiryDate)} · ${RTS.statusLabel(status)}</span>
          </div>
          <div class="upcoming-days">${days}d</div>
        </a>`;
      })
      .join("");
    RTS.refreshIcons();
  }

  function wireNav() {
    document.getElementById("prevMonthBtn").addEventListener("click", () => {
      viewMonth--;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      renderCalendar();
    });
    document.getElementById("nextMonthBtn").addEventListener("click", () => {
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      renderCalendar();
    });
    document.getElementById("todayBtn").addEventListener("click", () => {
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      renderCalendar();
    });

    const exportBtn = document.getElementById("exportCalIcsBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const list = RTS.data.getRenewals();
        RTS.exportICS("renewal-calendar-" + RTS.todayISO() + ".ics", list);
        RTS.toast("Exported renewals to Calendar (.ics)", "success");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    renderCalendar();
    renderUpcoming();
    wireNav();
    RTS.refreshIcons();

    if (RTS.data && RTS.data.syncFromBackend) {
      RTS.data.syncFromBackend().then(() => {
        renderCalendar();
        renderUpcoming();
      });
    }

    window.addEventListener("rts-renewal-updated", () => {
      renderCalendar();
      renderUpcoming();
    });

    window.addEventListener("rts-language-changed", () => {
      renderCalendar();
      renderUpcoming();
    });
  });
})();
