/* ==========================================================================
   backend/reminderScheduler.js — Automated Cron Job & Reminder Processor
   Periodically checks renewals, checks intervals (30d, 15d, 7d, 0d),
   prevents duplicates via Supabase/DB, and dispatches email alerts safely.
   ========================================================================== */

const cron = require("node-cron");
const config = require("./config");
const db = require("./db");
const emailService = require("./emailService");

let activeCronTask = null;
let lastRunTimestamp = null;
let lastRunSummary = null;

// Calculate days remaining between two ISO date strings (YYYY-MM-DD)
function calculateDaysRemaining(expiryDateStr) {
  if (!expiryDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDateStr);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// Determine which reminder intervals are eligible for a given daysRemaining count
function getEligibleIntervals(daysRemaining, configuredReminderDays = [30, 15, 7, 0]) {
  const eligible = [];
  if (daysRemaining === null || daysRemaining === undefined) return eligible;

  // 1. Expiry day (0 days left or expired today)
  if (daysRemaining === 0 && configuredReminderDays.includes(0)) {
    eligible.push({ interval: "0_days", days: 0, label: "Expires Today" });
  }

  // 2. 7 days before expiry (window: 1 to 7 days remaining)
  if (daysRemaining > 0 && daysRemaining <= 7 && configuredReminderDays.includes(7)) {
    eligible.push({ interval: "7_days", days: 7, label: "7 Days Before Expiry" });
  }

  // 3. 15 days before expiry (window: 8 to 15 days remaining)
  if (daysRemaining > 7 && daysRemaining <= 15 && configuredReminderDays.includes(15)) {
    eligible.push({ interval: "15_days", days: 15, label: "15 Days Before Expiry" });
  }

  // 4. 30 days before expiry (window: 16 to 30 days remaining)
  if (daysRemaining > 15 && daysRemaining <= 30 && configuredReminderDays.includes(30)) {
    eligible.push({ interval: "30_days", days: 30, label: "30 Days Before Expiry" });
  }

  return eligible;
}

// Main processing function: can be run by cron or triggered manually
async function checkAndSendReminders(options = {}) {
  const startTime = new Date();
  console.log(`\n--------------------------------------------------------------------------------`);
  console.log(`[CRON ${startTime.toISOString()}] Starting Renewal Reminder Dispatch Job...`);
  console.log(`--------------------------------------------------------------------------------`);

  const summary = {
    startedAt: startTime.toISOString(),
    completedAt: null,
    totalRenewalsChecked: 0,
    eligibleRemindersFound: 0,
    remindersSent: 0,
    duplicatesSkipped: 0,
    errorsEncountered: 0,
    notificationsEnabled: true,
    logs: [],
  };

  try {
    // 1. Check if email notifications are enabled globally in settings
    const settings = await db.getNotificationSettings();
    if (settings.emailNotificationsEnabled === false) {
      const msg = "[CRON SKIP] Email notifications are disabled in application settings.";
      console.log(msg);
      summary.notificationsEnabled = false;
      summary.completedAt = new Date().toISOString();
      lastRunTimestamp = summary.completedAt;
      lastRunSummary = summary;
      return summary;
    }

    const reminderDays = Array.isArray(settings.reminderDays)
      ? settings.reminderDays
      : [30, 15, 7, 0];

    // 2. Fetch all renewals from database/Supabase
    const renewals = await db.getRenewals();
    summary.totalRenewalsChecked = renewals.length;
    console.log(`[CRON] Inspecting ${renewals.length} renewals against intervals [${reminderDays.join(", ")} days]...`);

    // 3. Process each renewal
    for (const renewal of renewals) {
      if (!renewal.expiryDate) continue;

      const daysRemaining = calculateDaysRemaining(renewal.expiryDate);
      if (daysRemaining === null) continue;

      // Identify eligible reminder intervals (30d, 15d, 7d, 0d)
      const eligibleList = getEligibleIntervals(daysRemaining, reminderDays);

      for (const item of eligibleList) {
        summary.eligibleRemindersFound++;
        const intervalKey = item.interval;

        // --------------------------------------------------------------------
        // CRITICAL REQUIREMENT 6: Check for duplicate email in Supabase/DB
        // --------------------------------------------------------------------
        const alreadySent = await db.hasReminderBeenSent(
          renewal.id,
          intervalKey,
          renewal.expiryDate
        );

        if (alreadySent && !options.force) {
          summary.duplicatesSkipped++;
          const skipMsg = `[DUPLICATE PREVENTED] Reminder [${intervalKey}] already sent for "${renewal.name}" (Expiry: ${renewal.expiryDate}). Skipping duplicate email.`;
          console.log(skipMsg);
          summary.logs.push({
            type: "duplicate_skipped",
            renewalId: renewal.id,
            renewalName: renewal.name,
            interval: intervalKey,
            daysRemaining,
          });
          continue;
        }

        // --------------------------------------------------------------------
        // REQUIREMENT 5: Resolve recipient assigned to renewal or configured fallback
        // --------------------------------------------------------------------
        const recipientEmail = await db.resolveRecipientEmail(
          renewal.responsiblePerson,
          renewal
        );

        const recipientName = renewal.responsiblePerson || "Responsible Officer";

        if (!emailService.isValidEmail(recipientEmail)) {
          summary.errorsEncountered++;
          const warnMsg = `[RECIPIENT INVALID] No valid recipient email address found for renewal "${renewal.name}" (${renewal.id}). Resolved: "${recipientEmail}"`;
          console.warn(warnMsg);

          await db.recordReminderLog({
            renewalId: renewal.id,
            renewalName: renewal.name,
            reminderInterval: intervalKey,
            recipientEmail: recipientEmail || "invalid@missing",
            recipientName,
            expiryDate: renewal.expiryDate,
            daysRemaining,
            status: "failed",
            errorMessage: "Invalid or missing recipient email address",
          });

          summary.logs.push({
            type: "invalid_recipient",
            renewalId: renewal.id,
            renewalName: renewal.name,
            interval: intervalKey,
            error: "Invalid recipient email",
          });
          continue;
        }

        // --------------------------------------------------------------------
        // REQUIREMENT 3 & 4: Deliver email with renewal details
        // --------------------------------------------------------------------
        console.log(`[DISPATCHING] Sending [${intervalKey}] reminder for "${renewal.name}" (${daysRemaining}d remaining) to ${recipientEmail}...`);

        const sendResult = await emailService.sendReminderEmail({
          renewal,
          recipientEmail,
          recipientName,
          daysRemaining,
          interval: intervalKey,
        });

        if (sendResult.success) {
          summary.remindersSent++;
          const status = sendResult.simulated ? "simulated" : "sent";

          await db.recordReminderLog({
            renewalId: renewal.id,
            renewalName: renewal.name,
            reminderInterval: intervalKey,
            recipientEmail,
            recipientName,
            expiryDate: renewal.expiryDate,
            daysRemaining,
            status,
            deliveryProvider: sendResult.provider,
            messageId: sendResult.messageId,
          });

          summary.logs.push({
            type: "sent",
            renewalId: renewal.id,
            renewalName: renewal.name,
            interval: intervalKey,
            recipientEmail,
            daysRemaining,
            simulated: !!sendResult.simulated,
            messageId: sendResult.messageId,
          });
        } else {
          // REQUIREMENT 7: Handle delivery errors safely without crashing
          summary.errorsEncountered++;
          console.error(`[DELIVERY FAILED] Could not send reminder for "${renewal.name}": ${sendResult.error}`);

          await db.recordReminderLog({
            renewalId: renewal.id,
            renewalName: renewal.name,
            reminderInterval: intervalKey,
            recipientEmail,
            recipientName,
            expiryDate: renewal.expiryDate,
            daysRemaining,
            status: "failed",
            deliveryProvider: config.EMAIL_PROVIDER,
            errorMessage: sendResult.error,
          });

          summary.logs.push({
            type: "failed",
            renewalId: renewal.id,
            renewalName: renewal.name,
            interval: intervalKey,
            recipientEmail,
            error: sendResult.error,
          });
        }
      }
    }
  } catch (err) {
    // Top-level error boundary to protect the server process
    summary.errorsEncountered++;
    console.error(`[CRON ERROR] Unexpected error during reminder check: ${err.message}`, err.stack);
  }

  summary.completedAt = new Date().toISOString();
  lastRunTimestamp = summary.completedAt;
  lastRunSummary = summary;

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`[CRON SUMMARY] Finished in ${new Date() - startTime}ms.`);
  console.log(`  Checked:           ${summary.totalRenewalsChecked}`);
  console.log(`  Eligible:          ${summary.eligibleRemindersFound}`);
  console.log(`  Sent/Simulated:    ${summary.remindersSent}`);
  console.log(`  Duplicates Avoided:${summary.duplicatesSkipped}`);
  console.log(`  Errors Handled:    ${summary.errorsEncountered}`);
  console.log(`--------------------------------------------------------------------------------\n`);

  return summary;
}

