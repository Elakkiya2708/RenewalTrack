/* ==========================================================================
   Renewal Tracking System — app.js
   Shared utilities, data layer (localStorage mock persistence), auth guard,
   layout wiring (sidebar/topbar), toast notifications, modal helpers.

   NOTE ON BACKEND INTEGRATION:
   All data access goes through the RTS.data.* functions below. To connect
   a real Node.js + Express + Supabase backend, replace the internals of
   those functions with `fetch()` calls to your API while keeping the same
   function names/signatures — every page script only talks to RTS.data.*
   and never touches localStorage directly, so the rest of the app does
   not need to change.
   ========================================================================== */

(function (global) {
  "use strict";

  const STORAGE_KEYS = {
    RENEWALS: "rts_renewals",
    USER: "rts_current_user",
    AUTH: "rts_auth_token",
    REMEMBER: "rts_remember_email",
    SETTINGS: "rts_settings_v3",
    ACCOUNTS: "rts_accounts",
    LANG: "rts_lang",
  };

  const CATEGORIES = [
    "Contract",
    "License",
    "Certification",
    "Warranty",
    "Insurance",
    "Subscription",
    "Regulatory Permit",
    "Other",
  ];

  const PRIORITIES = ["High", "Medium", "Low"];
  const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AUD", "CAD"];

  const RECURRING_CYCLES = [
    "None",
    "Monthly",
    "Quarterly",
    "Yearly",
    "2-Year",
    "3-Year",
    "5-Year",
  ];

  /* ------------------------------------------------------------------ */
  /* i18n Dictionary (English & தமிழ்)                                   */
  /* ------------------------------------------------------------------ */

  const I18N = {
    en: {
      appName: "RenewalTrack",
      tagline: "Renewal Tracking System",
      main: "Main",
      teamManagement: "Team Management",
      teamMembers: "Team Members",
      inviteMembers: "Invite Members",
      auditLogs: "Audit Logs",
      account: "Account",
      dashboard: "Dashboard",
      records: "Renewal Records",
      calendar: "Calendar",
      reminders: "Reminders",
      history: "Renewal History",
      documents: "Documents",
      reports: "Reports",
      settings: "Settings",
      logout: "Logout",
      profileSettings: "Profile Settings",
      appSettings: "App Settings",
      searchPlaceholder: "Search renewals, documents…",
      notifications: "Notifications",
      urgentRenewals: "urgent renewal(s)",
      allCaughtUp: "You're all caught up. No urgent renewals.",
      viewAllReminders: "View All Reminders",
      snooze1Week: "Snooze 1w",
      snooze1Day: "Snooze 1d",
      snooze1Month: "Snooze 1m",
      snoozeCustom: "Custom",
      snoozeSuccess: "Reminder snoozed for {days} day(s).",
      active: "Active",
      dueSoon: "Due Soon",
      expired: "Expired",
      renewed: "Renewed",
      priorityHigh: "High",
      priorityMedium: "Medium",
      priorityLow: "Low",
      addNewRenewal: "Add New Renewal",
      quickAddRenewal: "Quick Add Renewal",
      importCsv: "Import CSV",
      exportCsv: "Export CSV",
      exportCalendar: "Export Calendar (.ics)",
      printReport: "Print Report",
      markAsRenewed: "Mark as Renewed",
      renewSelected: "Renew Selected",
      exportSelectedCsv: "Export Selected CSV",
      exportSelectedIcs: "Export Selected .ics",
      deleteSelected: "Delete Selected",
      clearSelection: "Clear",
      selectedCount: "{count} selected",
      recordId: "Record ID",
      recordName: "Record Name",
      category: "Category",
      organization: "Organization",
      issueDate: "Issue Date",
      expiryDate: "Expiry Date",
      reminderDate: "Reminder Date",
      status: "Status",
      priority: "Priority",
      cost: "Renewal Cost",
      actions: "Actions",
      recurringCycle: "Renewal Cycle",
      cycleNone: "None (One-time)",
      cycleMonthly: "Monthly",
      cycleQuarterly: "Quarterly",
      cycleYearly: "Yearly",
      cycle2Year: "2 Years",
      cycle3Year: "3 Years",
      cycle5Year: "5 Years",
      daysRemaining: "days remaining",
      cmdPalettePlaceholder: "Type a command, page name, or search renewals…",
      cmdPages: "Pages",
      cmdActions: "Quick Actions",
      cmdRenewals: "Renewals",
      cmdNoResults: "No matching renewals or actions found.",
      costForecast: "Cost Forecast & Budget Planning",
      next30Days: "Next 30 Days",
      next90Days: "Next 90 Days",
      next365Days: "Next 365 Days (1 Year)",
      allUpcoming: "All Upcoming",
      projectedCost: "Projected Renewal Cost",
      renewalsDue: "Renewals Due in Window",
      highPriorityCost: "High-Priority Spend",
      avgRenewalCost: "Average Spend / Record",
      categoryBreakdown: "Category-wise Spending Breakdown",
      monthlyProjections: "Monthly Projected Spend",
      topUpcoming: "Top Costly Upcoming Renewals",
      allCategories: "All Categories",
      allStatuses: "All Statuses",
      allPriorities: "All Priorities",
    },
    ta: {
      appName: "ரினீவல் ட்ராக்",
      tagline: "புதுப்பித்தல் கண்காணிப்பு அமைப்பு",
      main: "முதன்மை",
      teamManagement: "குழு மேலாண்மை",
      teamMembers: "குழு உறுப்பினர்கள்",
      inviteMembers: "உறுப்பினர்களை அழைக்க",
      auditLogs: "தணிக்கை பதிவுகள்",
      account: "கணக்கு",
      dashboard: "முகப்பு பலகை",
      records: "புதுப்பித்தல் பதிவுகள்",
      calendar: "நாள்காட்டி",
      reminders: "நினைவூட்டல்கள்",
      history: "புதுப்பித்தல் வரலாறு",
      documents: "ஆவணங்கள்",
      reports: "அறிக்கைகள்",
      settings: "அமைப்புகள்",
      logout: "வெளியேறு",
      profileSettings: "சுயவிவர அமைப்புகள்",
      appSettings: "செயலி அமைப்புகள்",
      searchPlaceholder: "பதிவுகள், ஆவணங்களைத் தேடுக…",
      notifications: "அறிவிப்புகள்",
      urgentRenewals: "அவசர புதுப்பித்தல்(கள்)",
      allCaughtUp: "எல்லாம் புதுப்பிக்கப்பட்டுள்ளது. அவசர புதுப்பித்தல்கள் இல்லை.",
      viewAllReminders: "எல்லா நினைவூட்டல்களையும் பார்",
      snooze1Week: "1வ தள்ளிப்போடு",
      snooze1Day: "1நா தள்ளிப்போடு",
      snooze1Month: "1மா தள்ளிப்போடு",
      snoozeCustom: "தேதி அமை",
      snoozeSuccess: "நினைவூட்டல் {days} நாள்(கள்) தள்ளிவைக்கப்பட்டது.",
      active: "செயலில்",
      dueSoon: "விரைவில் காலாவதி",
      expired: "காலாவதியானது",
      renewed: "புதுப்பிக்கப்பட்டது",
      priorityHigh: "உயர்",
      priorityMedium: "நடுத்தர",
      priorityLow: "குறைவு",
      addNewRenewal: "புதிய பதிவு சேர்",
      quickAddRenewal: "உடனடி பதிவு சேர்",
      importCsv: "CSV இறக்குமதி",
      exportCsv: "CSV ஏற்றுமதி",
      exportCalendar: "நாள்காட்டி ஏற்றுமதி (.ics)",
      printReport: "அறிக்கை அச்சிடுக",
      markAsRenewed: "புதுப்பிக்கப்பட்டதாக குறி",
      renewSelected: "தேர்ந்தெடுத்ததை புதுப்பி",
      exportSelectedCsv: "தேர்ந்தெடுத்த CSV ஏற்றுமதி",
      exportSelectedIcs: "தேர்ந்தெடுத்த .ics ஏற்றுமதி",
      deleteSelected: "தேர்ந்தெடுத்ததை நீக்கு",
      clearSelection: "அழி",
      selectedCount: "{count} தேர்ந்தெடுக்கப்பட்டது",
      recordId: "பதிவு எண்",
      recordName: "பதிவு பெயர்",
      category: "வகை",
      organization: "நிறுவனம் / வழங்குநர்",
      issueDate: "வழங்கப்பட்ட தேதி",
      expiryDate: "காலாவதி தேதி",
      reminderDate: "நினைவூட்டல் தேதி",
      status: "நிலை",
      priority: "முன்னுரிமை",
      cost: "புதுப்பித்தல் செலவு",
      actions: "செயல்கள்",
      recurringCycle: "புதுப்பித்தல் சுழற்சி",
      cycleNone: "இல்லை (ஒருமுறை)",
      cycleMonthly: "மாதாந்திர",
      cycleQuarterly: "காலாண்டு",
      cycleYearly: "ஆண்டுதோறும்",
      cycle2Year: "2 ஆண்டுகள்",
      cycle3Year: "3 ஆண்டுகள்",
      cycle5Year: "5 ஆண்டுகள்",
      daysRemaining: "மீதமுள்ள நாட்கள்",
      cmdPalettePlaceholder: "பக்கம், செயல் அல்லது புதுப்பித்தலைத் தேடுக…",
      cmdPages: "பக்கங்கள்",
      cmdActions: "உடனடி செயல்கள்",
      cmdRenewals: "புதுப்பித்தல் பதிவுகள்",
      cmdNoResults: "பொருந்தும் பதிவுகள் எதுவும் கிடைக்கவில்லை.",
      costForecast: "செலவு முன்னறிவிப்பு & பட்ஜெட் திட்டம்",
      next30Days: "அடுத்த 30 நாட்கள்",
      next90Days: "அடுத்த 90 நாட்கள்",
      next365Days: "அடுத்த 365 நாட்கள் (1 ஆண்டு)",
      allUpcoming: "அனைத்து வரவிருக்கும்",
      projectedCost: "மதிப்பிடப்பட்ட புதுப்பித்தல் செலவு",
      renewalsDue: "காலாவதியாகும் பதிவுகள்",
      highPriorityCost: "உயர் முன்னுரிமை செலவு",
      avgRenewalCost: "பதிவிற்கான சராசரி செலவு",
      categoryBreakdown: "வகை வாரியான செலவுப் பகிர்வு",
      monthlyProjections: "மாதாந்திர செலவு முன்னறிவிப்பு",
      topUpcoming: "அதிக செலவாகும் வரவிருக்கும் புதுப்பித்தல்கள்",
      allCategories: "அனைத்து வகைகள்",
      allStatuses: "அனைத்து நிலைகள்",
      allPriorities: "அனைத்து முன்னுரிமைகள்",
    },
  };

  function getLanguage() {
    return localStorage.getItem(STORAGE_KEYS.LANG) || "en";
  }

  function setLanguage(lang) {
    if (lang !== "en" && lang !== "ta") lang = "en";
    localStorage.setItem(STORAGE_KEYS.LANG, lang);
    document.documentElement.lang = lang;
    applyTranslations();
    initLanguageToggle();
    renderNotifications();
    refreshIcons();
    window.dispatchEvent(new CustomEvent("rts-language-changed", { detail: { lang } }));
  }

  function t(key, fallback) {
    const lang = getLanguage();
    return (I18N[lang] && I18N[lang][key]) || (I18N.en && I18N.en[key]) || fallback || key;
  }

  function cycleLabel(cycle) {
    const lang = getLanguage();
    const dict = I18N[lang] || I18N.en;
    const map = {
      None: dict.cycleNone,
      Monthly: dict.cycleMonthly,
      Quarterly: dict.cycleQuarterly,
      Yearly: dict.cycleYearly,
      "2-Year": dict.cycle2Year,
      "3-Year": dict.cycle3Year,
      "5-Year": dict.cycle5Year,
    };
    return map[cycle] || cycle || dict.cycleNone;
  }

  /* ------------------------------------------------------------------ */
  /* Generic utilities                                                   */
  /* ------------------------------------------------------------------ */

  function uid(prefix) {
    return (
      (prefix || "id") +
      "_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function recordCode(index) {
    return "REN-" + String(index).padStart(4, "0");
  }

  function toISODate(date) {
    const d = new Date(date);
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }

  function calculateNextExpiry(dateISO, cycle) {
    const base = dateISO ? new Date(dateISO + "T00:00:00") : new Date();
    if (isNaN(base.getTime())) return addDays(todayISO(), 365);
    const d = new Date(base.getTime());
    switch (cycle) {
      case "Monthly":
        d.setMonth(d.getMonth() + 1);
        break;
      case "Quarterly":
        d.setMonth(d.getMonth() + 3);
        break;
      case "Yearly":
        d.setFullYear(d.getFullYear() + 1);
        break;
      case "2-Year":
        d.setFullYear(d.getFullYear() + 2);
        break;
      case "3-Year":
        d.setFullYear(d.getFullYear() + 3);
        break;
      case "5-Year":
        d.setFullYear(d.getFullYear() + 5);
        break;
      default:
        d.setFullYear(d.getFullYear() + 1);
        break;
    }
    return toISODate(d);
  }

  function parseSafeDate(val) {
    if (!val && val !== 0) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const d = new Date(s + "T00:00:00");
      return isNaN(d.getTime()) ? null : d;
    }
    const cleanISO = s.includes("T") ? s : s.replace(" ", "T");
    const d = new Date(cleanISO);
    return isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(fromISO, toISOStr) {
    const a = parseSafeDate(fromISO);
    const b = parseSafeDate(toISOStr);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function daysRemaining(expiryISO) {
    return daysBetween(todayISO(), expiryISO);
  }

  function formatDate(iso, opts) {
    if (!iso && iso !== 0) return "—";
    const d = parseSafeDate(iso);
    if (!d) return String(iso);
    return d.toLocaleDateString(
      "en-US",
      opts || { month: "short", day: "numeric", year: "numeric" }
    );
  }

  function formatMonthYear(iso) {
    if (!iso) return "—";
    const d = parseSafeDate(iso);
    if (!d) return String(iso);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  function formatCurrency(amount, currency) {
    if (amount === undefined || amount === null || amount === "") return "—";
    const num = Number(amount);
    const symbols = { USD: "$", EUR: "€", GBP: "£", INR: "₹", AUD: "A$", CAD: "C$" };
    const symbol = symbols[currency] || "";
    return symbol + num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait || 250);
    };
  }

  function refreshIcons() {
    if (global.lucide && typeof global.lucide.createIcons === "function") {
      global.lucide.createIcons();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Status logic                                                        */
  /* ------------------------------------------------------------------ */

  function computeStatus(record) {
    const days = daysRemaining(record.expiryDate);
    if (record.lastRenewedAt) {
      const sinceRenewal = daysBetween(record.lastRenewedAt, todayISO());
      if (sinceRenewal >= 0 && sinceRenewal <= 30 && days > 30) {
        return "renewed";
      }
    }
    if (days < 0) return "expired";
    if (days <= 30) return "due-soon";
    return "active";
  }

  function statusLabel(status) {
    const lang = getLanguage();
    const dict = I18N[lang] || I18N.en;
    return (
      {
        active: dict.active,
        "due-soon": dict.dueSoon,
        expired: dict.expired,
        renewed: dict.renewed,
      }[status] || status
    );
  }

  function priorityLabel(priority) {
    const lang = getLanguage();
    const dict = I18N[lang] || I18N.en;
    const key = "priority" + (priority || "Low");
    return dict[key] || priority;
  }

  function statusBadgeHtml(status) {
    const label = statusLabel(status);
    return `<span class="badge badge-${status}">${escapeHtml(label)}</span>`;
  }

  function priorityBadgeHtml(priority) {
    const cls = "badge-priority-" + String(priority || "low").toLowerCase();
    return `<span class="badge ${cls}">${escapeHtml(priorityLabel(priority))}</span>`;
  }

  /* ------------------------------------------------------------------ */
  /* Data layer (localStorage-backed mock persistence)                   */
  /* ------------------------------------------------------------------ */

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getRenewals() {
    return readJSON(STORAGE_KEYS.RENEWALS, []);
  }

  function saveRenewals(list) {
    writeJSON(STORAGE_KEYS.RENEWALS, list);
  }

  function getRenewalById(id) {
    return getRenewals().find((r) => r.id === id) || null;
  }

  function apiUrl(endpoint) {
    if (!endpoint) return "";
    const clean = endpoint.startsWith("/") ? endpoint : "/" + endpoint;
    if (window.location.protocol === "file:" || !window.location.host) {
      return "http://localhost:3000" + clean;
    }
    return clean;
  }

  function syncRenewalToBackend(method, url, body) {
    try {
      const token = (global.RTS && global.RTS.auth && typeof global.RTS.auth.getToken === "function" && global.RTS.auth.getToken()) || localStorage.getItem("rts_auth_token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;
      fetch(apiUrl(url), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      }).catch(() => {});
    } catch (e) {}
  }

  function addRenewal(data) {
    const list = getRenewals();
    const nextIndex = list.length + 1;
    const record = Object.assign(
      {
        id: uid("ren"),
        code: recordCode(nextIndex),
        documents: [],
        history: [],
        recurringCycle: "Yearly",
        reminderCompleted: false,
        lastRenewedAt: null,
        createdAt: new Date().toISOString(),
      },
      data
    );
    list.unshift(record);
    saveRenewals(list);
    syncRenewalToBackend("POST", "/api/renewals", record);
    return record;
  }

  function updateRenewal(id, data) {
    const list = getRenewals();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const oldRecord = list[idx];

    // If expiryDate is advancing forward to a new date, automatically record history!
    if (data.expiryDate && oldRecord.expiryDate && data.expiryDate !== oldRecord.expiryDate) {
      const oldD = new Date(oldRecord.expiryDate).getTime();
      const newD = new Date(data.expiryDate).getTime();
      if (!isNaN(oldD) && !isNaN(newD) && newD > oldD && !data.history) {
        const currentUser = (global.RTS && global.RTS.auth && typeof global.RTS.auth.getCurrentUser === "function" && global.RTS.auth.getCurrentUser()) || null;
        const historyEntry = {
          id: uid("hist"),
          previousExpiry: oldRecord.expiryDate,
          newExpiry: data.expiryDate,
          renewalDate: todayISO(),
          cost: data.cost !== undefined && data.cost !== "" && data.cost !== null ? Number(data.cost) : oldRecord.cost,
          currency: data.currency || oldRecord.currency || "USD",
          renewedBy: (currentUser && currentUser.fullName) || "System User",
          notes: data.notes || "Renewed via record update",
        };
        let hist = oldRecord.history;
        if (typeof hist === "string") {
          try { hist = JSON.parse(hist); } catch (e) { hist = []; }
        }
        if (!Array.isArray(hist)) hist = [];
        data.history = [historyEntry, ...hist];
        data.lastRenewedAt = todayISO();
        data.reminderCompleted = false;
      }
    }

    list[idx] = Object.assign({}, list[idx], data);
    saveRenewals(list);

    try {
      window.dispatchEvent(new CustomEvent("rts-renewal-updated", { detail: { id, record: list[idx] } }));
    } catch (e) {}

    syncRenewalToBackend("PUT", "/api/renewals/" + encodeURIComponent(id), list[idx]);
    return list[idx];
  }

  function deleteRenewal(id) {
    const list = getRenewals().filter((r) => r.id !== id);
    saveRenewals(list);
    syncRenewalToBackend("DELETE", "/api/renewals/" + encodeURIComponent(id));
  }

  function markAsRenewed(id, payload) {
    const list = getRenewals();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const record = list[idx];
    const cycle = payload.recurringCycle || record.recurringCycle || "Yearly";
    const newExpiry = payload.newExpiryDate || calculateNextExpiry(record.expiryDate, cycle);
    const currentUser = (global.RTS && global.RTS.auth && typeof global.RTS.auth.getCurrentUser === "function" && global.RTS.auth.getCurrentUser()) || null;
    const renewedBy = payload.renewedBy || (currentUser && currentUser.fullName) || "System User";
    const renewalDate = payload.renewalDate || todayISO();

    const historyEntry = {
      id: uid("hist"),
      previousExpiry: record.expiryDate,
      newExpiry: newExpiry,
      renewalDate: renewalDate,
      cost: payload.cost !== undefined && payload.cost !== "" && payload.cost !== null ? Number(payload.cost) : record.cost,
      currency: payload.currency || record.currency || "USD",
      renewedBy: renewedBy,
      notes: payload.notes || "",
    };

    let existingHistory = record.history;
    if (typeof existingHistory === "string") {
      try { existingHistory = JSON.parse(existingHistory); } catch (e) { existingHistory = []; }
    }
    if (!Array.isArray(existingHistory)) existingHistory = [];

    record.history = [historyEntry, ...existingHistory];
    record.issueDate = renewalDate;
    record.expiryDate = newExpiry;
    record.lastRenewedAt = renewalDate;
    record.reminderCompleted = false;
    record.recurringCycle = cycle;
    if (payload.reminderDate) {
      record.reminderDate = payload.reminderDate;
    } else {
      record.reminderDate = addDays(newExpiry, -14);
    }
    list[idx] = record;
    saveRenewals(list);

    try {
      window.dispatchEvent(new CustomEvent("rts-renewal-updated", { detail: { id, record, historyEntry } }));
    } catch (e) {}

    syncRenewalToBackend("POST", "/api/renewals/" + encodeURIComponent(id) + "/mark-renewed", {
      ...payload,
      renewalDate,
      newExpiryDate: newExpiry,
      renewedBy,
      cost: historyEntry.cost,
      currency: historyEntry.currency,
      recurringCycle: cycle,
    });
    return record;
  }

  function snoozeReminder(id, days) {
    const list = getRenewals();
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const newDate = addDays(todayISO(), days || 7);
    list[idx].reminderDate = newDate;
    list[idx].reminderCompleted = false;
    saveRenewals(list);
    return list[idx];
  }

  function bulkRenew(ids) {
    if (!ids || !ids.length) return 0;
    const list = getRenewals();
    let count = 0;
    const currentUser = (global.RTS && global.RTS.auth && typeof global.RTS.auth.getCurrentUser === "function" && global.RTS.auth.getCurrentUser()) || null;
    const actorName = (currentUser && currentUser.fullName) || "Bulk Action";

    ids.forEach((id) => {
      const idx = list.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const record = list[idx];
        const cycle = record.recurringCycle || "Yearly";
        const newExpiry = calculateNextExpiry(record.expiryDate, cycle);
        const historyEntry = {
          id: uid("hist"),
          previousExpiry: record.expiryDate,
          newExpiry: newExpiry,
          renewalDate: todayISO(),
          cost: record.cost,
          currency: record.currency || "USD",
          renewedBy: actorName,
          notes: "Auto-renewed via Bulk Action (" + cycle + ")",
        };
        let hist = record.history;
        if (typeof hist === "string") {
          try { hist = JSON.parse(hist); } catch (e) { hist = []; }
        }
        if (!Array.isArray(hist)) hist = [];
        record.history = [historyEntry, ...hist];
        record.issueDate = historyEntry.renewalDate;
        record.expiryDate = newExpiry;
        record.lastRenewedAt = historyEntry.renewalDate;
        record.reminderCompleted = false;
        record.reminderDate = addDays(newExpiry, -14);
        list[idx] = record;
        count++;

        syncRenewalToBackend("POST", "/api/renewals/" + encodeURIComponent(id) + "/mark-renewed", {
          newExpiryDate: newExpiry,
          cost: record.cost,
          currency: record.currency,
          recurringCycle: cycle,
          renewedBy: actorName,
          notes: historyEntry.notes,
        });
      }
    });
    saveRenewals(list);
    try {
      window.dispatchEvent(new CustomEvent("rts-renewal-updated", { detail: { count } }));
    } catch (e) {}
    return count;
  }

  function bulkDelete(ids) {
    if (!ids || !ids.length) return 0;
    let list = getRenewals();
    const before = list.length;
    list = list.filter((r) => !ids.includes(r.id));
    saveRenewals(list);
    ids.forEach((id) => {
      syncRenewalToBackend('DELETE', '/api/renewals/' + encodeURIComponent(id));
    });
    return before - list.length;
  }

  function addDocumentToRenewal(id, doc) {
    const record = getRenewalById(id);
    if (!record) return null;
    const docs = record.documents || [];
    docs.unshift(
      Object.assign(
        { id: uid("doc"), uploadDate: todayISO() },
        doc
      )
    );
    return updateRenewal(id, { documents: docs });
  }

  function deleteDocumentFromRenewal(recordId, docId) {
    const record = getRenewalById(recordId);
    if (!record) return null;
    const docs = (record.documents || []).filter((d) => d.id !== docId);
    return updateRenewal(recordId, { documents: docs });
  }

  function toggleReminderCompleted(id, completed, options) {
    if (completed && options && options.renew) {
      return markAsRenewed(id, {
        notes: options.notes || "Completed & renewed via Reminders",
      });
    }
    return updateRenewal(id, { reminderCompleted: completed });
  }

  function getAllDocuments() {
    const renewals = getRenewals();
    const docs = [];
    renewals.forEach((r) => {
      (r.documents || []).forEach((d) => {
        docs.push(Object.assign({}, d, { renewalId: r.id, renewalName: r.name }));
      });
    });
    return docs.sort((a, b) => (a.uploadDate < b.uploadDate ? 1 : -1));
  }

  function getAllHistory() {
    const renewals = getRenewals();
    const rows = [];
    renewals.forEach((r) => {
      let hist = r.history;
      if (typeof hist === "string") {
        try {
          hist = JSON.parse(hist);
        } catch (e) {
          hist = [];
        }
      }
      if (!Array.isArray(hist)) hist = [];
      hist.forEach((h) => {
        if (!h || typeof h !== "object") return;
        rows.push(
          Object.assign({}, h, {
            renewalId: r.id,
            renewalName: r.name || r.recordName || "Unnamed Record",
            category: r.category || "General",
            recordCode: r.code || r.referenceNumber || "—",
          })
        );
      });
    });
    return rows.sort((a, b) => {
      const da = new Date(a.renewalDate || a.createdAt || 0).getTime();
      const db = new Date(b.renewalDate || b.createdAt || 0).getTime();
      return db - da;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mock data seeding                                                    */
  /* ------------------------------------------------------------------ */

  function seedData() {
    // Default sample data disabled — user adds real records
    if (!localStorage.getItem(STORAGE_KEYS.RENEWALS)) {
      saveRenewals([]);
    }
  }

  function clearAllRenewals() {
    saveRenewals([]);
    syncRenewalToBackend('DELETE', '/api/renewals');
  }

  const PRIMARY_ADMIN_EMAIL = "elakkiyaohai@gmail.com";
  const PRIMARY_ADMIN_NAME = "Elakkiya";

  const DEFAULT_ACCOUNTS = [
    {
      id: "usr-admin-elakkiya",
      fullName: PRIMARY_ADMIN_NAME,
      email: PRIMARY_ADMIN_EMAIL,
      mobile: "+91 98765 43210",
      password: "Admin@1234",
      role: "Admin",
      status: "active",
      isPrimaryAdmin: true,
    },
    {
      id: "usr-2",
      fullName: "David Kim",
      email: "david.kim@renewaltrack.com",
      mobile: "+1 555 0103",
      password: "Demo@1234",
      role: "Employee",
      status: "active",
    },
    {
      id: "usr-3",
      fullName: "Priya Nair",
      email: "priya.nair@renewaltrack.com",
      mobile: "+1 555 0104",
      password: "Demo@1234",
      role: "Viewer",
      status: "active",
    },
  ];

  function seedAccount() {
    let accounts = readJSON(STORAGE_KEYS.ACCOUNTS, null);

    // Completely purge unwanted demo account from localStorage
    if (accounts && Array.isArray(accounts)) {
      const filtered = accounts.filter(
        (a) => a.email && a.email.toLowerCase() !== "demo@renewaltrack.com"
      );
      if (filtered.length !== accounts.length) {
        accounts = filtered;
        writeJSON(STORAGE_KEYS.ACCOUNTS, accounts);
      }
    }

    // Purge unwanted demo user from current user session
    const currentStored = readJSON(STORAGE_KEYS.USER, null);
    if (currentStored && currentStored.email && currentStored.email.toLowerCase() === "demo@renewaltrack.com") {
      writeJSON(STORAGE_KEYS.USER, DEFAULT_ACCOUNTS[0]);
    }

    if (!accounts || !accounts.length) {
      writeJSON(STORAGE_KEYS.ACCOUNTS, DEFAULT_ACCOUNTS);
    } else {
      let changed = false;
      DEFAULT_ACCOUNTS.forEach((def) => {
        const found = accounts.find((a) => a.email.toLowerCase() === def.email.toLowerCase());
        if (!found) {
          accounts.push(def);
          changed = true;
        } else {
          if (!found.role || found.role === "Editor") {
            found.role = def.role;
            changed = true;
          }
          if (!found.status) {
            found.status = "active";
            changed = true;
          }
        }
      });
      if (changed) writeJSON(STORAGE_KEYS.ACCOUNTS, accounts);
    }

    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      writeJSON(STORAGE_KEYS.SETTINGS, {
        theme: "indigo",
        reminderDays: [30, 15, 7],
        notifyEmail: true,
        notifyBrowser: true,
        notifyReminderDigest: false,
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Auth & Role-Based Access Control                                   */
  /* ------------------------------------------------------------------ */

  function getAccounts() {
    const accs = readJSON(STORAGE_KEYS.ACCOUNTS, []);
    const clean = accs.filter((a) => a.email && a.email.toLowerCase() !== "demo@renewaltrack.com");
    if (!clean.length) return DEFAULT_ACCOUNTS;
    return clean;
  }

  async function registerAccount({ fullName, email, mobile, password, inviteToken }) {
    const cleanEmail = (email || "").trim().toLowerCase();

    try {
      const res = await fetch(apiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email: cleanEmail, mobile, password, inviteToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || "Registration failed." };
      }

      const newAcc = {
        id: (data.user && data.user.id) || uid("usr"),
        fullName: (data.user && data.user.fullName) || fullName.trim(),
        email: cleanEmail,
        mobile: mobile || "",
        password,
        role: (data.user && data.user.role) || "Employee",
        status: "active",
      };
      const accounts = getAccounts();
      const existingIdx = accounts.findIndex((a) => a.email.toLowerCase() === cleanEmail);
      if (existingIdx >= 0) {
        accounts[existingIdx] = newAcc;
      } else {
        accounts.push(newAcc);
      }
      writeJSON(STORAGE_KEYS.ACCOUNTS, accounts);
      return { ok: true, user: newAcc };
    } catch (err) {
      const accounts = getAccounts();
      if (accounts.some((a) => a.email.toLowerCase() === cleanEmail)) {
        return { ok: false, error: "An account with this email already exists." };
      }

      const newAcc = {
        id: uid("usr"),
        fullName: fullName.trim(),
        email: cleanEmail,
        mobile: mobile || "",
        password,
        role: "Employee",
        status: "active",
      };

      accounts.push(newAcc);
      writeJSON(STORAGE_KEYS.ACCOUNTS, accounts);
      return { ok: true, user: newAcc };
    }
  }

  async function login(email, password, remember) {
    const cleanEmail = (email || "").trim().toLowerCase();

    try {
      const res = await fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return { ok: false, error: data.error || "Invalid email or password." };
      }

      const userData = data.user;
      writeJSON(STORAGE_KEYS.USER, userData);
      localStorage.setItem(STORAGE_KEYS.AUTH, data.token);
      localStorage.setItem("rts_jwt_token", data.token);

      const accounts = getAccounts();
      const idx = accounts.findIndex((a) => a.email.toLowerCase() === cleanEmail);
      if (idx >= 0) {
        accounts[idx] = Object.assign({}, accounts[idx], userData, { password });
      } else {
        accounts.push(Object.assign({}, userData, { password }));
      }
      writeJSON(STORAGE_KEYS.ACCOUNTS, accounts);

      if (remember) {
        localStorage.setItem(STORAGE_KEYS.REMEMBER, cleanEmail);
      } else {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER);
      }
      return { ok: true, user: userData };
    } catch (err) {
      const accounts = getAccounts();
      const account = accounts.find(
        (a) => a.email.toLowerCase() === cleanEmail && a.password === password
      );
      if (!account) return { ok: false, error: "Invalid email or password." };

      if (account.status === "deactivated") {
        return { ok: false, error: "Your account has been deactivated. Please contact an administrator." };
      }

      const userData = {
        id: account.id || "usr-user",
        fullName: account.fullName,
        email: account.email,
        mobile: account.mobile || "",
        role: account.role || "Admin",
        status: account.status || "active",
      };

      writeJSON(STORAGE_KEYS.USER, userData);
      const mockToken = uid("tok");
      localStorage.setItem(STORAGE_KEYS.AUTH, mockToken);
      localStorage.setItem("rts_jwt_token", mockToken);

      if (remember) {
        localStorage.setItem(STORAGE_KEYS.REMEMBER, cleanEmail);
      } else {
        localStorage.removeItem(STORAGE_KEYS.REMEMBER);
      }
      return { ok: true, user: userData };
    }
  }

  function changePassword(currentPassword, newPassword) {
    const user = getCurrentUser();
    const accounts = getAccounts();
    const idx = accounts.findIndex((a) => a.email.toLowerCase() === user.email.toLowerCase());
    if (idx === -1) return { ok: false, error: "Account not found." };
    if (accounts[idx].password !== currentPassword) {
      return { ok: false, error: "Current password is incorrect." };
    }
    accounts[idx].password = newPassword;
    writeJSON(STORAGE_KEYS.ACCOUNTS, accounts);

    try {
      fetch(apiUrl("/api/auth/change-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, currentPassword, newPassword }),
      }).catch(() => {});
    } catch (e) {}

    return { ok: true };
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    localStorage.removeItem("rts_jwt_token");
    global.location.href = "login.html";
  }

  function isLoggedIn() {
    return !!localStorage.getItem(STORAGE_KEYS.AUTH);
  }

  function getCurrentUser() {
    const user = readJSON(STORAGE_KEYS.USER, DEFAULT_ACCOUNTS[0]);
    if (!user || !user.email || user.email.toLowerCase() === "demo@renewaltrack.com") {
      writeJSON(STORAGE_KEYS.USER, DEFAULT_ACCOUNTS[0]);
      return DEFAULT_ACCOUNTS[0];
    }
    return user;
  }

  function isPrimaryAdmin() {
    const u = getCurrentUser();
    return (u.email || "").toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase();
  }

  function setCurrentUser(data) {
    const current = getCurrentUser();
    const next = Object.assign({}, current, data);
    writeJSON(STORAGE_KEYS.USER, next);

    // Also update accounts list
    const accs = getAccounts();
    const idx = accs.findIndex((a) => a.email.toLowerCase() === (next.email || "").toLowerCase());
    if (idx >= 0) {
      accs[idx] = Object.assign({}, accs[idx], next);
      writeJSON(STORAGE_KEYS.ACCOUNTS, accs);
    }
  }

  function isAdmin() {
    return (getCurrentUser().role || "Admin") === "Admin";
  }

  function isEmployee() {
    return getCurrentUser().role === "Employee";
  }

  function isViewer() {
    return getCurrentUser().role === "Viewer";
  }

  function canEditRenewal(r) {
    if (!r) return false;
    if (isAdmin()) return true;
    if (isViewer()) return false;
    const user = getCurrentUser();
    const uEmail = (user.email || "").toLowerCase();
    const uName = (user.fullName || "").toLowerCase();
    const respEmail = (r.responsibleEmail || r.responsible_email || "").toLowerCase();
    const respName = (r.responsiblePerson || r.responsible_person || "").toLowerCase();
    const createdBy = (r.createdBy || "").toLowerCase();
    return (
      (!respEmail && !respName) ||
      (uEmail && respEmail === uEmail) ||
      (uName && respName === uName) ||
      (uName && respName.includes(uName)) ||
      (uEmail && createdBy === uEmail)
    );
  }

  function canDeleteRenewal(r) {
    if (!r) return false;
    if (isAdmin()) return true;
    if (isViewer()) return false;
    const user = getCurrentUser();
    const uEmail = (user.email || "").toLowerCase();
    const uName = (user.fullName || "").toLowerCase();
    const respEmail = (r.responsibleEmail || r.responsible_email || "").toLowerCase();
    const respName = (r.responsiblePerson || r.responsible_person || "").toLowerCase();
    const createdBy = (r.createdBy || "").toLowerCase();
    return (
      (uEmail && respEmail === uEmail) ||
      (uName && respName === uName) ||
      (uName && respName.includes(uName)) ||
      (uEmail && createdBy === uEmail)
    );
  }

  function requireAuth() {
    if (!isLoggedIn()) {
      global.location.href = "login.html";
    }
  }

  function requireAdmin() {
    requireAuth();
    const user = getCurrentUser();
    if (user.role !== "Admin") {
      showToast("Access Denied: Administrator role required.", "error");
      setTimeout(() => {
        global.location.href = "dashboard.html";
      }, 400);
    }
  }

  function redirectIfAuthed() {
    if (isLoggedIn()) {
      global.location.href = "dashboard.html";
    }
  }

  function getSettings() {
    return readJSON(STORAGE_KEYS.SETTINGS, {
      theme: "indigo",
      reminderDays: [30, 15, 7],
      notifyEmail: true,
      notifyBrowser: true,
      notifyReminderDigest: false,
    });
  }

  function setSettings(data) {
    const current = getSettings();
    const next = Object.assign({}, current, data);
    writeJSON(STORAGE_KEYS.SETTINGS, next);
    applyTheme(next.theme);
    return next;
  }

  // Themes: "indigo" (default), "indigo-dark", "gold" (black & gold), "gold-light" (ivory & gold)
  const THEMES = ["indigo-dark", "gold", "gold-light"];

  function applyTheme(theme) {
    theme = theme || "indigo";
    THEMES.forEach((t) => document.body.classList.remove("theme-" + t));
    if (THEMES.indexOf(theme) !== -1) document.body.classList.add("theme-" + theme);

    // Logo / favicon / preview images follow the palette
    const gold = theme.indexOf("gold") === 0;
    document.querySelectorAll("[data-img-indigo]").forEach((el) => {
      const url = gold ? el.getAttribute("data-img-gold") : el.getAttribute("data-img-indigo");
      if (!url) return;
      el.setAttribute(el.tagName === "LINK" ? "href" : "src", url);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Toasts                                                               */
  /* ------------------------------------------------------------------ */

  function ensureToastContainer() {
    let el = document.querySelector(".toast-container");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast-container";
      document.body.appendChild(el);
    }
    return el;
  }

  const TOAST_ICONS = {
    success: "check-circle-2",
    error: "x-circle",
    warning: "alert-triangle",
    info: "info",
  };

  function showToast(message, type, duration) {
    type = type || "info";
    const container = ensureToastContainer();
    const toast = document.createElement("div");
    toast.className = "toast toast-" + type;
    toast.innerHTML =
      '<i data-lucide="' +
      (TOAST_ICONS[type] || "info") +
      '" class="icon"></i><span>' +
      escapeHtml(message) +
      "</span>";
    container.appendChild(toast);
    refreshIcons();
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.2s ease";
      setTimeout(() => toast.remove(), 200);
    }, duration || 3200);
  }

  /* ------------------------------------------------------------------ */
  /* Modal helpers                                                        */
  /* ------------------------------------------------------------------ */

  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("open");
    el.style.display = "flex";
    document.body.style.overflow = "hidden";
    refreshIcons();
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("open");
    el.style.display = "none";
    document.body.style.overflow = "";
  }

  function initModalDismiss() {
    document.querySelectorAll(".modal-overlay, .modal-backdrop").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal(overlay.id);
      });
    });
    document.querySelectorAll("[data-close-modal], [data-modal-close]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-close-modal") || btn.getAttribute("data-modal-close");
        if (id) {
          closeModal(id);
        } else {
          const parentOverlay = btn.closest(".modal-overlay, .modal-backdrop");
          if (parentOverlay) closeModal(parentOverlay.id);
        }
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay.open, .modal-backdrop.open").forEach((o) => closeModal(o.id));
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Layout wiring: sidebar, topbar, notifications, user menu             */
  /* ------------------------------------------------------------------ */

  function currentPageName() {
    const path = global.location.pathname.split("/").pop() || "dashboard.html";
    return path;
  }

  function initSidebarActive() {
    const page = currentPageName();
    const isAssignedMe = global.location.search.includes("assigned=me");
    const isInvite = global.location.hash.includes("invite");

    document.querySelectorAll(".nav-link").forEach((link) => {
      const href = link.getAttribute("href") || "";
      if (isAssignedMe) {
        if (href.includes("assigned=me")) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      } else if (page === "team.html" && isInvite) {
        if (href.includes("#invite")) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      } else {
        const hrefBase = href.split("?")[0].split("#")[0];
        if (
          (hrefBase === page || (page === "" && hrefBase === "dashboard.html")) &&
          !href.includes("assigned=me") &&
          !href.includes("#invite")
        ) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      }
    });
  }

  function applyViewerRestrictions() {
    const hideSelectors = [
      "a[href*='#add']",
      "a[href='records.html#add']",
      "#openAddBtn",
      "#quickAddBtn",
      "#openImportBtn",
      "#bulkActionBar",
      "#openUploadBtn",
      "#editBtn",
      "#deleteBtn",
      "#renewBtn",
      "#clearAllBtn",
      ".btn-add",
      ".btn-create",
      ".btn-delete",
      ".btn-edit",
      ".change-role-btn",
      ".toggle-status-btn",
      "#btnRunCheckFromReminders",
      "#btnAddRenewal",
      "#btnImportCsv",
      "#btnMarkRenewed",
      "#btnDeleteRenewal",
      "#btnEditRenewal",
      "#btnUploadDocTrigger",
      ".record-select-checkbox",
      "#selectAllRecords"
    ];

    hideSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.display = "none";
      });
    });

    const modalForm = document.getElementById("renewalForm");
    if (modalForm) {
      modalForm.querySelectorAll("input, select, textarea, button[type='submit']").forEach((input) => {
        input.disabled = true;
      });
    }

    const topbarActions = document.querySelector(".topbar-actions");
    if (topbarActions && !document.getElementById("viewerModePill")) {
      const pill = document.createElement("div");
      pill.id = "viewerModePill";
      pill.className = "viewer-mode-pill";
      pill.innerHTML = `<i data-lucide="eye" class="icon" style="width:12px;height:12px;"></i> <span>Viewer (Read-Only)</span>`;
      topbarActions.insertBefore(pill, topbarActions.firstChild);
    }
  }

  function renderRoleSidebar() {
    const nav = document.querySelector(".sidebar-nav");
    if (!nav) return;

    const user = getCurrentUser();
    const role = user.role || "Admin";

    // 1. Clean up any dynamic duplicate links or labels previously injected
    nav.querySelectorAll(".sidebar-team-link, .sidebar-team-label").forEach((el) => el.remove());

    // 2. Remove "My Profile" and "Logout" from sidebar across all roles and dashboards
    nav.querySelectorAll("a[href*='profile.html'], [data-logout], a[href*='logout']").forEach((el) => el.remove());

    // 3. Ensure Employee "Assigned to Me" link exists
    let empLink = nav.querySelector("a[href='records.html?assigned=me']");
    if (!empLink) {
      const reportsLink = nav.querySelector("a[href='reports.html']");
      const empHtml = `
        <div class="sidebar-section-label" data-role="Employee">My Work</div>
        <a href="records.html?assigned=me" class="nav-link" data-role="Employee"><i data-lucide="user-check" class="icon"></i>Assigned to Me</a>
      `;
      if (reportsLink) {
        reportsLink.insertAdjacentHTML("afterend", empHtml);
      } else {
        const accLabel = Array.from(nav.querySelectorAll(".sidebar-section-label")).find(
          (el) => el.textContent.trim().toLowerCase() === "account" || el.textContent.trim().toLowerCase() === "கணக்கு"
        );
        if (accLabel) {
          accLabel.insertAdjacentHTML("beforebegin", empHtml);
        } else {
          nav.insertAdjacentHTML("beforeend", empHtml);
        }
      }
    }

    // 4. Ensure Team Management links exist for Admin
    let adminTeamLink = nav.querySelector("a[href='team.html']");
    if (!adminTeamLink) {
      const accLabel = Array.from(nav.querySelectorAll(".sidebar-section-label")).find(
        (el) => el.textContent.trim().toLowerCase() === "account" || el.textContent.trim().toLowerCase() === "கணக்கு"
      );
      const teamHtml = `
        <div class="sidebar-section-label" data-role="Admin">Team Management</div>
        <a href="team.html" class="nav-link" data-role="Admin"><i data-lucide="users" class="icon"></i>Team Members</a>
        <a href="audit.html" class="nav-link" data-role="Admin"><i data-lucide="clipboard-list" class="icon"></i>Audit Logs</a>
      `;
      if (accLabel) {
        accLabel.insertAdjacentHTML("beforebegin", teamHtml);
      } else {
        nav.insertAdjacentHTML("beforeend", teamHtml);
      }
    }

    // Always remove Invite Members from sidebar navigation
    const existingInvite = nav.querySelector("a[href='team.html#invite'], a[href='#invite']");
    if (existingInvite) existingInvite.remove();

    // 5. Remove any duplicate nav links
    const seenHrefs = new Set();
    nav.querySelectorAll(".nav-link").forEach((link) => {
      const href = link.getAttribute("href");
      if (seenHrefs.has(href)) {
        link.remove();
      } else {
        seenHrefs.add(href);
      }
    });

    // 6. Remove any duplicate section labels
    const seenLabels = new Set();
    nav.querySelectorAll(".sidebar-section-label").forEach((lbl) => {
      const key = (lbl.getAttribute("data-role") || "") + ":" + lbl.textContent.trim().toLowerCase();
      if (seenLabels.has(key)) {
        lbl.remove();
      } else {
        seenLabels.add(key);
      }
    });

    // 7. Enforce role-based sidebar visibility
    const adminItems = nav.querySelectorAll("[data-role='Admin']");
    const empItems = nav.querySelectorAll("[data-role='Employee']");

    if (role === "Admin") {
      adminItems.forEach((el) => (el.style.display = ""));
      empItems.forEach((el) => (el.style.display = "none"));
    } else if (role === "Employee") {
      adminItems.forEach((el) => (el.style.display = "none"));
      empItems.forEach((el) => (el.style.display = ""));
    } else {
      // Viewer (read-only): hide both Admin team management and Employee assigned items
      adminItems.forEach((el) => (el.style.display = "none"));
      empItems.forEach((el) => (el.style.display = "none"));
    }

    // 8. Active navigation link state
    initSidebarActive();

    // 9. Apply viewer restrictions if Viewer
    if (role === "Viewer") {
      applyViewerRestrictions();
    }

    refreshIcons();
  }

  function initMobileSidebar() {
    const toggle = document.querySelector(".sidebar-toggle");
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.querySelector(".sidebar-overlay");
    if (!toggle || !sidebar) return;
    const open = () => {
      sidebar.classList.add("open");
      if (overlay) overlay.classList.add("open");
    };
    const close = () => {
      sidebar.classList.remove("open");
      if (overlay) overlay.classList.remove("open");
    };
    toggle.addEventListener("click", () => {
      sidebar.classList.contains("open") ? close() : open();
    });
    if (overlay) overlay.addEventListener("click", close);
    sidebar.querySelectorAll(".nav-link").forEach((l) => l.addEventListener("click", close));
  }

  function initDropdowns() {
    document.querySelectorAll("[data-dropdown-trigger]").forEach((trigger) => {
      const targetId = trigger.getAttribute("data-dropdown-trigger");
      const panel = document.getElementById(targetId);
      if (!panel) return;
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = !panel.classList.contains("open");
        document.querySelectorAll(".dropdown-panel.open").forEach((p) => p.classList.remove("open"));
        if (willOpen) panel.classList.add("open");
      });
    });
    document.addEventListener("click", () => {
      document.querySelectorAll(".dropdown-panel.open").forEach((p) => p.classList.remove("open"));
    });
  }

  function initials(name) {
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    return ((parts[0] || "")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function renderTopbarUser() {
    const user = getCurrentUser();
    const role = user.role || "Admin";
    document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = user.fullName));
    document.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = user.email));
    document.querySelectorAll("[data-user-initials]").forEach((el) => (el.textContent = initials(user.fullName)));

    // Role pill badge
    document.querySelectorAll(".user-menu-trigger .uname").forEach((el) => {
      let badge = el.parentElement.querySelector(".role-pill-badge");
      if (!badge) {
        badge = document.createElement("span");
        el.insertAdjacentElement("afterend", badge);
      }
      badge.textContent = role;
      badge.className = `role-pill-badge role-${role.toLowerCase()}`;
    });

    // Ensure Settings link in dropdown panel and remove redundant profile link
    const userPanel = document.getElementById("userPanel");
    if (userPanel) {
      const oldProf = userPanel.querySelector("a[href='profile.html']");
      if (oldProf) oldProf.remove();
      if (!userPanel.querySelector("a[href='settings.html']")) {
        const firstItem = userPanel.querySelector(".dropdown-item");
        const settingsLink = document.createElement("a");
        settingsLink.href = "settings.html";
        settingsLink.className = "dropdown-item";
        settingsLink.innerHTML = `<i data-lucide="settings" class="icon"></i>Settings`;
        if (firstItem) {
          userPanel.insertBefore(settingsLink, firstItem);
        } else {
          userPanel.appendChild(settingsLink);
        }
      }
    }
  }

  function buildNotifications() {
    const renewals = getRenewals();
    const items = [];
    renewals.forEach((r) => {
      const status = computeStatus(r);
      const days = daysRemaining(r.expiryDate);
      if (status === "expired") {
        items.push({
          recordId: r.id,
          name: r.name,
          title: r.name + " has expired",
          detail: Math.abs(days) + " day(s) overdue",
          urgency: "expired",
          date: r.expiryDate,
        });
      } else if (status === "due-soon") {
        items.push({
          recordId: r.id,
          name: r.name,
          title: r.name + " is due soon",
          detail: "Expires in " + days + " day(s)",
          urgency: "due-soon",
          date: r.expiryDate,
        });
      }
    });
    items.sort((a, b) => (a.date > b.date ? 1 : -1));
    return items;
  }

  function renderNotifications() {
    const list = document.getElementById("notifList");
    const dot = document.getElementById("notifDot");
    const countEl = document.getElementById("notifCount");
    if (!list) return;
    const lang = getLanguage();
    const dict = I18N[lang] || I18N.en;
    const items = buildNotifications();
    if (dot) dot.style.display = items.length ? "block" : "none";
    if (countEl) countEl.textContent = items.length;
    if (!items.length) {
      list.innerHTML = `<div class="notif-empty">${escapeHtml(dict.allCaughtUp)}</div>`;
      return;
    }
    list.innerHTML =
      items
        .slice(0, 8)
        .map(
          (n) => `
      <div class="notif-item">
        <div class="notif-body">
          <strong>${escapeHtml(n.title)}</strong>
          <span>${escapeHtml(n.detail)}</span>
        </div>
        <div class="notif-actions">
          <button type="button" class="notif-btn-snooze" onclick="RTS.snoozeAndRefresh('${n.recordId}', 7)" title="${escapeHtml(dict.snooze1Week)}">
            <i data-lucide="clock" class="icon" style="width:11px;height:11px;"></i> ${escapeHtml(dict.snooze1Week)}
          </button>
          <a href="details.html?id=${n.recordId}" class="notif-btn-view" title="View details">
            <i data-lucide="chevron-right" class="icon" style="width:13px;height:13px;"></i>
          </a>
        </div>
      </div>`
        )
        .join("") +
      `<div class="notif-footer"><a href="reminders.html" class="link">${escapeHtml(dict.viewAllReminders)} →</a></div>`;
    refreshIcons();
  }

  function snoozeAndRefresh(recordId, days) {
    snoozeReminder(recordId, days);
    const lang = getLanguage();
    const dict = I18N[lang] || I18N.en;
    showToast(dict.snoozeSuccess.replace("{days}", days || 7), "success");
    renderNotifications();
    if (global.RemindersPage && typeof global.RemindersPage.render === "function") {
      global.RemindersPage.render();
    }
    if (global.RecordsPage && typeof global.RecordsPage.render === "function") {
      global.RecordsPage.render();
    }
  }

  function initLogout() {
    document.querySelectorAll("[data-logout]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
      });
    });
  }

  function initGlobalSearch() {
    const input = document.getElementById("globalSearch");
    if (!input) return;
    const existingKbd = input.parentElement ? input.parentElement.querySelector(".search-kbd") : null;
    if (existingKbd) existingKbd.remove();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        global.location.href = "records.html?q=" + encodeURIComponent(input.value.trim());
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* i18n DOM translation application                                    */
  /* ------------------------------------------------------------------ */

  function applyTranslations() {
    const lang = getLanguage();
    const dict = I18N[lang] || I18N.en;

    // Sidebar navigation mapping
    const navMap = {
      "dashboard.html": dict.dashboard,
      "records.html": dict.records,
      "calendar.html": dict.calendar,
      "reminders.html": dict.reminders,
      "history.html": dict.history,
      "documents.html": dict.documents,
      "reports.html": dict.reports,
      "records.html?assigned=me": dict.assignedToMe || "Assigned to Me",
      "team.html": dict.teamMembers || "Team Members",
      "team.html#invite": dict.inviteMembers || "Invite Members",
      "audit.html": dict.auditLogs || "Audit Logs",
      "settings.html": dict.settings,
    };
    document.querySelectorAll(".sidebar-nav .nav-link").forEach((link) => {
      const href = link.getAttribute("href");
      if (navMap[href]) {
        const icon = link.querySelector(".icon");
        link.textContent = "";
        if (icon) link.appendChild(icon);
        link.appendChild(document.createTextNode(" " + navMap[href]));
      }
    });

    document.querySelectorAll(".sidebar-section-label").forEach((el) => {
      if (el.getAttribute("data-role") === "Employee" || el.textContent.toLowerCase().includes("work") || el.textContent.includes("பணி")) {
        el.textContent = dict.myWork || "My Work";
      } else if (el.getAttribute("data-role") === "Admin" || el.textContent.toLowerCase().includes("team") || el.textContent.includes("குழு")) {
        el.textContent = dict.teamManagement || "Team Management";
      } else if (el.textContent.trim().toLowerCase() === "main" || el.textContent.trim() === "முதன்மை" || (el.parentElement && el === el.parentElement.querySelector(".sidebar-section-label"))) {
        el.textContent = dict.main;
      } else {
        el.textContent = dict.account;
      }
    });

    // Topbar search placeholder
    const globalSearch = document.getElementById("globalSearch");
    if (globalSearch) globalSearch.placeholder = dict.searchPlaceholder;

    // Direct elements with data-i18n
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key]) {
        const icon = el.querySelector(".icon");
        if (icon) {
          el.innerHTML = "";
          el.appendChild(icon);
          el.appendChild(document.createTextNode(" " + dict[key]));
        } else {
          el.textContent = dict[key];
        }
      }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (dict[key]) el.placeholder = dict[key];
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (dict[key]) el.title = dict[key];
    });

    refreshIcons();
  }

  function initLanguageToggle() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions) return;
    let toggleBtn = document.getElementById("langToggleBtn");
    if (!toggleBtn) {
      toggleBtn = document.createElement("button");
      toggleBtn.id = "langToggleBtn";
      toggleBtn.className = "lang-toggle-btn";
      toggleBtn.type = "button";
      actions.insertBefore(toggleBtn, actions.firstChild);
    }
    const current = getLanguage();
    toggleBtn.innerHTML =
      current === "en"
        ? '<span class="lang-globe">🌐</span> <span class="lang-text">தமிழ்</span>'
        : '<span class="lang-globe">🌐</span> <span class="lang-text">English</span>';
    toggleBtn.title = current === "en" ? "தமிழுக்கு மாற்றுக (Switch to Tamil)" : "Switch to English";
    toggleBtn.onclick = () => {
      const next = getLanguage() === "en" ? "ta" : "en";
      setLanguage(next);
      showToast(next === "ta" ? "தமிழ் மொழி தேர்ந்தெடுக்கப்பட்டது" : "Switched to English", "info");
    };
  }

  /* ------------------------------------------------------------------ */
  /* Ctrl+K Command Palette                                              */
  /* ------------------------------------------------------------------ */

  let cmdSelectedIndex = 0;
  let cmdCurrentItems = [];

  function ensureCommandPaletteModal() {
    let modal = document.getElementById("cmdPaletteModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "cmdPaletteModal";
    modal.className = "cmd-palette-overlay";
    modal.innerHTML = `
      <div class="cmd-palette-box">
        <div class="cmd-palette-header">
          <i data-lucide="search" class="icon"></i>
          <input type="text" id="cmdPaletteInput" placeholder="Type a command, page name, or renewal…" autocomplete="off" />
          <kbd class="cmd-kbd">ESC</kbd>
        </div>
        <div class="cmd-palette-body" id="cmdPaletteResults"></div>
        <div class="cmd-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>↵</kbd> Select</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeCommandPalette();
    });

    const input = modal.querySelector("#cmdPaletteInput");
    input.addEventListener("input", () => {
      cmdSelectedIndex = 0;
      renderCommandPaletteResults(input.value);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (cmdCurrentItems.length > 0) {
          cmdSelectedIndex = (cmdSelectedIndex + 1) % cmdCurrentItems.length;
          highlightCmdItem();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (cmdCurrentItems.length > 0) {
          cmdSelectedIndex = (cmdSelectedIndex - 1 + cmdCurrentItems.length) % cmdCurrentItems.length;
          highlightCmdItem();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (cmdCurrentItems[cmdSelectedIndex]) {
          cmdCurrentItems[cmdSelectedIndex].action();
          closeCommandPalette();
        }
      } else if (e.key === "Escape") {
        closeCommandPalette();
      }
    });

    return modal;
  }

  function highlightCmdItem() {
    const list = document.getElementById("cmdPaletteResults");
    if (!list) return;
    const items = list.querySelectorAll(".cmd-item");
    items.forEach((item, idx) => {
      if (idx === cmdSelectedIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest" });
      } else {
        item.classList.remove("selected");
      }
    });
  }

  function renderCommandPaletteResults(query) {
    const container = document.getElementById("cmdPaletteResults");
    if (!container) return;
    const q = (query || "").trim().toLowerCase();
    const lang = getLanguage();
    const dict = I18N[lang] || I18N.en;

    const pages = [
      { title: dict.dashboard, sub: "Overview & key metrics", icon: "layout-dashboard", href: "dashboard.html" },
      { title: dict.records, sub: "Manage contracts, licenses & warranties", icon: "file-text", href: "records.html" },
      { title: dict.calendar, sub: "Timeline of renewal expiry dates", icon: "calendar", href: "calendar.html" },
      { title: dict.reminders, sub: "Stay ahead of deadlines", icon: "bell", href: "reminders.html" },
      { title: dict.history, sub: "Audit trail of renewals", icon: "history", href: "history.html" },
      { title: dict.documents, sub: "Contracts, files & attachments", icon: "folder", href: "documents.html" },
      { title: dict.reports, sub: "Executive spending & status summaries", icon: "bar-chart-2", href: "reports.html" },
      { title: dict.settings, sub: "Preferences, team & profile", icon: "settings", href: "settings.html" },
    ];

    const actions = [
      {
        title: dict.addNewRenewal,
        sub: "Create a new tracked renewal record",
        icon: "plus-circle",
        action: () => {
          if (global.location.pathname.includes("records.html")) {
            if (global.RecordsPage && global.RecordsPage.openAdd) global.RecordsPage.openAdd();
          } else {
            global.location.href = "records.html#add";
          }
        },
      },
      {
        title: dict.importCsv,
        sub: "Upload spreadsheet to bulk-add renewals",
        icon: "upload-cloud",
        action: () => {
          if (global.location.pathname.includes("records.html")) {
            openModal("importModal");
          } else {
            global.location.href = "records.html#import";
          }
        },
      },
      {
        title: dict.exportCalendar,
        sub: "Download .ics file for Google / Outlook / Apple Calendar",
        icon: "calendar",
        action: () => {
          exportICS("all-renewals.ics", getRenewals());
          showToast("Exported renewals calendar (.ics)", "success");
        },
      },
      {
        title: lang === "en" ? "Switch to தமிழ் (Tamil)" : "Switch to English",
        sub: "Toggle bilingual interface",
        icon: "globe",
        action: () => {
          setLanguage(lang === "en" ? "ta" : "en");
        },
      },
    ];

    const renewals = getRenewals();
    const matchingRenewals = renewals.filter((r) => {
      if (!q) return false;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.organization || "").toLowerCase().includes(q) ||
        (r.category || "").toLowerCase().includes(q) ||
        (r.code || "").toLowerCase().includes(q) ||
        (r.referenceNumber || "").toLowerCase().includes(q)
      );
    });

    const matchingPages = pages.filter((p) => !q || p.title.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q));
    const matchingActions = actions.filter((a) => !q || a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q));

    cmdCurrentItems = [];
    let html = "";

    if (matchingRenewals.length > 0) {
      html += `<div class="cmd-section-title">${escapeHtml(dict.cmdRenewals)} (${matchingRenewals.length})</div>`;
      matchingRenewals.slice(0, 6).forEach((r) => {
        const idx = cmdCurrentItems.length;
        cmdCurrentItems.push({
          action: () => { global.location.href = `details.html?id=${r.id}`; },
        });
        const status = computeStatus(r);
        html += `
          <div class="cmd-item" data-index="${idx}" onclick="cmdCurrentItems[${idx}].action()">
            <div class="cmd-item-icon"><i data-lucide="file-check" class="icon"></i></div>
            <div class="cmd-item-text">
              <div class="cmd-item-title">${escapeHtml(r.name)} <span class="cmd-code">${r.code}</span></div>
              <div class="cmd-item-sub">${escapeHtml(r.category)} • ${escapeHtml(r.organization || "—")} • Expires ${formatDate(r.expiryDate)}</div>
            </div>
            <div class="cmd-item-badge">${statusBadgeHtml(status)}</div>
          </div>
        `;
      });
    }

    if (matchingActions.length > 0) {
      html += `<div class="cmd-section-title">${escapeHtml(dict.cmdActions)}</div>`;
      matchingActions.forEach((a) => {
        const idx = cmdCurrentItems.length;
        cmdCurrentItems.push({ action: a.action });
        html += `
          <div class="cmd-item" data-index="${idx}" onclick="cmdCurrentItems[${idx}].action()">
            <div class="cmd-item-icon"><i data-lucide="${a.icon}" class="icon"></i></div>
            <div class="cmd-item-text">
              <div class="cmd-item-title">${escapeHtml(a.title)}</div>
              <div class="cmd-item-sub">${escapeHtml(a.sub)}</div>
            </div>
          </div>
        `;
      });
    }

    if (matchingPages.length > 0) {
      html += `<div class="cmd-section-title">${escapeHtml(dict.cmdPages)}</div>`;
      matchingPages.forEach((p) => {
        const idx = cmdCurrentItems.length;
        cmdCurrentItems.push({ action: () => { global.location.href = p.href; } });
        html += `
          <div class="cmd-item" data-index="${idx}" onclick="cmdCurrentItems[${idx}].action()">
            <div class="cmd-item-icon"><i data-lucide="${p.icon}" class="icon"></i></div>
            <div class="cmd-item-text">
              <div class="cmd-item-title">${escapeHtml(p.title)}</div>
              <div class="cmd-item-sub">${escapeHtml(p.sub)}</div>
            </div>
          </div>
        `;
      });
    }

    if (cmdCurrentItems.length === 0) {
      html = `<div class="cmd-empty">${escapeHtml(dict.cmdNoResults)}</div>`;
    }

    container.innerHTML = html;
    highlightCmdItem();
    refreshIcons();
  }

  function openCommandPalette() {
    const modal = ensureCommandPaletteModal();
    modal.classList.add("open");
    const input = modal.querySelector("#cmdPaletteInput");
    input.value = "";
    cmdSelectedIndex = 0;
    renderCommandPaletteResults("");
    setTimeout(() => input.focus(), 60);
  }

  function closeCommandPalette() {
    const modal = document.getElementById("cmdPaletteModal");
    if (modal) modal.classList.remove("open");
  }

  function initGlobalKeyboardShortcuts() {
    // Ctrl+K removed
  }

  /* ------------------------------------------------------------------ */
  /* iCalendar (.ics) Export                                             */
  /* ------------------------------------------------------------------ */

  function exportICS(filename, records) {
    if (!records || !records.length) {
      showToast("No records available to export.", "warning");
      return;
    }
    const pad = (n) => String(n).padStart(2, "0");
    const formatCalDate = (iso) => (iso ? iso.replace(/-/g, "") : "");

    const now = new Date();
    const stamp =
      now.getUTCFullYear() +
      pad(now.getUTCMonth() + 1) +
      pad(now.getUTCDate()) +
      "T" +
      pad(now.getUTCHours()) +
      pad(now.getUTCMinutes()) +
      pad(now.getUTCSeconds()) +
      "Z";

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//RenewalTrack//Renewal Tracking System//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:RenewalTrack Expirations",
    ];

    records.forEach((r) => {
      const dt = formatCalDate(r.expiryDate);
      if (!dt) return;
      const nextDay = formatCalDate(addDays(r.expiryDate, 1));
      const summary = `Renewal Due: ${r.name}`;
      const desc = `Category: ${r.category}\\nOrganization: ${r.organization || "—"}\\nCost: ${r.currency || "USD"} ${r.cost || 0}\\nPriority: ${r.priority || "Medium"}\\nCycle: ${r.recurringCycle || "Yearly"}\\nRecord ID: ${r.code}`;

      lines.push(
        "BEGIN:VEVENT",
        `UID:${r.id || uid("cal")}@renewaltrack.com`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dt}`,
        `DTEND;VALUE=DATE:${nextDay}`,
        `SUMMARY:${summary.replace(/,/g, "\\,").replace(/;/g, "\\;")}`,
        `DESCRIPTION:${desc.replace(/,/g, "\\,").replace(/;/g, "\\;")}`,
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-P7D",
        `DESCRIPTION:Reminder: ${r.name} expires in 7 days`,
        "END:VALARM",
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "renewals-calendar.ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ------------------------------------------------------------------ */
  /* CSV Import & Template Helpers                                       */
  /* ------------------------------------------------------------------ */

  function normalizeDate(val) {
    if (!val && val !== 0) return "";
    if (val instanceof Date && !isNaN(val.getTime())) {
      try {
        return val.toISOString().slice(0, 10);
      } catch (e) {
        return "";
      }
    }
    // Handle Excel serial date numbers (e.g. 45678)
    if (typeof val === "number" || (!isNaN(val) && Number(val) > 20000 && Number(val) < 70000)) {
      const n = Number(val);
      const d = new Date(Math.round((n - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    let s = String(val).trim();
    if (!s) return "";

    // ISO format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // YYYY/MM/DD or YYYY.MM.DD
    if (/^\d{4}[\/\.]\d{1,2}[\/\.]\d{1,2}$/.test(s)) {
      const p = s.split(/[\/\.]/);
      return `${p[0]}-${p[1].padStart(2, "0")}-${p[2].padStart(2, "0")}`;
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy) {
      const p1 = parseInt(dmy[1], 10);
      const p2 = parseInt(dmy[2], 10);
      const y = dmy[3];
      if (p1 > 12) {
        return `${y}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
      }
      if (p2 > 12) {
        return `${y}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
      }
      return `${y}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
    }

    // Standard date parsing
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      try {
        const yr = parsed.getFullYear();
        if (yr >= 1990 && yr <= 2100) {
          const m = String(parsed.getMonth() + 1).padStart(2, "0");
          const d = String(parsed.getDate()).padStart(2, "0");
          return `${yr}-${m}-${d}`;
        }
      } catch (e) {}
    }

    return "";
  }

  function mapRowToRecord(vals, headers) {
    if (!vals || !headers) return null;
    const obj = {};
    let foundDate = "";
    let firstNonEmptyText = "";

    headers.forEach((h, idx) => {
      const rawVal = vals[idx] !== undefined && vals[idx] !== null ? String(vals[idx]).trim() : "";
      if (!firstNonEmptyText && rawVal && isNaN(rawVal) && rawVal.length > 1) {
        firstNonEmptyText = rawVal;
      }
      // Check if value itself looks like a date
      if (!foundDate && rawVal && (/\d{4}[\-\/\.]\d{1,2}[\-\/\.]\d{1,2}/.test(rawVal) || /\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{4}/.test(rawVal))) {
        foundDate = normalizeDate(rawVal);
      }

      // 1. Record Name / Title / Item
      if (
        h.includes("name") ||
        h.includes("title") ||
        h.includes("record") ||
        h.includes("service") ||
        h.includes("item") ||
        h.includes("software") ||
        h.includes("contract") ||
        h.includes("license") ||
        h.includes("certificate") ||
        h.includes("subscription") ||
        h.includes("domain") ||
        h.includes("asset") ||
        h.includes("product") ||
        h.includes("description") ||
        h === "desc"
      ) {
        if (!obj.name && rawVal) obj.name = rawVal;
      }
      // 2. Expiry / Due / Renewal Date
      else if (
        h.includes("exp") ||
        h.includes("due") ||
        h.includes("renew") ||
        h.includes("end") ||
        h.includes("valid") ||
        h.includes("deadline") ||
        h.includes("finish") ||
        h.includes("until") ||
        h.includes("maturity") ||
        h === "date"
      ) {
        if (!obj.expiryDate) obj.expiryDate = normalizeDate(rawVal);
      }
      // 3. Category / Type
      else if (h.includes("cat") || h.includes("type") || h.includes("kind") || h.includes("group") || h.includes("class") || h.includes("dept") || h.includes("sector")) {
        if (!obj.category && rawVal) obj.category = rawVal;
      }
      // 4. Provider / Organization / Vendor
      else if (
        h.includes("org") ||
        h.includes("prov") ||
        h.includes("vendor") ||
        h.includes("company") ||
        h.includes("issuer") ||
        h.includes("supplier") ||
        h.includes("partner") ||
        h.includes("source") ||
        h.includes("client") ||
        h.includes("account") ||
        h.includes("brand")
      ) {
        if (!obj.organization && rawVal) obj.organization = rawVal;
      }
      // 5. Cost / Amount
      else if (
        h.includes("cost") ||
        h.includes("price") ||
        h.includes("amount") ||
        h.includes("fee") ||
        h.includes("charge") ||
        h.includes("rate") ||
        h.includes("val") ||
        h.includes("sum") ||
        h.includes("total") ||
        h.includes("bill")
      ) {
        const cleaned = rawVal.replace(/[^\d.]/g, "");
        obj.cost = parseFloat(cleaned) || 0;
        if (rawVal.includes("₹")) obj.currency = "INR";
        else if (rawVal.includes("€")) obj.currency = "EUR";
        else if (rawVal.includes("£")) obj.currency = "GBP";
      }
      // 6. Currency
      else if (h.includes("curr")) {
        if (rawVal) obj.currency = rawVal.toUpperCase();
      }
      // 7. Priority
      else if (h.includes("prior") || h.includes("urg") || h.includes("level") || h.includes("prio")) {
        if (rawVal) obj.priority = rawVal;
      }
      // 8. Responsible Person
      else if (h.includes("resp") || h.includes("owner") || h.includes("person") || h.includes("assign") || h.includes("user") || h.includes("manager") || h.includes("lead")) {
        if (rawVal) obj.responsiblePerson = rawVal;
      }
      // 9. Recurring Cycle
      else if (h.includes("cycle") || h.includes("recur") || h.includes("freq") || h.includes("period") || h.includes("interval")) {
        if (rawVal) obj.recurringCycle = rawVal;
      }
      // 10. Issue / Start Date
      else if (h.includes("issue") || h.includes("start") || h.includes("begin") || h.includes("create") || h.includes("from")) {
        if (!obj.issueDate) obj.issueDate = normalizeDate(rawVal);
      }
      // 11. Reminder Date
      else if (h.includes("remind") || h.includes("alert") || h.includes("notify")) {
        if (!obj.reminderDate) obj.reminderDate = normalizeDate(rawVal);
      }
      // 12. Reference Number
      else if (h.includes("ref") || h.includes("serial") || h.includes("code") || h.includes("policy") || h.includes("invoice") || h.includes("id")) {
        if (!obj.referenceNumber && rawVal) obj.referenceNumber = rawVal;
      }
      // 13. Notes
      else if (h.includes("note") || h.includes("comment") || h.includes("remark") || h.includes("info")) {
        if (!obj.notes && rawVal) obj.notes = rawVal;
      }
    });

    // Fallbacks
    if (!obj.name) {
      obj.name = firstNonEmptyText || (vals[0] ? String(vals[0]).trim() : "");
    }
    if (!obj.name || obj.name.trim() === "") return null;

    if (!obj.expiryDate) {
      obj.expiryDate = foundDate || addDays(todayISO(), 365);
    }

    // Category mapping
    const catMatch = CATEGORIES.find((c) => c.toLowerCase() === (obj.category || "").toLowerCase());
    obj.category = catMatch || (obj.category && obj.category.trim() ? obj.category.trim() : "Contract");

    // Priority mapping
    const prioLower = (obj.priority || "").toLowerCase();
    if (prioLower.includes("high") || prioLower.includes("crit")) obj.priority = "High";
    else if (prioLower.includes("low")) obj.priority = "Low";
    else obj.priority = "Medium";

    // Cycle mapping
    const cycleLower = (obj.recurringCycle || "").toLowerCase();
    if (cycleLower.includes("month")) obj.recurringCycle = "Monthly";
    else if (cycleLower.includes("quart")) obj.recurringCycle = "Quarterly";
    else if (cycleLower.includes("one") || cycleLower.includes("none")) obj.recurringCycle = "One-time";
    else obj.recurringCycle = "Yearly";

    if (!obj.currency || !CURRENCIES.includes(obj.currency)) obj.currency = "USD";
    if (obj.cost === undefined) obj.cost = 0;
    if (!obj.issueDate) obj.issueDate = todayISO();
    if (!obj.reminderDate) obj.reminderDate = addDays(obj.expiryDate, -14);

    return obj;
  }

  function parseCSVText(csvText) {
    if (!csvText || typeof csvText !== "string") return [];
    csvText = csvText.replace(/^\uFEFF/, "");

    const firstLine = csvText.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const pipeCount = (firstLine.match(/\|/g) || []).length;

    let delim = ",";
    if (semiCount > commaCount && semiCount > tabCount) delim = ";";
    else if (tabCount > commaCount && tabCount > semiCount) delim = "\t";
    else if (pipeCount > commaCount && pipeCount > semiCount) delim = "|";

    const lines = [];
    let row = [];
    let inQuotes = false;
    let cur = "";

    for (let i = 0; i < csvText.length; i++) {
      const c = csvText[i];
      const next = csvText[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delim && !inQuotes) {
        row.push(cur.trim());
        cur = "";
      } else if ((c === "\r" || c === "\n") && !inQuotes) {
        if (c === "\r" && next === "\n") i++;
        row.push(cur.trim());
        cur = "";
        if (row.some((cell) => cell.length > 0)) lines.push(row);
        row = [];
      } else {
        cur += c;
      }
    }
    if (cur.length > 0 || row.length > 0) {
      row.push(cur.trim());
      if (row.some((cell) => cell.length > 0)) lines.push(row);
    }
    if (lines.length < 2) return [];

    const headers = lines[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const records = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i];
      const rec = mapRowToRecord(vals, headers);
      if (rec) records.push(rec);
    }
    return records;
  }

  function parseSheetRows(sheetRows) {
    if (!Array.isArray(sheetRows) || !sheetRows.length) return [];
    const records = [];
    sheetRows.forEach((rowObj) => {
      if (typeof rowObj !== "object" || !rowObj) return;
      const keys = Object.keys(rowObj);
      const headers = keys.map((k) => k.toLowerCase().replace(/[^a-z0-9]/g, ""));
      const vals = keys.map((k) => rowObj[k]);
      const rec = mapRowToRecord(vals, headers);
      if (rec) records.push(rec);
    });
    return records;
  }

  function importRecords(recordsArray) {
    if (!recordsArray || !recordsArray.length) return 0;
    const currentList = getRenewals();
    let nextIdx = currentList.length + 1;
    const newRecords = recordsArray.map((data) => {
      const rec = Object.assign(
        {
          id: uid("ren"),
          code: recordCode(nextIdx++),
          documents: [],
          history: [],
          reminderCompleted: false,
          lastRenewedAt: null,
          createdAt: new Date().toISOString(),
        },
        data
      );
      return rec;
    });
    const combined = [...newRecords, ...currentList];
    saveRenewals(combined);

    newRecords.forEach((r) => {
      syncRenewalToBackend("POST", "/api/renewals", r);
    });

    try {
      window.dispatchEvent(new CustomEvent("rts-renewal-updated", { detail: { count: newRecords.length } }));
    } catch (e) {}

    return newRecords.length;
  }

  function downloadCSVTemplate() {
    const T = todayISO();
    const template =
      `Record Name,Category,Organization,Expiry Date,Issue Date,Renewal Cost,Currency,Priority,Responsible Person,Reference Number,Recurring Cycle,Notes\n` +
      `"Google Workspace Business Plus","License","Google LLC","${addDays(T, 45)}","${addDays(T, -320)}",2160,"USD","High","David Kim","GSUITE-2024","Yearly","Annual renewal for 15 seats"\n` +
      `"Office Building HVAC Maintenance","Contract","Apex Cooling Ltd","${addDays(T, 120)}","${addDays(T, -240)}",4500,"USD","Medium","Anita Sharma","SRV-MNT-99","Yearly","Quarterly HVAC inspection included"\n` +
      `"Slack Enterprise Grid","Subscription","Salesforce Inc","${addDays(T, 15)}","${addDays(T, -350)}",12000,"USD","High","Wei Zhang","SLK-2026","Monthly","Tier 1 messaging subscription"`;
    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "RenewalTrack_Template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /* ------------------------------------------------------------------ */
  /* CSV export                                                           */
  /* ------------------------------------------------------------------ */

  function exportCSV(filename, rows, columns) {
    const header = columns.map((c) => '"' + c.label.replace(/"/g, '""') + '"').join(",");
    const lines = rows.map((row) =>
      columns
        .map((c) => {
          const val = typeof c.value === "function" ? c.value(row) : row[c.value];
          return '"' + String(val === undefined || val === null ? "" : val).replace(/"/g, '""') + '"';
        })
        .join(",")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function ensureSeed() {
    seedAccount();
    // One-time automatic reset to clear default mock/sample data (certificates, licenses, etc.)
    const DATA_RESET_KEY = 'rts_default_data_cleared_v1';
    if (localStorage.getItem(DATA_RESET_KEY) !== 'true') {
      saveRenewals([]);
      syncRenewalToBackend('DELETE', '/api/renewals');
      localStorage.setItem(DATA_RESET_KEY, 'true');
    } else {
      seedData();
    }
  }

  async function syncCurrentUserFromBackend() {
    const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem(STORAGE_KEYS.AUTH);
    if (!token) return;
    try {
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: "Bearer " + token },
      });
      if (res.status === 401 || res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data.error && data.error.includes("deactivated")) {
          showToast(data.error, "error");
          logout();
          return;
        }
      }
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.user) {
          const current = getCurrentUser();
          const roleChanged = current.role !== data.user.role;
          const updated = Object.assign({}, current, data.user);
          writeJSON(STORAGE_KEYS.USER, updated);
          if (roleChanged) {
            renderRoleSidebar();
            renderTopbarUser();
            applyTranslations();
            if (updated.role === "Viewer") {
              applyViewerRestrictions();
            }
          }
        }
      }
    } catch (e) {
      // Backend offline or file:/// mode fallback
    }
  }

  function initLayout() {
    ensureSeed();
    applyTheme(getSettings().theme);
    renderRoleSidebar();
    initMobileSidebar();
    initDropdowns();
    initModalDismiss();
    renderTopbarUser();
    renderNotifications();
    initLogout();
    initGlobalSearch();
    initLanguageToggle();
    applyTranslations();
    refreshIcons();
    syncCurrentUserFromBackend();
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                           */
  /* ------------------------------------------------------------------ */

  global.RTS = {
    KEYS: STORAGE_KEYS,
    CATEGORIES,
    PRIORITIES,
    CURRENCIES,
    RECURRING_CYCLES,
    uid,
    todayISO,
    addDays,
    daysBetween,
    daysRemaining,
    formatDate,
    formatMonthYear,
    formatCurrency,
    escapeHtml,
    debounce,
    refreshIcons,
    computeStatus,
    statusLabel,
    statusBadgeHtml,
    priorityBadgeHtml,
    calculateNextExpiry,
    cycleLabel,
    i18n: {
      getLanguage,
      setLanguage,
      t,
      applyTranslations,
      dict: I18N,
    },
    data: {
      getRenewals,
      saveRenewals,
      getRenewalById,
      addRenewal,
      updateRenewal,
      deleteRenewal,
      markAsRenewed,
      snoozeReminder,
      bulkRenew,
      bulkDelete,
      addDocumentToRenewal,
      deleteDocumentFromRenewal,
      toggleReminderCompleted,
      getAllDocuments,
      getAllHistory,
      clearAllRenewals,
    },
    auth: {
      login,
      logout,
      isLoggedIn,
      getCurrentUser,
      setCurrentUser,
      requireAuth,
      requireAdmin,
      isAdmin,
      isEmployee,
      isViewer,
      isPrimaryAdmin,
      applyViewerRestrictions,
      canEditRenewal,
      canDeleteRenewal,
      redirectIfAuthed,
      registerAccount,
      getAccounts,
      changePassword,
    },
    team: {
      async getMembers() {
        const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem(STORAGE_KEYS.AUTH);
        const res = await fetch(apiUrl("/api/team/members"), {
          headers: {
            Authorization: "Bearer " + token,
            "x-user-role": getCurrentUser().role,
            "x-user-email": getCurrentUser().email,
          },
        });
        return res.json();
      },
      async updateRole(userId, role) {
        const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem(STORAGE_KEYS.AUTH);
        const res = await fetch(apiUrl("/api/team/members/" + encodeURIComponent(userId) + "/role"), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
            "x-user-role": getCurrentUser().role,
            "x-user-email": getCurrentUser().email,
          },
          body: JSON.stringify({ role }),
        });
        return res.json();
      },
      async updateStatus(userId, status) {
        const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem(STORAGE_KEYS.AUTH);
        const res = await fetch(apiUrl("/api/team/members/" + encodeURIComponent(userId) + "/status"), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
            "x-user-role": getCurrentUser().role,
            "x-user-email": getCurrentUser().email,
          },
          body: JSON.stringify({ status }),
        });
        return res.json();
      },
      async sendInvite({ email, fullName, role }) {
        const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem(STORAGE_KEYS.AUTH);
        const res = await fetch(apiUrl("/api/team/invites"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
            "x-user-role": getCurrentUser().role,
            "x-user-email": getCurrentUser().email,
          },
          body: JSON.stringify({ email, fullName, role }),
        });
        return res.json();
      },
      async getInvites() {
        const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem(STORAGE_KEYS.AUTH);
        const res = await fetch(apiUrl("/api/team/invites"), {
          headers: {
            Authorization: "Bearer " + token,
            "x-user-role": getCurrentUser().role,
            "x-user-email": getCurrentUser().email,
          },
        });
        return res.json();
      },
      async revokeInvite(id) {
        const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem(STORAGE_KEYS.AUTH);
        const res = await fetch(apiUrl("/api/team/invites/" + encodeURIComponent(id)), {
          method: "DELETE",
          headers: {
            Authorization: "Bearer " + token,
            "x-user-role": getCurrentUser().role,
            "x-user-email": getCurrentUser().email,
          },
        });
        return res.json();
      },
    },
    audit: {
      async getLogs(params = {}) {
        const token = localStorage.getItem("rts_jwt_token") || localStorage.getItem(STORAGE_KEYS.AUTH);
        const qs = new URLSearchParams(params).toString();
        try {
          const res = await fetch(apiUrl("/api/audit/logs" + (qs ? "?" + qs : "")), {
            headers: {
              Authorization: "Bearer " + token,
              "x-user-role": getCurrentUser().role,
              "x-user-email": getCurrentUser().email,
            },
          });
          const data = await res.json();
          if (data && data.ok) {
            const list = data.logs || data.data || [];
            return { ok: true, logs: list, data: list };
          }
          return data;
        } catch (e) {
          return { ok: true, logs: [], data: [] };
        }
      },
    },
    settings: {
      getSettings,
      setSettings,
      applyTheme,
    },
    reminders: {
      async triggerCheck(force) {
        const res = await fetch(apiUrl("/api/reminders/trigger"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        });
        return res.json();
      },
      async sendTestEmail(targetEmail) {
        const res = await fetch(apiUrl("/api/reminders/test-email"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetEmail }),
        });
        return res.json();
      },
      async getLogs(limit) {
        const res = await fetch(apiUrl("/api/reminders/logs?limit=" + (limit || 50)));
        return res.json();
      },
      async getStatus() {
        const res = await fetch(apiUrl("/api/reminders/status"));
        return res.json();
      },
    },
    apiUrl,
    toast: showToast,
    modal: { open: openModal, close: closeModal },
    initLayout,
    ensureSeed,
    renderRoleSidebar,
    exportCSV,
    exportICS,
    parseCSVText,
    parseSheetRows,
    normalizeDate,
    mapRowToRecord,
    importRecords,
    downloadCSVTemplate,
    openCommandPalette,
    closeCommandPalette,
    snoozeAndRefresh,
  };
})(window);
