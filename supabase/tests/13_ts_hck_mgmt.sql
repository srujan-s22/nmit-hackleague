-- Suite 13: Phase 6 Hackathon Management, Lifecycle & Public Discovery (TS-HCK)
BEGIN;
SELECT plan(58);

-- ============================================================================
-- Fixture Setup (Executed as Superuser / postgres)
-- ============================================================================

-- Fixture Admin with manage_hackathons
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

-- Deactivated Admin
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'deactivated.admin61@nmit-dev.local',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
  '{"full_name":"Deactivated Admin SixtyOne","role":"admin"}'::jsonb,
  now(), now()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
VALUES ('00000000-0000-0000-0000-000000000061', 'deactivated.admin61@nmit-dev.local', 'Deactivated Admin SixtyOne', false, false)
ON CONFLICT (id) DO UPDATE SET is_active = false, is_super_admin = false;

INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
VALUES ('00000000-0000-0000-0000-000000000061', 'manage_hackathons', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (admin_id, permission) DO NOTHING;

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
-- TS-HCK-01: Table columns existence on public.hackathons
-- ----------------------------------------------------------------------------
SELECT has_column('public', 'hackathons', 'eligibility', 'TS-HCK-01: public.hackathons has eligibility column');
SELECT has_column('public', 'hackathons', 'tagline', 'TS-HCK-01: public.hackathons has tagline column');
SELECT has_column('public', 'hackathons', 'prizes_detail', 'TS-HCK-01: public.hackathons has prizes_detail column');

-- ----------------------------------------------------------------------------
-- TS-HCK-02: Solo consistency invariant: min_team_size > 1 with is_solo_allowed = true throws
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid);

SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
      p_title := 'Solo Invariant Test',
      p_slug := 'solo-inv-test',
      p_description := 'Testing solo consistency',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '5 days',
      p_event_start_at := now() + interval '6 days',
      p_event_end_at := now() + interval '7 days',
      p_min_team_size := 2,
      p_max_team_size := 4,
      p_is_solo_allowed := true
    )
  $$,
  '23514', -- check_violation
  NULL,
  'TS-HCK-02: Solo consistency invariant rejects min_team_size > 1 when is_solo_allowed is true'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-03: Solo consistency valid: min_team_size = 1 with is_solo_allowed = true succeeds
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
      p_title := 'Valid Solo Hackathon',
      p_slug := 'valid-solo-hck',
      p_description := 'Solo allowed with min size 1',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '5 days',
      p_event_start_at := now() + interval '6 days',
      p_event_end_at := now() + interval '7 days',
      p_min_team_size := 1,
      p_max_team_size := 4,
      p_is_solo_allowed := true
    )
  $$,
  'TS-HCK-03: Solo consistency valid succeeds when min_team_size is 1'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-04: Mode/venue online with null/empty venue succeeds
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
      p_title := 'Online Mode Hackathon',
      p_slug := 'online-mode-hck',
      p_description := 'Online event with empty venue',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '5 days',
      p_event_start_at := now() + interval '6 days',
      p_event_end_at := now() + interval '7 days',
      p_min_team_size := 2,
      p_max_team_size := 4,
      p_is_solo_allowed := false
    )
  $$,
  'TS-HCK-04: Online event with empty venue succeeds in draft creation'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-05: Mode/venue offline with empty venue fails at publication time
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_draft_res JSONB;
  v_h_id UUID;
BEGIN
  SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
    p_title := 'Offline Empty Venue Event',
    p_slug := 'offline-empty-venue-test',
    p_description := 'Offline event with empty venue',
    p_organizer := 'CSE Dept',
    p_mode := 'offline',
    p_venue := '',
    p_registration_start_at := now(),
    p_registration_end_at := now() + interval '5 days',
    p_event_start_at := now() + interval '6 days',
    p_event_end_at := now() + interval '7 days'
  ) INTO v_draft_res;

  v_h_id := (v_draft_res->>'id')::uuid;

  -- Add round
  PERFORM public.configure_hackathon_rounds(
    v_h_id,
    jsonb_build_array(
      jsonb_build_object(
        'round_number', 1,
        'name', 'Round 1',
        'start_at', now() + interval '6 days',
        'end_at', now() + interval '7 days',
        'is_final_round', true
      )
    )
  );

  PERFORM set_config('test.offline_empty_venue_id', v_h_id::text, false);
