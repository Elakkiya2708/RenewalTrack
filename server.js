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

// Production CORS configuration (Vercel frontend <-> Render backend)
const rawAllowed = (process.env.ALLOWED_ORIGINS || config.ALLOWED_ORIGINS || "*").trim();
const allowedOrigins = rawAllowed.split(",").map((o) => o.trim()).filter(Boolean);

// Automatically include APP_URL / FRONTEND_URL if specified in environment
[process.env.APP_URL, config.APP_URL, process.env.FRONTEND_URL].forEach((urlStr) => {
  if (urlStr && typeof urlStr === "string" && urlStr.trim()) {
    try {
      const parsedOrigin = new URL(urlStr.trim()).origin;
      if (!allowedOrigins.includes(parsedOrigin)) {
        allowedOrigins.push(parsedOrigin);
      }
    } catch (_) {
      const clean = urlStr.trim().replace(/\/+$/, "");
      if (!allowedOrigins.includes(clean)) {
        allowedOrigins.push(clean);
      }
    }
  }
});

const corsOptions = {
  origin: (origin, callback) => {
    // 1. Allow non-browser clients (server-to-server, cron, mobile, curl)
    if (!origin) return callback(null, true);

    const normOrigin = origin.trim().replace(/\/+$/, "").toLowerCase();

    // 2. Allow local development (localhost, 127.0.0.1 on any port, or null file:// origin)
    if (
      normOrigin === "null" ||
      normOrigin.startsWith("http://localhost:") ||
      normOrigin.startsWith("http://127.0.0.1:") ||
      normOrigin === "http://localhost" ||
      normOrigin === "http://127.0.0.1"
    ) {
      return callback(null, true);
    }

    // 3. Allow all if wildcard '*' is present
    if (allowedOrigins.includes("*")) {
      return callback(null, true);
    }

    // 4. Exact match against configured allowed origins
    if (allowedOrigins.some((ao) => ao.toLowerCase().replace(/\/+$/, "") === normOrigin)) {
      return callback(null, true);
    }

    // 5. Automatically allow any Vercel domain (*.vercel.app or https://*.vercel.app)
    // Enabled by default unless explicitly disabled with ALLOW_VERCEL_PREVIEWS=false
    const allowVercel = process.env.ALLOW_VERCEL_PREVIEWS !== "false";
    if (allowVercel) {
      try {
        const hostname = new URL(origin).hostname.toLowerCase();
        if (hostname === "vercel.app" || hostname.endsWith(".vercel.app")) {
          return callback(null, true);
        }
      } catch (_) {
        if (normOrigin.endsWith(".vercel.app") || normOrigin.includes("vercel.app")) {
          return callback(null, true);
        }
      }
    }

    // 6. Support wildcard subdomain patterns in allowedOrigins (e.g. *.mycompany.com)
    for (const pattern of allowedOrigins) {
      if (pattern.includes("*")) {
        try {
          const regexStr = "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$";
          if (new RegExp(regexStr, "i").test(origin) || new RegExp(regexStr, "i").test(normOrigin)) {
            return callback(null, true);
          }
        } catch (_) {}
      }
    }

    // 7. Safe permissive fallback for genuine web clients
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-User-Email",
    "x-user-email",
    "X-User-Role",
    "x-user-role",
    "X-RenewalTrack-Role",
    "x-renewaltrack-role",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  exposedHeaders: ["Content-Range", "X-Content-Range"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoint (Render & Monitoring)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    app: "RenewalTrack - Renewal & Compliance Management System",
    version: "1.0.0",
    nodeEnv: process.env.NODE_ENV || "development",
    backendUrl: config.BACKEND_URL || "https://renewaltrack-tyvw.onrender.com",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    supabaseConnected: isSupabaseConnected(),
    storageMode: isSupabaseConnected() ? "supabase_postgresql" : "json_store",
    dataDirectory: process.env.DATA_DIR || "default",
    emailProvider: config.EMAIL_PROVIDER,
    emailSendEnabled: config.EMAIL_SEND_ENABLED,
    smtpConfigured: Boolean(config.GMAIL_USER && config.GMAIL_APP_PASSWORD),
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
