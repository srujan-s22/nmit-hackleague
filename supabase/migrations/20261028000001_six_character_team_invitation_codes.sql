-- Migration: 20261028000001_six_character_team_invitation_codes.sql
-- Description: Standardize team invitation codes to 6 characters (Crockford Base32)
-- Context: Updates public.create_team and public.regenerate_team_invitation_code RPCs
--          to generate exactly 6 uppercase alphanumeric characters (e.g. 4F4D3E)
--          with atomic, subtransaction-backed bounded retry on invitation-code collision.
-- Backward Compatibility: Existing active 12-character codes in public.teams remain valid
--                         and usable until their natural expiration. No table columns or
--                         existing team records are modified.

-- 1. Update public.regenerate_team_invitation_code(UUID)
CREATE OR REPLACE FUNCTION public.regenerate_team_invitation_code(p_team_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_team RECORD;
  v_hackathon RECORD;
  v_code TEXT;
  v_raw_bytes BYTEA;
  v_attempts INT := 0;
  v_constraint_name TEXT;
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

  -- Bounded retry loop attempting atomic UPDATE
  LOOP
    v_attempts := v_attempts + 1;
    v_code := '';
    v_raw_bytes := extensions.gen_random_bytes(6);
    FOR i IN 0..5 LOOP
      v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(v_raw_bytes, i) % 32) + 1, 1);
    END LOOP;

    BEGIN
      UPDATE public.teams
      SET invitation_code = v_code,
          invitation_code_expires_at = now() + interval '7 days',
          updated_at = now()
      WHERE id = p_team_id;

      EXIT; -- Update succeeded, exit retry loop
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'teams_invitation_code_key' THEN
        IF v_attempts >= 5 THEN
          RAISE EXCEPTION 'Failed to generate unique invitation code after 5 attempts. Please retry.' USING ERRCODE = '54000';
        END IF;
      ELSE
        RAISE; -- Re-raise unrelated unique violation
      END IF;
    END;
  END LOOP;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id, 'student', 'team.invitation_code_regenerated', 'team', p_team_id::text,
    jsonb_build_object(
      'team_name', v_team.name,
      'hackathon_id', v_team.hackathon_id,
      'old_code_invalidated', true,
      'expires_at', (now() + interval '7 days'),
      'code_length', 6
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

-- 2. Update public.create_team(UUID, TEXT)
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
  v_constraint_name TEXT;
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

  -- Bounded retry loop attempting atomic team and leader creation
  LOOP
    v_attempts := v_attempts + 1;
    v_code := '';
    v_raw_bytes := extensions.gen_random_bytes(6);
    FOR i IN 0..5 LOOP
      v_code := v_code || substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', (get_byte(v_raw_bytes, i) % 32) + 1, 1);
    END LOOP;

    v_team_id := gen_random_uuid();

    BEGIN
      INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status)
      VALUES (v_team_id, p_hackathon_id, v_clean_name, v_student_id, v_code, 'forming');

      INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
      VALUES (v_team_id, v_student_id, p_hackathon_id, 'leader');

      EXIT; -- Both inserts succeeded, exit loop
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'teams_invitation_code_key' THEN
        IF v_attempts >= 5 THEN
          RAISE EXCEPTION 'Failed to generate unique invitation code after 5 attempts. Please retry.' USING ERRCODE = '54000';
        END IF;
      ELSIF v_constraint_name = 'uq_teams_hackathon_name_ci' OR
            EXISTS (SELECT 1 FROM public.teams WHERE hackathon_id = p_hackathon_id AND LOWER(TRIM(name)) = LOWER(v_clean_name)) THEN
        RAISE EXCEPTION 'Team name "%" is already taken in this hackathon.', v_clean_name;
      ELSE
        RAISE; -- Re-raise unrelated unique violation
      END IF;
    END;
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_student_id,
    'student',
    'team.created',
    'team',
    v_team_id::text,
    jsonb_build_object('team_name', v_clean_name, 'hackathon_id', p_hackathon_id, 'invitation_code', v_code, 'code_length', 6)
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
