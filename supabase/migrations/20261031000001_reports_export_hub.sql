-- Migration: 20261031000001_reports_export_hub.sql
-- Description: Reports & Exports Hub. Database-authoritative export access.
--
-- Background: the reports page/action scoped regular admins by
-- hackathons.in_charge_admin_id while the database authorizes exports through
-- can_admin_manage_hackathon(id, 'export_data') (permission + hackathon_admin_assignments).
-- Those two models disagree, so an assigned admin saw no hackathons. This migration
-- makes the database the single authority and exposes it through narrow RPCs:
--
--   get_export_capabilities()          what the caller may export (flags only)
--   get_exportable_hackathons()        hackathons the caller may export
--   get_export_dataset_counts(...)     exact per-dataset row counts for a scope
--   export_dataset_page(...)           keyset-paged, human-readable rows
--   record_data_export(...)            terminal audit entry (success | failed)
--
-- No RLS policy is changed or weakened. Each RPC is SECURITY DEFINER with a pinned
-- search_path and performs its own explicit authorization, so an admin who holds
-- export_data for an assigned hackathon can read exactly that hackathon's export
-- rows even where table RLS only exposes them to reviewers/managers.
--
-- Rules enforced here (single source of truth):
--   * caller must be an authenticated, active admin
--   * Super Admin: global scope or any existing hackathon
--   * regular admin: export_data permission AND an assignment for the hackathon
--     (can_admin_manage_hackathon); global scope is never allowed;
--     in_charge_admin_id grants nothing
--   * audit_logs: Super Admin or view_audit_logs
--   * profile_change_requests: Super Admin or manage_students
--   * storage_objects (retention queue): Super Admin only
--   * student email/phone (and email/phone profile-change values): Super Admin or
--     view_student_data; omitted/redacted otherwise

-- ============================================================================
-- 1. INTERNAL AUTHORIZATION HELPER (not callable by API roles)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._export_authorize(
  p_dataset text,
  p_hackathon_id uuid,
  OUT o_is_super boolean,
  OUT o_can_pii boolean
)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_active boolean;
  v_known text[] := ARRAY[
    'students', 'team_members', 'hackathons', 'teams', 'registrations',
    'round_results', 'winners', 'points', 'hackathon_summary', 'submissions', 'reviews',
    'audit_logs', 'profile_change_requests', 'storage_objects'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT is_super_admin, is_active INTO o_is_super, v_active
  FROM public.admin_profiles
  WHERE id = v_caller;

  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.' USING ERRCODE = '42501';
  END IF;
  o_is_super := COALESCE(o_is_super, FALSE);

  IF p_dataset IS NOT NULL AND NOT (p_dataset = ANY (v_known)) THEN
    RAISE EXCEPTION 'Invalid export dataset: %.', p_dataset USING ERRCODE = '22023';
  END IF;

  IF NOT (o_is_super OR public.current_has_permission('export_data')) THEN
    RAISE EXCEPTION 'Access denied: export_data permission required.' USING ERRCODE = '42501';
  END IF;

  IF o_is_super THEN
    IF p_hackathon_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id) THEN
      RAISE EXCEPTION 'Target hackathon not found.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    IF p_hackathon_id IS NULL THEN
      RAISE EXCEPTION 'Access denied: platform-wide global exports require Super Admin privilege.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.can_admin_manage_hackathon(p_hackathon_id, 'export_data') THEN
      RAISE EXCEPTION 'Access denied: not authorized to export data for this hackathon.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_dataset = 'audit_logs'
     AND NOT (o_is_super OR public.current_has_permission('view_audit_logs')) THEN
    RAISE EXCEPTION 'Access denied: view_audit_logs permission required to export audit logs.' USING ERRCODE = '42501';
  END IF;

  IF p_dataset = 'profile_change_requests'
     AND NOT (o_is_super OR public.current_has_permission('manage_students')) THEN
    RAISE EXCEPTION 'Access denied: manage_students permission required to export profile change requests.' USING ERRCODE = '42501';
  END IF;

  IF p_dataset = 'storage_objects' AND NOT o_is_super THEN
    RAISE EXCEPTION 'Access denied: Super Admin status is required to export the storage retention queue.' USING ERRCODE = '42501';
  END IF;

  o_can_pii := o_is_super OR public.current_has_permission('view_student_data');
