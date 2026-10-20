-- Suite 17: Phase 7 — Team Formation and Registration
-- Schema: public, storage
-- Created: 2026-10-20

BEGIN;
SELECT plan(37);

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
  v_h2_id UUID := '00000000-0000-0000-0000-000000000011';
  v_r1_id UUID := '00000000-0000-0000-0000-000000000020';
  v_t_active_id UUID := '00000000-0000-0000-0000-000000000050';
  v_t_solo_id UUID := '00000000-0000-0000-0000-000000000055';
BEGIN
  -- Ensure student 4 exists
  INSERT INTO auth.users (id, email)
  VALUES (v_s4_id, 'student95@nmit.ac.in')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status
  ) VALUES (
    v_s4_id, 'student95@nmit.ac.in', 'Student Ninety-Five', '1NT22CS095', '+919876543295', 'CSE', 3, 'Female'::public.gender, '2004-02-02'::date, 'approved'
  ) ON CONFLICT (id) DO UPDATE SET registration_status = 'approved';

  -- Ensure student 3 (Member 94) exists
  INSERT INTO auth.users (id, email)
  VALUES (v_s3_id, 'member94@nmit.ac.in')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status
  ) VALUES (
    v_s3_id, 'member94@nmit.ac.in', 'Member Ninety-Four', '1NT22CS094', '+919876543294', 'CSE', 3, 'Male'::public.gender, '2004-01-01'::date, 'approved'
  ) ON CONFLICT (id) DO UPDATE SET registration_status = 'approved';

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

  -- Ensure H1 is published with open registration
  UPDATE public.hackathons
  SET status = 'published',
      registration_start_at = now() - interval '2 days',
      registration_end_at = now() + interval '5 days',
      in_charge_admin_id = v_mgr1_id,
      min_team_size = 2,
      max_team_size = 4,
      is_solo_allowed = false
  WHERE id = v_h1_id;

  -- Ensure Round 1 in H1 is open and unpaused for base tests
  UPDATE public.hackathon_rounds
  SET status = 'open',
      start_at = now() - interval '1 day',
      end_at = now() + interval '5 days'
  WHERE id = v_r1_id;

  -- Ensure Admin 2 (Manager 2) exists in auth.users and admin_profiles
  INSERT INTO auth.users (id, email)
  VALUES (v_mgr2_id, 'manager2@nmit.ac.in')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
  VALUES (v_mgr2_id, 'manager2@nmit.ac.in', 'Manager Two', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;

  -- Ensure Manager 2 has export_data only (not assigned to H1 or H2, lacks manage_hackathons)
  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES (v_mgr2_id, 'export_data', v_sa_id)
  ON CONFLICT (admin_id, permission) DO NOTHING;

  -- Ensure Hackathon 2 exists for cross-hackathon tests (in-charge: Super Admin)
  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at,
    created_by, in_charge_admin_id
  ) VALUES (
    v_h2_id, 'Hackathon Two', 'hackathon-two', 'Event 2', 'Dept CSE', 'online', 'published',
    now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
    v_sa_id, v_sa_id
  ) ON CONFLICT (id) DO UPDATE SET in_charge_admin_id = v_sa_id, status = 'published';

  -- Clean up teams for fresh test baseline
  DELETE FROM public.points_ledger WHERE team_id IN (v_t_active_id, v_t_solo_id);
  DELETE FROM public.team_members WHERE team_id IN (v_t_active_id, v_t_solo_id);
  DELETE FROM public.teams WHERE id IN (v_t_active_id, v_t_solo_id);

  -- Create team T_active with Leader S1 and Member S2
  INSERT INTO public.teams (
    id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status
  ) VALUES (
    v_t_active_id, v_h1_id, 'DevOps Spartans', v_s1_id, 'SPARTAN12345', 'forming', 'not_submitted'
  );

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES
    (v_t_active_id, v_s1_id, v_h1_id, 'leader'),
    (v_t_active_id, v_s2_id, v_h1_id, 'member');

  -- Create team T_solo with Solo Leader S4
  INSERT INTO public.teams (
    id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status
  ) VALUES (
    v_t_solo_id, v_h1_id, 'Solo Phoenix', v_s4_id, 'SOLOPHOENIX1', 'forming', 'not_submitted'
  );

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES
    (v_t_solo_id, v_s4_id, v_h1_id, 'leader');

END $$;

-- ============================================================================
-- 1. AUTHORIZATION HELPERS TESTS
-- ============================================================================

-- Test 1: can_upload_registration_proof returns true for team leader
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  public.can_upload_registration_proof('00000000-0000-0000-0000-000000000050'),
  true,
  'Test 1: can_upload_registration_proof returns true for team leader'
);

