-- Suite 3: Row-Level Security & Privilege Boundaries (TS-RLS)
BEGIN;
SELECT plan(26);

-- TS-RLS-01: Anonymous Direct Access Rejection
-- Connect as anon role. Direct SELECT and INSERT on profiles and points_ledger must fail at SQL grant layer
SET LOCAL ROLE anon;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT throws_ok(
  'SELECT * FROM public.profiles',
  '42501', -- permission_denied
  NULL,
  'TS-RLS-01a: Anonymous SELECT on public.profiles rejected with permission denied'
);

SELECT throws_ok(
  'SELECT * FROM public.points_ledger',
  '42501', -- permission_denied
  NULL,
  'TS-RLS-01b: Anonymous SELECT on public.points_ledger rejected with permission denied'
);

SELECT throws_ok(
  $$
  INSERT INTO public.profiles (id, email, full_name, usn, phone, branch, academic_year, registration_status)
  VALUES (gen_random_uuid(), 'anon@nmit-dev.local', 'Anon Hacker', '1NT21CS888', '+919999999998', 'CSE', 4, 'draft')
  $$,
  '42501', -- permission_denied
  NULL,
  'TS-RLS-01c: Anonymous direct INSERT on public.profiles rejected with permission denied'
);

-- TS-RLS-02: Student Cross-Tenant Profile Isolation
-- As Student 1 (UUID 00000000-0000-0000-0000-000000000003), querying Student 2 (UUID 00000000-0000-0000-0000-000000000004) returns 0 rows
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is_empty(
  'SELECT * FROM public.profiles WHERE id = ''00000000-0000-0000-0000-000000000004''::uuid',
  'TS-RLS-02: Student 1 querying Student 2 profile returns 0 rows (isolated by RLS)'
);

-- TS-RLS-03: Student Direct Approval Escalation Blocked
-- As Pending Student (UUID 00000000-0000-0000-0000-000000000005), attempting direct approval update throws exception
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';

SELECT throws_ok(
  'UPDATE public.profiles SET registration_status = ''approved'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001', -- raise_exception
  'Unauthorized column modification: registration_status and review metadata can only be updated by authorized administrators.',
  'TS-RLS-03: Direct status escalation to approved blocked by trg_protect_profile_columns'
);

-- TS-RLS-04: Direct Mutation on Immutable Ledger Revoked
-- As authenticated user, direct UPDATE on points_ledger must fail
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';

SELECT throws_ok(
  'UPDATE public.points_ledger SET points = 100 WHERE true',
  '42501', -- permission_denied (UPDATE revoked from authenticated)
  NULL,
  'TS-RLS-04: Direct UPDATE on points_ledger rejected with permission denied'
);

-- TS-RLS-05: Direct Profile INSERT and DELETE Revoked from Authenticated Students
SELECT throws_ok(
  $$
  INSERT INTO public.profiles (id, email, full_name, usn, phone, branch, academic_year, registration_status)
  VALUES (gen_random_uuid(), 'studentx@nmit-dev.local', 'Student X', '1NT21CS777', '+919999999997', 'CSE', 4, 'draft')
  $$,
  '42501', -- permission_denied (INSERT revoked from authenticated)
  NULL,
  'TS-RLS-05a: Authenticated student direct INSERT on public.profiles rejected with permission denied'
);

SELECT throws_ok(
  'DELETE FROM public.profiles WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  '42501', -- permission_denied (DELETE revoked from authenticated)
  NULL,
  'TS-RLS-05b: Authenticated student direct DELETE on public.profiles rejected with permission denied'
);

-- TS-RLS-06: Unverified Student Profile Access Blocked
-- As Student 1, querying unverified students returns 0 rows
SELECT is_empty(
  'SELECT * FROM public.profiles WHERE registration_status = ''under_review''',
  'TS-RLS-06: Student cannot see pending verification queue profiles'
);

-- TS-RLS-07: Direct Student Update to Auth-Managed Email Blocked
-- Pending Student 5 attempts to desynchronize profiles.email from auth.users.email
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';

SELECT throws_ok(
  'UPDATE public.profiles SET email = ''desynced@nmit.ac.in'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Profile email is managed by authentication and cannot be updated directly.',
  'TS-RLS-07a: Student cannot directly update auth-managed profile email'
);

SELECT is(
  (SELECT email FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000005'::uuid),
  'pending@nmit-dev.local',
  'TS-RLS-07b: Profile email remains unchanged after rejected update attempt'
);

-- TS-RLS-08: Storage Path Ownership & Cross-Tenant Spoofing Blocked
-- 1. Student 5 attempts to reference Student 4 college ID
SELECT throws_ok(
  'UPDATE public.profiles SET college_id_path = ''00000000-0000-0000-0000-000000000004/id_card.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Unauthorized college_id_path: storage object path must reside in student folder.',
  'TS-RLS-08a: Student cannot assign another student college ID path'
);

-- 2. Student 5 attempts to reference arbitrary non-existent object in own folder
SELECT throws_ok(
  'UPDATE public.profiles SET college_id_path = ''00000000-0000-0000-0000-000000000005/arbitrary_nonexistent.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid college_id_path: referenced object does not exist in college-ids storage or is not owned by the student.',
  'TS-RLS-08b: Student cannot assign non-existent college ID path'
);

-- 3. Student 5 attempts to reference Student 4 profile photo
SELECT throws_ok(
  'UPDATE public.profiles SET profile_photo_path = ''00000000-0000-0000-0000-000000000004/avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Unauthorized profile_photo_path: storage object path must reside in student folder.',
  'TS-RLS-08c: Student cannot assign another student profile photo path'
);

-- 4. Student 5 attempts to reference non-existent profile photo in own folder
SELECT throws_ok(
  'UPDATE public.profiles SET profile_photo_path = ''00000000-0000-0000-0000-000000000005/fake_avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid profile_photo_path: referenced object does not exist in profile-photos storage or is not owned by the student.',
  'TS-RLS-08d: Student cannot assign non-existent profile photo path'
);

-- 5. Student 5 attempts to assign college ID inside own folder prefix but owned by another student (Student 4)
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner)
VALUES (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000005/spoofed_card.png', '00000000-0000-0000-0000-000000000004');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET college_id_path = ''00000000-0000-0000-0000-000000000005/spoofed_card.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid college_id_path: referenced object does not exist in college-ids storage or is not owned by the student.',
  'TS-RLS-08e: College ID with student folder prefix but owned by another student is rejected'
);

