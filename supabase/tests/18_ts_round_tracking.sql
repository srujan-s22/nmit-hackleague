-- Suite 18: Phase 8 — Round Tracking, Evidence Review & Storage Retention Lifecycle
-- Authoritative Specification: PHASE_08_IMPLEMENTATION_PLAN.md v1.1.4

BEGIN;
SELECT plan(44);

-- ============================================================================
-- FIXTURES SETUP
-- ============================================================================

DO $$
DECLARE
  v_sa_id UUID := '00000000-0000-0000-0000-000000000001';
  v_mgr1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_mgr2_id UUID := '00000000-0000-0000-0000-000000000092';
  v_s1_id UUID := '00000000-0000-0000-0000-000000000003';
  v_s2_id UUID := '00000000-0000-0000-0000-000000000004';
  v_s3_id UUID := '00000000-0000-0000-0000-000000000094';
  v_s4_id UUID := '00000000-0000-0000-0000-000000000095';
  v_h1_id UUID := '00000000-0000-0000-0000-000000000010';
  v_h_exp_id UUID := '00000000-0000-0000-0000-000000000012';
  v_r1_id UUID := '00000000-0000-0000-0000-000000000020';
  v_r2_id UUID := '00000000-0000-0000-0000-000000000021';
  v_r_paused_id UUID := '00000000-0000-0000-0000-000000000022';
  v_r_exp_id UUID := '00000000-0000-0000-0000-000000000023';
  v_r_sched_id UUID := '00000000-0000-0000-0000-000000000024';
  v_r_comp_id UUID := '00000000-0000-0000-0000-000000000025';
  v_r_exp_h_id UUID := '00000000-0000-0000-0000-000000000029';
  v_t1_id UUID := '00000000-0000-0000-0000-000000000050';
  v_t2_id UUID := '00000000-0000-0000-0000-000000000051';
  v_t_unreg_id UUID := '00000000-0000-0000-0000-000000000052';
  v_t_exp_h_id UUID := '00000000-0000-0000-0000-000000000059';
