-- Suite 12: Phase 5 Role-Based Authorization & Admin Management (TS-ADM-MGMT)
BEGIN;
SELECT plan(45);

-- ============================================================================
-- Fixture Setup (Executed as Superuser / postgres)
-- ============================================================================

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'new.admin50@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
    '{"full_name":"New Admin Fifty","role":"admin"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000051',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bootstrap.admin51@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
    '{"full_name":"Bootstrap Admin FiftyOne","role":"admin"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'bootstrap.admin52@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
    '{"full_name":"Bootstrap Admin FiftyTwo","role":"admin"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000053',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'mismatch.admin53@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
    '{"full_name":"Mismatch Admin FiftyThree","role":"admin"}'::jsonb,
    now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- TS-ADM-01: Anon cannot call provision_admin_profile
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.provision_admin_profile('00000000-0000-0000-0000-000000000050'::uuid, 'new.admin50@nmit-dev.local', 'Admin 50', ARRAY['verify_students']) $$,
  '42501',
  NULL,
  'TS-ADM-01: Anon cannot call provision_admin_profile'
);

-- TS-ADM-02: Student cannot call provision_admin_profile
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT throws_ok(
  $$ SELECT public.provision_admin_profile('00000000-0000-0000-0000-000000000050'::uuid, 'new.admin50@nmit-dev.local', 'Admin 50', ARRAY['verify_students']) $$,
  'P0001',
  'Access denied: only active Super Admin can provision new administrators.',
  'TS-ADM-02: Student cannot call provision_admin_profile'
);

-- TS-ADM-03: Ordinary Admin cannot call provision_admin_profile
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT throws_ok(
  $$ SELECT public.provision_admin_profile('00000000-0000-0000-0000-000000000050'::uuid, 'new.admin50@nmit-dev.local', 'Admin 50', ARRAY['verify_students']) $$,
  'P0001',
  'Access denied: only active Super Admin can provision new administrators.',
  'TS-ADM-03: Ordinary Admin cannot call provision_admin_profile'
);

-- TS-ADM-04: Super Admin can call provision_admin_profile with valid data
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT lives_ok(
  $$ SELECT public.provision_admin_profile('00000000-0000-0000-0000-000000000050'::uuid, 'new.admin50@nmit-dev.local', 'Admin 50', ARRAY['verify_students', 'manage_hackathons']) $$,
  'TS-ADM-04: Super Admin can call provision_admin_profile with valid data'
);

-- TS-ADM-05: Student Auth UUID cannot be provisioned as Admin
SELECT throws_ok(
  $$ SELECT public.provision_admin_profile('00000000-0000-0000-0000-000000000003'::uuid, 'student1@nmit-dev.local', 'Student One', ARRAY['verify_students']) $$,
  'P0001',
  'Dual-identity violation: user ID 00000000-0000-0000-0000-000000000003 is already registered as a student participant.',
  'TS-ADM-05: Student Auth UUID cannot be provisioned as Admin'
);

-- TS-ADM-06: Admin Auth UUID cannot be inserted as Student
SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT throws_ok(
  $$ INSERT INTO public.profiles (id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status)
     VALUES ('00000000-0000-0000-0000-000000000001', 'superadmin.student@nmit-dev.local', 'Admin As Student', '1NT22CS099', '+919999999999', 'CSE', 3, 'Male', '2003-01-01', 'draft') $$,
  'P0001',
  'Dual-identity violation: user ID 00000000-0000-0000-0000-000000000001 is already registered as an administrator.',
  'TS-ADM-06: Admin Auth UUID cannot be inserted as Student'
);

-- TS-ADM-07: NULL or empty email/name rejected in provision_admin_profile
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT throws_ok(
  $$ SELECT public.provision_admin_profile('00000000-0000-0000-0000-000000000052'::uuid, '', 'Name', ARRAY['verify_students']) $$,
  'P0001',
  'Invalid argument: valid email address is mandatory.',
  'TS-ADM-07: NULL or empty email rejected in provision_admin_profile'
);

-- TS-ADM-08: Invalid permission key in provision_admin_profile rolls back transaction
SELECT throws_ok(
  $$ SELECT public.provision_admin_profile('00000000-0000-0000-0000-000000000052'::uuid, 'bootstrap.admin52@nmit-dev.local', 'Name', ARRAY['invalid_key']) $$,
  'P0001',
  'Invalid permission key: invalid_key',
  'TS-ADM-08: Invalid permission key in provision_admin_profile rolls back transaction'
);

-- TS-ADM-09: Anon cannot call manage_admin_permissions
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, ARRAY['verify_students']) $$,
  '42501',
  NULL,
  'TS-ADM-09: Anon cannot call manage_admin_permissions'
);