-- 6. Student 5 attempts to assign college ID with missing ownership metadata (owner and owner_id NULL)
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id)
VALUES (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000005/unowned_card.png', NULL, NULL);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET college_id_path = ''00000000-0000-0000-0000-000000000005/unowned_card.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid college_id_path: referenced object does not exist in college-ids storage or is not owned by the student.',
  'TS-RLS-08f: College ID with student folder prefix but missing ownership metadata is rejected'
);

-- 7. Student 5 attempts to assign college ID with mismatched ownership metadata (owner_id conflicting)
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id)
VALUES (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000005/mismatched_card.png', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET college_id_path = ''00000000-0000-0000-0000-000000000005/mismatched_card.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid college_id_path: referenced object does not exist in college-ids storage or is not owned by the student.',
  'TS-RLS-08g: College ID with mismatched ownership metadata is rejected'
);

-- 8. Student 5 attempts to assign profile photo inside own folder prefix but owned by another student (Student 4)
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner)
VALUES (gen_random_uuid(), 'profile-photos', '00000000-0000-0000-0000-000000000005/spoofed_avatar.png', '00000000-0000-0000-0000-000000000004');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET profile_photo_path = ''00000000-0000-0000-0000-000000000005/spoofed_avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid profile_photo_path: referenced object does not exist in profile-photos storage or is not owned by the student.',
  'TS-RLS-08h: Profile photo with student folder prefix but owned by another student is rejected'
);

-- 9. Student 5 attempts to assign profile photo with missing ownership metadata (owner and owner_id NULL)
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id)
VALUES (gen_random_uuid(), 'profile-photos', '00000000-0000-0000-0000-000000000005/unowned_avatar.png', NULL, NULL);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET profile_photo_path = ''00000000-0000-0000-0000-000000000005/unowned_avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid profile_photo_path: referenced object does not exist in profile-photos storage or is not owned by the student.',
  'TS-RLS-08i: Profile photo with student folder prefix but missing ownership metadata is rejected'
);

-- 10. Student 5 attempts to assign profile photo with mismatched ownership metadata (owner_id conflicting)
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner, owner_id)
VALUES (gen_random_uuid(), 'profile-photos', '00000000-0000-0000-0000-000000000005/mismatched_avatar.png', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET profile_photo_path = ''00000000-0000-0000-0000-000000000005/mismatched_avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid profile_photo_path: referenced object does not exist in profile-photos storage or is not owned by the student.',
  'TS-RLS-08j: Profile photo with mismatched ownership metadata is rejected'
);

-- TS-RLS-09: Cross-Bucket Object Path Reference Blocked
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner)
VALUES (gen_random_uuid(), 'profile-photos', '00000000-0000-0000-0000-000000000005/my_avatar.png', '00000000-0000-0000-0000-000000000005');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  'UPDATE public.profiles SET college_id_path = ''00000000-0000-0000-0000-000000000005/my_avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'P0001',
  'Invalid college_id_path: referenced object does not exist in college-ids storage or is not owned by the student.',
  'TS-RLS-09: Object from profile-photos bucket rejected as college_id_path'
);

-- TS-RLS-10: Legitimate Authorized Profile Completion & Storage Association Succeeded
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner)
VALUES (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000005/verified_id.png', '00000000-0000-0000-0000-000000000005');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000005';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT lives_ok(
  'UPDATE public.profiles SET college_id_path = ''00000000-0000-0000-0000-000000000005/verified_id.png'', profile_photo_path = ''00000000-0000-0000-0000-000000000005/my_avatar.png'' WHERE id = ''00000000-0000-0000-0000-000000000005''::uuid',
  'TS-RLS-10a: Legitimate profile completion with owned storage objects succeeds'
);

SELECT is(
  (SELECT college_id_path FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000005'::uuid),
  '00000000-0000-0000-0000-000000000005/verified_id.png',
  'TS-RLS-10b: profiles.college_id_path matches uploaded object path'
);

SELECT is(
  (SELECT profile_photo_path FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000005'::uuid),
  '00000000-0000-0000-0000-000000000005/my_avatar.png',
  'TS-RLS-10c: profiles.profile_photo_path matches uploaded object path'
);

-- TS-RLS-11: Approved Student Detail & College ID Direct Modification Frozen
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';

SELECT throws_ok(
  'UPDATE public.profiles SET college_id_path = ''00000000-0000-0000-0000-000000000003/new_id.png'' WHERE id = ''00000000-0000-0000-0000-000000000003''::uuid',
  'P0001',
  'Approved student details cannot be modified directly. Submit a profile change request.',
  'TS-RLS-11: Approved student direct modification of college_id_path is frozen'
);

SELECT * FROM finish();
ROLLBACK;
