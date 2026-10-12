/* ==========================================================================
   backend/db.js — Unified Data Access Layer (Supabase PostgreSQL + Fallback)
   Handles renewals, reminder logs, duplicate prevention, and settings.
   ========================================================================== */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { supabase, isConfigured } = require("./supabaseClient");
const config = require("./config");
const emailService = require("./emailService");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOCAL_STORE_FILE = path.join(DATA_DIR, "store.json");

// Helper for dates relative to today
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const PRIMARY_ADMIN_EMAIL = "elakkiyaohai@gmail.com";
const PRIMARY_ADMIN_NAME = "Elakkiya";

function addDays(isoDate, days) {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Return initial seeded records (Empty by default for clean start)
function getInitialSeedRenewals() {
  return [];
}

// Local store helpers
function getLocalStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(LOCAL_STORE_FILE)) {
      const raw = fs.readFileSync(LOCAL_STORE_FILE, "utf-8");
      const store = JSON.parse(raw);
      let changed = false;

      if (!store.invitations) {
        store.invitations = [];
        changed = true;
      }
      if (!store.audit_logs || store.audit_logs.length === 0) {
        store.audit_logs = [
          {
            id: "log-seed-1",
            actorId: "system",
            actorName: "System",
            actorEmail: "system@renewaltrack.com",
            actorRole: "System",
            action: "SYSTEM_INITIALIZED",
            targetType: "system",
            targetId: "system",
            details: "RenewGuard initialized with Role-Based Access Control (Admin, Employee, Viewer).",
            channel: "System",
            createdAt: new Date().toISOString(),
          },
        ];
        changed = true;
      }

      if (!store.users) {
        store.users = [];
        changed = true;
      }

      // Remove unwanted demo account (Anita Sharma / demo@renewaltrack.com)
      const hadDemoUser = store.users.some(
        (u) => u.email && u.email.toLowerCase() === "demo@renewaltrack.com"
      );
      if (hadDemoUser) {
        store.users = store.users.filter(
          (u) => !u.email || u.email.toLowerCase() !== "demo@renewaltrack.com"
        );
        changed = true;
      }

      // Ensure Primary Admin (Elakkiya / elakkiyaohai@gmail.com) exists with Admin role
      let primaryAdmin = store.users.find(
        (u) => u.email && u.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()
      );
      if (!primaryAdmin) {
        primaryAdmin = {
          id: "usr-admin-elakkiya",
          fullName: PRIMARY_ADMIN_NAME,
          email: PRIMARY_ADMIN_EMAIL,
          role: "Admin",
          status: "active",
          mobile: "+91 98765 43210",
          password: "Admin@1234",
        };
        store.users.unshift(primaryAdmin);
        changed = true;
      } else {
        if (primaryAdmin.role !== "Admin") {
          primaryAdmin.role = "Admin";
          changed = true;
        }
        if (primaryAdmin.status !== "active") {
          primaryAdmin.status = "active";
          changed = true;
        }
        if (!primaryAdmin.fullName) {
          primaryAdmin.fullName = PRIMARY_ADMIN_NAME;
          changed = true;
        }
      }

      // Ensure remaining users have valid role and active status
      store.users.forEach((u) => {
        if (u.role === "Editor") {
          u.role = "Employee";
          changed = true;
        }
        if (!u.status) {
          u.status = "active";
          changed = true;
        }
      });

      // Update settings default recipient
      if (store.settings) {
        if (
          store.settings.defaultRecipientEmail === "demo@renewaltrack.com" ||
          !store.settings.defaultRecipientEmail
        ) {
          store.settings.defaultRecipientEmail = PRIMARY_ADMIN_EMAIL;
          changed = true;
        }
      }

      // Reassign legacy demo references in invitations
      if (store.invitations) {
        store.invitations.forEach((inv) => {
          if (inv.invitedBy && inv.invitedBy.toLowerCase() === "demo@renewaltrack.com") {
            inv.invitedBy = PRIMARY_ADMIN_EMAIL;
            inv.invitedByName = PRIMARY_ADMIN_NAME;
            changed = true;
          }
        });
      }

      if (changed) {
        saveLocalStore(store);
      }
      return store;
    }
  } catch (err) {
    console.error(`[Local Store Read Error] ${err.message}`);
  }

  // Initial store shape
  const initial = {
    renewals: getInitialSeedRenewals(),
    reminder_logs: [],
    invitations: [],
    audit_logs: [
      {
        id: "log-seed-1",
        actorId: "system",
        actorName: "System",
        actorEmail: "system@renewaltrack.com",
        actorRole: "System",
        action: "SYSTEM_INITIALIZED",
        targetType: "system",
        targetId: "system",
        details: "RenewGuard initialized with Role-Based Access Control (Admin, Employee, Viewer).",
        channel: "System",
        createdAt: new Date().toISOString(),
      },
    ],
    settings: {
      emailNotificationsEnabled: true,
      reminderDays: [30, 15, 7, 0],
      cronSchedule: config.CRON_SCHEDULE,
      defaultRecipientEmail: PRIMARY_ADMIN_EMAIL,
      sendOnExpiryDay: true,
      emailProvider: config.EMAIL_PROVIDER,
      updatedAt: new Date().toISOString(),
    },
    users: [
      {
        id: "usr-admin-elakkiya",
        fullName: PRIMARY_ADMIN_NAME,
        email: PRIMARY_ADMIN_EMAIL,
        role: "Admin",
        status: "active",
        mobile: "+91 98765 43210",
        password: "Admin@1234",
      },
      {
        id: "usr-emp",
        fullName: "Team Employee",
        email: "employee@renewaltrack.com",
        role: "Employee",
        status: "active",
        mobile: "+1 555 0103",
        password: "Demo@1234",
      },
      {
        id: "usr-view",
        fullName: "Team Viewer",
        email: "viewer@renewaltrack.com",
        role: "Viewer",
        status: "active",
        mobile: "+1 555 0104",
        password: "Demo@1234",
      },
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
          return [];
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

  // 4b. Clear all renewals (clean slate)
  async clearAllRenewals() {
    if (isConfigured()) {
      try {
        await supabase.from("reminder_logs").delete().neq("id", "none");
        await supabase.from("renewals").delete().neq("id", "none");
      } catch (e) {
        console.error(`[Supabase clearAllRenewals error] ${e.message}`);
      }
    }
    const store = getLocalStore();
    store.renewals = [];
    store.reminder_logs = [];
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
    return settings.defaultRecipientEmail || config.ALERT_FALLBACK_EMAIL || PRIMARY_ADMIN_EMAIL;
  },

  // 11. Get all users (enriches with assigned renewals count)
  async getUsers() {
    let usersList = [];
    if (isConfigured()) {
      try {
        const { data, error } = await supabase.from("app_users").select("*").order("created_at", { ascending: true });
        if (!error && data && data.length > 0) {
          usersList = data.map(toCamelCase);
        }
      } catch (e) {
        console.error(`[Supabase getUsers error] ${e.message}`);
      }
    }
    if (!usersList.length) {
      const store = getLocalStore();
      usersList = store.users || [];
    }

    // Tally renewal counts per user
    const counts = await this.getAssignedRenewalCounts();
    return usersList
      .filter((u) => u.email && u.email.toLowerCase() !== "demo@renewaltrack.com")
      .map((u) => {
        const email = (u.email || "").toLowerCase();
        const name = (u.fullName || "").toLowerCase();
        const count = (counts[email] || 0) + (counts[name] || 0);
        return {
          ...u,
          assignedRenewalsCount: count,
          isPrimaryAdmin: email === PRIMARY_ADMIN_EMAIL.toLowerCase(),
        };
      });
  },

  // 12. Get user by ID
  async getUserById(id) {
    if (id === "usr-1") return null;
    const users = await this.getUsers();
    return users.find((u) => u.id === id) || null;
  },

  // 13. Get user by email
  async getUserByEmail(email) {
    if (!email) return null;
    const clean = email.trim().toLowerCase();
    if (clean === "demo@renewaltrack.com") return null;
    const users = await this.getUsers();
    return users.find((u) => (u.email || "").toLowerCase() === clean) || null;
  },

  // 14. Save or upsert user
  async saveUser(userData) {
    const id = userData.id || `usr-${Date.now()}`;
    const cleanEmail = (userData.email || "").trim().toLowerCase();
    const isPrimary = cleanEmail === PRIMARY_ADMIN_EMAIL.toLowerCase();

    const record = {
      ...userData,
      id,
      role: isPrimary ? "Admin" : (userData.role || "Employee"),
      status: isPrimary ? "active" : (userData.status || "active"),
      updatedAt: new Date().toISOString(),
    };
    if (isConfigured()) {
      try {
        await supabase.from("app_users").upsert(toSnakeCase(record), { onConflict: "id" });
      } catch (e) {
        console.error(`[Supabase saveUser error] ${e.message}`);
      }
    }
    const store = getLocalStore();
    const idx = (store.users || []).findIndex((u) => u.id === id || (u.email && u.email.toLowerCase() === cleanEmail));
    if (idx >= 0) {
      store.users[idx] = { ...store.users[idx], ...record };
    } else {
      store.users.push(record);
    }
    saveLocalStore(store);
    return record;
  },

  // 15. Update user role (Protects Primary Admin)
  async updateUserRole(id, newRole, actor = {}) {
    const validRoles = ["Admin", "Employee", "Viewer"];
    if (!validRoles.includes(newRole)) {
      throw new Error(`Invalid role "${newRole}". Must be Admin, Employee, or Viewer.`);
    }

    const user = await this.getUserById(id);
    if (!user) throw new Error("User not found.");

    // Primary Admin Protection: Cannot demote elakkiyaohai@gmail.com
    if (user.email && user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase() && newRole !== "Admin") {
      throw new Error(`The Primary Admin account (${PRIMARY_ADMIN_EMAIL}) is protected and cannot be demoted.`);
    }

    const oldRole = user.role;
    user.role = newRole;
    await this.saveUser(user);

    await this.logAudit({
      actorId: actor.id || "admin",
      actorName: actor.fullName || actor.name || "Administrator",
      actorEmail: actor.email || PRIMARY_ADMIN_EMAIL,
      actorRole: actor.role || "Admin",
      action: "ROLE_CHANGED",
      targetType: "user",
      targetId: user.id,
      details: `Changed ${user.fullName || user.email}'s role from ${oldRole} to ${newRole}.`,
    });

    return user;
  },

  // 16. Update user status (active / deactivated) (Protects Primary Admin)
  async setUserStatus(id, newStatus, actor = {}) {
    if (!["active", "deactivated"].includes(newStatus)) {
      throw new Error(`Invalid status "${newStatus}". Must be active or deactivated.`);
    }

    const user = await this.getUserById(id);
    if (!user) throw new Error("User not found.");

    // Primary Admin Protection: Cannot deactivate elakkiyaohai@gmail.com
    if (user.email && user.email.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase() && newStatus === "deactivated") {
      throw new Error(`The Primary Admin account (${PRIMARY_ADMIN_EMAIL}) is protected and cannot be deactivated.`);
    }

    user.status = newStatus;
    await this.saveUser(user);

    await this.logAudit({
      actorId: actor.id || "admin",
      actorName: actor.fullName || actor.name || "Administrator",
      actorEmail: actor.email || PRIMARY_ADMIN_EMAIL,
      actorRole: actor.role || "Admin",
      action: newStatus === "deactivated" ? "ACCOUNT_DEACTIVATED" : "ACCOUNT_ACTIVATED",
      targetType: "user",
      targetId: user.id,
      details: `${newStatus === "deactivated" ? "Deactivated" : "Activated"} user account for ${user.fullName || user.email}.`,
    });

    return user;
  },

  // 17. Calculate assigned renewals count for all users
  async getAssignedRenewalCounts() {
    const renewals = await this.getRenewals();
    const counts = {};
    renewals.forEach((r) => {
      const email = (r.responsibleEmail || r.responsible_email || "").trim().toLowerCase();
      const person = (r.responsiblePerson || r.responsible_person || "").trim().toLowerCase();
      if (email) counts[email] = (counts[email] || 0) + 1;
      if (person) counts[person] = (counts[person] || 0) + 1;
    });
    return counts;
  },

  // 18. Create invitation with secure token, expiry, and email dispatch
  async createInvitation({ email, fullName, role }, actor = {}) {
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanRole = ["Employee", "Viewer"].includes(role) ? role : "Employee";

    // Check if user is already registered
    const existingUser = await this.getUserByEmail(cleanEmail);
    if (existingUser) {
      throw new Error(`A user with email "${cleanEmail}" is already registered.`);
    }

    const token = `inv-${crypto.randomBytes(16).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString(); // 48 hours

    const invite = {
      id: `inv-${Date.now()}`,
      email: cleanEmail,
      fullName: (fullName || "").trim(),
      role: cleanRole,
      invitedBy: actor.email || "elakkiyaohai@gmail.com",
      invitedByName: actor.fullName || "Elakkiya",
      token,
      status: "pending",
      expiresAt,
      createdAt: new Date().toISOString(),
    };

    if (isConfigured()) {
      try {
        await supabase.from("invitations").insert([toSnakeCase(invite)]);
      } catch (e) {
        console.error(`[Supabase createInvitation error] ${e.message}`);
      }
    }

    const store = getLocalStore();
    store.invitations = [invite, ...(store.invitations || [])];
    saveLocalStore(store);

    const appUrl = config.APP_URL || `http://localhost:${config.PORT}`;
    const inviteUrl = `${appUrl}/register.html?invite=${token}`;

    const emailResult = await emailService.sendInvitationEmail({
      to: cleanEmail,
      fullName: invite.fullName,
      role: invite.role,
      inviteUrl,
      invitedBy: invite.invitedByName,
    });

    await this.logAudit({
      actorId: actor.id || "usr-admin-elakkiya",
      actorName: actor.fullName || "Elakkiya",
      actorEmail: actor.email || "elakkiyaohai@gmail.com",
      actorRole: actor.role || "Admin",
      action: "MEMBER_INVITED",
      targetType: "invitation",
      targetId: invite.id,
      details: `Sent invitation to ${cleanEmail} for role ${cleanRole} (Expires: 48h).`,
    });

    return {
      ...invite,
      inviteUrl,
      emailSent: emailResult.success,
      emailSimulated: emailResult.simulated,
    };
  },

  // 19. Get all invitations
  async getInvitations() {
    if (isConfigured()) {
      try {
        const { data, error } = await supabase.from("invitations").select("*").order("created_at", { ascending: false });
        if (!error && data && data.length > 0) return data.map(toCamelCase);
      } catch (e) {
        console.error(`[Supabase getInvitations error] ${e.message}`);
      }
    }
    const store = getLocalStore();
    return store.invitations || [];
  },

  // 20. Get invitation by token
  async getInvitationByToken(token) {
    const invites = await this.getInvitations();
    const invite = invites.find((i) => i.token === token);
    if (!invite) return null;

    if (new Date(invite.expiresAt) < new Date() && invite.status === "pending") {
      invite.status = "expired";
      const store = getLocalStore();
      const idx = (store.invitations || []).findIndex((i) => i.token === token);
      if (idx >= 0) store.invitations[idx].status = "expired";
      saveLocalStore(store);
    }
    return invite;
  },

  // 21. Accept invitation
  async acceptInvitation(token, registrationData) {
    const invite = await this.getInvitationByToken(token);
    if (!invite) throw new Error("Invalid invitation token.");
    if (invite.status !== "pending") throw new Error(`Invitation is no longer pending (current status: ${invite.status}).`);
    if (new Date(invite.expiresAt) < new Date()) throw new Error("Invitation has expired. Please ask an Admin to resend an invite.");

    const newUser = {
      id: `usr-${Date.now()}`,
      fullName: (registrationData.fullName || invite.fullName || "").trim(),
      email: invite.email,
      mobile: registrationData.mobile || "",
      password: registrationData.password,
      role: invite.role, // strictly assigned by Admin
      status: "active",
      createdAt: new Date().toISOString(),
    };

    await this.saveUser(newUser);

    invite.status = "accepted";
    invite.acceptedAt = new Date().toISOString();

    if (isConfigured()) {
      try {
        await supabase.from("invitations").update({ status: "accepted", accepted_at: invite.acceptedAt }).eq("token", token);
      } catch (e) {
        console.error(`[Supabase acceptInvitation error] ${e.message}`);
      }
    }

    const store = getLocalStore();
    const idx = (store.invitations || []).findIndex((i) => i.token === token);
    if (idx >= 0) {
      store.invitations[idx] = invite;
      saveLocalStore(store);
    }

    await this.logAudit({
      actorId: newUser.id,
      actorName: newUser.fullName,
      actorEmail: newUser.email,
      actorRole: newUser.role,
      action: "INVITE_ACCEPTED",
      targetType: "user",
      targetId: newUser.id,
      details: `Accepted team invitation and registered account with role ${newUser.role}.`,
    });

    return newUser;
  },

  // 22. Revoke invitation
  async revokeInvitation(id, actor = {}) {
    const store = getLocalStore();
    const invite = (store.invitations || []).find((i) => i.id === id);
    if (!invite) throw new Error("Invitation not found.");

    invite.status = "revoked";
    saveLocalStore(store);

    if (isConfigured()) {
      try {
        await supabase.from("invitations").update({ status: "revoked" }).eq("id", id);
      } catch (e) {}
    }

    await this.logAudit({
      actorId: actor.id || "usr-admin-elakkiya",
      actorName: actor.fullName || "Elakkiya",
      actorEmail: actor.email || "elakkiyaohai@gmail.com",
      actorRole: actor.role || "Admin",
      action: "INVITE_REVOKED",
      targetType: "invitation",
      targetId: id,
      details: `Revoked pending invitation for ${invite.email}.`,
    });

    return invite;
  },

  // 23. Log audit activity
  async logAudit(entry) {
    const record = {
      id: entry.id || `aud-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      actorId: entry.actorId || "usr-anon",
      actorName: entry.actorName || "System",
      actorEmail: entry.actorEmail || "system@renewaltrack.com",
      actorRole: entry.actorRole || "System",
      action: entry.action || "GENERAL_ACTIVITY",
      targetType: entry.targetType || "system",
      targetId: entry.targetId || null,
      details: entry.details || "",
      channel: entry.channel || "Web Dashboard",
      ipAddress: entry.ipAddress || "127.0.0.1",
      createdAt: entry.createdAt || new Date().toISOString(),
    };

    if (isConfigured()) {
      try {
        await supabase.from("audit_logs").insert([toSnakeCase(record)]);
      } catch (e) {
        console.error(`[Supabase logAudit error] ${e.message}`);
      }
    }

    const store = getLocalStore();
    store.audit_logs = [record, ...(store.audit_logs || [])].slice(0, 500);
    saveLocalStore(store);
    return record;
  },

  // 24. Get audit logs with filter & pagination
  async getAuditLogs({ limit = 100, action, search } = {}) {
    if (isConfigured()) {
      try {
        let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
        if (action && action !== "ALL") query = query.eq("action", action);
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          let list = data.map(toCamelCase);
          if (search) {
            const q = search.toLowerCase();
            list = list.filter((l) => (l.details || "").toLowerCase().includes(q) || (l.actorName || "").toLowerCase().includes(q) || (l.actorEmail || "").toLowerCase().includes(q));
          }
          return list;
        }
      } catch (e) {
        console.error(`[Supabase getAuditLogs error] ${e.message}`);
      }
    }

    const store = getLocalStore();
    let logs = store.audit_logs || [];
    if (action && action !== "ALL") {
      const act = action.toUpperCase();
      logs = logs.filter((l) => (l.action || "").toUpperCase().includes(act));
    }
    if (search) {
      const q = search.toLowerCase();
      logs = logs.filter(
        (l) =>
          (l.details || "").toLowerCase().includes(q) ||
          (l.actorName || "").toLowerCase().includes(q) ||
          (l.actorEmail || "").toLowerCase().includes(q) ||
          (l.action || "").toLowerCase().includes(q) ||
          (l.targetType || "").toLowerCase().includes(q)
      );
    }
    return logs.slice(0, limit);
  },
};

module.exports = db;
