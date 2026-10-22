-- Migration: 20261024000001_phase11_analytics_and_reports.sql
-- Description: Phase 11 - Hardened Data Export RPC and Authoritative Dashboard Metrics RPC

-- ============================================================================
-- 1. HARDEN AUDIT_DATA_EXPORT RPC
-- ============================================================================
-- Enforce:
--  - Authentication & active admin status check
--  - Platform-wide exports (p_hackathon_id IS NULL) strictly require Super Admin status
--  - Hackathon-scoped exports require 'export_data' permission and assignment via can_admin_manage_hackathon
--  - 'audit_logs' dataset requires Super Admin status OR 'view_audit_logs' permission
--  - Valid dataset name validation
--  - Valid format ('csv', 'xlsx', 'zip')
--  - Immutable audit log entry in public.audit_logs

CREATE OR REPLACE FUNCTION public.audit_data_export(
  p_dataset text,
  p_format text,
  p_hackathon_id uuid DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
  v_allowed_datasets TEXT[] := ARRAY[
    'all',
    'students',
    'hackathons',
    'teams',
    'team_members',
    'registrations',
    'round_results',
    'results',
    'points',
    'points_ledger',
    'winners',
    'hackathon_summary',
    'submissions',
    'reviews',
    'audit_logs',
    'storage_objects',
    'profile_change_requests'
  ];
BEGIN
  -- 1. Caller Authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 2. Caller Administrative Identity & Active Check
  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.';
  END IF;

  -- 3. Validate Format
  IF p_format NOT IN ('csv', 'xlsx', 'zip') THEN
    RAISE EXCEPTION 'Invalid export format: %. Allowed formats are csv, xlsx, zip.', p_format
      USING ERRCODE = '22023';
  END IF;

  -- 4. Validate Dataset Name
  IF NOT (p_dataset = ANY(v_allowed_datasets)) THEN
    RAISE EXCEPTION 'Invalid export dataset: %. Allowed datasets are %.', p_dataset, v_allowed_datasets
      USING ERRCODE = '22023';
  END IF;

  -- 5. Permission Check for Basic Export
  IF NOT (v_is_super IS TRUE OR public.current_has_permission('export_data')) THEN
    RAISE EXCEPTION 'Access denied: export_data permission required.';
  END IF;

  -- 6. Enforce Scope Boundaries
  IF v_is_super IS NOT TRUE THEN
    -- Ordinary admins CANNOT export platform-wide data
    IF p_hackathon_id IS NULL THEN
      RAISE EXCEPTION 'Access denied: platform-wide global exports require Super Admin privilege.';
    END IF;

    -- Ordinary admins can only export assigned hackathons
    IF NOT public.can_admin_manage_hackathon(p_hackathon_id, 'export_data') THEN
      RAISE EXCEPTION 'Access denied: not authorized to export data for this hackathon.';
    END IF;
  ELSE
    -- Super Admin: if hackathon_id is provided, verify event exists
    IF p_hackathon_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id) THEN
        RAISE EXCEPTION 'Target hackathon not found.'
          USING ERRCODE = 'P0002';
      END IF;
    END IF;
  END IF;

  -- 7. Specific Guard for Audit Logs Dataset
  IF p_dataset = 'audit_logs' THEN
    IF NOT (v_is_super IS TRUE OR public.current_has_permission('view_audit_logs')) THEN
      RAISE EXCEPTION 'Access denied: view_audit_logs permission required to export audit logs.';
    END IF;
  END IF;

  -- 8. Write Immutable Audit Trail
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    CASE WHEN v_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'data.exported',
    'report',
    COALESCE(p_hackathon_id::text, 'platform'),
    jsonb_build_object(
      'dataset', p_dataset,
      'format', p_format,
      'hackathon_id', p_hackathon_id,
      'filters', COALESCE(p_filters, '{}'::jsonb)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_data_export(text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_data_export(text, text, uuid, jsonb) TO authenticated;

-- ============================================================================
-- 2. CREATE GET_ADMIN_DASHBOARD_METRICS RPC
-- ============================================================================
-- Authoritative, reconciled metrics across students, hackathons, teams,
-- submissions, results, points, and profile change requests.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(p_hackathon_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
  v_scope_hackathon_ids UUID[];
  
  -- Metrics variables
  v_students_approved BIGINT := 0;
  v_students_pending BIGINT := 0;
  v_students_rejected BIGINT := 0;
  v_students_total BIGINT := 0;

  v_hackathons_published BIGINT := 0;
  v_hackathons_draft BIGINT := 0;
  v_hackathons_archived BIGINT := 0;
  v_hackathons_total BIGINT := 0;

  v_teams_total BIGINT := 0;
  v_teams_internal_registered BIGINT := 0;
  v_teams_submitted_claims BIGINT := 0;
  v_teams_verified_external BIGINT := 0;
  v_teams_rejected_external BIGINT := 0;

  v_submissions_total BIGINT := 0;
  v_submissions_pending BIGINT := 0;
  v_submissions_accepted BIGINT := 0;
  v_submissions_rejected BIGINT := 0;

  v_results_verified BIGINT := 0;
  v_results_winners BIGINT := 0;

  v_points_total_awarded BIGINT := 0;
  v_points_tx_count BIGINT := 0;

  v_profile_changes_pending BIGINT := 0;
  v_profile_changes_approved BIGINT := 0;
  v_profile_changes_rejected BIGINT := 0;
BEGIN
  -- 1. Caller Authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 2. Caller Administrative Identity Check
  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.';
  END IF;

  -- 3. Resolve Scope
  IF p_hackathon_id IS NOT NULL THEN
    -- Verify event existence
    IF NOT EXISTS (SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id) THEN
      RAISE EXCEPTION 'Target hackathon not found.'
        USING ERRCODE = 'P0002';
    END IF;

    -- If ordinary admin, verify access to target event
    IF v_is_super IS NOT TRUE THEN
      IF NOT public.can_admin_manage_hackathon(p_hackathon_id, NULL) THEN
        RAISE EXCEPTION 'Access denied: not authorized for this hackathon.';
      END IF;
    END IF;

    v_scope_hackathon_ids := ARRAY[p_hackathon_id];
  ELSE
    -- p_hackathon_id IS NULL
    IF v_is_super IS TRUE THEN
      -- Super Admin has global scope
      SELECT ARRAY_AGG(id) INTO v_scope_hackathon_ids FROM public.hackathons;
    ELSE
      -- Ordinary Admin: scope to assigned events where in_charge_admin_id = caller
      SELECT ARRAY_AGG(id) INTO v_scope_hackathon_ids
      FROM public.hackathons
      WHERE in_charge_admin_id = v_caller_id;
    END IF;
  END IF;

  -- Handle case when no hackathons exist in scope
  IF v_scope_hackathon_ids IS NULL THEN
    v_scope_hackathon_ids := '{}'::UUID[];
  END IF;

  -- 4. Calculate Hackathons Metrics
  IF p_hackathon_id IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE status IN ('published', 'registration_closed', 'ongoing', 'completed')),
      COUNT(*) FILTER (WHERE status = 'draft'),
      COUNT(*) FILTER (WHERE status = 'archived'),
      COUNT(*)
    INTO v_hackathons_published, v_hackathons_draft, v_hackathons_archived, v_hackathons_total
    FROM public.hackathons
    WHERE id = p_hackathon_id;
  ELSE
    IF v_is_super IS TRUE THEN
      SELECT
        COUNT(*) FILTER (WHERE status IN ('published', 'registration_closed', 'ongoing', 'completed')),
        COUNT(*) FILTER (WHERE status = 'draft'),
        COUNT(*) FILTER (WHERE status = 'archived'),
        COUNT(*)
      INTO v_hackathons_published, v_hackathons_draft, v_hackathons_archived, v_hackathons_total
      FROM public.hackathons;
    ELSE
      SELECT
        COUNT(*) FILTER (WHERE status IN ('published', 'registration_closed', 'ongoing', 'completed')),
        COUNT(*) FILTER (WHERE status = 'draft'),
        COUNT(*) FILTER (WHERE status = 'archived'),
        COUNT(*)
      INTO v_hackathons_published, v_hackathons_draft, v_hackathons_archived, v_hackathons_total
      FROM public.hackathons
      WHERE id = ANY(v_scope_hackathon_ids);
    END IF;
  END IF;

  -- 5. Calculate Students Metrics
  IF p_hackathon_id IS NULL AND (v_is_super IS TRUE OR public.current_has_permission('verify_students') OR public.current_has_permission('manage_students')) THEN
    SELECT
      COUNT(*) FILTER (WHERE registration_status = 'approved'),
      COUNT(*) FILTER (WHERE registration_status = 'pending'),
      COUNT(*) FILTER (WHERE registration_status = 'rejected'),
      COUNT(*)
    INTO v_students_approved, v_students_pending, v_students_rejected, v_students_total
    FROM public.profiles;
  ELSE
    -- Scoped to participants in the scoped events
    SELECT
      COUNT(DISTINCT p.id) FILTER (WHERE p.registration_status = 'approved'),
      COUNT(DISTINCT p.id) FILTER (WHERE p.registration_status = 'pending'),
      COUNT(DISTINCT p.id) FILTER (WHERE p.registration_status = 'rejected'),
      COUNT(DISTINCT p.id)
    INTO v_students_approved, v_students_pending, v_students_rejected, v_students_total
    FROM public.profiles p
    JOIN public.team_members tm ON tm.student_id = p.id
    WHERE tm.hackathon_id = ANY(v_scope_hackathon_ids);
  END IF;

  -- 6. Calculate Teams & Registrations Metrics
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE internal_status IN ('complete', 'locked')),
    COUNT(*) FILTER (WHERE external_status = 'submitted'),
    COUNT(*) FILTER (WHERE external_status = 'verified'),
    COUNT(*) FILTER (WHERE external_status = 'rejected')
  INTO
    v_teams_total,
    v_teams_internal_registered,
    v_teams_submitted_claims,
    v_teams_verified_external,
    v_teams_rejected_external
  FROM public.teams
  WHERE hackathon_id = ANY(v_scope_hackathon_ids);

  -- 7. Calculate Submissions Metrics
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'submitted'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected')
  INTO
    v_submissions_total,
    v_submissions_pending,
    v_submissions_accepted,
    v_submissions_rejected
  FROM public.submissions
  WHERE hackathon_id = ANY(v_scope_hackathon_ids);

  -- 8. Calculate Results & Outcomes Metrics
  SELECT
    COUNT(*) FILTER (WHERE is_published IS TRUE),
    COUNT(*) FILTER (WHERE is_published IS TRUE AND milestone_type = 'win_placement')
  INTO
    v_results_verified,
    v_results_winners
  FROM public.results
  WHERE hackathon_id = ANY(v_scope_hackathon_ids);

  -- 9. Calculate Points Metrics
  SELECT
    COALESCE(SUM(points), 0),
    COUNT(*)
  INTO
    v_points_total_awarded,
    v_points_tx_count
  FROM public.points_ledger
  WHERE hackathon_id = ANY(v_scope_hackathon_ids);

  -- 10. Calculate Profile Change Requests Metrics
  IF p_hackathon_id IS NULL AND (v_is_super IS TRUE OR public.current_has_permission('manage_students')) THEN
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending'),
      COUNT(*) FILTER (WHERE status = 'approved'),
      COUNT(*) FILTER (WHERE status = 'rejected')
    INTO
      v_profile_changes_pending,
      v_profile_changes_approved,
      v_profile_changes_rejected
    FROM public.profile_change_requests;
  ELSE
    SELECT
      COUNT(DISTINCT pcr.id) FILTER (WHERE pcr.status = 'pending'),
      COUNT(DISTINCT pcr.id) FILTER (WHERE pcr.status = 'approved'),
      COUNT(DISTINCT pcr.id) FILTER (WHERE pcr.status = 'rejected')
    INTO
      v_profile_changes_pending,
      v_profile_changes_approved,
      v_profile_changes_rejected
    FROM public.profile_change_requests pcr
    JOIN public.team_members tm ON tm.student_id = pcr.student_id
    WHERE tm.hackathon_id = ANY(v_scope_hackathon_ids);
  END IF;

  RETURN jsonb_build_object(
    'scope', jsonb_build_object(
      'is_global', (p_hackathon_id IS NULL AND v_is_super IS TRUE),
      'hackathon_id', p_hackathon_id,
      'events_count', cardinality(v_scope_hackathon_ids)
    ),
    'students', jsonb_build_object(
      'total', v_students_total,
      'approved', v_students_approved,
      'pending', v_students_pending,
      'rejected', v_students_rejected
    ),
    'hackathons', jsonb_build_object(
      'total', v_hackathons_total,
      'published', v_hackathons_published,
      'draft', v_hackathons_draft,
      'archived', v_hackathons_archived
    ),
    'teams', jsonb_build_object(
      'total', v_teams_total,
      'internal_registered', v_teams_internal_registered,
      'submitted_claims', v_teams_submitted_claims,
      'verified_external', v_teams_verified_external,
      'rejected_external', v_teams_rejected_external
    ),
    'submissions', jsonb_build_object(
      'total', v_submissions_total,
      'pending', v_submissions_pending,
      'accepted', v_submissions_accepted,
      'rejected', v_submissions_rejected
    ),
    'results', jsonb_build_object(
      'verified_outcomes', v_results_verified,
      'winners_count', v_results_winners
    ),
    'points', jsonb_build_object(
      'total_distributed', v_points_total_awarded,
      'transactions_count', v_points_tx_count
    ),
    'profile_changes', jsonb_build_object(
      'pending', v_profile_changes_pending,
      'approved', v_profile_changes_approved,
      'rejected', v_profile_changes_rejected
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_metrics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(uuid) TO authenticated;

-- ============================================================================
-- 3. CREATE EXPORT_PROFILE_CHANGE_REQUESTS_REPORT RPC
-- ============================================================================
-- Dedicated reporting RPC for profile change request records, strictly requiring
-- Super Admin privileges or export_data/manage_students permission.

DROP FUNCTION IF EXISTS public.export_profile_change_requests_report(text);

CREATE OR REPLACE FUNCTION public.export_profile_change_requests_report(
  p_status_filter text DEFAULT NULL
)
RETURNS SETOF public.profile_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
BEGIN
  -- 1. Caller Authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 2. Caller Administrative Identity Check
  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.';
  END IF;

  -- 3. Authorization Check
  IF NOT (v_is_super IS TRUE OR public.current_has_permission('export_data') OR public.current_has_permission('manage_students')) THEN
    RAISE EXCEPTION 'Access denied: export_data or manage_students permission required.';
  END IF;

  -- 4. Status Filter Validation if provided
  IF p_status_filter IS NOT NULL AND p_status_filter NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status filter: %. Allowed values are pending, approved, rejected.', p_status_filter
      USING ERRCODE = '22023';
  END IF;

  -- 5. Return Query
  RETURN QUERY
  SELECT *
  FROM public.profile_change_requests pcr
  WHERE (p_status_filter IS NULL OR pcr.status = p_status_filter)
  ORDER BY pcr.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.export_profile_change_requests_report(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_profile_change_requests_report(text) TO authenticated;

-- ============================================================================
-- 4. HARDEN ROW-LEVEL SECURITY FOR DATA EXPORT SCOPING
-- ============================================================================

-- 4a. Profiles: Allow assigned admins with export_data to view participants in their hackathons
DROP POLICY IF EXISTS profiles_select_assigned_export ON public.profiles;
CREATE POLICY profiles_select_assigned_export ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.student_id = profiles.id
      AND public.can_admin_manage_hackathon(tm.hackathon_id, 'export_data')
  )
);

-- 4b. Team Members: Tighten scoping so export_data only permits assigned hackathons
DROP POLICY IF EXISTS team_members_select_admin ON public.team_members;
CREATE POLICY team_members_select_admin ON public.team_members
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_teams') OR
  public.can_admin_manage_hackathon(hackathon_id, 'export_data')
);

-- 4c. Teams: Tighten scoping so export_data only permits assigned hackathons
DROP POLICY IF EXISTS teams_select_admin ON public.teams;
CREATE POLICY teams_select_admin ON public.teams
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_teams') OR
  public.can_admin_manage_hackathon(hackathon_id, 'export_data')
);

-- 4d. Submissions: Tighten scoping so export_data only permits assigned hackathons
DROP POLICY IF EXISTS submissions_select_admin ON public.submissions;
CREATE POLICY submissions_select_admin ON public.submissions
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_hackathons') OR
  public.can_admin_manage_hackathon(hackathon_id, 'export_data')
);

-- 4e. Results: Tighten scoping so export_data only permits assigned hackathons
DROP POLICY IF EXISTS results_select_admin ON public.results;
CREATE POLICY results_select_admin ON public.results
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_hackathons') OR
  public.can_admin_manage_hackathon(hackathon_id, 'export_data')
);

-- 4f. Points Ledger: Tighten scoping so export_data only permits assigned hackathons
DROP POLICY IF EXISTS points_ledger_select_admin ON public.points_ledger;
CREATE POLICY points_ledger_select_admin ON public.points_ledger
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_points') OR
  public.can_admin_manage_hackathon(hackathon_id, 'export_data')
);

