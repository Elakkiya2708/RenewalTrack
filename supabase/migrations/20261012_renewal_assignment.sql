-- ============================================================================
-- RenewalTrack - Renewal Assignment Migration
-- Migration: 20261012_renewal_assignment.sql
-- Description: Adds assigned_to_id (FK to app_users), assigned_to_name, and
--              assigned_to_email to the renewals table with indexing.
-- ============================================================================

DO $$
BEGIN
  -- 1. Add assigned_to_id column referencing app_users(id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'renewals' AND column_name = 'assigned_to_id'
  ) THEN
    ALTER TABLE renewals ADD COLUMN assigned_to_id VARCHAR(100);
  END IF;

  -- 2. Add assigned_to_name column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'renewals' AND column_name = 'assigned_to_name'
  ) THEN
    ALTER TABLE renewals ADD COLUMN assigned_to_name VARCHAR(255);
  END IF;

  -- 3. Add assigned_to_email column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'renewals' AND column_name = 'assigned_to_email'
  ) THEN
    ALTER TABLE renewals ADD COLUMN assigned_to_email VARCHAR(255);
  END IF;
END $$;

-- 4. Create Foreign Key constraint to app_users(id) if app_users exists and constraint doesn't already exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_users') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'fk_renewals_assigned_to_user' AND table_name = 'renewals'
    ) THEN
      BEGIN
        ALTER TABLE renewals 
        ADD CONSTRAINT fk_renewals_assigned_to_user 
        FOREIGN KEY (assigned_to_id) 
        REFERENCES app_users(id) 
        ON DELETE SET NULL;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Could not create foreign key constraint fk_renewals_assigned_to_user: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- 5. Add index for performant queries by assigned employee
CREATE INDEX IF NOT EXISTS idx_renewals_assigned_to_id ON renewals(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_renewals_assigned_to_email ON renewals(assigned_to_email);

-- 6. Backfill existing records: map responsible_person / responsible_email to assigned_to fields where matched
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_users') THEN
    UPDATE renewals r
    SET 
      assigned_to_id = u.id,
      assigned_to_name = u.full_name,
      assigned_to_email = u.email
    FROM app_users u
    WHERE r.assigned_to_id IS NULL
      AND (
        (r.responsible_email IS NOT NULL AND LOWER(r.responsible_email) = LOWER(u.email))
        OR (r.responsible_person IS NOT NULL AND LOWER(r.responsible_person) = LOWER(u.full_name))
      );
  END IF;
END $$;
