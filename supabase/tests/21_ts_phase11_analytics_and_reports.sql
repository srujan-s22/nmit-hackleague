-- Test Suite: 21_ts_phase11_analytics_and_reports.sql
-- Description: Phase 11 - Database verification for hardened exports and dashboard metrics

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(37);

-- Fixture variables
DO $$
DECLARE
  v_super_id UUID := '00000000-0000-0000-0000-000000000001';
  v_assigned_admin_id UUID := '22222222-2222-2222-2222-222222222222';
  v_unassigned_admin_id UUID := '33333333-3333-3333-3333-333333333333';
  v_no_export_admin_id UUID := '44444444-4444-4444-4444-444444444444';
  v_student_id UUID := '55555555-5555-5555-5555-555555555555';
  v_other_student_id UUID := '66666666-6666-6666-6666-666666666666';
  v_hackathon_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_other_hackathon_id UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_assigned_team_id UUID := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_other_team_id UUID := '77777777-7777-7777-7777-777777777777';
BEGIN
  -- 1. Create Admins in auth.users & admin_profiles
  INSERT INTO auth.users (id, email) VALUES
    (v_assigned_admin_id, 'assigned@test.com'),
    (v_unassigned_admin_id, 'unassigned@test.com'),
    (v_no_export_admin_id, 'noexport@test.com'),
    (v_student_id, 'student@test.com'),
    (v_other_student_id, 'otherstudent@test.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active) VALUES
    (v_assigned_admin_id, 'assigned@test.com', 'Assigned Admin', false, true),
    (v_unassigned_admin_id, 'unassigned@test.com', 'Unassigned Admin', false, true),
    (v_no_export_admin_id, 'noexport@test.com', 'No Export Admin', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = EXCLUDED.is_super_admin;

  -- 2. Create Student Profiles
  INSERT INTO public.profiles (id, full_name, email, usn, branch, academic_year, phone, sex, registration_status) VALUES
    (v_student_id, 'Test Student', 'student999@test.com', '1NT21CS999', 'CSE', 3, '+919876543210', 'Male', 'approved'),
    (v_other_student_id, 'Other Student', 'other999@test.com', '1NT21IS999', 'ISE', 2, '+919876543211', 'Female', 'approved')
  ON CONFLICT (id) DO NOTHING;

  -- 3. Assign Permissions
  INSERT INTO public.admin_permissions (admin_id, permission, granted_by) VALUES
    (v_assigned_admin_id, 'export_data', v_super_id),
    (v_assigned_admin_id, 'manage_hackathons', v_super_id),
    (v_unassigned_admin_id, 'export_data', v_super_id),
    (v_no_export_admin_id, 'manage_teams', v_super_id)
  ON CONFLICT DO NOTHING;

  -- 4. Create Hackathons
  INSERT INTO public.hackathons (
    id, title, description, slug, mode, organizer, status, min_team_size, max_team_size,
    is_solo_allowed, registration_start_at, registration_end_at, event_start_at,
    event_end_at, in_charge_admin_id, created_by
  ) VALUES
    (v_hackathon_id, 'Hackathon Assigned', 'Description assigned', 'hack-assigned', 'online', 'NMIT', 'published', 1, 4, true,
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
     v_assigned_admin_id, v_super_id),
    (v_other_hackathon_id, 'Hackathon Other', 'Description other', 'hack-other', 'online', 'NMIT', 'published', 1, 4, true,
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
     v_super_id, v_super_id)
  ON CONFLICT (id) DO UPDATE SET in_charge_admin_id = EXCLUDED.in_charge_admin_id;

  -- 5. Create Teams & Members
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status) VALUES
    (v_assigned_team_id, v_hackathon_id, 'Assigned Team', v_student_id, 'INV99999', 'complete', 'verified'),
    (v_other_team_id, v_other_hackathon_id, 'Other Team', v_other_student_id, 'INV88888', 'complete', 'verified')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.team_members (id, team_id, student_id, hackathon_id, role) VALUES
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', v_assigned_team_id, v_student_id, v_hackathon_id, 'leader'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', v_other_team_id, v_other_student_id, v_other_hackathon_id, 'leader')
  ON CONFLICT DO NOTHING;

  -- 6. Add Points Entry
  INSERT INTO public.points_ledger (
    id, idempotency_key, student_id, hackathon_id, team_id, milestone_type, role_at_award, points, reason, awarded_by
  ) VALUES (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'test-pts-key-1', v_student_id, v_hackathon_id,
    v_assigned_team_id, 'participation', 'leader', 10, 'Participation Points', v_super_id
  ) ON CONFLICT DO NOTHING;

  -- 7. Add Profile Change Request
  INSERT INTO public.profile_change_requests (
    id, student_id, field_name, old_value, new_value, reason, status
  ) VALUES (
    'ffffffff-ffff-ffff-ffff-ffffffffffff', v_student_id, 'academic_year', '2', '3', 'Progressed to third year', 'pending'
  ) ON CONFLICT (id) DO NOTHING;
