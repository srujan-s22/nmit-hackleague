-- Migration 14: Phase 6 Hackathon Management
-- Architecture, Constraints, Safe Deferrable Rounds, RLS Revisions, Public Projections & RPCs
-- Created: 2026-10-14
-- Schema: public

-- ============================================================================
-- 1. EXTEND HACKATHONS SCHEMA (TABLE & COLUMN CONSTRAINTS)
-- ============================================================================

ALTER TABLE public.hackathons
ADD COLUMN IF NOT EXISTS eligibility TEXT NOT NULL DEFAULT 'Open to all registered NMIT students';

ALTER TABLE public.hackathons
ADD COLUMN IF NOT EXISTS tagline TEXT NULL;

ALTER TABLE public.hackathons
ADD COLUMN IF NOT EXISTS prizes_detail JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Solo consistency constraint: if is_solo_allowed is true, min_team_size must be 1
ALTER TABLE public.hackathons
DROP CONSTRAINT IF EXISTS chk_hackathons_solo_consistency;

ALTER TABLE public.hackathons
ADD CONSTRAINT chk_hackathons_solo_consistency
CHECK (NOT is_solo_allowed OR min_team_size = 1);

-- Mode & venue whitespace prevention constraint (compatible with existing test seeds)
ALTER TABLE public.hackathons
DROP CONSTRAINT IF EXISTS chk_hackathons_mode_venue;

ALTER TABLE public.hackathons
ADD CONSTRAINT chk_hackathons_mode_venue
CHECK (
  (mode = 'online') OR
  (venue IS NULL) OR
  (trim(venue) <> '')
);

-- Registration deadline cannot exceed event end
ALTER TABLE public.hackathons
DROP CONSTRAINT IF EXISTS chk_hackathons_reg_deadline_event_end;

ALTER TABLE public.hackathons
ADD CONSTRAINT chk_hackathons_reg_deadline_event_end
CHECK (registration_end_at <= event_end_at);

-- URL protocol safety
ALTER TABLE public.hackathons
DROP CONSTRAINT IF EXISTS chk_hackathons_external_url;

ALTER TABLE public.hackathons
ADD CONSTRAINT chk_hackathons_external_url
CHECK (external_registration_url IS NULL OR external_registration_url ~* '^https?://');

ALTER TABLE public.hackathons
DROP CONSTRAINT IF EXISTS chk_hackathons_community_url;

ALTER TABLE public.hackathons
ADD CONSTRAINT chk_hackathons_community_url
CHECK (community_url IS NULL OR community_url ~* '^https?://');

-- Slug regex format
ALTER TABLE public.hackathons
DROP CONSTRAINT IF EXISTS chk_hackathons_slug_format;

