-- Security hardening batch 2: transfer_team_leadership was never updated
-- during the P7/P2B hardening passes that added these guards to its siblings
-- leave_team and remove_team_member (both in
-- 20261022000001_phase9_points_ledger_and_leaderboard.sql). It used the
-- global current_has_permission('manage_teams') check instead of the
-- hackathon-scoped can_admin_manage_hackathon, and had none of the
-- roster-lock / points-ledger / registration-window / paused-stage guards.
-- This migration brings it in line with its siblings. Additive only.

CREATE OR REPLACE FUNCTION public.transfer_team_leadership(p_team_id UUID, p_new_leader_id UUID)
RETURNS VOID AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_team RECORD;
  v_hackathon RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_caller_id = v_team.leader_id
    OR public.can_admin_manage_hackathon(v_team.hackathon_id, 'manage_teams')
    OR public.current_is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only current leader or authorized admin can transfer leadership.' USING ERRCODE = '42501';
  END IF;

  IF p_new_leader_id = v_team.leader_id THEN
    RAISE EXCEPTION 'Target student is already the team leader.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND student_id = p_new_leader_id) THEN
    RAISE EXCEPTION 'Target student is not a member of this team.' USING ERRCODE = 'P0002';
  END IF;

  IF v_team.external_status <> 'not_submitted' OR v_team.internal_status <> 'forming' THEN
    RAISE EXCEPTION 'Cannot transfer leadership: registration proof has already been submitted or team roster is locked.' USING ERRCODE = '55P03';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.points_ledger
    WHERE team_id = p_team_id AND student_id IN (v_team.leader_id, p_new_leader_id)
  ) THEN
    RAISE EXCEPTION 'Cannot transfer leadership: a member already has awarded points recorded in the points ledger.' USING ERRCODE = '55P03';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = v_team.hackathon_id;
  IF v_hackathon.status NOT IN ('published', 'ongoing') OR now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Cannot transfer leadership: registration window is closed.' USING ERRCODE = '55P03';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.hackathon_id = v_team.hackathon_id AND r.round_number = 1
      AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
  ) THEN
    RAISE EXCEPTION 'Cannot transfer leadership: registration stage is currently paused.' USING ERRCODE = '55P03';
  END IF;

  UPDATE public.team_members SET role = 'member' WHERE team_id = p_team_id AND role = 'leader';
  UPDATE public.team_members SET role = 'leader' WHERE team_id = p_team_id AND student_id = p_new_leader_id;
  UPDATE public.teams SET leader_id = p_new_leader_id WHERE id = p_team_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id, 'student', 'team.leadership_transferred', 'team', p_team_id::text,
    jsonb_build_object('old_leader', v_team.leader_id, 'new_leader', p_new_leader_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Grants unchanged from the original definition (20261012000010):
REVOKE ALL ON FUNCTION public.transfer_team_leadership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_team_leadership(UUID, UUID) TO authenticated;
