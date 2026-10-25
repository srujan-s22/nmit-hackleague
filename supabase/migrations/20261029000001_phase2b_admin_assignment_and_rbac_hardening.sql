-- ============================================================================
-- Migration: 20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql
-- Description: Phase 2B Admin Assignments, RBAC Hardening, Storage Path Safety,
--              Concurrently-Safe Reviews, URL Parity, Mandatory Creation URLs,
--              and Decoupled Scoping.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. PERMISSION CATALOG EXPANSION: assign_hackathons
-- ----------------------------------------------------------------------------
ALTER TABLE public.admin_permissions
  DROP CONSTRAINT IF EXISTS chk_admin_permissions_key;

ALTER TABLE public.admin_permissions
  ADD CONSTRAINT chk_admin_permissions_key CHECK (
    permission IN (
      'verify_students',
      'manage_password_resets',
      'manage_hackathons',
      'assign_hackathons',
      'manage_teams',
      'manage_followups',
      'manage_students',
      'view_analytics',
      'export_data',
      'view_audit_logs',
      'manage_points',
      'manage_notifications',
      'view_student_data'
    )
  );

-- ----------------------------------------------------------------------------
-- 2. URL PROTOCOL & BOUNDARY PARITY CONSTRAINTS
-- ----------------------------------------------------------------------------
ALTER TABLE public.hackathons
  DROP CONSTRAINT IF EXISTS chk_hackathons_external_url;

ALTER TABLE public.hackathons
  ADD CONSTRAINT chk_hackathons_external_url
  CHECK (
    external_registration_url IS NULL
    OR external_registration_url ~* '^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&''()*+,;%=]*)?$'
  );

ALTER TABLE public.hackathons
  DROP CONSTRAINT IF EXISTS chk_hackathons_community_url;

ALTER TABLE public.hackathons
  ADD CONSTRAINT chk_hackathons_community_url
  CHECK (
    community_url IS NULL
    OR community_url ~* '^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&''()*+,;%=]*)?$'
  );

-- ----------------------------------------------------------------------------
-- 3. TABLE: public.hackathon_admin_assignments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hackathon_admin_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  role TEXT NOT NULL DEFAULT 'reviewer',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_hackathon_admin_assignments UNIQUE (hackathon_id, admin_id),
  CONSTRAINT chk_hackathon_admin_role CHECK (role IN ('in_charge', 'reviewer', 'coordinator'))
);

CREATE INDEX IF NOT EXISTS idx_hackathon_admin_assignments_admin
  ON public.hackathon_admin_assignments (admin_id);

CREATE INDEX IF NOT EXISTS idx_hackathon_admin_assignments_hackathon
  ON public.hackathon_admin_assignments (hackathon_id);

CREATE TRIGGER trg_hackathon_admin_assignments_updated_at
  BEFORE UPDATE ON public.hackathon_admin_assignments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Enforce at most one primary in-charge admin per hackathon
CREATE UNIQUE INDEX IF NOT EXISTS uq_hackathon_admin_assignments_in_charge
  ON public.hackathon_admin_assignments (hackathon_id)
  WHERE (role = 'in_charge');

-- Revoke direct writes at table privilege level for defense-in-depth
REVOKE ALL ON TABLE public.hackathon_admin_assignments FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.hackathon_admin_assignments FROM authenticated;
GRANT SELECT ON TABLE public.hackathon_admin_assignments TO authenticated;

ALTER TABLE public.hackathon_admin_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hackathon_admin_assignments FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.hackathon_admin_assignments TO authenticated;

DROP POLICY IF EXISTS "hackathon_admin_assignments_deny_direct_write" ON public.hackathon_admin_assignments;
CREATE POLICY "hackathon_admin_assignments_deny_direct_write"
ON public.hackathon_admin_assignments
FOR ALL TO authenticated
USING (false)
WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- 4. INTEGRITY: UNIQUE INDEXES ON RESULTS
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_results_team_win_placement
ON public.results (hackathon_id, team_id)
WHERE (milestone_type = 'win_placement');

CREATE UNIQUE INDEX IF NOT EXISTS uq_results_team_round_qualification
ON public.results (hackathon_id, round_id, team_id)
WHERE (milestone_type = 'round_qualification');

-- ----------------------------------------------------------------------------
-- 5. RECONCILED AUTHORIZATION HELPERS
-- ----------------------------------------------------------------------------

