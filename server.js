/* ==========================================================================
   server.js — RenewalTrack Production Backend (Express.js + Supabase + Cron)
   Serves static frontend, hosts REST APIs, and runs automated email reminder cron.
   ========================================================================== */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { exec } = require("child_process");

const config = require("./backend/config");
const { isConfigured: isSupabaseConnected } = require("./backend/supabaseClient");
const reminderScheduler = require("./backend/reminderScheduler");

// Route imports
const authRoutes = require("./backend/routes/auth");
const renewalsRoutes = require("./backend/routes/renewals");
const remindersRoutes = require("./backend/routes/reminders");
const settingsRoutes = require("./backend/routes/settings");
const teamRoutes = require("./backend/routes/team");
const auditRoutes = require("./backend/routes/audit");
const webhooksRoutes = require("./backend/routes/webhooks");

const app = express();
const PORT = config.PORT;
const ROOT = __dirname;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "RenewalTrack - Renewal & Compliance Management System",
    timestamp: new Date().toISOString(),
    supabaseConnected: isSupabaseConnected(),
    emailProvider: config.EMAIL_PROVIDER,
    emailSendEnabled: config.EMAIL_SEND_ENABLED,
    schedulerStatus: reminderScheduler.getStatus(),
  });
});

// Mount API Endpoints
app.use("/api/auth", authRoutes);
app.use("/api/renewals", renewalsRoutes);
app.use("/api/reminders", remindersRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/webhooks", webhooksRoutes);

// Serve static frontend files (HTML, CSS, JS, assets)
app.use(express.static(ROOT));

// Root route fallback to index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

// Start background cron scheduler
reminderScheduler.startScheduler();

// Start Express HTTP Server
const server = app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log("\n================================================================================");
  console.log(`  RenewalTrack — Renewal & Compliance Management System`);
  console.log(`  Server running at: ${url}`);
  console.log(`  Supabase Status:   ${isSupabaseConnected() ? "CONNECTED (PostgreSQL)" : "LOCAL SAFE STORE (Configure .env for Supabase)"}`);
  console.log(`  Email Provider:    ${config.EMAIL_PROVIDER.toUpperCase()}`);
  console.log(`  Email Delivery:    ${config.EMAIL_SEND_ENABLED ? "LIVE DELIVERY ENABLED" : "SIMULATION / SANDBOX MODE (Safe)"}`);
  console.log(`  Cron Reminder Job: ACTIVE on schedule "${config.CRON_SCHEDULE}"`);
  console.log("================================================================================\n");

  if (process.env.OPEN_BROWSER === "1") {
    const cmd =
      process.platform === "win32"
        ? `start "" "${url}"`
        : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});

// Graceful shutdown handling
process.on("SIGTERM", () => {
  console.log("[SERVER] SIGTERM received. Stopping scheduler and closing server...");
  reminderScheduler.stopScheduler();
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("\n[SERVER] SIGINT received. Stopping scheduler and exiting...");
  reminderScheduler.stopScheduler();
  server.close(() => process.exit(0));
});

module.exports = app;
