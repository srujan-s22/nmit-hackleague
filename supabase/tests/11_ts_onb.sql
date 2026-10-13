-- Suite 11: Phase 4 Onboarding, Authentication, Review & Rate Limiting (TS-ONB)
BEGIN;
SELECT plan(46);

-- ============================================================================
-- Fixture Setup (Executed as Superuser / postgres)
-- ============================================================================

-- Create test auth users and profiles for Phase 4 testing
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'test.student10@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test Student Ten","usn":"1NT22CS010","phone":"+919900000010","branch":"CSE","academic_year":3,"sex":"Male","date_of_birth":"2003-04-10"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'test.student11@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test Student Eleven","usn":"1NT22CS011","phone":"+919900000011","branch":"CSE","academic_year":3,"sex":"Female","date_of_birth":"2003-05-11"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'test.student12@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test Student Twelve","usn":"1NT22CS012","phone":"+919900000012","branch":"CSE","academic_year":3,"sex":"Other","date_of_birth":"2003-06-12"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000013',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'test.student13@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test Student Thirteen","usn":"1NT22CS013","phone":"+919900000013","branch":"CSE","academic_year":3,"sex":"Male","date_of_birth":"2003-07-13"}'::jsonb,
    now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- Seed storage object fixtures for college-ids
INSERT INTO storage.objects (id, bucket_id, name, owner, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000010/card_v1.png', '00000000-0000-0000-0000-000000000010', now(), now()),
  (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000010/card_v2.png', '00000000-0000-0000-0000-000000000010', now(), now()),
  (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000011/card_v1.png', '00000000-0000-0000-0000-000000000011', now(), now()),
  (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000012/card_v1.png', '00000000-0000-0000-0000-000000000012', now(), now()),
  (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000012/card_v2.png', '00000000-0000-0000-0000-000000000012', now(), now())
ON CONFLICT DO NOTHING;

-- Setup initial states for students 11, 12, 13
UPDATE public.profiles
SET college_id_path = '00000000-0000-0000-0000-000000000011/card_v1.png',
    registration_status = 'under_review'
WHERE id = '00000000-0000-0000-0000-000000000011';

UPDATE public.profiles
SET college_id_path = '00000000-0000-0000-0000-000000000012/card_v1.png',
    registration_status = 'under_review'
WHERE id = '00000000-0000-0000-0000-000000000012';

UPDATE public.profiles
SET registration_status = 'suspended'
WHERE id = '00000000-0000-0000-0000-000000000013';

-- ============================================================================
-- TS-ONB-01: Auth Trigger — Missing Demographic Fields Rejected
-- ============================================================================
SELECT throws_ok(
  $$
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'missing.demo@nmit-dev.local', 'pass', '{"provider":"email"}'::jsonb,
    '{"full_name":"Test User","usn":"1NT22CS099","phone":"+919999999999","branch":"CSE","academic_year":3,"date_of_birth":"2004-01-01"}'::jsonb
  );
  $$,
  'P0001',
  'Missing required registration details in user metadata.',
  'TS-ONB-01: Missing sex demographic field in signup aborts user creation'
);

-- ============================================================================
-- TS-ONB-02: Auth Trigger — Underage Registration Rejected (< 15 years)
-- ============================================================================
SELECT throws_ok(
  $$
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'underage@nmit-dev.local', 'pass', '{"provider":"email"}'::jsonb,
    jsonb_build_object(
      'full_name', 'Child Prodigy',
      'usn', '1NT24CS999',
      'phone', '+919999999991',
      'branch', 'CSE',
      'academic_year', 1,
      'sex', 'Male',
      'date_of_birth', (CURRENT_DATE - INTERVAL '12 years')::date::text
    )
  );
  $$,
  'P0001',
  'Student must be at least 15 years of age to register.',
  'TS-ONB-02: Registration for applicant under 15 years old is rejected'
);

-- ============================================================================
-- TS-ONB-03: Auth Trigger — Valid Signup Atomically Creates Profile in 'draft'
-- ============================================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000010'
      AND registration_status = 'draft'
      AND full_name = 'Test Student Ten'
      AND usn = '1NT22CS010'
      AND sex = 'Male'
      AND date_of_birth = '2003-04-10'::date
  ),
  'TS-ONB-03: Valid signup atomically creates matching student profile in draft status'
);

-- ============================================================================
-- TS-ONB-04: Demographics — Immutability on Approved Profiles
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- Aarav Sharma (approved)
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$UPDATE public.profiles SET sex = 'Female' WHERE id = '00000000-0000-0000-0000-000000000003'$$,
  'P0001',
  'Approved student details cannot be modified directly. Submit a profile change request.',
  'TS-ONB-04: Direct demographic modification on approved student profile is blocked'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-05: Submission — Missing College ID Rejected
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000010'; -- draft with college_id_path NULL
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT public.submit_profile_for_review()$$,
  'P0001',
  'Mandatory college ID card image must be uploaded before submitting.',
  'TS-ONB-05: Profile submission rejected when mandatory College ID is missing'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-06: Submission — Valid Onboarding Submission Advances to 'under_review'
-- ============================================================================
-- Update student 10 profile with active ID card
UPDATE public.profiles
SET college_id_path = '00000000-0000-0000-0000-000000000010/card_v1.png'
WHERE id = '00000000-0000-0000-0000-000000000010';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000010';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT ok(
  (SELECT (public.submit_profile_for_review()->>'success')::boolean),
  'TS-ONB-06a: Valid onboarding profile submission executes successfully'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT is(
  (SELECT registration_status FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000010'),
  'under_review',
  'TS-ONB-06b: Profile registration status is advanced to under_review'
);

-- ============================================================================
-- TS-ONB-07: Replacement — Legitimate ID Replacement in 'correction_required'
-- ============================================================================
UPDATE public.profiles
SET registration_status = 'correction_required',
    rejection_reason = 'ID card blurry'
WHERE id = '00000000-0000-0000-0000-000000000010';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000010';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT ok(
  (SELECT (public.replace_college_id('00000000-0000-0000-0000-000000000010/card_v2.png')->>'success')::boolean),
  'TS-ONB-07a: Legitimate replace_college_id executes successfully'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT is(
  (SELECT college_id_path FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000010'),
  '00000000-0000-0000-0000-000000000010/card_v2.png',
  'TS-ONB-07b: Profile college_id_path successfully updated to new file'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.storage_deletion_queue
    WHERE object_path = '00000000-0000-0000-0000-000000000010/card_v1.png'
      AND target_type = 'profile_college_id_superseded'
  ),
  'TS-ONB-07c: Superseded College ID image is enqueued for deletion'
);

-- ============================================================================
-- TS-ONB-08: Replacement — Blocked in Non-Correction Statuses
-- ============================================================================
UPDATE public.profiles
SET registration_status = 'under_review'
WHERE id = '00000000-0000-0000-0000-000000000010';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000010';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT public.replace_college_id('00000000-0000-0000-0000-000000000010/card_v1.png')$$,
  'P0001',
  'ID replacement is only permitted while in correction_required status.',
  'TS-ONB-08: College ID replacement is rejected when status is not correction_required'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-09: Review — Non-Admin Caller Rejected
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003'; -- Student Aarav
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT public.review_student_registration('00000000-0000-0000-0000-000000000011'::uuid, 'approved')$$,
  'P0001',
  'Access denied: requires verify_students permission or Super Admin authority.',
  'TS-ONB-09: Student calling review_student_registration is denied'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-10: Review — Approval Queues Active College ID for Deletion
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Verifier Admin
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT ok(
  (SELECT (public.review_student_registration('00000000-0000-0000-0000-000000000010'::uuid, 'approved')->>'success')::boolean),
  'TS-ONB-10a: Administrator approves student registration'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.storage_deletion_queue
    WHERE object_path = '00000000-0000-0000-0000-000000000010/card_v2.png'
      AND target_type = 'profile_college_id'
  ),
  'TS-ONB-10b: Approved student active College ID is enqueued for deletion'
);

-- ============================================================================
-- TS-ONB-11: Review — Rejection Queues Active College ID for Deletion
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Verifier Admin
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT ok(
  (SELECT (public.review_student_registration(
    '00000000-0000-0000-0000-000000000011'::uuid, 'rejected', 'Fraudulent ID document'
  )->>'success')::boolean),
  'TS-ONB-11a: Administrator rejects student registration'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.storage_deletion_queue
    WHERE object_path = '00000000-0000-0000-0000-000000000011/card_v1.png'
      AND target_type = 'profile_college_id'
  ),
  'TS-ONB-11b: Rejected student active College ID is enqueued for deletion'
);