-- A. Global Configuration Authority Helper
CREATE OR REPLACE FUNCTION public.can_admin_manage_hackathon_config(
  p_hackathon_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
  v_hackathon_exists BOOLEAN;
BEGIN
  IF v_caller_id IS NULL OR p_hackathon_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF v_is_super IS TRUE THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id)
  INTO v_hackathon_exists;

  IF v_hackathon_exists IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_permissions
    WHERE admin_id = v_caller_id
      AND permission = 'manage_hackathons'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_admin_manage_hackathon_config(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_admin_manage_hackathon_config(UUID) TO authenticated;

-- B. Global Assignment Authority Helper
CREATE OR REPLACE FUNCTION public.can_admin_manage_assignments(
  p_hackathon_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
  v_hackathon_exists BOOLEAN;
BEGIN
  IF v_caller_id IS NULL OR p_hackathon_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF v_is_super IS TRUE THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id)
  INTO v_hackathon_exists;

  IF v_hackathon_exists IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_permissions
    WHERE admin_id = v_caller_id
      AND permission = 'assign_hackathons'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_admin_manage_assignments(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_admin_manage_assignments(UUID) TO authenticated;

-- C. Scoped Review Authority Helper (Assignment Scoped)
CREATE OR REPLACE FUNCTION public.can_admin_review_hackathon(
  p_hackathon_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
  v_hackathon_exists BOOLEAN;
BEGIN
  IF v_caller_id IS NULL OR p_hackathon_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF v_is_super IS TRUE THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id)
  INTO v_hackathon_exists;

  IF v_hackathon_exists IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.hackathon_admin_assignments
    WHERE hackathon_id = p_hackathon_id
      AND admin_id = v_caller_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_admin_review_hackathon(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_admin_review_hackathon(UUID) TO authenticated;

-- D. Legacy Compatibility Adapter (Decoupled Global vs Scoped Authority)
CREATE OR REPLACE FUNCTION public.can_admin_manage_hackathon(
  p_hackathon_id UUID,
  p_permission_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
  v_hackathon_exists BOOLEAN;
BEGIN
  IF v_caller_id IS NULL OR p_hackathon_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id)
  INTO v_hackathon_exists;

  IF v_hackathon_exists IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF p_permission_key IS NOT NULL AND p_permission_key NOT IN (
    'verify_students',
    'manage_password_resets',
    'manage_hackathons',
    'assign_hackathons',
    'manage_teams',
    'manage_followups',
    'manage_students',
    'view_analytics',
    'export_data',
    'view_audit_logs',
    'manage_points',
    'manage_notifications',
    'view_student_data'
  ) THEN
    RETURN FALSE;
  END IF;

  IF v_is_super IS TRUE THEN
    RETURN TRUE;
  END IF;

  -- Global configuration permission
  IF p_permission_key = 'manage_hackathons' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.admin_permissions
      WHERE admin_id = v_caller_id
        AND permission = 'manage_hackathons'
    );
  END IF;

  -- Global assignment permission
  IF p_permission_key = 'assign_hackathons' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.admin_permissions
      WHERE admin_id = v_caller_id
        AND permission = 'assign_hackathons'
    );
  END IF;

  -- Scoped feature permissions require holding the permission key AND assignment
  IF p_permission_key IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_permissions
      WHERE admin_id = v_caller_id
        AND permission = p_permission_key
    ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.hackathon_admin_assignments
    WHERE hackathon_id = p_hackathon_id
      AND admin_id = v_caller_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_admin_manage_hackathon(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_admin_manage_hackathon(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. STORAGE PATH SAFETY HELPERS (Fail-Closed, Path-Bound)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_view_registration_proof(
  p_team_id_text TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_team_id UUID;
  v_hackathon_id UUID;
  v_uuid_regex CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_team_id_text IS NULL OR NOT (lower(p_team_id_text) ~ v_uuid_regex) THEN
    RETURN FALSE;
  END IF;

  v_team_id := p_team_id_text::UUID;

  SELECT hackathon_id INTO v_hackathon_id
  FROM public.teams
  WHERE id = v_team_id;

  IF v_hackathon_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.can_admin_review_hackathon(v_hackathon_id) THEN
    RETURN TRUE;
  END IF;

  RETURN public.current_is_team_member(v_team_id);
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_registration_proof(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_registration_proof(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_team_round_evidence(
  p_team_id_text TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_team_id UUID;
  v_hackathon_id UUID;
  v_uuid_regex CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_team_id_text IS NULL OR NOT (lower(p_team_id_text) ~ v_uuid_regex) THEN
    RETURN FALSE;
  END IF;

  v_team_id := p_team_id_text::UUID;

  SELECT hackathon_id INTO v_hackathon_id
  FROM public.teams
  WHERE id = v_team_id;

  IF v_hackathon_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.can_admin_review_hackathon(v_hackathon_id) THEN
    RETURN TRUE;
  END IF;

  RETURN public.current_is_team_member(v_team_id);
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_team_round_evidence(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_team_round_evidence(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_view_legacy_evidence(
  p_hackathon_id_text TEXT,
  p_submission_id_text TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hackathon_id UUID;
  v_submission_id UUID;
  v_submission_team_id UUID;
  v_uuid_regex CONSTANT TEXT := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF p_hackathon_id_text IS NULL OR p_submission_id_text IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT (lower(p_hackathon_id_text) ~ v_uuid_regex) OR NOT (lower(p_submission_id_text) ~ v_uuid_regex) THEN
    RETURN FALSE;
  END IF;

  v_hackathon_id := p_hackathon_id_text::UUID;
  v_submission_id := p_submission_id_text::UUID;

  SELECT s.team_id
  INTO v_submission_team_id
  FROM public.submissions s
  WHERE s.id = v_submission_id
    AND s.hackathon_id = v_hackathon_id;

  IF v_submission_team_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.can_admin_review_hackathon(v_hackathon_id) THEN
    RETURN TRUE;
  END IF;

  RETURN public.current_is_team_member(v_submission_team_id);
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_legacy_evidence(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_legacy_evidence(TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. RECONCILED BASE TABLE RLS POLICIES (Decoupled & Hardened)
-- ----------------------------------------------------------------------------

-- A. Hackathons
DROP POLICY IF EXISTS "hackathons_admin_manage" ON public.hackathons;
CREATE POLICY "hackathons_admin_manage" ON public.hackathons
FOR ALL TO authenticated
USING (
  public.can_admin_manage_hackathon_config(id)
)
WITH CHECK (
  public.can_admin_manage_hackathon_config(id)
);

DROP POLICY IF EXISTS "hackathons_select_published" ON public.hackathons;
DROP POLICY IF EXISTS "hackathons_select_policy" ON public.hackathons;
CREATE POLICY "hackathons_select_policy" ON public.hackathons
FOR SELECT TO authenticated
USING (
  status <> 'draft'
  OR public.can_admin_manage_hackathon_config(id)
  OR public.can_admin_manage_assignments(id)
  OR public.can_admin_review_hackathon(id)
);

-- B. Hackathon Rounds
DROP POLICY IF EXISTS "hackathon_rounds_admin_manage" ON public.hackathon_rounds;
CREATE POLICY "hackathon_rounds_admin_manage" ON public.hackathon_rounds
FOR ALL TO authenticated
USING (
  public.can_admin_manage_hackathon_config(hackathon_id)
)
WITH CHECK (
  public.can_admin_manage_hackathon_config(hackathon_id)
);

DROP POLICY IF EXISTS "hackathon_rounds_select_visible" ON public.hackathon_rounds;
DROP POLICY IF EXISTS "hackathon_rounds_select_policy" ON public.hackathon_rounds;
CREATE POLICY "hackathon_rounds_select_policy" ON public.hackathon_rounds
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.hackathons h
    WHERE h.id = hackathon_rounds.hackathon_id
      AND (
        h.status <> 'draft'
        OR public.can_admin_manage_hackathon_config(h.id)
        OR public.can_admin_manage_assignments(h.id)
        OR public.can_admin_review_hackathon(h.id)
      )
  )
);

-- C. Hackathon Admin Assignments
DROP POLICY IF EXISTS "hackathon_admin_assignments_select_admin" ON public.hackathon_admin_assignments;
CREATE POLICY "hackathon_admin_assignments_select_admin" ON public.hackathon_admin_assignments
FOR SELECT TO authenticated
USING (
  public.can_admin_manage_assignments(hackathon_id)
  OR public.can_admin_manage_hackathon_config(hackathon_id)
  OR public.can_admin_review_hackathon(hackathon_id)
);

-- C2. Teams (Scoped Access for Assigned Reviewers & Managers)
DROP POLICY IF EXISTS teams_select_admin ON public.teams;
CREATE POLICY teams_select_admin ON public.teams
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_review_hackathon(hackathon_id) OR
  public.can_admin_manage_hackathon_config(hackathon_id) OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_teams') OR
  public.can_admin_manage_hackathon(hackathon_id, 'export_data')
);

-- D. Submissions (Strictly Decoupled from manage_hackathons)
DROP POLICY IF EXISTS "submissions_select_admin" ON public.submissions;
CREATE POLICY "submissions_select_admin" ON public.submissions
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_review_hackathon(hackathon_id) OR
  public.can_admin_manage_hackathon(hackathon_id, 'export_data')
);

DROP POLICY IF EXISTS "submissions_update_admin" ON public.submissions;
CREATE POLICY "submissions_update_admin" ON public.submissions
FOR UPDATE TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_review_hackathon(hackathon_id)
)
WITH CHECK (
  public.current_is_super_admin() OR
  public.can_admin_review_hackathon(hackathon_id)
);

-- E. Submission Reviews (Strictly Decoupled from manage_hackathons)
DROP POLICY IF EXISTS "submission_reviews_admin_manage" ON public.submission_reviews;
CREATE POLICY "submission_reviews_admin_manage" ON public.submission_reviews
FOR ALL TO authenticated
USING (
  public.current_is_super_admin() OR
  EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_reviews.submission_id
      AND public.can_admin_review_hackathon(s.hackathon_id)
  )
)
WITH CHECK (
  public.current_is_super_admin() OR
  EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_reviews.submission_id
      AND public.can_admin_review_hackathon(s.hackathon_id)
  )
);

DROP POLICY IF EXISTS "submission_reviews_select_team_member" ON public.submission_reviews;
CREATE POLICY "submission_reviews_select_team_member" ON public.submission_reviews
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_reviews.submission_id
      AND (
        public.can_admin_review_hackathon(s.hackathon_id) OR
        public.current_is_team_member(s.team_id)
      )
  )
);

-- F. Results (Strictly Decoupled from manage_hackathons)
DROP POLICY IF EXISTS "results_select_admin" ON public.results;
CREATE POLICY "results_select_admin" ON public.results
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_review_hackathon(hackathon_id) OR
  public.can_admin_manage_hackathon(hackathon_id, 'export_data')
);

DROP POLICY IF EXISTS "results_admin_manage" ON public.results;
CREATE POLICY "results_admin_manage" ON public.results
FOR ALL TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_review_hackathon(hackathon_id)
)
WITH CHECK (
  public.current_is_super_admin() OR
  public.can_admin_review_hackathon(hackathon_id)
);

-- G. Storage Objects Consolidation
DROP POLICY IF EXISTS "submission_evidence_select_registration_proof" ON storage.objects;
DROP POLICY IF EXISTS "submission_evidence_select" ON storage.objects;

CREATE POLICY "submission_evidence_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'submission-evidence' AND
  (
    (
      (storage.foldername(name))[1] = 'teams' AND
      (storage.foldername(name))[3] = 'registration' AND
      public.can_view_registration_proof((storage.foldername(name))[2])
    )
    OR
    (
      (storage.foldername(name))[1] = 'teams' AND
      COALESCE((storage.foldername(name))[3], '') <> 'registration' AND
      public.can_view_team_round_evidence((storage.foldername(name))[2])
    )
    OR
    (
      (storage.foldername(name))[1] = 'evidence' AND
      public.can_view_legacy_evidence(
        (storage.foldername(name))[2],
        (storage.foldername(name))[3]
      )
    )
  )
);

