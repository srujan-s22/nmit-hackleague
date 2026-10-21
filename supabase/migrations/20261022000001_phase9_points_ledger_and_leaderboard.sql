-- ============================================================================
-- Migration: 20261022000001_phase9_points_ledger_and_leaderboard.sql
-- Description: Phase 9.1: Core Database Correctness & Schema Security
--   1. Winner-bonus multi-layered protection (trigger, constraint, config lock, RPC guard).
--   2. Schema additions: adjusted_entry_id, academic_year, academic_term, and justified indexes.
--   3. Lock hierarchy DAG enforcement across submit_registration_proof, review_round_submission,
--      reverse_points_ledger_entry, award_milestone_points, and leave_team pre-check.
--   4. Audited manual adjustment RPC adjust_points_ledger_entry with zero floor and exact diagnostics.
--   5. Secure query RPCs get_platform_leaderboard, get_student_points_summary, and set_hackathon_academic_period.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WINNER-BONUS MULTI-LAYERED PROTECTION (AC-01, AC-02, AC-03, AC-20)
-- ----------------------------------------------------------------------------

-- 1.1 Preflight audit: check for historical win_placement rows
DO $$
DECLARE
  v_win_count INT;
  v_constraint_exists BOOLEAN;
BEGIN
  SELECT count(*) INTO v_win_count
  FROM public.points_ledger
  WHERE milestone_type = 'win_placement';

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'points_ledger'
      AND c.conname = 'chk_points_ledger_win_placement_disabled'
  ) INTO v_constraint_exists;

  IF v_win_count > 0 THEN
    IF NOT v_constraint_exists THEN
      RAISE NOTICE 'Phase 9 Preflight: Found % historical win_placement ledger row(s). Adding chk_points_ledger_win_placement_disabled constraint with NOT VALID to preserve historical records while strictly enforcing on all new rows.', v_win_count;
      ALTER TABLE public.points_ledger
        ADD CONSTRAINT chk_points_ledger_win_placement_disabled
        CHECK (milestone_type <> 'win_placement') NOT VALID;
    ELSE
      RAISE NOTICE 'Phase 9 Preflight: Found % historical win_placement ledger row(s). chk_points_ledger_win_placement_disabled constraint already exists.', v_win_count;
    END IF;
  ELSIF NOT v_constraint_exists THEN
    RAISE NOTICE 'Phase 9 Preflight: 0 historical win_placement ledger rows found. Adding chk_points_ledger_win_placement_disabled constraint.';
    ALTER TABLE public.points_ledger
      ADD CONSTRAINT chk_points_ledger_win_placement_disabled
      CHECK (milestone_type <> 'win_placement');
  ELSE
    RAISE NOTICE 'Phase 9 Preflight: chk_points_ledger_win_placement_disabled constraint already exists.';
  END IF;
END $$;

-- 1.2 Insert Trigger blocking new win_placement ledger rows across direct SQL and RPCs
CREATE OR REPLACE FUNCTION public.prevent_winner_bonus_point_awards()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.milestone_type = 'win_placement' THEN
    RAISE EXCEPTION 'Winner bonus point awards are disabled.' USING ERRCODE = '55P03';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_points_ledger_block_winner_bonus ON public.points_ledger;
CREATE TRIGGER trg_points_ledger_block_winner_bonus
BEFORE INSERT ON public.points_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_winner_bonus_point_awards();

-- 1.3 Deactivate win_placement in point_configurations
UPDATE public.point_configurations
SET is_active = false,
    regular_member_points = 0,
    team_leader_points = 0,
    updated_at = now()
WHERE milestone_type = 'win_placement'
  AND (is_active = true OR regular_member_points <> 0 OR team_leader_points <> 0);

-- 1.4 Trigger preventing reactivation of win_placement in point_configurations
CREATE OR REPLACE FUNCTION public.prevent_win_placement_config_reactivation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.milestone_type = 'win_placement' AND NEW.is_active = true THEN
    RAISE EXCEPTION 'Winner bonus point configuration cannot be reactivated.' USING ERRCODE = '55P03';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_point_configs_block_win_placement ON public.point_configurations;
CREATE TRIGGER trg_point_configs_block_win_placement
BEFORE INSERT OR UPDATE ON public.point_configurations
FOR EACH ROW EXECUTE FUNCTION public.prevent_win_placement_config_reactivation();


-- ----------------------------------------------------------------------------
-- 2. SCHEMA ENHANCEMENTS & ACADEMIC PERIODS
-- ----------------------------------------------------------------------------

-- 2.1 Add adjusted_entry_id to points_ledger (without repurposing reversal_of_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'points_ledger'
      AND column_name = 'adjusted_entry_id'
  ) THEN
    ALTER TABLE public.points_ledger
      ADD COLUMN adjusted_entry_id UUID NULL REFERENCES public.points_ledger(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 2.2 Add academic_year and academic_term metadata to hackathons
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hackathons'
      AND column_name = 'academic_year'
  ) THEN
    ALTER TABLE public.hackathons
      ADD COLUMN academic_year TEXT NOT NULL DEFAULT 'unassigned';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hackathons'
      AND column_name = 'academic_term'
  ) THEN
    ALTER TABLE public.hackathons
      ADD COLUMN academic_term TEXT NOT NULL DEFAULT 'unassigned';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_hackathons_academic_term'
  ) THEN
    ALTER TABLE public.hackathons
      ADD CONSTRAINT chk_hackathons_academic_term
      CHECK (academic_term IN ('odd_sem', 'even_sem', 'summer_term', 'unassigned'));
  END IF;
