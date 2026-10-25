-- Suite 26: transfer_team_leadership hardening (TS-TTL)
-- Fully self-contained fixture (does not rely on supabase/seed.sql or any
-- other numbered test file's shared baseline) so this file can run in
-- isolation and never collides with the 00000000-...-0000000000XX id space
-- used by the pre-existing suites.
BEGIN;
SELECT plan(5);

DO $$
DECLARE
  v_sa_id UUID := 'dddddddd-0000-0000-0000-000000000001'; -- super admin
  v_admin_assigned_id UUID := 'dddddddd-0000-0000-0000-000000000002'; -- manage_teams + assigned reviewer on H
  v_admin_unassigned_id UUID := 'dddddddd-0000-0000-0000-000000000003'; -- manage_teams but NOT assigned to H
  v_h_id UUID := 'dddddddd-0000-0000-0000-000000000010';
  v_r1_id UUID := 'dddddddd-0000-0000-0000-000000000020';
  v_leader1_id UUID := 'dddddddd-0000-0000-0000-000000000030';
  v_member1_id UUID := 'dddddddd-0000-0000-0000-000000000031';
  v_leader2_id UUID := 'dddddddd-0000-0000-0000-000000000032';
  v_member2_id UUID := 'dddddddd-0000-0000-0000-000000000033';
  v_leader3_id UUID := 'dddddddd-0000-0000-0000-000000000034';
  v_member3_id UUID := 'dddddddd-0000-0000-0000-000000000035';
  v_leader4_id UUID := 'dddddddd-0000-0000-0000-000000000036';
  v_member4_id UUID := 'dddddddd-0000-0000-0000-000000000037';
  v_leader5_id UUID := 'dddddddd-0000-0000-0000-000000000038';
  v_member5_id UUID := 'dddddddd-0000-0000-0000-000000000039';
  v_team_admin_unassigned UUID := 'dddddddd-0000-0000-0000-000000000050';
  v_team_admin_assigned UUID := 'dddddddd-0000-0000-0000-000000000051';
  v_team_leader_happy UUID := 'dddddddd-0000-0000-0000-000000000052';
  v_team_submitted UUID := 'dddddddd-0000-0000-0000-000000000053';
  v_team_points_history UUID := 'dddddddd-0000-0000-0000-000000000054';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_sa_id, 'ttl-sa@example.com'),
    (v_admin_assigned_id, 'ttl-admin-assigned@example.com'),
    (v_admin_unassigned_id, 'ttl-admin-unassigned@example.com'),
    (v_leader1_id, 'ttl-leader1@example.com'), (v_member1_id, 'ttl-member1@example.com'),
    (v_leader2_id, 'ttl-leader2@example.com'), (v_member2_id, 'ttl-member2@example.com'),
    (v_leader3_id, 'ttl-leader3@example.com'), (v_member3_id, 'ttl-member3@example.com'),
    (v_leader4_id, 'ttl-leader4@example.com'), (v_member4_id, 'ttl-member4@example.com'),
    (v_leader5_id, 'ttl-leader5@example.com'), (v_member5_id, 'ttl-member5@example.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
  VALUES
    -- is_super_admin = false: this row is only ever used as a granted_by/
    -- assigned_by/created_by FK reference in this fixture, never as an actor
    -- in any of the 5 assertions below. The local/hosted schema enforces
    -- exactly one is_super_admin=true row (uq_single_super_admin); a second
    -- synthetic super admin here previously collided with the real seeded
    -- one and is not needed for what this suite actually tests.
    (v_sa_id, 'ttl-sa@example.com', 'TTL Super Admin', false, true),
    (v_admin_assigned_id, 'ttl-admin-assigned@example.com', 'TTL Assigned Admin', false, true),
    (v_admin_unassigned_id, 'ttl-admin-unassigned@example.com', 'TTL Unassigned Admin', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true;

  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES
    (v_admin_assigned_id, 'manage_teams', v_sa_id),
    (v_admin_unassigned_id, 'manage_teams', v_sa_id),
    -- Required because check_hackathon_in_charge_active() auto-defaults
    -- in_charge_admin_id to created_by on any active hackathon, and (since
    -- v_sa_id is no longer is_super_admin, per the fix above) then requires
    -- that admin to hold manage_hackathons. v_sa_id is still never an actor
    -- in any of the 5 assertions below — this only satisfies that trigger.
    (v_sa_id, 'manage_hackathons', v_sa_id)
  ON CONFLICT (admin_id, permission) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, usn, phone, branch, academic_year, registration_status)
  VALUES
    (v_leader1_id, 'ttl-leader1@example.com', 'TTL Leader One', '1TT22CS001', '+919876500001', 'CSE', 3, 'approved'),
    (v_member1_id, 'ttl-member1@example.com', 'TTL Member One', '1TT22CS002', '+919876500002', 'CSE', 3, 'approved'),
    (v_leader2_id, 'ttl-leader2@example.com', 'TTL Leader Two', '1TT22CS003', '+919876500003', 'CSE', 3, 'approved'),
    (v_member2_id, 'ttl-member2@example.com', 'TTL Member Two', '1TT22CS004', '+919876500004', 'CSE', 3, 'approved'),
    (v_leader3_id, 'ttl-leader3@example.com', 'TTL Leader Three', '1TT22CS005', '+919876500005', 'CSE', 3, 'approved'),
    (v_member3_id, 'ttl-member3@example.com', 'TTL Member Three', '1TT22CS006', '+919876500006', 'CSE', 3, 'approved'),
    (v_leader4_id, 'ttl-leader4@example.com', 'TTL Leader Four', '1TT22CS007', '+919876500007', 'CSE', 3, 'approved'),
    (v_member4_id, 'ttl-member4@example.com', 'TTL Member Four', '1TT22CS008', '+919876500008', 'CSE', 3, 'approved'),
    (v_leader5_id, 'ttl-leader5@example.com', 'TTL Leader Five', '1TT22CS009', '+919876500009', 'CSE', 3, 'approved'),
    (v_member5_id, 'ttl-member5@example.com', 'TTL Member Five', '1TT22CS010', '+919876500010', 'CSE', 3, 'approved')
  ON CONFLICT (id) DO UPDATE SET registration_status = 'approved';

  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at,
    created_by
  ) VALUES (
    v_h_id, 'TTL Hardening Hackathon', 'ttl-hardening-hackathon', 'Fixture event', 'Dept CSE', 'online', 'published',
    now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
    v_sa_id
  ) ON CONFLICT (id) DO UPDATE SET status = 'published', registration_end_at = now() + interval '5 days';

  INSERT INTO public.hackathon_rounds (id, hackathon_id, round_number, name, start_at, end_at, status)
  VALUES (v_r1_id, v_h_id, 1, 'Registration', now() - interval '1 day', now() + interval '5 days', 'open')
  ON CONFLICT (id) DO UPDATE SET status = 'open', end_at = now() + interval '5 days';

  -- Reviewer assignment: v_admin_assigned_id IS assigned to this hackathon; v_admin_unassigned_id is NOT.
  INSERT INTO public.hackathon_admin_assignments (hackathon_id, admin_id, role, assigned_by)
  VALUES (v_h_id, v_admin_assigned_id, 'reviewer', v_sa_id)
  ON CONFLICT (hackathon_id, admin_id) DO NOTHING;

  -- Team A: used for the "unassigned admin" negative case.
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status)
  VALUES (v_team_admin_unassigned, v_h_id, 'TTL Team Unassigned Case', v_leader1_id, 'TTLCASE0001A', 'forming', 'not_submitted')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_team_admin_unassigned, v_leader1_id, v_h_id, 'leader'), (v_team_admin_unassigned, v_member1_id, v_h_id, 'member')
  ON CONFLICT DO NOTHING;

  -- Team B: used for the "assigned admin" positive case.
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status)
  VALUES (v_team_admin_assigned, v_h_id, 'TTL Team Assigned Case', v_leader2_id, 'TTLCASE0002B', 'forming', 'not_submitted')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_team_admin_assigned, v_leader2_id, v_h_id, 'leader'), (v_team_admin_assigned, v_member2_id, v_h_id, 'member')
  ON CONFLICT DO NOTHING;

  -- Team C: used for the ordinary leader-initiated happy path.
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status)
  VALUES (v_team_leader_happy, v_h_id, 'TTL Team Leader Happy Path', v_leader3_id, 'TTLCASE0003C', 'forming', 'not_submitted')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_team_leader_happy, v_leader3_id, v_h_id, 'leader'), (v_team_leader_happy, v_member3_id, v_h_id, 'member')
  ON CONFLICT DO NOTHING;

  -- Team D: external_status = 'submitted' -> roster-lock guard must block transfer.
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status)
  VALUES (v_team_submitted, v_h_id, 'TTL Team Submitted Case', v_leader4_id, 'TTLCASE0004D', 'forming', 'submitted')
  ON CONFLICT (id) DO UPDATE SET external_status = 'submitted';
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_team_submitted, v_leader4_id, v_h_id, 'leader'), (v_team_submitted, v_member4_id, v_h_id, 'member')
  ON CONFLICT DO NOTHING;

  -- Team E: a member already has points_ledger history -> points-ledger guard must block transfer.
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status)
  VALUES (v_team_points_history, v_h_id, 'TTL Team Points History Case', v_leader5_id, 'TTLCASE0005E', 'forming', 'not_submitted')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_team_points_history, v_leader5_id, v_h_id, 'leader'), (v_team_points_history, v_member5_id, v_h_id, 'member')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.points_ledger (
    idempotency_key, student_id, hackathon_id, team_id, milestone_type, role_at_award, points, reason, awarded_by
  ) VALUES (
    'ttl-fixture-points-key', v_member5_id, v_h_id, v_team_points_history, 'participation', 'member', 10, 'TTL fixture', v_sa_id
  ) ON CONFLICT (idempotency_key) DO NOTHING;
