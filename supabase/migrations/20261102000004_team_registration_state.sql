-- Migration: 20261102000004_team_registration_state.sql
-- External registration is compulsory. A team without a submitted registration proof is
-- 'pending' until the hackathon's registration deadline and 'not_registered' after it
-- (mirrors src/lib/teams/registration-compliance.ts). Exports gain a registration_state
-- column on the Teams and Registrations sheets so unregistered teams are easy to filter out.

CREATE OR REPLACE FUNCTION public.team_registration_state(p_external_status text, p_registration_end_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_external_status = 'submitted' THEN 'registered'
    WHEN p_registration_end_at IS NOT NULL AND now() > p_registration_end_at THEN 'not_registered'
    ELSE 'pending'
  END
$$;

REVOKE ALL ON FUNCTION public.team_registration_state(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_registration_state(text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.export_dataset_page(p_dataset text, p_hackathon_id uuid, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 1000)
 RETURNS TABLE(row_id uuid, data jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        'registration_state', public.team_registration_state(t.external_status, h.registration_end_at),
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
        'registration_state', public.team_registration_state(t.external_status, h.registration_end_at),
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
$function$;