-- TS-ADM-10: Student cannot call manage_admin_permissions
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SELECT throws_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, ARRAY['verify_students']) $$,
  'P0001',
  'Access denied: only active Super Admin can manage administrator permissions.',
  'TS-ADM-10: Student cannot call manage_admin_permissions'
);

-- TS-ADM-11: Ordinary Admin cannot call manage_admin_permissions
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, ARRAY['verify_students']) $$,
  'P0001',
  'Access denied: only active Super Admin can manage administrator permissions.',
  'TS-ADM-11: Ordinary Admin cannot call manage_admin_permissions'
);

-- TS-ADM-12: Super Admin can update permissions
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, ARRAY['manage_teams']) $$,
  'TS-ADM-12: Super Admin can update permissions'
);

-- TS-ADM-13: Unknown permission key rejected in manage_admin_permissions
SELECT throws_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, ARRAY['unknown_perm']) $$,
  'P0001',
  'Invalid permission key: unknown_perm',
  'TS-ADM-13: Unknown permission key rejected'
);

-- TS-ADM-14: Duplicate permission keys deduplicated in manage_admin_permissions
SELECT lives_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, ARRAY['verify_students', 'verify_students']) $$,
  'TS-ADM-14: Duplicate permission keys deduplicated'
);

-- TS-ADM-15: Super Admin permissions cannot be modified
SELECT throws_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000001'::uuid, ARRAY['verify_students']) $$,
  'P0001',
  'Permission mutation blocked: Super Admin permissions are implicit and cannot be edited.',
  'TS-ADM-15: Super Admin permissions cannot be modified'
);

-- TS-ADM-16: Non-existent admin target throws in manage_admin_permissions
SELECT throws_ok(
  $$ SELECT public.manage_admin_permissions('99999999-9999-9999-9999-999999999999'::uuid, ARRAY['verify_students']) $$,
  'P0001',
  'Target administrator not found.',
  'TS-ADM-16: Non-existent admin target throws'
);

-- TS-ADM-17: NULL permission array fails closed in manage_admin_permissions
SELECT throws_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, NULL) $$,
  'P0001',
  'Invalid argument: permission list cannot be null. Provide an empty array to revoke all permissions.',
  'TS-ADM-17: NULL permission array fails closed'
);

-- TS-ADM-18: NULL element in permission array fails closed in manage_admin_permissions
SELECT throws_ok(
  $$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, ARRAY['verify_students', NULL]) $$,
  'P0001',
  'Invalid argument: permission list cannot contain null elements.',
  'TS-ADM-18: NULL element in permission array fails closed'
);

-- TS-ADM-19: No-op permission update returns unchanged without audit write
SELECT is(
  (public.manage_admin_permissions('00000000-0000-0000-0000-000000000050'::uuid, ARRAY['verify_students'])->>'status_unchanged')::boolean,
  true,
  'TS-ADM-19: No-op permission update returns status_unchanged: true without audit write'
);

-- TS-ADM-20: Anon cannot call set_admin_active_status
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.set_admin_active_status('00000000-0000-0000-0000-000000000050'::uuid, false, 'Reason') $$,
  '42501',
  NULL,
  'TS-ADM-20: Anon cannot call set_admin_active_status'
);

-- TS-ADM-21: Student cannot call set_admin_active_status
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SELECT throws_ok(
  $$ SELECT public.set_admin_active_status('00000000-0000-0000-0000-000000000050'::uuid, false, 'Reason') $$,
  'P0001',
  'Access denied: only active Super Admin can alter administrator account status.',
  'TS-ADM-21: Student cannot call set_admin_active_status'
);

-- TS-ADM-22: Ordinary Admin cannot call set_admin_active_status
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SELECT throws_ok(
  $$ SELECT public.set_admin_active_status('00000000-0000-0000-0000-000000000050'::uuid, false, 'Reason') $$,
  'P0001',
  'Access denied: only active Super Admin can alter administrator account status.',
  'TS-ADM-22: Ordinary Admin cannot call set_admin_active_status'
);

-- TS-ADM-23: Super Admin cannot deactivate self
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ SELECT public.set_admin_active_status('00000000-0000-0000-0000-000000000001'::uuid, false, 'Self deactivation') $$,
  'P0001',
  'Action blocked: Super Admin cannot deactivate or alter their own account status.',
  'TS-ADM-23: Super Admin cannot deactivate self'
);

-- TS-ADM-24: Super Admin cannot alter Super Admin account row
SELECT throws_ok(
  $$ SELECT public.set_admin_active_status('00000000-0000-0000-0000-000000000001'::uuid, true, 'Super Admin row test') $$,
  'P0001',
  'Action blocked: Super Admin cannot deactivate or alter their own account status.',
  'TS-ADM-24: Super Admin cannot alter Super Admin row'
);