END $$;

-- TS-TTL-01: admin with global manage_teams but NO hackathon_admin_assignments
-- row for this hackathon is now denied (the hardening fix). Previously this
-- would have succeeded via the global current_has_permission check.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT throws_ok(
  $$ SELECT public.transfer_team_leadership('dddddddd-0000-0000-0000-000000000050'::uuid, 'dddddddd-0000-0000-0000-000000000031'::uuid); $$,
  '42501',
  NULL,
  'TS-TTL-01: admin with manage_teams but no hackathon assignment is denied (hardening fix)'
);

-- TS-TTL-02: admin WITH a matching hackathon_admin_assignments row succeeds.
RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT lives_ok(
  $$ SELECT public.transfer_team_leadership('dddddddd-0000-0000-0000-000000000051'::uuid, 'dddddddd-0000-0000-0000-000000000033'::uuid); $$,
  'TS-TTL-02: assigned admin with manage_teams succeeds (hackathon-scoped access preserved)'
);

-- TS-TTL-03: ordinary leader-initiated transfer on a forming/not_submitted
-- team with no points history still works (baseline happy path preserved).
RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000034';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT lives_ok(
  $$ SELECT public.transfer_team_leadership('dddddddd-0000-0000-0000-000000000052'::uuid, 'dddddddd-0000-0000-0000-000000000035'::uuid); $$,
  'TS-TTL-03: team leader can still transfer leadership on a forming, unsubmitted team'
);

-- TS-TTL-04: team with external_status='submitted' is now roster-locked
-- against a leadership transfer (new guard, matches leave_team/remove_team_member).
RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000036';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT throws_ok(
  $$ SELECT public.transfer_team_leadership('dddddddd-0000-0000-0000-000000000053'::uuid, 'dddddddd-0000-0000-0000-000000000037'::uuid); $$,
  '55P03',
  NULL,
  'TS-TTL-04: transfer blocked once registration proof has been submitted (roster-lock guard)'
);

-- TS-TTL-05: a member with existing points_ledger history blocks the transfer
-- (new guard, matches leave_team/remove_team_member).
RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000038';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT throws_ok(
  $$ SELECT public.transfer_team_leadership('dddddddd-0000-0000-0000-000000000054'::uuid, 'dddddddd-0000-0000-0000-000000000039'::uuid); $$,
  '55P03',
  NULL,
  'TS-TTL-05: transfer blocked once a member already has awarded points-ledger history'
);

RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";
SELECT * FROM finish();
ROLLBACK;