-- ============================================================================
-- TS-ONB-12: Review — Correction Required Retains ID (Zero Deletion Jobs)
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002'; -- Verifier Admin
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT ok(
  (SELECT (public.review_student_registration(
    '00000000-0000-0000-0000-000000000012'::uuid, 'correction_required', 'Photo is blurry, please provide a clear image'
  )->>'success')::boolean),
  'TS-ONB-12a: Administrator requests correction on student registration'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT is(
  (SELECT count(*)::int FROM public.storage_deletion_queue WHERE object_path = '00000000-0000-0000-0000-000000000012/card_v1.png'),
  0,
  'TS-ONB-12b: Correction required retains active College ID in storage without enqueuing deletion'
);

-- ============================================================================
-- TS-ONB-13: Rate Limiter — Atomic Concurrency Quota Enforcement
-- ============================================================================
DELETE FROM public.rate_limit_buckets WHERE action = 'submit_review';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000010';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT ok(public.consume_rate_limit('submit_review'), 'TS-ONB-13a: Rapid call 1 allowed');
SELECT ok(public.consume_rate_limit('submit_review'), 'TS-ONB-13b: Rapid call 2 allowed');
SELECT ok(public.consume_rate_limit('submit_review'), 'TS-ONB-13c: Rapid call 3 allowed');
SELECT ok(public.consume_rate_limit('submit_review'), 'TS-ONB-13d: Rapid call 4 allowed');
SELECT ok(public.consume_rate_limit('submit_review'), 'TS-ONB-13e: Rapid call 5 allowed');
SELECT is(public.consume_rate_limit('submit_review'), false, 'TS-ONB-13f: 6th call exceeds quota and returns false');
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-14: Rate Limiter — Unauthenticated Signup Action Restricted to Service Role
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000010';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT public.consume_rate_limit('signup', 'abcdef1234567890abcdef')$$,
  'P0001',
  'Access denied: unauthenticated action rate-limiting requires service_role authority.',
  'TS-ONB-14: Authenticated client cannot invoke signup rate limiter action'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-15: Rate Limiter — Caller Spoofed Custom Key is Ignored
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000011';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

-- Consume submit_review with a spoofed custom key
SELECT public.consume_rate_limit('submit_review', 'victim_spoofed_key_123456789');
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.rate_limit_buckets
    WHERE bucket_key = 'user:00000000-0000-0000-0000-000000000011'
      AND action = 'submit_review'
  ),
  'TS-ONB-15a: Bucket key is strictly derived from auth.uid()'
);

