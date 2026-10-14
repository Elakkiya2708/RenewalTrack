-- ============================================================================
-- RenewalTrack — Complete Production Supabase PostgreSQL Schema
-- Run this script in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/pzkyvgcbfjcnzcxsgekb/sql/new
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. app_users table (Team members, roles & credentials)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(100) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  mobile VARCHAR(50),
  role VARCHAR(50) DEFAULT 'Employee', -- 'Admin', 'Employee', 'Viewer'
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'inactive'
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);

-- Seed Primary Admin and Genuine Members
INSERT INTO app_users (id, email, full_name, role, status, mobile, password_hash)
VALUES
  ('usr-1791890845906', 'elakkiya270806@gmail.com', 'Elakkiya', 'Admin', 'active', '+91 98765 43210', 'scrypt$16e9112ae152b1ba$a848cff7314227fce1cbe656819fe725bb76a1617e13fb7333dfb12e340dbf03b57222475db38e55e090fceb9c3f0b2f56b3e4142f3607f2df1204d80a184132'),
  ('usr-1791993771196', 'elakkiyaaaaa27@gmail.com', 'Raja', 'Employee', 'active', '+91 73972 90089', 'scrypt$1a61e06da5d4e138$1916301a23869911e3b526d182283cb7ba9a4a796696dbf5c345b98dfb0ceba85a97aa33cf8527a29938b8c2ecab9ebf4f0c436be3540026e7a2b2586da252b4'),
  ('usr-1791994102234', 'roshankamalakannan987@gmail.com', 'Roshni K', 'Viewer', 'active', '+91 93425 16287', 'scrypt$bc2e5069a5cf09b4$efc4cf0f23f81e053f3e25d2ea79aa2f30880a4baecbc99690ae950009d749962a9c36208bc27734493b868615cf1904e5f41ae91d244f776269ebf4384d6428')
ON CONFLICT (email) DO UPDATE 
SET 
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  full_name = EXCLUDED.full_name;

-- ----------------------------------------------------------------------------
-- 2. renewals table (Tracked assets, contracts, deadlines)
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
  assigned_to_id VARCHAR(100),
  assigned_to_name VARCHAR(255),
  assigned_to_email VARCHAR(255),
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
CREATE INDEX IF NOT EXISTS idx_renewals_assigned ON renewals(assigned_to_id);

-- ----------------------------------------------------------------------------
-- 3. invitations table (Manual administrator team invites)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id VARCHAR(100) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'Employee',
  invited_by VARCHAR(255) NOT NULL,
  invited_by_name VARCHAR(255),
  token VARCHAR(120) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'revoked'
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  admin_notified BOOLEAN DEFAULT FALSE,
  admin_notified_at TIMESTAMPTZ,
  admin_notification_status VARCHAR(50),
  admin_notification_error TEXT,
  admin_notification_message_id VARCHAR(255),
  is_sample BOOLEAN DEFAULT FALSE,
  auto_accept BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- Seed Genuine Invitations
INSERT INTO invitations (
  id, email, full_name, role, invited_by, invited_by_name, token, status, expires_at, created_at, accepted_at, admin_notified, admin_notified_at, admin_notification_status
) VALUES
  (
    'inv-1791994054642',
    'roshankamalakannan987@gmail.com',
    'Roshni',
    'Viewer',
    'elakkiya270806@gmail.com',
    'Elakkiya',
    'inv-4dda891627d9aaebeab6e464984385811ac932c180f16a7b61d7b17fe1a6b8f1',
    'accepted',
    NOW() + INTERVAL '2 days',
    NOW(),
    NOW(),
    TRUE,
    NOW(),
    'delivered'
  ),
  (
    'inv-1791993461202',
    'elakkiyaaaaa27@gmail.com',
    'Raja',
    'Employee',
    'elakkiya270806@gmail.com',
    'Elakkiya',
    'inv-c933ae6ef7f9d80e99d26bcab6f990a5af16b932e3b81b635421d7093ea3ef29',
    'accepted',
    NOW() + INTERVAL '2 days',
    NOW(),
    NOW(),
    TRUE,
    NOW(),
    'delivered'
  )