BEGIN
  -- Ensure student profiles exist
  INSERT INTO auth.users (id, email)
  VALUES
    (v_s3_id, 'member94@nmit.ac.in'),
    (v_s4_id, 'student95@nmit.ac.in')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status
  ) VALUES
    (v_s3_id, 'member94@nmit.ac.in', 'Member Ninety-Four', '1NT22CS094', '+919876543294', 'CSE', 3, 'Male'::public.gender, '2004-01-01'::date, 'approved'),
    (v_s4_id, 'student95@nmit.ac.in', 'Student Ninety-Five', '1NT22CS095', '+919876543295', 'CSE', 3, 'Female'::public.gender, '2004-02-02'::date, 'approved')
  ON CONFLICT (id) DO UPDATE SET registration_status = 'approved';

  -- Ensure Admin 1 (Manager 1) exists, is active, and has required permissions
  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
  VALUES (v_mgr1_id, 'manager1@nmit.ac.in', 'Manager One', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;

  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES
    (v_mgr1_id, 'manage_hackathons', v_sa_id),
    (v_mgr1_id, 'manage_teams', v_sa_id),
    (v_mgr1_id, 'manage_points', v_sa_id)
  ON CONFLICT (admin_id, permission) DO NOTHING;

  -- 1. Ensure Hackathon 1 exists, active and managed by Manager 1
  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, registration_start_at, registration_end_at,
    event_start_at, event_end_at, status, min_team_size, max_team_size, is_solo_allowed, in_charge_admin_id, created_by
  ) VALUES (
    v_h1_id, 'Phase 8 Active Hackathon', 'phase-8-active', 'Event Description', 'Dept CSE', 'online', now() - interval '5 days', now() - interval '3 days',
    now() - interval '2 days', now() + interval '5 days', 'ongoing', 1, 4, true, v_mgr1_id, v_sa_id
  ) ON CONFLICT (id) DO UPDATE SET
    status = 'ongoing',
    registration_start_at = now() - interval '5 days',
    registration_end_at = now() - interval '3 days',
    event_start_at = now() - interval '2 days',
    event_end_at = now() + interval '5 days',
    in_charge_admin_id = v_mgr1_id;

  -- Ensure Hackathon Expired exists (ended 10 days ago, eligible for retention)
  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, registration_start_at, registration_end_at,
    event_start_at, event_end_at, status, min_team_size, max_team_size, is_solo_allowed, in_charge_admin_id, created_by
  ) VALUES (
    v_h_exp_id, 'Phase 8 Expired Hackathon', 'phase-8-expired', 'Expired Event Description', 'Dept CSE', 'online', now() - interval '25 days', now() - interval '22 days',
    now() - interval '20 days', now() - interval '10 days', 'completed', 1, 4, true, v_mgr1_id, v_sa_id
  ) ON CONFLICT (id) DO UPDATE SET
    status = 'completed',
    registration_start_at = now() - interval '25 days',
    registration_end_at = now() - interval '22 days',
    event_start_at = now() - interval '20 days',
    event_end_at = now() - interval '10 days',
    in_charge_admin_id = v_mgr1_id;

  -- 2. Create Rounds in Hackathon 1:
  -- R1: Open round (round 1)
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status, is_final_round
  ) VALUES (
    v_r1_id, v_h1_id, 1, 'Round 1 Open', now() - interval '1 day', now() + interval '2 days', 'open', false
  ) ON CONFLICT (id) DO UPDATE SET status = 'open', start_at = now() - interval '1 day', end_at = now() + interval '2 days';

  -- R2: Round 2 (open, final round)
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status, is_final_round
  ) VALUES (
    v_r2_id, v_h1_id, 2, 'Round 2 Final', now() - interval '1 day', now() + interval '2 days', 'open', true
  ) ON CONFLICT (id) DO UPDATE SET status = 'open', start_at = now() - interval '1 day', end_at = now() + interval '2 days', is_final_round = true;

  -- Paused round
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status
  ) VALUES (
    v_r_paused_id, v_h1_id, 3, 'Round 3 Paused', now() - interval '1 day', now() + interval '2 days', 'paused'
  ) ON CONFLICT (id) DO UPDATE SET status = 'paused';

  -- Expired deadline round
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status
  ) VALUES (
    v_r_exp_id, v_h1_id, 4, 'Round 4 Expired', now() - interval '3 days', now() - interval '1 hour', 'open'
  ) ON CONFLICT (id) DO UPDATE SET status = 'open', end_at = now() - interval '1 hour';

  -- Scheduled round
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status
  ) VALUES (
    v_r_sched_id, v_h1_id, 5, 'Round 5 Scheduled', now() + interval '1 day', now() + interval '3 days', 'scheduled'
  ) ON CONFLICT (id) DO UPDATE SET status = 'scheduled', start_at = now() + interval '1 day';

  -- Completed round
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status
  ) VALUES (
    v_r_comp_id, v_h1_id, 6, 'Round 6 Completed', now() - interval '4 days', now() - interval '2 days', 'completed'
  ) ON CONFLICT (id) DO UPDATE SET status = 'completed';

  -- Round in Expired Hackathon
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status
  ) VALUES (
    v_r_exp_h_id, v_h_exp_id, 1, 'Round 1 Expired Event', now() - interval '20 days', now() - interval '10 days', 'completed'
  ) ON CONFLICT (id) DO UPDATE SET status = 'completed';

  -- 3. Teams:
  -- Team 1: Leader is S1, registered
  INSERT INTO public.teams (
    id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status
  ) VALUES (
    v_t1_id, v_h1_id, 'Team 1 Active', v_s1_id, 'INVITE-T1-P8', 'complete', 'submitted'
  ) ON CONFLICT (id) DO UPDATE SET external_status = 'submitted', leader_id = v_s1_id;

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES
    (v_t1_id, v_s1_id, v_h1_id, 'leader'),
    (v_t1_id, v_s2_id, v_h1_id, 'member')
  ON CONFLICT (team_id, student_id) DO NOTHING;

  -- Team 2: Leader is S3, registered
  INSERT INTO public.teams (
    id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status
  ) VALUES (
    v_t2_id, v_h1_id, 'Team 2 Active', v_s3_id, 'INVITE-T2-P8', 'complete', 'submitted'
  ) ON CONFLICT (id) DO UPDATE SET external_status = 'submitted', leader_id = v_s3_id;

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_t2_id, v_s3_id, v_h1_id, 'leader')
  ON CONFLICT (team_id, student_id) DO NOTHING;

  -- Team Unregistered (not_submitted)
  INSERT INTO public.teams (
    id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status
  ) VALUES (
    v_t_unreg_id, v_h1_id, 'Team Unregistered', v_s1_id, 'INVITE-TU-P8', 'complete', 'not_submitted'
  ) ON CONFLICT (id) DO UPDATE SET external_status = 'not_submitted';

  -- Team in Expired Hackathon
  INSERT INTO public.teams (
    id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status
  ) VALUES (
    v_t_exp_h_id, v_h_exp_id, 'Team Expired Active', v_s1_id, 'INVITE-TE-P8', 'complete', 'submitted'
  ) ON CONFLICT (id) DO UPDATE SET external_status = 'submitted', leader_id = v_s1_id;

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_t_exp_h_id, v_s1_id, v_h_exp_id, 'leader')
  ON CONFLICT (team_id, student_id) DO NOTHING;

  -- Storage objects:
  -- Add a dummy storage object for team 1 round 1
  INSERT INTO storage.objects (
    id, bucket_id, name, owner, metadata
  ) VALUES (
    '00000000-0000-0000-0000-000000000101',
    'submission-evidence',
    'teams/' || v_t1_id::text || '/rounds/' || v_r1_id::text || '/00000000-0000-0000-0000-000000000101.png',
    v_s1_id,
    '{"size": 1024, "mimetype": "image/png"}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- Add a dummy registration proof object for team 1 (Phase 7 regression check)
  INSERT INTO storage.objects (
    id, bucket_id, name, owner, metadata
  ) VALUES (
    '00000000-0000-0000-0000-000000000102',
    'submission-evidence',
    'teams/' || v_t1_id::text || '/registration/proof.png',
    v_s1_id,
    '{"size": 1024, "mimetype": "image/png"}'::jsonb
  ) ON CONFLICT (id) DO NOTHING;

  -- Add intent for this object
  INSERT INTO public.evidence_validation_intents (
    id, hackathon_id, round_id, team_id, object_path, sha256_hash, file_size_bytes, mime_type, status, created_by, expires_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000201',
    v_h1_id,
    v_r1_id,
    v_t1_id,
    'teams/' || v_t1_id::text || '/rounds/' || v_r1_id::text || '/00000000-0000-0000-0000-000000000101.png',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    1024,
    'image/png',
    'pending',
    v_s1_id,
    now() + interval '15 minutes'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- ============================================================================
-- TESTS 1-5: SUBMISSION RPC BOUNDARY GUARDS
-- ============================================================================

-- TS-RND-01: Non-leader denied (Student 2 is regular member)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004';
SELECT throws_ok(
  $$
  SELECT public.submit_round_milestone(
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000050',
    'Milestone by Member'
  );
  $$,
  '42501',
  NULL,
  'TS-RND-01: Non-leader student is denied milestone submission'
);

-- TS-RND-02: Unregistered team denied
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SELECT throws_ok(
  $$
  SELECT public.submit_round_milestone(
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000052',
    'Milestone by Unregistered'
  );
  $$,
  '22023',
  NULL,
  'TS-RND-02: Unregistered team is denied milestone submission'
);

-- TS-RND-03: Paused round denied
SELECT throws_ok(
  $$
  SELECT public.submit_round_milestone(
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000050',
    'Milestone on Paused'
  );
  $$,
  '55P03',
  NULL,
  'TS-RND-03: Submission on paused round is denied'
);

-- TS-RND-04: Past-deadline round denied
SELECT throws_ok(
  $$
  SELECT public.submit_round_milestone(
    '00000000-0000-0000-0000-000000000023',
    '00000000-0000-0000-0000-000000000050',
    'Milestone on Expired'
  );
  $$,
  '55P03',
  NULL,
  'TS-RND-04: Submission on expired round is denied'
);

-- TS-RND-05a: Unqualified round 2 submission denied
SELECT throws_ok(
  $$
  SELECT public.submit_round_milestone(
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000050',
    'Milestone on Round 2'
  );
  $$,
  '22023',
  NULL,
  'TS-RND-05a: Round 2 submission denied without Round 1 qualification'
);

-- TS-RND-05b: Valid submission v1 succeeds with verified evidence intent
SELECT lives_ok(
  $$
  SELECT public.submit_round_milestone(
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000050',
    'Valid Milestone Round 1',
    'Initial milestone report',
    'https://github.com/team1/repo',
    'https://demo.team1.example',
    'teams/00000000-0000-0000-0000-000000000050/rounds/00000000-0000-0000-0000-000000000020/00000000-0000-0000-0000-000000000101.png',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  $$,
  'TS-RND-05b: Valid submission v1 succeeds cleanly'
);

RESET ROLE;

SELECT is(
  (SELECT COUNT(*)::int FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 1 AND is_current = true),
  1,
  'TS-RND-05c: Submission record created with version=1 and is_current=true'
);

SELECT is(
  (SELECT status FROM public.evidence_validation_intents WHERE id = '00000000-0000-0000-0000-000000000201'),
  'consumed',
  'TS-RND-05d: Validation intent is atomically consumed'
);

-- ============================================================================
-- TESTS 6-7: VERSIONED RESUBMISSION & TERMINAL REJECTION
-- ============================================================================

-- Put submission into revision_requested via admin review
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1
DO $$
DECLARE
  v_sub_id UUID;
  v_res JSONB;
BEGIN
  SELECT id INTO v_sub_id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND is_current = true;
  v_res := public.review_round_submission(
    v_sub_id,
    'revision_requested',
    'Please improve architecture diagrams and README instructions'
  );
END $$;

-- TS-RND-06a: Student resubmission creates v2 (reusing prior evidence)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
DO $$
DECLARE
  v_sub_v1_id UUID;
  v_res JSONB;
BEGIN
  SELECT id INTO v_sub_v1_id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND is_current = true;
  v_res := public.resubmit_round_milestone(
    v_sub_v1_id,
    'Milestone Revision v2',
    'Addressed feedback from reviewer',
    'https://github.com/team1/repo-v2',
    'https://demo.team1.example',
    'teams/00000000-0000-0000-0000-000000000050/rounds/00000000-0000-0000-0000-000000000020/00000000-0000-0000-0000-000000000101.png',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
END $$;

RESET ROLE;

SELECT is(
  (SELECT version FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND is_current = true),
  2,
  'TS-RND-06a: Resubmission creates version 2 with is_current=true'
);

SELECT is(
  (SELECT is_current FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 1),
  false,
  'TS-RND-06b: Prior version 1 is demoted to is_current=false'
);

-- Reject v2 via admin
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1
DO $$
DECLARE
  v_sub_id UUID;
  v_res JSONB;
BEGIN
  SELECT id INTO v_sub_id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND is_current = true;
  v_res := public.review_round_submission(
    v_sub_id,
    'rejected',
    'Submission does not meet core milestone requirements'
  );
END $$;

-- TS-RND-07a: Terminal rejection blocks resubmission
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SELECT throws_ok(
  $$
  SELECT public.resubmit_round_milestone(
    (SELECT id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND is_current = true),
    'Milestone Attempt after Rejection',
    'Trying to resubmit rejected milestone'
  );
  $$,
  '22023',
  NULL,
  'TS-RND-07a: Terminal rejection blocks student resubmission'
);

-- TS-RND-07b: Non-admin cannot reopen rejected submission
SELECT throws_ok(
  $$
  SELECT public.reopen_rejected_submission(
    (SELECT id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND is_current = true),
    'revision_requested',
    'Student attempting reopen'
  );
  $$,
  '42501',
  NULL,
  'TS-RND-07b: Student is denied permission to reopen rejected submission'
);

-- TS-RND-07c: Authorized admin reopens rejected submission
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1
SELECT lives_ok(
  $$
  SELECT public.reopen_rejected_submission(
    (SELECT id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND is_current = true),
    'revision_requested',
    'Reopened after discussion with mentoring team'
  );
  $$,
  'TS-RND-07c: Authorized admin successfully reopens rejected submission'
);

RESET ROLE;

SELECT is(
  (SELECT status FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND is_current = true),
  'revision_requested',
  'TS-RND-07d: Submission status transitioned to revision_requested upon reopening'
);

-- ============================================================================
-- TESTS 8-9: WINNER PLACEMENT & REVERSE POINTS LEDGER
-- ============================================================================

-- Accept submission on final round 2 to test winner placement
DO $$
BEGIN
  -- Qualify team 1 for round 2
  INSERT INTO public.results (
    hackathon_id, round_id, team_id, milestone_type, is_published, verified_by
  ) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000050',
    'round_qualification',
    true,
    '00000000-0000-0000-0000-000000000002'
  ) ON CONFLICT DO NOTHING;

  -- Create accepted submission in final round 2
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title
  ) VALUES (
    '00000000-0000-0000-0000-000000000301',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000003',
    1,
    true,
    'accepted',
    'Final Round Project'
  ) ON CONFLICT (id) DO UPDATE SET status = 'accepted';
END $$;

-- TS-RND-08: record_round_winner_placement
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1
SELECT lives_ok(
  $$
  SELECT public.record_round_winner_placement(
    '00000000-0000-0000-0000-000000000301',
    '1st',
    'Exceptional full-stack architecture'
  );
  $$,
  'TS-RND-08a: record_round_winner_placement succeeds for final round accepted submission'
);

RESET ROLE;

SELECT is(
  (SELECT placement FROM public.results WHERE team_id = '00000000-0000-0000-0000-000000000050' AND milestone_type = 'win_placement'),
  '1st',
  'TS-RND-08b: Verified winner placement recorded in public.results'
);

-- TS-RND-09: reverse_points_ledger_entry
DO $$
BEGIN
  -- Insert a test points ledger entry to reverse
  INSERT INTO public.points_ledger (
    id, idempotency_key, student_id, hackathon_id, team_id, milestone_type, role_at_award, points, reason, awarded_by
  ) VALUES (
    '00000000-0000-0000-0000-000000000401',
    'test_point_to_reverse',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000050',
    'manual_adjustment',
    'leader',
    50,
    'Initial bonus awarded',
    '00000000-0000-0000-0000-000000000002'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1
SELECT lives_ok(
  $$
  SELECT public.reverse_points_ledger_entry(
    '00000000-0000-0000-0000-000000000401',
    'Disqualification adjustment per judging panel'
  );
  $$,
  'TS-RND-09a: Authorized admin successfully reverses points ledger entry'
);

RESET ROLE;

SELECT is(
  (SELECT points FROM public.points_ledger WHERE reversal_of_id = '00000000-0000-0000-0000-000000000401'),
  -50,
  'TS-RND-09b: Reversal record inserted with negative points (-50)'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$
  SELECT public.reverse_points_ledger_entry(
    '00000000-0000-0000-0000-000000000401',
    'Attempting duplicate reversal'
  );
  $$,
  '22023',
  NULL,
  'TS-RND-09c: Double reversal is rejected'
);

-- ============================================================================
-- TEST 10: OPTION 5A RETENTION ENQUEUE & 7-DAY GRACE PERIOD
-- ============================================================================
RESET ROLE;
DO $$
DECLARE
  v_h_exp_id UUID := '00000000-0000-0000-0000-000000000012';
  v_r_exp_h_id UUID := '00000000-0000-0000-0000-000000000029';
  v_t_exp_h_id UUID := '00000000-0000-0000-0000-000000000059';
  v_s1_id UUID := '00000000-0000-0000-0000-000000000003';
BEGIN
  -- Insert dummy submission in expired hackathon to test enqueueing (historical version is_current=false to bypass commit deadline trigger on expired round)
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title, evidence_path
  ) VALUES (
    '00000000-0000-0000-0000-000000000501',
    v_h_exp_id,
    v_r_exp_h_id,
    v_t_exp_h_id,
    v_s1_id,
    1,
    false,
    'submitted',
    'Expired Event Milestone',
    'teams/' || v_t_exp_h_id::text || '/rounds/' || v_r_exp_h_id::text || '/expired_proof.png'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- Enqueue retention on expired hackathon
SELECT ok(
  (
    SELECT (res->>'success')::boolean
    FROM (SELECT public.enqueue_hackathon_evidence_retention('00000000-0000-0000-0000-000000000012') as res) t
  ),
  'TS-RND-10a: enqueue_hackathon_evidence_retention succeeds on expired hackathon'
);

SELECT is(
  (
    SELECT bucket_id FROM public.storage_deletion_queue
    WHERE object_path = 'teams/00000000-0000-0000-0000-000000000059/rounds/00000000-0000-0000-0000-000000000029/expired_proof.png'
  ),
  'submission-evidence',
  'TS-RND-10b: Enqueued submission evidence targets submission-evidence bucket'
);

-- Option 5A verification: retention_deadline_at is stamped ~7 days in future from enqueue instant
SELECT ok(
  (
    SELECT retention_deadline_at >= clock_timestamp() + interval '6 days 23 hours'
    FROM public.storage_deletion_queue
    WHERE object_path = 'teams/00000000-0000-0000-0000-000000000059/rounds/00000000-0000-0000-0000-000000000029/expired_proof.png'
  ),
  'TS-RND-10c: Option 5A enqueued job receives absolute 7-day retention grace period from enqueue instant'
);

RESET ROLE;
DELETE FROM public.submissions WHERE id = '00000000-0000-0000-0000-000000000501';

-- ============================================================================
-- TESTS 11-12: STORAGE RLS POLICIES & PHASE 7 REGRESSION
-- ============================================================================

-- TS-RND-11: Direct client write into teams/* round evidence namespace denied
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- Student 1
SELECT throws_ok(
  $$
  INSERT INTO storage.objects (id, bucket_id, name, owner)
  VALUES (gen_random_uuid(), 'submission-evidence', 'teams/00000000-0000-0000-0000-000000000050/rounds/00000000-0000-0000-0000-000000000020/direct_hack.png', auth.uid());
  $$,
  '42501',
  NULL,
  'TS-RND-11: Direct client upload into teams/* round evidence namespace is denied in Storage RLS'
);

-- TS-RND-12: Phase 7 registration proof SELECT policy permits assigned admin
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1
SELECT is(
  (
    SELECT COUNT(*)::int FROM storage.objects
    WHERE name = 'teams/00000000-0000-0000-0000-000000000050/registration/proof.png'
  ),
  1,
  'TS-RND-12: Phase 7 registration proof SELECT policy permits assigned admin'
);

-- ============================================================================
-- TESTS 13-14: REVIEW FEEDBACK VISIBILITY RLS
-- ============================================================================

RESET ROLE;
DO $$
DECLARE
  v_sub_id UUID;
BEGIN
  SELECT id INTO v_sub_id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 2;
  INSERT INTO public.submission_reviews (
    submission_id, reviewer_id, decision, feedback
  ) VALUES (
    v_sub_id,
    '00000000-0000-0000-0000-000000000002',
    'revision_requested',
    'Please clarify the deployment steps in README'
  ) ON CONFLICT DO NOTHING;
END $$;

-- TS-RND-13: Team member can view review feedback
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004'; -- S2 Member
SELECT is(
  (
    SELECT COUNT(*)::int FROM public.submission_reviews sr
    JOIN public.submissions s ON s.id = sr.submission_id
    WHERE s.team_id = '00000000-0000-0000-0000-000000000050'
  ),
  2,
  'TS-RND-13: Team member can select review feedback for their team'
);

-- TS-RND-14: Unaffiliated student cannot view review feedback
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000095'; -- S4 outsider
SELECT is(
  (
    SELECT COUNT(*)::int FROM public.submission_reviews sr
    JOIN public.submissions s ON s.id = sr.submission_id
    WHERE s.team_id = '00000000-0000-0000-0000-000000000050'
  ),
  0,
  'TS-RND-14: Unaffiliated student is denied review feedback visibility in RLS'
);

-- ============================================================================
-- TEST 15: DECISION-DEPENDENT REVIEW FEEDBACK VALIDATION
-- ============================================================================
RESET ROLE;
SET LOCAL "request.jwt.claim.role" = 'service_role';
UPDATE public.submissions
SET status = 'submitted'
WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 2;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1

-- 15a: revision_requested rejects whitespace-only or short feedback
SELECT throws_ok(
  $$
  SELECT public.review_round_submission(
    (SELECT id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 2),
    'revision_requested',
    '   '
  );
  $$,
  '22000',
  NULL,
  'TS-RND-15a: review_round_submission rejects whitespace-only feedback for revision_requested'
);

-- 15b: rejected requires nonblank explanation >= 10 chars
SELECT throws_ok(
  $$
  SELECT public.review_round_submission(
    (SELECT id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 2),
    'rejected',
    'Bad'
  );
  $$,
  '22000',
  NULL,
  'TS-RND-15b: review_round_submission rejects short feedback (<10 chars) for rejected'
);

-- 15c: feedback > 1000 characters rejected
SELECT throws_ok(
  $$
  SELECT public.review_round_submission(
    (SELECT id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 2),
    'accepted',
    repeat('A', 1001)
  );
  $$,
  '22000',
  NULL,
  'TS-RND-15c: review_round_submission rejects feedback exceeding 1000 characters'
);

-- 15d: accepted allows optional NULL feedback (one review per reviewer: clear the earlier one)
SET LOCAL ROLE postgres;
DELETE FROM public.submission_reviews
WHERE submission_id = (SELECT id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 2);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
  SELECT public.review_round_submission(
    (SELECT id FROM public.submissions WHERE team_id = '00000000-0000-0000-0000-000000000050' AND version = 2),
    'accepted',
    NULL
  );
  $$,
  'TS-RND-15d: review_round_submission permits NULL/optional feedback for accepted'
);

-- ============================================================================
-- TEST 16: REVIEW LIFECYCLE MATRIX ENFORCEMENT
-- ============================================================================

-- Create test submissions in various round states
RESET ROLE;
DO $$
BEGIN
  -- Submission in paused round
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title
  ) VALUES (
    '00000000-0000-0000-0000-000000000601',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000022', -- Paused round
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000003',
    1, true, 'submitted', 'Paused Round Milestone'
  ) ON CONFLICT (id) DO NOTHING;

  -- Submission in expired open round
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title
  ) VALUES (
    '00000000-0000-0000-0000-000000000602',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000023', -- Expired round
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000003',
    1, true, 'submitted', 'Expired Round Milestone'
  ) ON CONFLICT (id) DO NOTHING;

  -- Submission in completed round
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title
  ) VALUES (
    '00000000-0000-0000-0000-000000000603',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000025', -- Completed round
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000003',
    1, true, 'submitted', 'Completed Round Milestone'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1

-- 16a: Review on paused round rejected
SELECT throws_ok(
  $$
  SELECT public.review_round_submission(
    '00000000-0000-0000-0000-000000000601',
    'accepted',
    'Reviewing paused'
  );
  $$,
  '55P03',
  NULL,
  'TS-RND-16a: review_round_submission rejects review when round is paused'
);

-- 16b: Review on open round with expired deadline rejected
SELECT throws_ok(
  $$
  SELECT public.review_round_submission(
    '00000000-0000-0000-0000-000000000602',
    'accepted',
    'Reviewing expired'
  );
  $$,
  '55P03',
  NULL,
  'TS-RND-16b: review_round_submission rejects review when stage deadline expired without evaluation transition'
);

-- 16c: Review on completed round rejected for all actors
SELECT throws_ok(
  $$
  SELECT public.review_round_submission(
    '00000000-0000-0000-0000-000000000603',
    'accepted',
    'Reviewing completed'
  );
  $$,
  '55P03',
  NULL,
  'TS-RND-16c: review_round_submission rejects review when round is completed (strictly view-only)'
);

RESET ROLE;
DELETE FROM public.submissions WHERE id IN (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000602',
  '00000000-0000-0000-0000-000000000603'
);

-- ============================================================================
-- TEST 17: STRICT EVIDENCE BINDING & ANTI-SPOOFING
-- ============================================================================

-- 17a: Non-canonical regex path rejected
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000094'; -- S3 Leader Team 2
SELECT throws_ok(
  $$
  SELECT public.submit_round_milestone(
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000051',
    'Tampered Path Milestone',
    'Description',
    NULL, NULL,
    'teams/00000000-0000-0000-0000-000000000051/malicious_folder/file.png',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  $$,
  '22023',
  NULL,
  'TS-RND-17a: submit_round_milestone rejects non-canonical evidence path'
);

-- 17b: Mismatched SHA-256 rejected
SELECT throws_ok(
  $$
  SELECT public.submit_round_milestone(
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000051',
    'Spoofed Hash Milestone',
    'Description',
    NULL, NULL,
    'teams/00000000-0000-0000-0000-000000000051/rounds/00000000-0000-0000-0000-000000000020/00000000-0000-0000-0000-000000000101.png',
    '0000000000000000000000000000000000000000000000000000000000000000'
  );
  $$,
  '22023',
  NULL,
  'TS-RND-17b: submit_round_milestone rejects unverified or mismatched SHA-256 hash'
);

-- ============================================================================
-- TEST 18: DIRECT CLIENT WRITE DENIAL ON public.submissions
-- ============================================================================
SELECT throws_ok(
  $$
  INSERT INTO public.submissions (
    round_id, team_id, hackathon_id, submitted_by, title
  ) VALUES (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000094',
    'Direct Client Insert Attempt'
  );
  $$,
  '42501',
  NULL,
  'TS-RND-18: Direct client INSERT on public.submissions is revoked and denied'
);

-- ============================================================================
-- TEST 19: DEFERRED CONSTRAINT TRIGGER ENFORCEMENT (TS-RND-20)
-- ============================================================================
RESET ROLE;

-- Switch to IMMEDIATE mode to verify statement check
SET CONSTRAINTS trg_submissions_enforce_commit_deadline IMMEDIATE;

-- 19a: Statement check via SET CONSTRAINTS IMMEDIATE detects expired round deadline
SELECT throws_ok(
  $$
  INSERT INTO public.submissions (
    hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title
  ) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000023', -- Expired round
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000003',
    1, true, 'submitted', 'Late Submission via Direct SQL'
  );
  $$,
  '55P03',
  NULL,
  'TS-RND-19a: trg_submissions_enforce_commit_deadline raises 55P03 on late submission insert'
);

-- 19b: Non-existent round raises 23503
SELECT throws_ok(
  $$
  INSERT INTO public.submissions (
    hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title
  ) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000999', -- Non-existent round
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000003',
    1, true, 'submitted', 'Bad Round'
  );
  $$,
  '23503',
  NULL,
  'TS-RND-19b: trg_submissions_enforce_commit_deadline raises 23503 on missing round'
);

-- 19c: Hackathon ID mismatch raises 23503
SELECT throws_ok(
  $$
  INSERT INTO public.submissions (
    hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title
  ) VALUES (
    '00000000-0000-0000-0000-000000000012', -- Mismatched hackathon
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000003',
    1, true, 'submitted', 'Mismatched Hackathon'
  );
  $$,
  '23503',
  NULL,
  'TS-RND-19c: trg_submissions_enforce_commit_deadline raises 23503 on mismatched hackathon'
);

SET CONSTRAINTS trg_submissions_enforce_commit_deadline DEFERRED;

-- ============================================================================
-- TEST 20: HTTP 404 IDEMPOTENCY & MULTI-VERSION PURGE ATOMICITY
-- ============================================================================
DO $$
DECLARE
  v_job_id UUID := '00000000-0000-0000-0000-000000000701';
  v_lease_token UUID := '00000000-0000-0000-0000-000000000702';
  v_shared_path TEXT := 'teams/00000000-0000-0000-0000-000000000052/rounds/00000000-0000-0000-0000-000000000020/shared_evidence.png';
BEGIN
  -- Insert two submission versions sharing the same path for Team 3 (0052)
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, version, is_current, status, title, evidence_path
  ) VALUES
    ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000003', 10, false, 'revision_requested', 'v10', v_shared_path),
    ('00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000003', 11, true, 'submitted', 'v11', v_shared_path)
  ON CONFLICT DO NOTHING;

  -- Insert deletion job in dispatching status with active lease
  INSERT INTO public.storage_deletion_queue (
    id, event_id, bucket_id, object_path, target_type, target_id, status, lease_token, leased_until, retention_deadline_at
  ) VALUES (
    v_job_id,
    '00000000-0000-0000-0000-000000000010',
    'submission-evidence',
    v_shared_path,
    'submission_evidence',
    '00000000-0000-0000-0000-000000000712',
    'dispatching',
    v_lease_token,
    now() + interval '60 seconds',
    now() - interval '1 day'
  ) ON CONFLICT DO NOTHING;

  -- Complete with HTTP 404 (absent from storage)
  PERFORM public.complete_storage_deletion_job(v_job_id, v_lease_token, 404);
END $$;

SELECT is(
  (SELECT status FROM public.storage_deletion_queue WHERE id = '00000000-0000-0000-0000-000000000701'),
  'completed',
  'TS-RND-20a: complete_storage_deletion_job treats HTTP 404 as successful completion (completed)'
);

SELECT is(
  (SELECT COUNT(*)::int FROM public.submissions WHERE evidence_path = 'teams/00000000-0000-0000-0000-000000000052/rounds/00000000-0000-0000-0000-000000000020/shared_evidence.png' AND evidence_deleted_at IS NOT NULL),
  2,
  'TS-RND-20b: Both submission versions sharing evidence_path are atomically stamped evidence_deleted_at'
);

-- ============================================================================
-- TEST 21: EVIDENCE SIZE LIMIT CHECK CONSTRAINT (1 MiB BOUNDARY)
-- ============================================================================
-- TS-RND-21a: Reject intent exceeding 1 MiB (1048577 bytes)
SELECT throws_ok(
  $$
  INSERT INTO public.evidence_validation_intents (
    id, hackathon_id, round_id, team_id, object_path, sha256_hash, file_size_bytes, mime_type, created_by
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000050',
    'teams/t/r/oversized.png',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    1048577,
    'image/png',
    '00000000-0000-0000-0000-000000000003'
  );
  $$,
  '23514',
  NULL,
  'TS-RND-21a: evidence_validation_intents rejects file_size_bytes exceeding 1 MiB (1048577 bytes) with check violation 23514'
);

-- TS-RND-21b: Reject intent with 0 bytes
SELECT throws_ok(
  $$
  INSERT INTO public.evidence_validation_intents (
    id, hackathon_id, round_id, team_id, object_path, sha256_hash, file_size_bytes, mime_type, created_by
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000050',
    'teams/t/r/empty.png',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    0,
    'image/png',
    '00000000-0000-0000-0000-000000000003'
  );
  $$,
  '23514',
  NULL,
  'TS-RND-21b: evidence_validation_intents rejects file_size_bytes = 0 with check violation 23514'
);

-- TS-RND-21c: Accept exact 1 MiB boundary (1048576 bytes)
INSERT INTO public.evidence_validation_intents (
  id, hackathon_id, round_id, team_id, object_path, sha256_hash, file_size_bytes, mime_type, created_by
) VALUES (
  '00000000-0000-0000-0000-000000000801',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000020',
  '00000000-0000-0000-0000-000000000050',
  'teams/t/r/exact_1mib.png',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  1048576,
  'image/png',
  '00000000-0000-0000-0000-000000000003'
);

SELECT ok(
  EXISTS (SELECT 1 FROM public.evidence_validation_intents WHERE id = '00000000-0000-0000-0000-000000000801'),
  'TS-RND-21c: evidence_validation_intents accepts exact 1 MiB boundary (1048576 bytes)'
);

-- ============================================================================
-- FINISH AND ROLLBACK
-- ============================================================================
SELECT * FROM finish();
ROLLBACK;
