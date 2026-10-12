/* ==========================================================================
   backend/db.js — Unified Data Access Layer (Supabase PostgreSQL + Fallback)
   Handles renewals, reminder logs, duplicate prevention, and settings.
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const { supabase, isConfigured } = require("./supabaseClient");
const config = require("./config");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOCAL_STORE_FILE = path.join(DATA_DIR, "store.json");

// Helper for dates relative to today
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Generate realistic seeded records relative to today
function getInitialSeedRenewals() {
  const T = todayISO();
  return [
    {
      id: "ren-ms365",
      code: "REN-001",
      name: "Microsoft 365 Enterprise License",
      category: "License",
      organization: "Microsoft Corporation",
      description: "Enterprise-wide productivity suite licensing covering 250 seats.",
      referenceNumber: "MS-E3-2024-118",
      issueDate: addDays(T, -345),
      expiryDate: addDays(T, 30), // 30 days away (triggers 30-day reminder)
      cost: 18500,
      currency: "USD",
      reminderDate: addDays(T, 16),
      priority: "High",
      responsiblePerson: "Anita Sharma",
      responsibleEmail: "demo@renewaltrack.com",
      recurringCycle: "Yearly",
      notes: "Renew before new fiscal year pricing takes effect.",
      reminderCompleted: false,
    },
    {
      id: "ren-lease-ho",
      code: "REN-002",
      name: "Head Office Lease Agreement",
      category: "Contract",
      organization: "Meridian Realty Group",
      description: "Commercial lease for the downtown head office, floors 4–6.",
      referenceNumber: "LEASE-HO-2023-04",
      issueDate: addDays(T, -125),
      expiryDate: addDays(T, 15), // 15 days away (triggers 15-day reminder)
      cost: 96000,
      currency: "USD",
      reminderDate: addDays(T, 1),
      priority: "Medium",
      responsiblePerson: "David Kim",
      responsibleEmail: "david.kim@renewaltrack.com",
      recurringCycle: "3-Year",
      notes: "Landlord open to a 3-year extension at 4% escalation.",
      reminderCompleted: false,
    },
    {
      id: "ren-fire-safety",
      code: "REN-003",
      name: "Fire Safety Operating Permit",
      category: "Regulatory Permit",
      organization: "City Fire Department",
      description: "Annual fire safety compliance permit for the main warehouse.",
      referenceNumber: "FSP-2025-3391",
      issueDate: addDays(T, -360),
      expiryDate: addDays(T, 7), // 7 days away (triggers 7-day urgent reminder)
      cost: 450,
      currency: "USD",
      reminderDate: addDays(T, -7),
      priority: "High",
      responsiblePerson: "Marcus Chen",
      responsibleEmail: "demo@renewaltrack.com",
      recurringCycle: "Yearly",
      notes: "Inspection scheduled prior to renewal submission.",
      reminderCompleted: false,
    },
    {
      id: "ren-iso27001",
      code: "REN-004",
      name: "ISO 27001 Information Security Certification",
      category: "Certification",
      organization: "BSI Group",
      description: "Information security management system certification.",
      referenceNumber: "ISO27001-8821",
      issueDate: addDays(T, -380),
      expiryDate: T, // 0 days away / Expiry Date (triggers expiry date reminder)
      cost: 7200,
      currency: "USD",
      reminderDate: addDays(T, -14),
      priority: "High",
      responsiblePerson: "Priya Nair",
      responsibleEmail: "priya.nair@renewaltrack.com",
      recurringCycle: "Yearly",
      notes: "Surveillance audit report pending from auditor.",
      reminderCompleted: false,
    },
    {
      id: "ren-fleet-ins",
      code: "REN-005",
      name: "Fleet Vehicle Insurance Policy",
      category: "Insurance",
      organization: "Allied Mutual Insurance",
      description: "Comprehensive liability and collision cover for 18 service vehicles.",
      referenceNumber: "POL-FLT-2024-99",
      issueDate: addDays(T, -300),
      expiryDate: addDays(T, 65),
      cost: 14200,
      currency: "USD",
      reminderDate: addDays(T, 35),
      priority: "Medium",
      responsiblePerson: "David Kim",
      responsibleEmail: "david.kim@renewaltrack.com",
      recurringCycle: "Yearly",
      notes: "Clean claims history this cycle — request 5% no-claim discount.",
      reminderCompleted: false,
    },
    {
      id: "ren-aws-sub",
      code: "REN-006",
      name: "AWS Cloud Infrastructure Enterprise Support",
      category: "Subscription",
      organization: "Amazon Web Services",
      description: "Business Support tier for production VPCs and hosting.",
      referenceNumber: "AWS-ENT-8842",
      issueDate: addDays(T, -180),
      expiryDate: addDays(T, 185),
      cost: 36000,
      currency: "USD",
      reminderDate: addDays(T, 155),
      priority: "Low",
      responsiblePerson: "Wei Zhang",
      responsibleEmail: "wei.zhang@renewaltrack.com",
      recurringCycle: "Yearly",
      notes: "Review Reserved Instances utilization before renewal.",
      reminderCompleted: false,
    },
  ];
}

// Local store helpers
function getLocalStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const raw = fs.readFileSync(LOCAL_STORE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[Local Store Read Error] ${err.message}`);
  }

  // Initial store shape
  const initial = {
    renewals: getInitialSeedRenewals(),
    reminder_logs: [],
    settings: {
      emailNotificationsEnabled: true,
      reminderDays: [30, 15, 7, 0],
      cronSchedule: config.CRON_SCHEDULE,
      defaultRecipientEmail: config.ALERT_FALLBACK_EMAIL,
      sendOnExpiryDay: true,
      emailProvider: config.EMAIL_PROVIDER,
      updatedAt: new Date().toISOString(),
    },
    users: [
      { id: "usr-1", fullName: "Anita Sharma", email: "demo@renewaltrack.com", role: "Admin" },
      { id: "usr-2", fullName: "David Kim", email: "david.kim@renewaltrack.com", role: "Editor" },
      { id: "usr-3", fullName: "Priya Nair", email: "priya.nair@renewaltrack.com", role: "Viewer" },
      { id: "usr-4", fullName: "Wei Zhang", email: "wei.zhang@renewaltrack.com", role: "Editor" },
      { id: "usr-5", fullName: "Marcus Chen", email: "demo@renewaltrack.com", role: "Editor" },
    ],
  };

  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(initial, null, 2), "utf-8");
  } catch (e) {
    console.error(`[Local Store Init Error] ${e.message}`);
  }
  return initial;
}

function saveLocalStore(store) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error(`[Local Store Write Error] ${err.message}`);
  }
}

// Convert camelCase to snake_case for Supabase
function toSnakeCase(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    out[snakeKey] = v;
  }
  return out;
}

// Convert snake_case to camelCase from Supabase
function toCamelCase(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const camelKey = k.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    out[camelKey] = v;
  }
  return out;
}

/* ==========================================================================
   Public Database API
   ========================================================================== */

