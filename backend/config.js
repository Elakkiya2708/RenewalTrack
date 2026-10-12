/* ==========================================================================
   backend/config.js — Central Configuration & Environment Management
   Loads environment variables securely and provides validated defaults.
   ========================================================================== */

require("dotenv").config();

const config = {
  PORT: process.env.PORT || 3000,
  APP_URL: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
  
  // Supabase Configuration
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  // Authentication
  JWT_SECRET: process.env.JWT_SECRET || "renewguard_jwt_production_secret_key_2026",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Email Delivery Configuration
  EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || "nodemailer").toLowerCase(), // 'nodemailer' or 'resend'
  EMAIL_SEND_ENABLED: process.env.EMAIL_SEND_ENABLED === "true", // Safe default is false (simulation mode)

  // Nodemailer SMTP Settings
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_SECURE: process.env.SMTP_SECURE === "true", // true for 465, false for 587
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  FROM_EMAIL: process.env.FROM_EMAIL || "reminders@renewguard.com",
  FROM_NAME: process.env.FROM_NAME || "RenewGuard Alerts",

  // Resend API Settings
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",

  // Background Reminder Scheduler (node-cron)
  // Default is daily at 08:00 AM ('0 8 * * *')
  CRON_SCHEDULE: process.env.CRON_SCHEDULE || "0 8 * * *",

  // Fallback recipient when renewal has no assigned user or invalid email
  ALERT_FALLBACK_EMAIL: process.env.ALERT_FALLBACK_EMAIL || "elakkiyaohai@gmail.com",
};

module.exports = config;
