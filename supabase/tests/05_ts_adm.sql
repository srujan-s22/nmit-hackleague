-- Suite 5: Super Admin Lifecycle and Disaster Recovery (TS-ADM)
BEGIN;
SELECT plan(11);

-- TS-ADM-01: Second Super Admin Blocked at Database Engine
-- Attempting to insert a second active Super Admin violates uq_single_super_admin
SELECT throws_ok(
  $$
  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
  VALUES ('00000000-0000-0000-0000-000000000002', 'admin2@nmit-dev.local', 'Admin 2', true, true)
  $$,
  '23505', -- unique_violation on uq_single_super_admin
  NULL,
  'TS-ADM-01: Second active Super Admin insert blocked by uq_single_super_admin index'
);

-- TS-ADM-02: Accidental Demotion of Last Super Admin Blocked
-- With deferred trigger evaluated immediately or at commit, demoting sole Super Admin throws invariant violation
SELECT throws_ok(
  $$
  SET CONSTRAINTS trg_verify_single_active_super_admin IMMEDIATE;
  UPDATE public.admin_profiles SET is_super_admin = false WHERE id = '00000000-0000-0000-0000-000000000001';
  $$,
  'P0001', -- raise_exception from trg_verify_single_active_super_admin
  'Administrative invariant violation: system must have exactly 1 active Super Admin at transaction commit (found 0).',
  'TS-ADM-02: Demoting sole active Super Admin violates exactly-one commit invariant'
);

-- Setup for TS-ADM-03 & 04: create replacement user in auth.users
DO $$
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
  VALUES (
    '00000000-0000-0000-0000-000000000099',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'newowner@nmit.ac.in',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    now()
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-- TS-ADM-03: Authorized Out-of-Band Disaster Recovery Identity Swap
SELECT lives_ok(
  $$
  CALL public.recover_super_admin_identity(
    '00000000-0000-0000-0000-000000000099'::uuid,
    'newowner@nmit.ac.in',
    'New Project Owner',
    'Hardware key replacement out of band'
  );
  $$,
  'TS-ADM-03: Authorized out-of-band recovery swaps Super Admin identity atomically'
);

-- Verify old Super Admin is demoted/deactivated and new Super Admin is active
SELECT is(
  (SELECT count(*)::int FROM public.admin_profiles WHERE is_super_admin = true AND is_active = true),
  1,
  'TS-ADM-03b: Exactly 1 active Super Admin after recovery swap'
);

-- TS-ADM-04: Failed Recovery Atomic Rollback
-- Passing non-existent user ID throws exception and rolls back
SELECT throws_ok(
  $$
  CALL public.recover_super_admin_identity(
    '11111111-1111-1111-1111-111111111111'::uuid,
    'nonexistent@nmit.ac.in',
    'Nonexistent User',
    'Invalid recovery attempt'
  );
  $$,
  'P0001',
  'Replacement user ID 11111111-1111-1111-1111-111111111111 does not exist in auth.users.',
  'TS-ADM-04: Failed recovery rolls back atomically when replacement user not in auth.users'
);

-- TS-ADM-05, 06, 07: Administrative Permission Checks for Verifier Admin
-- Verifier Admin (00000000-0000-0000-0000-000000000002) has verify_students and manage_students,
-- but lacks manage_password_resets, manage_followups, and export_data
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT is(
  public.current_has_permission('manage_password_resets'),
  false,
  'TS-ADM-05: Verifier admin correctly lacks manage_password_resets'
);

SELECT is(
  public.current_has_permission('manage_followups'),
  false,
  'TS-ADM-06: Verifier admin correctly lacks manage_followups'
);

SELECT is(
  public.current_has_permission('export_data'),
  false,
  'TS-ADM-07: Verifier admin correctly lacks export_data'
);

-- TS-ADM-08: Ordinary Admin Privilege Escalation Rejection via Direct UPDATE
-- Verifier admin attempting to set is_super_admin = true affects 0 rows due to RLS
SELECT lives_ok(
  $$
  DO $do$
  DECLARE
    v_count INT;
  BEGIN
    UPDATE public.admin_profiles
    SET is_super_admin = true
    WHERE id = '00000000-0000-0000-0000-000000000002';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 0 THEN
      RAISE EXCEPTION 'Privilege escalation succeeded! Updated % rows', v_count;
    END IF;
  END $do$;
  $$,
  'TS-ADM-08: Ordinary admin direct UPDATE to is_super_admin affects 0 rows under RLS'
);

SELECT is(
  (SELECT is_super_admin FROM public.admin_profiles WHERE id = '00000000-0000-0000-0000-000000000002'),
  false,
  'TS-ADM-08b: is_super_admin remains false after unauthorized update attempt'
);

-- TS-ADM-09: Ordinary Admin Direct Permission Self-Grant Rejection
-- Verifier admin attempting to insert manage_points into admin_permissions is rejected by RLS
SELECT throws_ok(
  $$
  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES ('00000000-0000-0000-0000-000000000002', 'manage_points', '00000000-0000-0000-0000-000000000002')
  $$,
  '42501', -- permission_denied by RLS WITH CHECK policy
  NULL,
  'TS-ADM-09: Ordinary admin self-granting manage_points rejected by RLS'
);

SELECT * FROM finish();
ROLLBACK;
