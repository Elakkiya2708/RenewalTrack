-- ==============================================================================
-- RenewGuard Migration: Invitation Acceptance Admin Notification
-- Adds notification tracking fields to the invitations table
-- ==============================================================================

ALTER TABLE invitations 
ADD COLUMN IF NOT EXISTS admin_notified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS admin_notification_status TEXT DEFAULT 'pending';

-- Create index for filtering by admin notification status
CREATE INDEX IF NOT EXISTS idx_invitations_admin_notified ON invitations(admin_notified);
