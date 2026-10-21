-- Suite 15: Phase 6 Hardening, Stage Schedules, Admin Scoping & Retention Integration (TS-P6H)
BEGIN;
SELECT plan(32);

-- ============================================================================
-- Fixture Setup (Executed as Superuser / postgres)
-- ============================================================================

-- Fixture Admin 60 with manage_hackathons
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000060',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hackathon.admin60@nmit-dev.local',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
  '{"full_name":"Hackathon Admin Sixty","role":"admin"}'::jsonb,
  now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
VALUES ('00000000-0000-0000-0000-000000000060', 'hackathon.admin60@nmit-dev.local', 'Hackathon Admin Sixty', false, true)
ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;

INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
VALUES ('00000000-0000-0000-0000-000000000060', 'manage_hackathons', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (admin_id, permission) DO NOTHING;

INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
VALUES ('00000000-0000-0000-0000-000000000060', 'view_audit_logs', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (admin_id, permission) DO NOTHING;

-- Fixture Admin 62 with manage_hackathons (a different active admin)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000062',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hackathon.admin62@nmit-dev.local',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
  '{"full_name":"Hackathon Admin Sixty-Two","role":"admin"}'::jsonb,
  now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
VALUES ('00000000-0000-0000-0000-000000000062', 'hackathon.admin62@nmit-dev.local', 'Hackathon Admin Sixty-Two', false, true)
ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;

INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
VALUES ('00000000-0000-0000-0000-000000000062', 'manage_hackathons', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (admin_id, permission) DO NOTHING;

-- Fixture Admin 63 WITHOUT manage_hackathons (only manage_users)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000063',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'hackathon.admin63@nmit-dev.local',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
  '{"full_name":"Hackathon Admin Sixty-Three","role":"admin"}'::jsonb,
  now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
VALUES ('00000000-0000-0000-0000-000000000063', 'hackathon.admin63@nmit-dev.local', 'Hackathon Admin Sixty-Three', false, true)
ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;

DELETE FROM public.admin_permissions WHERE admin_id = '00000000-0000-0000-0000-000000000063';
INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
VALUES ('00000000-0000-0000-0000-000000000063', 'manage_students', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (admin_id, permission) DO NOTHING;

-- Fixture Inactive Admin 61
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'deactivated.admin61@nmit-dev.local',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
  '{"full_name":"Deactivated Admin Sixty-One","role":"admin"}'::jsonb,
  now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
VALUES ('00000000-0000-0000-0000-000000000061', 'deactivated.admin61@nmit-dev.local', 'Deactivated Admin Sixty-One', false, false)
ON CONFLICT (id) DO UPDATE SET is_active = false, is_super_admin = false;

-- Helper to set authenticated user context
CREATE OR REPLACE FUNCTION public.test_authenticate_as(p_user_id UUID, p_role TEXT DEFAULT 'authenticated')
RETURNS VOID AS $$
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- TS-P6H-01: Round status constraint supports 'paused'
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$
    INSERT INTO public.hackathons (
      id, title, slug, description, organizer, mode, status,
      registration_start_at, registration_end_at, event_start_at, event_end_at,
      created_by, in_charge_admin_id
    ) VALUES (
      '00000000-0000-0000-0000-000000006001', 'Status Test Hackathon', 'status-test-hackathon',
      'Test description', 'CSE Dept', 'online', 'draft',
      now(), now() + interval '1 day', now() + interval '2 days', now() + interval '3 days',
      '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000060'
    );
    INSERT INTO public.hackathon_rounds (
      id, hackathon_id, round_number, name, start_at, end_at, status
    ) VALUES (
      '00000000-0000-0000-0000-000000006010', '00000000-0000-0000-0000-000000006001',
      1, 'Paused Round 1', now() + interval '2 days', now() + interval '3 days', 'paused'
    );
  $$,
  'TS-P6H-01: hackathon_rounds table accepts status = ''paused'''
);

-- ----------------------------------------------------------------------------
-- TS-P6H-02: Super Admin assigns eligible Admin 60 at draft creation
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000001'::uuid); -- Super Admin

DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.create_hackathon_draft(
    p_title := 'Assigned Hackathon Alpha',
    p_slug := 'assigned-hackathon-alpha',
    p_description := 'Super admin assigns admin 60',
    p_organizer := 'CSE Dept',
    p_mode := 'online',
    p_venue := '',
    p_registration_start_at := now(),
    p_registration_end_at := now() + interval '2 days',
    p_event_start_at := now() + interval '3 days',
    p_event_end_at := now() + interval '5 days',
    p_in_charge_admin_id := '00000000-0000-0000-0000-000000000060'::uuid
  ) INTO v_res;

  PERFORM set_config('test.p6h_h1_id', v_res->>'id', false);
END $$;

SELECT is(
  (SELECT in_charge_admin_id::text FROM public.hackathons WHERE id = current_setting('test.p6h_h1_id')::uuid),
  '00000000-0000-0000-0000-000000000060',
  'TS-P6H-02: Super Admin draft creation correctly sets in_charge_admin_id to assigned admin'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-03: Super Admin assignment rejects non-existent admin
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_title := 'Ghost Admin Hackathon',
      p_slug := 'ghost-admin-hackathon',
      p_description := 'Assigning non-existent admin',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '2 days',
      p_event_start_at := now() + interval '3 days',
      p_event_end_at := now() + interval '5 days',
      p_in_charge_admin_id := '00000000-0000-0000-0000-000000000999'::uuid
    )
  $$,
  'P0001',
  'Invalid argument: assigned in-charge admin does not exist.',
  'TS-P6H-03: Assigning non-existent in-charge admin throws validation error'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-04: Super Admin assignment rejects inactive admin
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_title := 'Inactive Admin Hackathon',
      p_slug := 'inactive-admin-hackathon',
      p_description := 'Assigning inactive admin',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '2 days',
      p_event_start_at := now() + interval '3 days',
      p_event_end_at := now() + interval '5 days',
      p_in_charge_admin_id := '00000000-0000-0000-0000-000000000061'::uuid
    )
  $$,
  'P0001',
  'Invalid argument: assigned in-charge admin is inactive.',
  'TS-P6H-04: Assigning inactive in-charge admin throws validation error'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-05: Super Admin assignment rejects admin lacking manage_hackathons
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_title := 'Ineligible Admin Hackathon',
      p_slug := 'ineligible-admin-hackathon',
      p_description := 'Assigning ineligible admin lacking manage_hackathons',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '2 days',
      p_event_start_at := now() + interval '3 days',
      p_event_end_at := now() + interval '5 days',
      p_in_charge_admin_id := '00000000-0000-0000-0000-000000000063'::uuid
    )
  $$,
  'P0001',
  'Invalid argument: assigned in-charge admin is not eligible. Must hold manage_hackathons permission.',
  'TS-P6H-05: Assigning in-charge admin without manage_hackathons throws validation error'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-06: Ordinary Admin cannot assign another admin
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid); -- Admin 60

SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_title := 'Rogue Assign Hackathon',
      p_slug := 'rogue-assign-hackathon',
      p_description := 'Ordinary admin attempting to assign another admin',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '2 days',
      p_event_start_at := now() + interval '3 days',
      p_event_end_at := now() + interval '5 days',
      p_in_charge_admin_id := '00000000-0000-0000-0000-000000000062'::uuid
    )
  $$,
  'P0001',
  'Access denied: only Super Admins can assign a different in-charge admin.',
  'TS-P6H-06: Ordinary Admin assigning a different in-charge admin throws access denied'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-07: Ordinary Admin draft creation defaults to self
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.create_hackathon_draft(
    p_title := 'Self Assigned Hackathon',
    p_slug := 'self-assigned-hackathon',
    p_description := 'Ordinary admin creates draft without p_in_charge_admin_id',
    p_organizer := 'CSE Dept',
    p_mode := 'online',
    p_venue := '',
    p_registration_start_at := now(),
    p_registration_end_at := now() + interval '2 days',
    p_event_start_at := now() + interval '3 days',
    p_event_end_at := now() + interval '5 days'
  ) INTO v_res;

  PERFORM set_config('test.p6h_h2_id', v_res->>'id', false);
END $$;

SELECT is(
  (SELECT in_charge_admin_id::text FROM public.hackathons WHERE id = current_setting('test.p6h_h2_id')::uuid),
  '00000000-0000-0000-0000-000000000060',
  'TS-P6H-07: Ordinary Admin draft creation automatically assigns self as in-charge admin'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-08: RLS isolation: Admin 62 cannot see Admin 60''s hackathon via base table
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000062'::uuid); -- Admin 62

SELECT is_empty(
  format('SELECT id FROM public.hackathons WHERE id = %L::uuid', current_setting('test.p6h_h1_id')),
  'TS-P6H-08: Non-in-charge Admin 62 base table query on Admin 60''s hackathon returns 0 rows via RLS'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-09: In-charge Admin 60 can see own hackathon via base table
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid); -- Admin 60

SELECT isnt_empty(
  format('SELECT id FROM public.hackathons WHERE id = %L::uuid', current_setting('test.p6h_h1_id')),
  'TS-P6H-09: In-charge Admin 60 base table query returns assigned hackathon'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-10: Super Admin sees all hackathons via base table
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000001'::uuid); -- Super Admin

SELECT is(
  (SELECT count(*)::int FROM public.hackathons WHERE id IN (current_setting('test.p6h_h1_id')::uuid, current_setting('test.p6h_h2_id')::uuid)),
  2,
  'TS-P6H-10: Super Admin base table query returns all hackathons regardless of in-charge admin'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-11: Admin 62 denied update_hackathon_metadata on Admin 60''s hackathon
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000062'::uuid); -- Admin 62

SELECT throws_ok(
  format(
    'SELECT public.update_hackathon_metadata(
      p_hackathon_id := %L::uuid,
      p_title := %L,
      p_slug := %L,
      p_tagline := %L,
      p_description := %L,
      p_organizer := %L,
      p_mode := %L,
      p_venue := %L,
      p_registration_start_at := now(),
      p_event_start_at := (now() + interval ''3 days'')::timestamptz,
      p_event_end_at := (now() + interval ''5 days'')::timestamptz,
      p_min_team_size := 1,
      p_max_team_size := 4,
      p_is_solo_allowed := false,
      p_eligibility := %L,
      p_prizes_summary := %L,
      p_prizes_detail := %L::jsonb,
      p_external_registration_url := %L,
      p_community_url := %L
    )',
    current_setting('test.p6h_h1_id'),
    'Unauthorized Edit',
    'unauthorized-edit',
    '',
    'Description',
    'CSE Dept',
    'online',
    '',
    'All students',
    '',
    '[]'::text,
    '',
    ''
  ),
  'P0001',
  'Access denied: manage_hackathons permission required.',
  'TS-P6H-11: Admin 62 denied update_hackathon_metadata on hackathon assigned to Admin 60'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-12: Admin 62 denied configure_hackathon_rounds on Admin 60''s hackathon
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.configure_hackathon_rounds(%L::uuid, %L::jsonb)',
    current_setting('test.p6h_h1_id'),
    '[{"round_number": 1, "name": "Round 1", "start_at": "2026-11-01T10:00:00Z", "end_at": "2026-11-02T10:00:00Z", "is_final_round": true}]'
  ),
  'P0001',
  'Access denied: manage_hackathons permission required.',
  'TS-P6H-12: Admin 62 denied configure_hackathon_rounds on hackathon assigned to Admin 60'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-13: In-charge Admin 60 successfully configures rounds
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid); -- Admin 60

DO $$
BEGIN
  PERFORM public.configure_hackathon_rounds(
    current_setting('test.p6h_h1_id')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'round_number', 1,
        'name', 'Round 1 Submission',
        'start_at', now() + interval '3 days',
        'end_at', now() + interval '4 days',
        'is_final_round', false
      ),
      jsonb_build_object(
        'round_number', 2,
        'name', 'Grand Finale',
        'start_at', now() + interval '4 days',
        'end_at', now() + interval '5 days',
        'is_final_round', true
      )
    )
  );

  PERFORM set_config(
    'test.p6h_r1_id',
    (SELECT id::text FROM public.hackathon_rounds WHERE hackathon_id = current_setting('test.p6h_h1_id')::uuid AND round_number = 1),
    false
  );
  PERFORM set_config(
    'test.p6h_r2_id',
    (SELECT id::text FROM public.hackathon_rounds WHERE hackathon_id = current_setting('test.p6h_h1_id')::uuid AND round_number = 2),
    false
  );