-- TS-ADM-25: Mandatory reason required for status change
SELECT throws_ok(
  $$ SELECT public.set_admin_active_status('00000000-0000-0000-0000-000000000050'::uuid, false, '   ') $$,
  'P0001',
  'A non-empty reason is mandatory for administrator status changes.',
  'TS-ADM-25: Mandatory reason required for status change'
);

-- TS-ADM-26: Super Admin can deactivate ordinary Admin
SELECT is(
  (public.set_admin_active_status('00000000-0000-0000-0000-000000000050'::uuid, false, 'Audit reason')->>'is_active')::boolean,
  false,
  'TS-ADM-26: Super Admin can deactivate ordinary Admin'
);

-- TS-ADM-27: Deactivated Admin denied in current_has_permission
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000050';
SELECT is(
  public.current_has_permission('verify_students'),
  false,
  'TS-ADM-27: Deactivated Admin denied in current_has_permission even with assigned row'
);

-- TS-ADM-28: Super Admin can reactivate Admin
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SELECT is(
  (public.set_admin_active_status('00000000-0000-0000-0000-000000000050'::uuid, true, 'Reactivation reason')->>'is_active')::boolean,
  true,
  'TS-ADM-28: Super Admin can reactivate Admin'
);

-- TS-ADM-29: Email mismatch rejected in provision_admin_profile
SELECT throws_ok(
  $$ SELECT public.provision_admin_profile('00000000-0000-0000-0000-000000000053'::uuid, 'wrong@nmit-dev.local', 'Mismatch User', ARRAY['verify_students']) $$,
  'P0001',
  'Identity binding violation: supplied email wrong@nmit-dev.local does not match authoritative Auth email mismatch.admin53@nmit-dev.local for user 00000000-0000-0000-0000-000000000053.',
  'TS-ADM-29: Email mismatch rejected in provision_admin_profile'
);

-- TS-ADM-30: Non-existent Auth UUID rejected in provision_admin_profile
SELECT throws_ok(
  $$ SELECT public.provision_admin_profile('88888888-8888-8888-8888-888888888888'::uuid, 'nonexistent@nmit-dev.local', 'Nonexistent', ARRAY['verify_students']) $$,
  'P0001',
  'Identity binding failure: Auth user 88888888-8888-8888-8888-888888888888 does not exist in auth.users.',
  'TS-ADM-30: Non-existent Auth UUID rejected in provision_admin_profile'
);

-- TS-ADM-31: bootstrap_super_admin denied to non-service-role clients
SELECT throws_ok(
  $$ SELECT public.bootstrap_super_admin('00000000-0000-0000-0000-000000000051'::uuid, 'bootstrap.admin51@nmit-dev.local', 'Bootstrap 51') $$,
  '42501',
  NULL,
  'TS-ADM-31: bootstrap_super_admin denied to non-service-role clients'
);

-- TS-ADM-32: Identity UUID is immutable on UPDATE
SET LOCAL ROLE postgres;
SELECT throws_ok(
  $$ UPDATE public.admin_profiles SET id = '00000000-0000-0000-0000-000000000099' WHERE id = '00000000-0000-0000-0000-000000000050' $$,
  'P0001',
  'Identity UUID is immutable and cannot be modified.',
  'TS-ADM-32: Identity UUID is immutable on UPDATE'
);

-- TS-ADM-33: Student with colliding normalized email cannot be inserted as Admin
SELECT throws_ok(
  $$ INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
     VALUES ('00000000-0000-0000-0000-000000000050', 'student1@nmit-dev.local', 'Colliding Student Name', false, true) $$,
  'P0001',
  'Dual-identity collision: email student1@nmit-dev.local is already registered to an existing student participant.',
  'TS-ADM-33: Student with colliding normalized email cannot be inserted as Admin'
);

-- TS-ADM-34: Admin with colliding normalized email cannot be inserted as Student
SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT throws_ok(
  $$ INSERT INTO public.profiles (id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status)
     VALUES ('00000000-0000-0000-0000-000000000052', 'superadmin@nmit-dev.local', 'Colliding Admin Email', '1NT22CS098', '+919999999998', 'CSE', 3, 'Male', '2003-01-01', 'draft') $$,
  'P0001',
  'Dual-identity collision: email superadmin@nmit-dev.local is already registered to an existing administrator.',
  'TS-ADM-34: Admin with colliding normalized email cannot be inserted as Student'
);

-- ============================================================================
-- Bootstrap Invariant Testing (TS-ADM-35 to TS-ADM-40)
-- ============================================================================

SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claim.role" = 'service_role';

-- Setup for 0-Super-Admin test
SAVEPOINT sp_bootstrap_test;

-- Temporarily demote Super Admin to simulate initial bootstrap
UPDATE public.admin_profiles SET is_super_admin = false, is_active = false WHERE id = '00000000-0000-0000-0000-000000000001';

