-- ============================================================================
-- Suite 20: Phase 10 — Student Profiles, Protected Change Requests & Dashboard
-- Authoritative Specification: PHASE_10_IMPLEMENTATION_PLAN.md v2.1.0
-- Coverage: P10-DB-01 through P10-DB-40
-- ============================================================================

BEGIN;
SELECT plan(49);

-- ============================================================================
-- FIXTURES SETUP
-- ============================================================================

DO $$
DECLARE
  v_sa_id UUID := '00000000-0000-0000-0000-000000000001';
  v_adm_manage_id UUID := '00000000-0000-0000-0000-000000000002';
  v_adm_unassigned_id UUID := '00000000-0000-0000-0000-000000000092';
  v_s1_id UUID := '00000000-0000-0000-0000-000000000003';
  v_s2_id UUID := '00000000-0000-0000-0000-000000000004';
  v_s3_unapproved_id UUID := '00000000-0000-0000-0000-000000000099';
  v_h1_id UUID := '00000000-0000-0000-0000-000000000010';
  v_t1_id UUID := '00000000-0000-0000-0000-000000000050';
BEGIN
  -- 1. Create Auth Users
  INSERT INTO auth.users (id, email)
  VALUES
    (v_s1_id, 'student1_p10@nmit.ac.in'),
    (v_s2_id, 'student2_p10@nmit.ac.in'),
    (v_s3_unapproved_id, 'unapproved_p10@nmit.ac.in'),
    (v_sa_id, 'superadmin_p10@nmit.ac.in'),
    (v_adm_manage_id, 'admin_manage_p10@nmit.ac.in'),
    (v_adm_unassigned_id, 'admin_unassigned_p10@nmit.ac.in')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Admin Profiles & Permissions
  INSERT INTO public.admin_profiles (id, full_name, email, is_super_admin, is_active)
  VALUES
    (v_sa_id, 'Super Admin P10', 'superadmin_p10@nmit.ac.in', true, true),
    (v_adm_manage_id, 'Admin Manage P10', 'admin_manage_p10@nmit.ac.in', false, true),
    (v_adm_unassigned_id, 'Admin Unassigned P10', 'admin_unassigned_p10@nmit.ac.in', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true;

  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES
    (v_adm_manage_id, 'manage_students', v_sa_id),
    (v_adm_manage_id, 'manage_teams', v_sa_id),
    (v_adm_manage_id, 'manage_hackathons', v_sa_id),
    (v_adm_manage_id, 'view_audit_logs', v_sa_id),
    (v_adm_unassigned_id, 'manage_teams', v_sa_id)
  ON CONFLICT (admin_id, permission) DO NOTHING;

  -- 3. Create Student Profiles
  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status
  ) VALUES
    (v_s1_id, 'student1_p10@nmit.ac.in', 'Student One', '1NT22CS010', '+919876543210', 'CSE', 3, 'Male'::public.gender, '2004-01-01'::date, 'approved'),
    (v_s2_id, 'student2_p10@nmit.ac.in', 'Student Two', '1NT22CS020', '+919876543220', 'ISE', 2, 'Female'::public.gender, '2005-02-02'::date, 'approved'),
    (v_s3_unapproved_id, 'unapproved_p10@nmit.ac.in', 'Unapproved Student', '1NT23CS099', '+919876543299', 'AIML', 1, 'Male'::public.gender, '2006-03-03'::date, 'under_review')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    usn = EXCLUDED.usn,
    phone = EXCLUDED.phone,
    branch = EXCLUDED.branch,
    academic_year = EXCLUDED.academic_year,
    registration_status = EXCLUDED.registration_status;

  -- 4. Create Hackathon & Team
  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at, created_by, in_charge_admin_id
  ) VALUES (
    v_h1_id, 'Phase 10 Hack', 'phase-10-hack', 'A hackathon for P10 tests', 'NMIT', 'offline', 'published',
    now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days', v_sa_id, v_adm_manage_id
  ) ON CONFLICT (id) DO UPDATE SET in_charge_admin_id = EXCLUDED.in_charge_admin_id;

  INSERT INTO public.teams (
    id, hackathon_id, name, leader_id, invitation_code
  ) VALUES (
    v_t1_id, v_h1_id, 'P10 Team Alpha', v_s1_id, 'P10ALPHA'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.team_members (
    team_id, student_id, hackathon_id, role
  ) VALUES
    (v_t1_id, v_s1_id, v_h1_id, 'leader'),
    (v_t1_id, v_s2_id, v_h1_id, 'member')
  ON CONFLICT (team_id, student_id) DO NOTHING;

  -- 5. Create storage object fixture for avatar test
  INSERT INTO storage.objects (id, bucket_id, name, owner)
  VALUES (
    gen_random_uuid(),
    'profile-photos',
    '00000000-0000-0000-0000-000000000003/valid_avatar.png',
    '00000000-0000-0000-0000-000000000003'
  ) ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- TESTS P10-DB-01 to P10-DB-06: Direct Phone & Photo Modification
-- ============================================================================

-- P10-DB-01: Direct phone update with valid Indian format succeeds
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT lives_ok(
  'UPDATE public.profiles SET phone = ''+919876543299'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P10-DB-01: Direct phone update with valid Indian mobile succeeds'
);

-- P10-DB-02: Direct phone update with invalid format fails with check constraint violation (23514)
SELECT throws_ok(
  'UPDATE public.profiles SET phone = ''12345'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  '23514',
  NULL,
  'P10-DB-02: Direct phone update with invalid format fails with 23514'
);

-- P10-DB-03: Direct profile photo path within student folder succeeds
SELECT lives_ok(
  'UPDATE public.profiles SET profile_photo_path = ''00000000-0000-0000-0000-000000000003/valid_avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P10-DB-03: Direct profile photo path within student folder succeeds'
);

-- P10-DB-04: Direct profile photo path with path traversal (..) is rejected
SELECT throws_ok(
  'UPDATE public.profiles SET profile_photo_path = ''00000000-0000-0000-0000-000000000003/../avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Unauthorized profile_photo_path: storage object path must reside in student folder.',
  'P10-DB-04: Direct profile photo path with path traversal is rejected'
);

-- P10-DB-05: Direct profile photo path targeting another student folder is rejected
SELECT throws_ok(
  'UPDATE public.profiles SET profile_photo_path = ''00000000-0000-0000-0000-000000000004/avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Unauthorized profile_photo_path: storage object path must reside in student folder.',
  'P10-DB-05: Direct profile photo path targeting another student folder is rejected'
);

-- P10-DB-06: Direct profile photo deletion (setting path to NULL) succeeds
SELECT lives_ok(
  'UPDATE public.profiles SET profile_photo_path = NULL WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P10-DB-06: Direct profile photo deletion (setting NULL) succeeds'
);

-- ============================================================================
-- TESTS P10-DB-07 to P10-DB-10: Trigger Protection on Approved Profiles
-- ============================================================================

-- P10-DB-07: Direct student update of full_name on approved profile rejected
SELECT throws_ok(
  'UPDATE public.profiles SET full_name = ''Hacked Name'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly: missing, invalid, or mismatched change request authorization.',
  'P10-DB-07: Direct student update of full_name is rejected by trigger'
);

-- P10-DB-08: Direct student update of usn on approved profile rejected
SELECT throws_ok(
  'UPDATE public.profiles SET usn = ''1NT22CS999'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly: missing, invalid, or mismatched change request authorization.',
  'P10-DB-08: Direct student update of usn is rejected by trigger'
);

-- Switch to admin with manage_students
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-09: Direct admin update of full_name on approved profile is rejected by trigger
SELECT throws_ok(
  'UPDATE public.profiles SET full_name = ''Admin Changed'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly: missing, invalid, or mismatched change request authorization.',
  'P10-DB-09: Direct admin update of full_name on approved profile is rejected by trigger'
);

-- P10-DB-10: Direct admin update with forged session setting is rejected
SET LOCAL "nmit.active_profile_change_request_id" = '00000000-0000-0000-0000-000000000999';
SELECT throws_ok(
  'UPDATE public.profiles SET full_name = ''Forged Admin'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly: missing, invalid, or mismatched change request authorization.',
  'P10-DB-10: Direct admin update with forged session setting is rejected by trigger'
);

-- ============================================================================
-- TESTS P10-DB-11 to P10-DB-18: submit_profile_change_request Validation
-- ============================================================================

-- Switch to unapproved student
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-11: Unapproved student cannot call submit_profile_change_request
SELECT throws_ok(
  'SELECT public.submit_profile_change_request(''full_name'', ''New Name'', ''Name correction needed'')',
  '22023',
  'Only verified, approved students may submit profile correction requests.',
  'P10-DB-11: Unapproved student cannot call submit_profile_change_request'
);

-- Switch to approved Student 1
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-12: Invalid field name (e.g. email) rejected with 22023
SELECT throws_ok(
  'SELECT public.submit_profile_change_request(''email'', ''new@test.com'', ''Change email request'')',
  '22023',
  'Invalid field name: email (Must be full_name, usn, branch, or academic_year).',
  'P10-DB-12: Invalid field name is rejected with 22023'
);

-- P10-DB-13: Reason < 10 characters rejected with 22023
SELECT throws_ok(
  'SELECT public.submit_profile_change_request(''full_name'', ''Student Prime'', ''Short'')',
  '22023',
  'Reason must be at least 10 characters long.',
  'P10-DB-13: Short reason is rejected with 22023'
);

-- P10-DB-14: Invalid USN format rejected with 22023
SELECT throws_ok(
  'SELECT public.submit_profile_change_request(''usn'', ''INVALID_USN'', ''Official college registration update'')',
  '22023',
  'USN must follow standard format (e.g., 1NT22CS001).',
  'P10-DB-14: Invalid USN format is rejected with 22023'
);

-- P10-DB-15: Invalid branch rejected with 22023
SELECT throws_ok(
  'SELECT public.submit_profile_change_request(''branch'', ''AEROSPACE'', ''Transferred branch officially'')',
  '22023',
  'Branch must be an accredited academic department.',
  'P10-DB-15: Invalid branch is rejected with 22023'
);

-- P10-DB-16: Academic year < 1 or > 4 rejected with 22023
SELECT throws_ok(
  'SELECT public.submit_profile_change_request(''academic_year'', ''5'', ''Advanced year update request'')',
  '22023',
  'Academic year must be between 1 and 4.',
  'P10-DB-16: Academic year > 4 is rejected with 22023'
);

-- P10-DB-17: Proposed value identical to current value rejected with 22023
SELECT throws_ok(
  'SELECT public.submit_profile_change_request(''full_name'', ''Student One'', ''No actual modification requested'')',
  '22023',
  'Proposed value is identical to current profile value.',
  'P10-DB-17: No-op change request is rejected with 22023'
);

-- Submit a valid change request for full_name
SELECT lives_ok(
  'SELECT public.submit_profile_change_request(''full_name'', ''Student One Updated'', ''Correcting spelling on my marks card'')',
  'Submit valid full_name change request'
);

-- P10-DB-18: Second pending change request for the same field is rejected (23505)
SELECT throws_ok(
  'SELECT public.submit_profile_change_request(''full_name'', ''Student Another Name'', ''Second request before review'')',
  '23505',
  'A pending change request for full_name already exists. Wait for review before submitting another.',
  'P10-DB-18: Second pending change request for same field fails with 23505'
);

-- ============================================================================
-- TESTS P10-DB-19 to P10-DB-20: Permission Checks on Approval RPC
-- ============================================================================

-- P10-DB-19: Student attempting to call approve_profile_change_request is rejected (42501)
SELECT throws_ok(
  'SELECT public.approve_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000003''::uuid AND status = ''pending'' LIMIT 1))',
  '42501',
  'Unauthorized: Requires manage_students permission.',
  'P10-DB-19: Student cannot call approve_profile_change_request (42501)'
);

-- Switch to admin without manage_students
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000092';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-20: Admin without manage_students cannot call approve_profile_change_request (42501)
SELECT throws_ok(
  'SELECT public.approve_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000003''::uuid AND status = ''pending'' LIMIT 1))',
  '42501',
  'Unauthorized: Requires manage_students permission.',
  'P10-DB-20: Admin without manage_students cannot call approve_profile_change_request (42501)'
);

-- ============================================================================
-- TEST P10-DB-21: Valid Approval Flow
-- ============================================================================

-- Switch to admin with manage_students
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-21: Valid Request ID Authorization: approval updates profile and marks request approved
SELECT lives_ok(
  'SELECT public.approve_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000003''::uuid AND status = ''pending'' LIMIT 1))',
  'P10-DB-21: Valid approval succeeds and updates profile'
);

-- Verify profile updated to new name
SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000003'::uuid),
  'Student One Updated',
  'Profile full_name matches approved new value'
);