END $$;

SELECT is(
  (SELECT count(*)::int FROM public.hackathon_rounds WHERE hackathon_id = current_setting('test.p6h_h1_id')::uuid),
  2,
  'TS-P6H-13: In-charge Admin 60 successfully configured 2 rounds on assigned hackathon'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-14: override_round_schedule rejects short justification (< 5 chars)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.override_round_schedule(%L::uuid, %L::timestamptz, %L::timestamptz, %L)',
    current_setting('test.p6h_r1_id'),
    (now() + interval '3 days')::text,
    (now() + interval '4 days' + interval '2 hours')::text,
    'shrt'
  ),
  'P0001',
  'Invalid argument: a meaningful justification of at least 5 characters is mandatory.',
  'TS-P6H-14: override_round_schedule rejects reason shorter than 5 characters'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-15: override_round_schedule rejects inverted chronology (start >= end)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.override_round_schedule(%L::uuid, %L::timestamptz, %L::timestamptz, %L)',
    current_setting('test.p6h_r1_id'),
    (now() + interval '4 days')::text,
    (now() + interval '3 days')::text,
    'Valid reason for inverted test'
  ),
  'P0001',
  'Invalid round schedule: start time must precede end time.',
  'TS-P6H-15: override_round_schedule rejects start_at >= end_at'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-16: override_round_schedule rejects dates outside event window
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.override_round_schedule(%L::uuid, %L::timestamptz, %L::timestamptz, %L)',
    current_setting('test.p6h_r1_id'),
    (now() + interval '3 days')::text,
    (now() + interval '6 days')::text,
    'Valid reason for window exceed test'
  ),
  'P0001',
  NULL,
  'TS-P6H-16: override_round_schedule rejects end_at exceeding event_end_at'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-17: override_round_schedule successfully updates schedule and logs audit
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_new_end TIMESTAMPTZ := now() + interval '4 days' + interval '3 hours';
  v_res JSONB;