// Start the scheduled background job
function startScheduler() {
  const schedule = config.CRON_SCHEDULE;

  if (!cron.validate(schedule)) {
    console.error(`[CRON ERROR] Invalid cron schedule expression: "${schedule}". Using default: "0 8 * * *".`);
  }

  const validSchedule = cron.validate(schedule) ? schedule : "0 8 * * *";

  if (activeCronTask) {
    activeCronTask.stop();
  }

  console.log(`[SCHEDULER] Initializing node-cron automated reminder service on schedule: "${validSchedule}"`);

  activeCronTask = cron.schedule(validSchedule, async () => {
    console.log(`[SCHEDULER] Scheduled trigger fired at ${new Date().toISOString()}`);
    await checkAndSendReminders();
  });

  console.log(`[SCHEDULER] Automated reminder engine is active and will run independently in the background.`);
}

function stopScheduler() {
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
    console.log(`[SCHEDULER] Background reminder cron job stopped.`);
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  checkAndSendReminders,
  calculateDaysRemaining,
  getEligibleIntervals,
  getStatus: () => ({
    active: !!activeCronTask,
    schedule: config.CRON_SCHEDULE,
    lastRunTimestamp,
    lastRunSummary,
    emailProvider: config.EMAIL_PROVIDER,
    emailSendEnabled: config.EMAIL_SEND_ENABLED,
  }),
};
