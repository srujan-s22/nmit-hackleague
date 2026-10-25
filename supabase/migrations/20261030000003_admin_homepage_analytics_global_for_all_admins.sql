-- Admin homepage analytics: identical, platform-wide data for every active admin.
--
-- 1. get_admin_dashboard_metrics: previously scoped an ordinary admin to the
--    hackathons they are in_charge of (and hid student/profile-change totals
--    unless they held verify_students/manage_students). Now every active admin
--    gets the same platform-wide aggregates the Super Admin sees.
-- 2. get_admin_participation_analytics: new SECURITY DEFINER RPC feeding the
--    Student Participation / Hackathon Activity charts. (A service-role
--    client cannot be used for this: on hosted, service_role has no table
--    grant on public.hackathons / public.team_members.)
--
-- Additive: CREATE OR REPLACE of an existing function body + one new function.

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

  -- Homepage analytics are intentionally identical for every active admin:
  -- any active administrator receives the Super Admin (platform-wide) view.
  -- Operational authorization elsewhere (assignments, feature permissions,
  -- RLS) is untouched; this RPC only returns aggregate counts, never rows.
  v_is_super := TRUE;

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
-- get_admin_participation_analytics
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_participation_analytics(p_hackathon_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_active BOOLEAN;
  v_total_students BIGINT := 0;
  v_participating BIGINT := 0;
  v_activity jsonb;
  v_hackathons jsonb;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  SELECT is_active INTO v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.';
  END IF;

  IF p_hackathon_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id
  ) THEN
    RAISE EXCEPTION 'Target hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Eligible population: approved students (same population as the
  -- "Students" KPI card's Approved badge).
  SELECT COUNT(*) INTO v_total_students
  FROM public.profiles
  WHERE registration_status = 'approved';

  -- Distinct eligible students on at least one team, in scope.
  SELECT COUNT(DISTINCT tm.student_id) INTO v_participating
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.student_id AND p.registration_status = 'approved'
  WHERE p_hackathon_id IS NULL OR tm.hackathon_id = p_hackathon_id;

  -- Per-hackathon distinct eligible participants (draft/archived excluded).
  SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO v_activity
  FROM (
    SELECT
      h.id AS hackathon_id,
      h.title,
      h.created_at,
      COUNT(DISTINCT p.id) AS participants
    FROM public.hackathons h
    LEFT JOIN public.team_members tm ON tm.hackathon_id = h.id
    LEFT JOIN public.profiles p ON p.id = tm.student_id AND p.registration_status = 'approved'
    WHERE h.status NOT IN ('draft', 'archived')
      AND (p_hackathon_id IS NULL OR h.id = p_hackathon_id)
    GROUP BY h.id, h.title, h.created_at
  ) a;

  -- Options for the scope dropdown: every hackathon, same for every admin.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title) ORDER BY h.created_at DESC), '[]'::jsonb)
  INTO v_hackathons
  FROM public.hackathons h;

  RETURN jsonb_build_object(
    'participation', jsonb_build_object(
      'participating', v_participating,
      'not_participating', GREATEST(v_total_students - v_participating, 0),
      'total_students', v_total_students
    ),
    'activity', v_activity,
    'hackathons', v_hackathons
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_participation_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_participation_analytics(uuid) TO authenticated;