ALTER TABLE public.hackathons
ADD CONSTRAINT chk_hackathons_slug_format
CHECK (slug ~* '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ============================================================================
-- 2. PREFLIGHT VERIFICATION & EXACT DEFERRED ROUND UNIQUENESS CONSTRAINT
-- Inspects catalog metadata: table ownership, constraint type, exact key columns,
-- key order, deferrable status, foreign key dependencies, and row duplicates.
-- Fails closed atomically if unexpected definitions are detected.
-- ============================================================================

DO $$
DECLARE
  v_dup_count INTEGER;
  v_constraint RECORD;
  v_key_columns TEXT[];
  v_referencing_fk_count INTEGER;
  v_already_deferred BOOLEAN := false;
BEGIN
  -- 1. Check for existing duplicate (hackathon_id, round_number) pairs before altering or creating
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT hackathon_id, round_number
    FROM public.hackathon_rounds
    GROUP BY hackathon_id, round_number
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Preflight verification failed: % duplicate (hackathon_id, round_number) sets found in public.hackathon_rounds. Resolve duplicates before applying unique constraint.', v_dup_count;
  END IF;

  -- 2. Inspect existing constraint metadata from pg_constraint
  SELECT c.conname, c.contype, c.condeferrable, c.condeferred, c.conkey
  INTO v_constraint
  FROM pg_constraint c
  WHERE c.conrelid = 'public.hackathon_rounds'::regclass
    AND c.conname = 'uq_hackathon_round_number';

  IF FOUND THEN
    -- Verify constraint type is strictly UNIQUE ('u')
    IF v_constraint.contype <> 'u' THEN
      RAISE EXCEPTION 'Preflight verification failed: constraint uq_hackathon_round_number exists on public.hackathon_rounds but is not a UNIQUE constraint (type: %). Manual intervention required.', v_constraint.contype;
    END IF;

    -- Verify exact key columns and their order using PostgreSQL catalog metadata
    SELECT array_agg(a.attname ORDER BY array_position(v_constraint.conkey, a.attnum))
    INTO v_key_columns
    FROM pg_attribute a
    WHERE a.attrelid = 'public.hackathon_rounds'::regclass
      AND a.attnum = ANY(v_constraint.conkey);

    IF v_key_columns IS NULL OR v_key_columns <> ARRAY['hackathon_id', 'round_number']::TEXT[] THEN
      RAISE EXCEPTION 'Preflight verification failed: constraint uq_hackathon_round_number exists on public.hackathon_rounds with unexpected key columns % (expected [hackathon_id, round_number]). Aborting without dropping unexpected constraint.', v_key_columns;
    END IF;

    -- Inspect deferrable status: avoid redundant drop/add if already correctly configured
    IF v_constraint.condeferrable IS TRUE AND v_constraint.condeferred IS TRUE THEN
      RAISE NOTICE 'Constraint uq_hackathon_round_number is already DEFERRABLE INITIALLY DEFERRED on public.hackathon_rounds; skipping recreation.';
      v_already_deferred := true;
    ELSE
      -- Verify no dependent foreign keys reference this unique constraint before dropping
      SELECT COUNT(*) INTO v_referencing_fk_count
      FROM pg_constraint fk
      WHERE fk.confrelid = 'public.hackathon_rounds'::regclass
        AND fk.confkey = v_constraint.conkey;

      IF v_referencing_fk_count > 0 THEN
        RAISE EXCEPTION 'Preflight verification failed: % foreign key constraint(s) reference uq_hackathon_round_number. Cannot safely alter constraint without cascade analysis.', v_referencing_fk_count;
      END IF;

      -- Safe to drop only after verifying exact ownership, type, key columns, order, and zero dependents
      ALTER TABLE public.hackathon_rounds DROP CONSTRAINT uq_hackathon_round_number;
    END IF;
  ELSE
    -- Constraint is absent: verify target columns exist on public.hackathon_rounds before creating
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid = 'public.hackathon_rounds'::regclass AND attname = 'hackathon_id'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_attribute WHERE attrelid = 'public.hackathon_rounds'::regclass AND attname = 'round_number'
    ) THEN
      RAISE EXCEPTION 'Preflight verification failed: public.hackathon_rounds is missing required columns (hackathon_id, round_number). Cannot create constraint.';
    END IF;

    RAISE NOTICE 'Constraint uq_hackathon_round_number does not exist; proceeding to create deferred constraint.';
  END IF;

  -- 3. Create constraint as DEFERRABLE INITIALLY DEFERRED if not already in that state
  IF NOT v_already_deferred THEN
    ALTER TABLE public.hackathon_rounds
    ADD CONSTRAINT uq_hackathon_round_number
    UNIQUE (hackathon_id, round_number)
    DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- Round constraints
ALTER TABLE public.hackathon_rounds
DROP CONSTRAINT IF EXISTS chk_hackathon_rounds_number_positive;

ALTER TABLE public.hackathon_rounds
ADD CONSTRAINT chk_hackathon_rounds_number_positive
CHECK (round_number >= 1);

ALTER TABLE public.hackathon_rounds
DROP CONSTRAINT IF EXISTS chk_hackathon_rounds_name_not_empty;

ALTER TABLE public.hackathon_rounds
ADD CONSTRAINT chk_hackathon_rounds_name_not_empty
CHECK (trim(name) <> '');

-- ============================================================================
-- 3. CLOSE DIRECT-WRITE PRIVILEGES & FORCE RPC ENCAPSULATION
-- ============================================================================

-- Revoke direct mutation rights from all client roles
REVOKE INSERT, UPDATE, DELETE ON TABLE public.hackathons FROM authenticated, anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.hackathon_rounds FROM authenticated, anon, PUBLIC;

-- ============================================================================
-- 4. RECONCILE BASE-TABLE SELECT PRIVILEGES & DROP OBSOLETE BROAD POLICIES
-- Revoke base-table SELECT from anon to eliminate whole-table exposure.
-- Base-table SELECT on hackathons/hackathon_rounds is retained for authenticated,
-- but strictly governed by admin RLS policies (hackathons_admin_manage).
-- Drop pre-existing broad SELECT policies that allowed students to read base tables.
-- ============================================================================

REVOKE SELECT ON TABLE public.hackathons FROM anon, PUBLIC;
REVOKE SELECT ON TABLE public.hackathon_rounds FROM anon, PUBLIC;

