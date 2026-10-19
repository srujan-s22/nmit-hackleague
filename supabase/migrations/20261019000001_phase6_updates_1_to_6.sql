-- Migration 18: Complete Pending Updates 1 to 6
-- 1. Automatic Round Pausing & Public View Synchronization
-- 2. Two-Tier Hackathon-Specific Admin Assignment Across Operations
-- 3. Simplified Registration Proof Workflow (CDC Disclaimer & Initial Points)
-- 4. Storage Limits & WebP Support
-- 5. Announcements & Notification Center (In-App & Push)
-- 6. Scoped Data & Reports Authorization
-- Created: 2026-10-19
-- Schema: public, storage

-- ============================================================================
-- 1. UPDATE 1: AUTOMATIC ROUND PAUSING & LIFECYCLE SYNCHRONIZATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_pause_expired_rounds(p_hackathon_id UUID DEFAULT NULL)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_round RECORD;
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT := 'system';
BEGIN
  IF v_caller_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_caller_id AND is_super_admin = true) THEN
      v_caller_role := 'super_admin';
    ELSIF EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_caller_id) THEN
      v_caller_role := 'admin';
    ELSE
      v_caller_role := 'student';
    END IF;
  END IF;

  FOR v_round IN
    SELECT r.id, r.hackathon_id, r.round_number, r.name, r.status, r.end_at, h.title as hackathon_title, h.in_charge_admin_id
    FROM public.hackathon_rounds r
    JOIN public.hackathons h ON h.id = r.hackathon_id
    WHERE r.status = 'open'
      AND r.end_at <= now()
      AND (p_hackathon_id IS NULL OR r.hackathon_id = p_hackathon_id)
    FOR UPDATE OF r
  LOOP
    UPDATE public.hackathon_rounds
    SET status = 'paused',
        updated_at = now()
    WHERE id = v_round.id;

    v_count := v_count + 1;

    INSERT INTO public.audit_logs (
      actor_id,
      actor_role,
      action,
      target_type,
      target_id,
      details
    ) VALUES (
      COALESCE(v_caller_id, v_round.in_charge_admin_id, (SELECT id FROM public.admin_profiles WHERE is_super_admin = true LIMIT 1)),
      v_caller_role,
      'hackathon_round.auto_paused',
      'hackathon_round',
      v_round.id::text,
      jsonb_build_object(
        'hackathon_id', v_round.hackathon_id,
        'hackathon_title', v_round.hackathon_title,
        'round_number', v_round.round_number,
        'round_name', v_round.name,
        'previous_status', 'open',
        'new_status', 'paused',
        'end_at', v_round.end_at,
        'reason', 'Configured stage deadline reached; automatically paused'
      )
    );
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.auto_pause_expired_rounds(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_pause_expired_rounds(UUID) TO authenticated;

-- Dynamic Public View reflecting automatic pause at deadline
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
  CASE
    WHEN r.status = 'open' AND r.end_at <= now() THEN 'paused'
    ELSE r.status
  END AS status
FROM public.hackathon_rounds r
WHERE EXISTS (
  SELECT 1 FROM public.hackathons h
  WHERE h.id = r.hackathon_id
    AND h.status IN ('published', 'registration_closed', 'ongoing', 'completed', 'archived')
);

ALTER VIEW public.hackathon_rounds_public_view OWNER TO postgres;
GRANT SELECT ON public.hackathon_rounds_public_view TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.hackathon_rounds_public_view FROM authenticated, anon, PUBLIC;

-- ============================================================================
-- 2. UPDATE 2: SCOPED AUTHORIZATION FOR IN-CHARGE ADMIN ACROSS OPERATIONS
-- ============================================================================

-- A. Teams Table Scoping
DROP POLICY IF EXISTS teams_select_admin ON public.teams;
CREATE POLICY teams_select_admin ON public.teams
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.current_has_permission('export_data') OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_teams')
);

DROP POLICY IF EXISTS teams_admin_manage ON public.teams;
CREATE POLICY teams_admin_manage ON public.teams
FOR UPDATE TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_teams')
)
WITH CHECK (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_teams')
);

