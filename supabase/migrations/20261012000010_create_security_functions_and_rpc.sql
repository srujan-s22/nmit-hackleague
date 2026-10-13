-- Migration 10: Security Helper Functions, Disaster Recovery Procedure, Application RPCs, and Storage Worker Functions
-- Created: 2026-10-12
-- Schema: public

-- ============================================================================
-- 1. PARAMETERLESS SECURITY DEFINER RLS HELPERS (4)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = auth.uid()
      AND is_super_admin = true
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.current_is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_is_super_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_has_permission(p_permission_key TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.admin_profiles ap
    JOIN public.admin_permissions p ON p.admin_id = ap.id
    WHERE ap.id = auth.uid()
      AND ap.is_active = true
      AND p.permission = p_permission_key
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.current_has_permission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_has_permission(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_is_approved_student()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND registration_status = 'approved'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.current_is_approved_student() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_is_approved_student() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_is_team_member(p_team_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id
      AND student_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.current_is_team_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_is_team_member(UUID) TO authenticated;

-- ============================================================================
-- 2. DISASTER RECOVERY STORED PROCEDURE (1)
-- ============================================================================

CREATE OR REPLACE PROCEDURE public.recover_super_admin_identity(
  p_replacement_auth_uid UUID,
  p_replacement_email TEXT,
  p_replacement_full_name TEXT,
  p_reason TEXT
)
AS $$
DECLARE
  v_old_admin_id UUID;
BEGIN
  -- 1. Strictly verify database administrator or service_role authority.
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: Super Admin disaster recovery requires out-of-band database administrator or service_role authority.';
  END IF;

  IF TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Mandatory audit reason required for disaster recovery.';
  END IF;

  -- 2. Verify replacement auth user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_replacement_auth_uid) THEN
    RAISE EXCEPTION 'Replacement user ID % does not exist in auth.users.', p_replacement_auth_uid;
  END IF;

  -- 3. Lock all admin rows FOR UPDATE to serialize concurrent operations
  PERFORM 1 FROM public.admin_profiles FOR UPDATE;

  -- 4. Locate current Super Admin
  SELECT id INTO v_old_admin_id
  FROM public.admin_profiles
  WHERE is_super_admin = true
  LIMIT 1;

  -- 5. Demote old Super Admin (preserves old admin PK id and historical foreign keys)
  IF v_old_admin_id IS NOT NULL THEN
    UPDATE public.admin_profiles
    SET is_super_admin = false,
        is_active = false,
        updated_at = now()
    WHERE id = v_old_admin_id;
  END IF;

  -- 6. Upsert replacement identity as active Super Admin
  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
  VALUES (p_replacement_auth_uid, p_replacement_email, p_replacement_full_name, true, true)
  ON CONFLICT (id) DO UPDATE
  SET is_super_admin = true,
      is_active = true,
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      updated_at = now();

  -- 7. Log immutable audit trail with actor details
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    p_replacement_auth_uid,
    'system_recovery',
    'super_admin.disaster_recovery',
    'admin_profile',
    p_replacement_auth_uid::text,
    jsonb_build_object(
      'previous_super_admin_id', v_old_admin_id,
      'new_super_admin_id', p_replacement_auth_uid,
      'reason', p_reason
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON PROCEDURE public.recover_super_admin_identity(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON PROCEDURE public.recover_super_admin_identity(UUID, TEXT, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 3. APPLICATION BUSINESS RPC FUNCTIONS (7)
-- ============================================================================

-- A. create_team
CREATE OR REPLACE FUNCTION public.create_team(p_hackathon_id UUID, p_team_name TEXT)
RETURNS jsonb AS $$
DECLARE
  v_student_id UUID;
  v_hackathon RECORD;
  v_team_id UUID;
  v_code TEXT;
  v_raw_bytes BYTEA;
  i INT;
  v_attempts INT := 0;
  v_clean_name TEXT;
BEGIN
  v_student_id := auth.uid();
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF NOT public.current_is_approved_student() THEN
    RAISE EXCEPTION 'Only verified, approved students can create teams.';
  END IF;

  v_clean_name := TRIM(p_team_name);
  IF length(v_clean_name) < 2 OR length(v_clean_name) > 50 THEN
    RAISE EXCEPTION 'Team name must be between 2 and 50 characters.';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = p_hackathon_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hackathon not found.'; END IF;
  IF v_hackathon.status <> 'published' THEN RAISE EXCEPTION 'Hackathon is not accepting registrations.'; END IF;
  IF now() < v_hackathon.registration_start_at OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Registration window is closed.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.team_members WHERE hackathon_id = p_hackathon_id AND student_id = v_student_id) THEN
    RAISE EXCEPTION 'Student is already a member of a team in this hackathon.';
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
      RAISE EXCEPTION 'Failed to generate unique invitation code after 5 attempts. Please retry.';
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

REVOKE ALL ON FUNCTION public.create_team(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_team(UUID, TEXT) TO authenticated;

-- B. join_team_with_code
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
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF NOT public.current_is_approved_student() THEN
    RAISE EXCEPTION 'Only verified, approved students can join teams.';
  END IF;

  SELECT id, hackathon_id INTO v_team_id, v_hackathon_id
  FROM public.teams
  WHERE invitation_code = p_invitation_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invitation code.';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = v_hackathon_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Hackathon not found.'; END IF;
  IF v_hackathon.status <> 'published' THEN RAISE EXCEPTION 'Hackathon is not accepting registrations.'; END IF;
  IF now() < v_hackathon.registration_start_at OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Registration window is closed.';
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = v_team_id FOR UPDATE;
  IF now() > v_team.invitation_code_expires_at THEN
    RAISE EXCEPTION 'Invitation code has expired.';
  END IF;
  IF v_team.internal_status <> 'forming' THEN RAISE EXCEPTION 'Team roster is locked.'; END IF;

  SELECT COUNT(*) INTO v_current_count FROM public.team_members WHERE team_id = v_team.id;
  IF v_current_count >= v_hackathon.max_team_size THEN
    RAISE EXCEPTION 'Team has already reached maximum capacity (% members).', v_hackathon.max_team_size;
  END IF;

  IF EXISTS (SELECT 1 FROM public.team_members WHERE hackathon_id = v_team.hackathon_id AND student_id = auth.uid()) THEN
    RAISE EXCEPTION 'Student is already a member of a team in this hackathon.';
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

REVOKE ALL ON FUNCTION public.join_team_with_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_team_with_code(TEXT) TO authenticated;

-- C. lock_team_roster
CREATE OR REPLACE FUNCTION public.lock_team_roster(p_team_id UUID)
RETURNS VOID AS $$
DECLARE
  v_team RECORD;
  v_hackathon RECORD;
  v_count INT;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found.'; END IF;

  IF NOT (auth.uid() = v_team.leader_id OR public.current_has_permission('manage_teams') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: only team leader or admin can lock roster.';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = v_team.hackathon_id;
  SELECT COUNT(*) INTO v_count FROM public.team_members WHERE team_id = p_team_id;

  IF v_count < v_hackathon.min_team_size THEN
    RAISE EXCEPTION 'Team cannot be locked: current size (%) is below minimum required (%).', v_count, v_hackathon.min_team_size;
  END IF;

  IF NOT v_hackathon.is_solo_allowed AND v_count < 2 THEN
    RAISE EXCEPTION 'Solo participation is not permitted for this hackathon. Minimum team size is 2.';
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

REVOKE ALL ON FUNCTION public.lock_team_roster(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_team_roster(UUID) TO authenticated;

-- D. transfer_team_leadership
CREATE OR REPLACE FUNCTION public.transfer_team_leadership(p_team_id UUID, p_new_leader_id UUID)
RETURNS VOID AS $$
DECLARE
  v_team RECORD;
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Team not found.'; END IF;

  IF NOT (auth.uid() = v_team.leader_id OR public.current_has_permission('manage_teams') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: only current leader or authorized admin can transfer leadership.';
  END IF;

  IF p_new_leader_id = v_team.leader_id THEN
    RAISE EXCEPTION 'Target student is already the team leader.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND student_id = p_new_leader_id) THEN
    RAISE EXCEPTION 'Target student is not a member of this team.';
  END IF;

  UPDATE public.team_members SET role = 'member' WHERE team_id = p_team_id AND role = 'leader';
  UPDATE public.team_members SET role = 'leader' WHERE team_id = p_team_id AND student_id = p_new_leader_id;
  UPDATE public.teams SET leader_id = p_new_leader_id WHERE id = p_team_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'student',
    'team.leadership_transferred',
    'team',
    p_team_id::text,
    jsonb_build_object('old_leader', v_team.leader_id, 'new_leader', p_new_leader_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.transfer_team_leadership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_team_leadership(UUID, UUID) TO authenticated;

-- E. award_milestone_points
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
BEGIN
  IF NOT (public.current_has_permission('manage_points') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: administrative permission manage_points required.';
  END IF;

  IF TRIM(p_reason) = '' THEN
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

  ELSIF p_milestone_type = 'participation' THEN
    IF p_result_id IS NULL THEN
      RAISE EXCEPTION 'Result ID is mandatory for participation points to verify external event participation.';
    END IF;

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

  ELSE
    RAISE EXCEPTION 'Unsupported milestone type: %.', p_milestone_type;
  END IF;

  IF v_role = 'leader' THEN
    SELECT team_leader_points INTO v_points FROM public.point_configurations WHERE milestone_type = p_milestone_type;
  ELSE
    SELECT regular_member_points INTO v_points FROM public.point_configurations WHERE milestone_type = p_milestone_type;
  END IF;

  IF p_milestone_type = 'round_qualification' THEN
    v_idempotency_key := 'hackathon:' || p_hackathon_id || ':student:' || p_student_id || ':milestone:' || p_milestone_type || ':round:' || p_round_id;
  ELSIF p_milestone_type = 'win_placement' THEN
    v_idempotency_key := 'hackathon:' || p_hackathon_id || ':student:' || p_student_id || ':milestone:' || p_milestone_type || ':result:' || p_result_id;
  ELSE
    v_idempotency_key := 'hackathon:' || p_hackathon_id || ':student:' || p_student_id || ':milestone:' || p_milestone_type || ':result:' || p_result_id;
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
      idempotency_key, student_id, hackathon_id, team_id, round_id, result_id,
      milestone_type, role_at_award, points, reason, awarded_by
    )
    VALUES (
      v_idempotency_key, p_student_id, p_hackathon_id, p_team_id, p_round_id, p_result_id,
      p_milestone_type, v_role, v_points, p_reason, auth.uid()
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
      RAISE EXCEPTION 'Concurrent idempotency conflict on key %.', v_idempotency_key;
    END IF;
  END;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.award_milestone_points(UUID, UUID, UUID, UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_milestone_points(UUID, UUID, UUID, UUID, TEXT, UUID, TEXT) TO authenticated;

-- F. adjust_student_points
CREATE OR REPLACE FUNCTION public.adjust_student_points(
  p_student_id UUID,
  p_hackathon_id UUID,
  p_team_id UUID,
  p_points INT,
  p_reason TEXT
)
RETURNS UUID AS $$
DECLARE
  v_role TEXT;
  v_ledger_id UUID;
BEGIN
  IF NOT (public.current_has_permission('manage_points') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: administrative permission manage_points required.';
  END IF;
  IF p_points = 0 THEN
    RAISE EXCEPTION 'Point adjustment amount cannot be zero.';
  END IF;
  IF TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Mandatory audit reason required for manual points adjustment.';
  END IF;

  SELECT role INTO v_role FROM public.team_members
  WHERE team_id = p_team_id AND student_id = p_student_id AND hackathon_id = p_hackathon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cannot adjust points: student is not an enrolled member of the specified team.';
  END IF;

  INSERT INTO public.points_ledger (
    idempotency_key, student_id, hackathon_id, team_id, round_id, result_id,
    milestone_type, role_at_award, points, reason, awarded_by
  )
  VALUES (
    'adjustment:' || gen_random_uuid(), p_student_id, p_hackathon_id, p_team_id, NULL, NULL,
    'manual_adjustment', v_role, p_points, p_reason, auth.uid()
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.adjust_student_points(UUID, UUID, UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_student_points(UUID, UUID, UUID, INT, TEXT) TO authenticated;

-- G. reverse_points_award
CREATE OR REPLACE FUNCTION public.reverse_points_award(p_original_ledger_id UUID, p_reason TEXT)
RETURNS UUID AS $$
DECLARE
  v_orig RECORD;
  v_new_id UUID;
  v_idempotency_key TEXT;
BEGIN
  IF NOT (public.current_has_permission('manage_points') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Unauthorized: administrative permission manage_points required.';
  END IF;
  IF TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Mandatory audit reason required for points reversal.';
  END IF;

  SELECT * INTO v_orig FROM public.points_ledger WHERE id = p_original_ledger_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original points ledger entry not found.'; END IF;
  IF v_orig.points < 0 OR v_orig.milestone_type = 'reversal' THEN
    RAISE EXCEPTION 'Cannot reverse an already negative or reversal entry.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.points_ledger WHERE reversal_of_id = p_original_ledger_id) THEN
    RAISE EXCEPTION 'This points entry has already been reversed.';
  END IF;

  v_idempotency_key := 'reversal:' || p_original_ledger_id;

  INSERT INTO public.points_ledger (
    idempotency_key, student_id, hackathon_id, team_id, round_id, result_id,
    reversal_of_id, milestone_type, role_at_award, points, reason, awarded_by
  )
  VALUES (
    v_idempotency_key, v_orig.student_id, v_orig.hackathon_id, v_orig.team_id, v_orig.round_id, v_orig.result_id,
    p_original_ledger_id, 'reversal', v_orig.role_at_award, -v_orig.points, p_reason, auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.reverse_points_award(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_points_award(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 4. STORAGE DELETION QUEUE WORKER FUNCTIONS (4)
-- ============================================================================

-- A. enqueue_storage_deletion_job
CREATE OR REPLACE FUNCTION public.enqueue_storage_deletion_job(
  p_bucket_id TEXT,
  p_object_path TEXT,
  p_target_type TEXT,
  p_target_id TEXT
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO public.storage_deletion_queue (
    bucket_id, object_path, target_type, target_id, status
  )
  VALUES (
    p_bucket_id, p_object_path, p_target_type, p_target_id, 'pending'
  )
  ON CONFLICT (bucket_id, object_path) WHERE (status IN ('pending', 'processing'))
  DO UPDATE SET next_retry_at = now(), updated_at = now()
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.enqueue_storage_deletion_job(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_storage_deletion_job(TEXT, TEXT, TEXT, TEXT) TO service_role;

-- B. claim_storage_deletion_jobs
CREATE OR REPLACE FUNCTION public.claim_storage_deletion_jobs(
  p_worker_id TEXT,
  p_batch_size INT,
  p_lease_seconds INT
)
RETURNS TABLE (
  job_id UUID,
  bucket_id TEXT,
  object_path TEXT,
  target_type TEXT,
  target_id TEXT,
  lease_token UUID,
  leased_until TIMESTAMPTZ
) AS $$
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.';
  END IF;

  RETURN QUERY
  WITH candidate_jobs AS (
    SELECT q.id
    FROM public.storage_deletion_queue q
    WHERE (q.status = 'pending' AND q.next_retry_at <= now())
       OR (q.status = 'processing' AND q.leased_until < now())
    ORDER BY q.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.storage_deletion_queue q
  SET status = 'processing',
      lease_token = gen_random_uuid(),
      leased_by = p_worker_id,
      leased_until = now() + (p_lease_seconds || ' seconds')::interval,
      updated_at = now()
  FROM candidate_jobs c
  WHERE q.id = c.id
  RETURNING q.id, q.bucket_id, q.object_path, q.target_type, q.target_id, q.lease_token, q.leased_until;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.claim_storage_deletion_jobs(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_storage_deletion_jobs(TEXT, INT, INT) TO service_role;

-- C. complete_storage_deletion_job
CREATE OR REPLACE FUNCTION public.complete_storage_deletion_job(
  p_job_id UUID,
  p_lease_token UUID
)
RETURNS VOID AS $$
DECLARE
  v_job RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.';
  END IF;

  SELECT * INTO v_job FROM public.storage_deletion_queue WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job % not found.', p_job_id; END IF;

  IF v_job.status = 'completed' THEN
    RETURN;
  END IF;

  IF v_job.status <> 'processing' OR v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Lease token mismatch for job %. Worker does not own this job.', p_job_id;
  END IF;

  IF v_job.leased_until < now() THEN
    RAISE EXCEPTION 'Lease for job % has expired. Completion rejected.', p_job_id;
  END IF;

  UPDATE public.storage_deletion_queue
  SET status = 'completed',
      lease_token = NULL,
      leased_by = NULL,
      leased_until = NULL,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_job_id;

  IF v_job.target_type = 'profile_college_id' THEN
    UPDATE public.profiles
    SET college_id_path = NULL,
        college_id_deleted_at = now()
    WHERE id = v_job.target_id::uuid
      AND (college_id_path = v_job.object_path OR college_id_path IS NULL);

    INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
    VALUES (
      NULL,
      'system',
      'college_id.purged',
      'profile',
      v_job.target_id,
      jsonb_build_object('job_id', p_job_id, 'object_path', v_job.object_path, 'bucket', v_job.bucket_id)
    );
  ELSIF v_job.target_type = 'submission_evidence' THEN
    UPDATE public.submissions
    SET evidence_deleted_at = now()
    WHERE id = v_job.target_id::uuid
      AND evidence_deleted_at IS NULL;

    INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
    VALUES (
      NULL,
      'system',
      'submission_evidence.purged',
      'submission',
      v_job.target_id,
      jsonb_build_object('job_id', p_job_id, 'object_path', v_job.object_path, 'bucket', v_job.bucket_id)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.complete_storage_deletion_job(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_storage_deletion_job(UUID, UUID) TO service_role;

-- D. fail_storage_deletion_job
CREATE OR REPLACE FUNCTION public.fail_storage_deletion_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_error TEXT
)
RETURNS VOID AS $$
DECLARE
  v_job RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.';
  END IF;

  SELECT * INTO v_job FROM public.storage_deletion_queue WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job % not found.', p_job_id; END IF;

  IF v_job.status <> 'processing' OR v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Lease token mismatch for job %. Worker does not own this job.', p_job_id;
  END IF;

  IF v_job.leased_until < now() THEN
    RAISE EXCEPTION 'Lease for job % has expired. Failure report rejected.', p_job_id;
  END IF;

  IF v_job.retry_count + 1 >= v_job.max_retries THEN
    UPDATE public.storage_deletion_queue
    SET status = 'failed',
        retry_count = retry_count + 1,
        last_error = p_error,
        lease_token = NULL,
        leased_by = NULL,
        leased_until = NULL,
        updated_at = now()
    WHERE id = p_job_id;

    INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
    VALUES (
      NULL,
      'system',
      'storage_deletion.permanent_failure',
      'storage_queue',
      p_job_id::text,
      jsonb_build_object('error', p_error, 'object_path', v_job.object_path, 'retries_exhausted', v_job.max_retries)
    );
  ELSE
    UPDATE public.storage_deletion_queue
    SET status = 'pending',
        retry_count = retry_count + 1,
        last_error = p_error,
        next_retry_at = now() + (power(2, retry_count + 1) * interval '30 seconds'),
        lease_token = NULL,
        leased_by = NULL,
        leased_until = NULL,
        updated_at = now()
    WHERE id = p_job_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fail_storage_deletion_job(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_storage_deletion_job(UUID, UUID, TEXT) TO service_role;