END $$;

SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.offline_empty_venue_id'), 'published'),
  '22023',
  NULL,
  'TS-HCK-05: Offline event without venue fails publication validation'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-06: Reg deadline after event end throws chk_hackathons_reg_deadline_event_end
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
      p_title := 'Invalid Deadline Hackathon',
      p_slug := 'invalid-deadline-hck',
      p_description := 'Deadline after event end',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '10 days',
      p_event_start_at := now() + interval '5 days',
      p_event_end_at := now() + interval '7 days'
    )
  $$,
  '23514', -- check_violation
  NULL,
  'TS-HCK-06: Registration deadline extending beyond event conclusion is rejected'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-07: Round config non-sequential numbers throws sequence error
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_draft_res JSONB;
BEGIN
  SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
    p_title := 'Round Sequence Test Event',
    p_slug := 'round-seq-test',
    p_description := 'Testing round sequence validation',
    p_organizer := 'CSE Dept',
    p_mode := 'online',
    p_venue := '',
    p_registration_start_at := now(),
    p_registration_end_at := now() + interval '5 days',
    p_event_start_at := now() + interval '6 days',
    p_event_end_at := now() + interval '8 days'
  ) INTO v_draft_res;
  PERFORM set_config('test.seq_test_h_id', v_draft_res->>'id', false);
END $$;

SELECT throws_ok(
  format(
    'SELECT public.configure_hackathon_rounds(%L::uuid, %L::jsonb)',
    current_setting('test.seq_test_h_id'),
    '[{"round_number": 2, "name": "Invalid Start", "start_at": "2026-11-01T10:00:00Z", "end_at": "2026-11-02T10:00:00Z", "is_final_round": true}]'
  ),
  '22000',
  NULL,
  'TS-HCK-07: Round config rejects non-sequential round numbers'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-08: Malformed external URL throws chk_hackathons_external_url
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_title := 'XSS URL Event',
      p_slug := 'xss-url-event',
      p_description := 'Testing malformed URL check',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '5 days',
      p_event_start_at := now() + interval '6 days',
      p_event_end_at := now() + interval '7 days',
      p_external_registration_url := 'javascript:alert(1)'
    )
  $$,
  '22023',
  'Invalid argument: external registration URL must be a valid HTTP(S) URL without whitespace.',
  'TS-HCK-08: Malformed external URL violates chk_hackathons_external_url'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-09: Valid external URL succeeds
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_title := 'Valid URL Event',
      p_slug := 'valid-url-event',
      p_description := 'Testing valid URL',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '5 days',
      p_event_start_at := now() + interval '6 days',
      p_event_end_at := now() + interval '7 days',
      p_external_registration_url := 'https://unstop.com/hackathons/example'
    )
  $$,
  'TS-HCK-09: Valid https external URL succeeds'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-10 & TS-HCK-11: Transition to published: with rounds vs with 0 rounds
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_draft_res JSONB;
  v_h_id UUID;
BEGIN
  SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
    p_title := 'Lifecycle Transition Test Event',
    p_slug := 'lifecycle-test-event',
    p_description := 'Testing transitions',
    p_organizer := 'CSE Dept',
    p_mode := 'online',
    p_venue := '',
    p_registration_start_at := now(),
    p_registration_end_at := now() + interval '5 days',
    p_event_start_at := now() + interval '6 days',
    p_event_end_at := now() + interval '8 days'
  ) INTO v_draft_res;
  v_h_id := (v_draft_res->>'id')::uuid;
  PERFORM set_config('test.lifecycle_h_id', v_h_id::text, false);
END $$;

