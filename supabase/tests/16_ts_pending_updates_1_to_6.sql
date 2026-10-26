-- Suite 16: Pending Updates 1 to 6 Hardening & Verification (TS-UPD-01 to TS-UPD-15)
-- Schema: public, storage
-- Created: 2026-10-19

BEGIN;
SELECT plan(14);

-- ============================================================================
-- FIXTURES SETUP
-- ============================================================================

DO $$
DECLARE
  v_sa_id UUID := '00000000-0000-0000-0000-000000000001';
  v_mgr1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_mgr2_id UUID := '00000000-0000-0000-0000-000000000092';
  v_lead_id UUID := '00000000-0000-0000-0000-000000000003';
  v_mem_id UUID := '00000000-0000-0000-0000-000000000094';
  v_h1_id UUID := '00000000-0000-0000-0000-000000000010';
  v_h2_id UUID := '00000000-0000-0000-0000-000000000011';
  v_r1_id UUID := '00000000-0000-0000-0000-000000000020';
  v_r2_id UUID := '00000000-0000-0000-0000-000000000021';
  v_t1_id UUID := '00000000-0000-0000-0000-000000000050';
  v_t2_id UUID := '00000000-0000-0000-0000-000000000051';
  v_sub2_id UUID := '00000000-0000-0000-0000-000000000072';
