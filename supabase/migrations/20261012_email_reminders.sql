-- ============================================================================
-- RenewGuard - Real Email Reminder System Migration
-- Migration: 20261012_email_reminders.sql
-- Description: Creates tables for renewals, reminder logs (with duplicate prevention),
--              notification settings, and user accounts.
-- ============================================================================

-- Enable pgcrypto / uuid-ossp if available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. renewals table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS renewals (
  id VARCHAR(100) PRIMARY KEY,
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  organization VARCHAR(255),
  description TEXT,
  reference_number VARCHAR(100),
  issue_date DATE,
  expiry_date DATE NOT NULL,
  reminder_date DATE,
  cost NUMERIC(15, 2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  priority VARCHAR(20) DEFAULT 'Medium',
  responsible_person VARCHAR(255),
  responsible_email VARCHAR(255),
  recurring_cycle VARCHAR(50) DEFAULT 'Yearly',
  notes TEXT,
  reminder_completed BOOLEAN DEFAULT FALSE,
  last_renewed_at DATE,
  documents JSONB DEFAULT '[]'::jsonb,
  history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewals_expiry ON renewals(expiry_date);
CREATE INDEX IF NOT EXISTS idx_renewals_category ON renewals(category);
CREATE INDEX IF NOT EXISTS idx_renewals_priority ON renewals(priority);

-- ----------------------------------------------------------------------------
-- 2. reminder_logs table (Tracks every sent/attempted reminder to prevent duplicates)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id VARCHAR(100) NOT NULL,
  renewal_name VARCHAR(255) NOT NULL,
  reminder_interval VARCHAR(50) NOT NULL, -- '30_days', '15_days', '7_days', '0_days'
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  expiry_date DATE NOT NULL,
  days_remaining INTEGER NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'sent', 'simulated', 'failed', 'skipped'
  delivery_provider VARCHAR(50), -- 'nodemailer', 'resend', 'simulated'
  message_id VARCHAR(255),
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rapid lookup of sent reminders
CREATE INDEX IF NOT EXISTS idx_reminder_logs_lookup
  ON reminder_logs(renewal_id, reminder_interval, expiry_date);

-- Partial unique constraint to prevent duplicate successful emails for the same renewal & interval
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_logs_prevent_duplicate
  ON reminder_logs(renewal_id, reminder_interval, expiry_date)
  WHERE status IN ('sent', 'simulated');

-- ----------------------------------------------------------------------------
-- 3. notification_settings table (Configurable email reminder settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_settings (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  email_notifications_enabled BOOLEAN DEFAULT TRUE,
  reminder_days JSONB DEFAULT '[30, 15, 7, 0]'::jsonb,
  cron_schedule VARCHAR(50) DEFAULT '0 8 * * *',
  default_recipient_email VARCHAR(255) DEFAULT 'demo@renewaltrack.com',
  send_on_expiry_day BOOLEAN DEFAULT TRUE,
  email_provider VARCHAR(50) DEFAULT 'nodemailer',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default notification settings row if not present
INSERT INTO notification_settings (id, email_notifications_enabled, reminder_days, cron_schedule, default_recipient_email, send_on_expiry_day, email_provider)
VALUES ('default', TRUE, '[30, 15, 7, 0]'::jsonb, '0 8 * * *', 'demo@renewaltrack.com', TRUE, 'nodemailer')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. app_users table (Team members and recipients)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(100) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  mobile VARCHAR(50),
  role VARCHAR(50) DEFAULT 'Admin',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_users (id, email, full_name, role)
VALUES 
  ('usr-1', 'demo@renewaltrack.com', 'Anita Sharma', 'Admin'),
  ('usr-2', 'david.kim@renewaltrack.com', 'David Kim', 'Editor'),
  ('usr-3', 'priya.nair@renewaltrack.com', 'Priya Nair', 'Viewer'),
  ('usr-4', 'wei.zhang@renewaltrack.com', 'Wei Zhang', 'Editor')
ON CONFLICT (email) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Row Level Security (RLS) - Permissive defaults for service role & authenticated users
-- ----------------------------------------------------------------------------
ALTER TABLE renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access to renewals') THEN
    CREATE POLICY "Allow service_role full access to renewals" ON renewals FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access to reminder_logs') THEN
    CREATE POLICY "Allow service_role full access to reminder_logs" ON reminder_logs FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access to notification_settings') THEN
    CREATE POLICY "Allow service_role full access to notification_settings" ON notification_settings FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access to app_users') THEN
    CREATE POLICY "Allow service_role full access to app_users" ON app_users FOR ALL USING (true);
  END IF;
END $$;
