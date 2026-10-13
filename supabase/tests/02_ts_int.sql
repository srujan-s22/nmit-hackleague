-- Suite 2: Schema and Constraint Integrity (TS-INT)
BEGIN;
SELECT plan(5);

-- TS-INT-01: Normalized Unique USN Collision
-- Student 1 already has 1NT21CS001. Attempt to insert another user with lowercase padded '  1nt21cs001  '
SELECT throws_ok(
  $$
  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, registration_status
  ) VALUES (
    gen_random_uuid(), 'collision@nmit-dev.local', 'Colliding Student', '  1nt21cs001  ', '+919999999999', 'CSE', 4, 'draft'
  )
  $$,
  '23505', -- unique_violation
  NULL,
  'TS-INT-01: Normalized USN collision throws unique constraint violation'
);

-- Setup for TS-INT-02, 03, 04, 05: Create secondary hackathon H2 and Round R2
DO $$
DECLARE
  v_admin_id UUID := '00000000-0000-0000-0000-000000000001';
  v_h2_id UUID := '00000000-0000-0000-0000-000000000012';
  v_r2_id UUID := '00000000-0000-0000-0000-000000000022';
  v_s1_id UUID := '00000000-0000-0000-0000-000000000003';
  v_s2_id UUID := '00000000-0000-0000-0000-000000000004';
  v_t1_id UUID := '00000000-0000-0000-0000-000000000031';
  v_h1_id UUID := '00000000-0000-0000-0000-000000000010';
BEGIN
  -- Create H2
  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode,
    registration_start_at, registration_end_at, event_start_at, event_end_at,
    status, created_by
  ) VALUES (
    v_h2_id, 'NMIT Hacks II', 'nmit-hacks-ii', 'Second event', 'CSE Dept', 'offline',
    now() - interval '1 day', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
    'published', v_admin_id
  );

  -- Create Round R2 in H2
  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status
  ) VALUES (
    v_r2_id, v_h2_id, 1, 'H2 Round 1', now() - interval '1 hour', now() + interval '2 days', 'open'
  );

  -- Create Team T1 in H1 with leader S1
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status)
  VALUES (v_t1_id, v_h1_id, 'Team One H1', v_s1_id, 'INVITECODE01', 'forming');

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_t1_id, v_s1_id, v_h1_id, 'leader');
END $$;

-- TS-INT-02: Cross-Hackathon Linkage Rejection
-- Team T1 is in H1; Round R2 is in H2. Attempting to submit T1 to R2 must fail composite FK
SELECT throws_ok(
  $$
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, title
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000010', -- H1
    '00000000-0000-0000-0000-000000000022', -- R2 (belongs to H2!)
    '00000000-0000-0000-0000-000000000031', -- T1 (belongs to H1)
    '00000000-0000-0000-0000-000000000003',
    'Cross Hackathon Project'
  )
  $$,
  '23503', -- foreign_key_violation
  NULL,
  'TS-INT-02: Cross-hackathon round submission rejected by composite FK'
);

-- TS-INT-03: One Team per Hackathon Invariant
-- S1 is already in T1 in H1. Attempting to add S1 to T2 in H1 must fail
DO $$
DECLARE
  v_h1_id UUID := '00000000-0000-0000-0000-000000000010';
  v_s2_id UUID := '00000000-0000-0000-0000-000000000004';
  v_t2_id UUID := '00000000-0000-0000-0000-000000000032';
BEGIN
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status)
  VALUES (v_t2_id, v_h1_id, 'Team Two H1', v_s2_id, 'INVITECODE02', 'forming');

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_t2_id, v_s2_id, v_h1_id, 'leader');
END $$;

SELECT throws_ok(
  $$
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (
    '00000000-0000-0000-0000-000000000032', -- T2
    '00000000-0000-0000-0000-000000000003', -- S1 (already in T1 in H1)
    '00000000-0000-0000-0000-000000000010', -- H1
    'member'
  )
  $$,
  '23505', -- unique_violation on uq_team_members_one_team_per_hackathon
  NULL,
  'TS-INT-03: Multiple team membership in same hackathon rejected'
);

-- TS-INT-04: Multi-Hackathon Participation Permitted
-- S1 can join a team in H2 while being in H1
SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    v_h2_id UUID := '00000000-0000-0000-0000-000000000012';
    v_s1_id UUID := '00000000-0000-0000-0000-000000000003';
    v_t3_id UUID := '00000000-0000-0000-0000-000000000033';
  BEGIN
    INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status)
    VALUES (v_t3_id, v_h2_id, 'Team Three H2', v_s1_id, 'INVITECODE03', 'forming');

    INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
    VALUES (v_t3_id, v_s1_id, v_h2_id, 'leader');
  END;
  $do$;
  $$,
  'TS-INT-04: Multi-hackathon participation across distinct hackathons permitted'
);

-- TS-INT-05: Non-Member Points Credit Rejection
-- Attempt to award points in points_ledger to S2 for Team T1 (S2 is not member of T1)
SELECT throws_ok(
  $$
  INSERT INTO public.points_ledger (
    idempotency_key, student_id, hackathon_id, team_id,
    milestone_type, role_at_award, points, reason, awarded_by
  ) VALUES (
    'test:non_member_credit',
    '00000000-0000-0000-0000-000000000004', -- S2
    '00000000-0000-0000-0000-000000000010', -- H1
    '00000000-0000-0000-0000-000000000031', -- T1 (S2 is not member!)
    'participation',
    'member',
    10,
    'Invalid credit',
    '00000000-0000-0000-0000-000000000001'
  )
  $$,
  '23503', -- foreign_key_violation on fk_points_ledger_team_member
  NULL,
  'TS-INT-05: Non-member points credit rejected by composite membership foreign key'
);

SELECT * FROM finish();
ROLLBACK;
