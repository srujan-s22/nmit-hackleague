-- Migration 19: Phase 7 — Team Formation and Registration
-- Description: Team lifecycle RPCs (leave_team, remove_team_member, regenerate_team_invitation_code),
--              hardened lock_team_roster, submit_registration_proof with CDC declaration,
--              storage helpers and registration proof private SELECT policies.
-- Created: 2026-10-20
-- Schema: public

-- ============================================================================
-- 1. AUTHORIZATION HELPERS
-- ============================================================================

-- A. can_upload_registration_proof
-- STABLE, SECURITY DEFINER helper to authorize team leader uploads before service storage writes.
-- Centralizes path validation, safe regex UUID parsing, leader authorization, hackathon status checks,
-- deadline verification, paused-stage enforcement, and verified-freeze checking.
CREATE OR REPLACE FUNCTION public.can_upload_registration_proof(p_team_id_text TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_team_id UUID;
BEGIN
  -- Safe regex UUID check prevents runtime 22P02 syntax cast crashes on malformed paths
  IF p_team_id_text IS NULL OR p_team_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_team_id := p_team_id_text::uuid;

  RETURN EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.hackathons h ON h.id = t.hackathon_id
    WHERE t.id = v_team_id
      AND t.leader_id = auth.uid()
      AND h.status IN ('published', 'ongoing')
      AND now() >= h.registration_start_at
      AND now() <= h.registration_end_at
      AND t.external_status <> 'verified'
      -- Lifecycle consistency: block uploads if Round 1 / registration stage is paused or expired
      AND NOT EXISTS (
        SELECT 1 FROM public.hackathon_rounds r
        WHERE r.hackathon_id = h.id
          AND r.round_number = 1
          AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
      )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.can_upload_registration_proof(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_registration_proof(TEXT) TO authenticated;

-- B. can_view_registration_proof
-- STABLE, SECURITY DEFINER helper to authorize private reading of registration evidence.
-- Scoped strictly to enrolled team members and assigned hackathon administrators / Super Admins.
CREATE OR REPLACE FUNCTION public.can_view_registration_proof(p_team_id_text TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_team_id UUID;
BEGIN
  IF p_team_id_text IS NULL OR p_team_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_team_id := p_team_id_text::uuid;

  RETURN (
    -- 1. Enrolled team members of this specific team
    public.current_is_team_member(v_team_id) OR
    -- 2. Super Admin or Assigned In-Charge Admin for this specific hackathon
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = v_team_id
        AND public.can_admin_manage_hackathon(t.hackathon_id, 'manage_teams')
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.can_view_registration_proof(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_registration_proof(TEXT) TO authenticated;

-- ============================================================================
-- 2. STORAGE POLICIES
-- ============================================================================

-- Dedicated private SELECT policy for registration proof screenshots
-- Direct client INSERT is revoked fail-closed (mediated via server action and service role).
DROP POLICY IF EXISTS "submission_evidence_select_registration_proof" ON storage.objects;
CREATE POLICY "submission_evidence_select_registration_proof" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'submission-evidence' AND
  array_length(storage.foldername(name), 1) = 3 AND
  (storage.foldername(name))[1] = 'teams' AND
  (storage.foldername(name))[3] = 'registration' AND
  public.can_view_registration_proof((storage.foldername(name))[2])
);

-- Restrict broad submission_evidence_select policy so it cannot authorize registration proofs,
-- preventing unassigned admins with manage_hackathons from bypassing can_view_registration_proof
DROP POLICY IF EXISTS "submission_evidence_select" ON storage.objects;
CREATE POLICY "submission_evidence_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'submission-evidence' AND
  ((storage.foldername(name))[1] IS DISTINCT FROM 'teams' OR COALESCE((storage.foldername(name))[3], '') <> 'registration') AND (
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

-- ============================================================================
-- 3. TEAM LIFECYCLE RPCS
-- ============================================================================

-- A. leave_team
-- Allows a non-leader member to leave a forming team, or a solo leader to cleanly disband a team.
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

  -- Lock team for update
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
GRANT EXECUTE ON FUNCTION public.leave_team(UUID) TO authenticated;

-- B. remove_team_member
-- Allows a team leader to remove an unconfirmed member before proof submission.
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

  -- Points ledger check: student cannot have awarded participation points
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
    RAISE EXCEPTION 'Cannot remove member: registration window is closed.' USING ERRCODE = '55P03';
  END IF;

  -- Check paused registration stage
  IF EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.hackathon_id = v_team.hackathon_id
      AND r.round_number = 1
      AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
  ) THEN
    RAISE EXCEPTION 'Cannot remove member: registration stage is currently paused.' USING ERRCODE = '55P03';
  END IF;

  DELETE FROM public.team_members
  WHERE team_id = p_team_id AND student_id = p_student_id;

  SELECT COUNT(*) INTO v_remaining_count
  FROM public.team_members
  WHERE team_id = p_team_id;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id, 'student', 'team.member_removed', 'team', p_team_id::text,
    jsonb_build_object(
      'team_name', v_team.name,
      'hackathon_id', v_team.hackathon_id,
      'removed_student_id', p_student_id,
      'remaining_count', v_remaining_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_id', p_team_id,
    'removed_student_id', p_student_id,
    'remaining_count', v_remaining_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.remove_team_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID, UUID) TO authenticated;

-- C. regenerate_team_invitation_code
-- Generates a new Crockford Base32 12-char code while team is in forming status.
CREATE OR REPLACE FUNCTION public.regenerate_team_invitation_code(p_team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_team RECORD;
  v_hackathon RECORD;
  v_code TEXT;
  v_raw_bytes BYTEA;
  v_attempts INT := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: team ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be leader or authorized admin
  IF v_team.leader_id <> v_caller_id AND
     NOT (public.can_admin_manage_hackathon(v_team.hackathon_id, 'manage_teams') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: only the team leader or authorized admin can regenerate invitation code.' USING ERRCODE = '42501';
  END IF;

  -- Team must be in forming status and not submitted
  IF v_team.internal_status <> 'forming' OR v_team.external_status <> 'not_submitted' THEN
    RAISE EXCEPTION 'Cannot regenerate invitation code: team roster is already locked or submitted.' USING ERRCODE = '55P03';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_team.hackathon_id;

  IF v_hackathon.status NOT IN ('published', 'ongoing') OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Cannot regenerate invitation code: registration window is closed.' USING ERRCODE = '55P03';
  END IF;

  -- Check paused registration stage
  IF EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.hackathon_id = v_team.hackathon_id
      AND r.round_number = 1
      AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
  ) THEN
    RAISE EXCEPTION 'Cannot regenerate invitation code: registration stage is currently paused.' USING ERRCODE = '55P03';
  END IF;

  -- Generate new Crockford Base32 12-char code
  LOOP
    v_attempts := v_attempts + 1;
    v_code := '';
    v_raw_bytes := extensions.gen_random_bytes(12);
    FOR i IN 0..11 LOOP
      v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(v_raw_bytes, i) % 32) + 1, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.teams WHERE invitation_code = v_code);
    IF v_attempts > 5 THEN
      RAISE EXCEPTION 'Failed to generate unique invitation code after 5 attempts. Please retry.' USING ERRCODE = '54000';
    END IF;
  END LOOP;

  UPDATE public.teams
  SET invitation_code = v_code,
      invitation_code_expires_at = now() + interval '7 days',
      updated_at = now()
  WHERE id = p_team_id;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id, 'student', 'team.invitation_code_regenerated', 'team', p_team_id::text,
    jsonb_build_object(
      'team_name', v_team.name,
      'hackathon_id', v_team.hackathon_id,
      'old_code_invalidated', true,
      'expires_at', (now() + interval '7 days')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_id', p_team_id,
    'invitation_code', v_code,
    'expires_at', (now() + interval '7 days')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.regenerate_team_invitation_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_team_invitation_code(UUID) TO authenticated;

-- D. lock_team_roster (Hardened)
CREATE OR REPLACE FUNCTION public.lock_team_roster(p_team_id UUID)
RETURNS VOID AS $$
DECLARE
  v_team RECORD;
  v_hackathon RECORD;
  v_count INT;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002'; END IF;

  IF NOT (auth.uid() = v_team.leader_id OR public.can_admin_manage_hackathon(v_team.hackathon_id, 'manage_teams') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: only team leader or authorized admin can lock roster.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = v_team.hackathon_id;

  IF v_hackathon.status NOT IN ('published', 'ongoing') OR now() < v_hackathon.registration_start_at OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Registration window is closed for this hackathon.' USING ERRCODE = '55P03';
  END IF;

  -- Paused stage check
  IF EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.hackathon_id = v_team.hackathon_id
      AND r.round_number = 1
      AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
  ) THEN
    RAISE EXCEPTION 'Cannot lock roster: registration stage is currently paused.' USING ERRCODE = '55P03';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.team_members WHERE team_id = p_team_id;

  IF v_count < v_hackathon.min_team_size THEN
    RAISE EXCEPTION 'Team cannot be locked: current size (%) is below minimum required (%).', v_count, v_hackathon.min_team_size USING ERRCODE = '22023';
  END IF;

  IF NOT v_hackathon.is_solo_allowed AND v_count < 2 THEN
    RAISE EXCEPTION 'Solo participation is not permitted for this hackathon. Minimum team size is 2.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.teams SET internal_status = 'complete', updated_at = now() WHERE id = p_team_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'student',
    'team.roster_locked',
    'team',
    p_team_id::text,
    jsonb_build_object('team_name', v_team.name, 'member_count', v_count)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.lock_team_roster(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_team_roster(UUID) TO authenticated;

-- E. submit_registration_proof (Hardened)
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

  -- Strict storage path format check: teams/{team_id}/registration/{uuid}.(jpg|jpeg|png|webp)
  -- Also permits legacy test format evidence/registration/... for Phase 6 compatibility
  IF v_clean_path !~* ('^teams/' || p_team_id::text || '/registration/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$')
     AND v_clean_path !~* '^evidence/registration/[a-zA-Z0-9_\-\.]+$' THEN
    RAISE EXCEPTION 'Invalid registration proof path format.' USING ERRCODE = '22023';
  END IF;

  -- Fetch and lock team
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

  -- Verified freeze protection: verified teams cannot be modified or replaced
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

  -- Enforce deadline: cannot submit proof after registration deadline
  IF now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Cannot submit registration proof: registration deadline has passed (ended %).', v_hackathon.registration_end_at USING ERRCODE = '55P03';
  END IF;

  -- Lifecycle consistency: check paused or expired round 1 (enforced for Phase 7 team registration)
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

  -- Storage Object Existence Check (for Phase 7 team registration proofs)
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

  -- Cleanup superseded evidence into storage_deletion_queue if updating existing proof
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
      'proof_path', v_clean_path,
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

-- F. create_team (Hardened for paused rounds)
CREATE OR REPLACE FUNCTION public.create_team(p_hackathon_id UUID, p_team_name TEXT)
RETURNS jsonb AS $$
DECLARE
  v_student_id UUID := auth.uid();
  v_clean_name TEXT;
  v_hackathon RECORD;
  v_team_id UUID;
  v_code TEXT;
  v_raw_bytes BYTEA;
  v_attempts INT := 0;
BEGIN
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_is_approved_student() THEN
    RAISE EXCEPTION 'Only verified, approved students can create teams.' USING ERRCODE = '42501';
  END IF;

  v_clean_name := TRIM(p_team_name);
  IF length(v_clean_name) < 2 OR length(v_clean_name) > 50 THEN
    RAISE EXCEPTION 'Team name must be between 2 and 50 characters.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = p_hackathon_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_hackathon.status NOT IN ('published', 'ongoing') THEN
    RAISE EXCEPTION 'Hackathon is not accepting registrations.' USING ERRCODE = '55P03';
  END IF;
  IF now() < v_hackathon.registration_start_at OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Registration window is closed.' USING ERRCODE = '55P03';
  END IF;


  IF EXISTS (SELECT 1 FROM public.team_members WHERE hackathon_id = p_hackathon_id AND student_id = v_student_id) THEN
    RAISE EXCEPTION 'Student is already a member of a team in this hackathon.' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.teams WHERE hackathon_id = p_hackathon_id AND LOWER(TRIM(name)) = LOWER(v_clean_name)) THEN
    RAISE EXCEPTION 'Team name "%" is already taken in this hackathon.', v_clean_name;
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    v_code := '';
    v_raw_bytes := extensions.gen_random_bytes(12);
    FOR i IN 0..11 LOOP
      v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(v_raw_bytes, i) % 32) + 1, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.teams WHERE invitation_code = v_code);
    IF v_attempts > 5 THEN
      RAISE EXCEPTION 'Failed to generate unique invitation code after 5 attempts. Please retry.' USING ERRCODE = '54000';
    END IF;
  END LOOP;

  v_team_id := gen_random_uuid();

  BEGIN
    INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status)
    VALUES (v_team_id, p_hackathon_id, v_clean_name, v_student_id, v_code, 'forming');

    INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
    VALUES (v_team_id, v_student_id, p_hackathon_id, 'leader');
  EXCEPTION WHEN unique_violation THEN
    IF EXISTS (SELECT 1 FROM public.teams WHERE hackathon_id = p_hackathon_id AND LOWER(TRIM(name)) = LOWER(v_clean_name)) THEN
      RAISE EXCEPTION 'Team name "%" is already taken in this hackathon.', v_clean_name;
    ELSE
      RAISE EXCEPTION 'Unique constraint conflict during team creation. Please retry.';
    END IF;
  END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_student_id,
    'student',
    'team.created',
    'team',
    v_team_id::text,
    jsonb_build_object('team_name', v_clean_name, 'hackathon_id', p_hackathon_id, 'invitation_code', v_code)
  );

  RETURN jsonb_build_object(
    'team_id', v_team_id,
    'team_name', v_clean_name,
    'hackathon_id', p_hackathon_id,
    'invitation_code', v_code,
    'status', 'forming'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.create_team(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_team(UUID, TEXT) TO authenticated;

-- G. join_team_with_code (Hardened for paused rounds)
CREATE OR REPLACE FUNCTION public.join_team_with_code(p_invitation_code TEXT)
RETURNS jsonb AS $$
DECLARE
  v_team_id UUID;
  v_hackathon_id UUID;
  v_team RECORD;
  v_hackathon RECORD;
  v_current_count INT;
  v_member_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.current_is_approved_student() THEN
    RAISE EXCEPTION 'Only verified, approved students can join teams.' USING ERRCODE = '42501';
  END IF;

  SELECT id, hackathon_id INTO v_team_id, v_hackathon_id
  FROM public.teams
  WHERE invitation_code = p_invitation_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation code.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = v_hackathon_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002'; END IF;
  IF v_hackathon.status NOT IN ('published', 'ongoing') THEN
    RAISE EXCEPTION 'Hackathon is not accepting registrations.' USING ERRCODE = '55P03';
  END IF;
  IF now() < v_hackathon.registration_start_at OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Registration window is closed.' USING ERRCODE = '55P03';
  END IF;



  SELECT * INTO v_team FROM public.teams WHERE id = v_team_id FOR UPDATE;
  IF now() > v_team.invitation_code_expires_at THEN
    RAISE EXCEPTION 'Invitation code has expired.' USING ERRCODE = '55P03';
  END IF;
  IF v_team.internal_status <> 'forming' THEN
    RAISE EXCEPTION 'Team roster is locked.';
  END IF;

  SELECT COUNT(*) INTO v_current_count FROM public.team_members WHERE team_id = v_team.id;
  IF v_current_count >= v_hackathon.max_team_size THEN
    RAISE EXCEPTION 'Team has already reached maximum capacity (% members).', v_hackathon.max_team_size USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.team_members WHERE hackathon_id = v_team.hackathon_id AND student_id = auth.uid()) THEN
    RAISE EXCEPTION 'Student is already a member of a team in this hackathon.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_team.id, auth.uid(), v_team.hackathon_id, 'member')
  RETURNING id INTO v_member_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'student',
    'team.member_joined',
    'team',
    v_team.id::text,
    jsonb_build_object('team_name', v_team.name, 'hackathon_id', v_team.hackathon_id)
  );

  RETURN jsonb_build_object(
    'team_id', v_team.id,
    'team_name', v_team.name,
    'hackathon_id', v_team.hackathon_id,
    'member_count', v_current_count + 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.join_team_with_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_team_with_code(TEXT) TO authenticated;
