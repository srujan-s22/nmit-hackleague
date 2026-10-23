-- ==============================================================================
-- NMIT HACKLEAGUE — FORWARD-ONLY MIGRATION
-- Migration: 20261026000001_admin_onboarding_and_password_policy.sql
-- Purpose: Administrator Onboarding, Temporary Credential Expiration &
--          Mandatory Password Change State
--
-- Note: Per project security safety rules, this migration is forward-only.
-- Existing administrator and Super Admin records retain must_change_password = false
-- and onboarding_status = 'completed' to prevent unintended lockouts.
-- ==============================================================================

-- 1. Add server-controlled onboarding and credential-expiration columns to public.admin_profiles
ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'completed';

-- 2. Ensure valid onboarding_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_admin_profiles_onboarding_status'
  ) THEN
    ALTER TABLE public.admin_profiles
      ADD CONSTRAINT chk_admin_profiles_onboarding_status
      CHECK (onboarding_status IN ('pending', 'sent', 'email_failed', 'completed'));
  END IF;
END $$;

-- 3. Ensure all existing administrator and Super Admin accounts remain marked as completed
UPDATE public.admin_profiles
SET
  must_change_password = false,
  onboarding_status = 'completed'
WHERE must_change_password IS NULL OR onboarding_status IS NULL;

-- 4. Add index for quick onboarding state checks
CREATE INDEX IF NOT EXISTS idx_admin_profiles_onboarding_state
  ON public.admin_profiles (id, must_change_password, onboarding_expires_at);

COMMENT ON COLUMN public.admin_profiles.must_change_password IS
  'Server-controlled flag enforcing forced initial password change for newly provisioned administrators.';

COMMENT ON COLUMN public.admin_profiles.onboarding_expires_at IS
  'Timestamp after which initial temporary onboarding credentials are invalid (24-hour limit).';

COMMENT ON COLUMN public.admin_profiles.onboarding_status IS
  'Delivery and completion lifecycle state: pending, sent, email_failed, or completed.';
