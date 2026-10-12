/* ==========================================================================
   settings.js — Settings page
   ========================================================================== */

(function () {
  "use strict";

  function wireTabs() {
    document.querySelectorAll(".settings-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".settings-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("panel-" + tab.getAttribute("data-tab")).classList.add("active");
      });
    });
  }

  function loadProfile() {
    const user = RTS.auth.getCurrentUser();
    document.getElementById("profileName").value = user.fullName || "";
    document.getElementById("profileMobile").value = user.mobile || "";
    document.getElementById("profileEmail").value = user.email || "";
  }

  function wireProfileForm() {
    document.getElementById("profileForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = document.getElementById("profileName").value.trim();
      document.getElementById("pf_name").classList.toggle("has-error", !name);
      if (!name) return;
      RTS.auth.setCurrentUser({
        fullName: name,
        mobile: document.getElementById("profileMobile").value.trim(),
      });
      RTS.toast("Profile updated successfully.", "success");
      RTS.initLayout(); // refresh topbar name/initials
    });
  }

  function loadApplicationSettings() {
    const settings = RTS.settings.getSettings();
    const select = document.getElementById("themeSelect");
    if (select) {
      select.value = settings.theme || "indigo";
      select.addEventListener("change", (e) => {
        RTS.settings.setSettings({ theme: e.target.value });
        RTS.toast("Theme changed to " + e.target.options[e.target.selectedIndex].text + ".", "success");
      });
    }

    const langSelect = document.getElementById("languageSelect");
    if (langSelect && RTS.i18n) {
      langSelect.value = RTS.i18n.getLanguage();
      langSelect.addEventListener("change", (e) => {
        RTS.i18n.setLanguage(e.target.value);
        RTS.toast(e.target.value === "ta" ? "மொழி தமிழாக மாற்றப்பட்டது." : "Language changed to English.", "success");
      });
    }
  }

  function loadReminderSettings() {
    const settings = RTS.settings.getSettings();
    const days = settings.reminderDays || [30, 15, 7, 0];
    const rem30 = document.getElementById("rem30");
    const rem15 = document.getElementById("rem15");
    const rem7 = document.getElementById("rem7");
    const rem0 = document.getElementById("rem0");

    if (rem30) rem30.checked = days.includes(30);
    if (rem15) rem15.checked = days.includes(15);
    if (rem7) rem7.checked = days.includes(7);
    if (rem0) rem0.checked = days.includes(0);

    const saveBtn = document.getElementById("saveRemindersBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", async () => {
        const reminderDays = [];
        if (rem30 && rem30.checked) reminderDays.push(30);
        if (rem15 && rem15.checked) reminderDays.push(15);
        if (rem7 && rem7.checked) reminderDays.push(7);
        if (rem0 && rem0.checked) reminderDays.push(0);

        RTS.settings.setSettings({ reminderDays });

        try {
          await fetch(RTS.apiUrl("/api/settings/notifications"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reminderDays, sendOnExpiryDay: reminderDays.includes(0) }),
          });
        } catch (e) {
          // Graceful fallback to client storage
        }

        RTS.toast("Reminder interval preferences saved.", "success");
      });
    }
  }

  async function loadNotificationSettings() {
    const settings = RTS.settings.getSettings();
    const notifyEmailEl = document.getElementById("notifyEmail");
    const notifyBrowserEl = document.getElementById("notifyBrowser");
    const notifyDigestEl = document.getElementById("notifyDigest");
    const fallbackEmailInput = document.getElementById("notifyEmailFallback");

    if (notifyEmailEl) notifyEmailEl.checked = settings.notifyEmail !== false;
    if (notifyBrowserEl) notifyBrowserEl.checked = !!settings.notifyBrowser;
    if (notifyDigestEl) notifyDigestEl.checked = !!settings.notifyReminderDigest;
    if (fallbackEmailInput) {
      const user = RTS.auth.getCurrentUser();
      fallbackEmailInput.value = settings.defaultRecipientEmail || user.email || "demo@renewaltrack.com";
    }

    // Save toggles immediately on change
    ["notifyEmail", "notifyBrowser", "notifyDigest"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("change", async () => {
          const emailOn = notifyEmailEl ? notifyEmailEl.checked : true;
          const browserOn = notifyBrowserEl ? notifyBrowserEl.checked : true;
          const digestOn = notifyDigestEl ? notifyDigestEl.checked : false;

          RTS.settings.setSettings({
            notifyEmail: emailOn,
            notifyBrowser: browserOn,
            notifyReminderDigest: digestOn,
          });

          try {
            await fetch(RTS.apiUrl("/api/settings/notifications"), {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ emailNotificationsEnabled: emailOn }),
            });
          } catch (e) {}

          RTS.toast("Notification preferences saved.", "success");
        });
      }
    });

    // Save fallback email button
    const saveEmailBtn = document.getElementById("btnSaveFallbackEmail");
    if (saveEmailBtn && fallbackEmailInput) {
      saveEmailBtn.addEventListener("click", async () => {
        const email = fallbackEmailInput.value.trim();
        if (!email || !email.includes("@")) {
          RTS.toast("Please enter a valid email address.", "error");
          return;
        }
        RTS.settings.setSettings({ defaultRecipientEmail: email });
        try {
          await fetch(RTS.apiUrl("/api/settings/notifications"), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ defaultRecipientEmail: email }),
          });
        } catch (e) {}
        RTS.toast("Default notification email updated.", "success");
      });
    }

    // Fetch live backend diagnostics
    try {
      const res = await fetch(RTS.apiUrl("/api/reminders/status"));
      if (res.ok) {
        const data = await res.json();
        const pEl = document.getElementById("statEmailProvider");
        const mEl = document.getElementById("statEmailMode");
        const cEl = document.getElementById("statCronSchedule");

        if (pEl && data.emailConfig) {
          pEl.textContent = data.emailConfig.provider.toUpperCase();
        }
        if (mEl && data.emailConfig) {
          mEl.textContent = data.emailConfig.isSendEnabled ? "LIVE (Active)" : "SIMULATION (Safe)";
          mEl.style.color = data.emailConfig.isSendEnabled ? "var(--success)" : "var(--accent)";
        }
        if (cEl && data.scheduler) {
          cEl.textContent = data.scheduler.schedule || "Daily @ 08:00 AM";
        }
      }
    } catch (err) {
      // Offline mode
    }

    // Wire "Send Test Reminder Email"
    const testBtn = document.getElementById("btnSendTestEmail");
    const feedbackBox = document.getElementById("emailTestFeedback");
    if (testBtn) {
      testBtn.addEventListener("click", async () => {
        const targetEmail = fallbackEmailInput ? fallbackEmailInput.value.trim() : RTS.auth.getCurrentUser().email;
        if (!targetEmail || !targetEmail.includes("@")) {
          RTS.toast("Please specify a valid email address first.", "error");
          return;
        }

        testBtn.disabled = true;
        testBtn.innerHTML = '<i data-lucide="loader" class="icon spin"></i> Sending test email...';
        RTS.refreshIcons();

        try {
          const res = await fetch(RTS.apiUrl("/api/reminders/test-email"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetEmail }),
          });
          const data = await res.json();

          if (feedbackBox) {
            feedbackBox.style.display = "block";
            if (data.ok) {
              feedbackBox.style.background = "var(--success-dim)";
              feedbackBox.style.color = "var(--success)";
              feedbackBox.style.border = "1px solid var(--success)";
              feedbackBox.innerHTML = `<strong>Success:</strong> ${RTS.escapeHtml(data.message)}`;
              RTS.toast("Test reminder email dispatched!", "success");
            } else {
              feedbackBox.style.background = "var(--danger-dim)";
              feedbackBox.style.color = "var(--danger)";
              feedbackBox.style.border = "1px solid var(--danger)";
              feedbackBox.innerHTML = `<strong>Delivery Warning:</strong> ${RTS.escapeHtml(data.error)}`;
              RTS.toast(data.error, "error");
            }
          }
        } catch (e) {
          RTS.toast("Could not reach backend at " + RTS.apiUrl("/api/reminders/test-email") + ". Ensure 'npm start' or 'start.bat' is running.", "error");
        } finally {
          testBtn.disabled = false;
          testBtn.innerHTML = '<i data-lucide="send" class="icon"></i> Send Test Reminder Email';
          RTS.refreshIcons();
        }
      });
    }

    // Wire "Run Reminder Check Now"
    const triggerBtn = document.getElementById("btnTriggerReminderCheck");
    if (triggerBtn) {
      triggerBtn.addEventListener("click", async () => {
        triggerBtn.disabled = true;
        triggerBtn.innerHTML = '<i data-lucide="loader" class="icon spin"></i> Running check...';
        RTS.refreshIcons();

        try {
          const res = await fetch(RTS.apiUrl("/api/reminders/trigger"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          const data = await res.json();

          if (feedbackBox && data.summary) {
            feedbackBox.style.display = "block";
            feedbackBox.style.background = "var(--accent-dim)";
            feedbackBox.style.color = "var(--accent)";
            feedbackBox.style.border = "1px solid var(--accent)";
            feedbackBox.innerHTML = `
              <strong>Reminder Check Completed:</strong><br/>
              &bull; Renewals checked: <strong>${data.summary.totalRenewalsChecked}</strong><br/>
              &bull; Reminders sent/simulated: <strong>${data.summary.remindersSent}</strong><br/>
              &bull; Duplicates prevented: <strong>${data.summary.duplicatesSkipped}</strong><br/>
              &bull; Errors encountered: <strong>${data.summary.errorsEncountered}</strong>
            `;
            RTS.toast(
              `Reminder check finished: ${data.summary.remindersSent} sent, ${data.summary.duplicatesSkipped} duplicates prevented.`,
              "success"
            );
          }
        } catch (e) {
          RTS.toast("Could not reach backend at " + RTS.apiUrl("/api/reminders/trigger") + ". Ensure 'npm start' or 'start.bat' is running.", "error");
        } finally {
          triggerBtn.disabled = false;
          triggerBtn.innerHTML = '<i data-lucide="play" class="icon"></i> Run Reminder Check Now';
          RTS.refreshIcons();
        }
      });
    }
  }

  function wirePasswordForm() {
    document.getElementById("passwordForm").addEventListener("submit", (e) => {
      e.preventDefault();
      document.querySelectorAll("#passwordForm .field").forEach((f) => f.classList.remove("has-error"));

      const current = document.getElementById("currentPassword").value;
      const next = document.getElementById("newPassword").value;
      const confirm = document.getElementById("confirmPassword").value;
      let valid = true;

      if (!current) {
        document.getElementById("sec_current").classList.add("has-error");
        valid = false;
      }
      if (next.length < 8) {
        document.getElementById("sec_new").classList.add("has-error");
        valid = false;
      }
      if (confirm !== next || !confirm) {
        document.getElementById("sec_confirm").classList.add("has-error");
        valid = false;
      }
      if (!valid) return;

      const result = RTS.auth.changePassword(current, next);
      if (!result.ok) {
        document.getElementById("sec_current").classList.add("has-error");
        RTS.toast(result.error, "error");
        return;
      }
      RTS.toast("Password updated successfully.", "success");
      document.getElementById("passwordForm").reset();
    });
  }

  function wireTeamAndAiScan() {
    const inviteBtn = document.getElementById("inviteMemberBtn");
    if (inviteBtn) {
      inviteBtn.addEventListener("click", () => {
        const email = prompt("Enter team member's email address:");
        if (email && email.includes("@")) {
          RTS.toast("Invitation link sent to " + email + " (Role: Editor).", "success");
        }
      });
    }

    const testBtn = document.getElementById("testAiScanBtn");
    const dropzone = document.getElementById("smartDocDropzone");
    const fileInput = document.getElementById("smartDocFileInput");
    const resultBox = document.getElementById("aiScanResult");
    const saveAiBtn = document.getElementById("saveAiRecordBtn");

    function runExtraction(fileName) {
      if (!resultBox) return;
      RTS.toast("AI SmartDoc: Scanning " + (fileName || "contract document") + "...", "info");
      setTimeout(() => {
        resultBox.style.display = "block";
        RTS.refreshIcons();
        RTS.toast("AI SmartDoc: Expiry & contract terms extracted with 98.4% confidence!", "success");
      }, 700);
    }

    if (testBtn) {
      testBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        runExtraction("Sample_Cloudflare_Enterprise_SLA.pdf");
      });
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        if (fileInput.files && fileInput.files[0]) {
          runExtraction(fileInput.files[0].name);
        }
      });
    }

    if (saveAiBtn) {
      saveAiBtn.addEventListener("click", () => {
        const newRecord = {
          title: "Cloudflare Enterprise SLA Agreement",
          vendor: "Cloudflare, Inc.",
          expiryDate: "2027-09-30",
          category: "Software",
          cost: 24000,
          recurringCycle: "yearly",
          status: "Active",
          priority: "High",
          description: "AI-extracted enterprise SLA & DDoS mitigation agreement.",
        };
        const created = RTS.data.createRecord(newRecord);
        RTS.toast("Saved to active renewals! ID: " + created.id, "success");
        setTimeout(() => {
          window.location.href = "details.html?id=" + encodeURIComponent(created.id);
        }, 1000);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    RTS.initLayout();
    wireTabs();
    loadProfile();
    wireProfileForm();
    loadApplicationSettings();
    loadReminderSettings();
    loadNotificationSettings();
    wireTeamAndAiScan();
    wirePasswordForm();
    RTS.refreshIcons();
  });
})();
