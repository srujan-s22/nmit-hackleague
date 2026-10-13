-- Suite 7: Points Ledger, Milestone Idempotency & Reversals (TS-PTS)
BEGIN;
SELECT plan(9);

-- Setup: create test team, round, and published result
DO $$
DECLARE
  v_admin_id UUID := '00000000-0000-0000-0000-000000000001';
  v_h1_id UUID := '00000000-0000-0000-0000-000000000010';
  v_r1_id UUID := '00000000-0000-0000-0000-000000000020';
  v_s1_id UUID := '00000000-0000-0000-0000-000000000003';
  v_t1_id UUID := '00000000-0000-0000-0000-000000000050';
  v_res1_id UUID := '00000000-0000-0000-0000-000000000061';
  v_res2_id UUID := '00000000-0000-0000-0000-000000000062';
BEGIN
  -- Grant manage_points to Super Admin (SA has is_super_admin=true, also let's grant to admin 2 for specific tests)
  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES ('00000000-0000-0000-0000-000000000001', 'manage_points', v_admin_id)
  ON CONFLICT (admin_id, permission) DO NOTHING;

  -- Create Team T1 in H1 with leader S1
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status)
  VALUES (v_t1_id, v_h1_id, 'Points Knights', v_s1_id, 'POINTSKNIGHT', 'forming');

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_t1_id, v_s1_id, v_h1_id, 'leader');

  -- Create Published Verified Result 1
  INSERT INTO public.results (
    id, hackathon_id, round_id, team_id, milestone_type, is_published, verified_by
  ) VALUES (
    v_res1_id, v_h1_id, v_r1_id, v_t1_id, 'round_qualification', true, v_admin_id
  );

  -- Create UNPUBLISHED Result 2
  INSERT INTO public.results (
    id, hackathon_id, round_id, team_id, milestone_type, is_published, verified_by
  ) VALUES (
    v_res2_id, v_h1_id, v_r1_id, v_t1_id, 'round_qualification', false, v_admin_id
  );
END $$;

-- TS-PTS-01: Verified Result Milestone Award
-- Super Admin awards points for verified Result 1
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT lives_ok(
  $$
  SELECT public.award_milestone_points(
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000020'::uuid,
    'round_qualification',
    '00000000-0000-0000-0000-000000000061'::uuid,
    'Round 1 Qualified'
  );
  $$,
  'TS-PTS-01: Milestone points awarded successfully for verified published result'
);

-- TS-PTS-02: Unpublished Result Rejection
SELECT throws_ok(
  $$
  SELECT public.award_milestone_points(
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000020'::uuid,
    'round_qualification',
    '00000000-0000-0000-0000-000000000062'::uuid,
    'Attempting award on unpublished result'
  );
  $$,
  'P0001',
  'Points cannot be awarded for unpublished or unverified round results.',
  'TS-PTS-02: Milestone award rejected for unpublished result'
);

-- TS-PTS-03: Exact Idempotency Retry
-- Re-calling public.award_milestone_points with exact identical parameters returns existing ID
SELECT lives_ok(
  $$
  SELECT public.award_milestone_points(
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000020'::uuid,
    'round_qualification',
    '00000000-0000-0000-0000-000000000061'::uuid,
    'Round 1 Qualified'
  );
  $$,
  'TS-PTS-03: Exact identical retry is idempotent and succeeds without duplicate row'
);

-- Verify points_ledger has exactly 1 row for this student
SELECT is(
  (SELECT count(*)::int FROM public.points_ledger WHERE student_id = '00000000-0000-0000-0000-000000000003'::uuid),
  1,
  'TS-PTS-03b: Ledger row count remains 1 after idempotent retry'
);

-- TS-PTS-04: Conflicting Idempotency Payload Rejection
-- Same student, hackathon, round, milestone type, but conflicting reason
SELECT throws_ok(
  $$
  SELECT public.award_milestone_points(
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000020'::uuid,
    'round_qualification',
    '00000000-0000-0000-0000-000000000061'::uuid,
    'Conflicting Reason Attempt'
  );
  $$,
  'P0001',
  NULL,
  'TS-PTS-04: Conflicting idempotency payload rejected with error'
);

-- TS-PTS-05: Auditable Negative Reversal & Double-Reversal Block
-- Reverse the award
SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    v_orig_id UUID;
  BEGIN
    SELECT id INTO v_orig_id FROM public.points_ledger WHERE milestone_type = 'round_qualification' LIMIT 1;
    PERFORM public.reverse_points_award(v_orig_id, 'Recalculated by judges');
  END $do$;
  $$,
  'TS-PTS-05: Points reversal creates negative ledger entry'
);

-- Second reversal on same original award must fail
SELECT throws_ok(
  $$
  DO $do$
  DECLARE
    v_orig_id UUID;
  BEGIN
    SELECT id INTO v_orig_id FROM public.points_ledger WHERE milestone_type = 'round_qualification' LIMIT 1;
    PERFORM public.reverse_points_award(v_orig_id, 'Duplicate reversal attempt');
  END $do$;
  $$,
  'P0001',
  'This points entry has already been reversed.',
  'TS-PTS-05b: Second reversal on already reversed entry rejected'
);

-- TS-PTS-06: Unauthorized Milestone Award Rejection without manage_points
-- As Student 1 (UUID 00000000-0000-0000-0000-000000000003), calling award_milestone_points throws exception
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';

SELECT throws_ok(
  $$
  SELECT public.award_milestone_points(
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000020'::uuid,
    'round_qualification',
    '00000000-0000-0000-0000-000000000061'::uuid,
    'Unauthorized student award attempt'
  );
  $$,
  'P0001',
  'Unauthorized: administrative permission manage_points required.',
  'TS-PTS-06: Milestone award without manage_points rejected with unauthorized exception'
);

-- TS-PTS-06b: Ordinary admin without manage_points rejected
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$
  SELECT public.award_milestone_points(
    '00000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000020'::uuid,
    'round_qualification',
    '00000000-0000-0000-0000-000000000061'::uuid,
    'Unauthorized verifier admin award attempt'
  );
  $$,
  'P0001',
  'Unauthorized: administrative permission manage_points required.',
  'TS-PTS-06b: Milestone award by admin lacking manage_points rejected'
);

SELECT * FROM finish();
ROLLBACK;