-- ============================================================================
-- TESTS P10-DB-22 to P10-DB-27: Adversarial Authorization & Multi-Field Tests
-- ============================================================================

-- Submit change request for branch on Student 1
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT lives_ok(
  'SELECT public.submit_profile_change_request(''branch'', ''ISE'', ''Transferred department to Information Science'')',
  'Submit valid branch change request'
);

-- Reset to superuser to test adversarial injection directly into profile_action_authorizations
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- P10-DB-22: Adversarial: Token with mismatched request_id fails
DO $$
DECLARE
  v_mismatched_req_id UUID;
BEGIN
  -- Use existing approved request_id (satisfies FK constraint but mismatches pending branch request)
  SELECT id INTO v_mismatched_req_id FROM public.profile_change_requests
  WHERE student_id = '00000000-0000-0000-0000-000000000003'::uuid AND status = 'approved' AND field_name = 'full_name';

  -- Insert token with mismatched request_id
  INSERT INTO public.profile_action_authorizations (
    xact_id, student_id, action_type, old_value, new_value, request_id
  ) VALUES (
    pg_current_xact_id()::text,
    '00000000-0000-0000-0000-000000000003'::uuid,
    'approve_profile_change',
    'branch:CSE',
    'branch:ISE',
    v_mismatched_req_id
  );
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET branch = ''ISE'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly: missing, invalid, or mismatched change request authorization.',
  'P10-DB-22: Token with mismatched request_id is rejected by trigger'
);

RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- P10-DB-23: Adversarial: Token with request_id belonging to another student is rejected
DO $$
DECLARE
  v_req_id UUID;
BEGIN
  -- Create pending request for Student 2
  INSERT INTO public.profile_change_requests (
    student_id, field_name, old_value, new_value, reason, status
  ) VALUES (
    '00000000-0000-0000-0000-000000000004'::uuid,
    'academic_year',
    '2',
    '3',
    'Passed 2nd year examinations',
    'pending'
  ) RETURNING id INTO v_req_id;

  -- Insert token for Student 1 referencing Student 2 request
  INSERT INTO public.profile_action_authorizations (
    xact_id, student_id, action_type, old_value, new_value, request_id
  ) VALUES (
    pg_current_xact_id()::text,
    '00000000-0000-0000-0000-000000000003'::uuid,
    'approve_profile_change',
    'academic_year:3',
    'academic_year:4',
    v_req_id
  );
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET academic_year = 4 WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly: missing, invalid, or mismatched change request authorization.',
  'P10-DB-23: Token referencing request of different student is rejected'
);

RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- P10-DB-24: Adversarial: Multi-field piggyback attempt fails
DO $$
DECLARE
  v_req_id UUID;
BEGIN
  SELECT id INTO v_req_id FROM public.profile_change_requests
  WHERE student_id = '00000000-0000-0000-0000-000000000003'::uuid AND status = 'pending' AND field_name = 'branch';

  -- Insert valid token for branch
  INSERT INTO public.profile_action_authorizations (
    xact_id, student_id, action_type, old_value, new_value, request_id
  ) VALUES (
    pg_current_xact_id()::text,
    '00000000-0000-0000-0000-000000000003'::uuid,
    'approve_profile_change',
    'branch:CSE',
    'branch:ISE',
    v_req_id
  );
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- Attempt updating both branch (valid) and usn (unauthorized piggyback)
SELECT throws_ok(
  'UPDATE public.profiles SET branch = ''ISE'', usn = ''1NT22CS999'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly: exactly one institutional field may be updated per approved change request.',
  'P10-DB-24: Multi-field piggyback attempt fails with single-field exception'
);