-- TS-HCK-11: 0 rounds fails
SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.lifecycle_h_id'), 'published'),
  '22023',
  NULL,
  'TS-HCK-11: Transitioning to published with 0 configured rounds fails closed'
);

-- Add round and publish (TS-HCK-10)
DO $$
BEGIN
  PERFORM public.configure_hackathon_rounds(
    current_setting('test.lifecycle_h_id')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'round_number', 1,
        'name', 'Ideation Round',
        'start_at', now() + interval '6 days',
        'end_at', now() + interval '7 days',
        'is_final_round', false
      ),
      jsonb_build_object(
        'round_number', 2,
        'name', 'Grand Finale',
        'start_at', now() + interval '7 days',
        'end_at', now() + interval '8 days',
        'is_final_round', true
      )
    )
  );
END $$;

SELECT is(
  (public.transition_hackathon_lifecycle(current_setting('test.lifecycle_h_id')::uuid, 'published')->>'status')::text,
  'published',
  'TS-HCK-10: Transitioning draft with configured rounds to published succeeds'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-12: Transition published to registration_closed sets status
-- ----------------------------------------------------------------------------
SELECT is(
  (public.transition_hackathon_lifecycle(current_setting('test.lifecycle_h_id')::uuid, 'registration_closed')->>'status')::text,
  'registration_closed',
  'TS-HCK-12: Transitioning published hackathon to registration_closed succeeds'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-13: Reopening closed event directly via transition_hackathon_lifecycle is blocked
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.lifecycle_h_id'), 'published'),
  '22023',
  NULL,
  'TS-HCK-13: Direct reopening via lifecycle RPC is blocked; requires deadline override RPC'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-14: Reopening via deadline RPC succeeds and updates status to published
-- ----------------------------------------------------------------------------
SELECT results_eq(
  format('SELECT (public.override_hackathon_deadline(%L::uuid, %L::timestamptz, %L)->>''status'')::text',
    current_setting('test.lifecycle_h_id'),
    (now() + interval '5 days 12 hours')::text,
    'Dean approved registration extension for additional student teams'
  ),
  $$ VALUES ('published') $$,
  'TS-HCK-14: Reopening via override_hackathon_deadline transitions status to published'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-15: Deadline override fails with past timestamp
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.override_hackathon_deadline(%L::uuid, %L::timestamptz, %L)',
    current_setting('test.lifecycle_h_id'),
    (now() - interval '1 hour')::text,
    'Attempting invalid past deadline'
  ),
  '22000',
  NULL,
  'TS-HCK-15: Deadline override rejects past timestamp'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-16: Deadline override fails with short reason (< 5 chars)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.override_hackathon_deadline(%L::uuid, %L::timestamptz, %L)',
    current_setting('test.lifecycle_h_id'),
    (now() + interval '5 days 18 hours')::text,
    'ext'
  ),
  '22023',
  NULL,
  'TS-HCK-16: Deadline override rejects short reason (< 5 characters)'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-17: Deadline override on draft blocked
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
    p_title := 'Draft Deadline Override Test',
    p_slug := 'draft-deadline-override-test',
    p_description := 'Testing draft deadline override',
    p_organizer := 'CSE Dept',
    p_mode := 'online',
    p_venue := '',
    p_registration_start_at := now(),
    p_registration_end_at := now() + interval '5 days',
    p_event_start_at := now() + interval '6 days',
    p_event_end_at := now() + interval '7 days'
  ) INTO v_res;
  PERFORM set_config('test.draft_for_deadline_h_id', v_res->>'id', false);
END $$;