DROP POLICY IF EXISTS hackathons_select_published ON public.hackathons;
DROP POLICY IF EXISTS hackathon_rounds_select_visible ON public.hackathon_rounds;
DROP POLICY IF EXISTS hackathon_rounds_select_published ON public.hackathon_rounds;

-- Retain & re-verify admin management RLS policies on base tables
DROP POLICY IF EXISTS hackathons_admin_manage ON public.hackathons;
CREATE POLICY hackathons_admin_manage ON public.hackathons
FOR ALL TO authenticated
USING (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
)
WITH CHECK (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
);

DROP POLICY IF EXISTS hackathon_rounds_admin_manage ON public.hackathon_rounds;
CREATE POLICY hackathon_rounds_admin_manage ON public.hackathon_rounds
FOR ALL TO authenticated
USING (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
)
WITH CHECK (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
);

-- ============================================================================
-- 5. PUBLIC DISCOVERY PROJECTIONS: LEAST-PRIVILEGE SAFE VIEWS
-- Variant A — Public Discovery Architecture [OWNER APPROVED]
-- Explicit allowlist of 22 public hackathon fields and 9 public round fields.
-- Private columns (created_by, created_at, updated_at) are strictly excluded.
-- Fixed non-draft filtering ensures draft events and rounds are never exposed.
-- Defined with security_invoker = false (owned by postgres) so anon and
-- authenticated callers can query views without requiring base-table privileges.
-- ============================================================================

CREATE OR REPLACE VIEW public.hackathons_public_view
WITH (security_invoker = false) AS
SELECT
  id,
  title,
  slug,
  tagline,
  description,
  organizer,
  mode,
  venue,
  registration_start_at,
  registration_end_at,
  event_start_at,
  event_end_at,
  timezone,
  min_team_size,
  max_team_size,
  is_solo_allowed,
  eligibility,
  prizes_summary,
  prizes_detail,
  external_registration_url,
  community_url,
  status
FROM public.hackathons
WHERE status IN ('published', 'registration_closed', 'ongoing', 'completed', 'archived');

ALTER VIEW public.hackathons_public_view OWNER TO postgres;

CREATE OR REPLACE VIEW public.hackathon_rounds_public_view
WITH (security_invoker = false) AS
SELECT
  r.id,
  r.hackathon_id,
  r.round_number,
  r.name,
  r.description,
  r.start_at,
  r.end_at,
  r.is_final_round,
  r.status
FROM public.hackathon_rounds r
WHERE EXISTS (
  SELECT 1 FROM public.hackathons h
  WHERE h.id = r.hackathon_id
    AND h.status IN ('published', 'registration_closed', 'ongoing', 'completed', 'archived')
);

ALTER VIEW public.hackathon_rounds_public_view OWNER TO postgres;

-- Grant read access on public views to anonymous visitors and authenticated users
GRANT SELECT ON public.hackathons_public_view TO anon, authenticated;
GRANT SELECT ON public.hackathon_rounds_public_view TO anon, authenticated;

-- Explicitly revoke write privileges on views to ensure read-only safety
REVOKE INSERT, UPDATE, DELETE ON public.hackathons_public_view FROM authenticated, anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.hackathon_rounds_public_view FROM authenticated, anon, PUBLIC;

-- ============================================================================
-- 6. INDEXES FOR QUERY OPTIMIZATION
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_hackathons_status_dates
ON public.hackathons (status, event_start_at ASC);

CREATE INDEX IF NOT EXISTS idx_hackathon_rounds_ordered
ON public.hackathon_rounds (hackathon_id, round_number ASC);

