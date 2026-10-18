-- ============================================================================
-- Test Suite: 14_ts_phase4_operational_safety.sql
-- Description: Phase 4 Operational Safety, Concurrency Races & Invariants
-- Specification: Phase 4 Plan v6.2.11
-- ============================================================================

BEGIN;
SELECT plan(19);

-- Helper variables
CREATE TEMPORARY TABLE test_phase4_vars (
  admin_id UUID,
  super_admin_id UUID,
  student_id UUID,
  hackathon_id UUID,
  round_id UUID,
  team_id UUID,
  submission_id UUID,
  job_id UUID,
  completed_job_id UUID,
  quarantined_job_id UUID,
  lease_token UUID
);

-- Setup test fixtures
DO $$
DECLARE
  v_admin_id UUID := '00000000-0000-0000-0000-000000000070';
  v_super_admin_id UUID := '00000000-0000-0000-0000-000000000001'; -- Existing super admin from seed
  v_student_id UUID := '00000000-0000-0000-0000-000000000071';
  v_hackathon_id UUID := gen_random_uuid();
  v_round_id UUID := gen_random_uuid();
  v_team_id UUID := gen_random_uuid();
  v_submission_id UUID := gen_random_uuid();
BEGIN
  -- 1. Create Admin User in auth.users
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_admin_id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'admin_p4_70@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
    '{"full_name":"In Charge Admin 70","role":"admin"}'::jsonb,
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
  VALUES (v_admin_id, 'admin_p4_70@nmit-dev.local', 'In Charge Admin 70', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;

  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES (v_admin_id, 'manage_hackathons', v_super_admin_id)
  ON CONFLICT (admin_id, permission) DO NOTHING;

  -- 2. Create Student in auth.users and profiles
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_student_id, '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'student_p4_71@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Student P4 71","usn":"1NT22CS999","phone":"9876543210","branch":"CSE","academic_year":3,"sex":"Male","date_of_birth":"2003-01-01"}'::jsonb,
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status)
  VALUES (v_student_id, 'student_p4_71@nmit-dev.local', 'Student P4 71', '1NT22CS999', '9876543210', 'CSE', 3, 'Male', '2003-01-01', 'approved')
  ON CONFLICT (id) DO UPDATE SET registration_status = 'approved';

  -- 3. Create Hackathon with in_charge_admin_id
  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at,
    created_by, in_charge_admin_id
  ) VALUES (
    v_hackathon_id, 'Phase 4 Hackathon', 'phase-4-hack-' || substr(v_hackathon_id::text, 1, 8),
    'Test Hackathon', 'Dept of CSE', 'offline', 'published',
    now() - interval '10 days', now() - interval '5 days', now() - interval '2 days', now() + interval '2 days',
    v_admin_id, v_admin_id
  );

  -- 4. Create Round
  INSERT INTO public.hackathon_rounds (id, hackathon_id, round_number, name, start_at, end_at, status)
  VALUES (v_round_id, v_hackathon_id, 1, 'Round 1', now() - interval '2 days', now() + interval '1 day', 'open');

  -- 5. Create Team
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status)
  VALUES (v_team_id, v_hackathon_id, 'Team P4 ' || substr(v_team_id::text, 1, 8), v_student_id, 'INV-' || substr(v_team_id::text, 1, 8), 'forming');

  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_team_id, v_student_id, v_hackathon_id, 'leader');

  -- 6. Create Submission
  INSERT INTO public.submissions (
    id, hackathon_id, round_id, team_id, submitted_by, title,
    evidence_path, evidence_lifecycle_state, evidence_uploaded_at
  ) VALUES (
    v_submission_id, v_hackathon_id, v_round_id, v_team_id, v_student_id, 'Submission P4',
    'evidence/' || v_hackathon_id || '/' || v_submission_id || '/v1_proof.pdf', 'uploaded', now()
  );

  INSERT INTO test_phase4_vars (admin_id, super_admin_id, student_id, hackathon_id, round_id, team_id, submission_id)
  VALUES (v_admin_id, v_super_admin_id, v_student_id, v_hackathon_id, v_round_id, v_team_id, v_submission_id);
END $$;

-- Set service_role context for worker RPC execution
SET LOCAL "request.jwt.claim.role" = 'service_role';