-- P10-DB-25: Adversarial: Token replay is prevented (single-use token)
-- Update branch legitimately using the token inserted above
SELECT lives_ok(
  'UPDATE public.profiles SET branch = ''ISE'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'Legitimate single-field update consumes token'
);

-- Attempt a second update with the same token (already consumed/deleted)
SELECT throws_ok(
  'UPDATE public.profiles SET branch = ''AIML'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly: missing, invalid, or mismatched change request authorization.',
  'P10-DB-25: Token replay attempt is rejected because token was consumed'
);

-- P10-DB-26: Adversarial: Failed authorization preserves rollback integrity
SELECT is(
  (SELECT branch FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000003'::uuid),
  'ISE',
  'P10-DB-26: Rollback integrity: profile retains consistent state'
);

-- P10-DB-27: Failed authorization boundary: pending request remains pending
SELECT is(
  (SELECT status FROM public.profile_change_requests WHERE student_id = '00000000-0000-0000-0000-000000000003'::uuid AND field_name = 'branch'),
  'pending',
  'P10-DB-27: Failed authorization boundary: request was not falsely approved'
);

-- ============================================================================
-- TESTS P10-DB-28: Approval Audit Integrity
-- ============================================================================

-- P10-DB-28: Audit log was written for previous valid approval (P10-DB-21)
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'student.profile_changed' AND target_type = 'profile_change_request' AND details->>'student_id' = '00000000-0000-0000-0000-000000000003'),
  1,
  'P10-DB-28: Valid approval writes immutable row to audit_logs'
);