-- ============================================================================
-- 7. REGISTRATION STATE FUNCTION (STABLE VOLATILITY)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_registration_state(
  p_status TEXT,
  p_reg_start TIMESTAMPTZ,
  p_reg_end TIMESTAMPTZ,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT AS $$
BEGIN
  -- 1. Lifecycle status precedence
  IF p_status = 'draft' THEN
    RETURN 'DRAFT';
  END IF;

  IF p_status = 'archived' THEN
    RETURN 'ARCHIVED';
  END IF;

  IF p_status = 'registration_closed' THEN
    RETURN 'CLOSED';
  END IF;

  -- 2. Authoritative timeline precedence
  IF p_now < p_reg_start THEN
    RETURN 'UPCOMING';
  END IF;

  -- Exact inclusive boundary: now() <= registration_end_at
  IF p_now <= p_reg_end THEN
    RETURN 'OPEN';
  END IF;

  -- Deadline has passed
  RETURN 'DEADLINE_PASSED';
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 8. SECURITY DEFINER RPC: override_hackathon_deadline
-- Rejects identical deadline as fail-closed no-op (zero mutation / zero audit)
-- Reopens registration_closed to published
-- Audits change_type: extension vs shortening
-- ============================================================================

CREATE OR REPLACE FUNCTION public.override_hackathon_deadline(
  p_hackathon_id UUID,
  p_new_deadline TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN;
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_old_deadline TIMESTAMPTZ;
  v_new_status TEXT;
BEGIN
  -- 1. Caller authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 2. Caller authorization check
  SELECT public.current_has_permission('manage_hackathons') INTO v_is_authorized;
  IF v_is_authorized IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  -- 3. Validate arguments
  IF p_hackathon_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: hackathon ID cannot be null.';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 5 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 5 characters is mandatory.';
  END IF;

  -- 4. Lock row FOR UPDATE to serialize concurrent mutations
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.';
  END IF;

  -- Explicit source state enforcement
  IF v_hackathon.status NOT IN ('published', 'registration_closed') THEN
    IF v_hackathon.status = 'draft' THEN
      RAISE EXCEPTION 'Cannot override deadline for a draft event. Edit draft dates directly.';
    ELSIF v_hackathon.status = 'archived' THEN
      RAISE EXCEPTION 'Cannot override deadline for an archived event.';
    ELSE
      RAISE EXCEPTION 'Cannot override deadline for an event in status "%".', v_hackathon.status;
    END IF;
  END IF;

  -- DEADLINE OVERRIDE POLICY: OPTION A — FLEXIBLE OVERRIDE [OWNER APPROVED]
  IF p_new_deadline <= now() THEN
    RAISE EXCEPTION 'Invalid deadline: new deadline must be strictly in the future.';
  END IF;

  IF p_new_deadline <= v_hackathon.registration_start_at THEN
    RAISE EXCEPTION 'Invalid deadline: deadline must be after registration opening time.';
  END IF;

  IF p_new_deadline > v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Invalid deadline: registration deadline cannot exceed event end time (%).', v_hackathon.event_end_at;
  END IF;

  v_old_deadline := v_hackathon.registration_end_at;

  -- 5. Reject unchanged deadline fail-closed before mutation or audit logging
  IF p_new_deadline = v_old_deadline THEN
    RAISE EXCEPTION 'Invalid deadline: new deadline is identical to the current deadline.';
  END IF;

  -- 6. Reopening logic: if closed, transition to published
  v_new_status := v_hackathon.status;
  IF v_hackathon.status = 'registration_closed' THEN
    v_new_status := 'published';
  END IF;

  -- 7. Atomic update
  UPDATE public.hackathons
  SET registration_end_at = p_new_deadline,
      status = v_new_status,
      updated_at = now()
  WHERE id = p_hackathon_id;

  -- 8. Single atomic audit log entry
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'hackathon.deadline_overridden',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'hackathon_title', v_hackathon.title,
      'old_deadline', v_old_deadline,
      'new_deadline', p_new_deadline,
      'previous_status', v_hackathon.status,
      'new_status', v_new_status,
      'change_type', CASE 
        WHEN p_new_deadline > v_old_deadline THEN 'extension' 
        WHEN p_new_deadline < v_old_deadline THEN 'shortening'
        ELSE 'unchanged' -- Defensive fallback (unreachable due to pre-check)
      END,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'old_deadline', v_old_deadline,
    'new_deadline', p_new_deadline,
    'status', v_new_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.override_hackathon_deadline(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.override_hackathon_deadline(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ============================================================================
-- 9. SECURITY DEFINER RPC: configure_hackathon_rounds
-- Pre-mutation duplicate ID check, sequential checks, downstream checks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.configure_hackathon_rounds(
  p_hackathon_id UUID,
  p_rounds JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN;
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_round RECORD;
  v_round_idx INTEGER := 0;
  v_final_count INTEGER := 0;
  v_existing_round_ids UUID[];
  v_incoming_round_ids UUID[] := ARRAY[]::UUID[];
  v_del_id UUID;
  v_dup_id UUID;
  v_ref_count INTEGER;
  v_len INTEGER;
  v_returned_rounds JSONB;
BEGIN
  -- 1. Authentication & authorization
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  SELECT public.current_has_permission('manage_hackathons') INTO v_is_authorized;
  IF v_is_authorized IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  -- 2. Lock hackathon FOR UPDATE
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.';
  END IF;

  IF v_hackathon.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot modify rounds for an archived hackathon.';
  END IF;

  -- 3. Validate rounds payload
  IF p_rounds IS NULL OR jsonb_typeof(p_rounds) <> 'array' THEN
    RAISE EXCEPTION 'Invalid argument: rounds must be a JSON array.';
  END IF;

  v_len := jsonb_array_length(p_rounds);
  IF v_len = 0 AND v_hackathon.status = 'published' THEN
    RAISE EXCEPTION 'Cannot remove all rounds from a published hackathon.';
  END IF;

  -- Reject duplicate non-null round IDs in payload before any mutations
  SELECT id INTO v_dup_id
  FROM jsonb_to_recordset(p_rounds) AS x(id UUID)
  WHERE id IS NOT NULL
  GROUP BY id
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF v_dup_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid round configuration: round ID % appears multiple times in payload.', v_dup_id;
  END IF;

  -- Gather existing round IDs
  SELECT array_agg(id) INTO v_existing_round_ids
  FROM public.hackathon_rounds
  WHERE hackathon_id = p_hackathon_id;

  -- 4. Validate all incoming rounds before mutating
  FOR v_round IN SELECT * FROM jsonb_to_recordset(p_rounds) AS x(
    id UUID,
    round_number INTEGER,
    name TEXT,
    description TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    is_final_round BOOLEAN
  )
  LOOP
    v_round_idx := v_round_idx + 1;

    -- Verify ownership if ID supplied
    IF v_round.id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.hackathon_rounds
        WHERE id = v_round.id AND hackathon_id = p_hackathon_id
      ) THEN
        RAISE EXCEPTION 'Invalid round ID %: round does not exist or does not belong to this hackathon.', v_round.id;
      END IF;
    END IF;

    IF v_round.round_number <> v_round_idx THEN
      RAISE EXCEPTION 'Invalid round sequence: expected round number %, got %.', v_round_idx, v_round.round_number;
    END IF;

    IF v_round.name IS NULL OR trim(v_round.name) = '' THEN
      RAISE EXCEPTION 'Invalid round %: name cannot be empty.', v_round_idx;
    END IF;

    IF v_round.end_at < v_round.start_at THEN
      RAISE EXCEPTION 'Invalid round % (%): end time cannot precede start time.', v_round_idx, v_round.name;
    END IF;

    -- Validate round window against hackathon event window
    IF v_round.start_at < v_hackathon.event_start_at OR v_round.end_at > v_hackathon.event_end_at THEN
      RAISE EXCEPTION 'Invalid round % (%): window [% to %] must fall within event window [% to %].',
        v_round_idx, v_round.name, v_round.start_at, v_round.end_at, v_hackathon.event_start_at, v_hackathon.event_end_at;
    END IF;

    IF v_round.is_final_round IS TRUE THEN
      v_final_count := v_final_count + 1;
    END IF;
  END LOOP;

  IF v_final_count > 1 THEN
    RAISE EXCEPTION 'Invalid round configuration: at most one round can be designated as the final round (found %).', v_final_count;
  END IF;

  -- 5. Safe deletion of removed rounds with downstream checks
  FOR v_round IN SELECT * FROM jsonb_to_recordset(p_rounds) AS x(id UUID)
  LOOP
    IF v_round.id IS NOT NULL THEN
      v_incoming_round_ids := array_append(v_incoming_round_ids, v_round.id);
    END IF;
  END LOOP;

  IF v_existing_round_ids IS NOT NULL THEN
    FOREACH v_del_id IN ARRAY v_existing_round_ids
    LOOP
      IF NOT (v_del_id = ANY(v_incoming_round_ids)) THEN
        -- Check submissions
        SELECT COUNT(*) INTO v_ref_count FROM public.submissions WHERE round_id = v_del_id;
        IF v_ref_count > 0 THEN
          RAISE EXCEPTION 'Cannot delete round %: % active submissions exist.', v_del_id, v_ref_count;
        END IF;

        -- Check verified results
        SELECT COUNT(*) INTO v_ref_count FROM public.results WHERE round_id = v_del_id;
        IF v_ref_count > 0 THEN
          RAISE EXCEPTION 'Cannot delete round %: verified results exist.', v_del_id;
        END IF;

        -- Check points ledger
        SELECT COUNT(*) INTO v_ref_count FROM public.points_ledger WHERE round_id = v_del_id;
        IF v_ref_count > 0 THEN
          RAISE EXCEPTION 'Cannot delete round %: points ledger records exist.', v_del_id;
        END IF;

        DELETE FROM public.hackathon_rounds WHERE id = v_del_id;
      END IF;
    END LOOP;
  END IF;

  -- 6. Upsert rounds
  v_round_idx := 0;
  FOR v_round IN SELECT * FROM jsonb_to_recordset(p_rounds) AS x(
    id UUID,
    round_number INTEGER,
    name TEXT,
    description TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    is_final_round BOOLEAN
  )
  LOOP
    v_round_idx := v_round_idx + 1;

    IF v_round.id IS NOT NULL THEN
      UPDATE public.hackathon_rounds
      SET round_number = v_round.round_number,
          name = trim(v_round.name),
          description = NULLIF(trim(v_round.description), ''),
          start_at = v_round.start_at,
          end_at = v_round.end_at,
          is_final_round = COALESCE(v_round.is_final_round, false),
          updated_at = now()
      WHERE id = v_round.id AND hackathon_id = p_hackathon_id;
    ELSE
      INSERT INTO public.hackathon_rounds (
        hackathon_id,
        round_number,
        name,
        description,
        start_at,
        end_at,
        is_final_round,
        status
      ) VALUES (
        p_hackathon_id,
        v_round.round_number,
        trim(v_round.name),
        NULLIF(trim(v_round.description), ''),
        v_round.start_at,
        v_round.end_at,
        COALESCE(v_round.is_final_round, false),
        'scheduled'
      );
    END IF;
  END LOOP;

  -- 7. Audit log
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'hackathon.rounds_configured',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'hackathon_title', v_hackathon.title,
      'round_count', v_round_idx
    )
  );

  -- Return actual persisted configuration
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'round_number', round_number,
      'name', name,
      'start_at', start_at,
      'end_at', end_at,
      'is_final_round', is_final_round
    ) ORDER BY round_number ASC
  ) INTO v_returned_rounds
  FROM public.hackathon_rounds
  WHERE hackathon_id = p_hackathon_id;

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'rounds', v_returned_rounds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.configure_hackathon_rounds(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_hackathon_rounds(UUID, JSONB) TO authenticated;

-- ============================================================================
-- 10. SECURITY DEFINER RPC: transition_hackathon_lifecycle
-- Strict state machine, prerequisites, unpublish protection, premature archival
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_hackathon_lifecycle(
  p_hackathon_id UUID,
  p_target_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN;
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_old_status TEXT;
  v_trimmed_reason TEXT;
  v_round_count INTEGER;
  v_invalid_round_count INTEGER;
  v_team_count INTEGER;
BEGIN
  -- 1. Authentication & authorization
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  SELECT public.current_has_permission('manage_hackathons') INTO v_is_authorized;
  IF v_is_authorized IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  -- 2. Lock hackathon FOR UPDATE
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.';
  END IF;

  v_old_status := v_hackathon.status;
  v_trimmed_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  -- Idempotent check: return clean no-op with zero duplicate audit log
  IF v_old_status = p_target_status THEN
    RETURN jsonb_build_object('success', true, 'status', v_old_status, 'message', 'Status unchanged.');
  END IF;

  -- Reject transitions involving competition execution statuses
  IF v_old_status IN ('ongoing', 'completed') THEN
    RAISE EXCEPTION 'Events in status "%" are managed by competition execution and cannot be mutated by Phase 6.', v_old_status;
  END IF;

  IF p_target_status IN ('ongoing', 'completed') THEN
    RAISE EXCEPTION 'Target status "%" is reserved for competition execution phases.', p_target_status;
  END IF;

  -- 3. Strict Source x Target State Machine Validation
  IF v_old_status = 'draft' AND p_target_status = 'published' THEN
    -- Mandatory fields check
    IF trim(v_hackathon.title) = '' OR trim(v_hackathon.description) = '' OR trim(v_hackathon.organizer) = '' THEN
      RAISE EXCEPTION 'Cannot publish: title, description, and organizer are mandatory.';
    END IF;

    IF v_hackathon.mode IN ('offline', 'hybrid') AND (v_hackathon.venue IS NULL OR trim(v_hackathon.venue) = '') THEN
      RAISE EXCEPTION 'Cannot publish: venue is mandatory for offline and hybrid events.';
    END IF;

    -- Mandatory round prerequisite check
    SELECT COUNT(*) INTO v_round_count
    FROM public.hackathon_rounds
    WHERE hackathon_id = p_hackathon_id;

    IF v_round_count < 1 THEN
      RAISE EXCEPTION 'Cannot publish hackathon: at least one round must be configured (found 0).';
    END IF;

    -- Verify all rounds fall within event dates
    SELECT COUNT(*) INTO v_invalid_round_count
    FROM public.hackathon_rounds
    WHERE hackathon_id = p_hackathon_id
      AND (start_at < v_hackathon.event_start_at OR end_at > v_hackathon.event_end_at);

    IF v_invalid_round_count > 0 THEN
      RAISE EXCEPTION 'Cannot publish: % configured round(s) fall outside event window [% to %].',
        v_invalid_round_count, v_hackathon.event_start_at, v_hackathon.event_end_at;
    END IF;

  ELSIF v_old_status = 'published' AND p_target_status = 'draft' THEN
    IF v_caller_is_super IS NOT TRUE THEN
      RAISE EXCEPTION 'Access denied: only Super Admin can unpublish an event to draft.';
    END IF;

    SELECT COUNT(*) INTO v_team_count
    FROM public.teams
    WHERE hackathon_id = p_hackathon_id;

    IF v_team_count > 0 THEN
      RAISE EXCEPTION 'Cannot revert to draft: % registered teams exist for this hackathon.', v_team_count;
    END IF;

  ELSIF v_old_status = 'published' AND p_target_status = 'registration_closed' THEN
    -- Allowed manual early closure
    NULL;

  ELSIF v_old_status = 'registration_closed' AND p_target_status = 'published' THEN
    RAISE EXCEPTION 'Cannot reopen closed registration via lifecycle RPC. Use override_hackathon_deadline with a valid future deadline and mandatory justification.';

  ELSIF v_old_status IN ('published', 'registration_closed') AND p_target_status = 'archived' THEN
    -- Archive check: event concluded or Super Admin override with mandatory justification
    IF now() <= v_hackathon.event_end_at THEN
      IF v_caller_is_super IS NOT TRUE THEN
        RAISE EXCEPTION 'Cannot archive: event has not concluded yet (ends %). Only Super Admin can archive an active event prematurely.', v_hackathon.event_end_at;
      END IF;

      IF v_trimmed_reason IS NULL OR length(v_trimmed_reason) < 5 THEN
        RAISE EXCEPTION 'Cannot archive: a meaningful justification of at least 5 characters is mandatory for premature archival of an active event.';
      END IF;
    END IF;

  ELSIF v_old_status = 'draft' AND p_target_status = 'registration_closed' THEN
    RAISE EXCEPTION 'Cannot close registration for a draft event. Publish the event first.';

  ELSIF v_old_status = 'draft' AND p_target_status = 'archived' THEN
    RAISE EXCEPTION 'Cannot archive a draft event. Discard or delete the draft instead.';

  ELSIF v_old_status = 'registration_closed' AND p_target_status = 'draft' THEN
    RAISE EXCEPTION 'Cannot revert a closed hackathon to draft.';

  ELSIF v_old_status = 'archived' THEN
    RAISE EXCEPTION 'Archived hackathons are immutable and cannot be transitioned to any other state.';

  ELSE
    RAISE EXCEPTION 'Invalid lifecycle transition from "%" to "%".', v_old_status, p_target_status;
  END IF;

  -- 4. Update status
  UPDATE public.hackathons
  SET status = p_target_status,
      updated_at = now()
  WHERE id = p_hackathon_id;

  -- 5. Audit log
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'hackathon.' || p_target_status,
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'hackathon_title', v_hackathon.title,
      'previous_status', v_old_status,
      'new_status', p_target_status,
      'reason', v_trimmed_reason,
      'premature_archival', (p_target_status = 'archived' AND now() <= v_hackathon.event_end_at)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'previous_status', v_old_status,
    'new_status', p_target_status,
    'status', p_target_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.transition_hackathon_lifecycle(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_hackathon_lifecycle(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 11. SECURITY DEFINER RPC: create_hackathon_draft
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_hackathon_draft(
  p_title TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_organizer TEXT,
  p_mode TEXT,
  p_venue TEXT,
  p_registration_start_at TIMESTAMPTZ,
  p_registration_end_at TIMESTAMPTZ,
  p_event_start_at TIMESTAMPTZ,
  p_event_end_at TIMESTAMPTZ,
  p_min_team_size INTEGER DEFAULT 1,
  p_max_team_size INTEGER DEFAULT 4,
  p_is_solo_allowed BOOLEAN DEFAULT false,
  p_eligibility TEXT DEFAULT 'Open to all registered NMIT students',
  p_tagline TEXT DEFAULT NULL,
  p_prizes_summary TEXT DEFAULT NULL,
  p_prizes_detail JSONB DEFAULT '[]'::jsonb,
  p_external_registration_url TEXT DEFAULT NULL,
  p_community_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN;
  v_caller_is_super BOOLEAN;
  v_new_id UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  SELECT public.current_has_permission('manage_hackathons') INTO v_is_authorized;
  IF v_is_authorized IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  INSERT INTO public.hackathons (
    title, slug, description, organizer, mode, venue,
    registration_start_at, registration_end_at, event_start_at, event_end_at,
    min_team_size, max_team_size, is_solo_allowed, eligibility, tagline,
    prizes_summary, prizes_detail, external_registration_url, community_url,
    status, created_by
  ) VALUES (
    trim(p_title), lower(trim(p_slug)), trim(p_description), trim(p_organizer),
    p_mode, NULLIF(trim(p_venue), ''),
    p_registration_start_at, p_registration_end_at, p_event_start_at, p_event_end_at,
    p_min_team_size, p_max_team_size, p_is_solo_allowed, trim(p_eligibility), NULLIF(trim(p_tagline), ''),
    NULLIF(trim(p_prizes_summary), ''), COALESCE(p_prizes_detail, '[]'::jsonb),
    NULLIF(trim(p_external_registration_url), ''), NULLIF(trim(p_community_url), ''),
    'draft', v_caller_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'hackathon.created',
    'hackathon',
    v_new_id::text,
    jsonb_build_object('title', trim(p_title), 'slug', lower(trim(p_slug)), 'status', 'draft')
  );

  RETURN jsonb_build_object('success', true, 'hackathon_id', v_new_id, 'id', v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.create_hackathon_draft FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_hackathon_draft TO authenticated;

-- ============================================================================
-- 12. SECURITY DEFINER RPC: update_hackathon_metadata
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_hackathon_metadata(
  p_hackathon_id UUID,
  p_title TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_organizer TEXT,
  p_mode TEXT,
  p_venue TEXT,
  p_registration_start_at TIMESTAMPTZ,
  p_event_start_at TIMESTAMPTZ,
  p_event_end_at TIMESTAMPTZ,
  p_min_team_size INTEGER,
  p_max_team_size INTEGER,
  p_is_solo_allowed BOOLEAN,
  p_eligibility TEXT,
  p_tagline TEXT,
  p_prizes_summary TEXT,
  p_prizes_detail JSONB,
  p_external_registration_url TEXT,
  p_community_url TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN;
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_violating_round RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  SELECT public.current_has_permission('manage_hackathons') INTO v_is_authorized;
  IF v_is_authorized IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.';
  END IF;

  IF v_hackathon.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot edit metadata of an archived hackathon.';
  END IF;

  -- Chronology validation
  IF p_registration_start_at >= v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Registration start time must precede existing registration deadline (%).', v_hackathon.registration_end_at;
  END IF;

  IF v_hackathon.registration_end_at > p_event_end_at THEN
    RAISE EXCEPTION 'Event end time cannot precede existing registration deadline (%).', v_hackathon.registration_end_at;
  END IF;

  IF p_event_start_at > p_event_end_at THEN
    RAISE EXCEPTION 'Event start time cannot exceed event end time.';
  END IF;

  -- Round Boundary Protection Invariant:
  -- Verify that changing event dates does not leave any existing round outside new window
  SELECT * INTO v_violating_round
  FROM public.hackathon_rounds
  WHERE hackathon_id = p_hackathon_id
    AND (start_at < p_event_start_at OR end_at > p_event_end_at)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot update event dates: existing round "%" (Round %) with window [% to %] falls outside the new event window [% to %]. Update round dates first.',
      v_violating_round.name, v_violating_round.round_number, v_violating_round.start_at, v_violating_round.end_at, p_event_start_at, p_event_end_at;
  END IF;

  -- Update metadata
  UPDATE public.hackathons
  SET title = trim(p_title),
      slug = lower(trim(p_slug)),
      description = trim(p_description),
      organizer = trim(p_organizer),
      mode = p_mode,
      venue = NULLIF(trim(p_venue), ''),
      registration_start_at = p_registration_start_at,
      event_start_at = p_event_start_at,
      event_end_at = p_event_end_at,
      min_team_size = p_min_team_size,
      max_team_size = p_max_team_size,
      is_solo_allowed = p_is_solo_allowed,
      eligibility = trim(p_eligibility),
      tagline = NULLIF(trim(p_tagline), ''),
      prizes_summary = NULLIF(trim(p_prizes_summary), ''),
      prizes_detail = COALESCE(p_prizes_detail, '[]'::jsonb),
      external_registration_url = NULLIF(trim(p_external_registration_url), ''),
      community_url = NULLIF(trim(p_community_url), ''),
      updated_at = now()
  WHERE id = p_hackathon_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'hackathon.updated',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object('title', trim(p_title))
  );

  RETURN jsonb_build_object('success', true, 'hackathon_id', p_hackathon_id, 'id', p_hackathon_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.update_hackathon_metadata FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_hackathon_metadata TO authenticated;
