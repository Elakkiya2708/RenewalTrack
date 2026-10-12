/* ==========================================================================
   reminders.js — Reminders & Snooze page
   ========================================================================== */

(function () {
  "use strict";

  let state = { search: "", status: "" };
  let snoozeTargetId = null;

  function reminderStatus(record) {
    if (record.reminderCompleted) return "Completed";
    if (!record.reminderDate) return "Upcoming";
    return record.reminderDate < RTS.todayISO() ? "Overdue" : "Upcoming";
  }

  function reminderBadge(status) {
    const map = { Overdue: "badge-expired", Upcoming: "badge-due-soon", Completed: "badge-active" };
    return `<span class="badge ${map[status]}">${status}</span>`;
  }

  function render() {
    const all = RTS.data.getRenewals();
    const statUp = document.getElementById("statUpcoming");
    const statOv = document.getElementById("statOverdue");
    const statCo = document.getElementById("statCompleted");

    if (statUp) statUp.textContent = all.filter((r) => reminderStatus(r) === "Upcoming").length;
    if (statOv) statOv.textContent = all.filter((r) => reminderStatus(r) === "Overdue").length;
    if (statCo) statCo.textContent = all.filter((r) => reminderStatus(r) === "Completed").length;

    let list = all.slice();
    const q = state.search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || (r.organization || "").toLowerCase().includes(q));
    if (state.status) list = list.filter((r) => reminderStatus(r) === state.status);

    list.sort((a, b) => (a.reminderDate < b.reminderDate ? -1 : 1));

    const tbody = document.getElementById("remindersTableBody");
    const empty = document.getElementById("remindersEmptyState");
    if (!tbody) return;

    if (!list.length) {
      tbody.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
    } else {
      if (empty) empty.classList.add("hidden");
      tbody.innerHTML = list
        .map((r) => {
          const status = reminderStatus(r);
          return `
          <tr>
            <td>
              <a class="link" href="details.html?id=${r.id}" style="font-weight:600;">${RTS.escapeHtml(r.name)}</a>
              <span class="cell-sub">${r.code} · ${RTS.escapeHtml(r.organization || "—")}</span>
            </td>
            <td>${RTS.escapeHtml(r.category)}</td>
            <td>${RTS.formatDate(r.reminderDate)}</td>
            <td>${RTS.formatDate(r.expiryDate)}</td>
            <td>${reminderBadge(status)}</td>
            <td>
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" onclick="RemindersPage.openSnooze('${r.id}')" title="Postpone reminder">
                  <i data-lucide="clock" class="icon" style="width:13px;height:13px;"></i> Snooze
                </button>
                ${
                  status === "Completed"
                    ? `<button class="btn btn-ghost btn-sm" onclick="RemindersPage.toggle('${r.id}', false)">Mark Incomplete</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="RemindersPage.toggle('${r.id}', true)"><i data-lucide="check" class="icon" style="width:13px;height:13px;"></i> Done</button>`
                }
              </div>
            </td>
          </tr>`;
        })
        .join("");
    }
    RTS.refreshIcons();
  }

  function toggle(id, completed) {
    RTS.data.toggleReminderCompleted(id, completed);
    RTS.toast(completed ? "Reminder marked as completed." : "Reminder reopened.", "success");
    render();
  }

  function openSnooze(id) {
    const record = RTS.data.getRenewalById(id);
    if (!record) return;
    snoozeTargetId = id;
    const nameEl = document.getElementById("snoozeRecordName");
    if (nameEl) nameEl.textContent = record.name;
    const dateInput = document.getElementById("customSnoozeDate");
    if (dateInput) dateInput.value = RTS.addDays(RTS.todayISO(), 7);
    RTS.modal.open("snoozeModal");
  }

  function confirmSnooze(days) {
    if (!snoozeTargetId) return;
    RTS.data.snoozeReminder(snoozeTargetId, days);
    RTS.toast(`Reminder snoozed for ${days} day(s).`, "success");
    RTS.modal.close("snoozeModal");
    snoozeTargetId = null;
    render();
  }

  function confirmCustomSnooze() {
    if (!snoozeTargetId) return;
    const dateInput = document.getElementById("customSnoozeDate");
    if (!dateInput || !dateInput.value) {
      RTS.toast("Please pick a valid date.", "warning");
      return;
    }
    const targetDate = dateInput.value;
    const diff = RTS.daysBetween(RTS.todayISO(), targetDate);
    if (diff < 0) {
      RTS.toast("Please select a date in the future.", "warning");
      return;
    }
    RTS.data.updateRenewal(snoozeTargetId, { reminderDate: targetDate, reminderCompleted: false });
    RTS.toast(`Reminder scheduled for ${RTS.formatDate(targetDate)}.`, "success");
    RTS.modal.close("snoozeModal");
    snoozeTargetId = null;
    render();
  }

  async function fetchAndRenderEmailLogs() {
    const tbody = document.getElementById("emailLogsTableBody");
    const sub = document.getElementById("emailLogsSubtitle");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;">Loading recent reminder dispatches...</td></tr>';

    try {
      const res = await fetch(RTS.apiUrl("/api/reminders/logs?limit=50"));
      if (!res.ok) throw new Error("Server returned HTTP " + res.status);
      const { data, storageMode } = await res.json();

      if (sub) {
        sub.textContent = `Recorded in ${storageMode === "supabase_postgresql" ? "Supabase PostgreSQL" : "Local Storage Store"} (${data.length} dispatches logged).`;
      }

      if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-mid);">No email reminder dispatches recorded yet. Click "Run Reminder Check" to dispatch pending alerts.</td></tr>';
        return;
      }

      tbody.innerHTML = data
        .map((log) => {
          const sentDate = log.sent_at ? new Date(log.sent_at).toLocaleString() : "—";
          const intervalMap = {
            "0_days": '<span class="badge badge-expired">On Expiry (Today)</span>',
            "7_days": '<span class="badge badge-due-soon">7 Days Left</span>',
            "15_days": '<span class="badge badge-renewed">15 Days Left</span>',
            "30_days": '<span class="badge badge-active">30 Days Left</span>',
          };
          const intervalBadge = intervalMap[log.reminder_interval] || `<span class="badge">${log.reminder_interval}</span>`;

          const statusBadge =
            log.status === "sent"
              ? '<span class="badge badge-active">Sent</span>'
              : log.status === "simulated"
              ? '<span class="badge badge-due-soon">Simulated (Safe)</span>'
              : '<span class="badge badge-expired">Failed</span>';

          return `
            <tr>
              <td style="font-size:12px;white-space:nowrap;">${sentDate}</td>
              <td><strong>${RTS.escapeHtml(log.renewal_name)}</strong></td>
              <td>${intervalBadge}</td>
              <td><span style="font-size:12px;">${RTS.escapeHtml(log.recipient_email)}</span></td>
              <td>${statusBadge}</td>
              <td><span style="font-size:11px;color:var(--text-low);">${RTS.escapeHtml(log.delivery_provider || "nodemailer")}</span></td>
            </tr>`;
        })
        .join("");
    } catch (err) {
      const hint = window.location.protocol === "file:" ? "<br><small>Start server with <code>npm start</code> (or <code>start.bat</code>) and visit <strong>http://localhost:3000</strong></small>" : "";
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--danger);">Could not connect to reminder service: ${err.message}.${hint}</td></tr>`;
    }
    RTS.refreshIcons();
  }

  function wireEmailFeatures() {
    const viewLogsBtn = document.getElementById("btnViewEmailLogs");
    if (viewLogsBtn) {
      viewLogsBtn.addEventListener("click", () => {
        RTS.modal.open("emailLogsModal");
        fetchAndRenderEmailLogs();
      });
    }

    const refreshLogsBtn = document.getElementById("btnRefreshEmailLogs");
    if (refreshLogsBtn) {
      refreshLogsBtn.addEventListener("click", () => {
        fetchAndRenderEmailLogs();
      });
    }

    const triggerBtn = document.getElementById("btnRunCheckFromReminders");
    if (triggerBtn) {
      triggerBtn.addEventListener("click", async () => {
        triggerBtn.disabled = true;
        triggerBtn.innerHTML = '<i data-lucide="loader" class="icon spin"></i> Checking...';
        RTS.refreshIcons();

        try {
          const res = await fetch(RTS.apiUrl("/api/reminders/trigger"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const data = await res.json();
          if (data.ok && data.summary) {
            RTS.toast(
              `Reminder Check Done: ${data.summary.remindersSent} sent/simulated, ${data.summary.duplicatesSkipped} duplicates avoided.`,
              "success"
            );
            render(); // refresh reminders table
            fetchAndRenderEmailLogs(); // refresh logs if modal is open
          } else {
            RTS.toast(data.error || "Failed to run reminder check.", "error");
          }
        } catch (e) {
          const isFile = window.location.protocol === "file:";
          const msg = isFile
            ? "Cannot reach server. Run 'npm start' (or double-click start.bat) and visit http://localhost:3000"
            : "Cannot reach backend reminder service at " + RTS.apiUrl("/api/reminders/trigger");
          RTS.toast(msg, "error");
        } finally {
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = '<i data-lucide="send" class="icon"></i> Run Reminder Check';
          RTS.refreshIcons();
        }
      });
    }
  }

  function wire() {
    const searchInput = document.getElementById("reminderSearch");
    if (searchInput) {
      searchInput.addEventListener(
        "input",
        RTS.debounce((e) => {
          state.search = e.target.value;
          render();
        }, 200)
      );
    }

    const filterStatus = document.getElementById("filterReminderStatus");
    if (filterStatus) {
      filterStatus.addEventListener("change", (e) => {
        state.status = e.target.value;
        render();
      });
    }

    wireEmailFeatures();
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    wire();
    render();
    RTS.refreshIcons();

    window.addEventListener("rts-language-changed", () => {
      render();
    });
  });

  window.RemindersPage = {
    toggle,
    openSnooze,
    confirmSnooze,
    confirmCustomSnooze,
    render,
    fetchAndRenderEmailLogs,
  };
})();
