-- ============================================================================
-- RenewalTrack - Role-Based Access Control, Team Management & Audit Logging Migration
-- Migration: 20261012_role_based_team_management.sql
-- Description: Adds status and metadata to app_users, creates invitations and
--              audit_logs tables with RLS and seed accounts for Admin, Employee, Viewer.
-- ============================================================================

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Enhance app_users table with status, last_login
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'status') THEN
    ALTER TABLE app_users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'last_login') THEN
    ALTER TABLE app_users ADD COLUMN last_login TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_users' AND column_name = 'updated_at') THEN
    ALTER TABLE app_users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Update existing roles (e.g. migrate 'Editor' to 'Employee' if present)
UPDATE app_users SET role = 'Employee' WHERE role = 'Editor';

-- Ensure seeded users for each role exist
INSERT INTO app_users (id, email, full_name, role, status, mobile, password_hash)
VALUES 
  ('usr-1', 'demo@renewaltrack.com', 'Anita Sharma', 'Admin', 'active', '+1 555 0102', 'Demo@1234'),
  ('usr-2', 'david.kim@renewaltrack.com', 'David Kim', 'Employee', 'active', '+1 555 0103', 'Demo@1234'),
  ('usr-3', 'priya.nair@renewaltrack.com', 'Priya Nair', 'Viewer', 'active', '+1 555 0104', 'Demo@1234')
ON CONFLICT (email) DO UPDATE 
SET role = EXCLUDED.role, status = EXCLUDED.status;

-- ----------------------------------------------------------------------------
-- 2. invitations table (Secure invitations with expiry and token)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'Employee',
  invited_by VARCHAR(255) NOT NULL,
  invited_by_name VARCHAR(255),
  token VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'expired', 'revoked'
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- ----------------------------------------------------------------------------
-- 3. audit_logs table (Immutable activity tracking)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id VARCHAR(100),
  actor_name VARCHAR(255) NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL, -- e.g. RENEWAL_CREATED, ROLE_CHANGED, MEMBER_INVITED, ACCOUNT_DEACTIVATED
  target_type VARCHAR(100),    -- e.g. 'renewal', 'user', 'invitation', 'auth'
  target_id VARCHAR(100),
  details TEXT NOT NULL,
  channel VARCHAR(50) DEFAULT 'Web Dashboard',
  ip_address VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON audit_logs(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Initial seed audit logs
-- ----------------------------------------------------------------------------
INSERT INTO audit_logs (actor_name, actor_email, actor_role, action, target_type, details)
VALUES 
  ('System', 'system@renewaltrack.com', 'System', 'SYSTEM_INITIALIZED', 'system', 'Role-based access control and Team Management modules initialized with Admin, Employee, and Viewer roles.');

-- ----------------------------------------------------------------------------
-- 5. Row Level Security Policies
-- ----------------------------------------------------------------------------
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access to invitations') THEN
    CREATE POLICY "Allow service_role full access to invitations" ON invitations FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service_role full access to audit_logs') THEN
    CREATE POLICY "Allow service_role full access to audit_logs" ON audit_logs FOR ALL USING (true);
  END IF;
END $$;