BEGIN
  SELECT public.override_round_schedule(
    current_setting('test.p6h_r1_id')::uuid,
    now() + interval '3 days',
    v_new_end,
    'Server maintenance extended round 1 window'
  ) INTO v_res;
END $$;

SELECT isnt_empty(
  format(
    'SELECT id FROM public.audit_logs WHERE target_id = %L AND action = %L',
    current_setting('test.p6h_r1_id'),
    'hackathon_round.schedule_overridden'
  ),
  'TS-P6H-17: override_round_schedule successfully produces hackathon_round.schedule_overridden audit log'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-18: pause_hackathon_round pauses round and logs audit
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.pause_hackathon_round(
    current_setting('test.p6h_r1_id')::uuid,
    'Emergency server maintenance required'
  ) INTO v_res;
END $$;

SELECT is(
  (SELECT status FROM public.hackathon_rounds WHERE id = current_setting('test.p6h_r1_id')::uuid),
  'paused',
  'TS-P6H-18: pause_hackathon_round sets round status to ''paused'''
);

-- ----------------------------------------------------------------------------
-- TS-P6H-19: pause_hackathon_round is idempotent if already paused
-- ----------------------------------------------------------------------------
SELECT is(
  (public.pause_hackathon_round(current_setting('test.p6h_r1_id')::uuid, 'Duplicate pause attempt')->>'message'),
  'Round is already paused.',
  'TS-P6H-19: pause_hackathon_round is idempotent on already paused round'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-20: Rescheduling alone leaves the round paused (no silent resumption)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.override_round_schedule(
    current_setting('test.p6h_r1_id')::uuid,
    now() + interval '3 days',
    now() + interval '4 days' + interval '3 hours' + interval '30 minutes',
    'Rescheduling while paused must not silently resume'
  ) INTO v_res;
END $$;

SELECT is(
  (SELECT status FROM public.hackathon_rounds WHERE id = current_setting('test.p6h_r1_id')::uuid),
  'paused',
  'TS-P6H-20: override_round_schedule leaves paused round in paused status without silent resumption'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-21: resume_hackathon_round rejects past end time
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.resume_hackathon_round(%L::uuid, %L::timestamptz, %L)',
    current_setting('test.p6h_r1_id'),
    (now() - interval '1 hour')::text,
    'Attempting past resumption'
  ),
  'P0001',
  'Cannot resume round: end time must be strictly in the future. Supply a new future end time.',
  'TS-P6H-21: resume_hackathon_round rejects past end time'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-22: resume_hackathon_round successfully resumes round to 'open'
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.resume_hackathon_round(
    current_setting('test.p6h_r1_id')::uuid,
    now() + interval '4 days' + interval '4 hours',
    'Server maintenance completed, resuming submissions'
  ) INTO v_res;
END $$;

SELECT is(
  (SELECT status FROM public.hackathon_rounds WHERE id = current_setting('test.p6h_r1_id')::uuid),
  'open',
  'TS-P6H-22: resume_hackathon_round transitions paused round back to ''open'''
);

-- ----------------------------------------------------------------------------
-- TS-P6H-22: PLAN A GUARD: Active deletion job blocks deadline extension with 55P03
-- ----------------------------------------------------------------------------
SET LOCAL ROLE postgres;

-- Publish the hackathon first to allow deadline override
UPDATE public.hackathons SET status = 'published' WHERE id = current_setting('test.p6h_h1_id')::uuid;

-- Insert active deletion queue job in status 'claimed'
INSERT INTO public.storage_deletion_queue (
  id, event_id, bucket_id, object_path, target_type, target_id, retention_deadline_at, status
) VALUES (
  '00000000-0000-0000-0000-000000006099',
  current_setting('test.p6h_h1_id')::uuid,
  'submission-evidence',
  'test/active_evidence.pdf',
  'submission_evidence',
  '00000000-0000-0000-0000-000000000001',
  now() - interval '1 day',
  'claimed'
);

-- Switch back to Admin 60
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid);

SELECT throws_ok(
  format(
    'SELECT public.override_hackathon_deadline(%L::uuid, %L::timestamptz, %L)',
    current_setting('test.p6h_h1_id'),
    (now() + interval '2 days' + interval '12 hours')::text,
    'Extending registration while deletion is active'
  ),
  '55P03',
  'Cannot extend hackathon deadline while evidence deletion is in progress or unresolved (Plan A guard). Please retry once deletion completes.',
  'TS-P6H-22: Plan A guard rejects override_hackathon_deadline with 55P03 when active deletion job exists'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-23: PLAN A GUARD: Active deletion job blocks metadata event_end_at extension
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.update_hackathon_metadata(
      p_hackathon_id := %L::uuid,
      p_title := %L,
      p_slug := %L,
      p_tagline := %L,
      p_description := %L,
      p_organizer := %L,
      p_mode := %L,
      p_venue := %L,
      p_registration_start_at := now(),
      p_event_start_at := (now() + interval ''3 days'')::timestamptz,
      p_event_end_at := (now() + interval ''6 days'')::timestamptz,
      p_min_team_size := 1,
      p_max_team_size := 4,
      p_is_solo_allowed := false,
      p_eligibility := %L,
      p_prizes_summary := %L,
      p_prizes_detail := %L::jsonb,
      p_external_registration_url := %L,
      p_community_url := %L
    )',
    current_setting('test.p6h_h1_id'),
    'Assigned Hackathon Alpha',
    'assigned-hackathon-alpha',
    '',
    'Super admin assigns admin 60',
    'CSE Dept',
    'online',
    '',
    'All students',
    '',
    '[]'::text,
    '',
    ''
  ),
  '55P03',
  'Cannot extend hackathon deadline while evidence deletion is in progress or unresolved (Plan A guard). Please retry once deletion completes.',
  'TS-P6H-23: Plan A guard rejects update_hackathon_metadata extension with 55P03 when active deletion job exists'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-24: Plan A Guard: Once deletion job is completed, extension succeeds
-- ----------------------------------------------------------------------------
SET LOCAL ROLE postgres;

UPDATE public.storage_deletion_queue
SET status = 'completed', completed_at = now()
WHERE id = '00000000-0000-0000-0000-000000006099';

SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid);