ON CONFLICT (token) DO UPDATE
SET status = EXCLUDED.status;

-- ----------------------------------------------------------------------------
-- 4. reminder_logs table (Tracks automated reminder dispatches & deduplication)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id VARCHAR(100) NOT NULL,
  renewal_name VARCHAR(255) NOT NULL,
  reminder_interval VARCHAR(50) NOT NULL, -- '90_days', '60_days', '30_days', '15_days', '7_days', '0_days'
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

CREATE INDEX IF NOT EXISTS idx_reminder_logs_lookup ON reminder_logs(renewal_id, reminder_interval, expiry_date);

-- Prevent duplicate successful reminder dispatches on the same date
CREATE UNIQUE INDEX IF NOT EXISTS idx_reminder_logs_prevent_duplicate
  ON reminder_logs(renewal_id, reminder_interval, expiry_date)
  WHERE status IN ('sent', 'simulated');

-- ----------------------------------------------------------------------------
-- 5. audit_logs table (Tamper-resistant security activity logging)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(100) PRIMARY KEY,
  actor_id VARCHAR(100) NOT NULL,
  actor_name VARCHAR(255) NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(100),
  target_id VARCHAR(100),
  details TEXT,
  channel VARCHAR(100) DEFAULT 'Web Dashboard',
  ip_address VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Seed System Initialization Log
INSERT INTO audit_logs (id, actor_id, actor_name, actor_email, actor_role, action, target_type, target_id, details, channel, created_at)
VALUES (
  'log-seed-1',
  'system',
  'System',
  'system@renewaltrack.com',
  'System',
  'SYSTEM_INITIALIZED',
  'system',
  'system',
  'RenewalTrack initialized with Supabase PostgreSQL and Role-Based Access Control.',
  'System',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. password_resets table (Cryptographic reset tokens)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(120) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  ip_address VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);

-- ----------------------------------------------------------------------------
-- 7. notification_settings table (Workspace notification schedule)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_settings (
  id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
  email_notifications_enabled BOOLEAN DEFAULT TRUE,
  reminder_days JSONB DEFAULT '[30, 15, 7, 0]'::jsonb,
  cron_schedule VARCHAR(50) DEFAULT '0 8 * * *',
  default_recipient_email VARCHAR(255) DEFAULT 'elakkiya270806@gmail.com',
  send_on_expiry_day BOOLEAN DEFAULT TRUE,
  email_provider VARCHAR(50) DEFAULT 'nodemailer',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO notification_settings (id, email_notifications_enabled, reminder_days, cron_schedule, default_recipient_email, send_on_expiry_day, email_provider)
VALUES ('default', TRUE, '[30, 15, 7, 0]'::jsonb, '0 8 * * *', 'elakkiya270806@gmail.com', TRUE, 'nodemailer')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 8. Row Level Security (RLS) & Access Policies
-- ----------------------------------------------------------------------------
ALTER TABLE renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Permissive policies for server service_role & anon
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow full access to renewals') THEN
    CREATE POLICY "Allow full access to renewals" ON renewals FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow full access to app_users') THEN
    CREATE POLICY "Allow full access to app_users" ON app_users FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow full access to invitations') THEN
    CREATE POLICY "Allow full access to invitations" ON invitations FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow full access to reminder_logs') THEN
    CREATE POLICY "Allow full access to reminder_logs" ON reminder_logs FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow full access to audit_logs') THEN
    CREATE POLICY "Allow full access to audit_logs" ON audit_logs FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow full access to password_resets') THEN
    CREATE POLICY "Allow full access to password_resets" ON password_resets FOR ALL USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow full access to notification_settings') THEN
    CREATE POLICY "Allow full access to notification_settings" ON notification_settings FOR ALL USING (true);
  END IF;
END $$;
