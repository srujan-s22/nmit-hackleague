-- Migration: 20261102000003_hackathon_edit_round_window.sql
-- update_hackathon_metadata rejected any edit (even a tagline change) when a round ran
-- before event_start_at, because it bounded rounds by the event window while
-- configure_hackathon_rounds allows rounds from registration_start_at (round 1 commonly runs
-- during registration). Both now use the same window: registration start .. event end.
-- The error no longer exposes the round's internal id.

CREATE OR REPLACE FUNCTION public.update_hackathon_metadata(p_hackathon_id uuid, p_title text, p_slug text, p_description text, p_organizer text, p_mode text, p_venue text, p_registration_start_at timestamp with time zone, p_event_start_at timestamp with time zone, p_event_end_at timestamp with time zone, p_min_team_size integer, p_max_team_size integer, p_is_solo_allowed boolean, p_eligibility text, p_tagline text, p_prizes_summary text, p_prizes_detail jsonb, p_external_registration_url text, p_community_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_violating_round RECORD;
  v_retention_jobs_updated INT := 0;
  v_trimmed_external_url TEXT;
  v_trimmed_community_url TEXT;
  v_url_regex CONSTANT TEXT := '^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&''()*+,;%=]*)?$';
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot edit metadata of a % hackathon.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF p_registration_start_at >= v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Registration start time must precede existing registration deadline (%).', v_hackathon.registration_end_at USING ERRCODE = '22000';
  END IF;

  IF v_hackathon.registration_end_at > p_event_end_at THEN
    RAISE EXCEPTION 'Event end time cannot precede existing registration deadline (%).', v_hackathon.registration_end_at USING ERRCODE = '22000';
  END IF;

  IF p_event_start_at > p_event_end_at THEN
    RAISE EXCEPTION 'Event start time cannot exceed event end time.' USING ERRCODE = '22000';
  END IF;

  IF p_event_end_at <> v_hackathon.event_end_at THEN
    IF EXISTS (
      SELECT 1 FROM public.storage_deletion_queue
      WHERE event_id = p_hackathon_id
        AND status IN ('claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required')
    ) THEN
      RAISE EXCEPTION 'Cannot extend hackathon deadline while evidence deletion is in progress (Plan A guard).' USING ERRCODE = '55P03';
    END IF;
  END IF;

  SELECT id, round_number, start_at, end_at
  INTO v_violating_round
  FROM public.hackathon_rounds
  WHERE hackathon_id = p_hackathon_id
    AND (start_at < p_registration_start_at OR end_at > p_event_end_at)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Round % falls outside the new dates. Rounds must run between registration opening and the event end; adjust the rounds first.', v_violating_round.round_number USING ERRCODE = '22000';
  END IF;

  v_trimmed_external_url := NULLIF(TRIM(COALESCE(p_external_registration_url, '')), '');
  IF v_trimmed_external_url IS NOT NULL AND NOT (v_trimmed_external_url ~* v_url_regex) THEN
    RAISE EXCEPTION 'Invalid argument: external registration URL must be a valid HTTP(S) URL without whitespace.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_community_url := NULLIF(TRIM(COALESCE(p_community_url, '')), '');
  IF v_trimmed_community_url IS NOT NULL AND NOT (v_trimmed_community_url ~* v_url_regex) THEN
    RAISE EXCEPTION 'Invalid argument: community URL must be a valid HTTP(S) URL without whitespace.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathons
  SET title = trim(p_title),
      slug = lower(trim(p_slug)),
      description = trim(p_description),
      organizer = trim(p_organizer),
      mode = p_mode,
      venue = NULLIF(trim(p_venue), ''),
      registration_start_at = p_registration_start_at,
      event_start_at = p_event_start_at,
      event_end_at = p_event_end_at,
      min_team_size = p_min_team_size,
      max_team_size = p_max_team_size,
      is_solo_allowed = p_is_solo_allowed,
      eligibility = trim(p_eligibility),
      tagline = NULLIF(trim(p_tagline), ''),
      prizes_summary = NULLIF(trim(p_prizes_summary), ''),
      prizes_detail = COALESCE(p_prizes_detail, '[]'::jsonb),
      external_registration_url = v_trimmed_external_url,
      community_url = v_trimmed_community_url,
      updated_at = clock_timestamp()
  WHERE id = p_hackathon_id;

  IF p_event_end_at <> v_hackathon.event_end_at THEN
    UPDATE public.storage_deletion_queue
    SET retention_deadline_at = p_event_end_at + interval '7 days',
        updated_at = clock_timestamp()
    WHERE event_id = p_hackathon_id
      AND status = 'pending';
    GET DIAGNOSTICS v_retention_jobs_updated = ROW_COUNT;
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.updated',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'title', trim(p_title),
      'slug', lower(trim(p_slug)),
      'old_event_end_at', v_hackathon.event_end_at,
      'new_event_end_at', p_event_end_at,
      'pending_retention_jobs_updated', v_retention_jobs_updated
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'id', p_hackathon_id,
    'slug', lower(trim(p_slug))
  );
END;
$function$;