END $$;

-- 2.3 Justified Performance Indexes
CREATE INDEX IF NOT EXISTS idx_points_ledger_student_points
  ON public.points_ledger (student_id, points);

CREATE INDEX IF NOT EXISTS idx_points_ledger_hackathon_student
  ON public.points_ledger (hackathon_id, student_id);

CREATE INDEX IF NOT EXISTS idx_points_ledger_adjusted_entry
  ON public.points_ledger (adjusted_entry_id)
  WHERE adjusted_entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hackathons_academic_period
  ON public.hackathons (academic_year, academic_term);


-- ----------------------------------------------------------------------------
-- 3. PATCH EXISTING RPCS FOR LOCK HIERARCHY AND REVERSAL POLICY
-- ----------------------------------------------------------------------------

-- 3.1 award_milestone_points: Level 2 Profile Lock & Win-Placement Block
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

  -- Block win_placement awards at database boundary
  IF p_milestone_type = 'win_placement' THEN
    RAISE EXCEPTION 'Winner bonus point awards are disabled.' USING ERRCODE = '55P03';
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

  -- Level 2 Lock: deterministic student profile lock
  PERFORM 1 FROM public.profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found.' USING ERRCODE = 'P0002';
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
    CASE WHEN public.current_is_super_admin() THEN 'super_admin' ELSE 'admin' END,
    'points.awarded',
    'points_ledger',
    v_ledger_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'hackathon_id', p_hackathon_id,
      'team_id', p_team_id,
      'round_id', p_round_id,
      'result_id', p_result_id,
      'milestone_type', p_milestone_type,
      'role_at_award', v_role,
      'points', v_points,
      'reason', p_reason
    )
  );

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.award_milestone_points(UUID, UUID, UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_milestone_points(UUID, UUID, UUID, UUID, TEXT, UUID, TEXT) TO authenticated, service_role;


-- 3.2 submit_registration_proof: Level 2 Deterministic Profile Locking
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
  v_clean_path TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: team ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_clean_path := trim(p_proof_path);
  IF v_clean_path IS NULL OR v_clean_path = '' THEN
    RAISE EXCEPTION 'Invalid argument: registration proof image path is mandatory.' USING ERRCODE = '22023';
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

  -- Storage path format check
  IF v_clean_path !~* ('^teams/' || p_team_id::text || '/registration/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$')
     AND v_clean_path !~* '^evidence/registration/[a-zA-Z0-9_\-\.]+$' THEN
    RAISE EXCEPTION 'Invalid registration proof path format.' USING ERRCODE = '22023';
  END IF;

  -- Level 1 Lock: Fetch and lock team
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be the team leader
  IF v_team.leader_id <> v_caller_id THEN
    RAISE EXCEPTION 'Access denied: only the team leader can submit registration proof.' USING ERRCODE = '42501';
  END IF;

  -- Verified freeze protection
  IF v_team.external_status = 'verified' THEN
    RAISE EXCEPTION 'Cannot modify registration proof: team has already been verified by an administrator.' USING ERRCODE = '55P03';
  END IF;

  -- Fetch hackathon
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_team.hackathon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_hackathon.status NOT IN ('published', 'ongoing') THEN
    RAISE EXCEPTION 'Cannot submit registration proof: hackathon is not published (status: %).', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  -- Enforce deadline
  IF now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Cannot submit registration proof: registration deadline has passed (ended %).', v_hackathon.registration_end_at USING ERRCODE = '55P03';
  END IF;

  -- Lifecycle consistency: check paused or expired round 1
  IF v_clean_path ~* '^teams/' THEN
    IF EXISTS (
      SELECT 1 FROM public.hackathon_rounds r
      WHERE r.hackathon_id = v_team.hackathon_id
        AND r.round_number = 1
        AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
    ) THEN
      RAISE EXCEPTION 'Cannot submit registration proof: registration stage is currently paused.' USING ERRCODE = '55P03';
    END IF;
  END IF;

  -- Storage Object Existence Check
  IF v_clean_path ~* '^teams/' THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'submission-evidence'
        AND name = v_clean_path
    ) THEN
      RAISE EXCEPTION 'Invalid proof path: object does not exist in storage.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Check team size
  SELECT COUNT(*) INTO v_team_size
  FROM public.team_members
  WHERE team_id = p_team_id;

  IF v_team_size < v_hackathon.min_team_size THEN
    RAISE EXCEPTION 'Team roster size (%) is below the minimum required (%) for this hackathon.',
      v_team_size, v_hackathon.min_team_size USING ERRCODE = '22023';
  END IF;

  IF NOT v_hackathon.is_solo_allowed AND v_team_size < 2 THEN
    RAISE EXCEPTION 'Solo participation is not permitted for this hackathon. Minimum team size is 2.' USING ERRCODE = '22023';
  END IF;

  -- Cleanup superseded evidence into storage_deletion_queue
  IF v_team.external_proof_path IS NOT NULL AND v_team.external_proof_path <> v_clean_path THEN
    INSERT INTO public.storage_deletion_queue (
      event_id,
      bucket_id,
      object_path,
      target_type,
      target_id,
      status,
      retention_deadline_at
    ) VALUES (
      v_team.hackathon_id,
      'submission-evidence',
      v_team.external_proof_path,
      'superseded_registration_proof',
      v_team.id::text,
      'pending',
      now() + interval '1 day'
    )
    ON CONFLICT (bucket_id, object_path)
    WHERE (status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required'))
    DO NOTHING;
  END IF;

  -- Update team registration claim status
  UPDATE public.teams
  SET external_status = 'submitted',
      external_proof_path = v_clean_path,
      external_proof_submitted_at = now(),
      cdc_declaration_accepted = true,
      cdc_declaration_text_version = 'v1_cdc_mandatory',
      cdc_declaration_accepted_at = now(),
      internal_status = CASE WHEN internal_status = 'forming' THEN 'complete' ELSE internal_status END,
      updated_at = now()
  WHERE id = p_team_id;

  -- Level 2 Lock: deterministic student profile locks for entire roster
  PERFORM 1 FROM public.profiles
  WHERE id IN (
    SELECT student_id FROM public.team_members
    WHERE team_id = p_team_id AND hackathon_id = v_team.hackathon_id
  )
  ORDER BY id ASC
  FOR UPDATE;

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
      'proof_path', v_clean_path,
      'cdc_declaration_accepted', true,
      'cdc_declaration_version', 'v1_cdc_mandatory',
      'points_awarded_count', v_points_awarded
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_id', p_team_id,
    'external_status', 'submitted',
    'points_awarded_count', v_points_awarded
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.submit_registration_proof(UUID, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_registration_proof(UUID, TEXT, BOOLEAN, TEXT) TO authenticated, service_role;


-- 3.3 review_round_submission: Level 1 Team Lock & Level 2 Deterministic Profile Locking
CREATE OR REPLACE FUNCTION public.review_round_submission(
  p_submission_id UUID,
  p_decision TEXT,
  p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_submission RECORD;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_feedback TEXT;
  v_stored_feedback TEXT;
  v_review_id UUID;
  v_result_id UUID;
  v_leader_points INT;
  v_member_points INT;
  v_member RECORD;
  v_idempotency_key TEXT;
BEGIN
  v_caller_id := auth.uid();
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

  -- Admin Scope Verification
  IF NOT public.current_is_super_admin() AND NOT public.can_admin_manage_hackathon(v_submission.hackathon_id, 'manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to review submissions for this hackathon.' USING ERRCODE = '42501';
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
  ON CONFLICT (submission_id, reviewer_id) DO UPDATE SET
    decision = EXCLUDED.decision,
    feedback = EXCLUDED.feedback,
    reviewed_at = EXCLUDED.reviewed_at
  RETURNING id INTO v_review_id;

  -- If accepted, publish round_qualification result & award points
  IF p_decision = 'accepted' THEN
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
        clock_timestamp(),
        v_stored_feedback
      )
      RETURNING id INTO v_result_id;
    END IF;

    -- Level 2 Lock: deterministic student profile locks for team roster
    PERFORM 1 FROM public.profiles
    WHERE id IN (
      SELECT student_id FROM public.team_members
      WHERE team_id = v_submission.team_id AND hackathon_id = v_submission.hackathon_id
    )
    ORDER BY id ASC
    FOR UPDATE;

    -- Retrieve configured points
    SELECT
      COALESCE(MAX(CASE WHEN milestone_type = 'round_qualification' THEN team_leader_points END), 25),
      COALESCE(MAX(CASE WHEN milestone_type = 'round_qualification' THEN regular_member_points END), 20)
    INTO v_leader_points, v_member_points
    FROM public.point_configurations
    WHERE is_active = true;

    v_leader_points := COALESCE(v_leader_points, 25);
    v_member_points := COALESCE(v_member_points, 20);

    -- Award points to team members
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

  -- Audit Log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    CASE WHEN public.current_is_super_admin() THEN 'super_admin' ELSE 'admin' END,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.review_round_submission(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_round_submission(UUID, TEXT, TEXT) TO authenticated, service_role;


-- 3.4 reverse_points_ledger_entry: Option 2A Exact Reversal & Level 2 Lock Ordering
CREATE OR REPLACE FUNCTION public.reverse_points_ledger_entry(
  p_ledger_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_target_student_id UUID;
  v_target_hackathon_id UUID;
  v_orig RECORD;
  v_trimmed_reason TEXT;
  v_reversal_key TEXT;
  v_reversal_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required.' USING ERRCODE = '42501';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Reversal reason must be at least 10 non-whitespace characters.' USING ERRCODE = '22000';
  END IF;

  -- 1. Look up target entry's student_id and hackathon_id
  SELECT student_id, hackathon_id INTO v_target_student_id, v_target_hackathon_id
  FROM public.points_ledger
  WHERE id = p_ledger_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Points ledger entry not found.' USING ERRCODE = '22023';
  END IF;

  -- 2. Scoped authorization check
  IF NOT (public.current_is_super_admin() OR public.can_admin_manage_hackathon(v_target_hackathon_id, 'manage_points')) THEN
    RAISE EXCEPTION 'Access denied: manage_points permission required.' USING ERRCODE = '42501';
  END IF;

  -- 3. Acquire Level 2 profile lock first (satisfying lock hierarchy DAG)
  PERFORM 1 FROM public.profiles WHERE id = v_target_student_id FOR UPDATE;

  -- 4. Acquire Level 3 lock on target ledger entry
  SELECT * INTO v_orig
  FROM public.points_ledger
  WHERE id = p_ledger_id
  FOR UPDATE;

  IF v_orig.milestone_type = 'reversal' THEN
    RAISE EXCEPTION 'Cannot reverse a reversal entry.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.points_ledger
    WHERE reversal_of_id = p_ledger_id
  ) THEN
    RAISE EXCEPTION 'Points ledger entry has already been reversed.' USING ERRCODE = '22023';
  END IF;

  -- 5. Option 2A Exact Accounting Reversal Insert
  v_reversal_key := 'reversal_' || p_ledger_id::text;

  INSERT INTO public.points_ledger (
    idempotency_key,
    student_id,
    hackathon_id,
    team_id,
    round_id,
    result_id,
    reversal_of_id,
    milestone_type,
    role_at_award,
    points,
    reason,
    awarded_by
  ) VALUES (
    v_reversal_key,
    v_orig.student_id,
    v_orig.hackathon_id,
    v_orig.team_id,
    v_orig.round_id,
    v_orig.result_id,
    v_orig.id,
    'reversal',
    v_orig.role_at_award,
    -1 * v_orig.points,
    v_trimmed_reason,
    v_caller_id
  )
  RETURNING id INTO v_reversal_id;

  -- 6. Audit Log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    CASE WHEN public.current_is_super_admin() THEN 'super_admin' ELSE 'admin' END,
    'points.reversed',
    'points_ledger',
    v_reversal_id::text,
    jsonb_build_object(
      'original_ledger_id', p_ledger_id,
      'reversal_ledger_id', v_reversal_id,
      'reversed_points', -1 * v_orig.points,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'reversal_ledger_id', v_reversal_id,
    'reversed_points', -1 * v_orig.points
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.reverse_points_ledger_entry(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_points_ledger_entry(UUID, TEXT) TO authenticated, service_role;


-- 3.5 leave_team: Explicit points_ledger pre-check (55P03 error)
CREATE OR REPLACE FUNCTION public.leave_team(p_team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_team RECORD;
  v_hackathon RECORD;
  v_member_count INT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: team ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  -- Level 1 Lock: team for update
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Verify caller is an enrolled member
  IF NOT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND student_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Access denied: student is not a member of this team.' USING ERRCODE = '42501';
  END IF;

  -- Historical integrity: cannot leave once registration proof has been submitted or team is not forming
  IF v_team.external_status <> 'not_submitted' OR v_team.internal_status <> 'forming' THEN
    RAISE EXCEPTION 'Cannot modify roster: registration proof has already been submitted or team roster is locked.' USING ERRCODE = '55P03';
  END IF;

  -- Points ledger check: student cannot have awarded points in points ledger
  IF EXISTS (
    SELECT 1 FROM public.points_ledger
    WHERE team_id = p_team_id AND student_id = v_caller_id
  ) THEN
    RAISE EXCEPTION 'Cannot leave team: student already has awarded points recorded in the points ledger.' USING ERRCODE = '55P03';
  END IF;

  -- Check hackathon registration window
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_team.hackathon_id;

  IF v_hackathon.status NOT IN ('published', 'ongoing') OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Cannot leave team: registration window is closed.' USING ERRCODE = '55P03';
  END IF;

  -- Check paused registration stage
  IF EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.hackathon_id = v_team.hackathon_id
      AND r.round_number = 1
      AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
  ) THEN
    RAISE EXCEPTION 'Cannot leave team: registration stage is currently paused.' USING ERRCODE = '55P03';
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.team_members
  WHERE team_id = p_team_id;

  -- If caller is leader
  IF v_team.leader_id = v_caller_id THEN
    IF v_member_count > 1 THEN
      RAISE EXCEPTION 'Team leader cannot leave a multi-member team without transferring leadership first.' USING ERRCODE = '55P03';
    END IF;

    -- Solo leader disbanding: atomically delete team_members and teams using deferred circular constraints
    SET CONSTRAINTS ALL DEFERRED;

    DELETE FROM public.team_members WHERE team_id = p_team_id;
    DELETE FROM public.teams WHERE id = p_team_id;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      v_caller_id, 'student', 'team.disbanded', 'team', p_team_id::text,
      jsonb_build_object(
        'team_name', v_team.name,
        'hackathon_id', v_team.hackathon_id,
        'reason', 'solo_leader_left'
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'disbanded',
      'team_id', p_team_id
    );
  ELSE
    -- Regular non-leader member leaves
    DELETE FROM public.team_members
    WHERE team_id = p_team_id AND student_id = v_caller_id;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      v_caller_id, 'student', 'team.member_left', 'team', p_team_id::text,
      jsonb_build_object(
        'team_name', v_team.name,
        'hackathon_id', v_team.hackathon_id,
        'student_id', v_caller_id,
        'remaining_count', v_member_count - 1
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'left',
      'team_id', p_team_id,
      'remaining_count', v_member_count - 1
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.leave_team(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_team(UUID) TO authenticated, service_role;


-- 3.6 remove_team_member: Level 1 Team Lock & points_ledger pre-check (55P03 error)
CREATE OR REPLACE FUNCTION public.remove_team_member(p_team_id UUID, p_student_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_team RECORD;
  v_hackathon RECORD;
  v_target_member RECORD;
  v_remaining_count INT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_team_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'Invalid arguments: team ID and student ID are mandatory.' USING ERRCODE = '22023';
  END IF;

  -- Level 1 Lock: team for update
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be the team leader or authorized admin
  IF v_team.leader_id <> v_caller_id AND
     NOT (public.can_admin_manage_hackathon(v_team.hackathon_id, 'manage_teams') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: only the team leader or authorized admin can remove members.' USING ERRCODE = '42501';
  END IF;

  -- Cannot remove leader via remove_team_member
  IF p_student_id = v_team.leader_id THEN
    RAISE EXCEPTION 'Invalid operation: team leader cannot be removed. Transfer leadership first or use leave_team.' USING ERRCODE = '55P03';
  END IF;

  -- Target student must be a member
  SELECT * INTO v_target_member
  FROM public.team_members
  WHERE team_id = p_team_id AND student_id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target student is not a member of this team.' USING ERRCODE = 'P0002';
  END IF;

  -- Roster / Status check: cannot remove members once registration proof has been submitted
  IF v_team.external_status <> 'not_submitted' OR v_team.internal_status <> 'forming' THEN
    RAISE EXCEPTION 'Cannot modify roster: registration proof has already been submitted or team roster is locked.' USING ERRCODE = '55P03';
  END IF;

  -- Points ledger check: member cannot have awarded points in points ledger
  IF EXISTS (
    SELECT 1 FROM public.points_ledger
    WHERE team_id = p_team_id AND student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'Cannot remove member: student already has awarded points recorded in the points ledger.' USING ERRCODE = '55P03';
  END IF;

  -- Check hackathon registration window
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_team.hackathon_id;

  IF v_hackathon.status NOT IN ('published', 'ongoing') OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Cannot modify roster: registration window is closed.' USING ERRCODE = '55P03';
  END IF;

  -- Check paused registration stage
  IF EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.hackathon_id = v_team.hackathon_id
      AND r.round_number = 1
      AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
  ) THEN
    RAISE EXCEPTION 'Cannot modify roster: registration stage is currently paused.' USING ERRCODE = '55P03';
  END IF;

  -- Delete membership
  DELETE FROM public.team_members
  WHERE team_id = p_team_id AND student_id = p_student_id;

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.team_members
  WHERE team_id = p_team_id;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    CASE WHEN public.current_is_super_admin() THEN 'super_admin'
         WHEN public.can_admin_manage_hackathon(v_team.hackathon_id, 'manage_teams') THEN 'admin'
         ELSE 'student' END,
    'team.member_removed',
    'team',
    p_team_id::text,
    jsonb_build_object(
      'team_name', v_team.name,
      'hackathon_id', v_team.hackathon_id,
      'removed_student_id', p_student_id,
      'remaining_count', v_remaining_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'removed',
    'team_id', p_team_id,
    'student_id', p_student_id,
    'remaining_count', v_remaining_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.remove_team_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID, UUID) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. AUDITED MANUAL ADJUSTMENTS (AC-06, AC-07, AC-08, AC-17, AC-19)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.adjust_points_ledger_entry(
  p_student_id UUID,
  p_hackathon_id UUID,
  p_team_id UUID,
  p_points INT,
  p_reason TEXT,
  p_idempotency_key TEXT,
  p_adjusted_entry_id UUID DEFAULT NULL,
  p_override_negative_floor BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_trimmed_reason TEXT;
  v_trimmed_key TEXT;
  v_team RECORD;
  v_role TEXT;
  v_adjusted_entry RECORD;
  v_existing RECORD;
  v_current_balance INT;
  v_new_ledger_id UUID;
  v_violated_constraint TEXT;
BEGIN
  -- 1. Fast Auth Check
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization (Base + Scoped)
  IF NOT (public.current_is_super_admin() OR public.current_has_permission('manage_points')) THEN
    RAISE EXCEPTION 'Unauthorized: administrative permission manage_points required.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.current_is_super_admin() OR public.can_admin_manage_hackathon(p_hackathon_id, 'manage_points')) THEN
    RAISE EXCEPTION 'Access denied: not authorized to manage points for this hackathon.' USING ERRCODE = '42501';
  END IF;

  -- 3. Input Validation
  IF p_student_id IS NULL OR p_hackathon_id IS NULL OR p_team_id IS NULL THEN
    RAISE EXCEPTION 'Student ID, Hackathon ID, and Team ID are mandatory.' USING ERRCODE = '22023';
  END IF;

  IF p_points IS NULL OR p_points = 0 THEN
    RAISE EXCEPTION 'Point adjustment amount cannot be zero.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Adjustment reason must be at least 10 non-whitespace characters.' USING ERRCODE = '22000';
  END IF;

  v_trimmed_key := TRIM(COALESCE(p_idempotency_key, ''));
  IF v_trimmed_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.' USING ERRCODE = '22023';
  END IF;

  -- 4. Lock Order: Level 1 (teams FOR UPDATE)
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_team.hackathon_id <> p_hackathon_id THEN
    RAISE EXCEPTION 'Team does not belong to the specified hackathon.' USING ERRCODE = '22023';
  END IF;

  -- 5. Lock Order: Level 2 (profiles FOR UPDATE)
  PERFORM 1
  FROM public.profiles
  WHERE id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found.' USING ERRCODE = 'P0002';
  END IF;

  -- 6. Dual-Lock Team Membership Validation
  SELECT role INTO v_role
  FROM public.team_members
  WHERE team_id = p_team_id AND student_id = p_student_id AND hackathon_id = p_hackathon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot adjust points: student is not an enrolled member of the specified team for this hackathon.' USING ERRCODE = '22023';
  END IF;

  -- 7. Validate Optional adjusted_entry_id
  IF p_adjusted_entry_id IS NOT NULL THEN
    SELECT * INTO v_adjusted_entry
    FROM public.points_ledger
    WHERE id = p_adjusted_entry_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Referenced adjusted entry not found.' USING ERRCODE = 'P0002';
    END IF;

    IF v_adjusted_entry.student_id <> p_student_id OR v_adjusted_entry.hackathon_id <> p_hackathon_id OR v_adjusted_entry.team_id <> p_team_id THEN
      RAISE EXCEPTION 'Referenced adjusted entry does not match student, hackathon, or team.' USING ERRCODE = '22023';
    END IF;

    IF v_adjusted_entry.milestone_type = 'reversal' THEN
      RAISE EXCEPTION 'Cannot adjust a reversal points entry.' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.points_ledger WHERE reversal_of_id = p_adjusted_entry_id
    ) THEN
      RAISE EXCEPTION 'Cannot adjust a points entry that has already been reversed.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 8. Idempotency Pre-Check Under Locks
  SELECT * INTO v_existing
  FROM public.points_ledger
  WHERE idempotency_key = v_trimmed_key;

  IF FOUND THEN
    IF v_existing.student_id = p_student_id
       AND v_existing.hackathon_id = p_hackathon_id
       AND v_existing.team_id = p_team_id
       AND v_existing.points = p_points
       AND v_existing.reason = v_trimmed_reason
       AND (v_existing.adjusted_entry_id IS NOT DISTINCT FROM p_adjusted_entry_id)
       AND v_existing.milestone_type = 'manual_adjustment' THEN
      RETURN jsonb_build_object(
        'success', true,
        'ledger_id', v_existing.id,
        'points', v_existing.points,
        'idempotent_replay', true
      );
    ELSE
      RAISE EXCEPTION 'Idempotency key collision: key % already exists with conflicting parameters.', v_trimmed_key
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 9. Zero-Floor Balance Guard
  SELECT COALESCE(SUM(points), 0) INTO v_current_balance
  FROM public.points_ledger
  WHERE student_id = p_student_id;

  IF (v_current_balance + p_points < 0) THEN
    IF p_override_negative_floor IS TRUE THEN
      IF NOT public.current_is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: only super_admin can override the negative balance floor.' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Manual adjustment rejected: resulting balance (%) would be below zero.', (v_current_balance + p_points)
        USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 10. Level 3 Insert with Exact Constraint Diagnostics
  BEGIN
    INSERT INTO public.points_ledger (
      idempotency_key,
      student_id,
      hackathon_id,
      team_id,
      adjusted_entry_id,
      milestone_type,
      role_at_award,
      points,
      reason,
      awarded_by
    ) VALUES (
      v_trimmed_key,
      p_student_id,
      p_hackathon_id,
      p_team_id,
      p_adjusted_entry_id,
      'manual_adjustment',
      v_role,
      p_points,
      v_trimmed_reason,
      v_caller_id
    )
    RETURNING id INTO v_new_ledger_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_violated_constraint = CONSTRAINT_NAME;
    IF v_violated_constraint = 'points_ledger_idempotency_key_key' THEN
      SELECT * INTO v_existing
      FROM public.points_ledger
      WHERE idempotency_key = v_trimmed_key;

      IF FOUND AND v_existing.student_id = p_student_id
         AND v_existing.hackathon_id = p_hackathon_id
         AND v_existing.team_id = p_team_id
         AND v_existing.points = p_points
         AND v_existing.reason = v_trimmed_reason
         AND (v_existing.adjusted_entry_id IS NOT DISTINCT FROM p_adjusted_entry_id)
         AND v_existing.milestone_type = 'manual_adjustment' THEN
        RETURN jsonb_build_object(
          'success', true,
          'ledger_id', v_existing.id,
          'points', v_existing.points,
          'idempotent_replay', true
        );
      ELSE
        RAISE EXCEPTION 'Idempotency key collision: key % already exists with conflicting parameters.', v_trimmed_key
          USING ERRCODE = '23505';
      END IF;
    ELSE
      RAISE; -- Re-raise unrelated unique violations
    END IF;
  END;

  -- 11. Audit Log Record
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    CASE WHEN public.current_is_super_admin() THEN 'super_admin' ELSE 'admin' END,
    'points.adjusted',
    'points_ledger',
    v_new_ledger_id::text,
    jsonb_build_object(
      'student_id', p_student_id,
      'hackathon_id', p_hackathon_id,
      'team_id', p_team_id,
      'points', p_points,
      'reason', v_trimmed_reason,
      'adjusted_entry_id', p_adjusted_entry_id,
      'override_negative_floor', p_override_negative_floor,
      'idempotency_key', v_trimmed_key
    )
  );

  -- 12. Return Result
  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', v_new_ledger_id,
    'points', p_points,
    'idempotent_replay', false
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.adjust_points_ledger_entry(UUID, UUID, UUID, INT, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_points_ledger_entry(UUID, UUID, UUID, INT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 5. SECURE LEADERBOARD & STUDENT SUMMARY RPCS
-- ----------------------------------------------------------------------------

-- 5.1 get_platform_leaderboard (Sanitized, Dense-Ranked, Cartesian-Safe)
CREATE OR REPLACE FUNCTION public.get_platform_leaderboard(
  p_academic_year INT DEFAULT NULL,
  p_event_academic_year TEXT DEFAULT NULL,
  p_event_term TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  student_id UUID,
  full_name TEXT,
  branch TEXT,
  academic_year INT,
  total_points BIGINT,
  verified_qualifications_count BIGINT,
  rank BIGINT
) AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_effective_limit INT;
  v_effective_offset INT;
BEGIN
  -- 1. Authentication Check
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 2. Role Eligibility Check (Approved Students and Active Admins only)
  IF NOT (
    public.current_is_super_admin()
    OR EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_caller_id AND is_active = true)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND registration_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'Access denied: caller is not eligible to view the leaderboard.' USING ERRCODE = '42501';
  END IF;

  -- 3. Parameter Validation
  IF p_academic_year IS NOT NULL AND (p_academic_year < 1 OR p_academic_year > 4) THEN
    RAISE EXCEPTION 'Invalid academic year. Must be between 1 and 4.' USING ERRCODE = '22023';
  END IF;

  IF p_event_term IS NOT NULL AND p_event_term NOT IN ('odd_sem', 'even_sem', 'summer_term') THEN
    RAISE EXCEPTION 'Invalid academic term. Must be odd_sem, even_sem, or summer_term.' USING ERRCODE = '22023';
  END IF;

  v_effective_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_effective_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- 4. Cartesian-Safe Independent Pre-Aggregations
  RETURN QUERY
  WITH student_points AS (
    -- 1. Aggregate ledger totals independently by student
    SELECT
      pl.student_id,
      COALESCE(SUM(pl.points), 0)::BIGINT AS total_points
    FROM public.points_ledger pl
    JOIN public.hackathons h ON h.id = pl.hackathon_id
    WHERE (p_event_academic_year IS NULL OR h.academic_year = p_event_academic_year)
      AND (p_event_term IS NULL OR h.academic_term = p_event_term)
    GROUP BY pl.student_id
  ),
  student_qualifications AS (
    -- 2. Aggregate verified qualifications from unreversed student ledger entries linking to verified results
    SELECT
      pl.student_id,
      COUNT(DISTINCT pl.round_id)::BIGINT AS verified_qualifications_count
    FROM public.points_ledger pl
    JOIN public.results r ON r.id = pl.result_id AND r.hackathon_id = pl.hackathon_id
    JOIN public.hackathons h ON h.id = pl.hackathon_id
    WHERE pl.milestone_type = 'round_qualification'
      AND r.milestone_type = 'round_qualification'
      AND r.is_published = true
      AND r.verified_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.points_ledger rev 
        WHERE rev.reversal_of_id = pl.id
      )
      AND (p_event_academic_year IS NULL OR h.academic_year = p_event_academic_year)
      AND (p_event_term IS NULL OR h.academic_term = p_event_term)
    GROUP BY pl.student_id
  ),
  student_aggregates AS (
    -- 3. Join pre-aggregated results to approved student profiles (1:1 join)
    SELECT
      p.id AS student_id,
      p.full_name,
      p.branch,
      p.academic_year,
      COALESCE(sp.total_points, 0)::BIGINT AS total_points,
      COALESCE(sq.verified_qualifications_count, 0)::BIGINT AS verified_qualifications_count
    FROM public.profiles p
    LEFT JOIN student_points sp ON sp.student_id = p.id
    LEFT JOIN student_qualifications sq ON sq.student_id = p.id
    WHERE p.registration_status = 'approved'
      AND (p_academic_year IS NULL OR p.academic_year = p_academic_year)
  ),
  ranked_population AS (
    -- 4. Calculate dense ranks across the complete matching population
    SELECT
      sa.student_id,
      sa.full_name,
      sa.branch,
      sa.academic_year,
      sa.total_points,
      sa.verified_qualifications_count,
      DENSE_RANK() OVER (ORDER BY sa.total_points DESC)::BIGINT AS rank
    FROM student_aggregates sa
  )
  -- 5. Deterministic display ordering for stable pagination
  SELECT
    rp.student_id,
    rp.full_name,
    rp.branch,
    rp.academic_year,
    rp.total_points,
    rp.verified_qualifications_count,
    rp.rank
  FROM ranked_population rp
  ORDER BY rp.total_points DESC, rp.full_name ASC, rp.student_id ASC
  LIMIT v_effective_limit OFFSET v_effective_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_platform_leaderboard(INT, TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_leaderboard(INT, TEXT, TEXT, INT, INT) TO authenticated, service_role;


-- 5.2 get_student_points_summary
CREATE OR REPLACE FUNCTION public.get_student_points_summary(
  p_student_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_student RECORD;
  v_total_points BIGINT;
  v_rank BIGINT;
  v_verified_qualifications_count BIGINT;
  v_submitted_claims_count BIGINT;
  v_ledger_history JSONB;
BEGIN
  -- 1. Authentication Check
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization Check (Self or Admin)
  IF NOT (
    v_caller_id = p_student_id
    OR public.current_is_super_admin()
    OR EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_caller_id AND is_active = true)
  ) THEN
    RAISE EXCEPTION 'Access denied: not authorized to view points summary.' USING ERRCODE = '42501';
  END IF;

  -- 3. Student Profile Check
  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found.' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Calculate Net Total Points and Dense Rank across approved population
  WITH ranked AS (
    SELECT
      p.id,
      COALESCE(SUM(pl.points), 0)::BIGINT AS total_pts,
      DENSE_RANK() OVER (ORDER BY COALESCE(SUM(pl.points), 0) DESC)::BIGINT AS rnk
    FROM public.profiles p
    LEFT JOIN public.points_ledger pl ON pl.student_id = p.id
    WHERE p.registration_status = 'approved'
    GROUP BY p.id
  )
  SELECT total_pts, rnk INTO v_total_points, v_rank
  FROM ranked
  WHERE id = p_student_id;

  -- Fallback if student is not approved
  IF v_total_points IS NULL THEN
    SELECT COALESCE(SUM(points), 0)::BIGINT INTO v_total_points
    FROM public.points_ledger
    WHERE student_id = p_student_id;
    v_rank := NULL;
  END IF;

  -- 5. Calculate Verified Qualifications Count
  SELECT COUNT(DISTINCT pl.round_id)::BIGINT INTO v_verified_qualifications_count
  FROM public.points_ledger pl
  JOIN public.results r ON r.id = pl.result_id AND r.hackathon_id = pl.hackathon_id
  WHERE pl.student_id = p_student_id
    AND pl.milestone_type = 'round_qualification'
    AND r.milestone_type = 'round_qualification'
    AND r.is_published = true
    AND r.verified_by IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.points_ledger rev WHERE rev.reversal_of_id = pl.id
    );

  -- 6. Calculate Submitted Participation Claims Count
  SELECT COUNT(*)::BIGINT INTO v_submitted_claims_count
  FROM public.points_ledger pl
  WHERE pl.student_id = p_student_id
    AND pl.milestone_type = 'participation';

  -- 7. Query Recent Ledger History
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', sub.id,
      'milestone_type', sub.milestone_type,
      'points', sub.points,
      'reason', sub.reason,
      'created_at', sub.created_at,
      'hackathon_id', sub.hackathon_id,
      'hackathon_title', sub.hackathon_title,
      'reversal_of_id', sub.reversal_of_id,
      'adjusted_entry_id', sub.adjusted_entry_id
    ) ORDER BY sub.created_at DESC
  ) INTO v_ledger_history
  FROM (
    SELECT
      pl.id,
      pl.milestone_type,
      pl.points,
      pl.reason,
      pl.created_at,
      pl.hackathon_id,
      h.title AS hackathon_title,
      pl.reversal_of_id,
      pl.adjusted_entry_id
    FROM public.points_ledger pl
    LEFT JOIN public.hackathons h ON h.id = pl.hackathon_id
    WHERE pl.student_id = p_student_id
    ORDER BY pl.created_at DESC
    LIMIT 50
  ) sub;

  -- 8. Return JSONB Summary
  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'total_points', COALESCE(v_total_points, 0),
    'rank', v_rank,
    'verified_qualifications_count', COALESCE(v_verified_qualifications_count, 0),
    'submitted_claims_count', COALESCE(v_submitted_claims_count, 0),
    'ledger_history', COALESCE(v_ledger_history, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_student_points_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_points_summary(UUID) TO authenticated, service_role;


-- 5.3 set_hackathon_academic_period
CREATE OR REPLACE FUNCTION public.set_hackathon_academic_period(
  p_hackathon_id UUID,
  p_academic_year TEXT,
  p_academic_term TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_hackathon RECORD;
  v_year TEXT;
  v_term TEXT;
BEGIN
  -- 1. Fast Auth Check
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 2. Authorization Check (Super Admin or Hackathon Manager)
  IF NOT (
    public.current_is_super_admin()
    OR public.can_admin_manage_hackathon(p_hackathon_id, 'manage_hackathons')
  ) THEN
    RAISE EXCEPTION 'Access denied: not authorized to manage this hackathon.' USING ERRCODE = '42501';
  END IF;

  -- 3. Parameter Validation
  IF p_hackathon_id IS NULL THEN
    RAISE EXCEPTION 'Hackathon ID is mandatory.' USING ERRCODE = '22023';
  END IF;

  v_term := TRIM(COALESCE(p_academic_term, ''));
  IF v_term NOT IN ('odd_sem', 'even_sem', 'summer_term', 'unassigned') THEN
    RAISE EXCEPTION 'Invalid academic term. Must be odd_sem, even_sem, summer_term, or unassigned.' USING ERRCODE = '22023';
  END IF;

  v_year := TRIM(COALESCE(p_academic_year, ''));
  IF v_year = '' THEN
    v_year := 'unassigned';
  END IF;

  -- 4. Lock Hackathon Record
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  -- 5. Update Academic Period
  UPDATE public.hackathons
  SET academic_year = v_year,
      academic_term = v_term,
      updated_at = now()
  WHERE id = p_hackathon_id;

  -- 6. Insert Immutable Audit Log
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    CASE WHEN public.current_is_super_admin() THEN 'super_admin' ELSE 'admin' END,
    'hackathon.academic_period_updated',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'previous_academic_year', v_hackathon.academic_year,
      'previous_academic_term', v_hackathon.academic_term,
      'new_academic_year', v_year,
      'new_academic_term', v_term
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'academic_year', v_year,
    'academic_term', v_term
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.set_hackathon_academic_period(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_hackathon_academic_period(UUID, TEXT, TEXT) TO authenticated, service_role;
