-- =============================================================================
-- Migration: 20261013_remove_test_invitations.sql
-- RenewalTrack - Purge Automatic & Test Invitations and Enforce Genuine Statuses
-- =============================================================================

-- 1. Remove all automated, demo, and test invitations from the database
DELETE FROM invitations
WHERE LOWER(email) = 'demo@renewaltrack.com'
   OR LOWER(email) LIKE '%@example.com'
   OR LOWER(email) LIKE '%.notify.%@company.com'
   OR LOWER(email) LIKE 'test.employee.%@company.com'
   OR LOWER(email) LIKE 'test.viewer.%@company.com'
   OR LOWER(email) LIKE 'test-user-%'
   OR LOWER(email) = 'unauth@company.com'
   OR LOWER(email) = 'bogus@company.com'
   OR LOWER(email) = 'newuser@company.com';

-- 2. Ensure expired pending invitations reflect their actual 'expired' status
UPDATE invitations
SET status = 'expired'
WHERE status = 'pending'
  AND expires_at IS NOT NULL
  AND expires_at < NOW();

-- 3. Log migration event to audit logs
INSERT INTO audit_logs (
  id,
  actor_id,
  actor_name,
  actor_email,
  actor_role,
  action,
  target_type,
  target_id,
  details,
  channel,
  created_at
)
VALUES (
  'log-migration-' || floor(extract(epoch from now()) * 1000)::text,
  'usr-1791890845906',
  'Elakkiya',
  'elakkiya270806@gmail.com',
  'Admin',
  'TEST_INVITATIONS_PURGED',
  'invitations',
  'system',
  'Purged automated and test invitations from the database. Invitations are strictly manual Admin actions.',
  'System',
  NOW()
);