SELECT throws_ok(
  format('SELECT public.override_hackathon_deadline(%L::uuid, %L::timestamptz, %L)',
    current_setting('test.draft_for_deadline_h_id'),
    (now() + interval '6 days')::text,
    'Modifying draft deadline'
  ),
  '55P03',
  NULL,
  'TS-HCK-17: Deadline override on draft event is rejected'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-18: Direct table write blocked on public.hackathons (throws 42501)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$
    INSERT INTO public.hackathons (title, slug, description, organizer, mode, registration_start_at, registration_end_at, event_start_at, event_end_at)
    VALUES ('Bypass Attempt', 'bypass-attempt', 'Direct write', 'Hacker', 'online', now(), now() + interval '1 day', now() + interval '2 days', now() + interval '3 days')
  $$,
  '42501', -- insufficient_privilege
  NULL,
  'TS-HCK-18: Direct INSERT into public.hackathons is revoked and throws 42501'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-19: Student cannot call management RPCs
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000003'::uuid);

SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
      p_title := 'Student Rogue Hackathon',
      p_slug := 'student-rogue-hackathon',
      p_description := 'Student unauthorized creation',
      p_organizer := 'Student',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '1 day',
      p_event_start_at := now() + interval '2 days',
      p_event_end_at := now() + interval '3 days'
    )
  $$,
  '42501',
  'Access denied: manage_hackathons permission required.',
  'TS-HCK-19: Non-admin student cannot invoke create_hackathon_draft'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-20 & TS-HCK-21: Audit logs created on publish and deadline override
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000001'::uuid); -- Super Admin

SELECT results_eq(
  format('SELECT count(*)::integer FROM public.audit_logs WHERE action = %L AND target_id = %L AND details->>''to_status'' = ''published''',
    'hackathon.lifecycle_transitioned',
    current_setting('test.lifecycle_h_id')
  ),
  $$ VALUES (1) $$,
  'TS-HCK-20: Audit log recorded on hackathon publication'
);

SELECT results_eq(
  format('SELECT count(*)::integer FROM public.audit_logs WHERE action = %L AND target_id = %L',
    'hackathon.deadline_overridden',
    current_setting('test.lifecycle_h_id')
  ),
  $$ VALUES (1) $$,
  'TS-HCK-21: Audit log recorded on deadline override with extension change_type'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-22 & TS-HCK-23: Anonymous direct base table SELECT denied
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$ SELECT * FROM public.hackathons $$,
  '42501',
  NULL,
  'TS-HCK-22: Role anon direct SELECT on public.hackathons throws 42501'
);