-- ----------------------------------------------------------------------------
-- 8. IN-CHARGE ASSIGNMENT TRIGGER & INITIAL DATA BACKFILL
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_fn_sync_hackathon_in_charge_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- On UPDATE: if in_charge_admin_id has not changed (including NULL = NULL), do nothing
  IF TG_OP = 'UPDATE' AND (OLD.in_charge_admin_id IS NOT DISTINCT FROM NEW.in_charge_admin_id) THEN
    RETURN NEW;
  END IF;

  -- Step 1: If there was a previous in-charge admin and it changed (to another admin or to NULL),
  -- demote the old in-charge assignment to 'reviewer'
  IF TG_OP = 'UPDATE' AND OLD.in_charge_admin_id IS NOT NULL THEN
    UPDATE public.hackathon_admin_assignments
    SET role = 'reviewer',
        updated_at = clock_timestamp()
    WHERE hackathon_id = NEW.id
      AND admin_id = OLD.in_charge_admin_id
      AND role = 'in_charge';
  END IF;

  -- Step 2: If a new in-charge admin is designated (INSERT or UPDATE to non-NULL),
  -- upsert their assignment with role = 'in_charge'
  IF NEW.in_charge_admin_id IS NOT NULL THEN
    INSERT INTO public.hackathon_admin_assignments (
      hackathon_id,
      admin_id,
      assigned_by,
      role,
      notes,
      assigned_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.in_charge_admin_id,
      COALESCE(auth.uid(), NEW.created_by, NEW.in_charge_admin_id),
      'in_charge',
      'Synchronized automatically from hackathons.in_charge_admin_id',
      clock_timestamp(),
      clock_timestamp()
    )
    ON CONFLICT (hackathon_id, admin_id) DO UPDATE SET
      role = 'in_charge',
      updated_at = clock_timestamp();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_hackathon_in_charge_assignment ON public.hackathons;
CREATE TRIGGER trg_sync_hackathon_in_charge_assignment
AFTER INSERT OR UPDATE OF in_charge_admin_id ON public.hackathons
FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_hackathon_in_charge_assignment();

INSERT INTO public.hackathon_admin_assignments (
  hackathon_id,
  admin_id,
  assigned_by,
  role,
  notes
)
SELECT
  h.id,
  h.in_charge_admin_id,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = h.created_by) THEN h.created_by
    ELSE h.in_charge_admin_id
  END,
  'in_charge',
  'Automated initial backfill from hackathons.in_charge_admin_id'
FROM public.hackathons h
JOIN public.admin_profiles ap ON ap.id = h.in_charge_admin_id
WHERE h.in_charge_admin_id IS NOT NULL
ON CONFLICT (hackathon_id, admin_id) DO UPDATE SET
  role = 'in_charge',
  updated_at = clock_timestamp();