-- ============================================================================
-- TESTS P10-DB-29 to P10-DB-32: Stale Request Guards
-- ============================================================================

-- Switch to admin with manage_students
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-31: Stale Request Guard (branch): Request recorded old_value = 'CSE', but profile branch is now 'ISE'
SELECT throws_ok(
  'SELECT public.approve_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000003''::uuid AND field_name = ''branch'' LIMIT 1))',
  '22023',
  NULL,
  'P10-DB-31: Stale request guard aborts approval when current value differs from old_value'
);

-- Clean up stale branch request and create fresh requests for full_name, usn, academic_year stale tests
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- P10-DB-29: Stale Request Guard (full_name)
DO $$
DECLARE
  v_req_id UUID;
BEGIN
  INSERT INTO public.profile_change_requests (
    student_id, field_name, old_value, new_value, reason, status
  ) VALUES (
    '00000000-0000-0000-0000-000000000004'::uuid,
    'full_name',
    'Student Two Stale',
    'Student Two Corrected',
    'Name change submission',
    'pending'
  ) RETURNING id INTO v_req_id;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'SELECT public.approve_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000004''::uuid AND field_name = ''full_name'' LIMIT 1))',
  '22023',
  NULL,
  'P10-DB-29: Stale full_name request guard raises 22023'
);

-- P10-DB-30: Stale Request Guard (usn)
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

DO $$
DECLARE
  v_req_id UUID;
BEGIN
  INSERT INTO public.profile_change_requests (
    student_id, field_name, old_value, new_value, reason, status
  ) VALUES (
    '00000000-0000-0000-0000-000000000004'::uuid,
    'usn',
    '1NT22CS000',
    '1NT22CS088',
    'USN change submission',
    'pending'
  ) RETURNING id INTO v_req_id;
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'SELECT public.approve_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000004''::uuid AND field_name = ''usn'' LIMIT 1))',
  '22023',
  NULL,
  'P10-DB-30: Stale USN request guard raises 22023'
);

-- P10-DB-32: Stale Request Guard (academic_year)
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

DO $$
BEGIN
  -- Update recorded old_value on Student 2 academic_year request to a stale value '1'
  UPDATE public.profile_change_requests
  SET old_value = '1'
  WHERE student_id = '00000000-0000-0000-0000-000000000004'::uuid AND field_name = 'academic_year';
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'SELECT public.approve_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000004''::uuid AND field_name = ''academic_year'' LIMIT 1))',
  '22023',
  NULL,
  'P10-DB-32: Stale academic_year request guard raises 22023'
);

-- ============================================================================
-- TESTS P10-DB-33 to P10-DB-35: Rejection Flow
-- ============================================================================

-- P10-DB-33: Admin rejects change request with valid reason
SELECT lives_ok(
  'SELECT public.reject_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000004''::uuid AND field_name = ''usn'' LIMIT 1), ''Official USN cannot be verified against college registrar records.'')',
  'P10-DB-33: Rejection of change request succeeds'
);

-- P10-DB-34: Rejection writes immutable row to audit_logs
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE action = 'student.profile_change_rejected' AND details->>'student_id' = '00000000-0000-0000-0000-000000000004'),
  1,
  'P10-DB-34: Rejection records audit_log entry'
);

