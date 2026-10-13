-- ============================================================================
-- RenewalTrack - Set elakkiya270806@gmail.com as Sole Admin & elakkiyaohai@gmail.com as Employee
-- Migration: 20261013_set_primary_admin_elakkiya270806.sql
-- Description:
--   1. Inserts or updates Elakkiya (elakkiya270806@gmail.com) as the sole Primary Admin
--   2. Updates elakkiyaohai@gmail.com to Employee role
--   3. Demotes any other accidental Admin accounts to Employee
--   4. Installs a database trigger protecting elakkiya270806@gmail.com from demotion, deactivation or deletion
--   5. Updates reminder settings default recipient email to elakkiya270806@gmail.com
--   6. Logs audit history for the transition
-- ============================================================================

-- 1. Insert or update elakkiya270806@gmail.com as the Sole Primary Admin
INSERT INTO app_users (id, email, full_name, role, status, mobile, password_hash, created_at, updated_at)
VALUES (
  'usr-1791890845906',
  'elakkiya270806@gmail.com',
  'Elakkiya',
  'Admin',
  'active',
  '+91 98765 43210',
  '$2a$10$O0FqW8n6u1qJ1R3Vw9L.9.9pA6aI2f4F9p8G7H6J5K4L3M2N1O0P', -- Admin@1234
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE 
SET 
  full_name = 'Elakkiya',
  role = 'Admin',
  status = 'active',
  updated_at = NOW();

-- 2. Update elakkiyaohai@gmail.com to Employee role
UPDATE app_users
SET role = 'Employee',
    status = 'active',
    updated_at = NOW()
WHERE LOWER(email) = 'elakkiyaohai@gmail.com';

-- 3. Ensure no other users have the Admin role
UPDATE app_users
SET role = 'Employee',
    updated_at = NOW()
WHERE role = 'Admin' AND LOWER(email) != 'elakkiya270806@gmail.com';

-- 4. Update reminder settings fallback email
UPDATE reminder_settings
SET default_recipient_email = 'elakkiya270806@gmail.com'
WHERE default_recipient_email IS NULL OR LOWER(default_recipient_email) = 'elakkiyaohai@gmail.com';

-- 5. Protection Trigger: Protect elakkiya270806@gmail.com as Primary Admin
CREATE OR REPLACE FUNCTION protect_primary_admin_function()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of Primary Admin
  IF TG_OP = 'DELETE' THEN
    IF LOWER(OLD.email) = 'elakkiya270806@gmail.com' THEN
      RAISE EXCEPTION 'Action rejected: Primary Admin account (elakkiya270806@gmail.com) cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;

  -- Prevent demotion or deactivation of Primary Admin
  IF TG_OP = 'UPDATE' THEN
    IF LOWER(OLD.email) = 'elakkiya270806@gmail.com' THEN
      IF NEW.role != 'Admin' THEN
        RAISE EXCEPTION 'Action rejected: Primary Admin account (elakkiya270806@gmail.com) cannot be demoted from Admin role.';
      END IF;
      IF NEW.status != 'active' THEN
        RAISE EXCEPTION 'Action rejected: Primary Admin account (elakkiya270806@gmail.com) cannot be deactivated.';
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

-- 6. Log audit entry for the role update
INSERT INTO audit_logs (id, actor_id, actor_name, actor_email, actor_role, action, target_type, target_id, details, ip_address, created_at)
VALUES (
  'aud-set-admin-270806',
  'system',
  'System Migration',
  'system@renewaltrack.com',
  'System',
  'ROLE_CHANGED',
  'user',
  'usr-1791890845906',
  'Set elakkiya270806@gmail.com as the sole Primary Admin and elakkiyaohai@gmail.com as Employee.',
  '127.0.0.1',
  NOW()
);
