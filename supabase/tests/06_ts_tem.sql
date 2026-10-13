-- Suite 6: Team Lifecycle, Invariants & Concurrency (TS-TEM)
BEGIN;
SELECT plan(7);

-- TS-TEM-01: Atomic Team Creation with Deferred Leader
-- Student 1 creates team CyberKnights in Hackathon H1
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT lives_ok(
  $$
  SELECT public.create_team(
    '00000000-0000-0000-0000-000000000010'::uuid,
    'CyberKnights'
  );
  $$,
  'TS-TEM-01: Approved student creates team atomically with generated invitation code and leader role'
);

-- TS-TEM-02: Standalone Leaderless Team Rejection at Commit
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT throws_ok(
  $$
  SET CONSTRAINTS ALL IMMEDIATE;
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status)
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000010'::uuid,
    'Leaderless Team',
    '00000000-0000-0000-0000-000000000004'::uuid,
    'NOLEADER1234',
    'forming'
  );
  $$,
  '23503', -- foreign_key_violation on fk_teams_leader_member
  NULL,
  'TS-TEM-02: Standalone team without leader membership rejected at commit by fk_teams_leader_member'
);

-- Setup for TS-TEM-04: Student 2 joins CyberKnights
DO $$
DECLARE
  v_invite TEXT;
BEGIN
  SELECT invitation_code INTO v_invite
  FROM public.teams
  WHERE name = 'CyberKnights'
  LIMIT 1;

  -- Join as Student 2
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  PERFORM public.join_team_with_code(v_invite);
END $$;

-- TS-TEM-04: Atomic Leadership Transfer
-- Student 1 transfers leadership to Student 2
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    v_team_id UUID;
  BEGIN
    SELECT id INTO v_team_id FROM public.teams WHERE name = 'CyberKnights';
    PERFORM public.transfer_team_leadership(v_team_id, '00000000-0000-0000-0000-000000000004'::uuid);
  END $do$;
  $$,
  'TS-TEM-04: Atomic leadership transfer succeeds and swaps leader role'
);

-- Verify leader_id is now Student 2
SELECT is(
  (SELECT leader_id FROM public.teams WHERE name = 'CyberKnights'),
  '00000000-0000-0000-0000-000000000004'::uuid,
  'TS-TEM-04b: teams.leader_id updated to new leader'
);

-- TS-TEM-03: Team Roster Locking and Join Prevention
-- New Leader Student 2 locks the roster
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    v_team_id UUID;
  BEGIN
    SELECT id INTO v_team_id FROM public.teams WHERE name = 'CyberKnights';
    PERFORM public.lock_team_roster(v_team_id);
  END $do$;
  $$,
  'TS-TEM-03a: Team leader successfully locks roster'
);

RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- Setup Student 3 (approved, not in any team in H1) for locked team and name collision tests
DO $$
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'student3@nmit-dev.local', extensions.crypt('password123', extensions.gen_salt('bf')), now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, usn, phone, branch, academic_year, registration_status)
  VALUES ('00000000-0000-0000-0000-000000000007', 'student3@nmit-dev.local', 'Student Three', '1NT21CS003', '+919876543214', 'CSE', 4, 'approved')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- Student 3 attempting to join locked team throws exception
SELECT throws_ok(
  $$
  DO $do$
  DECLARE
    v_invite TEXT;
  BEGIN
    SELECT invitation_code INTO v_invite FROM public.teams WHERE name = 'CyberKnights';
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM public.join_team_with_code(v_invite);
  END $do$;
  $$,
  'P0001',
  'Team roster is locked.',
  'TS-TEM-03b: Joining locked roster rejected with exception'
);

-- TS-TEM-05: Case-Insensitive Team Name Collision under Concurrency
-- Student 3 attempting to create team '  cyberknights  ' must fail with name conflict
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000007';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$
  SELECT public.create_team(
    '00000000-0000-0000-0000-000000000010'::uuid,
    '  cyberknights  '
  );
  $$,
  'P0001',
  'Team name "cyberknights" is already taken in this hackathon.',
  'TS-TEM-05: Case-insensitive, trimmed team name collision rejected'
);

SELECT * FROM finish();
ROLLBACK;