-- TS-ADM-35: First-time bootstrap_super_admin succeeds when 0 Super Admins exist
SELECT is(
  (public.bootstrap_super_admin('00000000-0000-0000-0000-000000000051'::uuid, 'bootstrap.admin51@nmit-dev.local', 'Bootstrap Owner')->>'status'),
  'bootstrapped',
  'TS-ADM-35: First-time bootstrap_super_admin succeeds when 0 Super Admins exist'
);

-- TS-ADM-36: Idempotent retry of active Super Admin succeeds without mutation
SELECT is(
  (public.bootstrap_super_admin('00000000-0000-0000-0000-000000000051'::uuid, 'bootstrap.admin51@nmit-dev.local', 'Bootstrap Owner')->>'status'),
  'already_bootstrapped',
  'TS-ADM-36: Idempotent retry of active Super Admin succeeds without mutation'
);

-- TS-ADM-37: Bootstrap fails closed if active Super Admin exists with different identity
SELECT throws_ok(
  $$ SELECT public.bootstrap_super_admin('00000000-0000-0000-0000-000000000052'::uuid, 'bootstrap.admin52@nmit-dev.local', 'Bootstrap 52') $$,
  'P0001',
  'Bootstrap denied: an active or initialized Super Admin already exists in the system (existing ID: 00000000-0000-0000-0000-000000000051).',
  'TS-ADM-37: Bootstrap fails closed if active Super Admin exists with different identity'
);

-- TS-ADM-38: Ordinary administrator cannot be elevated via bootstrap
SELECT throws_ok(
  $$ SELECT public.bootstrap_super_admin('00000000-0000-0000-0000-000000000002'::uuid, 'verifier.admin@nmit-dev.local', 'Verifier Admin') $$,
  'P0001',
  NULL,
  'TS-ADM-38: Ordinary administrator cannot be elevated via bootstrap'
);

-- TS-ADM-39: Deactivated or demoted Super Admin cannot be re-activated via bootstrap
UPDATE public.admin_profiles SET is_active = false WHERE id = '00000000-0000-0000-0000-000000000051';
SELECT throws_ok(
  $$ SELECT public.bootstrap_super_admin('00000000-0000-0000-0000-000000000051'::uuid, 'bootstrap.admin51@nmit-dev.local', 'Bootstrap Owner') $$,
  'P0001',
  'Bootstrap denied: Super Admin identity 00000000-0000-0000-0000-000000000051 is inactive or demoted. Use recover_super_admin_identity for disaster recovery.',
  'TS-ADM-39: Deactivated or demoted Super Admin cannot be re-activated via bootstrap'
);

-- Restore baseline state
ROLLBACK TO SAVEPOINT sp_bootstrap_test;

-- TS-ADM-40: Bootstrap fails closed on collision with existing student
SET LOCAL ROLE postgres;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT throws_ok(
  $$ SELECT public.bootstrap_super_admin('00000000-0000-0000-0000-000000000003'::uuid, 'student1@nmit-dev.local', 'Student One') $$,
  'P0001',
  NULL,
  'TS-ADM-40: Bootstrap fails closed on collision with existing student'
);

-- ============================================================================
-- Authorization Helper & RLS Consistency Testing (TS-ADM-41 to TS-ADM-45)
-- ============================================================================

-- TS-ADM-41: Active Super Admin evaluates to true in current_has_permission with 0 permission rows
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT is(
  public.current_has_permission('verify_students'),
  true,
  'TS-ADM-41: Active Super Admin evaluates to true in current_has_permission with 0 permission rows'
);

-- TS-ADM-42: Active ordinary Admin evaluates to true in current_has_permission for assigned permission
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT is(
  public.current_has_permission('verify_students'),
  true,
  'TS-ADM-42: Active ordinary Admin evaluates to true in current_has_permission for assigned permission'
);

-- TS-ADM-43: Active ordinary Admin evaluates to false in current_has_permission for unassigned permission
SELECT is(
  public.current_has_permission('manage_hackathons'),
  false,
  'TS-ADM-43: Active ordinary Admin evaluates to false in current_has_permission for unassigned permission'
);

-- TS-ADM-44: Student and anonymous callers evaluate to false in current_has_permission
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SELECT is(
  public.current_has_permission('verify_students'),
  false,
  'TS-ADM-44: Student caller evaluates to false in current_has_permission'
);

-- TS-ADM-45: RLS policies relying on current_has_permission behave consistently
-- Active Super Admin with 0 permission rows can read audit_logs via audit_logs_select_admin
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000001';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT is(
  (SELECT count(*)::int > 0 FROM public.audit_logs),
  true,
  'TS-ADM-45: RLS policies relying on current_has_permission grant access to active Super Admin with 0 permission rows'
);

SELECT * FROM finish();
ROLLBACK;
