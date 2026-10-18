-- ============================================================================
-- Migration: 20261015000001_phase4_revisions_and_push_gate.sql
-- Description: Phase 4 Implementation Plan v6.2.11:
--   1. In-charge Admin assignment on hackathons
--   2. Storage Deletion Queue State Machine & Provenance Columns
--   3. Submissions Evidence Lifecycle & Versioning Columns
--   4. User Device Push Subscriptions & Route Security
--   5. Universal Root-First Lock Protocol RPCs & Concurrency Guards
--   6. Legacy Worker Incompatibility Barrier
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. In-Charge Admin Assignment Model
-- ----------------------------------------------------------------------------
ALTER TABLE public.hackathons 
ADD COLUMN IF NOT EXISTS in_charge_admin_id UUID REFERENCES public.admin_profiles(id) ON DELETE RESTRICT;

-- Backfill existing hackathons from created_by where the creator is an admin
UPDATE public.hackathons h
SET in_charge_admin_id = h.created_by
WHERE in_charge_admin_id IS NULL
  AND EXISTS (SELECT 1 FROM public.admin_profiles a WHERE a.id = h.created_by);

-- RPC for Super Admin to reassign in-charge admin (Hardened Phase 5 implementation)
CREATE OR REPLACE FUNCTION public.reassign_hackathon_in_charge_admin(
  p_hackathon_id UUID,
  p_new_admin_id UUID,
  p_justification TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_target_is_super BOOLEAN;
  v_target_is_active BOOLEAN;
  v_is_eligible BOOLEAN;
  v_old_admin_id UUID;
  v_trimmed_justification TEXT;
BEGIN
  -- 1. Trust boundary: verify caller authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify caller is an active Super Admin
  SELECT (is_super_admin = true AND is_active = true) INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only Super Admins can reassign the in-charge admin.' USING ERRCODE = '42501';
  END IF;

  -- 3. Fail-closed on input parameters
  IF p_hackathon_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: hackathon ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  IF p_new_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target admin ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_justification := TRIM(COALESCE(p_justification, ''));
  IF LENGTH(v_trimmed_justification) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  -- 4. Tier 1 Lock: lock target hackathon FOR UPDATE
  SELECT in_charge_admin_id INTO v_old_admin_id
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  -- 5. No-op check: if target admin is already assigned, return cleanly
  IF v_old_admin_id = p_new_admin_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'hackathon_id', p_hackathon_id,
      'in_charge_admin_id', p_new_admin_id,
      'status_unchanged', true
    );
  END IF;

  -- 6. Tier 2 Lock: lock relevant admin profiles in deterministic ascending order
  IF v_old_admin_id IS NOT NULL THEN
    PERFORM 1 FROM public.admin_profiles
    WHERE id IN (v_old_admin_id, p_new_admin_id)
    ORDER BY id ASC
    FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.admin_profiles
    WHERE id = p_new_admin_id
    FOR UPDATE;
  END IF;

  -- 7. Validate target admin active status & eligibility
  SELECT is_super_admin, is_active
  INTO v_target_is_super, v_target_is_active
  FROM public.admin_profiles
  WHERE id = p_new_admin_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid argument: target admin does not exist.' USING ERRCODE = '22023';
  END IF;

  IF v_target_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid argument: target admin is inactive.' USING ERRCODE = '22023';
  END IF;

  -- Target must be Super Admin or hold manage_hackathons permission
  IF v_target_is_super IS TRUE THEN
    v_is_eligible := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.admin_permissions
      WHERE admin_id = p_new_admin_id
        AND permission = 'manage_hackathons'
    ) INTO v_is_eligible;
  END IF;

  IF v_is_eligible IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid argument: target admin is not eligible to manage hackathons. Grant manage_hackathons permission first.' USING ERRCODE = '22023';
  END IF;

  -- 8. Execute assignment mutation
  UPDATE public.hackathons
  SET in_charge_admin_id = p_new_admin_id,
      updated_at = now()
  WHERE id = p_hackathon_id;

  -- 9. Write immutable audit log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    'super_admin',
    'hackathon.in_charge_admin_reassigned',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'old_in_charge_admin_id', v_old_admin_id,
      'new_in_charge_admin_id', p_new_admin_id,
      'justification', v_trimmed_justification
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'in_charge_admin_id', p_new_admin_id,
    'old_in_charge_admin_id', v_old_admin_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.reassign_hackathon_in_charge_admin(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_hackathon_in_charge_admin(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Submissions Table Enhancements: Lifecycle & Provenance
-- ----------------------------------------------------------------------------
ALTER TABLE public.submissions 
ADD COLUMN IF NOT EXISTS evidence_lifecycle_state TEXT NOT NULL DEFAULT 'unuploaded';

ALTER TABLE public.submissions 
DROP CONSTRAINT IF EXISTS chk_submissions_evidence_lifecycle;

ALTER TABLE public.submissions 
ADD CONSTRAINT chk_submissions_evidence_lifecycle CHECK (
  evidence_lifecycle_state IN (
    'unuploaded',
    'uploaded',
    'purged_worker_confirmed',
    'absent_reconciled_post_timeout',
    'absent_external_untracked',
    'uncertain_investigation'
  )
);

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS evidence_sha256 TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS evidence_uploaded_at TIMESTAMPTZ;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS evidence_absence_recorded_at TIMESTAMPTZ;

-- Update column protection trigger to allow evidence lifecycle modifications by service_role
CREATE OR REPLACE FUNCTION public.protect_submission_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Immutable structural linkages and creation timestamp
  IF (OLD.hackathon_id <> NEW.hackathon_id OR
      OLD.round_id <> NEW.round_id OR
      OLD.team_id <> NEW.team_id OR
      OLD.submitted_by <> NEW.submitted_by OR
      OLD.created_at <> NEW.created_at) THEN
    RAISE EXCEPTION 'Cannot alter structural submission linkages (hackathon, round, team, submitted_by, created_at).';
  END IF;

  -- Non-admin updates cannot alter review status, evidence_deleted_at, or evidence_lifecycle_state
  IF NOT (
    public.current_has_permission('manage_hackathons') OR
    public.current_is_super_admin() OR
    (auth.role() IS NOT NULL AND auth.role() = 'service_role')
  ) THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'Students cannot alter submission review status.';
    END IF;
    IF OLD.evidence_deleted_at IS DISTINCT FROM NEW.evidence_deleted_at THEN
      RAISE EXCEPTION 'Students cannot alter evidence deletion timestamps.';
    END IF;
    IF OLD.evidence_lifecycle_state IS DISTINCT FROM NEW.evidence_lifecycle_state AND NEW.evidence_lifecycle_state NOT IN ('uploaded') THEN
      RAISE EXCEPTION 'Students cannot alter terminal evidence lifecycle states.';
    END IF;
  END IF;

  -- Admin updates cannot alter student submission content (title, description, repos, evidence_path, version)
  IF (public.current_has_permission('manage_hackathons') OR public.current_is_super_admin()) AND NOT public.current_is_team_member(OLD.team_id) THEN
    IF (OLD.title IS DISTINCT FROM NEW.title OR
        OLD.description IS DISTINCT FROM NEW.description OR
        OLD.repo_url IS DISTINCT FROM NEW.repo_url OR
        OLD.demo_url IS DISTINCT FROM NEW.demo_url OR
        OLD.evidence_path IS DISTINCT FROM NEW.evidence_path OR
        OLD.version IS DISTINCT FROM NEW.version) THEN
      RAISE EXCEPTION 'Administrators cannot modify student submission payload; only review status and administrative metadata may be updated.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 3. Storage Deletion Queue Schema & State Machine
-- ----------------------------------------------------------------------------
ALTER TABLE public.storage_deletion_queue 
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE;

ALTER TABLE public.storage_deletion_queue 
ADD COLUMN IF NOT EXISTS retention_deadline_at TIMESTAMPTZ;

ALTER TABLE public.storage_deletion_queue 
ADD COLUMN IF NOT EXISTS dispatch_attempted_at TIMESTAMPTZ;

ALTER TABLE public.storage_deletion_queue 
ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;

ALTER TABLE public.storage_deletion_queue 
ADD COLUMN IF NOT EXISTS deletion_outcome TEXT;

-- Drop and recreate the status constraint with the 8 authoritative states
ALTER TABLE public.storage_deletion_queue 
DROP CONSTRAINT IF EXISTS chk_storage_queue_status;

ALTER TABLE public.storage_deletion_queue 
ADD CONSTRAINT chk_storage_queue_status CHECK (
  status IN (
    'pending',
    'claimed',
    'dispatching',
    'cooldown',
    'reconciling',
    'investigation_required',
    'completed',
    'failed'
  )
);

-- Recreate indexes to reflect non-terminal states and preserve legacy enqueue compatibility
DROP INDEX IF EXISTS public.uq_storage_queue_active_job;
CREATE UNIQUE INDEX uq_storage_queue_active_job ON public.storage_deletion_queue (bucket_id, object_path) 
WHERE (status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_storage_queue_active_processing ON public.storage_deletion_queue (bucket_id, object_path) 
WHERE (status IN ('pending', 'processing'));

DROP INDEX IF EXISTS public.idx_storage_queue_poll;
CREATE INDEX idx_storage_queue_poll ON public.storage_deletion_queue (event_id, status, retention_deadline_at, next_retry_at);

-- ----------------------------------------------------------------------------
-- 4. User Device Push Subscriptions & Route Security
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL,
  user_agent TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_sub_user ON public.user_push_subscriptions(user_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_push_user_device ON public.user_push_subscriptions(user_id, device_fingerprint) WHERE active = true;

CREATE TRIGGER trg_user_push_subscriptions_updated_at
BEFORE UPDATE ON public.user_push_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions" 
ON public.user_push_subscriptions FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions" 
ON public.user_push_subscriptions FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions" 
ON public.user_push_subscriptions FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- Push subscription registration RPC
CREATE OR REPLACE FUNCTION public.register_push_subscription(
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_device_fingerprint TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sub_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_endpoint IS NULL OR p_endpoint = '' OR p_p256dh IS NULL OR p_auth IS NULL OR p_device_fingerprint IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: push credentials and device fingerprint are required.' USING ERRCODE = '22023';
  END IF;

  -- Deactivate any previous active subscription for this device fingerprint
  UPDATE public.user_push_subscriptions
  SET active = false,
      updated_at = now()
  WHERE user_id = v_user_id
    AND device_fingerprint = p_device_fingerprint
    AND active = true;

  -- Insert or update subscription
  INSERT INTO public.user_push_subscriptions (
    user_id, endpoint, p256dh, auth, device_fingerprint, user_agent, active
  ) VALUES (
    v_user_id, p_endpoint, p_p256dh, p_auth, p_device_fingerprint, p_user_agent, true
  )
  ON CONFLICT (endpoint) DO UPDATE
  SET user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      device_fingerprint = EXCLUDED.device_fingerprint,
      user_agent = EXCLUDED.user_agent,
      active = true,
      updated_at = now()
  RETURNING id INTO v_sub_id;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub_id,
    'device_fingerprint', p_device_fingerprint
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.register_push_subscription(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_subscription(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- Push subscription deactivation RPC
CREATE OR REPLACE FUNCTION public.deactivate_push_subscription(
  p_device_fingerprint TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_push_subscriptions
  SET active = false,
      updated_at = now()
  WHERE user_id = v_user_id
    AND device_fingerprint = p_device_fingerprint
    AND active = true;

  RETURN jsonb_build_object(
    'success', true,
    'device_fingerprint', p_device_fingerprint
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.deactivate_push_subscription(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_push_subscription(TEXT) TO authenticated;

-- Helper to check if user has active push registered
CREATE OR REPLACE FUNCTION public.is_push_registered(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_push_subscriptions
    WHERE user_id = p_user_id
      AND active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.is_push_registered(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_push_registered(UUID) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Legacy Worker Incompatibility Barrier
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_storage_deletion_jobs(
  p_worker_id TEXT,
  p_batch_size INT,
  p_lease_seconds INT
)
RETURNS TABLE (
  job_id UUID,
  bucket_id TEXT,
  object_path TEXT,
  target_type TEXT,
  target_id TEXT,
  lease_token UUID,
  leased_until TIMESTAMPTZ
) AS $$
BEGIN
  RAISE EXCEPTION 'FATAL: Legacy storage deletion worker (Migration 10) is incompatible with Migration 15 retention rules.'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.claim_storage_deletion_jobs(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_storage_deletion_jobs(TEXT, INT, INT) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. Universal Root-First Lock Protocol RPCs
-- ----------------------------------------------------------------------------

-- A. claim_storage_deletion_batch (Single-Parent Batch Claim with Stale Candidate Re-validation)
CREATE OR REPLACE FUNCTION public.claim_storage_deletion_batch(
  p_worker_id TEXT,
  p_batch_size INT DEFAULT 25,
  p_lease_seconds INT DEFAULT 30
)
RETURNS TABLE (
  job_id UUID,
  event_id UUID,
  bucket_id TEXT,
  object_path TEXT,
  target_id UUID,
  lease_token UUID,
  leased_until TIMESTAMPTZ
) AS $$
DECLARE
  v_candidate RECORD;
  v_locked_hackathon_id UUID;
  v_eligible_count INT;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.' USING ERRCODE = '42501';
  END IF;

  -- SCAN LOOP: Iterate candidate events in deterministic PK ASC order.
  FOR v_candidate IN (
    SELECT DISTINCT q.event_id
    FROM public.storage_deletion_queue q
    WHERE q.status = 'pending'
      AND q.retention_deadline_at <= now()
      AND q.event_id IS NOT NULL
    ORDER BY q.event_id ASC
    LIMIT 10
  ) LOOP
    -- STATEMENT 1: Attempt to acquire Level 1 parent lock on the candidate.
    SELECT h.id INTO v_locked_hackathon_id
    FROM public.hackathons h
    WHERE h.id = v_candidate.event_id
    FOR UPDATE SKIP LOCKED;

    IF v_locked_hackathon_id IS NULL THEN
      CONTINUE;
    END IF;

    -- STATEMENT 2 (AUTHORITATIVE RE-VALIDATION UNDER LOCK):
    SELECT COUNT(*) INTO v_eligible_count
    FROM public.storage_deletion_queue q
    WHERE q.event_id = v_locked_hackathon_id
      AND q.status = 'pending'
      AND q.retention_deadline_at <= now();

    IF v_eligible_count = 0 THEN
      CONTINUE;
    END IF;

    -- STATEMENT 3: Deterministically claim eligible jobs belonging strictly to locked parent root.
    RETURN QUERY
    WITH candidate_jobs AS (
      SELECT q.id
      FROM public.storage_deletion_queue q
      WHERE q.event_id = v_locked_hackathon_id
        AND q.status = 'pending'
        AND q.retention_deadline_at <= now()
      ORDER BY q.id ASC
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.storage_deletion_queue u
    SET status = 'claimed',
        leased_by = p_worker_id,
        leased_until = now() + (p_lease_seconds || ' seconds')::interval,
        lease_token = gen_random_uuid(),
        updated_at = now()
    FROM candidate_jobs c
    WHERE u.id = c.id
    RETURNING u.id, u.event_id, u.bucket_id, u.object_path, u.target_id::uuid, u.lease_token, u.leased_until;

    RETURN;
  END LOOP;

  -- STATEMENT 4: Claim non-event jobs (e.g. profile_college_id where event_id IS NULL)
  RETURN QUERY
  WITH candidate_jobs AS (
    SELECT q.id
    FROM public.storage_deletion_queue q
    WHERE q.event_id IS NULL
      AND q.status = 'pending'
      AND (q.retention_deadline_at IS NULL OR q.retention_deadline_at <= now())
    ORDER BY q.id ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.storage_deletion_queue u
  SET status = 'claimed',
      leased_by = p_worker_id,
      leased_until = now() + (p_lease_seconds || ' seconds')::interval,
      lease_token = gen_random_uuid(),
      updated_at = now()
  FROM candidate_jobs c
  WHERE u.id = c.id
  RETURNING u.id, u.event_id, u.bucket_id, u.object_path, u.target_id::uuid, u.lease_token, u.leased_until;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.claim_storage_deletion_batch(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_storage_deletion_batch(TEXT, INT, INT) TO service_role;

-- B. confirm_deletion_preflight
CREATE OR REPLACE FUNCTION public.confirm_deletion_preflight(
  p_job_id UUID,
  p_lease_token UUID
)
RETURNS TABLE (
  job_id UUID,
  event_id UUID,
  bucket_id TEXT,
  object_path TEXT,
  target_id UUID,
  lease_token UUID,
  leased_until TIMESTAMPTZ
) AS $$
DECLARE
  v_job_snapshot RECORD;
  v_locked_job RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.' USING ERRCODE = '42501';
  END IF;

  SELECT q.event_id, q.target_id, q.object_path, q.bucket_id, q.status, q.lease_token, q.leased_until
  INTO v_job_snapshot
  FROM public.storage_deletion_queue q
  WHERE q.id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id USING ERRCODE = '22023';
  END IF;

  -- Level 1 Lock: Parent Hackathon (if event-scoped)
  IF v_job_snapshot.event_id IS NOT NULL THEN
    PERFORM 1 FROM public.hackathons WHERE id = v_job_snapshot.event_id FOR UPDATE;
  END IF;

  -- Level 4 Lock: Deletion Queue Row
  SELECT * INTO v_locked_job
  FROM public.storage_deletion_queue
  WHERE id = p_job_id
  FOR UPDATE;

  IF v_locked_job.status <> 'claimed' OR v_locked_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Preflight rejected for job %: status is %, lease token mismatch.', p_job_id, v_locked_job.status
      USING ERRCODE = '55P03';
  END IF;

  IF v_locked_job.leased_until < now() THEN
    RAISE EXCEPTION 'Preflight rejected for job %: lease expired at %.', p_job_id, v_locked_job.leased_until
      USING ERRCODE = '55P03';
  END IF;

  -- Transition to dispatching, stamp dispatch_attempted_at, refresh lease for external call
  UPDATE public.storage_deletion_queue
  SET status = 'dispatching',
      dispatch_attempted_at = now(),
      leased_until = now() + interval '30 seconds',
      updated_at = now()
  WHERE id = p_job_id;

  RETURN QUERY
  SELECT q.id, q.event_id, q.bucket_id, q.object_path, q.target_id::uuid, q.lease_token, q.leased_until
  FROM public.storage_deletion_queue q
  WHERE q.id = p_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.confirm_deletion_preflight(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_deletion_preflight(UUID, UUID) TO service_role;

-- Drop deprecated 2-argument signature from Migration 10 so it does not collide with the 3-arg default signature
DROP FUNCTION IF EXISTS public.complete_storage_deletion_job(UUID, UUID);

-- D. fail_storage_deletion_job (Updated for Phase 4 state lifecycle: claimed, dispatching, processing)
CREATE OR REPLACE FUNCTION public.fail_storage_deletion_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_error TEXT
)
RETURNS VOID AS $$
DECLARE
  v_job RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job FROM public.storage_deletion_queue WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job % not found.', p_job_id USING ERRCODE = '22023'; END IF;

  IF v_job.status NOT IN ('claimed', 'dispatching', 'processing') OR v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Lease token mismatch for job %. Worker does not own this job.', p_job_id USING ERRCODE = '55P03';
  END IF;

  IF v_job.leased_until < now() THEN
    RAISE EXCEPTION 'Lease for job % has expired. Failure report rejected.', p_job_id USING ERRCODE = '55P03';
  END IF;

  IF v_job.retry_count + 1 >= v_job.max_retries THEN
    UPDATE public.storage_deletion_queue
    SET status = 'failed',
        retry_count = retry_count + 1,
        last_error = p_error,
        lease_token = NULL,
        leased_by = NULL,
        leased_until = NULL,
        updated_at = now()
    WHERE id = p_job_id;

    INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
    VALUES (
      NULL,
      'system',
      'storage_deletion.permanent_failure',
      'storage_queue',
      p_job_id::text,
      jsonb_build_object(
        'error', p_error,
        'retry_count', v_job.retry_count + 1,
        'target_type', v_job.target_type,
        'object_path', v_job.object_path
      )
    );
  ELSE
    UPDATE public.storage_deletion_queue
    SET status = 'pending',
        retry_count = retry_count + 1,
        last_error = p_error,
        lease_token = NULL,
        leased_by = NULL,
        leased_until = NULL,
        next_retry_at = now() + (power(2, v_job.retry_count) || ' minutes')::interval,
        updated_at = now()
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fail_storage_deletion_job(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_storage_deletion_job(UUID, UUID, TEXT) TO service_role;

-- C. complete_storage_deletion_job (Root-First Lock Protocol, Unconditional Validation, Race Guards)
CREATE OR REPLACE FUNCTION public.complete_storage_deletion_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_http_status INT
)
RETURNS VOID AS $$
DECLARE
  v_job_snapshot RECORD;
  v_submission public.submissions%ROWTYPE;
  v_job RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.' USING ERRCODE = '42501';
  END IF;

  -- STEP 0: Authoritative snapshot lookup of queue row by PK (0 row locks acquired)
  SELECT id, event_id, target_type, target_id, object_path, bucket_id, status, lease_token, leased_until
  INTO v_job_snapshot
  FROM public.storage_deletion_queue
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found in deletion queue.', p_job_id USING ERRCODE = '22023';
  END IF;

  -- LEVEL 1 LOCK: Lock parent Hackathon root FIRST (if event-scoped)
  IF v_job_snapshot.event_id IS NOT NULL THEN
    PERFORM 1 FROM public.hackathons WHERE id = v_job_snapshot.event_id FOR SHARE;
  END IF;

  -- LEVEL 3 LOCK: Lock target Submission SECOND (if submission target)
  IF v_job_snapshot.target_type = 'submission_evidence' AND v_job_snapshot.target_id IS NOT NULL THEN
    SELECT * INTO v_submission
    FROM public.submissions
    WHERE id = v_job_snapshot.target_id::uuid
    FOR UPDATE;
  END IF;

  -- LEVEL 4 LOCK: Lock child Queue row THIRD
  SELECT * INTO v_job
  FROM public.storage_deletion_queue
  WHERE id = p_job_id
  FOR UPDATE;

  -- =========================================================================
  -- STEP 4: MANDATORY UNCONDITIONAL AUTHORIZATION & INVARIANT VALIDATION
  -- =========================================================================

  -- 4.1 Terminal-State Idempotency Barrier:
  IF v_job.status IN ('completed', 'failed') THEN
    RETURN;
  END IF;

  -- 4.2 State Machine Transition Guard:
  IF v_job.status <> 'dispatching' THEN
    RAISE EXCEPTION 'Invalid transition: job % is in status %, expected dispatching.', p_job_id, v_job.status
      USING ERRCODE = '55P03';
  END IF;

  -- 4.3 Lease Token Ownership Guard:
  IF v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Lease token mismatch for job %. Worker does not hold active lease.', p_job_id
      USING ERRCODE = '55P03';
  END IF;

  -- 4.4 Lease Expiration Guard (Serialized with Quarantine):
  IF v_job.leased_until < now() THEN
    RAISE EXCEPTION 'Lease for job % has expired (leased_until: %). Completion rejected.', p_job_id, v_job.leased_until
      USING ERRCODE = '55P03';
  END IF;

  -- 4.5 Database-Derived Integrity Check:
  IF v_job.event_id IS DISTINCT FROM v_job_snapshot.event_id OR
     v_job.target_id IS DISTINCT FROM v_job_snapshot.target_id OR
     v_job.object_path IS DISTINCT FROM v_job_snapshot.object_path THEN
    RAISE EXCEPTION 'Database metadata anomaly detected for job %. Aborting transaction.', p_job_id
      USING ERRCODE = 'XX000';
  END IF;

  -- =========================================================================
  -- STEP 5: AUTHORIZED STATE MUTATIONS
  -- =========================================================================

  -- BRANCH A: Target Submission is Missing / Orphaned (Legitimate Orphan Cleanup)
  IF v_job.target_type = 'submission_evidence' AND v_submission.id IS NULL THEN
    IF p_http_status IN (200, 204) THEN
      UPDATE public.storage_deletion_queue
      SET status = 'completed',
          deletion_outcome = 'PURGED_ORPHANED_OBJECT',
          lease_token = NULL,
          leased_until = NULL,
          completed_at = now(),
          updated_at = now()
      WHERE id = p_job_id;

      INSERT INTO public.audit_logs (
        actor_id, actor_role, action, target_type, target_id, details
      ) VALUES (
        NULL, 'service_role', 'orphaned_object_purged', 'storage_deletion_queue', p_job_id::text,
        jsonb_build_object('job_id', p_job_id, 'object_path', v_job.object_path, 'target_id', v_job.target_id)
      );
    ELSE
      UPDATE public.storage_deletion_queue
      SET status = 'investigation_required',
          deletion_outcome = 'UNCERTAIN_ORPHANED_OBJECT_FAILURE',
          updated_at = now()
      WHERE id = p_job_id;

      INSERT INTO public.audit_logs (
        actor_id, actor_role, action, target_type, target_id, details
      ) VALUES (
        NULL, 'service_role', 'orphaned_object_deletion_failed', 'storage_deletion_queue', p_job_id::text,
        jsonb_build_object('job_id', p_job_id, 'object_path', v_job.object_path, 'http_status', p_http_status)
      );
    END IF;
    RETURN;
  END IF;

  -- BRANCH B: Replacement Upload Isolation (Path Mismatch)
  IF v_job.target_type = 'submission_evidence' AND v_submission.id IS NOT NULL AND v_submission.evidence_path IS DISTINCT FROM v_job.object_path THEN
    IF p_http_status IN (200, 204) THEN
      UPDATE public.storage_deletion_queue
      SET status = 'completed',
          deletion_outcome = 'PURGED_SUPERSEDED_VERSION',
          lease_token = NULL,
          leased_until = NULL,
          completed_at = now(),
          updated_at = now()
      WHERE id = p_job_id;
    ELSE
      UPDATE public.storage_deletion_queue
      SET status = 'investigation_required',
          deletion_outcome = 'UNCERTAIN_SUPERSEDED_VERSION_INVESTIGATION',
          updated_at = now()
      WHERE id = p_job_id;
    END IF;

    -- Active submission row remains 100% untouched
    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      NULL, 'service_role', 'superseded_version_resolved', 'storage_deletion_queue', p_job_id::text,
      jsonb_build_object(
        'submission_id', v_submission.id,
        'superseded_path', v_job.object_path,
        'active_path', v_submission.evidence_path,
        'outcome', (SELECT deletion_outcome FROM public.storage_deletion_queue WHERE id = p_job_id)
      )
    );
    RETURN;
  END IF;

  -- BRANCH C: Active Current Version (Path Match)
  IF p_http_status IN (200, 204) THEN
    UPDATE public.storage_deletion_queue
    SET status = 'completed',
        deletion_outcome = 'PURGED_WORKER_CONFIRMED',
        lease_token = NULL,
        leased_until = NULL,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_job_id;

    IF v_job.target_type = 'submission_evidence' AND v_submission.id IS NOT NULL THEN
      UPDATE public.submissions
      SET evidence_lifecycle_state = 'purged_worker_confirmed',
          evidence_deleted_at = now(),
          updated_at = now()
      WHERE id = v_submission.id;
    END IF;

    -- Handle profile college_id if applicable
    IF v_job.target_type = 'profile_college_id' THEN
      UPDATE public.profiles
      SET college_id_path = NULL,
          college_id_deleted_at = now()
      WHERE id = v_job.target_id::uuid
        AND (college_id_path = v_job.object_path OR college_id_path IS NULL);
    END IF;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      NULL, 'service_role', 'evidence_purged_worker_confirmed', 'storage_deletion_queue', p_job_id::text,
      jsonb_build_object('target_id', v_job.target_id, 'object_path', v_job.object_path)
    );
  ELSE
    UPDATE public.storage_deletion_queue
    SET status = 'investigation_required',
        deletion_outcome = 'UNCERTAIN_DISPATCH_FAILURE',
        updated_at = now()
    WHERE id = p_job_id;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      NULL, 'service_role', 'evidence_deletion_dispatch_failed', 'storage_deletion_queue', p_job_id::text,
      jsonb_build_object('target_id', v_job.target_id, 'http_status', p_http_status)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.complete_storage_deletion_job(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_storage_deletion_job(UUID, UUID, INT) TO service_role;

-- Backward compatible 2-argument overload for immediate college ID purge
CREATE OR REPLACE FUNCTION public.complete_storage_deletion_job(
  p_job_id UUID,
  p_lease_token UUID
)
RETURNS VOID AS $$
BEGIN
  PERFORM public.complete_storage_deletion_job(p_job_id, p_lease_token, 200);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.complete_storage_deletion_job(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_storage_deletion_job(UUID, UUID) TO service_role;

-- D. quarantine_expired_dispatches (Timeout Quarantine Sweeper)
CREATE OR REPLACE FUNCTION public.quarantine_expired_dispatches(
  p_batch_size INT DEFAULT 50,
  p_cooldown_seconds INT DEFAULT 120
)
RETURNS TABLE (
  quarantined_count INT
) AS $$
DECLARE
  v_count INT := 0;
  v_job RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.' USING ERRCODE = '42501';
  END IF;

  FOR v_job IN (
    SELECT q.id, q.event_id
    FROM public.storage_deletion_queue q
    WHERE q.status = 'dispatching'
      AND q.leased_until < now()
    ORDER BY q.leased_until ASC
    LIMIT p_batch_size
  ) LOOP
    -- Lock Level 1 if event-scoped
    IF v_job.event_id IS NOT NULL THEN
      PERFORM 1 FROM public.hackathons WHERE id = v_job.event_id FOR UPDATE SKIP LOCKED;
    END IF;

    -- Lock Level 4 and update strictly if still in dispatching state and lease expired
    UPDATE public.storage_deletion_queue u
    SET status = 'cooldown',
        cooldown_until = now() + (p_cooldown_seconds || ' seconds')::interval,
        deletion_outcome = 'RETRYABLE_DISPATCH_TIMEOUT',
        lease_token = NULL,
        leased_until = NULL,
        updated_at = now()
    WHERE u.id = v_job.id
      AND u.status = 'dispatching'
      AND u.leased_until < now();

    IF FOUND THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.quarantine_expired_dispatches(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quarantine_expired_dispatches(INT, INT) TO service_role;

-- E. claim_reconciliation_batch
CREATE OR REPLACE FUNCTION public.claim_reconciliation_batch(
  p_worker_id TEXT,
  p_batch_size INT DEFAULT 25,
  p_lease_seconds INT DEFAULT 30
)
RETURNS TABLE (
  job_id UUID,
  event_id UUID,
  bucket_id TEXT,
  object_path TEXT,
  target_id UUID,
  lease_token UUID,
  leased_until TIMESTAMPTZ
) AS $$
DECLARE
  v_candidate RECORD;
  v_locked_hackathon_id UUID;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.' USING ERRCODE = '42501';
  END IF;

  FOR v_candidate IN (
    SELECT DISTINCT q.event_id
    FROM public.storage_deletion_queue q
    WHERE q.status = 'cooldown'
      AND q.cooldown_until <= now()
      AND q.event_id IS NOT NULL
    ORDER BY q.event_id ASC
    LIMIT 10
  ) LOOP
    SELECT h.id INTO v_locked_hackathon_id
    FROM public.hackathons h
    WHERE h.id = v_candidate.event_id
    FOR UPDATE SKIP LOCKED;

    IF v_locked_hackathon_id IS NULL THEN
      CONTINUE;
    END IF;

    RETURN QUERY
    WITH candidate_jobs AS (
      SELECT q.id
      FROM public.storage_deletion_queue q
      WHERE q.event_id = v_locked_hackathon_id
        AND q.status = 'cooldown'
        AND q.cooldown_until <= now()
      ORDER BY q.id ASC
      LIMIT p_batch_size
      FOR UPDATE SKIP LOCKED
    )
    UPDATE public.storage_deletion_queue u
    SET status = 'reconciling',
        leased_by = p_worker_id,
        leased_until = now() + (p_lease_seconds || ' seconds')::interval,
        lease_token = gen_random_uuid(),
        updated_at = now()
    FROM candidate_jobs c
    WHERE u.id = c.id
    RETURNING u.id, u.event_id, u.bucket_id, u.object_path, u.target_id::uuid, u.lease_token, u.leased_until;

    RETURN;
  END LOOP;

  -- Claim non-event reconciliation jobs (where event_id IS NULL)
  RETURN QUERY
  WITH candidate_jobs AS (
    SELECT q.id
    FROM public.storage_deletion_queue q
    WHERE q.event_id IS NULL
      AND q.status = 'cooldown'
      AND q.cooldown_until <= now()
    ORDER BY q.id ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.storage_deletion_queue u
  SET status = 'reconciling',
      leased_by = p_worker_id,
      leased_until = now() + (p_lease_seconds || ' seconds')::interval,
      lease_token = gen_random_uuid(),
      updated_at = now()
  FROM candidate_jobs c
  WHERE u.id = c.id
  RETURNING u.id, u.event_id, u.bucket_id, u.object_path, u.target_id::uuid, u.lease_token, u.leased_until;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.claim_reconciliation_batch(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reconciliation_batch(TEXT, INT, INT) TO service_role;

-- F. resolve_reconciliation_job
CREATE OR REPLACE FUNCTION public.resolve_reconciliation_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_http_status INT
)
RETURNS VOID AS $$
DECLARE
  v_job_snapshot RECORD;
  v_submission public.submissions%ROWTYPE;
  v_job RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.' USING ERRCODE = '42501';
  END IF;

  SELECT id, event_id, target_type, target_id, object_path, bucket_id, status, lease_token, leased_until, retry_count, max_retries
  INTO v_job_snapshot
  FROM public.storage_deletion_queue
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found in deletion queue.', p_job_id USING ERRCODE = '22023';
  END IF;

  IF v_job_snapshot.event_id IS NOT NULL THEN
    PERFORM 1 FROM public.hackathons WHERE id = v_job_snapshot.event_id FOR SHARE;
  END IF;

  IF v_job_snapshot.target_type = 'submission_evidence' AND v_job_snapshot.target_id IS NOT NULL THEN
    SELECT * INTO v_submission
    FROM public.submissions
    WHERE id = v_job_snapshot.target_id::uuid
    FOR UPDATE;
  END IF;

  SELECT * INTO v_job
  FROM public.storage_deletion_queue
  WHERE id = p_job_id
  FOR UPDATE;

  -- Idempotency barrier
  IF v_job.status IN ('completed', 'failed') THEN
    RETURN;
  END IF;

  IF v_job.status <> 'reconciling' OR v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Reconciliation rejected for job %: status is %, lease mismatch.', p_job_id, v_job.status
      USING ERRCODE = '55P03';
  END IF;

  IF v_job.leased_until < now() THEN
    RAISE EXCEPTION 'Reconciliation lease for job % expired at %.', p_job_id, v_job.leased_until
      USING ERRCODE = '55P03';
  END IF;

  -- 1. HTTP HEAD 404: Verified Absence in S3
  IF p_http_status = 404 THEN
    IF v_submission.id IS NOT NULL AND v_submission.evidence_path IS DISTINCT FROM v_job.object_path THEN
      -- Superseded version absent
      UPDATE public.storage_deletion_queue
      SET status = 'completed',
          deletion_outcome = 'ABSENT_RECONCILED_SUPERSEDED_VERSION',
          lease_token = NULL,
          leased_until = NULL,
          completed_at = now(),
          updated_at = now()
      WHERE id = p_job_id;
    ELSE
      -- Active version absent
      UPDATE public.storage_deletion_queue
      SET status = 'completed',
          deletion_outcome = 'ABSENT_RECONCILED_POST_TIMEOUT',
          lease_token = NULL,
          leased_until = NULL,
          completed_at = now(),
          updated_at = now()
      WHERE id = p_job_id;

      IF v_submission.id IS NOT NULL THEN
        UPDATE public.submissions
        SET evidence_lifecycle_state = 'absent_reconciled_post_timeout',
            evidence_absence_recorded_at = now(),
            updated_at = now()
        WHERE id = v_submission.id;
      END IF;
    END IF;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      NULL, 'service_role', 'reconciliation_verified_absent', 'storage_deletion_queue', p_job_id::text,
      jsonb_build_object('job_id', p_job_id, 'object_path', v_job.object_path)
    );
    RETURN;
  END IF;

  -- 2. HTTP HEAD 200: Object is Still Present in S3
  IF p_http_status = 200 THEN
    IF v_job.retry_count < v_job.max_retries THEN
      UPDATE public.storage_deletion_queue
      SET status = 'pending',
          next_retry_at = now() + (v_job.retry_count * interval '300 seconds'),
          retry_count = v_job.retry_count + 1,
          lease_token = NULL,
          leased_until = NULL,
          updated_at = now()
      WHERE id = p_job_id;
    ELSE
      UPDATE public.storage_deletion_queue
      SET status = 'investigation_required',
          deletion_outcome = 'UNCERTAIN_PERSISTENT_OBJECT_REMAINING',
          lease_token = NULL,
          leased_until = NULL,
          updated_at = now()
      WHERE id = p_job_id;
    END IF;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      NULL, 'service_role', 'reconciliation_object_present', 'storage_deletion_queue', p_job_id::text,
      jsonb_build_object('job_id', p_job_id, 'object_path', v_job.object_path, 'retry_count', v_job.retry_count)
    );
    RETURN;
  END IF;

  -- 3. Storage Outage or Other Error
  UPDATE public.storage_deletion_queue
  SET status = 'investigation_required',
      deletion_outcome = 'UNCERTAIN_STORAGE_OUTAGE',
      lease_token = NULL,
      leased_until = NULL,
      updated_at = now()
  WHERE id = p_job_id;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    NULL, 'service_role', 'reconciliation_uncertain_outage', 'storage_deletion_queue', p_job_id::text,
    jsonb_build_object('job_id', p_job_id, 'http_status', p_http_status)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.resolve_reconciliation_job(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_reconciliation_job(UUID, UUID, INT) TO service_role;

-- G. resolve_investigation_job (Super Admin Audited Resolution)
CREATE OR REPLACE FUNCTION public.resolve_investigation_job(
  p_job_id UUID,
  p_action TEXT,
  p_justification TEXT,
  p_ticket_reference TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_job RECORD;
  v_trimmed_justification TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT is_super_admin INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only Super Admins can resolve investigation jobs.' USING ERRCODE = '42501';
  END IF;

  v_trimmed_justification := TRIM(COALESCE(p_justification, ''));
  IF LENGTH(v_trimmed_justification) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_job
  FROM public.storage_deletion_queue
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found.', p_job_id USING ERRCODE = 'P0002';
  END IF;

  IF v_job.status <> 'investigation_required' THEN
    RAISE EXCEPTION 'Job % is not in investigation_required state (current status: %).', p_job_id, v_job.status
      USING ERRCODE = '55P03';
  END IF;

  IF p_action = 'REPLAY_PENDING' THEN
    UPDATE public.storage_deletion_queue
    SET status = 'pending',
        retention_deadline_at = COALESCE(
          (SELECT event_end_at FROM public.hackathons WHERE id = v_job.event_id) + interval '7 days',
          now()
        ),
        retry_count = 0,
        next_retry_at = now(),
        lease_token = NULL,
        leased_until = NULL,
        updated_at = now()
    WHERE id = p_job_id;
  ELSIF p_action = 'MARK_COMPLETED_CONFIRMED_ABSENT' THEN
    UPDATE public.storage_deletion_queue
    SET status = 'completed',
        deletion_outcome = 'MANUAL_SUPER_ADMIN_CONFIRMED_ABSENT',
        lease_token = NULL,
        leased_until = NULL,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_job_id;
  ELSIF p_action = 'MARK_FAILED_UNRECOVERABLE' THEN
    UPDATE public.storage_deletion_queue
    SET status = 'failed',
        deletion_outcome = 'MANUAL_SUPER_ADMIN_UNRECOVERABLE',
        lease_token = NULL,
        leased_until = NULL,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_job_id;
  ELSE
    RAISE EXCEPTION 'Invalid action: % (permitted: REPLAY_PENDING, MARK_COMPLETED_CONFIRMED_ABSENT, MARK_FAILED_UNRECOVERABLE).', p_action
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    'super_admin',
    'storage_deletion_queue.investigation_resolved',
    'storage_deletion_queue',
    p_job_id::text,
    jsonb_build_object(
      'action', p_action,
      'justification', v_trimmed_justification,
      'ticket_reference', p_ticket_reference,
      'previous_outcome', v_job.deletion_outcome
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'job_id', p_job_id,
    'action', p_action
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.resolve_investigation_job(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_investigation_job(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- H. extend_hackathon_event_deadline (Plan A Extension Guard & Atomic 7-Day Retention Update)
CREATE OR REPLACE FUNCTION public.extend_hackathon_event_deadline(
  p_hackathon_id UUID,
  p_new_event_end_at TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_updated_queue_count INT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 5 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 5 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  -- LEVEL 1 LOCK: Lock Hackathon root FIRST
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Authorization check: Assigned in-charge admin or super admin
  SELECT is_super_admin INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF (v_is_super IS NOT TRUE) AND (v_hackathon.in_charge_admin_id IS DISTINCT FROM v_caller_id) THEN
    RAISE EXCEPTION 'Access denied: only the assigned in-charge Admin or a Super Admin may extend the event deadline.'
      USING ERRCODE = '42501';
  END IF;

  -- Require strictly later end timestamp (event shortening prohibited)
  IF p_new_event_end_at <= v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Invalid argument: new event end time (%) must be strictly later than current end time (%).',
      p_new_event_end_at, v_hackathon.event_end_at
      USING ERRCODE = '22023';
  END IF;

  -- PLAN A GUARD: Check if any deletion job is currently active, ambiguous, or unresolved
  IF EXISTS (
    SELECT 1 FROM public.storage_deletion_queue
    WHERE event_id = p_hackathon_id
      AND status IN ('claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required')
  ) THEN
    RAISE EXCEPTION 'Cannot extend hackathon deadline while evidence deletion is in progress or unresolved (Plan A guard). Please retry once deletion completes.'
      USING ERRCODE = '55P03';
  END IF;

  -- Mutate Hackathon event_end_at
  UPDATE public.hackathons
  SET event_end_at = p_new_event_end_at,
      updated_at = now()
  WHERE id = p_hackathon_id;

  -- Atomically update retention_deadline_at = new_event_end_at + 7 days for ALL pending jobs
  UPDATE public.storage_deletion_queue
  SET retention_deadline_at = p_new_event_end_at + interval '7 days',
      updated_at = now()
  WHERE event_id = p_hackathon_id
    AND status = 'pending';

  GET DIAGNOSTICS v_updated_queue_count = ROW_COUNT;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    CASE WHEN v_is_super THEN 'super_admin' ELSE 'admin' END,
    'hackathon.event_deadline_extended',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'old_event_end_at', v_hackathon.event_end_at,
      'new_event_end_at', p_new_event_end_at,
      'reason', v_trimmed_reason,
      'pending_jobs_retention_updated', v_updated_queue_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'old_event_end_at', v_hackathon.event_end_at,
    'new_event_end_at', p_new_event_end_at,
    'pending_jobs_retention_updated', v_updated_queue_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.extend_hackathon_event_deadline(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_hackathon_event_deadline(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- I. finalize_submission_upload (Root-First Lock: L1 -> L3 -> L4 -> L5)
CREATE OR REPLACE FUNCTION public.finalize_submission_upload(
  p_submission_id UUID,
  p_object_path TEXT,
  p_sha256 TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_submission RECORD;
  v_hackathon RECORD;
  v_job_id UUID;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() NOT IN ('service_role', 'authenticated')) THEN
    RAISE EXCEPTION 'Access denied.' USING ERRCODE = '42501';
  END IF;

  -- Preliminary lookup of hackathon_id
  SELECT hackathon_id INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission % not found.', p_submission_id USING ERRCODE = 'P0002';
  END IF;

  -- LEVEL 1 LOCK: Explicitly lock parent Hackathon FIRST (FOR SHARE)
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_submission.hackathon_id
  FOR SHARE;

  -- LEVEL 3 LOCK: Lock target Submission SECOND (FOR UPDATE)
  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  -- Update submission with versioned path and metadata
  UPDATE public.submissions
  SET evidence_path = p_object_path,
      evidence_sha256 = p_sha256,
      evidence_lifecycle_state = 'uploaded',
      evidence_uploaded_at = now(),
      evidence_deleted_at = NULL,
      updated_at = now()
  WHERE id = p_submission_id;

  -- LEVEL 4: Insert scheduled deletion job into queue
  INSERT INTO public.storage_deletion_queue (
    event_id,
    bucket_id,
    object_path,
    target_type,
    target_id,
    status,
    retention_deadline_at
  ) VALUES (
    v_hackathon.id,
    'submission-evidence',
    p_object_path,
    'submission_evidence',
    p_submission_id::text,
    'pending',
    v_hackathon.event_end_at + interval '7 days'
  )
  ON CONFLICT (bucket_id, object_path) WHERE (status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required'))
  DO UPDATE SET
    event_id = EXCLUDED.event_id,
    retention_deadline_at = EXCLUDED.retention_deadline_at,
    updated_at = now()
  RETURNING id INTO v_job_id;

  -- LEVEL 5: Audit log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    auth.uid(), 'authenticated', 'submission.evidence_upload_finalized', 'submission', p_submission_id::text,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'object_path', p_object_path,
      'sha256', p_sha256,
      'deletion_job_id', v_job_id,
      'retention_deadline_at', v_hackathon.event_end_at + interval '7 days'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'object_path', p_object_path,
    'job_id', v_job_id,
    'retention_deadline_at', v_hackathon.event_end_at + interval '7 days'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.finalize_submission_upload(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_submission_upload(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 7. STORAGE OBJECT ROW-LEVEL SECURITY & PER-FILE SIZE ENFORCEMENT
-- ============================================================================

-- Ensure storage.buckets table is synchronized with approved limits
UPDATE storage.buckets
SET file_size_limit = 1048576, -- 1 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png']
WHERE id = 'profile-photos';

UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id = 'college-ids';

UPDATE storage.buckets
SET file_size_limit = 20971520, -- 20 MB
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/zip']
WHERE id = 'submission-evidence';

-- Drop legacy storage policies
DROP POLICY IF EXISTS "college_ids_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "submission_evidence_insert_member" ON storage.objects;
DROP POLICY IF EXISTS "submission_evidence_select" ON storage.objects;

-- Recreate college_ids_insert_own with size, extension, and MIME enforcement
CREATE POLICY "college_ids_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'college-ids' AND
  auth.uid()::text = (storage.foldername(name))[1] AND
  lower(name) NOT LIKE '%.svg' AND
  lower(name) NOT LIKE '%.exe' AND
  lower(name) NOT LIKE '%.bat' AND
  lower(name) NOT LIKE '%.sh' AND
  lower(name) NOT LIKE '%.bin' AND
  (
    -- Image files: strict 1.5 MB limit (1,572,864 bytes)
    (
      (lower(name) ~ '\.(jpg|jpeg|png)$' OR (metadata->>'mimetype') IN ('image/jpeg', 'image/png'))
      AND coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) <= 1572864
    )
    OR
    -- PDF documents: strict 5 MB limit (5,242,880 bytes)
    (
      (lower(name) ~ '\.pdf$' OR (metadata->>'mimetype') = 'application/pdf')
      AND coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) <= 5242880
    )
  )
);

-- Recreate profile_photos_insert_own with 1MB limit and extension enforcement
CREATE POLICY "profile_photos_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos' AND
  auth.uid()::text = (storage.foldername(name))[1] AND
  lower(name) NOT LIKE '%.svg' AND
  lower(name) NOT LIKE '%.exe' AND
  lower(name) ~ '\.(jpg|jpeg|png)$' AND
  coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) <= 1048576
);

-- Helper functions for submission evidence storage access (SECURITY DEFINER to decouple from direct base-table grants)
CREATE OR REPLACE FUNCTION public.can_upload_submission_evidence(
  p_hackathon_id UUID,
  p_submission_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.submissions s
    JOIN public.team_members tm ON tm.team_id = s.team_id
    JOIN public.hackathon_rounds r ON r.id = s.round_id
    WHERE s.id = p_submission_id
      AND s.hackathon_id = p_hackathon_id
      AND tm.student_id = auth.uid()
      AND r.status = 'open'
      AND now() <= r.end_at
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.can_upload_submission_evidence(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_submission_evidence(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_upload_team_round_evidence(
  p_team_id UUID,
  p_round_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN public.current_is_team_member(p_team_id) AND EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.id = p_round_id
      AND r.status = 'open'
      AND now() <= r.end_at
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.can_upload_team_round_evidence(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_team_round_evidence(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_submission_evidence(
  p_submission_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.submissions s
    JOIN public.team_members tm ON tm.team_id = s.team_id
    WHERE s.id = p_submission_id
      AND tm.student_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.can_view_submission_evidence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_submission_evidence(UUID) TO authenticated;

-- Recreate submission_evidence_insert_member supporting both evidence/ and teams/ paths
CREATE POLICY "submission_evidence_insert_member" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'submission-evidence' AND
  lower(name) NOT LIKE '%.svg' AND
  lower(name) NOT LIKE '%.exe' AND
  lower(name) NOT LIKE '%.bat' AND
  lower(name) NOT LIKE '%.sh' AND
  lower(name) NOT LIKE '%.bin' AND
  (
    -- Per-file size enforcement:
    -- Images: max 1 MB (1,048,576 bytes)
    (
      (lower(name) ~ '\.(jpg|jpeg|png)$' OR (metadata->>'mimetype') IN ('image/jpeg', 'image/png'))
      AND coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) <= 1048576
    )
    OR
    -- Documents / Archives: max 20 MB (20,971,520 bytes)
    (
      (lower(name) ~ '\.(pdf|zip)$' OR (metadata->>'mimetype') IN ('application/pdf', 'application/zip', 'application/x-zip-compressed'))
      AND coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) <= 20971520
    )
  ) AND
  (
    -- Format 1: evidence/{hackathon_id}/{submission_id}/{filename}
    (
      (storage.foldername(name))[1] = 'evidence' AND
      public.can_upload_submission_evidence(
        ((storage.foldername(name))[2])::uuid,
        ((storage.foldername(name))[3])::uuid
      )
    )
    OR
    -- Format 2: teams/{team_id}/rounds/{round_id}/{filename}
    (
      (storage.foldername(name))[1] = 'teams' AND
      (storage.foldername(name))[3] = 'rounds' AND
      public.can_upload_team_round_evidence(
        ((storage.foldername(name))[2])::uuid,
        ((storage.foldername(name))[4])::uuid
      )
    )
  )
);

-- Recreate submission_evidence_select supporting both formats
CREATE POLICY "submission_evidence_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'submission-evidence' AND (
    public.current_has_permission('manage_hackathons') OR
    public.current_is_super_admin() OR
    (
      (storage.foldername(name))[1] = 'evidence' AND
      public.can_view_submission_evidence(((storage.foldername(name))[3])::uuid)
    ) OR
    (
      (storage.foldername(name))[1] = 'teams' AND
      public.current_is_team_member(((storage.foldername(name))[2])::uuid)
    )
  )
);


-- Defense-in-Depth Database Trigger on storage.objects
CREATE OR REPLACE FUNCTION public.enforce_storage_object_invariants()
RETURNS TRIGGER AS $$
DECLARE
  v_size BIGINT := coalesce((NEW.metadata->>'size')::bigint, (NEW.metadata->>'contentLength')::bigint, 0);
  v_mime TEXT := coalesce(NEW.metadata->>'mimetype', '');
  v_name TEXT := lower(NEW.name);
BEGIN
  -- Strict prohibition of SVG and executables across all buckets
  IF v_name ~ '\.(svg|exe|bat|sh|bin|cmd|msi|vbs|jar|py)$' OR v_mime ILIKE '%svg%' THEN
    RAISE EXCEPTION 'Prohibited file type or extension: %', NEW.name USING ERRCODE = '42501';
  END IF;

  IF NEW.bucket_id = 'profile-photos' THEN
    IF v_size > 1048576 THEN
      RAISE EXCEPTION 'Profile photo exceeds maximum allowed limit of 1MB (size: % bytes).', v_size USING ERRCODE = '54000';
    END IF;
  ELSIF NEW.bucket_id = 'college-ids' THEN
    IF (v_name ~ '\.(jpg|jpeg|png)$' OR v_mime IN ('image/jpeg', 'image/png')) AND v_size > 1572864 THEN
      RAISE EXCEPTION 'College ID image exceeds maximum allowed limit of 1.5MB (size: % bytes).', v_size USING ERRCODE = '54000';
    ELSIF v_size > 5242880 THEN
      RAISE EXCEPTION 'College ID document exceeds maximum allowed limit of 5MB (size: % bytes).', v_size USING ERRCODE = '54000';
    END IF;
  ELSIF NEW.bucket_id = 'submission-evidence' THEN
    IF (v_name ~ '\.(jpg|jpeg|png)$' OR v_mime IN ('image/jpeg', 'image/png')) AND v_size > 1048576 THEN
      RAISE EXCEPTION 'Evidence image exceeds maximum allowed limit of 1MB (size: % bytes).', v_size USING ERRCODE = '54000';
    ELSIF v_size > 20971520 THEN
      RAISE EXCEPTION 'Submission evidence file exceeds maximum allowed limit of 20MB (size: % bytes).', v_size USING ERRCODE = '54000';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_storage_object_invariants ON storage.objects;
CREATE TRIGGER trg_enforce_storage_object_invariants
BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW
EXECUTE FUNCTION public.enforce_storage_object_invariants();