SELECT throws_ok(
  $$ SELECT * FROM public.hackathon_rounds $$,
  '42501',
  NULL,
  'TS-HCK-23: Role anon direct SELECT on public.hackathon_rounds throws 42501'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-24: Anonymous SELECT on public hackathons view succeeds
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$ SELECT id, title, slug, mode, status FROM public.hackathons_public_view $$,
  'TS-HCK-24: Role anon SELECT on public.hackathons_public_view succeeds'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-25: Anonymous SELECT on public view excludes draft
-- ----------------------------------------------------------------------------
SELECT is_empty(
  format('SELECT id FROM public.hackathons_public_view WHERE id = %L::uuid', current_setting('test.draft_for_deadline_h_id')),
  'TS-HCK-25: Role anon query on public.hackathons_public_view returns 0 rows for draft hackathon'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-26: Anonymous SELECT on public rounds view excludes draft rounds
-- ----------------------------------------------------------------------------
SELECT is_empty(
  format('SELECT id FROM public.hackathon_rounds_public_view WHERE hackathon_id = %L::uuid', current_setting('test.draft_for_deadline_h_id')),
  'TS-HCK-26: Role anon query on public.hackathon_rounds_public_view returns 0 rows for draft hackathon rounds'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-27: Anonymous SELECT on public rounds view permits published
-- ----------------------------------------------------------------------------
SELECT isnt_empty(
  format('SELECT id FROM public.hackathon_rounds_public_view WHERE hackathon_id = %L::uuid', current_setting('test.lifecycle_h_id')),
  'TS-HCK-27: Role anon query on public.hackathon_rounds_public_view returns rows for published hackathon'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-28 to TS-HCK-34: Registration state function evaluations
-- ----------------------------------------------------------------------------
SELECT is(
  public.compute_registration_state('draft', now(), now() + interval '1 day'),
  'DRAFT',
  'TS-HCK-28: compute_registration_state returns DRAFT for draft status'
);

SELECT is(
  public.compute_registration_state('archived', now(), now() + interval '1 day'),
  'ARCHIVED',
  'TS-HCK-29: compute_registration_state returns ARCHIVED for archived status'
);

SELECT is(
  public.compute_registration_state('registration_closed', now(), now() + interval '1 day'),
  'CLOSED',
  'TS-HCK-30: compute_registration_state returns CLOSED for registration_closed status'
);

SELECT is(
  public.compute_registration_state('published', now() + interval '1 day', now() + interval '2 days'),
  'UPCOMING',
  'TS-HCK-31: compute_registration_state returns UPCOMING before registration opens'
);

SELECT is(
  public.compute_registration_state('published', now() - interval '1 day', now() + interval '1 day'),
  'OPEN',
  'TS-HCK-32: compute_registration_state returns OPEN during active registration window'
);

SELECT is(
  public.compute_registration_state('published', now() - interval '1 day', now(), now()),
  'OPEN',
  'TS-HCK-33: compute_registration_state evaluates inclusive boundary (now <= reg_end) as OPEN'
);

SELECT is(
  public.compute_registration_state('published', now() - interval '2 days', now() - interval '1 second'),
  'DEADLINE_PASSED',
  'TS-HCK-34: compute_registration_state returns DEADLINE_PASSED when deadline is in the past'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-35: Revert to draft Super Admin only (ordinary admin throws)
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid); -- Ordinary Admin

SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.lifecycle_h_id'), 'draft'),
  '22023',
  NULL,
  'TS-HCK-35: Ordinary admin cannot unpublish hackathon to draft'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-36: Revert to draft blocked if teams exist
-- ----------------------------------------------------------------------------
-- Switch to postgres to insert fixture team
SET LOCAL ROLE postgres;

INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code)
VALUES (
  '00000000-0000-0000-0000-000000000777',
  current_setting('test.lifecycle_h_id')::uuid,
  'Synthetic Team Alpha',
  '00000000-0000-0000-0000-000000000003',
  'SYN777'
);

-- Switch to Super Admin
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000001'::uuid);

SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.lifecycle_h_id'), 'draft'),
  '22023',
  NULL,
  'TS-HCK-36: Super Admin cannot unpublish hackathon when registered teams exist'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-37: Deactivated admin denied management RPCs
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000061'::uuid); -- Inactive Admin

SELECT throws_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
      p_title := 'Deactivated Admin Hackathon',
      p_slug := 'deactivated-admin-hackathon',
      p_description := 'Should fail due to inactive account',
      p_organizer := 'CSE Dept',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '1 day',
      p_event_start_at := now() + interval '2 days',
      p_event_end_at := now() + interval '3 days'
    )
  $$,
  '42501',
  NULL,
  'TS-HCK-37: Deactivated admin is denied management RPC access'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-38: Round deletion blocked if submission exists
-- ----------------------------------------------------------------------------
-- Switch to postgres to insert fixture submission
SET LOCAL ROLE postgres;

DO $$
DECLARE
  v_round1_id UUID;
BEGIN
  SELECT id INTO v_round1_id
  FROM public.hackathon_rounds
  WHERE hackathon_id = current_setting('test.lifecycle_h_id')::uuid AND round_number = 1;

  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, title, repo_url, status
  ) VALUES (
    '00000000-0000-0000-0000-000000000888',
    current_setting('test.lifecycle_h_id')::uuid,
    v_round1_id,
    '00000000-0000-0000-0000-000000000777',
    '00000000-0000-0000-0000-000000000003',
    'Project Alpha Pitch',
    'https://github.com/nmit/alpha',
    'submitted'
  );
END $$;

-- Switch to Super Admin
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000001'::uuid);

-- Attempt to delete round 1 by passing only round 2
SELECT throws_ok(
  format(
    'SELECT public.configure_hackathon_rounds(%L::uuid, %L::jsonb)',
    current_setting('test.lifecycle_h_id'),
    '[{"round_number": 1, "name": "Sole Remaining Round", "start_at": "2026-11-01T10:00:00Z", "end_at": "2026-11-02T10:00:00Z", "is_final_round": true}]'
  ),
  '55P03',
  NULL,
  'TS-HCK-38: Deleting a round with active submissions is blocked'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-39: Archived hackathon rejects round edit
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
    p_title := 'Event To Archive',
    p_slug := 'event-to-archive',
    p_description := 'Will be archived',
    p_organizer := 'CSE Dept',
    p_mode := 'online',
    p_venue := '',
    p_registration_start_at := now(),
    p_registration_end_at := now() + interval '1 day',
    p_event_start_at := now() + interval '2 days',
    p_event_end_at := now() + interval '3 days'
  ) INTO v_res;

  PERFORM set_config('test.archived_h_id', v_res->>'id', false);

  PERFORM public.configure_hackathon_rounds(
    (v_res->>'id')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'round_number', 1,
        'name', 'Round 1',
        'start_at', now() + interval '2 days',
        'end_at', now() + interval '3 days',
        'is_final_round', true
      )
    )
  );

  -- Publish and then archive prematurely
  PERFORM public.transition_hackathon_lifecycle((v_res->>'id')::uuid, 'published');
  PERFORM public.transition_hackathon_lifecycle((v_res->>'id')::uuid, 'archived', 'Valid institutional cancellation reason');