END $$;

-------------------------------------------------------------------------------
-- TEST 1-8: AUDIT_DATA_EXPORT AUTHORIZATION BOUNDARIES
-------------------------------------------------------------------------------

-- P11-DB-01: Anonymous caller denied audit_data_export
RESET ROLE;
SET request.jwt.claims = '';
SELECT throws_ok(
  $$ SELECT public.audit_data_export('students', 'csv', NULL) $$,
  'P0001',
  'Access denied: authentication required.',
  'P11-DB-01: Anonymous caller denied export'
);

-- P11-DB-02: Student denied audit_data_export
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "55555555-5555-5555-5555-555555555555"}';
SELECT throws_ok(
  $$ SELECT public.audit_data_export('students', 'csv', NULL) $$,
  'P0001',
  'Access denied: caller is not an active administrator.',
  'P11-DB-02: Student denied export'
);

-- P11-DB-03: Admin without export_data denied audit_data_export
SET request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444"}';
SELECT throws_ok(
  $$ SELECT public.audit_data_export('students', 'csv', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'P0001',
  'Access denied: export_data permission required.',
  'P11-DB-03: Admin without export_data denied export'
);

-- P11-DB-04: Ordinary admin with export_data blocked from platform-wide (NULL hackathon) export
SET request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
SELECT throws_ok(
  $$ SELECT public.audit_data_export('students', 'csv', NULL) $$,
  'P0001',
  'Access denied: platform-wide global exports require Super Admin privilege.',
  'P11-DB-04: Ordinary admin with export_data blocked from global NULL hackathon export'
);

-- P11-DB-05: Ordinary admin with export_data blocked from unassigned hackathon
SELECT throws_ok(
  $$ SELECT public.audit_data_export('students', 'csv', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'P0001',
  'Access denied: not authorized to export data for this hackathon.',
  'P11-DB-05: Ordinary admin blocked from unassigned hackathon export'
);

-- P11-DB-06: Ordinary admin with export_data succeeds on assigned hackathon
SELECT lives_ok(
  $$ SELECT public.audit_data_export('students', 'csv', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'P11-DB-06: Ordinary admin succeeds on assigned hackathon export'
);

-- P11-DB-07: Verify audit log recorded for ordinary admin export
RESET ROLE;
SET request.jwt.claims = '';
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_logs 
   WHERE actor_id = '22222222-2222-2222-2222-222222222222'
     AND action = 'data.exported'
     AND target_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=',
  1,
  'P11-DB-07: Audit log recorded for assigned hackathon export'
);

-- P11-DB-08: Ordinary admin without view_audit_logs blocked from audit_logs dataset
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
SELECT throws_ok(
  $$ SELECT public.audit_data_export('audit_logs', 'csv', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'P0001',
  'Access denied: view_audit_logs permission required to export audit logs.',
  'P11-DB-08: Ordinary admin without view_audit_logs blocked from audit_logs dataset'
);

-------------------------------------------------------------------------------
-- TEST 9-14: SUPER ADMIN EXPORTS & FORMAT VALIDATION
-------------------------------------------------------------------------------

-- P11-DB-09: Super Admin succeeds on platform-wide (NULL) export
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT lives_ok(
  $$ SELECT public.audit_data_export('all', 'xlsx', NULL) $$,
  'P11-DB-09: Super Admin succeeds on platform-wide export'
);

-- P11-DB-10: Verify audit log recorded for Super Admin platform export
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_logs 
   WHERE actor_id = '00000000-0000-0000-0000-000000000001'
     AND action = 'data.exported'
     AND target_id = 'platform'),
  '>=',
  1,
  'P11-DB-10: Audit log recorded for Super Admin platform export'
);

-- P11-DB-11: Super Admin succeeds on audit_logs dataset export
SELECT lives_ok(
  $$ SELECT public.audit_data_export('audit_logs', 'csv', NULL) $$,
  'P11-DB-11: Super Admin succeeds on audit_logs dataset export'
);

-- P11-DB-12: Super Admin succeeds on profile_change_requests dataset
SELECT lives_ok(
  $$ SELECT public.audit_data_export('profile_change_requests', 'csv', NULL) $$,
  'P11-DB-12: Super Admin succeeds on profile_change_requests dataset'
);

-- P11-DB-13: Invalid format rejected with 22023
SELECT throws_ok(
  $$ SELECT public.audit_data_export('students', 'pdf', NULL) $$,
  '22023',
  NULL,
  'P11-DB-13: Invalid format rejected with 22023'
);

-- P11-DB-14: Invalid dataset rejected with 22023
SELECT throws_ok(
  $$ SELECT public.audit_data_export('passwords_and_secrets', 'csv', NULL) $$,
  '22023',
  NULL,
  'P11-DB-14: Invalid dataset rejected with 22023'
);

-------------------------------------------------------------------------------
-- TEST 15-28: GET_ADMIN_DASHBOARD_METRICS
-------------------------------------------------------------------------------

-- P11-DB-15: Anonymous caller denied get_admin_dashboard_metrics
RESET ROLE;
SET request.jwt.claims = '';
SELECT throws_ok(
  $$ SELECT public.get_admin_dashboard_metrics(NULL) $$,
  'P0001',
  'Access denied: authentication required.',
  'P11-DB-15: Anonymous caller denied dashboard metrics'
);

-- P11-DB-16: Student denied get_admin_dashboard_metrics
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "55555555-5555-5555-5555-555555555555"}';
SELECT throws_ok(
  $$ SELECT public.get_admin_dashboard_metrics(NULL) $$,
  'P0001',
  'Access denied: caller is not an active administrator.',
  'P11-DB-16: Student denied dashboard metrics'
);

