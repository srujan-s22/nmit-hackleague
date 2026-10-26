-- Migration: 20261101000001_qa_lifecycle_and_metrics_fixes.sql
-- QA pass fixes.
--
-- 1. transition_hackathon_lifecycle demanded a 10+ character reason for EVERY
--    transition, but the UI only collects one for premature archival, so
--    publishing / closing registration always failed. A reason is now required
--    only when archiving before the event has ended (the case the UI asks for).
--    Publishing now also enforces the documented prerequisite of at least one
--    configured round.

CREATE OR REPLACE FUNCTION public.transition_hackathon_lifecycle(
  p_hackathon_id UUID,
  p_target_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  IF p_target_status IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target status cannot be null.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  v_trimmed_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  IF p_target_status = 'archived'
     AND v_hackathon.event_end_at IS NOT NULL
     AND v_hackathon.event_end_at > now()
     AND LENGTH(COALESCE(v_trimmed_reason, '')) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required to archive an event before it ends.' USING ERRCODE = '22023';
  END IF;

  IF v_hackathon.status IN ('archived', 'completed') AND p_target_status <> 'archived' THEN
    RAISE EXCEPTION 'Cannot transition hackathon: current status is % and terminal.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_hackathon.status = 'draft' AND p_target_status NOT IN ('published', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from draft to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  IF v_hackathon.status = 'published' AND p_target_status NOT IN ('registration_closed', 'ongoing', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from published to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  IF p_target_status = 'published'
     AND NOT EXISTS (SELECT 1 FROM public.hackathon_rounds WHERE hackathon_id = p_hackathon_id) THEN
    RAISE EXCEPTION 'Configure at least one round before publishing.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathons
  SET status = p_target_status,
      updated_at = clock_timestamp()
  WHERE id = p_hackathon_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.lifecycle_transitioned',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'from_status', v_hackathon.status,
      'to_status', p_target_status,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'status', p_target_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transition_hackathon_lifecycle(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_hackathon_lifecycle(UUID, TEXT, TEXT) TO authenticated;