-- Test 2: can_upload_registration_proof returns false for non-leader member
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004';
SELECT is(
  public.can_upload_registration_proof('00000000-0000-0000-0000-000000000050'),
  false,
  'Test 2: can_upload_registration_proof returns false for non-leader member'
);

-- Test 3: can_upload_registration_proof returns false when round 1 paused
RESET ROLE;
UPDATE public.hackathon_rounds
SET status = 'paused'
WHERE id = '00000000-0000-0000-0000-000000000020';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  public.can_upload_registration_proof('00000000-0000-0000-0000-000000000050'),
  false,
  'Test 3: can_upload_registration_proof returns false when registration round is paused'
);

-- Restore round 1 to open
RESET ROLE;
UPDATE public.hackathon_rounds
SET status = 'open'
WHERE id = '00000000-0000-0000-0000-000000000020';

-- Test 4: can_upload_registration_proof returns false when team is already verified
UPDATE public.teams
SET external_status = 'verified'
WHERE id = '00000000-0000-0000-0000-000000000050';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  public.can_upload_registration_proof('00000000-0000-0000-0000-000000000050'),
  false,
  'Test 4: can_upload_registration_proof returns false when team is verified'
);

-- Restore external_status
RESET ROLE;
UPDATE public.teams
SET external_status = 'not_submitted'
WHERE id = '00000000-0000-0000-0000-000000000050';

-- Test 5: can_upload_registration_proof handles malformed UUID safely without syntax crash
SET LOCAL ROLE authenticated;
SELECT is(
  public.can_upload_registration_proof('invalid-not-a-uuid'),
  false,
  'Test 5: can_upload_registration_proof safely handles malformed text without 22P02 crash'
);

-- Test 6: can_view_registration_proof returns true for enrolled team member
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004'; -- S2 member
SELECT is(
  public.can_view_registration_proof('00000000-0000-0000-0000-000000000050'),
  true,
  'Test 6: can_view_registration_proof returns true for enrolled teammate'
);

-- Test 7: can_view_registration_proof returns true for assigned in-charge admin
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1 assigned to H1
SELECT is(
  public.can_view_registration_proof('00000000-0000-0000-0000-000000000050'),
  true,
  'Test 7: can_view_registration_proof returns true for assigned in-charge admin'
);

-- Test 8: can_view_registration_proof returns false for unassigned admin with export_data
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000092'; -- Manager 2 (unassigned to H1)
SELECT is(
  public.can_view_registration_proof('00000000-0000-0000-0000-000000000050'),
  false,
  'Test 8: can_view_registration_proof returns false for unassigned admin with export_data'
);

-- Test 9: can_view_registration_proof returns false for unaffiliated student
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000095'; -- S4 not in team T1
SELECT is(
  public.can_view_registration_proof('00000000-0000-0000-0000-000000000050'),
  false,
  'Test 9: can_view_registration_proof returns false for unaffiliated student'
);

-- ============================================================================
-- 2. STORAGE RLS POLICY TESTS
-- ============================================================================

-- Seed dummy storage objects for team T1:
-- 1. Registration proof screenshot
RESET ROLE;
INSERT INTO storage.objects (
  id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata
) VALUES (
  '00000000-0000-0000-0000-000000000088'::uuid,
  'submission-evidence',
  'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png',
  '00000000-0000-0000-0000-000000000003'::uuid,
  now(), now(), now(),
  jsonb_build_object('size', 102400, 'mimetype', 'image/png')
) ON CONFLICT (id) DO NOTHING;

-- 2. Non-registration round evidence document
INSERT INTO storage.objects (
  id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata
) VALUES (
  '00000000-0000-0000-0000-000000000089'::uuid,
  'submission-evidence',
  'teams/00000000-0000-0000-0000-000000000050/rounds/00000000-0000-0000-0000-000000000020/round_submission.pdf',
  '00000000-0000-0000-0000-000000000003'::uuid,
  now(), now(), now(),
  jsonb_build_object('size', 204800, 'mimetype', 'application/pdf')
) ON CONFLICT (id) DO NOTHING;

-- Test 10: Assigned admin can SELECT private registration screenshot
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Manager 1
SELECT is(
  (SELECT COUNT(*)::int FROM storage.objects WHERE name = 'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png'),
  1,
  'Test 10: Storage SELECT policy permits assigned in-charge admin'
);

-- Test 10b: Enrolled team member can SELECT private registration screenshot
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004'; -- S2 Member
SELECT is(
  (SELECT COUNT(*)::int FROM storage.objects WHERE name = 'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png'),
  1,
  'Test 10b: Storage SELECT policy permits enrolled teammate'
);

