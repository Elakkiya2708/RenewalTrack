/* ==========================================================================
   details.js — Renewal Details page
   ========================================================================== */

(function () {
  "use strict";

  function getId() {
    return new URLSearchParams(window.location.search).get("id");
  }

  function render() {
    const id = getId();
    const record = id ? RTS.data.getRenewalById(id) : null;

    if (!record) {
      document.getElementById("detailContent").innerHTML = `
        <div class="empty-state" style="margin-top:60px;">
          <i data-lucide="search-x" class="icon"></i>
          <h4>Renewal record not found</h4>
          <p>It may have been deleted. <a class="link" href="records.html">Return to Renewal Records</a></p>
        </div>`;
      RTS.refreshIcons();
      return null;
    }

    const status = RTS.computeStatus(record);
    const days = RTS.daysRemaining(record.expiryDate);
    const cycleTxt = RTS.cycleLabel(record.recurringCycle || "Yearly");

    document.getElementById("dName").textContent = record.name;
    document.title = record.name + " — Renewal Tracking System";
    document.getElementById("dStatusBadge").innerHTML = RTS.statusBadgeHtml(status);
    document.getElementById("dSubtitle").textContent = `${record.category} · ${record.organization || "—"} · ${record.code}`;

    document.getElementById("daysValue").textContent = days < 0 ? Math.abs(days) : days;
    document.getElementById("daysLabel").textContent =
      days < 0 ? "days overdue" : days === 0 ? "expires today" : "days remaining";
    document.getElementById("daysValue").style.color =
      status === "expired" ? "var(--danger)" : status === "due-soon" ? "var(--warning)" : "var(--success)";

    document.getElementById("glancePriority").innerHTML = RTS.priorityBadgeHtml(record.priority);
    document.getElementById("glanceCategory").textContent = record.category;
    const glanceCycleEl = document.getElementById("glanceCycle");
    if (glanceCycleEl) glanceCycleEl.textContent = cycleTxt;
    document.getElementById("glanceCode").textContent = record.code;

    document.getElementById("infoGrid").innerHTML = `
      <div class="info-item"><span>Organization / Provider</span><strong>${RTS.escapeHtml(record.organization || "—")}</strong></div>
      <div class="info-item"><span>Reference Number</span><strong>${RTS.escapeHtml(record.referenceNumber || "—")}</strong></div>
      <div class="info-item"><span>Issue Date</span><strong>${RTS.formatDate(record.issueDate)}</strong></div>
      <div class="info-item"><span>Expiry Date</span><strong>${RTS.formatDate(record.expiryDate)}</strong></div>
      <div class="info-item"><span>Reminder Date</span><strong>${RTS.formatDate(record.reminderDate)}</strong></div>
      <div class="info-item"><span>Renewal Cost</span><strong>${RTS.formatCurrency(record.cost, record.currency)}</strong></div>
      <div class="info-item"><span>Renewal Cycle</span><strong><i data-lucide="repeat" style="width:13px;height:13px;display:inline-block;vertical-align:-1px;margin-right:3px;"></i>${RTS.escapeHtml(cycleTxt)}</strong></div>
      <div class="info-item"><span>Responsible Person</span><strong>${RTS.escapeHtml(record.responsiblePerson || "—")}${record.responsibleEmail ? ` <span style="font-size:12px;color:var(--text-mid);font-weight:400;">(${RTS.escapeHtml(record.responsibleEmail)})</span>` : ""}</strong></div>
      <div class="info-item" style="grid-column:1/-1;"><span>Description</span><strong style="font-weight:400;">${RTS.escapeHtml(record.description) || "—"}</strong></div>
      <div class="info-item" style="grid-column:1/-1;"><span>Notes</span><strong style="font-weight:400;">${RTS.escapeHtml(record.notes) || "—"}</strong></div>
    `;

    const docs = record.documents || [];
    document.getElementById("docList").innerHTML = docs.length
      ? docs
          .map(
            (d) => `
        <div class="upload-file-item">
          <i data-lucide="file-text" class="icon"></i>
          <div class="file-meta"><strong>${RTS.escapeHtml(d.name)}</strong><span>${d.type} · ${d.size} · Uploaded ${RTS.formatDate(d.uploadDate)}</span></div>
          <button type="button" onclick="RTS.toast('Downloading ${RTS.escapeHtml(d.name).replace(/'/g, "")}…','info')" aria-label="Download"><i data-lucide="download" class="icon"></i></button>
        </div>`
          )
          .join("")
      : '<p class="text-mid" style="font-size:13px;">No documents attached to this record yet.</p>';

    const events = [];
    let hist = record.history;
    if (typeof hist === "string") {
      try {
        hist = JSON.parse(hist);
      } catch (e) {
        hist = [];
      }
    }
    if (!Array.isArray(hist)) hist = [];
    hist
      .slice()
      .sort((a, b) => new Date(b.renewalDate || 0) - new Date(a.renewalDate || 0))
      .forEach((h) => {
        if (!h) return;
        events.push({
          date: h.renewalDate,
          title: "Renewed — new expiry " + RTS.formatDate(h.newExpiry),
          detail: `${RTS.formatCurrency(h.cost, h.currency)} · by ${h.renewedBy || "—"}${h.notes ? " · " + h.notes : ""}`,
        });
      });
    events.push({
      date: (record.createdAt || "").slice(0, 10),
      title: "Record added to tracking",
      detail: `Issued ${RTS.formatDate(record.issueDate)}, initial expiry ${RTS.formatDate(hist && hist.length ? hist[hist.length - 1].previousExpiry : record.expiryDate)}`,
    });
    document.getElementById("timelineList").innerHTML = events
      .map(
        (e) => `
      <div class="timeline-item">
        <strong>${RTS.escapeHtml(e.title)}</strong>
        <span>${RTS.formatDate(e.date)} — ${RTS.escapeHtml(e.detail)}</span>
      </div>`
      )
      .join("");

    RTS.refreshIcons();
    return record;
  }

  function wireActions() {
    const id = getId();
    const record = RTS.data.getRenewalById(id);
    const canEdit = RTS.auth.canEditRenewal(record);
    const canDelete = RTS.auth.isAdmin() || (RTS.auth.isEmployee() && canEdit);

    const editBtn = document.getElementById("editBtn");
    if (editBtn) {
      if (!canEdit) {
        editBtn.style.display = "none";
      } else {
        editBtn.addEventListener("click", () => {
          window.location.href = "records.html?edit=" + encodeURIComponent(id);
        });
      }
    }

    const exportIcsBtn = document.getElementById("exportIcsBtn");
    if (exportIcsBtn) {
      exportIcsBtn.addEventListener("click", () => {
        RTS.exportICS(`${record.name.replace(/[^a-z0-9_-]/gi, "_")}.ics`, [record]);
        RTS.toast("Exported renewal to Calendar (.ics)", "success");
      });
    }

    const deleteBtn = document.getElementById("deleteBtn");
    if (deleteBtn) {
      if (!canDelete) {
        deleteBtn.style.display = "none";
      } else {
        deleteBtn.addEventListener("click", () => {
          RTS.modal.open("deleteModal");
        });
      }
    }
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener("click", () => {
        RTS.data.deleteRenewal(id);
        RTS.toast("Renewal record deleted.", "success");
        setTimeout(() => (window.location.href = "records.html"), 500);
      });
    }

    const currencySelect = document.getElementById("renew_currency");
    if (currencySelect) {
      currencySelect.innerHTML = "";
      RTS.CURRENCIES.forEach((c) => currencySelect.insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));
    }

    const cycleSelect = document.getElementById("renew_recurringCycle");
    if (cycleSelect) {
      cycleSelect.innerHTML = "";
      RTS.RECURRING_CYCLES.forEach((c) => {
        cycleSelect.insertAdjacentHTML("beforeend", `<option value="${c}">${RTS.cycleLabel(c)}</option>`);
      });
    }

    const renewBtn = document.getElementById("renewBtn");
    if (renewBtn) {
      if (!canEdit) {
        renewBtn.style.display = "none";
      } else {
        renewBtn.addEventListener("click", () => {
          const curRecord = RTS.data.getRenewalById(id);
          if (!curRecord) return;
          document.getElementById("renewForm").reset();

          const cycle = curRecord.recurringCycle || "Yearly";
          if (cycleSelect) cycleSelect.value = cycle;

          const autoNewExpiry = RTS.calculateNextExpiry(curRecord.expiryDate, cycle);
          document.getElementById("renew_newExpiry").value = autoNewExpiry;
          document.getElementById("renew_currency").value = curRecord.currency || "USD";
          document.getElementById("renew_cost").value = curRecord.cost != null ? curRecord.cost : "";
          document.getElementById("renew_renewedBy").value = (RTS.auth && RTS.auth.getCurrentUser() && RTS.auth.getCurrentUser().fullName) || "System User";

          const notice = document.getElementById("renewCycleNotice");
          if (notice) notice.textContent = `Auto-calculated (${RTS.cycleLabel(cycle)})`;

          document.querySelectorAll("#renewForm .field").forEach((f) => f.classList.remove("has-error"));
          RTS.modal.open("renewModal");
        });
      }
    }

    // Wire quick recurrence presets
    const presetGroup = document.getElementById("cyclePresetGroup");
    if (presetGroup) {
      presetGroup.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const curRecord = RTS.data.getRenewalById(id);
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
          document.getElementById("renew_newExpiry").value = nextExpiry;
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
        const curRecord = RTS.data.getRenewalById(id);
        const newExpiry = document.getElementById("renew_newExpiry").value;
        const renewedBy = document.getElementById("renew_renewedBy").value.trim();
        const nextCycle = cycleSelect ? cycleSelect.value : curRecord.recurringCycle || "Yearly";
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
          cost: document.getElementById("renew_cost").value ? Number(document.getElementById("renew_cost").value) : curRecord.cost,
          currency: document.getElementById("renew_currency").value,
          recurringCycle: nextCycle,
          renewedBy,
          notes: document.getElementById("renew_notes").value.trim(),
        });
        RTS.toast("Record successfully marked as renewed! History updated.", "success");
        RTS.modal.close("renewModal");
        render();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    const record = render();
    if (record) wireActions();
    RTS.refreshIcons();

    window.addEventListener("rts-language-changed", () => {
      render();
    });
  });
})();
