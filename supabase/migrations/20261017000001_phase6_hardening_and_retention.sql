-- Migration 17: Phase 6 Hardening, Stage Schedules, Admin Scoping & Retention Integration
-- Forward-only migration following Phase 5 checkpoint (e3324a1)
-- Created: 2026-10-19
-- Schema: public

-- ============================================================================
-- 1. EXTEND HACKATHON ROUND STATUS CONSTRAINT (INDEPENDENT STAGE SCHEDULES)
-- Supports 'paused' state for independent round pause and manual resumption
-- ============================================================================

ALTER TABLE public.hackathon_rounds
DROP CONSTRAINT IF EXISTS chk_hackathon_rounds_status;

ALTER TABLE public.hackathon_rounds
ADD CONSTRAINT chk_hackathon_rounds_status
CHECK (status IN ('scheduled', 'open', 'paused', 'evaluation', 'completed'));

-- ============================================================================
-- 2. HARDEN BASE TABLE RLS POLICIES (EVENT-SCOPED ADMIN ACCESS)
-- Ordinary admins may only access hackathons and rounds assigned to them.
-- Super Admin retains global access across all hackathons.
-- ============================================================================

DROP POLICY IF EXISTS hackathons_admin_manage ON public.hackathons;
CREATE POLICY hackathons_admin_manage ON public.hackathons
FOR ALL TO authenticated
USING (
  public.current_is_super_admin() OR
  (
    public.current_has_permission('manage_hackathons') AND
    in_charge_admin_id = auth.uid()
  )
)
WITH CHECK (
  public.current_is_super_admin() OR
  (
    public.current_has_permission('manage_hackathons') AND
    in_charge_admin_id = auth.uid()
  )
);

DROP POLICY IF EXISTS hackathon_rounds_admin_manage ON public.hackathon_rounds;
CREATE POLICY hackathon_rounds_admin_manage ON public.hackathon_rounds
FOR ALL TO authenticated
USING (
  public.current_is_super_admin() OR
  EXISTS (
    SELECT 1 FROM public.hackathons h
    WHERE h.id = hackathon_rounds.hackathon_id
      AND h.in_charge_admin_id = auth.uid()
      AND public.current_has_permission('manage_hackathons')
  )
)
WITH CHECK (
  public.current_is_super_admin() OR
  EXISTS (
    SELECT 1 FROM public.hackathons h
    WHERE h.id = hackathon_rounds.hackathon_id
      AND h.in_charge_admin_id = auth.uid()
      AND public.current_has_permission('manage_hackathons')
  )
);