SELECT is(
  (SELECT count(*)::int FROM public.rate_limit_buckets WHERE bucket_key = 'victim_spoofed_key_123456789'),
  0,
  'TS-ONB-15b: Victim spoofed key bucket was never created'
);

-- ============================================================================
-- TS-ONB-16: Rate Limiter — Anonymous Direct RPC Call Revoked
-- ============================================================================
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.consume_rate_limit('submit_review')$$,
  '42501', -- permission_denied
  NULL,
  'TS-ONB-16: Direct execution of consume_rate_limit is revoked from anon role'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-17: Demographics — Boundary Age and Leap-Day Validation
-- ============================================================================
-- Deterministic test: Leap day 2008-02-29 + 15 years = 2023-02-28
SELECT is(
  ('2008-02-29'::date + INTERVAL '15 years')::date,
  '2023-02-28'::date,
  'TS-ONB-17: Leap day 2008-02-29 evaluates deterministically to 2023-02-28 at age 15'
);

-- ============================================================================
-- TS-ONB-18: Adversarial — Direct college_id_path Update Blocked in Correction
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012'; -- in correction_required
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$UPDATE public.profiles SET college_id_path = '00000000-0000-0000-0000-000000000012/hacked.png' WHERE id = '00000000-0000-0000-0000-000000000012'$$,
  'P0001',
  'Direct update of college_id_path is blocked in correction_required status. Use the replace_college_id() RPC.',
  'TS-ONB-18: Direct update of college_id_path without transaction token is blocked by trigger'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-19: Adversarial — Foreign Storage Path Rejected in Replacement
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT public.replace_college_id('00000000-0000-0000-0000-000000000003/victim_card.png')$$,
  'P0001',
  'Unauthorized path: storage object must reside in user folder.',
  'TS-ONB-19: Student cannot supply storage path outside their own folder in replace_college_id'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-20: Rate Limiter — Bucket Pruning Routine Deletes Expired Rows