END;
$$;

REVOKE ALL ON FUNCTION public._export_authorize(text, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. CAPABILITIES
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_export_capabilities()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_super boolean;
  v_active boolean;
  v_export boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT is_super_admin, is_active INTO v_is_super, v_active
  FROM public.admin_profiles WHERE id = v_caller;

  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.' USING ERRCODE = '42501';
  END IF;
  v_is_super := COALESCE(v_is_super, FALSE);
  v_export := v_is_super OR public.current_has_permission('export_data');

  RETURN jsonb_build_object(
    'is_super_admin', v_is_super,
    'can_export', v_export,
    'can_view_personal_data', v_export AND (v_is_super OR public.current_has_permission('view_student_data')),
    'can_export_audit_logs', v_export AND (v_is_super OR public.current_has_permission('view_audit_logs')),
    'can_export_profile_changes', v_export AND (v_is_super OR public.current_has_permission('manage_students')),
    'can_export_storage_queue', v_export AND v_is_super,
    'can_export_global', v_export AND v_is_super
  );
END;
$$;

-- ============================================================================
-- 3. EXPORTABLE HACKATHONS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_exportable_hackathons()
RETURNS TABLE (id uuid, title text, slug text, status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_super boolean;
  v_active boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT ap.is_super_admin, ap.is_active INTO v_is_super, v_active
  FROM public.admin_profiles ap WHERE ap.id = v_caller;

  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_is_super, FALSE) THEN
    RETURN QUERY
      SELECT h.id, h.title, h.slug, h.status
      FROM public.hackathons h
      ORDER BY h.created_at DESC, h.id;
    RETURN;
  END IF;

  IF NOT public.current_has_permission('export_data') THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT h.id, h.title, h.slug, h.status
    FROM public.hackathons h
    WHERE public.can_admin_manage_hackathon(h.id, 'export_data')
    ORDER BY h.created_at DESC, h.id;
END;
$$;

-- ============================================================================
-- 4. EXACT ROW COUNTS (preview)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_export_dataset_counts(
  p_hackathon_id uuid,
  p_datasets text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ds text;
  v_count bigint;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_datasets IS NULL OR cardinality(p_datasets) = 0 THEN
    RAISE EXCEPTION 'At least one dataset is required.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_datasets) > 20 THEN
    RAISE EXCEPTION 'Too many datasets requested.' USING ERRCODE = '22023';
  END IF;

  FOREACH v_ds IN ARRAY p_datasets LOOP
    PERFORM public._export_authorize(v_ds, p_hackathon_id);

    v_count := CASE v_ds
      WHEN 'students' THEN (
        SELECT count(*) FROM public.profiles p
        WHERE p_hackathon_id IS NULL OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.student_id = p.id AND tm.hackathon_id = p_hackathon_id))
      WHEN 'team_members' THEN (
        SELECT count(*) FROM public.team_members tm
        WHERE p_hackathon_id IS NULL OR tm.hackathon_id = p_hackathon_id)
      WHEN 'hackathons' THEN (
        SELECT count(*) FROM public.hackathons h
        WHERE p_hackathon_id IS NULL OR h.id = p_hackathon_id)
      WHEN 'hackathon_summary' THEN (
        SELECT count(*) FROM public.hackathons h
        WHERE p_hackathon_id IS NULL OR h.id = p_hackathon_id)
      WHEN 'teams' THEN (
        SELECT count(*) FROM public.teams t
        WHERE p_hackathon_id IS NULL OR t.hackathon_id = p_hackathon_id)
      WHEN 'registrations' THEN (
        SELECT count(*) FROM public.teams t
        WHERE p_hackathon_id IS NULL OR t.hackathon_id = p_hackathon_id)
      WHEN 'round_results' THEN (
        SELECT count(*) FROM public.results r
        WHERE p_hackathon_id IS NULL OR r.hackathon_id = p_hackathon_id)
      WHEN 'winners' THEN (
        SELECT count(*) FROM public.results r
        WHERE r.milestone_type = 'win_placement'
          AND (p_hackathon_id IS NULL OR r.hackathon_id = p_hackathon_id))
      WHEN 'points' THEN (
        SELECT count(*) FROM public.points_ledger l
        WHERE p_hackathon_id IS NULL OR l.hackathon_id = p_hackathon_id)
      WHEN 'submissions' THEN (
        SELECT count(*) FROM public.submissions s
        WHERE p_hackathon_id IS NULL OR s.hackathon_id = p_hackathon_id)
      WHEN 'reviews' THEN (
        SELECT count(*) FROM public.submission_reviews sr
        JOIN public.submissions s ON s.id = sr.submission_id
        WHERE p_hackathon_id IS NULL OR s.hackathon_id = p_hackathon_id)
      WHEN 'audit_logs' THEN (
        SELECT count(*) FROM public.audit_logs a
        WHERE p_hackathon_id IS NULL OR a.target_id = p_hackathon_id::text)
      WHEN 'profile_change_requests' THEN (
        SELECT count(*) FROM public.profile_change_requests c
        WHERE p_hackathon_id IS NULL OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.student_id = c.student_id AND tm.hackathon_id = p_hackathon_id))
      WHEN 'storage_objects' THEN (
        SELECT count(*) FROM public.storage_deletion_queue q
        WHERE p_hackathon_id IS NULL OR q.event_id = p_hackathon_id)
    END;

    v_out := v_out || jsonb_build_object(v_ds, v_count);
  END LOOP;

  RETURN v_out;