-- B. Team Members Scoping
DROP POLICY IF EXISTS team_members_select_admin ON public.team_members;
CREATE POLICY team_members_select_admin ON public.team_members
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.current_has_permission('export_data') OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_teams')
);

-- C. Submissions Scoping
DROP POLICY IF EXISTS submissions_select_admin ON public.submissions;
CREATE POLICY submissions_select_admin ON public.submissions
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.current_has_permission('export_data') OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_hackathons')
);

DROP POLICY IF EXISTS submissions_update_admin ON public.submissions;
CREATE POLICY submissions_update_admin ON public.submissions
FOR UPDATE TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_hackathons')
)
WITH CHECK (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_hackathons')
);

-- D. Submission Reviews Scoping
DROP POLICY IF EXISTS submission_reviews_admin_manage ON public.submission_reviews;
CREATE POLICY submission_reviews_admin_manage ON public.submission_reviews
FOR ALL TO authenticated
USING (
  public.current_is_super_admin() OR
  EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_reviews.submission_id
      AND public.can_admin_manage_hackathon(s.hackathon_id, 'manage_hackathons')
  )
)
WITH CHECK (
  public.current_is_super_admin() OR
  EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_reviews.submission_id
      AND public.can_admin_manage_hackathon(s.hackathon_id, 'manage_hackathons')
  )
);

-- E. Results Scoping
DROP POLICY IF EXISTS results_admin_manage ON public.results;
CREATE POLICY results_admin_manage ON public.results
FOR ALL TO authenticated
USING (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_hackathons')
)
WITH CHECK (
  public.current_is_super_admin() OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_hackathons')
);

-- F. Points Ledger Scoping
DROP POLICY IF EXISTS points_ledger_select_admin ON public.points_ledger;
CREATE POLICY points_ledger_select_admin ON public.points_ledger
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  public.current_has_permission('export_data') OR
  public.can_admin_manage_hackathon(hackathon_id, 'manage_points')
);