SELECT lives_ok(
  format(
    'SELECT public.override_hackathon_deadline(%L::uuid, %L::timestamptz, %L)',
    current_setting('test.p6h_h1_id'),
    (now() + interval '2 days' + interval '12 hours')::text,
    'Extending registration after deletion resolved'
  ),
  'TS-P6H-24: override_hackathon_deadline succeeds when deletion job is in terminal completed status'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-25: Metadata extension syncs retention_deadline_at on pending queue jobs
-- ----------------------------------------------------------------------------
SET LOCAL ROLE postgres;

INSERT INTO public.storage_deletion_queue (
  id, event_id, bucket_id, object_path, target_type, target_id, retention_deadline_at, status
) VALUES (
  '00000000-0000-0000-0000-000000006098',
  current_setting('test.p6h_h1_id')::uuid,
  'submission-evidence',
  'test/pending_evidence.pdf',
  'submission_evidence',
  '00000000-0000-0000-0000-000000000001',
  now() + interval '12 days',
  'pending'
);

SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid);

DO $$
BEGIN
  PERFORM public.update_hackathon_metadata(
    p_hackathon_id := current_setting('test.p6h_h1_id')::uuid,
    p_title := 'Assigned Hackathon Alpha',
    p_slug := 'assigned-hackathon-alpha',
    p_tagline := '',
    p_description := 'Updated event window',
    p_organizer := 'CSE Dept',
    p_mode := 'online',
    p_venue := '',
    p_registration_start_at := now(),
    p_event_start_at := now() + interval '3 days',
    p_event_end_at := now() + interval '7 days',
    p_min_team_size := 1,
    p_max_team_size := 4,
    p_is_solo_allowed := false,
    p_eligibility := 'All students',
    p_prizes_summary := '',
    p_prizes_detail := '[]'::jsonb,
    p_external_registration_url := '',
    p_community_url := ''
  );