-- ============================================================================
-- 3. HARDEN create_hackathon_draft (SUPPORT IN-CHARGE ADMIN ASSIGNMENT)
-- Super Admin can assign any eligible active admin.
-- Ordinary Admin defaults to self and cannot assign another admin.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_hackathon_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
);

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
  p_community_url TEXT DEFAULT NULL,
  p_in_charge_admin_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_authorized BOOLEAN;
  v_caller_is_super BOOLEAN;
  v_target_in_charge UUID;
  v_target_is_super BOOLEAN;
  v_target_is_active BOOLEAN;
  v_target_is_eligible BOOLEAN;
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

  -- Assignment rules:
  -- If caller is Super Admin, they can assign p_in_charge_admin_id (defaults to caller if NULL)
  -- If caller is ordinary admin, they can ONLY assign themselves
  IF p_in_charge_admin_id IS NOT NULL THEN
    IF (v_caller_is_super IS NOT TRUE) AND (p_in_charge_admin_id <> v_caller_id) THEN
      RAISE EXCEPTION 'Access denied: only Super Admins can assign a different in-charge admin.';
    END IF;
    v_target_in_charge := p_in_charge_admin_id;
  ELSE
    v_target_in_charge := v_caller_id;
  END IF;

  -- Validate target in-charge admin exists, is active, and is eligible
  SELECT is_super_admin, is_active
  INTO v_target_is_super, v_target_is_active
  FROM public.admin_profiles
  WHERE id = v_target_in_charge;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid argument: assigned in-charge admin does not exist.';
  END IF;

  IF v_target_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid argument: assigned in-charge admin is inactive.';
  END IF;

  IF v_target_is_super IS TRUE THEN
    v_target_is_eligible := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.admin_permissions
      WHERE admin_id = v_target_in_charge
        AND permission = 'manage_hackathons'
    ) INTO v_target_is_eligible;
  END IF;

  IF v_target_is_eligible IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid argument: assigned in-charge admin is not eligible. Must hold manage_hackathons permission.';
  END IF;

  INSERT INTO public.hackathons (
    title, slug, description, organizer, mode, venue,
    registration_start_at, registration_end_at, event_start_at, event_end_at,
    min_team_size, max_team_size, is_solo_allowed, eligibility, tagline,
    prizes_summary, prizes_detail, external_registration_url, community_url,
    status, created_by, in_charge_admin_id
  ) VALUES (
    trim(p_title), lower(trim(p_slug)), trim(p_description), trim(p_organizer),
    p_mode, NULLIF(trim(p_venue), ''),
    p_registration_start_at, p_registration_end_at, p_event_start_at, p_event_end_at,
    p_min_team_size, p_max_team_size, p_is_solo_allowed, trim(p_eligibility), NULLIF(trim(p_tagline), ''),
    NULLIF(trim(p_prizes_summary), ''), COALESCE(p_prizes_detail, '[]'::jsonb),
    NULLIF(trim(p_external_registration_url), ''), NULLIF(trim(p_community_url), ''),
    'draft', v_caller_id, v_target_in_charge
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'hackathon.created',
    'hackathon',
    v_new_id::text,
    jsonb_build_object(
      'title', trim(p_title),
      'slug', lower(trim(p_slug)),
      'status', 'draft',
      'in_charge_admin_id', v_target_in_charge
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', v_new_id,
    'id', v_new_id,
    'slug', lower(trim(p_slug)),
    'status', 'draft',
    'in_charge_admin_id', v_target_in_charge
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.create_hackathon_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_hackathon_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID
) TO authenticated;

-- ============================================================================
-- 4. HARDEN update_hackathon_metadata (SCOPED AUTH & PLAN A GUARD)
-- Enforces can_admin_manage_hackathon and Plan A extension check.
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
  v_retention_jobs_updated INT := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- Two-dimensional event-scoped authorization check
  IF NOT public.can_admin_manage_hackathon(p_hackathon_id, 'manage_hackathons') THEN
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

  -- PLAN A GUARD: If event_end_at is being changed, verify deletion is not in progress
  IF p_event_end_at <> v_hackathon.event_end_at THEN
    IF EXISTS (
      SELECT 1 FROM public.storage_deletion_queue
      WHERE event_id = p_hackathon_id
        AND status IN ('claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required')
    ) THEN
      RAISE EXCEPTION 'Cannot extend hackathon deadline while evidence deletion is in progress or unresolved (Plan A guard). Please retry once deletion completes.'
        USING ERRCODE = '55P03';
    END IF;
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

  -- Atomically sync retention_deadline_at on pending deletion queue jobs if event_end_at changed
  IF p_event_end_at <> v_hackathon.event_end_at THEN
    UPDATE public.storage_deletion_queue
    SET retention_deadline_at = p_event_end_at + interval '7 days',
        updated_at = now()
    WHERE event_id = p_hackathon_id
      AND status = 'pending';
    GET DIAGNOSTICS v_retention_jobs_updated = ROW_COUNT;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'hackathon.updated',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'title', trim(p_title),
      'slug', lower(trim(p_slug)),
      'old_event_end_at', v_hackathon.event_end_at,
      'new_event_end_at', p_event_end_at,
      'pending_retention_jobs_updated', v_retention_jobs_updated
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'id', p_hackathon_id,
    'slug', lower(trim(p_slug)),
    'status', v_hackathon.status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.update_hackathon_metadata(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_hackathon_metadata(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) TO authenticated;

-- ============================================================================
-- 5. HARDEN override_hackathon_deadline (SCOPED AUTH & PLAN A GUARD)
-- Enforces can_admin_manage_hackathon, unchanged check, and Plan A guard.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.override_hackathon_deadline(
  p_hackathon_id UUID,
  p_new_deadline TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_old_deadline TIMESTAMPTZ;
  v_new_status TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  IF NOT public.can_admin_manage_hackathon(p_hackathon_id, 'manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF p_hackathon_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: hackathon ID cannot be null.';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 5 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 5 characters is mandatory.';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.';
  END IF;

  IF v_hackathon.status NOT IN ('published', 'registration_closed') THEN
    IF v_hackathon.status = 'draft' THEN
      RAISE EXCEPTION 'Cannot override deadline for a draft event. Edit draft dates directly.';
    ELSIF v_hackathon.status = 'archived' THEN
      RAISE EXCEPTION 'Cannot override deadline for an archived event.';
    ELSE
      RAISE EXCEPTION 'Cannot override deadline for an event in status "%".', v_hackathon.status;
    END IF;
  END IF;

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

  IF p_new_deadline = v_old_deadline THEN
    RAISE EXCEPTION 'Invalid deadline: new deadline is identical to the current deadline.';
  END IF;

  -- PLAN A GUARD: Verify deletion is not active before extending registration deadline
  IF p_new_deadline > v_old_deadline THEN
    IF EXISTS (
      SELECT 1 FROM public.storage_deletion_queue
      WHERE event_id = p_hackathon_id
        AND status IN ('claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required')
    ) THEN
      RAISE EXCEPTION 'Cannot extend hackathon deadline while evidence deletion is in progress or unresolved (Plan A guard). Please retry once deletion completes.'
        USING ERRCODE = '55P03';
    END IF;
  END IF;

  -- Reopening logic: if closed, transition to published
  v_new_status := v_hackathon.status;
  IF v_hackathon.status = 'registration_closed' THEN
    v_new_status := 'published';
  END IF;

  UPDATE public.hackathons
  SET registration_end_at = p_new_deadline,
      status = v_new_status,
      updated_at = now()
  WHERE id = p_hackathon_id;

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
        ELSE 'unchanged'
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
-- 6. HARDEN configure_hackathon_rounds (SCOPED AUTH)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.configure_hackathon_rounds(
  p_hackathon_id UUID,
  p_rounds JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
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
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  IF NOT public.can_admin_manage_hackathon(p_hackathon_id, 'manage_hackathons') THEN
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
    RAISE EXCEPTION 'Cannot modify rounds for an archived hackathon.';
  END IF;

  IF p_rounds IS NULL OR jsonb_typeof(p_rounds) <> 'array' THEN
    RAISE EXCEPTION 'Invalid argument: rounds must be a JSON array.';
  END IF;

  v_len := jsonb_array_length(p_rounds);
  IF v_len = 0 AND v_hackathon.status = 'published' THEN
    RAISE EXCEPTION 'Cannot remove all rounds from a published hackathon.';
  END IF;

  -- Duplicate non-null round IDs validation
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

  -- Validate all incoming rounds before mutating
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

  -- Safe deletion of removed rounds with downstream checks
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
      END IF;
    END LOOP;
  END IF;

  -- Execute deletion of removed rounds
  IF v_existing_round_ids IS NOT NULL THEN
    DELETE FROM public.hackathon_rounds
    WHERE hackathon_id = p_hackathon_id
      AND NOT (id = ANY(v_incoming_round_ids));
  END IF;

  -- Upsert rounds
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
        hackathon_id, round_number, name, description, start_at, end_at, is_final_round
      ) VALUES (
        p_hackathon_id, v_round.round_number, trim(v_round.name),
        NULLIF(trim(v_round.description), ''), v_round.start_at, v_round.end_at,
        COALESCE(v_round.is_final_round, false)
      );
    END IF;
  END LOOP;

  UPDATE public.hackathons SET updated_at = now() WHERE id = p_hackathon_id;

  SELECT jsonb_agg(to_jsonb(r.*)) INTO v_returned_rounds
  FROM (
    SELECT id, round_number, name, description, start_at, end_at, is_final_round, status
    FROM public.hackathon_rounds
    WHERE hackathon_id = p_hackathon_id
    ORDER BY round_number ASC
  ) r;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'hackathon.rounds_configured',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object('round_count', v_len, 'rounds', v_returned_rounds)
  );

  RETURN jsonb_build_object('success', true, 'hackathon_id', p_hackathon_id, 'configured_rounds', v_len);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.configure_hackathon_rounds(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_hackathon_rounds(UUID, JSONB) TO authenticated;

-- ============================================================================
-- 7. HARDEN transition_hackathon_lifecycle (SCOPED AUTH)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transition_hackathon_lifecycle(
  p_hackathon_id UUID,
  p_target_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_old_status TEXT;
  v_trimmed_reason TEXT;
  v_round_count INTEGER;
  v_invalid_round_count INTEGER;
  v_team_count INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  IF NOT public.can_admin_manage_hackathon(p_hackathon_id, 'manage_hackathons') THEN
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

  UPDATE public.hackathons
  SET status = p_target_status,
      updated_at = now()
  WHERE id = p_hackathon_id;

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
    'status', p_target_status,
    'message', 'Hackathon successfully transitioned to ' || p_target_status || '.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.transition_hackathon_lifecycle(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_hackathon_lifecycle(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 8. NEW RPC: override_round_schedule
-- Authorized Admin explicitly overrides a round's schedule with audit trail.
-- Operates independently; does not alter other rounds or registration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.override_round_schedule(
  p_round_id UUID,
  p_new_start_at TIMESTAMPTZ,
  p_new_end_at TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_new_status TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  IF p_round_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: round ID cannot be null.';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 5 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 5 characters is mandatory.';
  END IF;

  -- Preliminary fetch to identify hackathon parent
  SELECT hackathon_id INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.';
  END IF;

  -- Scoped authorization check
  IF NOT public.can_admin_manage_hackathon(v_round.hackathon_id, 'manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  -- Tier 1 Lock: Lock parent hackathon
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR UPDATE;

  -- Tier 2 Lock: Lock target round
  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF v_hackathon.status = 'archived' THEN
    RAISE EXCEPTION 'Cannot modify rounds for an archived hackathon.';
  END IF;

  -- Timestamp ordering & window constraints
  IF p_new_start_at >= p_new_end_at THEN
    RAISE EXCEPTION 'Invalid round schedule: start time must precede end time.';
  END IF;

  IF p_new_start_at < v_hackathon.event_start_at OR p_new_end_at > v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Round schedule [% to %] must fall within the event window [% to %].',
      p_new_start_at, p_new_end_at, v_hackathon.event_start_at, v_hackathon.event_end_at;
  END IF;

  IF p_new_start_at = v_round.start_at AND p_new_end_at = v_round.end_at THEN
    RAISE EXCEPTION 'Invalid schedule: new schedule is identical to the current schedule.';
  END IF;

  UPDATE public.hackathon_rounds
  SET start_at = p_new_start_at,
      end_at = p_new_end_at,
      updated_at = now()
  WHERE id = p_round_id;

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
    'hackathon_round.schedule_overridden',
    'hackathon_round',
    p_round_id::text,
    jsonb_build_object(
      'hackathon_id', v_hackathon.id,
      'round_number', v_round.round_number,
      'round_name', v_round.name,
      'old_start_at', v_round.start_at,
      'old_end_at', v_round.end_at,
      'new_start_at', p_new_start_at,
      'new_end_at', p_new_end_at,
      'status', v_round.status,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'hackathon_id', v_hackathon.id,
    'old_start_at', v_round.start_at,
    'old_end_at', v_round.end_at,
    'new_start_at', p_new_start_at,
    'new_end_at', p_new_end_at,
    'status', v_round.status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.override_round_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.override_round_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- ============================================================================
-- 9. NEW RPCs: pause_hackathon_round & resume_hackathon_round
-- Explicit manual stage pause and resumption with mandatory justification.
-- Operates independently from other rounds and registration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pause_hackathon_round(
  p_round_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  IF p_round_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: round ID cannot be null.';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 5 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 5 characters is mandatory.';
  END IF;

  SELECT hackathon_id INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.';
  END IF;

  IF NOT public.can_admin_manage_hackathon(v_round.hackathon_id, 'manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR UPDATE;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF v_round.status = 'paused' THEN
    RETURN jsonb_build_object(
      'success', true,
      'round_id', p_round_id,
      'status', 'paused',
      'message', 'Round is already paused.'
    );
  END IF;

  IF v_round.status NOT IN ('scheduled', 'open') THEN
    RAISE EXCEPTION 'Cannot pause round in status "%". Only scheduled or open rounds can be paused.', v_round.status;
  END IF;

  UPDATE public.hackathon_rounds
  SET status = 'paused',
      updated_at = now()
  WHERE id = p_round_id;

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
    'hackathon_round.paused',
    'hackathon_round',
    p_round_id::text,
    jsonb_build_object(
      'hackathon_id', v_hackathon.id,
      'round_number', v_round.round_number,
      'round_name', v_round.name,
      'previous_status', v_round.status,
      'new_status', 'paused',
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'hackathon_id', v_hackathon.id,
    'status', 'paused',
    'message', 'Round paused successfully.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.pause_hackathon_round(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_hackathon_round(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.resume_hackathon_round(
  p_round_id UUID,
  p_new_end_at TIMESTAMPTZ DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_effective_end_at TIMESTAMPTZ;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  IF p_round_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: round ID cannot be null.';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 5 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 5 characters is mandatory.';
  END IF;

  SELECT hackathon_id INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.';
  END IF;

  IF NOT public.can_admin_manage_hackathon(v_round.hackathon_id, 'manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR UPDATE;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF v_round.status NOT IN ('paused', 'open') THEN
    RAISE EXCEPTION 'Cannot resume round in status "%". Only paused or deadline-passed rounds can be resumed.', v_round.status;
  END IF;

  -- Determine effective end date
  v_effective_end_at := COALESCE(p_new_end_at, v_round.end_at);

  IF v_effective_end_at <= now() THEN
    RAISE EXCEPTION 'Cannot resume round: end time must be strictly in the future. Supply a new future end time.';
  END IF;

  IF v_effective_end_at > v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Round end time (%) cannot exceed event end time (%).', v_effective_end_at, v_hackathon.event_end_at;
  END IF;

  UPDATE public.hackathon_rounds
  SET status = 'open',
      end_at = v_effective_end_at,
      updated_at = now()
  WHERE id = p_round_id;

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
    'hackathon_round.resumed',
    'hackathon_round',
    p_round_id::text,
    jsonb_build_object(
      'hackathon_id', v_hackathon.id,
      'round_number', v_round.round_number,
      'round_name', v_round.name,
      'previous_status', v_round.status,
      'new_status', 'open',
      'old_end_at', v_round.end_at,
      'new_end_at', v_effective_end_at,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'hackathon_id', v_hackathon.id,
    'status', 'open',
    'end_at', v_effective_end_at,
    'message', 'Round resumed successfully.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.resume_hackathon_round(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resume_hackathon_round(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ============================================================================
-- 10. EVIDENCE RETENTION INTEGRATION (7 DAYS POST EVENT-END ANCHOR)
-- Reuses Phase 4 storage_deletion_queue & workers.
-- Preserves verified results, points, and necessary audit metadata.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_hackathon_evidence_retention(
  p_hackathon_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_hackathon RECORD;
  v_submissions_enqueued INT := 0;
  v_registration_proofs_enqueued INT := 0;
  v_retention_deadline TIMESTAMPTZ;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    IF NOT public.current_has_permission('manage_hackathons') AND NOT public.current_is_super_admin() THEN
      RAISE EXCEPTION 'Access denied: manage_hackathons permission or service_role authority required.';
    END IF;
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.';
  END IF;

  v_retention_deadline := v_hackathon.event_end_at + interval '7 days';

  IF now() < v_retention_deadline THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'hackathon_id', p_hackathon_id,
      'retention_deadline_at', v_retention_deadline,
      'message', 'Hackathon evidence is not yet eligible for retention deletion (eligible at ' || v_retention_deadline::text || ').'
    );
  END IF;

  -- 1. Enqueue submission evidence (bucket: submission-evidence)
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, retention_deadline_at, status
  )
  SELECT
    p_hackathon_id,
    'submission-evidence',
    s.evidence_path,
    'submission_evidence',
    s.id::text,
    v_retention_deadline,
    'pending'
  FROM public.submissions s
  WHERE s.hackathon_id = p_hackathon_id
    AND s.evidence_path IS NOT NULL
    AND s.evidence_deleted_at IS NULL
  ON CONFLICT (bucket_id, object_path) WHERE (status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required'))
  DO NOTHING;

  GET DIAGNOSTICS v_submissions_enqueued = ROW_COUNT;

  -- 2. Enqueue external registration proofs (bucket: evidence)
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, retention_deadline_at, status
  )
  SELECT
    p_hackathon_id,
    'evidence',
    t.external_proof_path,
    'registration_screenshot',
    t.id::text,
    v_retention_deadline,
    'pending'
  FROM public.teams t
  WHERE t.hackathon_id = p_hackathon_id
    AND t.external_proof_path IS NOT NULL
  ON CONFLICT (bucket_id, object_path) WHERE (status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required'))
  DO NOTHING;

  GET DIAGNOSTICS v_registration_proofs_enqueued = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'eligible', true,
    'hackathon_id', p_hackathon_id,
    'retention_deadline_at', v_retention_deadline,
    'submissions_enqueued', v_submissions_enqueued,
    'registration_proofs_enqueued', v_registration_proofs_enqueued,
    'total_enqueued', v_submissions_enqueued + v_registration_proofs_enqueued
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.enqueue_hackathon_evidence_retention(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_hackathon_evidence_retention(UUID) TO authenticated, service_role;

-- Automated batch scanner for expired hackathons (intended for cron worker)
CREATE OR REPLACE FUNCTION public.scan_and_enqueue_expired_hackathons_evidence()
RETURNS JSONB AS $$
DECLARE
  v_h RECORD;
  v_total_events INT := 0;
  v_total_enqueued INT := 0;
  v_res JSONB;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: service_role authority required.';
  END IF;

  FOR v_h IN (
    SELECT id
    FROM public.hackathons
    WHERE event_end_at <= (now() - interval '7 days')
      AND status IN ('ongoing', 'completed', 'archived')
    ORDER BY event_end_at ASC
  ) LOOP
    v_res := public.enqueue_hackathon_evidence_retention(v_h.id);
    IF (v_res->>'eligible')::boolean IS TRUE THEN
      v_total_events := v_total_events + 1;
      v_total_enqueued := v_total_enqueued + COALESCE((v_res->>'total_enqueued')::int, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'events_scanned', v_total_events,
    'jobs_enqueued', v_total_enqueued
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.scan_and_enqueue_expired_hackathons_evidence() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_and_enqueue_expired_hackathons_evidence() TO service_role;
