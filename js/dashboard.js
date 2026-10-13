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

  let assignableEmployees = [];
  let assigneesStatus = "idle"; // "idle" | "loading" | "success" | "empty" | "error"
  let assigneesError = null;

  async function loadAssignableEmployees() {
    assigneesStatus = "loading";
    assigneesError = null;
    const sel = document.getElementById("in_assignedTo");
    if (sel && (!assignableEmployees || !assignableEmployees.length)) {
      sel.innerHTML = `<option value="" disabled selected>⏳ Loading active employees from database…</option>`;
    }

    try {
      let result = null;
      if (typeof RTS !== "undefined" && typeof RTS.getAssignableEmployees === "function") {
        result = await RTS.getAssignableEmployees();
      } else if (typeof RTS !== "undefined" && RTS.team && typeof RTS.team.getAssignableEmployees === "function") {
        result = await RTS.team.getAssignableEmployees();
      } else if (typeof RTS !== "undefined" && RTS.data && typeof RTS.data.getAssignableEmployees === "function") {
        result = await RTS.data.getAssignableEmployees();
      } else {
        const url = (typeof RTS !== "undefined" && RTS.apiUrl ? RTS.apiUrl("/api/renewals/assignees") : "/api/renewals/assignees");
        const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem("rts_auth_token");
        const user = (RTS.auth && typeof RTS.auth.getCurrentUser === "function" ? RTS.auth.getCurrentUser() : null) || {};
        const headers = {
          Accept: "application/json",
          "x-user-role": user.role || "Admin",
          "x-user-email": user.email || "",
        };
        if (token) headers["Authorization"] = "Bearer " + token;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const json = await res.json();
          if (json && (json.ok || json.success) && Array.isArray(json.data)) {
            result = { ok: true, status: json.data.length ? "success" : "empty", data: json.data };
          }
        }
      }

      if (result && (result.status === "error" || result.ok === false)) {
        assignableEmployees = [];
        assigneesStatus = "error";
        assigneesError = result.error || "Failed to load employees from database";
      } else if (result) {
        const list = Array.isArray(result) ? result : (Array.isArray(result.data) ? result.data : []);
        assignableEmployees = list;
        assigneesStatus = list.length ? "success" : "empty";
      } else {
        assignableEmployees = [];
        assigneesStatus = "error";
        assigneesError = "Failed to load employees from database";
      }
    } catch (err) {
      console.error("[Dashboard] Error loading assignable employees:", err);
      assignableEmployees = [];
      assigneesStatus = "error";
      assigneesError = err.message || "Failed to load employees";
    }

    return assignableEmployees;
  }

  function populateAssigneeSelect(currentVal) {
    const sel = document.getElementById("in_assignedTo");
    if (!sel) return;

    if (assigneesStatus === "loading") {
      sel.innerHTML = `<option value="" disabled selected>⏳ Loading active employees from database…</option>`;
      return;
    }

    if (assigneesStatus === "error") {
      sel.innerHTML = `
        <option value="">— Unassigned —</option>
        <option value="" disabled selected>⚠️ Failed to load employees (Server/Network Error) — Click to retry</option>
      `;
      return;
    }

    if (assigneesStatus === "empty" || !assignableEmployees.length) {
      sel.innerHTML = `<option value="">— Unassigned — (No active employees found in database)</option>`;
      return;
    }

    sel.innerHTML = `<option value="">— Unassigned —</option>`;
    assignableEmployees.forEach((emp) => {
      const name = emp.fullName || emp.name || "Employee";
      const email = emp.email || "";
      const role = emp.role ? ` (${emp.role})` : "";
      const isSelected = currentVal && String(emp.id) === String(currentVal);
      sel.insertAdjacentHTML(
        "beforeend",
        `<option value="${emp.id}" ${isSelected ? "selected" : ""} data-name="${RTS.escapeHtml(name)}" data-email="${RTS.escapeHtml(email)}">${RTS.escapeHtml(name)}${role} — ${RTS.escapeHtml(email)}</option>`
      );
    });

    if (currentVal) {
      sel.value = currentVal;
    } else {
      sel.value = "";
    }
  }

  function populateModalSelects() {
    const catInput = document.getElementById("in_category");
    if (catInput && !catInput.children.length) {
      catInput.innerHTML = `<option value="">Select a category</option>`;
      RTS.CATEGORIES.forEach((c) => {
        catInput.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      });
    }

    const currencyInput = document.getElementById("in_currency");
    if (currencyInput && !currencyInput.children.length) {
      currencyInput.innerHTML = "";
      RTS.CURRENCIES.forEach((c) => {
        currencyInput.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`);
      });
      currencyInput.value = "USD";
    }

    const cycleInput = document.getElementById("in_recurringCycle");
    if (cycleInput && !cycleInput.children.length) {
      cycleInput.innerHTML = "";
      RTS.RECURRING_CYCLES.forEach((c) => {
        cycleInput.insertAdjacentHTML("beforeend", `<option value="${c}">${RTS.cycleLabel(c)}</option>`);
      });
      cycleInput.value = "Yearly";
    }
  }

  function clearFieldErrors() {
    document.querySelectorAll(".field.has-error").forEach((f) => f.classList.remove("has-error"));
  }

  function resetForm() {
    clearFieldErrors();
    const form = document.getElementById("renewalForm");
    if (form) form.reset();
    const today = RTS.todayISO();
    const issueDateInput = document.getElementById("in_issueDate");
    if (issueDateInput) issueDateInput.value = today;
    const prio = document.getElementById("in_priority");
    if (prio) prio.value = "Medium";
    const curr = document.getElementById("in_currency");
    if (curr) curr.value = "USD";
    const cycle = document.getElementById("in_recurringCycle");
    if (cycle) cycle.value = "Yearly";
    const hiddenId = document.getElementById("renewalId");
    if (hiddenId) hiddenId.value = "";
    const hiddenResp = document.getElementById("in_responsible");
    if (hiddenResp) hiddenResp.value = "";
    const emailInput = document.getElementById("in_responsibleEmail");
    if (emailInput) emailInput.value = "";
  }

  async function openQuickAdd() {
    if (RTS.auth.isViewer && RTS.auth.isViewer()) {
      RTS.toast("Viewer role has read-only access and cannot create renewals.", "error");
      return;
    }
    resetForm();
    populateModalSelects();

    const sel = document.getElementById("in_assignedTo");
    const help = document.getElementById("assignedToHelp");
    const respInput = document.getElementById("in_responsible");
    const emailInput = document.getElementById("in_responsibleEmail");

    if (sel) {
      sel.innerHTML = `<option value="" disabled selected>⏳ Loading active employees from database…</option>`;
    }

    await loadAssignableEmployees();

    if (RTS.auth.isEmployee && RTS.auth.isEmployee()) {
      const u = RTS.auth.getCurrentUser();
      const matched = assignableEmployees.find(
        (e) => String(e.id) === String(u.id) || (e.email && e.email.toLowerCase() === (u.email || "").toLowerCase())
      );
      const empId = matched ? matched.id : u.id;
      populateAssigneeSelect(empId);
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
        help.textContent = "Assign to an active employee from database, or leave Unassigned.";
      }
      if (respInput) respInput.value = "";
      if (emailInput) emailInput.value = "";
    }

    const title = document.getElementById("renewalModalTitle");
    if (title) title.textContent = "Quick Add Renewal";
    RTS.modal.open("renewalModal");
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

  function handleQuickAddSubmit(e) {
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
      documents: [],
    };

    RTS.data.addRenewal(data);
    RTS.modal.close("renewalModal");
    RTS.toast("Renewal record created successfully.", "success");

    refreshDashboard();
  }

  function refreshDashboard() {
    const { list, statuses } = renderStats();
    applyRoleDashboard(list);
    renderUpcoming(list);
    renderStatusChart(statuses);
    renderCategoryChart(list);
    renderActivity(list);
    renderMiniCalendar(list);
    RTS.refreshIcons();
  }

  function applyRoleDashboard(list) {
    const user = RTS.auth.getCurrentUser();
    const role = user.role || "Admin";

    const titleEl = document.getElementById("dashboardTitle");
    const subEl = document.getElementById("dashboardSubtitle");
    const actionsEl = document.getElementById("dashboardActions");
    const noticeEl = document.getElementById("dashboardRoleNotice");

    if (role === "Admin") {
      if (titleEl) titleEl.textContent = "Admin Dashboard";
      if (subEl) subEl.textContent = "Full administrative overview of all renewals, team management, compliance, and audit logs.";
      if (actionsEl) {
        actionsEl.innerHTML = `
          <button type="button" class="btn btn-primary" id="quickAddBtn"><i data-lucide="plus" class="icon"></i>Quick Add Renewal</button>
          <a href="team.html" class="btn btn-secondary"><i data-lucide="users" class="icon"></i>Team Members</a>
          <a href="audit.html" class="btn btn-secondary"><i data-lucide="clipboard-list" class="icon"></i>Audit Logs</a>
        `;
      }
    } else if (role === "Employee") {
      if (titleEl) titleEl.textContent = "Employee Dashboard";
      if (subEl) subEl.textContent = "Team renewal overview. Manage and monitor your assigned renewals and compliance deadlines.";
      if (actionsEl) {
        actionsEl.innerHTML = `
          <button type="button" class="btn btn-primary" id="quickAddBtn"><i data-lucide="plus" class="icon"></i>Add Renewal</button>
        `;
      }

      // Check how many renewals are assigned to this employee
      const userEmail = (user.email || "").toLowerCase();
      const userName = (user.fullName || "").toLowerCase();
      const userId = user.id ? String(user.id) : "";
      const assigned = list.filter((r) => {
        const respEmail = (r.responsibleEmail || r.responsible_email || r.assignedToEmail || r.assigned_to_email || "").toLowerCase();
        const respName = (r.responsiblePerson || r.responsible_person || r.assignedToName || r.assigned_to_name || "").toLowerCase();
        const aId = r.assignedToId || r.assigned_to_id ? String(r.assignedToId || r.assigned_to_id) : "";
        const createdBy = (r.createdBy || "").toLowerCase();
        return (userId && aId === userId) || respEmail === userEmail || respName === userName || createdBy === userEmail;
      });

      if (noticeEl) {
        noticeEl.innerHTML = `
          <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-left:4px solid var(--accent);padding:12px 16px;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <i data-lucide="briefcase" class="icon" style="color:var(--accent);width:20px;height:20px;"></i>
              <div>
                <strong>Assigned to You:</strong> <span>You are currently assigned to <strong>${assigned.length}</strong> renewal record(s).</span>
              </div>
            </div>
            <a href="assigned.html" class="btn btn-secondary btn-sm"><i data-lucide="list-filter" class="icon"></i>Manage Assigned Renewals</a>
          </div>
        `;
      }
    } else if (role === "Viewer") {
      if (titleEl) titleEl.textContent = "Viewer Dashboard (Read-Only)";
      if (subEl) subEl.textContent = "Read-only overview of organization renewal records, calendar schedules, and documents.";
      if (actionsEl) {
        actionsEl.innerHTML = ""; // No create or add buttons
      }
      if (noticeEl) {
        noticeEl.innerHTML = `
          <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-left:4px solid var(--warning);padding:12px 16px;border-radius:8px;margin-bottom:16px;display:flex;align-items:center;gap:10px;">
            <i data-lucide="shield-alert" class="icon" style="color:var(--warning);width:20px;height:20px;"></i>
            <div>
              <strong>Viewer Permissions:</strong> You have read-only access to view renewal statuses, calendar events, and documents. Adding, editing, and deleting records are restricted.
            </div>
          </div>
        `;
      }
      if (RTS.auth.applyViewerRestrictions) {
        RTS.auth.applyViewerRestrictions();
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    if (RTS.data && RTS.data.syncFromBackend) {
      RTS.data.syncFromBackend().then(() => {
        refreshDashboard();
      }).catch(() => {});
    }

    const { list, statuses } = renderStats();
    applyRoleDashboard(list);
    renderUpcoming(list);
    renderStatusChart(statuses);
    renderCategoryChart(list);
    renderActivity(list);
    renderMiniCalendar(list);
    RTS.refreshIcons();

    // Modal & Quick Add wiring
    const resetFormBtn = document.getElementById("resetFormBtn");
    if (resetFormBtn) resetFormBtn.addEventListener("click", resetForm);

    const renewalForm = document.getElementById("renewalForm");
    if (renewalForm) renewalForm.addEventListener("submit", handleQuickAddSubmit);

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

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("#quickAddBtn");
      if (btn) {
        e.preventDefault();
        openQuickAdd();
      }
    });

    window.addEventListener("rts-renewal-updated", () => {
      refreshDashboard();
    });
  });
})();