-- P10-DB-35: Approving already rejected request raises 22023
SELECT throws_ok(
  'SELECT public.approve_profile_change_request((SELECT id FROM public.profile_change_requests WHERE student_id = ''00000000-0000-0000-0000-000000000004''::uuid AND field_name = ''usn'' LIMIT 1))',
  '22023',
  NULL,
  'P10-DB-35: Approving already rejected request raises 22023'
);

-- ============================================================================
-- TESTS P10-DB-36 to P10-DB-40: get_team_roster Privacy & Access
-- ============================================================================

-- Switch to Student 1 (leader of Team 1)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-36: Team member calling get_team_roster returns 2 roster members
SELECT is(
  (SELECT count(*)::integer FROM public.get_team_roster('00000000-0000-0000-0000-000000000050'::uuid)),
  2,
  'P10-DB-36: Team member receives team roster rows'
);

-- P10-DB-37: Sanitized projection: leader is Student One Updated, member is Student Two
SELECT is(
  (SELECT full_name FROM public.get_team_roster('00000000-0000-0000-0000-000000000050'::uuid) WHERE role = 'leader'),
  'Student One Updated',
  'P10-DB-37: Roster projection contains teammate full_name without PII leaks'
);

-- Switch to non-member student (Student 3 / unapproved student)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-38: Non-member student calling get_team_roster raises 42501
SELECT throws_ok(
  'SELECT * FROM public.get_team_roster(''00000000-0000-0000-0000-000000000050''::uuid)',
  '42501',
  'Access denied: You must be a member of this team or an authorized administrator for this event.',
  'P10-DB-38: Non-member student denied roster access (42501)'
);

-- Switch to unassigned admin (has manage_teams, but not assigned to this hackathon)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000092';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-39: Unassigned admin calling get_team_roster raises 42501
SELECT throws_ok(
  'SELECT * FROM public.get_team_roster(''00000000-0000-0000-0000-000000000050''::uuid)',
  '42501',
  'Access denied: You must be a member of this team or an authorized administrator for this event.',
  'P10-DB-39: Unassigned admin denied team roster access (42501)'
);

-- Switch to assigned in-charge admin (assigned to this hackathon)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- P10-DB-40: Event-assigned admin calling get_team_roster succeeds
SELECT lives_ok(
  'SELECT * FROM public.get_team_roster(''00000000-0000-0000-0000-000000000050''::uuid)',
  'P10-DB-40: Event-assigned admin can view team roster'
);

-- ============================================================================
-- TESTS P10-DB-41 to P10-DB-45: Profile Photos Storage RLS Policies
-- ============================================================================

-- P10-DB-41: Owner (Student 1) can read their own profile photo from storage
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'profile-photos' AND name = '00000000-0000-0000-0000-000000000003/valid_avatar.png'),
  1,
  'P10-DB-41: Owner can read their own profile photo from storage'
);

-- P10-DB-42: Teammate (Student 2, on team 00000000-0000-0000-0000-000000000050) can read Student 1 avatar
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000004';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'profile-photos' AND name = '00000000-0000-0000-0000-000000000003/valid_avatar.png'),
  1,
  'P10-DB-42: Authorized teammate can read teammate profile photo from storage'
);

-- P10-DB-43: Unrelated authenticated student (Student 3, not on team) denied read access
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000099';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'profile-photos' AND name = '00000000-0000-0000-0000-000000000003/valid_avatar.png'),
  0,
  'P10-DB-43: Unrelated authenticated student denied read access to another student profile photo'
);

-- P10-DB-44: Authorized Administrator (with manage_students) can read student profile photo
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'profile-photos' AND name = '00000000-0000-0000-0000-000000000003/valid_avatar.png'),
  1,
  'P10-DB-44: Authorized administrator can read student profile photo from storage'
);

-- P10-DB-45: Unassigned Administrator (without manage_students/verify_students) denied read access
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000092';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  (SELECT count(*)::integer FROM storage.objects WHERE bucket_id = 'profile-photos' AND name = '00000000-0000-0000-0000-000000000003/valid_avatar.png'),
  0,
  'P10-DB-45: Unassigned admin without manage_students denied access to student profile photo'
);

-- ============================================================================
-- FINISH SUITE
-- ============================================================================

SELECT finish();
ROLLBACK;