-- ----------------------------------------------------------------------------
-- TEST 1: TS-SAF-05: Legacy Worker Blocked by Incompatibility Barrier (55000)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT * FROM public.claim_storage_deletion_jobs('legacy_worker', 10, 60) $$,
  '55000',
  'FATAL: Legacy storage deletion worker (Migration 10) is incompatible with Migration 15 retention rules.',
  'TS-SAF-05: Legacy worker claim blocked by database incompatibility barrier (SQLSTATE 55000)'
);

-- ----------------------------------------------------------------------------
-- TEST 2: TS-RAC-01: Completion Wins Lock Before Quarantine
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID;
  v_s_id UUID;
  v_job_id UUID;
  v_lease UUID := gen_random_uuid();
BEGIN
  SELECT hackathon_id, submission_id INTO v_h_id, v_s_id FROM test_phase4_vars;

  -- Create job in dispatching with valid lease
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status,
    lease_token, leased_until, dispatch_attempted_at, retention_deadline_at
  ) VALUES (
    v_h_id, 'submission-evidence', 'evidence/' || v_h_id || '/' || v_s_id || '/rac01.pdf',
    'submission_evidence', v_s_id::text, 'dispatching',
    v_lease, now() + interval '10 seconds', now(), now() - interval '1 second'
  ) RETURNING id INTO v_job_id;

  -- Worker completion arrives before lease expires
  PERFORM public.complete_storage_deletion_job(v_job_id, v_lease, 200);

  -- Quarantine sweeper runs afterwards
  PERFORM public.quarantine_expired_dispatches(50);

  UPDATE test_phase4_vars SET completed_job_id = v_job_id, lease_token = v_lease;
END $$;

SELECT is(
  (SELECT status FROM public.storage_deletion_queue WHERE id = (SELECT completed_job_id FROM test_phase4_vars)),
  'completed',
  'TS-RAC-01a: Completion serialized before quarantine marks job completed'
);

SELECT is(
  (SELECT deletion_outcome FROM public.storage_deletion_queue WHERE id = (SELECT completed_job_id FROM test_phase4_vars)),
  'PURGED_SUPERSEDED_VERSION',
  'TS-RAC-01b: Outcome recorded as PURGED_SUPERSEDED_VERSION (path mismatch with active submission); quarantine did not overwrite'
);

-- ----------------------------------------------------------------------------
-- TEST 3: TS-RAC-02: Quarantine Wins Lock Before Late Completion
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID;
  v_s_id UUID;
  v_job_id UUID;
  v_lease UUID := gen_random_uuid();
BEGIN
  SELECT hackathon_id, submission_id INTO v_h_id, v_s_id FROM test_phase4_vars;

  -- Create job in dispatching with EXPIRED lease
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status,
    lease_token, leased_until, dispatch_attempted_at, retention_deadline_at
  ) VALUES (
    v_h_id, 'submission-evidence', 'evidence/' || v_h_id || '/' || v_s_id || '/rac02.pdf',
    'submission_evidence', v_s_id::text, 'dispatching',
    v_lease, now() - interval '2 seconds', now() - interval '32 seconds', now() - interval '1 day'
  ) RETURNING id INTO v_job_id;

  -- Quarantine sweeper runs and wins lock
  PERFORM public.quarantine_expired_dispatches(50);

  UPDATE test_phase4_vars SET quarantined_job_id = v_job_id, lease_token = v_lease;
END $$;

SELECT is(
  (SELECT status FROM public.storage_deletion_queue WHERE id = (SELECT quarantined_job_id FROM test_phase4_vars)),
  'cooldown',
  'TS-RAC-02a: Quarantine sweeper transitions expired dispatch to cooldown'
);

-- Late worker completion attempts to commit but is rejected
SELECT throws_ok(
  format(
    $$ SELECT public.complete_storage_deletion_job('%s'::uuid, '%s'::uuid, 200) $$,
    (SELECT quarantined_job_id FROM test_phase4_vars),
    (SELECT lease_token FROM test_phase4_vars)
  ),
  '55P03',
  NULL,
  'TS-RAC-02b: Late worker completion rejected with 55P03 when job is in cooldown'
);

-- ----------------------------------------------------------------------------
-- TEST 4: TS-RAC-03: Duplicate Callback After Completion (Idempotent NO-OP)
-- ----------------------------------------------------------------------------
SELECT lives_ok(
  format(
    $$ SELECT public.complete_storage_deletion_job('%s'::uuid, gen_random_uuid(), 200) $$,
    (SELECT completed_job_id FROM test_phase4_vars)
  ),
  'TS-RAC-03: Duplicate callback on completed job is idempotent NO-OP'
);