-- ----------------------------------------------------------------------------
-- 9. RPC: CREATE HACKATHON DRAFT (Mandatory Non-Empty URL Enforced)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_hackathon_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_target_in_charge UUID;
  v_target_is_super BOOLEAN;
  v_target_is_active BOOLEAN;
  v_target_is_eligible BOOLEAN;
  v_new_id UUID;
  v_trimmed_external_url TEXT;
  v_trimmed_community_url TEXT;
  v_url_regex CONSTANT TEXT := '^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&''()*+,;%=]*)?$';
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.current_has_permission('manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: manage_hackathons permission required.' USING ERRCODE = '42501';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_trimmed_external_url := TRIM(COALESCE(p_external_registration_url, ''));
  IF v_trimmed_external_url = '' THEN
    RAISE EXCEPTION 'Invalid argument: external registration URL is mandatory for new hackathons.' USING ERRCODE = '22023';
  END IF;

  IF NOT (v_trimmed_external_url ~* v_url_regex) THEN
    RAISE EXCEPTION 'Invalid argument: external registration URL must be a valid HTTP(S) URL without whitespace.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_community_url := NULLIF(TRIM(COALESCE(p_community_url, '')), '');
  IF v_trimmed_community_url IS NOT NULL AND NOT (v_trimmed_community_url ~* v_url_regex) THEN
    RAISE EXCEPTION 'Invalid argument: community URL must be a valid HTTP(S) URL without whitespace.' USING ERRCODE = '22023';
  END IF;

  IF p_in_charge_admin_id IS NOT NULL THEN
    IF (v_caller_is_super IS NOT TRUE) AND (p_in_charge_admin_id <> v_caller_id) THEN
      RAISE EXCEPTION 'Access denied: only Super Admins can assign a different in-charge admin.' USING ERRCODE = '42501';
    END IF;
    v_target_in_charge := p_in_charge_admin_id;
  ELSE
    v_target_in_charge := v_caller_id;
  END IF;

  SELECT is_super_admin, is_active
  INTO v_target_is_super, v_target_is_active
  FROM public.admin_profiles
  WHERE id = v_target_in_charge;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid argument: assigned in-charge admin does not exist.' USING ERRCODE = '22023';
  END IF;

  IF v_target_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid argument: assigned in-charge admin is inactive.' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Invalid argument: assigned in-charge admin is not eligible. Must hold manage_hackathons permission.' USING ERRCODE = '22023';
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
    v_trimmed_external_url, v_trimmed_community_url,
    'draft', v_caller_id, v_target_in_charge
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.hackathon_admin_assignments (
    hackathon_id,
    admin_id,
    assigned_by,
    role,
    notes,
    assigned_at,
    updated_at
  ) VALUES (
    v_new_id,
    v_target_in_charge,
    v_caller_id,
    'in_charge',
    'Designated primary in-charge administrator on draft creation',
    clock_timestamp(),
    clock_timestamp()
  )
  ON CONFLICT (hackathon_id, admin_id) DO UPDATE SET
    role = 'in_charge',
    updated_at = clock_timestamp();

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.created',
    'hackathon',
    v_new_id::text,
    jsonb_build_object(
      'title', trim(p_title),
      'slug', lower(trim(p_slug)),
      'status', 'draft',
      'in_charge_admin_id', v_target_in_charge,
      'external_registration_url', v_trimmed_external_url
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', v_new_id,
    'id', v_new_id,
    'slug', lower(trim(p_slug)),
    'status', 'draft',
    'in_charge_admin_id', v_target_in_charge,
    'external_registration_url', v_trimmed_external_url
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_hackathon_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_hackathon_draft(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, UUID
) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10. RPC: UPDATE HACKATHON METADATA
-- ----------------------------------------------------------------------------
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
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_violating_round RECORD;
  v_retention_jobs_updated INT := 0;
  v_trimmed_external_url TEXT;
  v_trimmed_community_url TEXT;
  v_url_regex CONSTANT TEXT := '^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&''()*+,;%=]*)?$';
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot edit metadata of a % hackathon.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF p_registration_start_at >= v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Registration start time must precede existing registration deadline (%).', v_hackathon.registration_end_at USING ERRCODE = '22000';
  END IF;

  IF v_hackathon.registration_end_at > p_event_end_at THEN
    RAISE EXCEPTION 'Event end time cannot precede existing registration deadline (%).', v_hackathon.registration_end_at USING ERRCODE = '22000';
  END IF;

  IF p_event_start_at > p_event_end_at THEN
    RAISE EXCEPTION 'Event start time cannot exceed event end time.' USING ERRCODE = '22000';
  END IF;

  IF p_event_end_at <> v_hackathon.event_end_at THEN
    IF EXISTS (
      SELECT 1 FROM public.storage_deletion_queue
      WHERE event_id = p_hackathon_id
        AND status IN ('claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required')
    ) THEN
      RAISE EXCEPTION 'Cannot extend hackathon deadline while evidence deletion is in progress (Plan A guard).' USING ERRCODE = '55P03';
    END IF;
  END IF;

  SELECT id, round_number, start_at, end_at
  INTO v_violating_round
  FROM public.hackathon_rounds
  WHERE hackathon_id = p_hackathon_id
    AND (start_at < p_event_start_at OR end_at > p_event_end_at)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Round boundary conflict: round % (%) falls outside updated window.', v_violating_round.round_number, v_violating_round.id USING ERRCODE = '22000';
  END IF;

  v_trimmed_external_url := NULLIF(TRIM(COALESCE(p_external_registration_url, '')), '');
  IF v_trimmed_external_url IS NOT NULL AND NOT (v_trimmed_external_url ~* v_url_regex) THEN
    RAISE EXCEPTION 'Invalid argument: external registration URL must be a valid HTTP(S) URL without whitespace.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_community_url := NULLIF(TRIM(COALESCE(p_community_url, '')), '');
  IF v_trimmed_community_url IS NOT NULL AND NOT (v_trimmed_community_url ~* v_url_regex) THEN
    RAISE EXCEPTION 'Invalid argument: community URL must be a valid HTTP(S) URL without whitespace.' USING ERRCODE = '22023';
  END IF;

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
      external_registration_url = v_trimmed_external_url,
      community_url = v_trimmed_community_url,
      updated_at = clock_timestamp()
  WHERE id = p_hackathon_id;

  IF p_event_end_at <> v_hackathon.event_end_at THEN
    UPDATE public.storage_deletion_queue
    SET retention_deadline_at = p_event_end_at + interval '7 days',
        updated_at = clock_timestamp()
    WHERE event_id = p_hackathon_id
      AND status = 'pending';
    GET DIAGNOSTICS v_retention_jobs_updated = ROW_COUNT;
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
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
    'slug', lower(trim(p_slug))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_hackathon_metadata(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_hackathon_metadata(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ,
  INTEGER, INTEGER, BOOLEAN, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT
) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. RPC: ASSIGN ADMIN TO HACKATHON
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_admin_to_hackathon(
  p_hackathon_id UUID,
  p_target_admin_id UUID,
  p_role TEXT DEFAULT 'reviewer',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_target_is_active BOOLEAN;
  v_target_is_eligible BOOLEAN;
  v_hackathon_status TEXT;
  v_assignment_id UUID;
  v_role TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_assignments(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have assignment authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  IF p_target_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target admin ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_role := COALESCE(p_role, 'reviewer');
  IF v_role NOT IN ('reviewer', 'coordinator') THEN
    RAISE EXCEPTION 'Invalid role: %. Use reassign_hackathon_in_charge_admin to designate in_charge.', v_role USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_hackathon_status
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT is_active INTO v_target_is_active
  FROM public.admin_profiles
  WHERE id = p_target_admin_id;

  IF NOT FOUND OR v_target_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid argument: target admin must be an active administrator.' USING ERRCODE = '22023';
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.hackathon_admin_assignments (
    hackathon_id,
    admin_id,
    assigned_by,
    role,
    notes,
    assigned_at,
    updated_at
  ) VALUES (
    p_hackathon_id,
    p_target_admin_id,
    v_caller_id,
    v_role,
    p_notes,
    clock_timestamp(),
    clock_timestamp()
  )
  ON CONFLICT (hackathon_id, admin_id) DO UPDATE SET
    role = v_role,
    notes = COALESCE(p_notes, public.hackathon_admin_assignments.notes),
    updated_at = clock_timestamp()
  RETURNING id INTO v_assignment_id;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.admin_assigned',
    'hackathon_admin_assignments',
    v_assignment_id::TEXT,
    jsonb_build_object(
      'hackathon_id', p_hackathon_id,
      'admin_id', p_target_admin_id,
      'role', v_role,
      'assignment_id', v_assignment_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'admin_id', p_target_admin_id,
    'role', v_role,
    'assignment_id', v_assignment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_admin_to_hackathon(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_admin_to_hackathon(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 12. RPC: REMOVE ADMIN FROM HACKATHON
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_admin_from_hackathon(
  p_hackathon_id UUID,
  p_target_admin_id UUID,
  p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_current_in_charge UUID;
  v_existing_role TEXT;
  v_trimmed_justification TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_assignments(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have assignment authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  IF p_target_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target admin ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_justification := TRIM(COALESCE(p_justification, ''));
  IF LENGTH(v_trimmed_justification) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  SELECT in_charge_admin_id INTO v_current_in_charge
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_in_charge = p_target_admin_id THEN
    RAISE EXCEPTION 'Cannot remove assignment: target admin is currently the primary in-charge administrator for this hackathon. You must reassign the in-charge administrator via reassign_hackathon_in_charge_admin first.'
      USING ERRCODE = '55000';
  END IF;

  SELECT role INTO v_existing_role
  FROM public.hackathon_admin_assignments
  WHERE hackathon_id = p_hackathon_id
    AND admin_id = p_target_admin_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found for specified administrator and hackathon.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.hackathon_admin_assignments
  WHERE hackathon_id = p_hackathon_id
    AND admin_id = p_target_admin_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.admin_removed',
    'hackathon_admin_assignments',
    p_target_admin_id::TEXT,
    jsonb_build_object(
      'hackathon_id', p_hackathon_id,
      'admin_id', p_target_admin_id,
      'prior_role', v_existing_role,
      'justification', v_trimmed_justification
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'admin_id', p_target_admin_id,
    'removed_role', v_existing_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_admin_from_hackathon(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_admin_from_hackathon(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 13. RPC: REASSIGN IN-CHARGE ADMIN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reassign_hackathon_in_charge_admin(
  p_hackathon_id UUID,
  p_new_admin_id UUID,
  p_justification TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_old_admin_id UUID;
  v_new_admin_active BOOLEAN;
  v_trimmed_justification TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only Super Admins can reassign the in-charge admin.' USING ERRCODE = '42501';
  END IF;

  IF p_hackathon_id IS NULL OR p_new_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: hackathon ID and target admin ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_justification := TRIM(COALESCE(p_justification, ''));
  IF LENGTH(v_trimmed_justification) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  SELECT in_charge_admin_id INTO v_old_admin_id
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_admin_id = p_new_admin_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'hackathon_id', p_hackathon_id,
      'in_charge_admin_id', p_new_admin_id,
      'status_unchanged', true
    );
  END IF;

  SELECT is_active INTO v_new_admin_active
  FROM public.admin_profiles
  WHERE id = p_new_admin_id
  FOR UPDATE;

  IF NOT FOUND OR v_new_admin_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Invalid argument: new in-charge admin must be an active administrator.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathons
  SET in_charge_admin_id = p_new_admin_id,
      updated_at = clock_timestamp()
  WHERE id = p_hackathon_id;

  IF v_old_admin_id IS NOT NULL THEN
    UPDATE public.hackathon_admin_assignments
    SET role = 'reviewer',
        updated_at = clock_timestamp()
    WHERE hackathon_id = p_hackathon_id
      AND admin_id = v_old_admin_id;
  END IF;

  INSERT INTO public.hackathon_admin_assignments (
    hackathon_id,
    admin_id,
    assigned_by,
    role,
    notes,
    assigned_at,
    updated_at
  ) VALUES (
    p_hackathon_id,
    p_new_admin_id,
    v_caller_id,
    'in_charge',
    'Designated primary in-charge administrator via reassign_hackathon_in_charge_admin',
    clock_timestamp(),
    clock_timestamp()
  )
  ON CONFLICT (hackathon_id, admin_id) DO UPDATE SET
    role = 'in_charge',
    updated_at = clock_timestamp();

  v_actor_role := 'super_admin';

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.in_charge_reassigned',
    'hackathon',
    p_hackathon_id::TEXT,
    jsonb_build_object(
      'hackathon_id', p_hackathon_id,
      'previous_admin_id', v_old_admin_id,
      'new_admin_id', p_new_admin_id,
      'justification', v_trimmed_justification
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'previous_admin_id', v_old_admin_id,
    'in_charge_admin_id', p_new_admin_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reassign_hackathon_in_charge_admin(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_hackathon_in_charge_admin(UUID, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 14. RPC: OVERRIDE HACKATHON DEADLINE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.override_hackathon_deadline(
  p_hackathon_id UUID,
  p_new_deadline TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot override deadline: hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF p_new_deadline <= v_hackathon.registration_start_at THEN
    RAISE EXCEPTION 'Registration deadline must be strictly after the registration start date (%)',
      v_hackathon.registration_start_at USING ERRCODE = '22000';
  END IF;

  IF p_new_deadline > v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Registration deadline cannot exceed the event conclusion date (%)',
      v_hackathon.event_end_at USING ERRCODE = '22000';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathons
  SET registration_end_at = p_new_deadline,
      updated_at = clock_timestamp()
  WHERE id = p_hackathon_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.deadline_overridden',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'previous_deadline', v_hackathon.registration_end_at,
      'new_deadline', p_new_deadline,
      'justification', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'new_deadline', p_new_deadline
  );
END;
$$;

REVOKE ALL ON FUNCTION public.override_hackathon_deadline(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.override_hackathon_deadline(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 15. RPC: TRANSITION HACKATHON LIFECYCLE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_hackathon_lifecycle(
  p_hackathon_id UUID,
  p_target_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  IF p_target_status IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target status cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful reason of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_hackathon.status IN ('archived', 'completed') AND p_target_status <> 'archived' THEN
    RAISE EXCEPTION 'Cannot transition hackathon: current status is % and terminal.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_hackathon.status = 'draft' AND p_target_status NOT IN ('published') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from draft to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  IF v_hackathon.status = 'published' AND p_target_status NOT IN ('registration_closed', 'ongoing', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from published to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathons
  SET status = p_target_status,
      updated_at = clock_timestamp()
  WHERE id = p_hackathon_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.lifecycle_transitioned',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'from_status', v_hackathon.status,
      'to_status', p_target_status,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'status', p_target_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_hackathon_lifecycle(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_hackathon_lifecycle(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 16. RPC: CONFIGURE HACKATHON ROUNDS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.configure_hackathon_rounds(
  p_hackathon_id UUID,
  p_rounds JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_len INT;
  v_i INT;
  v_round JSONB;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_prev_end TIMESTAMPTZ := NULL;
  v_final_count INT := 0;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot configure rounds: hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF p_rounds IS NULL OR jsonb_typeof(p_rounds) <> 'array' THEN
    RAISE EXCEPTION 'Rounds configuration must be a JSON array.' USING ERRCODE = '22023';
  END IF;

  v_len := jsonb_array_length(p_rounds);
  IF v_len < 1 OR v_len > 10 THEN
    RAISE EXCEPTION 'Hackathons must have between 1 and 10 rounds (received %)', v_len USING ERRCODE = '22000';
  END IF;

  FOR v_i IN 0 .. v_len - 1 LOOP
    IF (p_rounds->v_i->>'round_number') IS NULL OR (p_rounds->v_i->>'round_number')::INT <> (v_i + 1) THEN
      RAISE EXCEPTION 'Round numbers must be strictly sequential starting at 1 (index % has %)',
        v_i, (p_rounds->v_i->>'round_number') USING ERRCODE = '22000';
    END IF;

    IF TRIM(COALESCE(p_rounds->v_i->>'name', '')) = '' THEN
      RAISE EXCEPTION 'Round name at index % cannot be empty.', v_i USING ERRCODE = '22000';
    END IF;

    v_start := (p_rounds->v_i->>'start_at')::TIMESTAMPTZ;
    v_end := (p_rounds->v_i->>'end_at')::TIMESTAMPTZ;

    IF v_start >= v_end THEN
      RAISE EXCEPTION 'Round % start_at (%) must precede end_at (%)', v_i + 1, v_start, v_end USING ERRCODE = '22000';
    END IF;

    IF v_start < v_hackathon.registration_start_at THEN
      RAISE EXCEPTION 'Round % start_at (%) cannot precede registration start date (%)',
        v_i + 1, v_start, v_hackathon.registration_start_at USING ERRCODE = '22000';
    END IF;

    IF v_end > v_hackathon.event_end_at THEN
      RAISE EXCEPTION 'Round % end_at (%) cannot exceed event end date (%)',
        v_i + 1, v_end, v_hackathon.event_end_at USING ERRCODE = '22000';
    END IF;

    IF v_prev_end IS NOT NULL AND v_start < v_prev_end THEN
      RAISE EXCEPTION 'Round % start_at (%) overlaps with previous round end_at (%)',
        v_i + 1, v_start, v_prev_end USING ERRCODE = '22000';
    END IF;

    v_prev_end := v_end;

    IF COALESCE((p_rounds->v_i->>'is_final_round')::BOOLEAN, false) THEN
      v_final_count := v_final_count + 1;
    END IF;
  END LOOP;

  IF v_final_count > 1 THEN
    RAISE EXCEPTION 'At most one round can be designated as the final round.' USING ERRCODE = '22000';
  END IF;

  FOR v_i IN 0 .. v_len - 1 LOOP
    v_round := p_rounds->v_i;

    IF (v_round->>'id') IS NOT NULL AND (v_round->>'id') <> '' THEN
      UPDATE public.hackathon_rounds
      SET round_number = (v_round->>'round_number')::INT,
          name = TRIM(v_round->>'name'),
          description = NULLIF(TRIM(v_round->>'description'), ''),
          start_at = (v_round->>'start_at')::TIMESTAMPTZ,
          end_at = (v_round->>'end_at')::TIMESTAMPTZ,
          is_final_round = COALESCE((v_round->>'is_final_round')::BOOLEAN, false),
          updated_at = clock_timestamp()
      WHERE id = (v_round->>'id')::UUID
        AND hackathon_id = p_hackathon_id;
    ELSE
      INSERT INTO public.hackathon_rounds (
        hackathon_id,
        round_number,
        name,
        description,
        start_at,
        end_at,
        is_final_round
      ) VALUES (
        p_hackathon_id,
        (v_round->>'round_number')::INT,
        TRIM(v_round->>'name'),
        NULLIF(TRIM(v_round->>'description'), ''),
        (v_round->>'start_at')::TIMESTAMPTZ,
        (v_round->>'end_at')::TIMESTAMPTZ,
        COALESCE((v_round->>'is_final_round')::BOOLEAN, false)
      );
    END IF;
  END LOOP;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.rounds_configured',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object('round_count', v_len)
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'round_count', v_len
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configure_hackathon_rounds(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_hackathon_rounds(UUID, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- 17. RPC: OVERRIDE ROUND SCHEDULE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.override_round_schedule(
  p_round_id UUID,
  p_new_start_at TIMESTAMPTZ,
  p_new_end_at TIMESTAMPTZ,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(v_round.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR UPDATE;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot override schedule: hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot override schedule: round is completed and locked.' USING ERRCODE = '55P03';
  END IF;

  IF p_new_start_at IS NULL OR p_new_end_at IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: start_at and end_at cannot be null.' USING ERRCODE = '22023';
  END IF;

  IF p_new_start_at >= p_new_end_at THEN
    RAISE EXCEPTION 'start_at (%) must be strictly before end_at (%)', p_new_start_at, p_new_end_at USING ERRCODE = '22000';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful reason of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathon_rounds
  SET start_at = p_new_start_at,
      end_at = p_new_end_at,
      updated_at = clock_timestamp()
  WHERE id = p_round_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon_round.schedule_overridden',
    'hackathon_round',
    p_round_id::text,
    jsonb_build_object(
      'round_id', p_round_id,
      'old_start_at', v_round.start_at,
      'old_end_at', v_round.end_at,
      'new_start_at', p_new_start_at,
      'new_end_at', p_new_end_at,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'new_start_at', p_new_start_at,
    'new_end_at', p_new_end_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.override_round_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.override_round_schedule(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 18. RPC: PAUSE HACKATHON ROUND
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pause_hackathon_round(
  p_round_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(v_round.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR UPDATE;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot pause round: parent hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_round.status <> 'open' THEN
    RAISE EXCEPTION 'Cannot pause round: only open rounds can be paused (current status: %).', v_round.status USING ERRCODE = '22023';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful reason of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathon_rounds
  SET status = 'paused',
      updated_at = clock_timestamp()
  WHERE id = p_round_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon_round.paused',
    'hackathon_round',
    p_round_id::text,
    jsonb_build_object(
      'round_id', p_round_id,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'status', 'paused'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pause_hackathon_round(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pause_hackathon_round(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 19. RPC: RESUME HACKATHON ROUND
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resume_hackathon_round(
  p_round_id UUID,
  p_new_end_at TIMESTAMPTZ DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_effective_end_at TIMESTAMPTZ;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(v_round.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR UPDATE;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot resume round: parent hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_round.status <> 'paused' THEN
    RAISE EXCEPTION 'Cannot resume round: only paused rounds can be resumed (current status: %).', v_round.status USING ERRCODE = '22023';
  END IF;

  v_effective_end_at := COALESCE(p_new_end_at, v_round.end_at);

  IF v_effective_end_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Cannot resume round: end time must be strictly in the future. Supply a new future end time.' USING ERRCODE = '22023';
  END IF;

  IF v_effective_end_at > v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Round end time (%) cannot exceed event end time (%).', v_effective_end_at, v_hackathon.event_end_at USING ERRCODE = '22000';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful reason of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathon_rounds
  SET status = 'open',
      end_at = v_effective_end_at,
      updated_at = clock_timestamp()
  WHERE id = p_round_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon_round.resumed',
    'hackathon_round',
    p_round_id::text,
    jsonb_build_object(
      'round_id', p_round_id,
      'end_at', v_effective_end_at,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'status', 'open',
    'end_at', v_effective_end_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resume_hackathon_round(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resume_hackathon_round(UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 20. RPC: REVIEW ROUND ADVANCEMENT (Safe Overload Cleanup & Concurrency Row-Locked)
-- ----------------------------------------------------------------------------

-- Safe conditional cleanup of obsolete 4-argument overload (if exists) without CASCADE
DO $cleanup_overload$
DECLARE
  v_proc_oid OID;
  v_dep_desc TEXT;
BEGIN
  SELECT p.oid INTO v_proc_oid
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.proname = 'review_round_advancement'
    AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, text';

  IF v_proc_oid IS NOT NULL THEN
    SELECT string_agg(deptype || ': ' || pg_describe_object(classid, objid, objsubid), ', ')
    INTO v_dep_desc
    FROM pg_depend
    WHERE refobjid = v_proc_oid
      AND deptype NOT IN ('i', 'a');

    IF v_dep_desc IS NOT NULL AND v_dep_desc <> '' THEN
      RAISE EXCEPTION 'Cannot drop obsolete overload review_round_advancement(UUID, TEXT, TEXT, TEXT): dependent objects detected: %', v_dep_desc;
    END IF;

    EXECUTE 'DROP FUNCTION public.review_round_advancement(UUID, TEXT, TEXT, TEXT) RESTRICT';
  END IF;
END $cleanup_overload$;

CREATE OR REPLACE FUNCTION public.review_round_advancement(
  p_submission_id UUID,
  p_decision TEXT,
  p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_submission RECORD;
  v_review_id UUID;
  v_result_id UUID;
  v_trimmed_decision TEXT;
  v_trimmed_feedback TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: submission ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_decision := TRIM(COALESCE(p_decision, ''));
  IF v_trimmed_decision NOT IN ('accepted', 'rejected', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid review decision: %. Allowed values are accepted, rejected, revision_requested.', p_decision USING ERRCODE = '22023';
  END IF;

  v_trimmed_feedback := TRIM(COALESCE(p_feedback, ''));
  IF v_trimmed_decision IN ('rejected', 'revision_requested') AND LENGTH(v_trimmed_feedback) < 10 THEN
    RAISE EXCEPTION 'A meaningful explanation of at least 10 characters is mandatory for % decisions.', v_trimmed_decision USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_submission.is_current THEN
    RAISE EXCEPTION 'Cannot review historical submission version. Only active submissions can be reviewed.' USING ERRCODE = '22023';
  END IF;

  IF v_submission.status NOT IN ('submitted', 'under_review', 'revision_requested') THEN
    RAISE EXCEPTION 'Submission has already reached final decision (%) and cannot be updated concurrently.', v_submission.status USING ERRCODE = '40001';
  END IF;

  IF NOT public.can_admin_review_hackathon(v_submission.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have assignment authority to review submissions for this hackathon.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.submissions
  SET status = v_trimmed_decision,
      updated_at = clock_timestamp()
  WHERE id = p_submission_id;

  INSERT INTO public.submission_reviews (
    submission_id,
    reviewer_id,
    decision,
    feedback,
    reviewed_at
  ) VALUES (
    p_submission_id,
    v_caller_id,
    v_trimmed_decision,
    NULLIF(v_trimmed_feedback, ''),
    clock_timestamp()
  )
  RETURNING id INTO v_review_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    v_actor_role,
    'submission.reviewed',
    'submission',
    p_submission_id::TEXT,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'decision', v_trimmed_decision,
      'review_id', v_review_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'decision', v_trimmed_decision,
    'review_id', v_review_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_round_advancement(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_round_advancement(UUID, TEXT, TEXT) TO authenticated;



-- ----------------------------------------------------------------------------
-- 20B. RPC: REVIEW ROUND SUBMISSION (Assignment-Scoped, Level 1/2/3 Locked DAG)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_round_submission(
  p_submission_id UUID,
  p_decision TEXT,
  p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_submission RECORD;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_feedback TEXT;
  v_stored_feedback TEXT;
  v_review_id UUID;
  v_result_id UUID;
  v_leader_points INT := 25;
  v_member_points INT := 20;
  v_member RECORD;
  v_idempotency_key TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('accepted', 'rejected', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid decision. Must be accepted, rejected, or revision_requested.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_feedback := TRIM(COALESCE(p_feedback, ''));
  IF length(v_trimmed_feedback) > 1000 THEN
    RAISE EXCEPTION 'Feedback exceeds maximum allowed length of 1000 characters.' USING ERRCODE = '22000';
  END IF;

  IF p_decision IN ('revision_requested', 'rejected') AND length(v_trimmed_feedback) < 10 THEN
    RAISE EXCEPTION 'Decision % requires a nonblank explanation of at least 10 characters.', p_decision USING ERRCODE = '22000';
  END IF;

  v_stored_feedback := NULLIF(v_trimmed_feedback, '');

  -- Level 1 Lock: Submissions FOR UPDATE
  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_submission.is_current THEN
    RAISE EXCEPTION 'Cannot review historical submission version. Only active submissions can be reviewed.' USING ERRCODE = '22023';
  END IF;

  IF v_submission.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'Submission cannot be reviewed in status %.', v_submission.status USING ERRCODE = '22023';
  END IF;

  -- Level 1 Lock: Teams FOR UPDATE (enforcing intra-Level 1 submissions -> teams DAG)
  PERFORM 1
  FROM public.teams
  WHERE id = v_submission.team_id
  FOR UPDATE;

  -- Level 1 Lock: Hackathon Rounds FOR UPDATE
  PERFORM 1
  FROM public.hackathon_rounds
  WHERE id = v_submission.round_id
  FOR UPDATE;

  -- Assignment Scope Verification (Strictly Scoped via Phase 2B Assignment)
  IF NOT public.can_admin_review_hackathon(v_submission.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have assignment authority to review submissions for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = v_submission.hackathon_id;
  SELECT * INTO v_round FROM public.hackathon_rounds WHERE id = v_submission.round_id;

  -- Database-Enforced Lifecycle Matrix
  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot review submission: hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'scheduled' OR clock_timestamp() < v_round.start_at THEN
    RAISE EXCEPTION 'Cannot review submission: round is scheduled and has not commenced.' USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'paused' THEN
    RAISE EXCEPTION 'Cannot review submission: round is currently paused. Resume round or transition to evaluation before reviewing.' USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'open' AND clock_timestamp() >= v_round.end_at THEN
    RAISE EXCEPTION 'Cannot review submission: stage deadline has expired. Round must be transitioned to evaluation or resumed with an extended deadline before reviewing.' USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot review submission: round is completed and locked.' USING ERRCODE = '55P03';
  END IF;

  -- Update submission status
  UPDATE public.submissions
  SET status = p_decision,
      updated_at = clock_timestamp()
  WHERE id = p_submission_id;

  -- Insert review record
  INSERT INTO public.submission_reviews (
    submission_id,
    reviewer_id,
    decision,
    feedback,
    reviewed_at
  ) VALUES (
    p_submission_id,
    v_caller_id,
    p_decision,
    v_stored_feedback,
    clock_timestamp()
  )
  RETURNING id INTO v_review_id;

  -- Publish verified result and award qualification points upon acceptance
  IF p_decision = 'accepted' THEN
    INSERT INTO public.results (
      hackathon_id,
      round_id,
      team_id,
      milestone_type,
      is_published,
      verified_by,
      verified_at,
      notes
    ) VALUES (
      v_submission.hackathon_id,
      v_submission.round_id,
      v_submission.team_id,
      'round_qualification',
      true,
      v_caller_id,
      clock_timestamp(),
      v_stored_feedback
    )
    ON CONFLICT (hackathon_id, round_id, team_id)
    WHERE (milestone_type = 'round_qualification')
    DO UPDATE SET
      is_published = true,
      verified_by = v_caller_id,
      verified_at = clock_timestamp(),
      notes = v_stored_feedback,
      updated_at = clock_timestamp()
    RETURNING id INTO v_result_id;

    -- Level 2 Lock: Profiles FOR UPDATE in deterministic ascending order
    PERFORM 1
    FROM public.profiles
    WHERE id IN (
      SELECT student_id
      FROM public.team_members
      WHERE team_id = v_submission.team_id AND hackathon_id = v_submission.hackathon_id
    )
    ORDER BY id ASC
    FOR UPDATE;

    -- Level 3 Lock & Points Ledger Insertion
    FOR v_member IN
      SELECT student_id, role
      FROM public.team_members
      WHERE team_id = v_submission.team_id AND hackathon_id = v_submission.hackathon_id
    LOOP
      v_idempotency_key := 'round_qualification_' || v_submission.hackathon_id::text || '_' || v_submission.round_id::text || '_' || v_member.student_id::text;

      INSERT INTO public.points_ledger (
        idempotency_key,
        student_id,
        hackathon_id,
        team_id,
        round_id,
        result_id,
        milestone_type,
        role_at_award,
        points,
        reason,
        awarded_by
      ) VALUES (
        v_idempotency_key,
        v_member.student_id,
        v_submission.hackathon_id,
        v_submission.team_id,
        v_submission.round_id,
        v_result_id,
        'round_qualification',
        v_member.role,
        CASE WHEN v_member.role = 'leader' THEN v_leader_points ELSE v_member_points END,
        'Round qualification verified by administrator',
        v_caller_id
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  -- Audit Log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    v_actor_role,
    'submission.reviewed',
    'submission',
    p_submission_id::text,
    jsonb_build_object(
      'decision', p_decision,
      'has_feedback', (v_stored_feedback IS NOT NULL),
      'review_id', v_review_id,
      'result_id', v_result_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'decision', p_decision,
    'review_id', v_review_id,
    'result_id', v_result_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_round_submission(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_round_submission(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 21. RPC: REOPEN REJECTED SUBMISSION (NULL-Guarded, Status Validated)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reopen_rejected_submission(
  p_submission_id UUID,
  p_target_status TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_submission RECORD;
  v_round RECORD;
  v_trimmed_reason TEXT;
  v_trimmed_status TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: submission ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  IF p_target_status IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target status cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_status := TRIM(p_target_status);
  IF v_trimmed_status NOT IN ('under_review', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid target status: %. Reopening is only permitted to under_review or revision_requested.', p_target_status USING ERRCODE = '22023';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful reopening reason of at least 10 characters is mandatory.' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_submission.is_current THEN
    RAISE EXCEPTION 'Cannot reopen historical submission version. Only active submissions can be reopened.' USING ERRCODE = '22023';
  END IF;

  IF v_submission.status <> 'rejected' THEN
    RAISE EXCEPTION 'Cannot reopen submission: only rejected submissions can be reopened (current status: %).', v_submission.status USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_admin_review_hackathon(v_submission.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have assignment authority to reopen submissions for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = v_submission.round_id;

  IF v_round.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot reopen submission: round is completed and locked.' USING ERRCODE = '55P03';
  END IF;

  UPDATE public.submissions
  SET status = v_trimmed_status,
      updated_at = clock_timestamp()
  WHERE id = p_submission_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    v_actor_role,
    'submission.reopened',
    'submission',
    p_submission_id::TEXT,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'prior_status', 'rejected',
      'target_status', v_trimmed_status,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'status', v_trimmed_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_rejected_submission(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_rejected_submission(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 22. RPC: RECORD ROUND WINNER PLACEMENT (Concurrency & Placement Serialized)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_round_winner_placement(
  p_submission_id UUID,
  p_placement TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_submission RECORD;
  v_round RECORD;
  v_result_id UUID;
  v_raw_placement TEXT;
  v_normalized_placement TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: submission ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_raw_placement := LOWER(TRIM(COALESCE(p_placement, '')));
  IF v_raw_placement NOT IN ('1', '2', '3', '1st', '2nd', '3rd', 'finalist', 'winner') THEN
    RAISE EXCEPTION 'Invalid placement: %. Allowed values are 1, 2, 3, 1st, 2nd, 3rd, finalist, winner.', p_placement USING ERRCODE = '22023';
  END IF;

  -- Normalize placement string for consistency
  v_normalized_placement := CASE
    WHEN v_raw_placement IN ('1', '1st') THEN '1st'
    WHEN v_raw_placement IN ('2', '2nd') THEN '2nd'
    WHEN v_raw_placement IN ('3', '3rd') THEN '3rd'
    ELSE v_raw_placement
  END;

  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_submission.is_current THEN
    RAISE EXCEPTION 'Cannot record placement for historical submission version.' USING ERRCODE = '22023';
  END IF;

  IF v_submission.status <> 'accepted' THEN
    RAISE EXCEPTION 'Winner placement can only be recorded for accepted submissions (current status: %).', v_submission.status USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_admin_review_hackathon(v_submission.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have assignment authority to record placements for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = v_submission.round_id;

  IF NOT v_round.is_final_round THEN
    IF (SELECT COUNT(*) FROM public.hackathon_rounds WHERE hackathon_id = v_submission.hackathon_id) > 1 THEN
      RAISE EXCEPTION 'Winner placements can only be awarded in the final round of a multi-round competition.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Lock team row to eliminate concurrent duplicate placement race conditions
  PERFORM 1 FROM public.teams WHERE id = v_submission.team_id FOR UPDATE;

  SELECT id INTO v_result_id
  FROM public.results
  WHERE hackathon_id = v_submission.hackathon_id
    AND team_id = v_submission.team_id
    AND milestone_type = 'win_placement';

  IF v_result_id IS NOT NULL THEN
    UPDATE public.results
    SET placement = v_normalized_placement,
        verified_by = v_caller_id,
        verified_at = clock_timestamp(),
        notes = NULLIF(TRIM(COALESCE(p_notes, '')), ''),
        updated_at = clock_timestamp()
    WHERE id = v_result_id;
  ELSE
    INSERT INTO public.results (
      hackathon_id,
      round_id,
      team_id,
      milestone_type,
      placement,
      is_published,
      verified_by,
      verified_at,
      notes
    ) VALUES (
      v_submission.hackathon_id,
      v_submission.round_id,
      v_submission.team_id,
      'win_placement',
      v_normalized_placement,
      true,
      v_caller_id,
      clock_timestamp(),
      NULLIF(TRIM(COALESCE(p_notes, '')), '')
    )
    RETURNING id INTO v_result_id;
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    v_actor_role,
    'submission.winner_placed',
    'results',
    v_result_id::TEXT,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'placement', v_normalized_placement,
      'result_id', v_result_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'result_id', v_result_id,
    'placement', v_normalized_placement
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_round_winner_placement(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_round_winner_placement(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 23. PROVISIONING & PERMISSION MANAGEMENT RPCS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_admin_profile(
  p_user_id UUID,
  p_full_name TEXT,
  p_email TEXT,
  p_phone TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_is_super_admin BOOLEAN DEFAULT false,
  p_initial_permissions TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_normalized_perms TEXT[] := ARRAY[]::TEXT[];
  v_perm TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only active Super Admin can provision administrators.' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR TRIM(COALESCE(p_full_name, '')) = '' OR TRIM(COALESCE(p_email, '')) = '' THEN
    RAISE EXCEPTION 'Invalid argument: user_id, full_name, and email are mandatory.' USING ERRCODE = '22023';
  END IF;

  IF p_initial_permissions IS NOT NULL THEN
    FOREACH v_perm IN ARRAY p_initial_permissions LOOP
      IF v_perm NOT IN (
        'verify_students',
        'manage_password_resets',
        'manage_hackathons',
        'assign_hackathons',
        'manage_teams',
        'manage_followups',
        'manage_students',
        'view_analytics',
        'export_data',
        'view_audit_logs',
        'manage_points',
        'manage_notifications',
        'view_student_data'
      ) THEN
        RAISE EXCEPTION 'Invalid permission key: %', v_perm USING ERRCODE = '22023';
      END IF;
    END LOOP;

    SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), ARRAY[]::TEXT[]) INTO v_normalized_perms
    FROM unnest(p_initial_permissions) p;
  END IF;

  INSERT INTO public.admin_profiles (
    id, full_name, email, phone, department, is_super_admin, is_active
  ) VALUES (
    p_user_id, TRIM(p_full_name), LOWER(TRIM(p_email)), NULLIF(TRIM(p_phone), ''), NULLIF(TRIM(p_department), ''),
    COALESCE(p_is_super_admin, false), true
  );

  IF cardinality(v_normalized_perms) > 0 AND NOT COALESCE(p_is_super_admin, false) THEN
    INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
    SELECT p_user_id, p, v_caller_id
    FROM unnest(v_normalized_perms) p;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    'super_admin',
    'admin.provisioned',
    'admin_profile',
    p_user_id::text,
    jsonb_build_object(
      'full_name', TRIM(p_full_name),
      'email', LOWER(TRIM(p_email)),
      'is_super_admin', COALESCE(p_is_super_admin, false),
      'permissions', v_normalized_perms
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', p_user_id,
    'is_super_admin', COALESCE(p_is_super_admin, false),
    'permissions', v_normalized_perms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_admin_profile(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_admin_profile(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_admin_permissions(
  p_target_admin_id UUID,
  p_permissions TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_target_is_super BOOLEAN;
  v_target_is_active BOOLEAN;
  v_normalized_perms TEXT[] := ARRAY[]::TEXT[];
  v_old_perms TEXT[] := ARRAY[]::TEXT[];
  v_added_perms TEXT[] := ARRAY[]::TEXT[];
  v_removed_perms TEXT[] := ARRAY[]::TEXT[];
  v_perm TEXT;
  v_active_event_count INT;
  v_active_event_titles TEXT[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only active Super Admin can manage permissions.' USING ERRCODE = '42501';
  END IF;

  IF p_target_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target admin ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  IF p_target_admin_id = v_caller_id THEN
    RAISE EXCEPTION 'Operation not permitted: Super Admins cannot alter their own permission set.' USING ERRCODE = '55000';
  END IF;

  IF p_permissions IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: permissions array cannot be null.' USING ERRCODE = '22023';
  END IF;

  SELECT is_super_admin, is_active
  INTO v_target_is_super, v_target_is_active
  FROM public.admin_profiles
  WHERE id = p_target_admin_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target administrator profile % does not exist.', p_target_admin_id USING ERRCODE = 'P0002';
  END IF;

  IF v_target_is_super IS TRUE THEN
    RAISE EXCEPTION 'Operation not permitted: Super Admin accounts hold innate root permissions.' USING ERRCODE = '55000';
  END IF;

  FOREACH v_perm IN ARRAY p_permissions LOOP
    IF v_perm NOT IN (
      'verify_students',
      'manage_password_resets',
      'manage_hackathons',
      'assign_hackathons',
      'manage_teams',
      'manage_followups',
      'manage_students',
      'view_analytics',
      'export_data',
      'view_audit_logs',
      'manage_points',
      'manage_notifications',
      'view_student_data'
    ) THEN
      RAISE EXCEPTION 'Invalid permission key: %', v_perm USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), ARRAY[]::TEXT[]) INTO v_normalized_perms
  FROM unnest(p_permissions) p;

  SELECT COALESCE(array_agg(permission ORDER BY permission), ARRAY[]::TEXT[]) INTO v_old_perms
  FROM public.admin_permissions
  WHERE admin_id = p_target_admin_id;

  SELECT COALESCE(array_agg(p ORDER BY p), ARRAY[]::TEXT[]) INTO v_added_perms
  FROM unnest(v_normalized_perms) p
  WHERE p NOT IN (SELECT unnest(v_old_perms));

  SELECT COALESCE(array_agg(p ORDER BY p), ARRAY[]::TEXT[]) INTO v_removed_perms
  FROM unnest(v_old_perms) p
  WHERE p NOT IN (SELECT unnest(v_normalized_perms));

  IF cardinality(v_added_perms) = 0 AND cardinality(v_removed_perms) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'admin_id', p_target_admin_id,
      'permissions', v_normalized_perms,
      'status_unchanged', true
    );
  END IF;

  -- Admin-management safeguard: cannot revoke manage_hackathons if admin is in-charge of active events
  IF 'manage_hackathons' = ANY(v_removed_perms) THEN
    SELECT COUNT(*), COALESCE(array_agg(title ORDER BY title), ARRAY[]::TEXT[])
    INTO v_active_event_count, v_active_event_titles
    FROM public.hackathons
    WHERE in_charge_admin_id = p_target_admin_id
      AND status IN ('published', 'registration_closed', 'ongoing');

    IF v_active_event_count > 0 THEN
      RAISE EXCEPTION 'Cannot revoke manage_hackathons permission: admin is currently assigned as in-charge administrator for % active hackathon(s): %. Reassign these hackathons via reassign_hackathon_in_charge_admin before revoking this permission.',
        v_active_event_count, array_to_string(v_active_event_titles, ', ')
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF cardinality(v_removed_perms) > 0 THEN
    DELETE FROM public.admin_permissions
    WHERE admin_id = p_target_admin_id
      AND permission = ANY(v_removed_perms);
  END IF;

  IF cardinality(v_added_perms) > 0 THEN
    INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
    SELECT p_target_admin_id, p, v_caller_id
    FROM unnest(v_added_perms) p;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    'super_admin',
    'admin.permissions_updated',
    'admin_profile',
    p_target_admin_id::text,
    jsonb_build_object(
      'old_permissions', v_old_perms,
      'new_permissions', v_normalized_perms,
      'added', v_added_perms,
      'removed', v_removed_perms
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', p_target_admin_id,
    'permissions', v_normalized_perms,
    'added', v_added_perms,
    'removed', v_removed_perms
  );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_admin_permissions(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_admin_permissions(UUID, TEXT[]) TO authenticated;

COMMIT;
