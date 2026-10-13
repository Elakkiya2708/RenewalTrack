-- ============================================================================
-- RenewalTrack - Set Primary Admin to Elakkiya & Purge Demo Account Migration
-- Migration: 20261012_set_primary_admin_elakkiya.sql
-- Description:
--   1. Reassigns dependencies and safely deletes or deactivates demo@renewaltrack.com
--   2. Inserts or updates Elakkiya (elakkiyaohai@gmail.com) as the sole Primary Admin
--   3. Updates reminder settings default recipient email
--   4. Installs a database trigger protecting the Primary Admin from demotion or deletion
--   5. Logs audit history for the transition
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Check and reassign dependencies before removing demo account
-- ----------------------------------------------------------------------------

-- Reassign any renewal responsible emails pointing to demo account
UPDATE renewals 
SET responsible_email = 'elakkiyaohai@gmail.com',
    responsible_person = 'Elakkiya'
WHERE LOWER(responsible_email) = 'demo@renewaltrack.com';

-- Reassign invitations issued by demo account
UPDATE invitations 
SET invited_by = 'elakkiyaohai@gmail.com',
    invited_by_name = 'Elakkiya'
WHERE LOWER(invited_by) = 'demo@renewaltrack.com';

-- Update reminder settings fallback email
UPDATE reminder_settings
SET default_recipient_email = 'elakkiyaohai@gmail.com'
WHERE default_recipient_email = 'demo@renewaltrack.com' OR default_recipient_email IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Safely Remove / Deactivate the Demo Account (Anita Sharma)
-- ----------------------------------------------------------------------------
-- Delete or permanently deactivate demo account
DO $$
BEGIN
  -- Try to safely delete demo account
  DELETE FROM app_users WHERE LOWER(email) = 'demo@renewaltrack.com';
EXCEPTION WHEN foreign_key_violation THEN
  -- If referenced in historical audit logs with strict FK, permanently deactivate & disable password
  UPDATE app_users
  SET status = 'deactivated',
      password_hash = 'PERMANENTLY_DISABLED_DEMO_ACCOUNT',
      updated_at = NOW()
  WHERE LOWER(email) = 'demo@renewaltrack.com';
END $$;

-- ----------------------------------------------------------------------------
-- 3. Set the Correct Primary Admin (Elakkiya / elakkiyaohai@gmail.com)
-- ----------------------------------------------------------------------------
INSERT INTO app_users (id, email, full_name, role, status, mobile, password_hash, created_at, updated_at)
VALUES (
  'usr-admin-elakkiya',
  'elakkiyaohai@gmail.com',
  'Elakkiya',
  'Admin',
  'active',
  '+91 98765 43210',
  'Admin@1234',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE 
SET 
  full_name = 'Elakkiya',
  role = 'Admin',
  status = 'active',
  updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 4. Protection Trigger: Prevent Deletion or Demotion of Primary Admin
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_primary_admin_function()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of Primary Admin
  IF TG_OP = 'DELETE' THEN
    IF LOWER(OLD.email) = 'elakkiyaohai@gmail.com' THEN
      RAISE EXCEPTION 'Action rejected: Primary Admin account (elakkiyaohai@gmail.com) cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- Prevent demotion or deactivation of Primary Admin
  IF TG_OP = 'UPDATE' THEN
    IF LOWER(OLD.email) = 'elakkiyaohai@gmail.com' THEN
      IF NEW.role != 'Admin' THEN
        RAISE EXCEPTION 'Action rejected: Primary Admin account (elakkiyaohai@gmail.com) cannot be demoted from Admin role.';
      END IF;
      IF NEW.status != 'active' THEN
        RAISE EXCEPTION 'Action rejected: Primary Admin account (elakkiyaohai@gmail.com) cannot be deactivated.';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_primary_admin ON app_users;
CREATE TRIGGER trg_protect_primary_admin
BEFORE UPDATE OR DELETE ON app_users
FOR EACH ROW
EXECUTE FUNCTION protect_primary_admin_function();

-- ----------------------------------------------------------------------------
-- 5. Record Audit Log for Security & Compliance
-- ----------------------------------------------------------------------------
INSERT INTO audit_logs (id, actor_id, actor_name, actor_email, actor_role, action, target_type, target_id, details, channel)
VALUES (
  'aud-migration-primary-admin',
  'usr-admin-elakkiya',
  'Elakkiya',
  'elakkiyaohai@gmail.com',
  'Admin',
  'PRIMARY_ADMIN_CONFIGURED',
  'user',
  'usr-admin-elakkiya',
  'Primary Admin account confirmed for Elakkiya (elakkiyaohai@gmail.com). Demo accounts removed.',
  'System Migration'
);