-- ----------------------------------------------------------------------------
-- TEST 5: TS-RAC-04: Late Callback on Reconciling Job Rejected (55P03)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_job_id UUID := (SELECT quarantined_job_id FROM test_phase4_vars);
BEGIN
  -- Advance cooldown to expired, and claim for reconciliation
  UPDATE public.storage_deletion_queue
  SET cooldown_until = now() - interval '1 second'
  WHERE id = v_job_id;

  PERFORM public.claim_reconciliation_batch('reconciler_1', 10, 30);
END $$;

SELECT is(
  (SELECT status FROM public.storage_deletion_queue WHERE id = (SELECT quarantined_job_id FROM test_phase4_vars)),
  'reconciling',
  'TS-RAC-04a: Cooldown job claimed for reconciliation'
);

SELECT throws_ok(
  format(
    $$ SELECT public.complete_storage_deletion_job('%s'::uuid, '%s'::uuid, 200) $$,
    (SELECT quarantined_job_id FROM test_phase4_vars),
    (SELECT lease_token FROM test_phase4_vars)
  ),
  '55P03',
  NULL,
  'TS-RAC-04b: Late completion callback on reconciling job rejected with 55P03'
);

-- ----------------------------------------------------------------------------
-- TEST 6: TS-SAF-03A: Orphan Target with Valid Lease (Legitimate Cleanup)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID := (SELECT hackathon_id FROM test_phase4_vars);
  v_orphaned_target_id UUID := gen_random_uuid();
  v_job_id UUID;
  v_lease UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status,
    lease_token, leased_until, dispatch_attempted_at, retention_deadline_at
  ) VALUES (
    v_h_id, 'submission-evidence', 'evidence/orphaned/doc.pdf',
    'submission_evidence', v_orphaned_target_id::text, 'dispatching',
    v_lease, now() + interval '20 seconds', now(), now()
  ) RETURNING id INTO v_job_id;

  PERFORM public.complete_storage_deletion_job(v_job_id, v_lease, 200);

  UPDATE test_phase4_vars SET job_id = v_job_id;
END $$;

SELECT is(
  (SELECT deletion_outcome FROM public.storage_deletion_queue WHERE id = (SELECT job_id FROM test_phase4_vars)),
  'PURGED_ORPHANED_OBJECT',
  'TS-SAF-03A: Confirmed deletion of orphaned target records PURGED_ORPHANED_OBJECT'
);

-- ----------------------------------------------------------------------------
-- TEST 7: TS-SAF-03B: Orphan Target with Invalid Lease Rejected (55P03)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID := (SELECT hackathon_id FROM test_phase4_vars);
  v_orphaned_target_id UUID := gen_random_uuid();
  v_job_id UUID;
BEGIN
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status,
    lease_token, leased_until, dispatch_attempted_at, retention_deadline_at
  ) VALUES (
    v_h_id, 'submission-evidence', 'evidence/orphaned/doc2.pdf',
    'submission_evidence', v_orphaned_target_id::text, 'dispatching',
    gen_random_uuid(), now() + interval '20 seconds', now(), now()
  ) RETURNING id INTO v_job_id;

  UPDATE test_phase4_vars SET job_id = v_job_id;
END $$;

SELECT throws_ok(
  format(
    $$ SELECT public.complete_storage_deletion_job('%s'::uuid, gen_random_uuid(), 200) $$,
    (SELECT job_id FROM test_phase4_vars)
  ),
  '55P03',
  NULL,
  'TS-SAF-03B: Orphan target completion with invalid lease rejected with 55P03'
);

-- ----------------------------------------------------------------------------
-- TEST 8: TS-SAF-04A: Replacement Upload (Superseded Version Isolation)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID := (SELECT hackathon_id FROM test_phase4_vars);
  v_s_id UUID := (SELECT submission_id FROM test_phase4_vars);
  v_v1_path TEXT := 'evidence/' || v_h_id || '/' || v_s_id || '/v1.pdf';
  v_v2_path TEXT := 'evidence/' || v_h_id || '/' || v_s_id || '/v2.pdf';
  v_job_id UUID;
  v_lease UUID := gen_random_uuid();