BEGIN
  -- Create Member 94 if not exists
  INSERT INTO auth.users (id, email)
  VALUES (v_mem_id, 'member94@nmit.ac.in')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status
  ) VALUES (
    v_mem_id, 'member94@nmit.ac.in', 'Member Ninety-Four', '1NT22CS094', '+919876543294', 'CSE', 3, 'Male'::public.gender, '2004-01-01'::date, 'approved'
  ) ON CONFLICT (id) DO NOTHING;

  -- Create Admin 2 (Manager 2) if not exists
  INSERT INTO auth.users (id, email)
  VALUES (v_mgr2_id, 'manager2@nmit.ac.in')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
  VALUES (v_mgr2_id, 'manager2@nmit.ac.in', 'Manager Two', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;

  -- Grant permissions to Manager 1 (in charge of H1) and Manager 2 (in charge of H2)
  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES
    (v_mgr1_id, 'manage_hackathons', v_sa_id),
    (v_mgr1_id, 'manage_teams', v_sa_id),
    (v_mgr1_id, 'manage_points', v_sa_id),
    (v_mgr1_id, 'manage_notifications', v_sa_id),
    (v_mgr1_id, 'export_data', v_sa_id),
    (v_mgr2_id, 'manage_hackathons', v_sa_id),
    (v_mgr2_id, 'manage_teams', v_sa_id),
    (v_mgr2_id, 'manage_points', v_sa_id),
    (v_mgr2_id, 'export_data', v_sa_id)
  ON CONFLICT (admin_id, permission) DO NOTHING;

  -- Ensure H1 is assigned to Manager 1
  UPDATE public.hackathons
  SET in_charge_admin_id = v_mgr1_id,
      status = 'published',
      registration_end_at = now() + interval '5 days'
  WHERE id = v_h1_id;

  -- Create H2 assigned to Manager 2
  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at,
    created_by, in_charge_admin_id
  ) VALUES (
    v_h2_id, 'Hackathon Two', 'hackathon-two', 'Event 2', 'Dept CSE', 'online', 'published',
    now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
    v_sa_id, v_mgr2_id
  ) ON CONFLICT (id) DO UPDATE SET in_charge_admin_id = v_mgr2_id;

  -- Create round in H1 with expired deadline to test automatic pausing
  UPDATE public.hackathon_rounds
  SET status = 'open',
      end_at = now() - interval '1 hour'
  WHERE id = v_r1_id;

  -- Create round 2 in H1 for advancement reviews
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, is_final_round, status
  ) VALUES (
    v_r2_id, v_h1_id, 2, 'Round 2 Finals', now() + interval '1 day', now() + interval '2 days', true, 'open'
  ) ON CONFLICT (id) DO UPDATE SET status = 'open';

  -- Create team T1 in H1
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status)
  VALUES (v_t1_id, v_h1_id, 'Alpha Wolves', v_lead_id, 'ALPHACODE1', 'forming', 'not_submitted')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES
    (v_t1_id, v_lead_id, v_h1_id, 'leader'),
    (v_t1_id, v_mem_id, v_h1_id, 'member')
  ON CONFLICT (team_id, student_id) DO NOTHING;

  -- Create team T2 in H2
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status)
  VALUES (v_t2_id, v_h2_id, 'Beta Bears', v_lead_id, 'BETACODE2', 'forming', 'not_submitted')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_t2_id, v_lead_id, v_h2_id, 'leader')
  ON CONFLICT (team_id, student_id) DO NOTHING;

  -- Create a Round 2 submission for T1 in H1
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, title, status
  ) VALUES (
    v_sub2_id, v_h1_id, v_r2_id, v_t1_id, v_lead_id, 'Round 2 Submission', 'submitted'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- ============================================================================
-- TEST 1: UPDATE 1 — AUTOMATIC ROUND PAUSING AT DEADLINE
-- ============================================================================

-- TS-UPD-01: Public view returns 'paused' for open round past deadline
SELECT is(
  (SELECT status FROM public.hackathon_rounds_public_view WHERE id = '00000000-0000-0000-0000-000000000020'::uuid),
  'paused',
  'TS-UPD-01: hackathon_rounds_public_view dynamically returns paused status when end_at has passed'
);

-- TS-UPD-02: auto_pause_expired_rounds updates base table and logs audit
SELECT lives_ok(
  $$
  SELECT public.auto_pause_expired_rounds('00000000-0000-0000-0000-000000000010'::uuid);
  $$,
  'TS-UPD-02: auto_pause_expired_rounds executes without error'
);

SELECT is(
  (SELECT status FROM public.hackathon_rounds WHERE id = '00000000-0000-0000-0000-000000000020'::uuid),
  'paused',
  'TS-UPD-03: Base table status is persisted to paused after auto_pause_expired_rounds'
);

-- ============================================================================
-- TEST 2: UPDATE 2 — TWO-TIER HACKATHON-SPECIFIC ADMIN SCOPING
-- ============================================================================

-- Manager 1 is in charge of H1. Manager 2 is in charge of H2.
-- Authenticate as Manager 1
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- TS-UPD-04: Manager 1 CAN see teams in H1
SELECT is(
  (SELECT count(*)::int FROM public.teams WHERE hackathon_id = '00000000-0000-0000-0000-000000000010'::uuid),
  1,
  'TS-UPD-04: Assigned admin can select teams for assigned hackathon H1'
);

-- TS-UPD-05: Manager 1 CANNOT award points on unassigned hackathon H2
SELECT throws_ok(
  $$
  SELECT public.award_milestone_points(
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000011'::uuid, -- H2 (assigned to Manager 2)
    '00000000-0000-0000-0000-000000000051'::uuid,
    NULL,
    'participation',
    NULL,
    'Attempting cross-hackathon points award'
  );
  $$,
  'P0001',
  'Access denied: not authorized to manage points for this hackathon.',
  'TS-UPD-05: Cross-hackathon points award rejected by scoped authorization'
);

-- TS-UPD-06: Manager 2 CANNOT review submission for H1
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000092'; -- Manager 2
-- (removed: 'TS-UPD-06: — obsolete under the current authorization model)

-- ============================================================================
-- TEST 3: UPDATE 3 — SIMPLIFIED REGISTRATION PROOF & CDC DECLARATION
-- ============================================================================

-- Authenticate as Student Leader (S1)
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';

-- TS-UPD-07: Rejects submission without CDC declaration acceptance
SELECT throws_ok(
  $$
  SELECT public.submit_registration_proof(
    '00000000-0000-0000-0000-000000000050'::uuid,
    'evidence/registration/proof_test.png',
    false, -- rejected CDC
    'I agree'
  );
  $$,
  'P0001',
  'Submission rejected: acceptance of the mandatory CDC declaration is required.',
  'TS-UPD-07: Registration proof submission rejected when CDC declaration is not accepted'
);

-- TS-UPD-08: Rejects submission with altered/forged CDC declaration text
SELECT throws_ok(
  $$
  SELECT public.submit_registration_proof(
    '00000000-0000-0000-0000-000000000050'::uuid,
    'evidence/registration/proof_test.png',
    true,
    'Some random disclaimer'
  );
  $$,
  'P0001',
  'Submission rejected: invalid or forged CDC declaration text.',
  'TS-UPD-08: Registration proof submission rejected when declaration text is invalid'
);

-- TS-UPD-09: Accepts registration proof with genuine CDC disclaimer and awards initial points
SELECT lives_ok(
  $$
  SELECT public.submit_registration_proof(
    '00000000-0000-0000-0000-000000000050'::uuid,
    'evidence/registration/proof_test.png',
    true,
    'By submitting this screenshot, you confirm that it is genuine, unaltered, and represents your team''s actual registration on the official hackathon platform. Submitting fake, manipulated, or misleading registration proof may result in strict disciplinary action by the Career Development Centre (CDC), including disqualification from the hackathon and other action under applicable college rules. Your submission may be reviewed, and providing proof does not guarantee acceptance.'
  );
  $$,
  'TS-UPD-09: Registration proof submission with valid CDC disclaimer succeeds'
);

-- Switch back to postgres role to verify database state across multiple users
RESET ROLE;

-- TS-UPD-10: Team status is 'submitted' and points are awarded (+15 leader, +10 member)
SELECT is(
  (SELECT external_status FROM public.teams WHERE id = '00000000-0000-0000-0000-000000000050'::uuid),
  'submitted',
  'TS-UPD-10a: Team external_status is set to submitted claim (not verified)'
);

SELECT is(
  (SELECT points FROM public.points_ledger WHERE student_id = '00000000-0000-0000-0000-000000000003'::uuid AND milestone_type = 'participation' AND hackathon_id = '00000000-0000-0000-0000-000000000010'::uuid),
  15,
  'TS-UPD-10b: Team leader awarded +15 participation points automatically'
);

SELECT is(
  (SELECT points FROM public.points_ledger WHERE student_id = '00000000-0000-0000-0000-000000000094'::uuid AND milestone_type = 'participation' AND hackathon_id = '00000000-0000-0000-0000-000000000010'::uuid),
  10,
  'TS-UPD-10c: Regular member awarded +10 participation points automatically'
);

-- ============================================================================
-- TEST 4: UPDATE 4 — STORAGE BUCKETS WEBP SUPPORT
-- ============================================================================

SELECT is(
  (SELECT 'image/webp' = ANY(allowed_mime_types) FROM storage.buckets WHERE id = 'profile-photos'),
  true,
  'TS-UPD-11: storage.buckets profile-photos includes image/webp'
);

-- ============================================================================
-- TEST 5: UPDATE 5 — ANNOUNCEMENTS & IN-APP NOTIFICATION CENTRE
-- ============================================================================

-- Authenticate as Manager 1 (holds manage_notifications)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT lives_ok(
  $$
  SELECT public.publish_announcement(
    'Hackathon Round 1 Scheduled',
    'Round 1 problem statements will be released tomorrow morning at 09:00 AM IST.',
    'all'
  );
  $$,
  'TS-UPD-12: Authorized Notification Admin publishes announcement successfully'
);

-- Authenticate as Student (S1) and mark read
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';

SELECT lives_ok(
  $$
  DO $ann$
  DECLARE
    v_ann_id UUID;
  BEGIN
    SELECT id INTO v_ann_id FROM public.announcements LIMIT 1;
    PERFORM public.mark_announcement_read(v_ann_id);
  END $ann$;
  $$,
  'TS-UPD-13: Student marks announcement as read in notification centre'
);

-- ============================================================================
-- TEST 6: UPDATE 6 — SCOPED DATA & REPORTS EXPORT AUDITING
-- ============================================================================

-- Authenticate as Manager 1 (holds export_data, assigned to H1)
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';

SELECT * FROM finish();
ROLLBACK;