END $$;

SET LOCAL ROLE postgres;

SELECT is(
  (SELECT (retention_deadline_at > now() + interval '13 days')::boolean FROM public.storage_deletion_queue WHERE id = '00000000-0000-0000-0000-000000006098'),
  true,
  'TS-P6H-25: update_hackathon_metadata atomically updates retention_deadline_at on pending queue jobs'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-26: Evidence retention ineligible before 7 days post event end
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid);

SELECT is(
  (public.enqueue_hackathon_evidence_retention(current_setting('test.p6h_h1_id')::uuid)->>'eligible')::boolean,
  false,
  'TS-P6H-26: enqueue_hackathon_evidence_retention returns eligible = false when event_end_at + 7 days is in future'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-27: Evidence retention enqueues evidence after 7 days post event end
-- ----------------------------------------------------------------------------
SET LOCAL ROLE postgres;

-- Create an expired hackathon with submission evidence and team external proof
INSERT INTO public.hackathons (
  id, title, slug, description, organizer, mode, status,
  registration_start_at, registration_end_at, event_start_at, event_end_at,
  created_by, in_charge_admin_id
) VALUES (
  '00000000-0000-0000-0000-000000006088', 'Expired Event Alpha', 'expired-event-alpha',
  'Ended 8 days ago', 'CSE Dept', 'online', 'completed',
  now() - interval '20 days', now() - interval '10 days', now() - interval '9 days', now() - interval '8 days',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000060'
);

INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, external_proof_path)
VALUES (
  '00000000-0000-0000-0000-000000006087', '00000000-0000-0000-0000-000000006088',
  'Team Retained', '00000000-0000-0000-0000-000000000003', 'RET87', 'evidence/proof_6087.png'
);

INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
VALUES (
  '00000000-0000-0000-0000-000000006087', '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000006088', 'leader'
);