BEGIN
  -- Job targets V1
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status,
    lease_token, leased_until, dispatch_attempted_at, retention_deadline_at
  ) VALUES (
    v_h_id, 'submission-evidence', v_v1_path,
    'submission_evidence', v_s_id::text, 'dispatching',
    v_lease, now() + interval '20 seconds', now(), now()
  ) RETURNING id INTO v_job_id;

  -- Submission was updated to V2 (replacement upload occurred)
  UPDATE public.submissions
  SET evidence_path = v_v2_path,
      evidence_lifecycle_state = 'uploaded'
  WHERE id = v_s_id;

  -- Worker completes deletion of V1
  PERFORM public.complete_storage_deletion_job(v_job_id, v_lease, 200);

  UPDATE test_phase4_vars SET job_id = v_job_id;
END $$;

SELECT is(
  (SELECT deletion_outcome FROM public.storage_deletion_queue WHERE id = (SELECT job_id FROM test_phase4_vars)),
  'PURGED_SUPERSEDED_VERSION',
  'TS-SAF-04A1: Deletion of superseded version recorded as PURGED_SUPERSEDED_VERSION'
);

SELECT is(
  (SELECT evidence_lifecycle_state FROM public.submissions WHERE id = (SELECT submission_id FROM test_phase4_vars)),
  'uploaded',
  'TS-SAF-04A2: Active replacement submission lifecycle state remains uploaded (untouched)'
);

-- ----------------------------------------------------------------------------
-- TEST 9: TS-SAF-04C: Reconciliation HEAD 200 (Object Still Present)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID := (SELECT hackathon_id FROM test_phase4_vars);
  v_s_id UUID := (SELECT submission_id FROM test_phase4_vars);
  v_job_id UUID;
  v_lease UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status,
    lease_token, leased_until, retention_deadline_at, retry_count, max_retries
  ) VALUES (
    v_h_id, 'submission-evidence', 'evidence/present/doc.pdf',
    'submission_evidence', v_s_id::text, 'reconciling',
    v_lease, now() + interval '20 seconds', now(), 0, 3
  ) RETURNING id INTO v_job_id;

  -- Reconciliation HEAD returned 200 (object present!)
  PERFORM public.resolve_reconciliation_job(v_job_id, v_lease, 200);

  UPDATE test_phase4_vars SET job_id = v_job_id;
END $$;

SELECT is(
  (SELECT status FROM public.storage_deletion_queue WHERE id = (SELECT job_id FROM test_phase4_vars)),
  'pending',
  'TS-SAF-04C: Object present on reconciliation (HEAD 200) resets to pending with retry backoff'
);

-- ----------------------------------------------------------------------------
-- TEST 10: TS-SAF-04D: Reconciliation HEAD 404 (Verified Absence)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID := (SELECT hackathon_id FROM test_phase4_vars);
  v_s_id UUID := (SELECT submission_id FROM test_phase4_vars);
  v_job_id UUID;
  v_lease UUID := gen_random_uuid();
BEGIN
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status,
    lease_token, leased_until, retention_deadline_at, retry_count, max_retries
  ) VALUES (
    v_h_id, 'submission-evidence', 'evidence/absent/doc.pdf',
    'submission_evidence', v_s_id::text, 'reconciling',
    v_lease, now() + interval '20 seconds', now(), 0, 3
  ) RETURNING id INTO v_job_id;

  -- Point submission to this path so it matches active version
  UPDATE public.submissions SET evidence_path = 'evidence/absent/doc.pdf' WHERE id = v_s_id;

  -- Reconciliation HEAD returned 404
  PERFORM public.resolve_reconciliation_job(v_job_id, v_lease, 404);

  UPDATE test_phase4_vars SET job_id = v_job_id;
END $$;

SELECT is(
  (SELECT deletion_outcome FROM public.storage_deletion_queue WHERE id = (SELECT job_id FROM test_phase4_vars)),
  'ABSENT_RECONCILED_POST_TIMEOUT',
  'TS-SAF-04D: Reconciliation HEAD 404 marks ABSENT_RECONCILED_POST_TIMEOUT'
);

-- ----------------------------------------------------------------------------
-- TEST 11: TS-SAF-02: Plan A Extension Guard Blocks on Active Job (55P03)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID := (SELECT hackathon_id FROM test_phase4_vars);
  v_admin_id UUID := (SELECT admin_id FROM test_phase4_vars);
BEGIN
  -- Insert an active claimed job
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status,
    lease_token, leased_until, retention_deadline_at
  ) VALUES (
    v_h_id, 'submission-evidence', 'evidence/active/proof.pdf',
    'submission_evidence', gen_random_uuid()::text, 'claimed',
    gen_random_uuid(), now() + interval '30 seconds', now()
  );
