-- Migration: 20261102000002_db_rule_gaps.sql
-- Task Alpha / Part 1: business-rule gaps found while re-baselining the pgTAP suites.
--   * manage_admin_permissions accepted a NULL element inside the permission array
--     (NULL NOT IN (...) is NULL, so the check never fired).
--   * override_round_schedule could move a round past the event end (configure_hackathon_rounds
--     already forbids this).
--   * override_hackathon_deadline: rejected on drafts and for an unchanged deadline, returns
--     the resulting status, and extending a closed registration into
--     the future reopens it (the only supported way to reopen).
--   * transition_hackathon_lifecycle: an in-person/hybrid event needs a venue to publish, and
--     repeating the current status is a no-op without an audit entry, and only a Super Admin
--     may archive an event before it ends.
--   * pause_hackathon_round on an already paused round is a no-op instead of an error.
--   * configure_hackathon_rounds: rounds removed in the form were never deleted (stale rounds
--     stayed); foreign or duplicate round ids were silently accepted. Removed rounds are now
--     deleted unless referenced, and ids are validated.
-- Bodies are the current definitions with only these checks added.

CREATE OR REPLACE FUNCTION public.manage_admin_permissions(p_target_admin_id uuid, p_permissions text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_target_is_super BOOLEAN;
  v_target_is_active BOOLEAN;
  v_normalized_perms TEXT[] := ARRAY[]::TEXT[];
  v_old_perms TEXT[] := ARRAY[]::TEXT[];
  v_added_perms TEXT[] := ARRAY[]::TEXT[];
  v_removed_perms TEXT[] := ARRAY[]::TEXT[];
  v_perm TEXT;
  v_active_event_count INT;
  v_active_event_titles TEXT[];
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT (is_super_admin = true AND is_active = true) INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only active Super Admin can manage permissions.' USING ERRCODE = '42501';
  END IF;

  IF p_target_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target admin ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  IF p_target_admin_id = v_caller_id THEN
    RAISE EXCEPTION 'Operation not permitted: Super Admins cannot alter their own permission set.' USING ERRCODE = '55000';
  END IF;

  IF p_permissions IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: permissions array cannot be null.' USING ERRCODE = '22023';
  END IF;

  SELECT is_super_admin, is_active
  INTO v_target_is_super, v_target_is_active
  FROM public.admin_profiles
  WHERE id = p_target_admin_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target administrator profile % does not exist.', p_target_admin_id USING ERRCODE = 'P0002';
  END IF;

  IF v_target_is_super IS TRUE THEN
    RAISE EXCEPTION 'Operation not permitted: Super Admin accounts hold innate root permissions.' USING ERRCODE = '55000';
  END IF;

  FOREACH v_perm IN ARRAY p_permissions LOOP
    IF v_perm IS NULL OR v_perm NOT IN (
      'verify_students',
      'manage_password_resets',
      'manage_hackathons',
      'assign_hackathons',
      'manage_teams',
      'manage_followups',
      'manage_students',
      'view_analytics',
      'export_data',
      'view_audit_logs',
      'manage_points',
      'manage_notifications',
      'view_student_data'
    ) THEN
      RAISE EXCEPTION 'Invalid permission key: %', v_perm USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), ARRAY[]::TEXT[]) INTO v_normalized_perms
  FROM unnest(p_permissions) p;

  SELECT COALESCE(array_agg(permission ORDER BY permission), ARRAY[]::TEXT[]) INTO v_old_perms
  FROM public.admin_permissions
  WHERE admin_id = p_target_admin_id;

  SELECT COALESCE(array_agg(p ORDER BY p), ARRAY[]::TEXT[]) INTO v_added_perms
  FROM unnest(v_normalized_perms) p
  WHERE p NOT IN (SELECT unnest(v_old_perms));

  SELECT COALESCE(array_agg(p ORDER BY p), ARRAY[]::TEXT[]) INTO v_removed_perms
  FROM unnest(v_old_perms) p
  WHERE p NOT IN (SELECT unnest(v_normalized_perms));

  IF cardinality(v_added_perms) = 0 AND cardinality(v_removed_perms) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'admin_id', p_target_admin_id,
      'permissions', v_normalized_perms,
      'status_unchanged', true
    );
  END IF;

  -- Admin-management safeguard: cannot revoke manage_hackathons if admin is in-charge of active events
  IF 'manage_hackathons' = ANY(v_removed_perms) THEN
    SELECT COUNT(*), COALESCE(array_agg(title ORDER BY title), ARRAY[]::TEXT[])
    INTO v_active_event_count, v_active_event_titles
    FROM public.hackathons
    WHERE in_charge_admin_id = p_target_admin_id
      AND status IN ('published', 'registration_closed', 'ongoing');

    IF v_active_event_count > 0 THEN
      RAISE EXCEPTION 'Cannot revoke manage_hackathons permission: admin is currently assigned as in-charge administrator for % active hackathon(s): %. Reassign these hackathons via reassign_hackathon_in_charge_admin before revoking this permission.',
        v_active_event_count, array_to_string(v_active_event_titles, ', ')
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF cardinality(v_removed_perms) > 0 THEN
    DELETE FROM public.admin_permissions
    WHERE admin_id = p_target_admin_id
      AND permission = ANY(v_removed_perms);
  END IF;

  IF cardinality(v_added_perms) > 0 THEN
    INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
    SELECT p_target_admin_id, p, v_caller_id
    FROM unnest(v_added_perms) p;
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    'super_admin',
    'admin.permissions_updated',
    'admin_profile',
    p_target_admin_id::text,
    jsonb_build_object(
      'old_permissions', v_old_perms,
      'new_permissions', v_normalized_perms,
      'added', v_added_perms,
      'removed', v_removed_perms
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', p_target_admin_id,
    'permissions', v_normalized_perms,
    'added', v_added_perms,
    'removed', v_removed_perms
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.override_round_schedule(p_round_id uuid, p_new_start_at timestamp with time zone, p_new_end_at timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(v_round.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR UPDATE;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot override schedule: hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot override schedule: round is completed and locked.' USING ERRCODE = '55P03';
  END IF;

  IF p_new_start_at IS NULL OR p_new_end_at IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: start_at and end_at cannot be null.' USING ERRCODE = '22023';
  END IF;

  -- Same bound configure_hackathon_rounds enforces: a round cannot outlast the event.
  IF p_new_end_at > v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Round end (%) cannot exceed the event conclusion date (%).', p_new_end_at, v_hackathon.event_end_at USING ERRCODE = '22000';
  END IF;

  IF p_new_start_at >= p_new_end_at THEN
    RAISE EXCEPTION 'start_at (%) must be strictly before end_at (%)', p_new_start_at, p_new_end_at USING ERRCODE = '22000';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful reason of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathon_rounds
  SET start_at = p_new_start_at,
      end_at = p_new_end_at,
      updated_at = clock_timestamp()
  WHERE id = p_round_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon_round.schedule_overridden',
    'hackathon_round',
    p_round_id::text,
    jsonb_build_object(
      'round_id', p_round_id,
      'old_start_at', v_round.start_at,
      'old_end_at', v_round.end_at,
      'new_start_at', p_new_start_at,
      'new_end_at', p_new_end_at,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'new_start_at', p_new_start_at,
    'new_end_at', p_new_end_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.override_hackathon_deadline(p_hackathon_id uuid, p_new_deadline timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot override deadline: hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_hackathon.status = 'draft' THEN
    RAISE EXCEPTION 'Cannot override deadline on a draft event; edit the draft instead.' USING ERRCODE = '55P03';
  END IF;

  IF p_new_deadline = v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'The new deadline is identical to the current deadline.' USING ERRCODE = '22023';
  END IF;

  IF p_new_deadline <= v_hackathon.registration_start_at THEN
    RAISE EXCEPTION 'Registration deadline must be strictly after the registration start date (%)',
      v_hackathon.registration_start_at USING ERRCODE = '22000';
  END IF;

  IF p_new_deadline > v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Registration deadline cannot exceed the event conclusion date (%)',
      v_hackathon.event_end_at USING ERRCODE = '22000';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful justification of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  -- Extending a closed registration into the future reopens it (the documented way to
  -- reopen; transition_hackathon_lifecycle never moves backwards).
  UPDATE public.hackathons
  SET registration_end_at = p_new_deadline,
      status = CASE
        WHEN status = 'registration_closed' AND p_new_deadline > clock_timestamp() THEN 'published'
        ELSE status
      END,
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
    'hackathon.deadline_overridden',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'previous_deadline', v_hackathon.registration_end_at,
      'new_deadline', p_new_deadline,
      'justification', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'new_deadline', p_new_deadline,
    'status', (SELECT status FROM public.hackathons WHERE id = p_hackathon_id)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_hackathon_lifecycle(p_hackathon_id uuid, p_target_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Repeating the current status is a clean no-op (no update, no audit entry).
  IF v_hackathon.status = p_target_status THEN
    RETURN jsonb_build_object('success', true, 'hackathon_id', p_hackathon_id, 'status', p_target_status, 'noop', true);
  END IF;

  v_trimmed_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  -- Archiving before the event ends is a Super Admin decision and needs a reason.
  IF p_target_status = 'archived'
     AND v_hackathon.event_end_at IS NOT NULL
     AND v_hackathon.event_end_at > now()
     AND NOT public.current_is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Admin can archive an event before it ends.' USING ERRCODE = '42501';
  END IF;

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

  -- Events only move forward once registration has closed or the event has started.
  IF v_hackathon.status = 'registration_closed' AND p_target_status NOT IN ('ongoing', 'completed', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from registration_closed to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  IF v_hackathon.status = 'ongoing' AND p_target_status NOT IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from ongoing to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  IF p_target_status = 'published'
     AND NOT EXISTS (SELECT 1 FROM public.hackathon_rounds WHERE hackathon_id = p_hackathon_id) THEN
    RAISE EXCEPTION 'Configure at least one round before publishing.' USING ERRCODE = '22023';
  END IF;

  IF p_target_status = 'published'
     AND v_hackathon.mode IN ('offline', 'hybrid')
     AND NULLIF(TRIM(COALESCE(v_hackathon.venue, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Add a venue before publishing an in-person or hybrid event.' USING ERRCODE = '22023';
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
$function$;

CREATE OR REPLACE FUNCTION public.pause_hackathon_round(p_round_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(v_round.hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR UPDATE;

  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot pause round: parent hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  -- Pausing an already paused round is a no-op (no audit entry, no notification).
  IF v_round.status = 'paused' THEN
    RETURN jsonb_build_object('success', true, 'round_id', p_round_id, 'status', 'paused', 'message', 'Round is already paused.');
  END IF;

  IF v_round.status <> 'open' THEN
    RAISE EXCEPTION 'Cannot pause round: only open rounds can be paused (current status: %).', v_round.status USING ERRCODE = '22023';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Invalid argument: a meaningful reason of at least 10 characters is mandatory.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathon_rounds
  SET status = 'paused',
      updated_at = clock_timestamp()
  WHERE id = p_round_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon_round.paused',
    'hackathon_round',
    p_round_id::text,
    jsonb_build_object(
      'round_id', p_round_id,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'status', 'paused'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.configure_hackathon_rounds(p_hackathon_id uuid, p_rounds jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_len INT;
  v_i INT;
  v_round JSONB;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_prev_end TIMESTAMPTZ := NULL;
  v_final_count INT := 0;
  v_ids UUID[];
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
    RAISE EXCEPTION 'Cannot configure rounds: hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF p_rounds IS NULL OR jsonb_typeof(p_rounds) <> 'array' THEN
    RAISE EXCEPTION 'Rounds configuration must be a JSON array.' USING ERRCODE = '22023';
  END IF;

  v_len := jsonb_array_length(p_rounds);
  IF v_len < 1 OR v_len > 10 THEN
    RAISE EXCEPTION 'Hackathons must have between 1 and 10 rounds (received %)', v_len USING ERRCODE = '22000';
  END IF;

  FOR v_i IN 0 .. v_len - 1 LOOP
    IF (p_rounds->v_i->>'round_number') IS NULL OR (p_rounds->v_i->>'round_number')::INT <> (v_i + 1) THEN
      RAISE EXCEPTION 'Round numbers must be strictly sequential starting at 1 (index % has %)',
        v_i, (p_rounds->v_i->>'round_number') USING ERRCODE = '22000';
    END IF;

    IF TRIM(COALESCE(p_rounds->v_i->>'name', '')) = '' THEN
      RAISE EXCEPTION 'Round name at index % cannot be empty.', v_i USING ERRCODE = '22000';
    END IF;

    v_start := (p_rounds->v_i->>'start_at')::TIMESTAMPTZ;
    v_end := (p_rounds->v_i->>'end_at')::TIMESTAMPTZ;

    IF v_start >= v_end THEN
      RAISE EXCEPTION 'Round % start_at (%) must precede end_at (%)', v_i + 1, v_start, v_end USING ERRCODE = '22000';
    END IF;

    IF v_start < v_hackathon.registration_start_at THEN
      RAISE EXCEPTION 'Round % start_at (%) cannot precede registration start date (%)',
        v_i + 1, v_start, v_hackathon.registration_start_at USING ERRCODE = '22000';
    END IF;

    IF v_end > v_hackathon.event_end_at THEN
      RAISE EXCEPTION 'Round % end_at (%) cannot exceed event end date (%)',
        v_i + 1, v_end, v_hackathon.event_end_at USING ERRCODE = '22000';
    END IF;

    IF v_prev_end IS NOT NULL AND v_start < v_prev_end THEN
      RAISE EXCEPTION 'Round % start_at (%) overlaps with previous round end_at (%)',
        v_i + 1, v_start, v_prev_end USING ERRCODE = '22000';
    END IF;

    v_prev_end := v_end;

    IF COALESCE((p_rounds->v_i->>'is_final_round')::BOOLEAN, false) THEN
      v_final_count := v_final_count + 1;
    END IF;
  END LOOP;

  IF v_final_count > 1 THEN
    RAISE EXCEPTION 'At most one round can be designated as the final round.' USING ERRCODE = '22000';
  END IF;

  -- Existing rounds are identified by id: each id must be unique and belong to this hackathon.
  SELECT array_agg((r->>'id')::UUID) INTO v_ids
  FROM jsonb_array_elements(p_rounds) r
  WHERE NULLIF(r->>'id', '') IS NOT NULL;

  IF v_ids IS NOT NULL THEN
    IF (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> cardinality(v_ids) THEN
      RAISE EXCEPTION 'Duplicate round ids in the round configuration.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_ids) x
      WHERE NOT EXISTS (SELECT 1 FROM public.hackathon_rounds hr WHERE hr.id = x AND hr.hackathon_id = p_hackathon_id)
    ) THEN
      RAISE EXCEPTION 'A round in the configuration does not belong to this hackathon.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Rounds left out of the configuration are removed, unless something already
  -- references them (submissions, results, points use ON DELETE RESTRICT).
  BEGIN
    DELETE FROM public.hackathon_rounds
    WHERE hackathon_id = p_hackathon_id
      AND (v_ids IS NULL OR id <> ALL (v_ids));
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'A round that already has submissions, results or points cannot be removed.' USING ERRCODE = '55P03';
  END;

  FOR v_i IN 0 .. v_len - 1 LOOP
    v_round := p_rounds->v_i;

    IF (v_round->>'id') IS NOT NULL AND (v_round->>'id') <> '' THEN
      UPDATE public.hackathon_rounds
      SET round_number = (v_round->>'round_number')::INT,
          name = TRIM(v_round->>'name'),
          description = NULLIF(TRIM(v_round->>'description'), ''),
          start_at = (v_round->>'start_at')::TIMESTAMPTZ,
          end_at = (v_round->>'end_at')::TIMESTAMPTZ,
          is_final_round = COALESCE((v_round->>'is_final_round')::BOOLEAN, false),
          updated_at = clock_timestamp()
      WHERE id = (v_round->>'id')::UUID
        AND hackathon_id = p_hackathon_id;
    ELSE
      INSERT INTO public.hackathon_rounds (
        hackathon_id,
        round_number,
        name,
        description,
        start_at,
        end_at,
        is_final_round
      ) VALUES (
        p_hackathon_id,
        (v_round->>'round_number')::INT,
        TRIM(v_round->>'name'),
        NULLIF(TRIM(v_round->>'description'), ''),
        (v_round->>'start_at')::TIMESTAMPTZ,
        (v_round->>'end_at')::TIMESTAMPTZ,
        COALESCE((v_round->>'is_final_round')::BOOLEAN, false)
      );
    END IF;
  END LOOP;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.rounds_configured',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object('round_count', v_len)
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'round_count', v_len
  );
END;
$function$;