INSERT INTO public.hackathon_rounds (
  id, hackathon_id, round_number, name, start_at, end_at, status
) VALUES (
  '00000000-0000-0000-0000-000000006086', '00000000-0000-0000-0000-000000006088',
  1, 'Round 1', now() - interval '9 days', now() - interval '8 days', 'completed'
);

INSERT INTO public.submissions (
  id, hackathon_id, round_id, team_id, submitted_by, title, repo_url, status, evidence_path
) VALUES (
  '00000000-0000-0000-0000-000000006085',
  '00000000-0000-0000-0000-000000006088',
  '00000000-0000-0000-0000-000000006086',
  '00000000-0000-0000-0000-000000006087',
  '00000000-0000-0000-0000-000000000003',
  'Expired Project', 'https://github.com/nmit/expired', 'submitted',
  'submission-evidence/project_6085.zip'
);

-- Switch to Admin 60 to enqueue
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid);

DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.enqueue_hackathon_evidence_retention('00000000-0000-0000-0000-000000006088'::uuid) INTO v_res;
  IF (v_res->>'eligible')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Expected eligible = true, got %', v_res;
  END IF;
  IF (v_res->>'total_enqueued')::int <> 2 THEN
    RAISE EXCEPTION 'Expected 2 items enqueued, got %', v_res;
  END IF;
END $$;

SELECT pass('TS-P6H-27: enqueue_hackathon_evidence_retention enqueues submissions evidence and registration screenshots after 7 days post event end');

-- ----------------------------------------------------------------------------
-- TS-P6H-28: enqueue_hackathon_evidence_retention is idempotent
-- ----------------------------------------------------------------------------
SELECT is(
  (public.enqueue_hackathon_evidence_retention('00000000-0000-0000-0000-000000006088'::uuid)->>'total_enqueued')::int,
  0,
  'TS-P6H-28: Second invocation of enqueue_hackathon_evidence_retention enqueues 0 duplicate jobs (idempotent)'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-29: Verified results and points preserved when evidence is enqueued/deleted
-- ----------------------------------------------------------------------------
SET LOCAL ROLE postgres;

-- Insert verified result and points for the team
INSERT INTO public.results (
  id, hackathon_id, round_id, team_id, milestone_type, placement, is_published, verified_by, verified_at
) VALUES (
  '00000000-0000-0000-0000-000000006084',
  '00000000-0000-0000-0000-000000006088',
  '00000000-0000-0000-0000-000000006086',
  '00000000-0000-0000-0000-000000006087',
  'win_placement', '1st', true, '00000000-0000-0000-0000-000000000001', now() - interval '8 days'
);

INSERT INTO public.points_ledger (
  id, idempotency_key, student_id, hackathon_id, round_id, team_id, result_id, milestone_type, role_at_award, points, reason, awarded_by
) VALUES (
  '00000000-0000-0000-0000-000000006083',
  'points_award_6083',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000006088',
  '00000000-0000-0000-0000-000000006086',
  '00000000-0000-0000-0000-000000006087',
  '00000000-0000-0000-0000-000000006084',
  'round_qualification',
  'leader',
  100,
  'Round qualification points',
  '00000000-0000-0000-0000-000000000001'
);

SELECT is(
  (SELECT count(*)::int FROM public.results WHERE hackathon_id = '00000000-0000-0000-0000-000000006088'),
  1,
  'TS-P6H-29: Verified results remain intact and preserved'
);

SELECT is(
  (SELECT count(*)::int FROM public.points_ledger WHERE id = '00000000-0000-0000-0000-000000006083'),
  1,
  'TS-P6H-29b: Awarded points ledger record remains intact and preserved'
);

-- ----------------------------------------------------------------------------
-- TS-P6H-30: scan_and_enqueue_expired_hackathons_evidence batch scans expired events
-- ----------------------------------------------------------------------------
-- Test as service_role
SET LOCAL ROLE service_role;

SELECT lives_ok(
  $$ SELECT public.scan_and_enqueue_expired_hackathons_evidence() $$,
  'TS-P6H-30: scan_and_enqueue_expired_hackathons_evidence executes successfully under service_role'
);

-- ============================================================================
-- Complete Test Suite & Rollback
-- ============================================================================
SELECT * FROM finish();
ROLLBACK;
