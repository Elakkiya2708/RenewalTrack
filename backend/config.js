/* ==========================================================================
   backend/config.js — Central Configuration & Environment Management
   Loads environment variables securely and provides validated defaults.
   ========================================================================== */

require("dotenv").config();
const path = require("path");

const config = {
  PORT: process.env.PORT || 3000,
  APP_URL: process.env.APP_URL || process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3000}`,
  BACKEND_URL: process.env.BACKEND_URL || "https://renewaltrack-tyvw.onrender.com",
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || "*",

  // Data Storage Paths (for local JSON store and Render Persistent Disks)
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, "..", "data"),
  DATA_FILE: process.env.DATA_FILE || "",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  // Authentication
  JWT_SECRET: process.env.JWT_SECRET || "renewaltrack_jwt_production_secret_key_2026",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Email Delivery Configuration
  EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || "nodemailer").toLowerCase(), // 'nodemailer' (SMTP/Gmail) or 'resend'
  EMAIL_SEND_ENABLED: process.env.EMAIL_SEND_ENABLED !== "false", // Real delivery enabled by default unless explicitly disabled with 'false'

  // Gmail SMTP & Nodemailer Settings
  GMAIL_USER: (process.env.GMAIL_USER || process.env.SMTP_USER || "").trim(),
  GMAIL_APP_PASSWORD: (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "").replace(/\s+/g, ""),
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_SECURE: process.env.SMTP_SECURE === "true" || process.env.SMTP_PORT === "465",
  SMTP_SERVICE: process.env.SMTP_SERVICE || (process.env.SMTP_HOST && process.env.SMTP_HOST.includes("gmail") ? "gmail" : (process.env.GMAIL_USER ? "gmail" : "")),
  SMTP_USER: (process.env.GMAIL_USER || process.env.SMTP_USER || "").trim(),
  SMTP_PASS: (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || "").replace(/\s+/g, ""),
  EMAIL_FROM: process.env.EMAIL_FROM || process.env.FROM_EMAIL || (process.env.GMAIL_USER ? `RenewalTrack <${process.env.GMAIL_USER}>` : "RenewalTrack <elakkiya270806@gmail.com>"),
  FROM_EMAIL: process.env.EMAIL_FROM || process.env.FROM_EMAIL || (process.env.GMAIL_USER ? `RenewalTrack <${process.env.GMAIL_USER}>` : "RenewalTrack <elakkiya270806@gmail.com>"),
  FROM_NAME: process.env.FROM_NAME || "RenewalTrack Alerts",

  // Resend API Settings
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  RESEND_FROM: process.env.EMAIL_FROM || process.env.RESEND_FROM || "RenewalTrack <onboarding@resend.dev>",
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || "",

  // Background Reminder Scheduler (node-cron)
  // Default is daily at 08:00 AM ('0 8 * * *')
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || "0 8 * * *",

  // Fallback recipient when renewal has no assigned user or invalid email
  ALERT_FALLBACK_EMAIL: process.env.ALERT_FALLBACK_EMAIL || "elakkiya270806@gmail.com",
};

module.exports = config;