const db = {
  // Check whether we are using live Supabase or local fallback
  isLiveSupabase: () => isConfigured(),

  // 1. Get all renewals
  async getRenewals() {
    if (isConfigured()) {
      try {
        const { data, error } = await supabase
          .from("renewals")
          .select("*")
          .order("expiry_date", { ascending: true });

        if (error) {
          console.error(`[Supabase renewals error] ${error.message}. Falling back to local store.`);
        } else if (data && data.length > 0) {
          return data.map(toCamelCase);
        } else {
          // If Supabase table is empty, seed it with initial records
          console.log("[Supabase] renewals table is empty. Seeding initial records...");
          const seeds = getInitialSeedRenewals().map(toSnakeCase);
          const { error: seedError } = await supabase.from("renewals").insert(seeds);
          if (!seedError) {
            return getInitialSeedRenewals();
          }
        }
      } catch (err) {
        console.error(`[Supabase error] ${err.message}`);
      }
    }
    const store = getLocalStore();
    return store.renewals || [];
  },

  // 2. Get renewal by ID
  async getRenewalById(id) {
    if (isConfigured()) {
      try {
        const { data, error } = await supabase
          .from("renewals")
          .select("*")
          .eq("id", id)
          .single();
        if (!error && data) return toCamelCase(data);
      } catch (e) {
        console.error(`[Supabase getRenewalById error] ${e.message}`);
      }
    }
    const store = getLocalStore();
    return (store.renewals || []).find((r) => r.id === id) || null;
  },

  // 3. Save / Upsert renewal
  async saveRenewal(renewalData) {
    const id = renewalData.id || `ren-${Date.now()}`;
    const record = { ...renewalData, id };

    if (isConfigured()) {
      try {
        const snakeRecord = toSnakeCase(record);
        const { data, error } = await supabase
          .from("renewals")
          .upsert(snakeRecord, { onConflict: "id" })
          .select()
          .single();
        if (!error && data) return toCamelCase(data);
      } catch (e) {
        console.error(`[Supabase saveRenewal error] ${e.message}`);
      }
    }

    const store = getLocalStore();
    const idx = (store.renewals || []).findIndex((r) => r.id === id);
    if (idx >= 0) {
      store.renewals[idx] = { ...store.renewals[idx], ...record };
    } else {
      store.renewals.unshift(record);
    }
    saveLocalStore(store);
    return record;
  },

  // 4. Delete renewal
  async deleteRenewal(id) {
    if (isConfigured()) {
      try {
        await supabase.from("renewals").delete().eq("id", id);
      } catch (e) {
        console.error(`[Supabase deleteRenewal error] ${e.message}`);
      }
    }
    const store = getLocalStore();
    store.renewals = (store.renewals || []).filter((r) => r.id !== id);
    saveLocalStore(store);
    return true;
  },

  // 5. Check if a reminder has ALREADY been successfully sent for this renewal, interval & expiry date
  // CRITICAL REQUIREMENT 6: Prevent duplicate emails for the same renewal and reminder interval
  async hasReminderBeenSent(renewalId, interval, expiryDate) {
    if (isConfigured()) {
      try {
        const { data, error } = await supabase
          .from("reminder_logs")
          .select("id, status, sent_at")
          .eq("renewal_id", renewalId)
          .eq("reminder_interval", interval)
          .eq("expiry_date", expiryDate)
          .in("status", ["sent", "simulated"]);

        if (!error && data && data.length > 0) {
          return true;
        }
      } catch (err) {
        console.error(`[Supabase hasReminderBeenSent error] ${err.message}`);
      }
    }

    // Local fallback check
    const store = getLocalStore();
    const existing = (store.reminder_logs || []).find(
      (log) =>
        log.renewal_id === renewalId &&
        log.reminder_interval === interval &&
        log.expiry_date === expiryDate &&
        ["sent", "simulated"].includes(log.status)
    );
    return !!existing;
  },

  // 6. Record sent or attempted reminder log in Supabase
  async recordReminderLog(logEntry) {
    const entry = {
      id: logEntry.id || `log-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      renewal_id: logEntry.renewalId || logEntry.renewal_id,
      renewal_name: logEntry.renewalName || logEntry.renewal_name,
      reminder_interval: logEntry.reminderInterval || logEntry.reminder_interval,
      recipient_email: logEntry.recipientEmail || logEntry.recipient_email,
      recipient_name: logEntry.recipientName || logEntry.recipient_name || "",
      expiry_date: logEntry.expiryDate || logEntry.expiry_date,
      days_remaining: logEntry.daysRemaining !== undefined ? logEntry.daysRemaining : logEntry.days_remaining,
      status: logEntry.status, // 'sent', 'simulated', 'failed', 'skipped'
      delivery_provider: logEntry.deliveryProvider || logEntry.delivery_provider || config.EMAIL_PROVIDER,
      message_id: logEntry.messageId || logEntry.message_id || null,
      error_message: logEntry.errorMessage || logEntry.error_message || null,
      sent_at: logEntry.sentAt || new Date().toISOString(),
    };

    if (isConfigured()) {
      try {
        const { error } = await supabase.from("reminder_logs").insert([entry]);
        if (error) {
          console.error(`[Supabase recordReminderLog error] ${error.message}`);
        }
      } catch (e) {
        console.error(`[Supabase insert log error] ${e.message}`);
      }
    }

    // Always keep local store updated as well
    const store = getLocalStore();
    store.reminder_logs = [entry, ...(store.reminder_logs || [])].slice(0, 500); // keep last 500 logs
    saveLocalStore(store);
    return entry;
  },

  // 7. Get reminder logs history
  async getReminderLogs(limit = 100) {
    if (isConfigured()) {
      try {
        const { data, error } = await supabase
          .from("reminder_logs")
          .select("*")
          .order("sent_at", { ascending: false })
          .limit(limit);
        if (!error && data) return data;
      } catch (e) {
        console.error(`[Supabase getReminderLogs error] ${e.message}`);
      }
    }
    const store = getLocalStore();
    return (store.reminder_logs || []).slice(0, limit);
  },

  // 8. Get notification settings
  async getNotificationSettings() {
    if (isConfigured()) {
      try {
        const { data, error } = await supabase
          .from("notification_settings")
          .select("*")
          .eq("id", "default")
          .single();
        if (!error && data) {
          return {
            emailNotificationsEnabled: data.email_notifications_enabled,
            reminderDays: data.reminder_days || [30, 15, 7, 0],
            cronSchedule: data.cron_schedule || config.CRON_SCHEDULE,
            defaultRecipientEmail: data.default_recipient_email || config.ALERT_FALLBACK_EMAIL,
            sendOnExpiryDay: data.send_on_expiry_day !== false,
            emailProvider: data.email_provider || config.EMAIL_PROVIDER,
            updatedAt: data.updated_at,
          };
        }
      } catch (e) {
        console.error(`[Supabase getNotificationSettings error] ${e.message}`);
      }
    }
    const store = getLocalStore();
    return store.settings || {
      emailNotificationsEnabled: true,
      reminderDays: [30, 15, 7, 0],
      cronSchedule: config.CRON_SCHEDULE,
      defaultRecipientEmail: config.ALERT_FALLBACK_EMAIL,
      sendOnExpiryDay: true,
      emailProvider: config.EMAIL_PROVIDER,
    };
  },

  // 9. Update notification settings
  async updateNotificationSettings(updates) {
    if (isConfigured()) {
      try {
        const snakeUpdates = {
          email_notifications_enabled: updates.emailNotificationsEnabled,
          reminder_days: updates.reminderDays,
          cron_schedule: updates.cronSchedule,
          default_recipient_email: updates.defaultRecipientEmail,
          send_on_expiry_day: updates.sendOnExpiryDay,
          email_provider: updates.emailProvider,
          updated_at: new Date().toISOString(),
        };
        await supabase
          .from("notification_settings")
          .upsert({ id: "default", ...snakeUpdates });
      } catch (e) {
        console.error(`[Supabase updateNotificationSettings error] ${e.message}`);
      }
    }

    const store = getLocalStore();
    store.settings = { ...store.settings, ...updates, updatedAt: new Date().toISOString() };
    saveLocalStore(store);
    return store.settings;
  },

  // 10. User directory lookup (to resolve responsiblePerson to email address)
  async resolveRecipientEmail(responsiblePerson, renewal = {}) {
    // 1. Explicit email on renewal record
    if (renewal.responsibleEmail && renewal.responsibleEmail.includes("@")) {
      return renewal.responsibleEmail.trim();
    }
    if (renewal.responsible_email && renewal.responsible_email.includes("@")) {
      return renewal.responsible_email.trim();
    }

    // 2. If responsiblePerson is already an email address
    if (responsiblePerson && responsiblePerson.includes("@")) {
      return responsiblePerson.trim();
    }

    // 3. Lookup user by name in database / directory
    if (responsiblePerson && responsiblePerson.trim()) {
      const trimmed = responsiblePerson.trim().toLowerCase();
      const store = getLocalStore();
      const matched = (store.users || []).find(
        (u) => (u.fullName && u.fullName.toLowerCase() === trimmed) || (u.email && u.email.toLowerCase() === trimmed)
      );
      if (matched && matched.email) {
        return matched.email;
      }
    }

    // 4. Fallback to configured alert recipient
    const settings = await this.getNotificationSettings();
    return settings.defaultRecipientEmail || config.ALERT_FALLBACK_EMAIL || "demo@renewaltrack.com";
  },
};

module.exports = db;