END $$;

-- Switch to admin role
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT set_config('request.jwt.claim.sub', (SELECT admin_id::text FROM test_phase4_vars), true);

SELECT throws_ok(
  format(
    $$ 
    DO $do$
    BEGIN
      PERFORM public.extend_hackathon_event_deadline(
        '%s'::uuid,
        now() + interval '10 days',
        'Valid justification for extension'
      );
    END $do$;
    $$,
    (SELECT hackathon_id FROM test_phase4_vars)
  ),
  '55P03',
  'Cannot extend hackathon deadline while evidence deletion is in progress or unresolved (Plan A guard). Please retry once deletion completes.',
  'TS-SAF-02: Plan A extension guard rejects extension when active deletion job exists (SQLSTATE 55P03)'
);

-- ----------------------------------------------------------------------------
-- TEST 12: TS-SAF-07: Atomic Retention Update on Extension
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_h_id UUID := (SELECT hackathon_id FROM test_phase4_vars);
  v_super_id UUID := (SELECT super_admin_id FROM test_phase4_vars);
  v_res JSONB;
BEGIN
  -- Clear active jobs for this hackathon
  DELETE FROM public.storage_deletion_queue WHERE event_id = v_h_id;

  -- Insert 2 pending jobs with old deadline
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, status, retention_deadline_at
  ) VALUES 
    (v_h_id, 'submission-evidence', 'evidence/p1.pdf', 'submission_evidence', gen_random_uuid()::text, 'pending', now() + interval '9 days'),
    (v_h_id, 'submission-evidence', 'evidence/p2.pdf', 'submission_evidence', gen_random_uuid()::text, 'pending', now() + interval '9 days');

  -- Simulate Super Admin auth
  PERFORM set_config('request.jwt.claim.sub', v_super_id::text, true);

  -- Extend deadline by +5 days
  v_res := public.extend_hackathon_event_deadline(
    v_h_id,
    now() + interval '7 days',
    'Emergency schedule extension for storm outage'
  );
END $$;

SELECT is(
  (SELECT count(*)::int FROM public.storage_deletion_queue 
   WHERE event_id = (SELECT hackathon_id FROM test_phase4_vars) 
     AND status = 'pending' 
     AND retention_deadline_at > now() + interval '13 days'),
  2,
  'TS-SAF-07: Schedule extension atomically updates retention_deadline_at for all pending jobs'
);

-- ----------------------------------------------------------------------------
-- TEST 13: TS-SAF-08: Shortening Event End Prohibited (22023)
-- ----------------------------------------------------------------------------
SELECT throws_ok(
  format(
    $$ 
    DO $do$
    BEGIN
      PERFORM public.extend_hackathon_event_deadline(
        '%s'::uuid,
        now() - interval '1 day',
        'Attempting to shorten event end'
      );
    END $do$;
    $$,
    (SELECT hackathon_id FROM test_phase4_vars)
  ),
  '22023',
  NULL,
  'TS-SAF-08: Shortening event end timestamp is strictly prohibited (SQLSTATE 22023)'
);

-- ----------------------------------------------------------------------------
-- TEST 14: User Device Push Subscription Registration & Deactivation
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_user_id UUID := (SELECT student_id FROM test_phase4_vars);
  v_res JSONB;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  
  v_res := public.register_push_subscription(
    'https://fcm.googleapis.com/fcm/send/test-device-token-14',
    'p256dh-key-test',
    'auth-secret-test',
    'fp-device-chrome-mac-123',
    'Mozilla/5.0 Mac Chrome'
  );
END $$;

SELECT is(
  (SELECT active FROM public.user_push_subscriptions 
   WHERE device_fingerprint = 'fp-device-chrome-mac-123'),
  true,
  'TS-PSH-01: User push subscription registered active'
);

DO $$
DECLARE
  v_user_id UUID := (SELECT student_id FROM test_phase4_vars);
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM public.deactivate_push_subscription('fp-device-chrome-mac-123');
END $$;

SELECT is(
  (SELECT active FROM public.user_push_subscriptions 
   WHERE device_fingerprint = 'fp-device-chrome-mac-123'),
  false,
  'TS-PSH-02: User push subscription deactivated successfully'
);

SELECT * FROM finish();
ROLLBACK;