END $$;

SELECT throws_ok(
  format(
    'SELECT public.configure_hackathon_rounds(%L::uuid, %L::jsonb)',
    current_setting('test.archived_h_id'),
    '[{"round_number": 1, "name": "Edit on Archived", "start_at": "2026-11-01T10:00:00Z", "end_at": "2026-11-02T10:00:00Z", "is_final_round": true}]'
  ),
  '55P03',
  NULL,
  'TS-HCK-39: configure_hackathon_rounds rejects edits on archived hackathons'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-40: Super Admin implicit authority verified
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  $$
    SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
      p_title := 'Super Admin Authority Event',
      p_slug := 'superadmin-authority-event',
      p_description := 'Implicit authority test',
      p_organizer := 'NMIT Principal Office',
      p_mode := 'online',
      p_venue := '',
      p_registration_start_at := now(),
      p_registration_end_at := now() + interval '2 days',
      p_event_start_at := now() + interval '3 days',
      p_event_end_at := now() + interval '4 days'
    )
  $$,
  'TS-HCK-40: Super Admin without explicit permission row can create hackathon drafts'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-41: Draft cannot transition to closed
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.draft_for_deadline_h_id'), 'registration_closed'),
  '22023',
  NULL,
  'TS-HCK-41: Transitioning draft to registration_closed is rejected'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-42: Draft cannot transition to archived
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.draft_for_deadline_h_id'), 'archived', 'Archiving test event early'),
  '22023',
  NULL,
  'TS-HCK-42: Transitioning draft to archived is rejected'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-43: Closed cannot revert to draft
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT public.create_hackathon_draft(
      p_external_registration_url := 'https://example.com/register',
    p_title := 'Closed Revert Test',
    p_slug := 'closed-revert-test',
    p_description := 'Testing closed to draft rejection',
    p_organizer := 'CSE Dept',
    p_mode := 'online',
    p_venue := '',
    p_registration_start_at := now(),
    p_registration_end_at := now() + interval '1 day',
    p_event_start_at := now() + interval '2 days',
    p_event_end_at := now() + interval '3 days'
  ) INTO v_res;

  PERFORM set_config('test.closed_revert_h_id', v_res->>'id', false);

  PERFORM public.configure_hackathon_rounds(
    (v_res->>'id')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'round_number', 1,
        'name', 'Round 1',
        'start_at', now() + interval '2 days',
        'end_at', now() + interval '3 days',
        'is_final_round', true
      )
    )
  );

  PERFORM public.transition_hackathon_lifecycle((v_res->>'id')::uuid, 'published');
  PERFORM public.transition_hackathon_lifecycle((v_res->>'id')::uuid, 'registration_closed');
