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
          const isViewer = RTS.auth.isViewer();
          const canManage = !isViewer && RTS.auth.canEditRenewal(r);
          let actionContent = "";
          if (isViewer) {
            actionContent = `<span class="cell-sub" style="font-size:12px;color:var(--text-muted);"><i data-lucide="lock" style="width:12px;height:12px;vertical-align:-1px;"></i> Read-only</span>`;
          } else if (!canManage) {
            actionContent = `<span class="cell-sub" style="font-size:12px;color:var(--text-muted);"><i data-lucide="shield" style="width:12px;height:12px;vertical-align:-1px;"></i> View only</span>`;
          } else {
            actionContent = `
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" onclick="RemindersPage.openSnooze('${r.id}')" title="Postpone reminder">
                  <i data-lucide="clock" class="icon" style="width:13px;height:13px;"></i> Snooze
                </button>
                <button class="btn btn-secondary btn-sm" onclick="RemindersPage.openRenew('${r.id}')" title="Mark as renewed with new expiry">
                  <i data-lucide="refresh-cw" class="icon" style="width:13px;height:13px;"></i> Renew
                </button>
                ${
                  status === "Completed"
                    ? `<button class="btn btn-ghost btn-sm" onclick="RemindersPage.toggle('${r.id}', false)">Mark Incomplete</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="RemindersPage.toggle('${r.id}', true)"><i data-lucide="check" class="icon" style="width:13px;height:13px;"></i> Done</button>`
                }
              </div>`;
          }
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
            <td>${actionContent}</td>
          </tr>`;
        })
        .join("");
    }
    RTS.refreshIcons();
  }

  function toggle(id, completed) {
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access.", "error");
      return;
    }
    const record = RTS.data.getRenewalById(id);
    if (!record) return;
    if (RTS.auth.isEmployee() && !RTS.auth.canEditRenewal(record)) {
      RTS.toast("Access denied. You can only manage reminders for assigned renewals.", "error");
      return;
    }

    if (!completed) {
      RTS.data.toggleReminderCompleted(id, false);
      RTS.toast("Reminder reopened.", "info");
      render();
      return;
    }

    const cycle = record.recurringCycle || "Yearly";
    const nextExpiry = RTS.calculateNextExpiry(record.expiryDate, cycle);

    RTS.data.markAsRenewed(id, {
      newExpiryDate: nextExpiry,
      recurringCycle: cycle,
      notes: "Completed via Reminders (" + cycle + ")",
    });
    RTS.toast(`Renewal completed! Expiry set to ${RTS.formatDate(nextExpiry)} & history updated.`, "success");
    render();
  }

  function openSnooze(id) {
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access.", "error");
      return;
    }
    const record = RTS.data.getRenewalById(id);
    if (!record) return;
    if (RTS.auth.isEmployee() && !RTS.auth.canEditRenewal(record)) {
      RTS.toast("Access denied. You can only snooze reminders for assigned renewals.", "error");
      return;
    }
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

  function openRenew(id) {
    if (RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access.", "error");
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
        render();
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
    wireRenewModal();
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    wire();
    render();
    if (RTS.data && RTS.data.syncFromBackend) {
      RTS.data.syncFromBackend().then(() => {
        render();
      });
    }
    RTS.refreshIcons();

    window.addEventListener("rts-language-changed", () => {
      render();
    });

    window.addEventListener("rts-renewal-updated", () => {
      render();
    });
  });

  window.RemindersPage = {
    toggle,
    openSnooze,
    openRenew,
    confirmSnooze,
    confirmCustomSnooze,
    render,
    fetchAndRenderEmailLogs,
  };
})();