-- Test 11: Unassigned admin with export_data CANNOT SELECT private registration screenshot
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000092'; -- Manager 2
SELECT is(
  (SELECT COUNT(*)::int FROM storage.objects WHERE name = 'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png'),
  0,
  'Test 11: Storage SELECT policy denies unassigned admin with export_data'
);

-- Test 11b: Unaffiliated student CANNOT SELECT private registration screenshot
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000095'; -- S4 unaffiliated student
SELECT is(
  (SELECT COUNT(*)::int FROM storage.objects WHERE name = 'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png'),
  0,
  'Test 11b: Storage SELECT policy denies unaffiliated student'
);

-- Test 11c: Unassigned admin with manage_hackathons CANNOT SELECT registration screenshot of unassigned hackathon
RESET ROLE;
INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
VALUES ('00000000-0000-0000-0000-000000000092', 'manage_hackathons', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (admin_id, permission) DO NOTHING;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000092'; -- Manager 2 with manage_hackathons
SELECT is(
  (SELECT COUNT(*)::int FROM storage.objects WHERE name = 'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png'),
  0,
  'Test 11c: Storage SELECT policy denies unassigned admin with manage_hackathons from reading registration proofs'
);

-- Test 11d: Admin with manage_hackathons CAN SELECT non-registration evidence (preserving existing access)
SELECT is(
  (SELECT COUNT(*)::int FROM storage.objects WHERE name = 'teams/00000000-0000-0000-0000-000000000050/rounds/00000000-0000-0000-0000-000000000020/round_submission.pdf'),
  1,
  'Test 11d: Existing submission_evidence_select policy still allows admin with manage_hackathons to read non-registration round evidence'
);

-- Test 11e: Enrolled team member CAN SELECT non-registration round evidence (preserving existing access)
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004'; -- S2 Member
SELECT is(
  (SELECT COUNT(*)::int FROM storage.objects WHERE name = 'teams/00000000-0000-0000-0000-000000000050/rounds/00000000-0000-0000-0000-000000000020/round_submission.pdf'),
  1,
  'Test 11e: Existing submission_evidence_select policy allows enrolled teammate to read round evidence'
);

-- ============================================================================
-- 3. LIFECYCLE RPC TESTS: leave_team & remove_team_member
-- ============================================================================

-- Test 12: Regular non-leader member leaves forming team
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004'; -- S2 member
SELECT lives_ok(
  $$
  SELECT public.leave_team('00000000-0000-0000-0000-000000000050'::uuid);
  $$,
  'Test 12: Regular member successfully leaves forming team'
);

-- Verify S2 is no longer in team T1
SELECT is(
  (SELECT COUNT(*)::int FROM public.team_members WHERE team_id = '00000000-0000-0000-0000-000000000050' AND student_id = '00000000-0000-0000-0000-000000000004'),
  0,
  'Test 12b: Member row deleted after leaving'
);

-- Re-add S2 and S3 to team T1 for subsequent tests
RESET ROLE;
INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
VALUES
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000010', 'member'),
  ('00000000-0000-0000-0000-000000000050', '00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000010', 'member');

-- Test 13: Multi-member leader attempts to leave without transferring leadership -> REJECTED
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- S1 Leader
SELECT throws_ok(
  $$
  SELECT public.leave_team('00000000-0000-0000-0000-000000000050'::uuid);
  $$,
  '55P03',
  'Team leader cannot leave a multi-member team without transferring leadership first.',
  'Test 13: Multi-member leader blocked from leaving without transferring leadership'
);

-- Test 14: Solo leader cleanly disbands team atomically
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000095'; -- S4 Solo Leader
SELECT lives_ok(
  $$
  SELECT public.leave_team('00000000-0000-0000-0000-000000000055'::uuid);
  $$,
  'Test 14: Solo leader disbands team atomically via deferred circular foreign key'
);

-- Verify T_solo and its membership are both deleted
SELECT is(
  (SELECT COUNT(*)::int FROM public.teams WHERE id = '00000000-0000-0000-0000-000000000055'),
  0,
  'Test 14b: Team row deleted upon solo leader disband'
);

-- Test 15: Leave team blocked once registration proof is submitted
RESET ROLE;
UPDATE public.teams
SET external_status = 'submitted'
WHERE id = '00000000-0000-0000-0000-000000000050';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004'; -- S2 Member
SELECT throws_ok(
  $$
  SELECT public.leave_team('00000000-0000-0000-0000-000000000050'::uuid);
  $$,
  '55P03',
  NULL,
  'Test 15: Member cannot leave team after registration proof has been submitted'
);

-- Restore external_status
RESET ROLE;
UPDATE public.teams
SET external_status = 'not_submitted'
WHERE id = '00000000-0000-0000-0000-000000000050';

-- Test 16: Leader removes unconfirmed member
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- S1 Leader
SELECT lives_ok(
  $$
  SELECT public.remove_team_member(
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000094'::uuid
  );
  $$,
  'Test 16: Team leader successfully removes unconfirmed member'
);

-- Test 17: Non-leader member denied from removing teammate
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004'; -- S2 Member
SELECT throws_ok(
  $$
  SELECT public.remove_team_member(
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid
  );
  $$,
  '42501',
  NULL,
  'Test 17: Non-leader denied from removing a member'
);

-- Test 18: Leader cannot remove self via remove_team_member
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- S1 Leader
SELECT throws_ok(
  $$
  SELECT public.remove_team_member(
    '00000000-0000-0000-0000-000000000050'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid
  );
  $$,
  '55P03',
  NULL,
  'Test 18: Leader cannot remove self via remove_team_member'
);

-- ============================================================================
-- 4. INVITATION CODE REGENERATION & ROSTER LOCKING
-- ============================================================================

-- Test 19: Leader regenerates invitation code
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- S1 Leader
SELECT lives_ok(
  $$
  SELECT public.regenerate_team_invitation_code('00000000-0000-0000-0000-000000000050'::uuid);
  $$,
  'Test 19: Team leader successfully regenerates invitation code'
);

SELECT isnt(
  (SELECT invitation_code FROM public.teams WHERE id = '00000000-0000-0000-0000-000000000050'),
  'SPARTAN12345',
  'Test 19b: Previous invitation code is invalidated and replaced'
);

-- Test 20: Non-leader denied from regenerating invitation code
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004'; -- S2 Member
SELECT throws_ok(
  $$
  SELECT public.regenerate_team_invitation_code('00000000-0000-0000-0000-000000000050'::uuid);
  $$,
  '42501',
  NULL,
  'Test 20: Non-leader denied from regenerating invitation code'
);

-- Test 21: lock_team_roster rejects when registration stage is paused
RESET ROLE;
UPDATE public.hackathon_rounds
SET status = 'paused'
WHERE id = '00000000-0000-0000-0000-000000000020';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- S1 Leader
SELECT throws_ok(
  $$
  SELECT public.lock_team_roster('00000000-0000-0000-0000-000000000050'::uuid);
  $$,
  '55P03',
  'Cannot lock roster: registration stage is currently paused.',
  'Test 21: lock_team_roster rejects when round 1 is paused'
);

-- Restore round 1 to open
RESET ROLE;
UPDATE public.hackathon_rounds
SET status = 'open'
WHERE id = '00000000-0000-0000-0000-000000000020';

-- ============================================================================
-- 5. REGISTRATION PROOF SUBMISSION & RETENTION QUEUE
-- ============================================================================

-- Test 22: submit_registration_proof rejects non-existent storage object
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- S1 Leader
SELECT throws_ok(
  $$
  SELECT public.submit_registration_proof(
    '00000000-0000-0000-0000-000000000050'::uuid,
    'teams/00000000-0000-0000-0000-000000000050/registration/11111111-1111-1111-1111-111111111111.png',
    true,
    'I accept the Career Development Centre (CDC) declaration and confirm this screenshot is genuine, unaltered proof.'
  );
  $$,
  'P0002',
  'Invalid proof path: object does not exist in storage.',
  'Test 22: submit_registration_proof rejects non-existent storage object'
);

-- Test 23: submit_registration_proof rejects malformed path format
SELECT throws_ok(
  $$
  SELECT public.submit_registration_proof(
    '00000000-0000-0000-0000-000000000050'::uuid,
    'teams/00000000-0000-0000-0000-000000000050/malformed_path.png',
    true,
    'I accept the Career Development Centre (CDC) declaration and confirm this screenshot is genuine, unaltered proof.'
  );
  $$,
  '22023',
  'Invalid registration proof path format.',
  'Test 23: submit_registration_proof rejects malformed path format'
);

-- Test 24: submit_registration_proof rejects when round 1 is paused
RESET ROLE;
UPDATE public.hackathon_rounds
SET status = 'paused'
WHERE id = '00000000-0000-0000-0000-000000000020';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SELECT throws_ok(
  $$
  SELECT public.submit_registration_proof(
    '00000000-0000-0000-0000-000000000050'::uuid,
    'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png',
    true,
    'I accept the Career Development Centre (CDC) declaration and confirm this screenshot is genuine, unaltered proof.'
  );
  $$,
  '55P03',
  'Cannot submit registration proof: registration stage is currently paused.',
  'Test 24: submit_registration_proof rejects when round 1 is paused'
);

-- Restore round 1
RESET ROLE;
UPDATE public.hackathon_rounds
SET status = 'open'
WHERE id = '00000000-0000-0000-0000-000000000020';

-- Test 25: submit_registration_proof rejects replacement when team is already verified
UPDATE public.teams
SET external_status = 'verified'
WHERE id = '00000000-0000-0000-0000-000000000050';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SELECT throws_ok(
  $$
  SELECT public.submit_registration_proof(
    '00000000-0000-0000-0000-000000000050'::uuid,
    'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png',
    true,
    'I accept the Career Development Centre (CDC) declaration and confirm this screenshot is genuine, unaltered proof.'
  );
  $$,
  '55P03',
  'Cannot modify registration proof: team has already been verified by an administrator.',
  'Test 25: submit_registration_proof rejects replacement when team is verified'
);

-- Test 26: submit_registration_proof succeeds and enqueues superseded proof to storage_deletion_queue
RESET ROLE;
UPDATE public.teams
SET external_status = 'submitted',
    external_proof_path = 'teams/00000000-0000-0000-0000-000000000050/registration/old_superseded_proof.png'
WHERE id = '00000000-0000-0000-0000-000000000050';

-- Delete existing queue entry for this path if any
DELETE FROM public.storage_deletion_queue
WHERE object_path = 'teams/00000000-0000-0000-0000-000000000050/registration/old_superseded_proof.png';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SELECT lives_ok(
  $$
  SELECT public.submit_registration_proof(
    '00000000-0000-0000-0000-000000000050'::uuid,
    'teams/00000000-0000-0000-0000-000000000050/registration/00000000-0000-0000-0000-000000000088.png',
    true,
    'I accept the Career Development Centre (CDC) declaration and confirm this screenshot is genuine, unaltered proof.'
  );
  $$,
  'Test 26: submit_registration_proof succeeds with valid storage object and CDC declaration'
);

-- Verify old proof was enqueued into storage_deletion_queue
RESET ROLE;
SELECT is(
  (SELECT COUNT(*)::int FROM public.storage_deletion_queue
   WHERE object_path = 'teams/00000000-0000-0000-0000-000000000050/registration/old_superseded_proof.png'
     AND target_type = 'superseded_registration_proof'
     AND status = 'pending'),
  1,
  'Test 26b: Superseded registration proof path cleanly enqueued to storage_deletion_queue'
);

-- ============================================================================
-- 6. INVARIANTS: ONE TEAM PER HACKATHON VS CROSS-HACKATHON TEAMS
-- ============================================================================

-- Test 27: Student cannot belong to two teams in the same hackathon
SELECT throws_ok(
  $$
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000003'::uuid, -- S1 is already in T1 for H1
    '00000000-0000-0000-0000-000000000010'::uuid, -- H1
    'member'
  );
  $$,
  '23505', -- unique_violation on uq_team_members_one_team_per_hackathon
  NULL,
  'Test 27: Database constraint uq_team_members_one_team_per_hackathon strictly rejects double-joining'
);