-- G. Update award_milestone_points to enforce hackathon scoping
CREATE OR REPLACE FUNCTION public.award_milestone_points(
  p_student_id UUID,
  p_hackathon_id UUID,
  p_team_id UUID,
  p_round_id UUID,
  p_milestone_type TEXT,
  p_result_id UUID,
  p_reason TEXT
)
RETURNS UUID AS $$
DECLARE
  v_role TEXT;
  v_points INT;
  v_result RECORD;
  v_idempotency_key TEXT;
  v_existing RECORD;
  v_ledger_id UUID;
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 1. Base permission check
  IF NOT (public.current_has_permission('manage_points') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: administrative permission manage_points required.';
  END IF;

  -- 2. Scoped authorization check
  IF NOT (public.current_is_super_admin() OR public.can_admin_manage_hackathon(p_hackathon_id, 'manage_points')) THEN
    RAISE EXCEPTION 'Access denied: not authorized to manage points for this hackathon.';
  END IF;

  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Mandatory audit reason required for points award.';
  END IF;

  SELECT role INTO v_role FROM public.team_members
  WHERE team_id = p_team_id AND student_id = p_student_id AND hackathon_id = p_hackathon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot award points: student is not an enrolled member of the specified team in this hackathon.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.point_configurations WHERE milestone_type = p_milestone_type AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive milestone type: %.', p_milestone_type;
  END IF;

  IF p_milestone_type = 'round_qualification' THEN
    IF p_round_id IS NULL THEN
      RAISE EXCEPTION 'Round ID is mandatory for round qualification awards.';
    END IF;
    IF p_result_id IS NULL THEN
      RAISE EXCEPTION 'Result ID is mandatory for round qualification awards.';
    END IF;

    SELECT * INTO v_result FROM public.results WHERE id = p_result_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Result record not found.'; END IF;
    IF v_result.hackathon_id <> p_hackathon_id OR v_result.team_id <> p_team_id THEN
      RAISE EXCEPTION 'Result does not belong to specified hackathon and team.';
    END IF;
    IF v_result.round_id IS DISTINCT FROM p_round_id THEN
      RAISE EXCEPTION 'Result round (%) does not match specified round (%).', v_result.round_id, p_round_id;
    END IF;
    IF v_result.is_published = false OR v_result.verified_by IS NULL THEN
      RAISE EXCEPTION 'Points cannot be awarded for unpublished or unverified round results.';
    END IF;
    IF v_result.milestone_type <> 'round_qualification' THEN
      RAISE EXCEPTION 'Result milestone type (%) does not match round_qualification.', v_result.milestone_type;
    END IF;

    v_idempotency_key := 'hackathon:' || p_hackathon_id || ':student:' || p_student_id || ':milestone:' || p_milestone_type || ':round:' || p_round_id;

  ELSIF p_milestone_type = 'win_placement' THEN
    IF p_result_id IS NULL THEN
      RAISE EXCEPTION 'Result ID is mandatory for win/placement awards.';
    END IF;

    SELECT * INTO v_result FROM public.results WHERE id = p_result_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Result record not found.'; END IF;
    IF v_result.hackathon_id <> p_hackathon_id OR v_result.team_id <> p_team_id THEN
      RAISE EXCEPTION 'Result does not belong to specified hackathon and team.';
    END IF;
    IF v_result.is_published = false OR v_result.verified_by IS NULL THEN
      RAISE EXCEPTION 'Points cannot be awarded for unpublished or unverified placement results.';
    END IF;
    IF v_result.milestone_type <> 'win_placement' THEN
      RAISE EXCEPTION 'Result milestone type (%) does not match win_placement.', v_result.milestone_type;
    END IF;
    IF v_result.placement IS NULL THEN
      RAISE EXCEPTION 'Placement rank must be recorded on result before awarding win_placement points.';
    END IF;

    v_idempotency_key := 'hackathon:' || p_hackathon_id || ':student:' || p_student_id || ':milestone:' || p_milestone_type || ':result:' || p_result_id;

  ELSIF p_milestone_type = 'participation' THEN
    IF p_result_id IS NOT NULL THEN
      SELECT * INTO v_result FROM public.results WHERE id = p_result_id FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Result record not found.'; END IF;
      IF v_result.hackathon_id <> p_hackathon_id OR v_result.team_id <> p_team_id THEN
        RAISE EXCEPTION 'Result does not belong to specified hackathon and team.';
      END IF;
      IF v_result.is_published = false OR v_result.verified_by IS NULL THEN
        RAISE EXCEPTION 'Points cannot be awarded for unpublished or unverified participation results.';
      END IF;
      IF v_result.milestone_type <> 'participation' THEN
        RAISE EXCEPTION 'Result milestone type (%) does not match participation.', v_result.milestone_type;
      END IF;
    END IF;

    v_idempotency_key := 'hackathon:' || p_hackathon_id || ':student:' || p_student_id || ':milestone:' || p_milestone_type || COALESCE(':result:' || p_result_id::text, '');

  ELSE
    RAISE EXCEPTION 'Unsupported milestone type: %.', p_milestone_type;
  END IF;

  IF v_role = 'leader' THEN
    SELECT team_leader_points INTO v_points FROM public.point_configurations WHERE milestone_type = p_milestone_type;
  ELSE
    SELECT regular_member_points INTO v_points FROM public.point_configurations WHERE milestone_type = p_milestone_type;
  END IF;

  SELECT * INTO v_existing FROM public.points_ledger WHERE idempotency_key = v_idempotency_key;
  IF FOUND THEN
    IF v_existing.student_id = p_student_id
       AND v_existing.hackathon_id = p_hackathon_id
       AND v_existing.team_id = p_team_id
       AND (v_existing.round_id IS NOT DISTINCT FROM p_round_id)
       AND (v_existing.result_id IS NOT DISTINCT FROM p_result_id)
       AND v_existing.milestone_type = p_milestone_type
       AND v_existing.points = v_points
       AND (v_existing.reason IS NOT DISTINCT FROM p_reason) THEN
      RETURN v_existing.id;
    ELSE
      RAISE EXCEPTION 'Idempotency key collision: award already exists with key % but conflicting payload parameters (points, result, or reason mismatch).', v_idempotency_key;
    END IF;
  END IF;

  BEGIN
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
      p_student_id,
      p_hackathon_id,
      p_team_id,
      p_round_id,
      p_result_id,
      p_milestone_type,
      v_role,
      v_points,
      p_reason,
      v_caller_id
    )
    RETURNING id INTO v_ledger_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.points_ledger WHERE idempotency_key = v_idempotency_key;
    IF FOUND AND v_existing.student_id = p_student_id
       AND v_existing.hackathon_id = p_hackathon_id
       AND v_existing.team_id = p_team_id
       AND (v_existing.round_id IS NOT DISTINCT FROM p_round_id)
       AND (v_existing.result_id IS NOT DISTINCT FROM p_result_id)
       AND v_existing.milestone_type = p_milestone_type
       AND v_existing.points = v_points
       AND (v_existing.reason IS NOT DISTINCT FROM p_reason) THEN
      RETURN v_existing.id;
    ELSE
      RAISE EXCEPTION 'Idempotency key collision: award already exists with key % but conflicting payload parameters (points, result, or reason mismatch).', v_idempotency_key;
    END IF;
  END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    'admin',
    'points.awarded',
    'points_ledger',
    v_ledger_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'hackathon_id', p_hackathon_id,
      'team_id', p_team_id,
      'milestone_type', p_milestone_type,
      'points', v_points,
      'role', v_role,
      'idempotency_key', v_idempotency_key
    )
  );

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.award_milestone_points(UUID, UUID, UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_milestone_points(UUID, UUID, UUID, UUID, TEXT, UUID, TEXT) TO authenticated;

-- ============================================================================
-- 3. UPDATE 3: SIMPLIFIED REGISTRATION PROOF WORKFLOW & CDC DECLARATION
-- ============================================================================

-- Add CDC declaration tracking columns to public.teams
ALTER TABLE public.teams
ADD COLUMN IF NOT EXISTS cdc_declaration_accepted BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS cdc_declaration_text_version TEXT NULL,
ADD COLUMN IF NOT EXISTS cdc_declaration_accepted_at TIMESTAMPTZ NULL;

-- RPC: submit_registration_proof
-- Called by Team Leader to submit external registration screenshot with mandatory CDC declaration.
-- Awards initial registration participation points without requiring manual admin approval.
CREATE OR REPLACE FUNCTION public.submit_registration_proof(
  p_team_id UUID,
  p_proof_path TEXT,
  p_cdc_declaration_accepted BOOLEAN,
  p_cdc_declaration_text TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_team RECORD;
  v_hackathon RECORD;
  v_member RECORD;
  v_leader_points INTEGER := 15;
  v_member_points INTEGER := 10;
  v_points_awarded INTEGER := 0;
  v_idempotency_key TEXT;
  v_team_size INTEGER;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: team ID cannot be null.';
  END IF;

  IF p_proof_path IS NULL OR trim(p_proof_path) = '' THEN
    RAISE EXCEPTION 'Invalid argument: registration proof image path is mandatory.';
  END IF;

  -- CDC Declaration Acceptance Validation
  IF p_cdc_declaration_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'Submission rejected: acceptance of the mandatory CDC declaration is required.';
  END IF;

  -- Validate mandatory CDC declaration text contents
  IF p_cdc_declaration_text IS NULL OR
     p_cdc_declaration_text NOT LIKE '%Career Development Centre (CDC)%' OR
     p_cdc_declaration_text NOT LIKE '%genuine, unaltered%' THEN
    RAISE EXCEPTION 'Submission rejected: invalid or forged CDC declaration text.';
  END IF;

  -- Fetch and lock team
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.';
  END IF;

  -- Caller must be the team leader
  IF v_team.leader_id <> v_caller_id THEN
    RAISE EXCEPTION 'Access denied: only the team leader can submit registration proof.';
  END IF;

  -- Fetch hackathon
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_team.hackathon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.';
  END IF;

  IF v_hackathon.status NOT IN ('published', 'ongoing') THEN
    RAISE EXCEPTION 'Cannot submit registration proof: hackathon is not published (status: %).', v_hackathon.status;
  END IF;

  -- Enforce deadline: cannot submit proof after registration deadline
  IF now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Cannot submit registration proof: registration deadline has passed (ended %).', v_hackathon.registration_end_at;
  END IF;

  -- Check team size
  SELECT COUNT(*) INTO v_team_size
  FROM public.team_members
  WHERE team_id = p_team_id;

  IF v_team_size < v_hackathon.min_team_size THEN
    RAISE EXCEPTION 'Team roster size (%) is below the minimum required (%) for this hackathon.',
      v_team_size, v_hackathon.min_team_size;
  END IF;

  IF NOT v_hackathon.is_solo_allowed AND v_team_size < 2 THEN
    RAISE EXCEPTION 'Solo participation is not permitted for this hackathon. Minimum team size is 2.';
  END IF;

  -- Update team registration claim status
  UPDATE public.teams
  SET external_status = 'submitted',
      external_proof_path = trim(p_proof_path),
      external_proof_submitted_at = now(),
      cdc_declaration_accepted = true,
      cdc_declaration_text_version = 'v1_cdc_mandatory',
      cdc_declaration_accepted_at = now(),
      internal_status = CASE WHEN internal_status = 'forming' THEN 'complete' ELSE internal_status END,
      updated_at = now()
  WHERE id = p_team_id;

  -- Read configured point values
  SELECT
    COALESCE(MAX(CASE WHEN milestone_type = 'participation' THEN team_leader_points END), 15),
    COALESCE(MAX(CASE WHEN milestone_type = 'participation' THEN regular_member_points END), 10)
  INTO v_leader_points, v_member_points
  FROM public.point_configurations
  WHERE is_active = true;

  -- Award initial registration points automatically to all team members
  FOR v_member IN
    SELECT student_id, role
    FROM public.team_members
    WHERE team_id = p_team_id AND hackathon_id = v_team.hackathon_id
  LOOP
    v_idempotency_key := 'participation_' || v_team.hackathon_id::text || '_' || v_member.student_id::text;

    INSERT INTO public.points_ledger (
      idempotency_key,
      student_id,
      hackathon_id,
      team_id,
      milestone_type,
      role_at_award,
      points,
      reason,
      awarded_by
    ) VALUES (
      v_idempotency_key,
      v_member.student_id,
      v_team.hackathon_id,
      p_team_id,
      'participation',
      v_member.role,
      CASE WHEN v_member.role = 'leader' THEN v_leader_points ELSE v_member_points END,
      'Initial registration proof submitted with accepted CDC declaration',
      COALESCE(v_hackathon.in_charge_admin_id, v_hackathon.created_by)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_points_awarded := v_points_awarded + 1;
  END LOOP;

  -- Audit log entry
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    'student',
    'team.registration_proof_submitted',
    'team',
    p_team_id::text,
    jsonb_build_object(
      'hackathon_id', v_team.hackathon_id,
      'team_name', v_team.name,
      'proof_path', trim(p_proof_path),
      'cdc_declaration_accepted', true,
      'members_awarded', v_points_awarded,
      'external_status', 'submitted'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_id', p_team_id,
    'hackathon_id', v_team.hackathon_id,
    'external_status', 'submitted',
    'cdc_declaration_accepted', true,
    'points_awarded', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.submit_registration_proof(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_registration_proof(UUID, TEXT, BOOLEAN, TEXT) TO authenticated;

-- RPC: review_round_advancement
-- For Round 2 and later advancement claims, review by authorized in-charge Admin is mandatory.
-- Verified results and advancement points update ONLY after commit.
CREATE OR REPLACE FUNCTION public.review_round_advancement(
  p_submission_id UUID,
  p_decision TEXT,
  p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_submission RECORD;
  v_member RECORD;
  v_result_id UUID;
  v_round RECORD;
  v_leader_points INTEGER := 25;
  v_member_points INTEGER := 20;
  v_idempotency_key TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  IF p_submission_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: submission ID cannot be null.';
  END IF;

  IF p_decision NOT IN ('accepted', 'rejected', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid review decision: % (must be accepted, rejected, or revision_requested).', p_decision;
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.';
  END IF;

  -- Scoped authorization check: must have manage_hackathons for this hackathon
  IF NOT (v_caller_is_super IS TRUE OR public.can_admin_manage_hackathon(v_submission.hackathon_id, 'manage_hackathons')) THEN
    RAISE EXCEPTION 'Access denied: not authorized to review submissions for this hackathon.';
  END IF;

  -- Check round
  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = v_submission.round_id;

  -- Update submission status
  UPDATE public.submissions
  SET status = p_decision,
      updated_at = now()
  WHERE id = p_submission_id;

  -- Insert/update review record
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
    trim(COALESCE(p_feedback, '')),
    now()
  )
  ON CONFLICT (submission_id, reviewer_id)
  DO UPDATE SET
    decision = EXCLUDED.decision,
    feedback = EXCLUDED.feedback,
    reviewed_at = now();

  -- If accepted, record verified result and award advancement points
  IF p_decision = 'accepted' THEN
    -- Check if result already recorded
    SELECT id INTO v_result_id
    FROM public.results
    WHERE hackathon_id = v_submission.hackathon_id
      AND round_id = v_submission.round_id
      AND team_id = v_submission.team_id
      AND milestone_type = 'round_qualification';

    IF v_result_id IS NULL THEN
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
        now(),
        p_feedback
      )
      RETURNING id INTO v_result_id;
    END IF;

    -- Award points
    SELECT
      COALESCE(MAX(CASE WHEN milestone_type = 'round_qualification' THEN team_leader_points END), 25),
      COALESCE(MAX(CASE WHEN milestone_type = 'round_qualification' THEN regular_member_points END), 20)
    INTO v_leader_points, v_member_points
    FROM public.point_configurations
    WHERE is_active = true;

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
        'Round ' || v_round.round_number || ' (' || v_round.name || ') qualification verified',
        v_caller_id
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
  END IF;

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
    'submission.reviewed',
    'submission',
    p_submission_id::text,
    jsonb_build_object(
      'hackathon_id', v_submission.hackathon_id,
      'round_id', v_submission.round_id,
      'team_id', v_submission.team_id,
      'decision', p_decision,
      'result_id', v_result_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'decision', p_decision,
    'result_id', v_result_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.review_round_advancement(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_round_advancement(UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 4. UPDATE 4: STORAGE LIMITS & WEBP SUPPORT
-- ============================================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'profile-photos';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'college-ids';

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/zip']
WHERE id = 'submission-evidence';

-- ============================================================================
-- 5. UPDATE 5: ANNOUNCEMENTS & IN-APP NOTIFICATION CENTRE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target_role TEXT NOT NULL DEFAULT 'all',
  created_by UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  push_dispatched_count INTEGER NOT NULL DEFAULT 0,
  push_failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_announcements_title CHECK (length(trim(title)) >= 3 AND length(trim(title)) <= 200),
  CONSTRAINT chk_announcements_body CHECK (length(trim(body)) >= 5),
  CONSTRAINT chk_announcements_role CHECK (target_role IN ('all', 'students', 'admins'))
);

CREATE TRIGGER trg_announcements_updated_at
BEFORE UPDATE ON public.announcements
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user ON public.announcement_reads (user_id);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- Announcements RLS
DROP POLICY IF EXISTS announcements_select_all ON public.announcements;
CREATE POLICY announcements_select_all ON public.announcements
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS announcements_admin_manage ON public.announcements;
CREATE POLICY announcements_admin_manage ON public.announcements
FOR ALL TO authenticated
USING (
  public.current_is_super_admin() OR
  public.current_has_permission('manage_notifications')
)
WITH CHECK (
  public.current_is_super_admin() OR
  public.current_has_permission('manage_notifications')
);

-- Announcement Reads RLS
DROP POLICY IF EXISTS announcement_reads_select_own ON public.announcement_reads;
CREATE POLICY announcement_reads_select_own ON public.announcement_reads
FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS announcement_reads_insert_own ON public.announcement_reads;
CREATE POLICY announcement_reads_insert_own ON public.announcement_reads
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- RPC: publish_announcement
CREATE OR REPLACE FUNCTION public.publish_announcement(
  p_title TEXT,
  p_body TEXT,
  p_target_role TEXT DEFAULT 'all'
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_new_id UUID;
  v_trimmed_title TEXT;
  v_trimmed_body TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF NOT (v_caller_is_super IS TRUE OR public.current_has_permission('manage_notifications')) THEN
    RAISE EXCEPTION 'Access denied: manage_notifications permission or Super Admin authority required.';
  END IF;

  v_trimmed_title := trim(COALESCE(p_title, ''));
  v_trimmed_body := trim(COALESCE(p_body, ''));

  IF length(v_trimmed_title) < 3 OR length(v_trimmed_title) > 200 THEN
    RAISE EXCEPTION 'Invalid title: must be between 3 and 200 characters.';
  END IF;

  IF length(v_trimmed_body) < 5 THEN
    RAISE EXCEPTION 'Invalid body: must be at least 5 characters.';
  END IF;

  IF p_target_role NOT IN ('all', 'students', 'admins') THEN
    RAISE EXCEPTION 'Invalid target role: % (must be all, students, or admins).', p_target_role;
  END IF;

  INSERT INTO public.announcements (
    title,
    body,
    target_role,
    created_by
  ) VALUES (
    v_trimmed_title,
    v_trimmed_body,
    p_target_role,
    v_caller_id
  )
  RETURNING id INTO v_new_id;

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
    'notification.announcement_published',
    'announcement',
    v_new_id::text,
    jsonb_build_object(
      'title', v_trimmed_title,
      'target_role', p_target_role
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'announcement_id', v_new_id,
    'title', v_trimmed_title
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.publish_announcement(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_announcement(TEXT, TEXT, TEXT) TO authenticated;

-- RPC: mark_announcement_read
CREATE OR REPLACE FUNCTION public.mark_announcement_read(p_announcement_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  INSERT INTO public.announcement_reads (announcement_id, user_id, read_at)
  VALUES (p_announcement_id, auth.uid(), now())
  ON CONFLICT (announcement_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.mark_announcement_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_announcement_read(UUID) TO authenticated;

-- ============================================================================
-- 6. UPDATE 6: DATA & REPORTS EXPORT HELPER & AUDIT LOGGING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_data_export(
  p_dataset TEXT,
  p_format TEXT,
  p_hackathon_id UUID DEFAULT NULL,
  p_filters JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  -- Must have export_data permission or Super Admin
  IF NOT (v_caller_is_super IS TRUE OR public.current_has_permission('export_data')) THEN
    RAISE EXCEPTION 'Access denied: export_data permission required.';
  END IF;

  -- If hackathon ID supplied and caller is not Super Admin, verify scoping
  IF p_hackathon_id IS NOT NULL AND v_caller_is_super IS NOT TRUE THEN
    IF NOT public.can_admin_manage_hackathon(p_hackathon_id, 'export_data') THEN
      RAISE EXCEPTION 'Access denied: not authorized to export data for this hackathon.';
    END IF;
  END IF;

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
    'data.exported',
    'report',
    COALESCE(p_hackathon_id::text, 'platform'),
    jsonb_build_object(
      'dataset', p_dataset,
      'format', p_format,
      'hackathon_id', p_hackathon_id,
      'filters', p_filters
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.audit_data_export(TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_data_export(TEXT, TEXT, UUID, JSONB) TO authenticated;