-- P11-DB-17: Super Admin global metrics returns valid jsonb structure
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT lives_ok(
  $$ SELECT public.get_admin_dashboard_metrics(NULL) $$,
  'P11-DB-17: Super Admin succeeds on global metrics call'
);

-- P11-DB-18: Super Admin global metrics indicates is_global = true
SELECT is(
  (public.get_admin_dashboard_metrics(NULL)->'scope'->>'is_global')::boolean,
  true,
  'P11-DB-18: Global metrics indicates is_global = true'
);

-- P11-DB-19: Super Admin global metrics reports accurate student count
SELECT is(
  (public.get_admin_dashboard_metrics(NULL)->'students'->>'approved')::bigint >= 1,
  true,
  'P11-DB-19: Global metrics reports approved students'
);

-- P11-DB-20: Super Admin global metrics reports accurate hackathon count
SELECT is(
  (public.get_admin_dashboard_metrics(NULL)->'hackathons'->>'published')::bigint >= 2,
  true,
  'P11-DB-20: Global metrics reports published hackathons'
);

-- P11-DB-21: Super Admin scoped metrics for specific hackathon
SELECT is(
  (public.get_admin_dashboard_metrics('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')->'hackathons'->>'total')::bigint,
  1::bigint,
  'P11-DB-21: Scoped metrics reports total hackathon = 1'
);

-- P11-DB-22: Super Admin scoped metrics reports verified external team
SELECT is(
  (public.get_admin_dashboard_metrics('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')->'teams'->>'verified_external')::bigint,
  1::bigint,
  'P11-DB-22: Scoped metrics reports verified external team'
);

-- P11-DB-23: Super Admin scoped metrics reports points distributed
SELECT is(
  (public.get_admin_dashboard_metrics('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')->'points'->>'total_distributed')::bigint,
  10::bigint,
  'P11-DB-23: Scoped metrics reports points distributed'
);