END $$;

SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.closed_revert_h_id'), 'draft'),
  '22023',
  NULL,
  'TS-HCK-43: Closed hackathon cannot revert to draft'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-44: Archived cannot transition anywhere
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L)', current_setting('test.archived_h_id'), 'published'),
  '55P03',
  NULL,
  'TS-HCK-44: Archived hackathons are strictly immutable'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-45: Idempotent transition produces no audit log
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_audit_count_before INTEGER;
  v_audit_count_after INTEGER;
BEGIN
  SELECT count(*) INTO v_audit_count_before
  FROM public.audit_logs
  WHERE target_id = current_setting('test.archived_h_id');

  PERFORM public.transition_hackathon_lifecycle(current_setting('test.archived_h_id')::uuid, 'archived', 'Archiving test event early');

  SELECT count(*) INTO v_audit_count_after
  FROM public.audit_logs
  WHERE target_id = current_setting('test.archived_h_id');

  IF v_audit_count_before <> v_audit_count_after THEN
    RAISE EXCEPTION 'Idempotent transition produced audit log: before=%, after=%', v_audit_count_before, v_audit_count_after;
  END IF;
END $$;

SELECT pass('TS-HCK-45: Idempotent transition returns clean no-op with zero audit logs');

-- ----------------------------------------------------------------------------
-- TS-HCK-46: Foreign round ID rejected in round config
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.configure_hackathon_rounds(%L::uuid, %L::jsonb)',
    current_setting('test.seq_test_h_id'),
    jsonb_build_array(
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000000000999',
        'round_number', 1,
        'name', 'Round with Foreign ID',
        'start_at', '2026-11-01T10:00:00Z',
        'end_at', '2026-11-02T10:00:00Z',
        'is_final_round', true
      )
    )
  ),
  '22023',
  NULL,
  'TS-HCK-46: Foreign round ID not belonging to hackathon is rejected'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-47: Event date update outside round window rejected
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
      p_event_start_at := (now() + interval ''5 days 1 hour'')::timestamptz,
      p_event_end_at := (now() + interval ''5 days 2 hours'')::timestamptz,
      p_min_team_size := 2,
      p_max_team_size := 4,
      p_is_solo_allowed := false,
      p_eligibility := %L,
      p_prizes_summary := %L,
      p_prizes_detail := %L::jsonb,
      p_external_registration_url := %L,
      p_community_url := %L
    )',
    current_setting('test.lifecycle_h_id'),
    'Lifecycle Test Event',
    'lifecycle-test-event',
    '',
    'Updated description',
    'CSE Dept',
    'online',
    '',
    'All students',
    '',
    '[]'::text,
    '',
    ''
  ),
  '22000',
  NULL,
  'TS-HCK-47: Updating event window to exclude existing configured rounds is rejected'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-48: Deadline override on archived rejected
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format('SELECT public.override_hackathon_deadline(%L::uuid, %L::timestamptz, %L)',
    current_setting('test.archived_h_id'),
    (now() + interval '5 days')::text,
    'Attempting override on archived'
  ),
  '55P03',
  NULL,
  'TS-HCK-48: Deadline override on archived event is rejected'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-49: Round config rejects duplicate round IDs
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    'SELECT public.configure_hackathon_rounds(%L::uuid, %L::jsonb)',
    current_setting('test.seq_test_h_id'),
    jsonb_build_array(
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000000000888',
        'round_number', 1,
        'name', 'Round 1',
        'start_at', '2026-11-01T10:00:00Z',
        'end_at', '2026-11-02T10:00:00Z',
        'is_final_round', false
      ),
      jsonb_build_object(
        'id', '00000000-0000-0000-0000-000000000888',
        'round_number', 2,
        'name', 'Round 2',
        'start_at', '2026-11-02T10:00:00Z',
        'end_at', '2026-11-03T10:00:00Z',
        'is_final_round', true
      )
    )
  ),
  '22023',
  NULL,
  'TS-HCK-49: Duplicate round IDs in configure_hackathon_rounds payload are rejected'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-50: Premature archival requires Super Admin and justification >= 5 chars
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid); -- Ordinary Admin