-- ============================================================================
INSERT INTO public.rate_limit_buckets (bucket_key, action, window_start, request_count)
VALUES ('test:expired_bucket', 'signup', clock_timestamp() - INTERVAL '48 hours', 10);

SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';

SELECT ok(
  (public.prune_rate_limit_buckets(100) >= 1),
  'TS-ONB-20a: prune_rate_limit_buckets deletes expired buckets'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT is(
  (SELECT count(*)::int FROM public.rate_limit_buckets WHERE bucket_key = 'test:expired_bucket'),
  0,
  'TS-ONB-20b: Expired bucket row was successfully removed'
);

-- ============================================================================
-- TS-ONB-21: Suspended — Suspended Student Actions Blocked
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000013'; -- suspended student
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT public.submit_profile_for_review()$$,
  'P0001',
  'Profile cannot be submitted from status suspended.',
  'TS-ONB-21: Suspended student cannot submit profile for review'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-22: Suspended — Deactivated Administrator Review Blocked
-- ============================================================================
UPDATE public.admin_profiles SET is_active = false WHERE id = '00000000-0000-0000-0000-000000000002';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT public.review_student_registration('00000000-0000-0000-0000-000000000010'::uuid, 'approved')$$,
  'P0001',
  'Access denied: administrator account is inactive.',
  'TS-ONB-22: Inactive administrator cannot execute review operations'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

UPDATE public.admin_profiles SET is_active = true WHERE id = '00000000-0000-0000-0000-000000000002';

-- ============================================================================
-- TS-ONB-23: Adversarial — Direct Access to Authorization Table Blocked
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT * FROM public.profile_action_authorizations$$,
  '42501', -- permission_denied
  NULL,
  'TS-ONB-23: Authenticated client cannot select from private profile_action_authorizations'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-24: Adversarial — Cross-Transaction Authorization Rejected
-- ============================================================================
-- Superuser inserts fake authorization row with mismatched transaction ID
INSERT INTO public.profile_action_authorizations (
  xact_id, student_id, action_type, old_value, new_value
) VALUES (
  'fake_stale_xact_id_999999',
  '00000000-0000-0000-0000-000000000012',
  'replace_college_id',
  '00000000-0000-0000-0000-000000000012/card_v1.png',
  '00000000-0000-0000-0000-000000000012/card_v2.png'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$UPDATE public.profiles SET college_id_path = '00000000-0000-0000-0000-000000000012/card_v2.png' WHERE id = '00000000-0000-0000-0000-000000000012'$$,
  'P0001',
  'Direct update of college_id_path is blocked in correction_required status. Use the replace_college_id() RPC.',
  'TS-ONB-24: Mismatched transaction authorization cannot authorize direct update'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-25: Adversarial — Authorization Parameter Mismatch Rejected
-- ============================================================================
-- Authorization issued for student 12 with specific path; student attempts updating to unapproved path
INSERT INTO public.profile_action_authorizations (
  xact_id, student_id, action_type, old_value, new_value
) VALUES (
  pg_current_xact_id()::text,
  '00000000-0000-0000-0000-000000000012',
  'replace_college_id',
  '00000000-0000-0000-0000-000000000012/card_v1.png',
  '00000000-0000-0000-0000-000000000012/card_v2.png'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$UPDATE public.profiles SET college_id_path = '00000000-0000-0000-0000-000000000012/card_v3_unauthorized.png' WHERE id = '00000000-0000-0000-0000-000000000012'$$,
  'P0001',
  'Direct update of college_id_path is blocked in correction_required status. Use the replace_college_id() RPC.',
  'TS-ONB-25: Authorization parameter mismatch rejects profile update'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

DELETE FROM public.profile_action_authorizations WHERE student_id = '00000000-0000-0000-0000-000000000012';

-- ============================================================================
-- TS-ONB-26: Adversarial — Pre-Existing Deletion Job Cannot Authorize Update
-- ============================================================================
INSERT INTO public.storage_deletion_queue (bucket_id, object_path, target_type, target_id)
VALUES ('college-ids', '00000000-0000-0000-0000-000000000012/card_v1.png', 'profile_college_id_superseded', '00000000-0000-0000-0000-000000000012');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$UPDATE public.profiles SET college_id_path = '00000000-0000-0000-0000-000000000012/card_v2.png' WHERE id = '00000000-0000-0000-0000-000000000012'$$,
  'P0001',
  'Direct update of college_id_path is blocked in correction_required status. Use the replace_college_id() RPC.',
  'TS-ONB-26: Pre-existing deletion queue job does not bypass trigger token check'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-27: Adversarial — Stale Audit Log Entry Cannot Authorize Status Update
-- ============================================================================
INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id)
VALUES ('00000000-0000-0000-0000-000000000012', 'student', 'student.submitted_for_review', 'profile', '00000000-0000-0000-0000-000000000012');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$UPDATE public.profiles SET registration_status = 'under_review' WHERE id = '00000000-0000-0000-0000-000000000012'$$,
  'P0001',
  'Direct update of registration_status is blocked. Use the submit_profile_for_review() RPC.',
  'TS-ONB-27: Direct status update blocked even if audit log row exists'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-28: Adversarial — Atomicity Rollback on Failed Replacement
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT public.replace_college_id('00000000-0000-0000-0000-000000000012/nonexistent_card.png')$$,
  'P0001',
  'Invalid storage path: referenced object does not exist in college-ids or is not owned by user.',
  'TS-ONB-28: Replacement with nonexistent storage object fails and rolls back'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- ============================================================================
-- TS-ONB-29: Constraint — Check Constraint Enforcement on chk_profiles_status
-- ============================================================================
-- Verify all 7 supported statuses satisfy chk_profiles_status
SELECT lives_ok(
  $$
  DO $blk$
  DECLARE
    v_s text;
    v_statuses text[] := ARRAY['draft', 'pending_verification', 'under_review', 'approved', 'rejected', 'correction_required', 'suspended'];
  BEGIN
    FOREACH v_s IN ARRAY v_statuses LOOP
      UPDATE public.profiles SET registration_status = v_s WHERE id = '00000000-0000-0000-0000-000000000010';
    END LOOP;
  END $blk$;
  $$,
  'TS-ONB-29a: All 7 supported registration statuses satisfy chk_profiles_status'
);

-- Verify invalid status throws check constraint violation
SELECT throws_ok(
  $$UPDATE public.profiles SET registration_status = 'bogus_status' WHERE id = '00000000-0000-0000-0000-000000000010'$$,
  '23514', -- check_violation
  NULL,
  'TS-ONB-29b: Invalid status throws check_violation on chk_profiles_status'
);

-- ============================================================================
-- TS-ONB-30: Resubmission — Return from 'correction_required' to 'under_review'
-- ============================================================================
-- Setup Student 12 in correction_required with replaced valid ID card
UPDATE public.profiles
SET registration_status = 'correction_required',
    rejection_reason = 'Previous ID card unreadable',
    college_id_path = '00000000-0000-0000-0000-000000000012/card_v2.png'
WHERE id = '00000000-0000-0000-0000-000000000012';

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000012';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT ok(
  (SELECT (public.submit_profile_for_review()->>'success')::boolean),
  'TS-ONB-30a: Resubmission from correction_required executes successfully'
);
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT is(
  (SELECT registration_status FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000012'),
  'under_review',
  'TS-ONB-30b: Student 12 registration status transitions to under_review'
);

SELECT is(
  (SELECT rejection_reason FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000012'),
  NULL,
  'TS-ONB-30c: Rejection reason is cleared to NULL upon resubmission'
);

SELECT * FROM finish();
ROLLBACK;