-- P11-DB-24: Ordinary admin metrics for assigned event succeeds
SET request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
SELECT lives_ok(
  $$ SELECT public.get_admin_dashboard_metrics('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  'P11-DB-24: Ordinary admin succeeds on assigned hackathon metrics'
);

-- P11-DB-25: Ordinary admin metrics for unassigned event denied (42501)
SELECT throws_ok(
  $$ SELECT public.get_admin_dashboard_metrics('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'P0001',
  'Access denied: not authorized for this hackathon.',
  'P11-DB-25: Ordinary admin denied unassigned hackathon metrics'
);

-- P11-DB-26: Ordinary admin default metrics (NULL hackathon) scopes to assigned events only
SELECT is(
  (public.get_admin_dashboard_metrics(NULL)->'scope'->>'is_global')::boolean,
  false,
  'P11-DB-26: Ordinary admin default metrics is NOT global'
);

-- P11-DB-27: Ordinary admin default metrics event count equals assigned count (1)
SELECT is(
  (public.get_admin_dashboard_metrics(NULL)->'scope'->>'events_count')::int,
  1,
  'P11-DB-27: Ordinary admin metrics reflects 1 assigned event'
);

-- P11-DB-28: Non-existent hackathon throws P0002 for Super Admin
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT throws_ok(
  $$ SELECT public.get_admin_dashboard_metrics('99999999-9999-9999-9999-999999999999') $$,
  'P0002',
  'Target hackathon not found.',
  'P11-DB-28: Non-existent hackathon raises P0002'
);

-------------------------------------------------------------------------------
-- TEST 29-32: EXPORT_PROFILE_CHANGE_REQUESTS_REPORT RPC
-------------------------------------------------------------------------------

-- P11-DB-29: Student denied export_profile_change_requests_report
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "55555555-5555-5555-5555-555555555555"}';
SELECT throws_ok(
  $$ SELECT * FROM public.export_profile_change_requests_report(NULL) $$,
  'P0001',
  'Access denied: caller is not an active administrator.',
  'P11-DB-29: Student denied change requests report'
);

-- P11-DB-30: Admin without export_data/manage_students denied export_profile_change_requests_report
SET request.jwt.claims = '{"sub": "44444444-4444-4444-4444-444444444444"}';
SELECT throws_ok(
  $$ SELECT * FROM public.export_profile_change_requests_report(NULL) $$,
  'P0001',
  'Access denied: export_data or manage_students permission required.',
  'P11-DB-30: Admin without export_data denied change requests report'
);

-- P11-DB-31: Super Admin succeeds on export_profile_change_requests_report
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT is(
  (SELECT count(*)::int >= 1 FROM public.export_profile_change_requests_report(NULL)),
  true,
  'P11-DB-31: Super Admin succeeds on change requests report'
);

-- P11-DB-32: Invalid status filter rejected with 22023
SELECT throws_ok(
  $$ SELECT * FROM public.export_profile_change_requests_report('invalid_status') $$,
  '22023',
  NULL,
  'P11-DB-32: Invalid status filter rejected with 22023'
);

-------------------------------------------------------------------------------
-- TEST 33-37: RLS SCOPING FOR EXPORTS & TEAMS
-------------------------------------------------------------------------------

-- P11-DB-33: Assigned admin with export_data can SELECT assigned student profile
SET request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222"}';
SELECT is(
  (SELECT count(*)::int FROM public.profiles WHERE id = '55555555-5555-5555-5555-555555555555'),
  1,
  'P11-DB-33: Assigned admin with export_data can SELECT assigned student'
);

-- P11-DB-34: Assigned admin with export_data CANNOT SELECT unassigned student profile
SELECT is(
  (SELECT count(*)::int FROM public.profiles WHERE id = '66666666-6666-6666-6666-666666666666'),
  0,
  'P11-DB-34: Assigned admin CANNOT SELECT unassigned student'
);

-- P11-DB-35: Assigned admin with export_data can SELECT assigned hackathon teams
SELECT is(
  (SELECT count(*)::int FROM public.teams WHERE hackathon_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'P11-DB-35: Assigned admin can SELECT assigned hackathon teams'
);

-- P11-DB-36: Assigned admin with export_data CANNOT SELECT other hackathon teams
SELECT is(
  (SELECT count(*)::int FROM public.teams WHERE hackathon_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'P11-DB-36: Assigned admin CANNOT SELECT other hackathon teams'
);

-- P11-DB-37: Assigned admin with export_data can SELECT assigned hackathon team members
SELECT is(
  (SELECT count(*)::int FROM public.team_members WHERE hackathon_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'P11-DB-37: Assigned admin can SELECT assigned hackathon team members'
);

SELECT * FROM finish();
ROLLBACK;