SELECT throws_ok(
  format('SELECT public.transition_hackathon_lifecycle(%L::uuid, %L, %L)',
    current_setting('test.lifecycle_h_id'),
    'archived',
    'Ordinary admin premature archival attempt'
  ),
  '42501',
  NULL,
  'TS-HCK-50: Ordinary admin cannot prematurely archive active event'
);

SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000001'::uuid); -- Super Admin

SELECT pass('TS-HCK-53: published events are intentionally visible to signed-in students (status <> draft)');

-- ----------------------------------------------------------------------------
-- TS-HCK-54 & TS-HCK-55: Public views exclude private columns
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT created_by FROM public.hackathons_public_view $$,
  '42703', -- undefined_column
  NULL,
  'TS-HCK-54: public.hackathons_public_view strictly omits private column created_by'
);

SELECT throws_ok(
  $$ SELECT created_at FROM public.hackathon_rounds_public_view $$,
  '42703', -- undefined_column
  NULL,
  'TS-HCK-55: public.hackathon_rounds_public_view strictly omits private audit timestamp created_at'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-56: Authorized admin base table SELECT includes drafts and created_by
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid); -- Authorized Admin

SELECT isnt_empty(
  $$ SELECT id, created_by, status FROM public.hackathons WHERE status = 'draft' $$,
  'TS-HCK-56: Authorized admin can read base table hackathons including drafts and created_by'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-57: Direct mutation on public views rejected
-- ----------------------------------------------------------------------------
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$
    INSERT INTO public.hackathons_public_view (title, slug, mode, status)
    VALUES ('Rogue View Insert', 'rogue-view-insert', 'online', 'published')
  $$,
  '42501', -- insufficient_privilege
  NULL,
  'TS-HCK-57: Direct mutation on public.hackathons_public_view is revoked and throws 42501'
);

-- ----------------------------------------------------------------------------
-- TS-HCK-58: Deadline override rejects identical deadline
-- ----------------------------------------------------------------------------
SELECT public.test_authenticate_as('00000000-0000-0000-0000-000000000060'::uuid);

DO $$
DECLARE
  v_cur_deadline TIMESTAMPTZ;
  v_audit_count_before INTEGER;
  v_audit_count_after INTEGER;
BEGIN
  SELECT registration_end_at INTO v_cur_deadline
  FROM public.hackathons
  WHERE id = current_setting('test.lifecycle_h_id')::uuid;

  SELECT count(*) INTO v_audit_count_before
  FROM public.audit_logs
  WHERE target_id = current_setting('test.lifecycle_h_id') AND action = 'hackathon.deadline_overridden';

  BEGIN
    PERFORM public.override_hackathon_deadline(
      current_setting('test.lifecycle_h_id')::uuid,
      v_cur_deadline,
      'Attempting identical deadline override'
    );
    RAISE EXCEPTION 'TS-HCK-58 failed: identical deadline override should have been rejected.';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%identical to the current deadline%' THEN
        RAISE EXCEPTION 'Unexpected error on identical deadline: %', SQLERRM;
      END IF;
  END;

  SELECT count(*) INTO v_audit_count_after
  FROM public.audit_logs
  WHERE target_id = current_setting('test.lifecycle_h_id') AND action = 'hackathon.deadline_overridden';

  IF v_audit_count_before <> v_audit_count_after THEN
    RAISE EXCEPTION 'Identical deadline override generated false audit log: before=%, after=%', v_audit_count_before, v_audit_count_after;
  END IF;
END $$;

SELECT pass('TS-HCK-58: override_hackathon_deadline rejects unchanged deadline fail-closed without table mutation or false audit log');

-- ============================================================================
-- Complete Test Suite & Rollback
-- ============================================================================
SELECT * FROM finish();
ROLLBACK;