END;
$$;

-- ============================================================================
-- 5. KEYSET-PAGED, HUMAN-READABLE ROWS
-- ============================================================================
-- Pages are ordered by the base table's primary key and continue strictly after
-- p_after, so concurrent inserts can neither duplicate nor skip a row that existed
-- when the export started. Every join is a LEFT JOIN on a unique key (or an
-- aggregate subquery), so one-to-many joins cannot multiply rows.
-- Hard page cap: 1000 (also PostgREST's default response limit).
CREATE OR REPLACE FUNCTION public.export_dataset_page(
  p_dataset text,
  p_hackathon_id uuid,
  p_after uuid DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (row_id uuid, data jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
  v_is_super boolean;
  v_pii boolean;
BEGIN
  SELECT a.o_is_super, a.o_can_pii INTO v_is_super, v_pii
  FROM public._export_authorize(p_dataset, p_hackathon_id) a;

  IF p_dataset = 'students' THEN
    RETURN QUERY
    SELECT p.id,
      jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'usn', p.usn,
        'branch', p.branch, 'academic_year', p.academic_year,
        'registration_status', p.registration_status, 'created_at', p.created_at)
      || CASE WHEN v_pii THEN jsonb_build_object('email', p.email, 'phone', p.phone) ELSE '{}'::jsonb END
    FROM public.profiles p
    WHERE (p_after IS NULL OR p.id > p_after)
      AND (p_hackathon_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.student_id = p.id AND tm.hackathon_id = p_hackathon_id))
    ORDER BY p.id LIMIT v_limit;

  ELSIF p_dataset = 'team_members' THEN
    RETURN QUERY
    SELECT tm.id,
      jsonb_build_object(
        'student_name', s.full_name, 'usn', s.usn, 'branch', s.branch,
        'team_name', t.name, 'hackathon_title', h.title, 'role', tm.role,
        'joined_at', tm.joined_at, 'member_id', tm.id, 'student_id', tm.student_id,
        'team_id', tm.team_id, 'hackathon_id', tm.hackathon_id)
    FROM public.team_members tm
    LEFT JOIN public.profiles s ON s.id = tm.student_id
    LEFT JOIN public.teams t ON t.id = tm.team_id
    LEFT JOIN public.hackathons h ON h.id = tm.hackathon_id
    WHERE (p_after IS NULL OR tm.id > p_after)
      AND (p_hackathon_id IS NULL OR tm.hackathon_id = p_hackathon_id)
    ORDER BY tm.id LIMIT v_limit;

  ELSIF p_dataset = 'hackathons' THEN
    RETURN QUERY
    SELECT h.id,
      jsonb_build_object(
        'title', h.title, 'status', h.status, 'mode', h.mode, 'organizer', h.organizer,
        'registration_start_at', h.registration_start_at,
        'registration_end_at', h.registration_end_at,
        'event_start_at', h.event_start_at, 'event_end_at', h.event_end_at,
        'min_team_size', h.min_team_size, 'max_team_size', h.max_team_size,
        'is_solo_allowed', h.is_solo_allowed, 'slug', h.slug,
        'created_at', h.created_at, 'hackathon_id', h.id)
    FROM public.hackathons h
    WHERE (p_after IS NULL OR h.id > p_after)
      AND (p_hackathon_id IS NULL OR h.id = p_hackathon_id)
    ORDER BY h.id LIMIT v_limit;

  ELSIF p_dataset = 'teams' THEN
    RETURN QUERY
    SELECT t.id,
      jsonb_build_object(
        'team_name', t.name, 'hackathon_title', h.title,
        'leader_name', l.full_name, 'leader_usn', l.usn,
        'member_count', (SELECT count(*) FROM public.team_members m WHERE m.team_id = t.id),
        'internal_status', t.internal_status, 'external_status', t.external_status,
        'created_at', t.created_at, 'team_id', t.id,
        'hackathon_id', t.hackathon_id, 'leader_id', t.leader_id)
    FROM public.teams t
    LEFT JOIN public.hackathons h ON h.id = t.hackathon_id
    LEFT JOIN public.profiles l ON l.id = t.leader_id
    WHERE (p_after IS NULL OR t.id > p_after)
      AND (p_hackathon_id IS NULL OR t.hackathon_id = p_hackathon_id)
    ORDER BY t.id LIMIT v_limit;

  ELSIF p_dataset = 'registrations' THEN
    RETURN QUERY
    SELECT t.id,
      jsonb_build_object(
        'team_name', t.name, 'hackathon_title', h.title,
        'leader_name', l.full_name, 'leader_usn', l.usn,
        'registration_status', t.external_status,
        'proof_on_file', (t.external_proof_path IS NOT NULL),
        'proof_submitted_at', t.external_proof_submitted_at,
        'proof_reviewed_by', rv.full_name,
        'proof_reviewed_at', t.external_proof_reviewed_at,
        'cdc_declaration_accepted', t.cdc_declaration_accepted,
        'cdc_declaration_accepted_at', t.cdc_declaration_accepted_at,
        'cdc_declaration_version', t.cdc_declaration_text_version,
        'created_at', t.created_at, 'team_id', t.id, 'hackathon_id', t.hackathon_id)
    FROM public.teams t
    LEFT JOIN public.hackathons h ON h.id = t.hackathon_id
    LEFT JOIN public.profiles l ON l.id = t.leader_id
    LEFT JOIN public.admin_profiles rv ON rv.id = t.external_proof_reviewed_by
    WHERE (p_after IS NULL OR t.id > p_after)
      AND (p_hackathon_id IS NULL OR t.hackathon_id = p_hackathon_id)
    ORDER BY t.id LIMIT v_limit;

  ELSIF p_dataset IN ('round_results', 'winners') THEN
    RETURN QUERY
    SELECT r.id,
      jsonb_build_object(
        'hackathon_title', h.title, 'round_number', rd.round_number, 'round_name', rd.name,
        'team_name', t.name, 'leader_name', l.full_name, 'leader_usn', l.usn,
        'milestone_type', r.milestone_type, 'placement', r.placement,
        'is_published', r.is_published, 'notes', r.notes,
        'verified_by', vb.full_name, 'verified_at', r.verified_at,
        'created_at', r.created_at, 'result_id', r.id, 'hackathon_id', r.hackathon_id,
        'round_id', r.round_id, 'team_id', r.team_id)
    FROM public.results r
    LEFT JOIN public.hackathons h ON h.id = r.hackathon_id
    LEFT JOIN public.hackathon_rounds rd ON rd.id = r.round_id
    LEFT JOIN public.teams t ON t.id = r.team_id
    LEFT JOIN public.profiles l ON l.id = t.leader_id
    LEFT JOIN public.admin_profiles vb ON vb.id = r.verified_by
    WHERE (p_after IS NULL OR r.id > p_after)
      AND (p_hackathon_id IS NULL OR r.hackathon_id = p_hackathon_id)
      AND (p_dataset = 'round_results' OR r.milestone_type = 'win_placement')
    ORDER BY r.id LIMIT v_limit;

  ELSIF p_dataset = 'points' THEN
    RETURN QUERY
    SELECT l.id,
      jsonb_build_object(
        'student_name', s.full_name, 'usn', s.usn,
        'hackathon_title', h.title, 'team_name', t.name, 'round_name', rd.name,
        'milestone_type', l.milestone_type, 'role_at_award', l.role_at_award,
        'points', l.points, 'reason', l.reason, 'awarded_by', ab.full_name,
        'created_at', l.created_at, 'transaction_id', l.id, 'student_id', l.student_id,
        'hackathon_id', l.hackathon_id, 'team_id', l.team_id, 'round_id', l.round_id,
        'reversal_of_id', l.reversal_of_id)
    FROM public.points_ledger l
    LEFT JOIN public.profiles s ON s.id = l.student_id
    LEFT JOIN public.hackathons h ON h.id = l.hackathon_id
    LEFT JOIN public.teams t ON t.id = l.team_id
    LEFT JOIN public.hackathon_rounds rd ON rd.id = l.round_id
    LEFT JOIN public.admin_profiles ab ON ab.id = l.awarded_by
    WHERE (p_after IS NULL OR l.id > p_after)
      AND (p_hackathon_id IS NULL OR l.hackathon_id = p_hackathon_id)
    ORDER BY l.id LIMIT v_limit;

  ELSIF p_dataset = 'hackathon_summary' THEN
    RETURN QUERY
    SELECT h.id,
      jsonb_build_object(
        'hackathon_title', h.title, 'status', h.status, 'organizer', h.organizer,
        'event_start_at', h.event_start_at, 'event_end_at', h.event_end_at,
        'total_teams', (SELECT count(*) FROM public.teams t WHERE t.hackathon_id = h.id),
        'verified_registrations', (SELECT count(*) FROM public.teams t
                                   WHERE t.hackathon_id = h.id AND t.external_status = 'verified'),
        'total_participants', (SELECT count(*) FROM public.team_members tm WHERE tm.hackathon_id = h.id),
        'total_submissions', (SELECT count(*) FROM public.submissions s WHERE s.hackathon_id = h.id),
        'total_reviews', (SELECT count(*) FROM public.submission_reviews sr
                          JOIN public.submissions s ON s.id = sr.submission_id
                          WHERE s.hackathon_id = h.id),
        'total_winners', (SELECT count(*) FROM public.results r
                          WHERE r.hackathon_id = h.id AND r.milestone_type = 'win_placement'),
        'net_points_awarded', COALESCE((SELECT sum(l.points) FROM public.points_ledger l
                                        WHERE l.hackathon_id = h.id), 0),
        'hackathon_id', h.id)
    FROM public.hackathons h
    WHERE (p_after IS NULL OR h.id > p_after)
      AND (p_hackathon_id IS NULL OR h.id = p_hackathon_id)
    ORDER BY h.id LIMIT v_limit;

  ELSIF p_dataset = 'submissions' THEN
    RETURN QUERY
    SELECT s.id,
      jsonb_build_object(
        'hackathon_title', h.title, 'round_number', rd.round_number, 'round_name', rd.name,
        'team_name', t.name, 'submitted_by', sb.full_name, 'submitted_by_usn', sb.usn,
        'title', s.title, 'description', s.description,
        'repo_url', s.repo_url, 'demo_url', s.demo_url,
        'review_status', s.status, 'version', s.version, 'is_current', s.is_current,
        'evidence_on_file', (s.evidence_path IS NOT NULL AND s.evidence_deleted_at IS NULL),
        'evidence_sha256', s.evidence_sha256,
        'created_at', s.created_at, 'updated_at', s.updated_at,
        'submission_id', s.id, 'hackathon_id', s.hackathon_id,
        'round_id', s.round_id, 'team_id', s.team_id)
    FROM public.submissions s
    LEFT JOIN public.hackathons h ON h.id = s.hackathon_id
    LEFT JOIN public.hackathon_rounds rd ON rd.id = s.round_id
    LEFT JOIN public.teams t ON t.id = s.team_id
    LEFT JOIN public.profiles sb ON sb.id = s.submitted_by
    WHERE (p_after IS NULL OR s.id > p_after)
      AND (p_hackathon_id IS NULL OR s.hackathon_id = p_hackathon_id)
    ORDER BY s.id LIMIT v_limit;

  ELSIF p_dataset = 'reviews' THEN
    RETURN QUERY
    SELECT sr.id,
      jsonb_build_object(
        'hackathon_title', h.title, 'round_number', rd.round_number, 'round_name', rd.name,
        'team_name', t.name, 'submission_title', s.title,
        'reviewer_name', rv.full_name, 'decision', sr.decision, 'score', sr.score,
        'feedback', sr.feedback, 'reviewed_at', sr.reviewed_at,
        'review_id', sr.id, 'submission_id', sr.submission_id,
        'hackathon_id', s.hackathon_id, 'team_id', s.team_id)
    FROM public.submission_reviews sr
    JOIN public.submissions s ON s.id = sr.submission_id
    LEFT JOIN public.hackathons h ON h.id = s.hackathon_id
    LEFT JOIN public.hackathon_rounds rd ON rd.id = s.round_id
    LEFT JOIN public.teams t ON t.id = s.team_id
    LEFT JOIN public.admin_profiles rv ON rv.id = sr.reviewer_id
    WHERE (p_after IS NULL OR sr.id > p_after)
      AND (p_hackathon_id IS NULL OR s.hackathon_id = p_hackathon_id)
    ORDER BY sr.id LIMIT v_limit;

  ELSIF p_dataset = 'audit_logs' THEN
    RETURN QUERY
    SELECT a.id,
      jsonb_build_object(
        'created_at', a.created_at, 'actor_name', ac.full_name, 'actor_role', a.actor_role,
        'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
        'details', a.details, 'log_id', a.id, 'actor_id', a.actor_id)
    FROM public.audit_logs a
    LEFT JOIN public.admin_profiles ac ON ac.id = a.actor_id
    WHERE (p_after IS NULL OR a.id > p_after)
      AND (p_hackathon_id IS NULL OR a.target_id = p_hackathon_id::text)
    ORDER BY a.id LIMIT v_limit;

  ELSIF p_dataset = 'profile_change_requests' THEN
    RETURN QUERY
    SELECT c.id,
      jsonb_build_object(
        'student_name', s.full_name, 'usn', s.usn, 'field_name', c.field_name,
        'old_value', CASE WHEN v_pii OR lower(c.field_name) NOT IN ('email', 'phone')
                          THEN c.old_value ELSE '[restricted]' END,
        'new_value', CASE WHEN v_pii OR lower(c.field_name) NOT IN ('email', 'phone')
                          THEN c.new_value ELSE '[restricted]' END,
        'reason', c.reason, 'status', c.status, 'reviewed_by', rv.full_name,
        'reviewed_at', c.reviewed_at, 'rejection_reason', c.rejection_reason,
        'created_at', c.created_at, 'request_id', c.id, 'student_id', c.student_id)
    FROM public.profile_change_requests c
    LEFT JOIN public.profiles s ON s.id = c.student_id
    LEFT JOIN public.admin_profiles rv ON rv.id = c.reviewed_by
    WHERE (p_after IS NULL OR c.id > p_after)
      AND (p_hackathon_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.student_id = c.student_id AND tm.hackathon_id = p_hackathon_id))
    ORDER BY c.id LIMIT v_limit;

  ELSIF p_dataset = 'storage_objects' THEN
    RETURN QUERY
    SELECT q.id,
      jsonb_build_object(
        'bucket_id', q.bucket_id, 'target_type', q.target_type, 'target_id', q.target_id,
        'event_id', q.event_id, 'status', q.status, 'deletion_outcome', q.deletion_outcome,
        'retention_deadline_at', q.retention_deadline_at, 'created_at', q.created_at,
        'completed_at', q.completed_at, 'job_id', q.id)
    FROM public.storage_deletion_queue q
    WHERE (p_after IS NULL OR q.id > p_after)
      AND (p_hackathon_id IS NULL OR q.event_id = p_hackathon_id)
    ORDER BY q.id LIMIT v_limit;
  END IF;