-- Test 28: Student CAN join a team in a different hackathon (H2)
-- Create team T_h2 in H2
DO $$
DECLARE
  v_t_h2_id UUID := gen_random_uuid();
  v_s1_id UUID := '00000000-0000-0000-0000-000000000003';
  v_h2_id UUID := '00000000-0000-0000-0000-000000000011';
BEGIN
  INSERT INTO public.teams (
    id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status
  ) VALUES (
    v_t_h2_id, v_h2_id, 'Cross Event Hackers', v_s1_id, 'CROSSEVENT01', 'forming', 'not_submitted'
  );

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_t_h2_id, v_s1_id, v_h2_id, 'leader');
END $$;

SELECT is(
  (SELECT (EXISTS(SELECT 1 FROM public.team_members WHERE student_id = '00000000-0000-0000-0000-000000000003'::uuid AND hackathon_id = '00000000-0000-0000-0000-000000000010'::uuid)
      AND EXISTS(SELECT 1 FROM public.team_members WHERE student_id = '00000000-0000-0000-0000-000000000003'::uuid AND hackathon_id = '00000000-0000-0000-0000-000000000011'::uuid))),
  true,
  'Test 28: Student can participate in different teams across different hackathons concurrently'
);

SELECT * FROM finish();
ROLLBACK;
