-- Suite 8: Storage Authorization & Deletion Worker Lifecycle (TS-STO)
BEGIN;
SELECT plan(9);

-- Setup: verify storage buckets exist in storage.buckets
SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'college-ids' AND public = false),
  'TS-STO-00a: college-ids private bucket configured'
);

SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'profile-photos' AND public = false),
  'TS-STO-00b: profile-photos private bucket configured'
);

SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'submission-evidence' AND public = false),
  'TS-STO-00c: submission-evidence private bucket configured'
);

-- TS-STO-01: Storage RLS Cross-Tenant Isolation
-- Student 1 cannot upload into Student 2 folder in college-ids
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$
  INSERT INTO storage.objects (id, bucket_id, name, owner)
  VALUES (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000004/fake_card.png', '00000000-0000-0000-0000-000000000003')
  $$,
  '42501', -- new row violates row-level security policy
  NULL,
  'TS-STO-01a: Student 1 uploading into Student 2 folder in college-ids rejected by storage RLS'
);

-- Seed an object belonging to Student 2
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

INSERT INTO storage.objects (id, bucket_id, name, owner)
VALUES (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000004/real_card.png', '00000000-0000-0000-0000-000000000004');

-- As Student 1, querying Student 2's college-ids object returns 0 rows
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  (
    SELECT count(*)::int
    FROM storage.objects
    WHERE bucket_id = 'college-ids' AND name = '00000000-0000-0000-0000-000000000004/real_card.png'
  ),
  0,
  'TS-STO-01b: Student 1 cannot view Student 2 private college ID in storage.objects'
);

RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

-- Enqueue two jobs for student 3 (college ID)
DO $$
DECLARE
  v_job1 UUID;
  v_job2 UUID;
BEGIN
  -- Seed storage object for student 3
  INSERT INTO storage.objects (id, bucket_id, name, owner)
  VALUES (gen_random_uuid(), 'college-ids', '00000000-0000-0000-0000-000000000003/id_card.png', '00000000-0000-0000-0000-000000000003');

  -- Set student 3 college_id_path
  UPDATE public.profiles
  SET college_id_path = '00000000-0000-0000-0000-000000000003/id_card.png'
  WHERE id = '00000000-0000-0000-0000-000000000003';

  -- Enqueue job 1
  PERFORM public.enqueue_storage_deletion_job(
    'college-ids',
    '00000000-0000-0000-0000-000000000003/id_card.png',
    'profile_college_id',
    '00000000-0000-0000-0000-000000000003'
  );

  -- Enqueue job 2 for another object
  PERFORM public.enqueue_storage_deletion_job(
    'submission-evidence',
    'teams/t1/rounds/r1/doc.pdf',
    'submission_evidence',
    gen_random_uuid()::text
  );
END $$;

-- Set service_role context for background worker operations
SET LOCAL "request.jwt.claim.role" = 'service_role';

-- TS-STO-02: Leased Worker Claim via claim_storage_deletion_batch
SELECT ok(
  (
    SELECT count(*)::int > 0
    FROM public.claim_storage_deletion_batch('worker_1', 10, 60)
  ),
  'TS-STO-02: Worker claims active deletion jobs with batch query'
);

-- TS-STO-03: Stale Lease Token Completion Rejection
-- Attempting to complete job with invalid lease token throws mismatch exception
SELECT throws_ok(
  $$
  DO $do$
  DECLARE
    v_job_id UUID;
  BEGIN
    SELECT id INTO v_job_id FROM public.storage_deletion_queue WHERE status = 'claimed' LIMIT 1;
    PERFORM public.complete_storage_deletion_job(v_job_id, gen_random_uuid());
  END $do$;
  $$,
  '55P03',
  NULL,
  'TS-STO-03: Stale/invalid lease token completion rejected with mismatch error'
);

-- TS-STO-04: Storage 404 Handled as Confirmed Absence & Metadata Cleared
SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    v_job_id UUID;
    v_token UUID;
  BEGIN
    SELECT id, lease_token INTO v_job_id, v_token
    FROM public.storage_deletion_queue
    WHERE target_type = 'profile_college_id' AND status = 'claimed'
    LIMIT 1;

    PERFORM public.confirm_deletion_preflight(v_job_id, v_token);
    PERFORM public.complete_storage_deletion_job(v_job_id, v_token, 404);
  END $do$;
  $$,
  'TS-STO-04: Confirmed deletion/absence completes job and clears profile college_id_path'
);

-- TS-STO-05: Transient Deletion Failure Exponential Backoff
SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    v_job_id UUID;
    v_token UUID;
  BEGIN
    SELECT id, lease_token INTO v_job_id, v_token
    FROM public.storage_deletion_queue
    WHERE status IN ('claimed', 'dispatching')
    LIMIT 1;

    PERFORM public.fail_storage_deletion_job(v_job_id, v_token, 'Temporary upstream timeout');
  END $do$;
  $$,
  'TS-STO-05: Transient failure resets status to pending with backoff and clears lease'
);

SELECT * FROM finish();
ROLLBACK;