END;
$$;

-- ============================================================================
-- 6. TERMINAL AUDIT ENTRY
-- ============================================================================
-- Exactly one entry per export attempt, written AFTER generation/delivery:
--   outcome 'success' -> action 'data.exported'      (caller is re-authorized first)
--   outcome 'failed'  -> action 'data.export_failed' (category only, never payloads)
-- Only counts and identifiers are stored, never exported data.
CREATE OR REPLACE FUNCTION public.record_data_export(
  p_datasets text[],
  p_format text,
  p_hackathon_id uuid,
  p_outcome text,
  p_row_counts jsonb DEFAULT '{}'::jsonb,
  p_failure_category text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_super boolean;
  v_active boolean;
  v_ds text;
  v_key text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT is_super_admin, is_active INTO v_is_super, v_active
  FROM public.admin_profiles WHERE id = v_caller;
  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.' USING ERRCODE = '42501';
  END IF;

  IF p_outcome NOT IN ('success', 'failed') THEN
    RAISE EXCEPTION 'Invalid export outcome: %.', p_outcome USING ERRCODE = '22023';
  END IF;
  IF p_format NOT IN ('csv', 'xlsx', 'zip') THEN
    RAISE EXCEPTION 'Invalid export format: %.', p_format USING ERRCODE = '22023';
  END IF;
  IF p_datasets IS NULL OR cardinality(p_datasets) = 0 OR cardinality(p_datasets) > 20 THEN
    RAISE EXCEPTION 'Invalid dataset list.' USING ERRCODE = '22023';
  END IF;
  IF p_row_counts IS NULL OR jsonb_typeof(p_row_counts) <> 'object' THEN
    RAISE EXCEPTION 'Row counts must be a JSON object.' USING ERRCODE = '22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_row_counts) LOOP
    IF jsonb_typeof(p_row_counts -> v_key) <> 'number' THEN
      RAISE EXCEPTION 'Row counts must be numeric.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF p_failure_category IS NOT NULL AND p_failure_category !~ '^[a-z_]{1,64}$' THEN
    RAISE EXCEPTION 'Invalid failure category.' USING ERRCODE = '22023';
  END IF;

  -- A success entry can only be written for a scope/dataset set the caller could export.
  IF p_outcome = 'success' THEN
    FOREACH v_ds IN ARRAY p_datasets LOOP
      PERFORM public._export_authorize(v_ds, p_hackathon_id);
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller,
    CASE WHEN COALESCE(v_is_super, FALSE) THEN 'super_admin' ELSE 'admin' END,
    CASE WHEN p_outcome = 'success' THEN 'data.exported' ELSE 'data.export_failed' END,
    'report',
    COALESCE(p_hackathon_id::text, 'platform'),
    jsonb_build_object(
      'datasets', to_jsonb(p_datasets),
      'format', p_format,
      'hackathon_id', p_hackathon_id,
      'outcome', p_outcome,
      'row_counts', p_row_counts,
      'failure_category', p_failure_category
    )
  );
END;
$$;

-- ============================================================================
-- 7. GRANTS (least privilege)
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_export_capabilities() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_exportable_hackathons() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_export_dataset_counts(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.export_dataset_page(text, uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_data_export(text[], text, uuid, text, jsonb, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_export_capabilities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_exportable_hackathons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_export_dataset_counts(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_dataset_page(text, uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_data_export(text[], text, uuid, text, jsonb, text) TO authenticated;
