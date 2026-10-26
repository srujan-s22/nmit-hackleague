-- Suite 28: Reports & Exports Hub (TS-EXP)
-- Verifies the database-authoritative export RPCs from
-- 20261031000001_reports_export_hub.sql:
--   get_export_capabilities, get_exportable_hackathons, get_export_dataset_counts,
--   export_dataset_page, record_data_export.
-- Uses the seeded Super Admin (00000000-0000-0000-0000-000000000001) like suite 21;
-- every other actor/row is a self-contained e0280000-... fixture.
BEGIN;
SELECT plan(38);

DO $$
DECLARE
  v_super UUID := '00000000-0000-0000-0000-000000000001';
  v_assigned UUID := 'e0280000-0000-0000-0000-000000000002'; -- export_data + assigned to H1
  v_pii UUID := 'e0280000-0000-0000-0000-000000000003';      -- export_data + view_student_data + assigned to H1
  v_incharge UUID := 'e0280000-0000-0000-0000-000000000004'; -- export_data, in_charge of H2 (trigger-synced assignment)
  v_orphan UUID := 'e0280000-0000-0000-0000-000000000007';   -- export_data, in_charge pointer on H3 but assignment row removed
  v_incharge_noexp UUID := 'e0280000-0000-0000-0000-000000000008'; -- in_charge of H4, NO export_data
  v_noexport UUID := 'e0280000-0000-0000-0000-000000000005'; -- assigned to H1 but NO export_data
  v_student UUID := 'e0280000-0000-0000-0000-000000000006';
  v_h1 UUID := 'e0280000-0000-0000-0000-000000000010';
  v_h2 UUID := 'e0280000-0000-0000-0000-000000000011';
  v_h3 UUID := 'e0280000-0000-0000-0000-000000000012';
  v_h4 UUID := 'e0280000-0000-0000-0000-000000000013';
  v_round UUID := 'e0280000-0000-0000-0000-000000000020';
  v_team UUID := 'e0280000-0000-0000-0000-000000000030';
  v_sub UUID := 'e0280000-0000-0000-0000-000000000040';
  v_review UUID := 'e0280000-0000-0000-0000-000000000041';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_assigned, 'exp-assigned@test.com'), (v_pii, 'exp-pii@test.com'),
    (v_incharge, 'exp-incharge@test.com'), (v_noexport, 'exp-noexport@test.com'),
    (v_orphan, 'exp-orphan@test.com'), (v_incharge_noexp, 'exp-incharge-noexp@test.com'),
    (v_student, 'exp-student@test.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active) VALUES
    (v_assigned, 'exp-assigned@test.com', 'Exp Assigned', false, true),
    (v_pii, 'exp-pii@test.com', 'Exp Pii', false, true),
    (v_incharge, 'exp-incharge@test.com', 'Exp In Charge', false, true),
    (v_noexport, 'exp-noexport@test.com', 'Exp No Export', false, true),
    (v_orphan, 'exp-orphan@test.com', 'Exp Orphan', false, true),
    (v_incharge_noexp, 'exp-incharge-noexp@test.com', 'Exp In Charge No Export', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;

  INSERT INTO public.profiles (id, full_name, email, usn, branch, academic_year, phone, sex, registration_status)
  VALUES (v_student, 'Exp Student', 'exp-student@test.com', '1EX22CS001', 'CSE', 3, '+919800000001', 'Male', 'approved')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_permissions (admin_id, permission, granted_by) VALUES
    (v_assigned, 'export_data', v_super),
    (v_pii, 'export_data', v_super), (v_pii, 'view_student_data', v_super),
    (v_incharge, 'export_data', v_super), (v_incharge, 'manage_hackathons', v_super),
    (v_orphan, 'export_data', v_super), (v_orphan, 'manage_hackathons', v_super),
    (v_incharge_noexp, 'manage_hackathons', v_super)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at,
    in_charge_admin_id, created_by
  ) VALUES
    (v_h1, 'Exp Hackathon One', 'exp-hackathon-one', 'd', 'NMIT', 'online', 'published',
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
     v_super, v_super),
    (v_h2, 'Exp Hackathon Two', 'exp-hackathon-two', 'd', 'NMIT', 'online', 'published',
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
     v_incharge, v_super),
    (v_h3, 'Exp Hackathon Three', 'exp-hackathon-three', 'd', 'NMIT', 'online', 'published',
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
     v_orphan, v_super),
    (v_h4, 'Exp Hackathon Four', 'exp-hackathon-four', 'd', 'NMIT', 'online', 'published',
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days',
     v_incharge_noexp, v_super)
  ON CONFLICT (id) DO UPDATE SET in_charge_admin_id = EXCLUDED.in_charge_admin_id;

  -- in_charge_admin_id is synced into hackathon_admin_assignments by trigger. Remove the
  -- orphan's synced row so the pointer alone is all it holds on H3: that must grant nothing.
  DELETE FROM public.hackathon_admin_assignments WHERE hackathon_id = v_h3 AND admin_id = v_orphan;

  INSERT INTO public.hackathon_rounds (id, hackathon_id, round_number, name, start_at, end_at, status)
  VALUES (v_round, v_h1, 1, 'Exp Round One', now() - interval '1 day', now() + interval '5 days', 'open')
  ON CONFLICT (id) DO NOTHING;

  -- Assignments: assigned/pii/noexport on H1. v_incharge's H2 assignment comes from the sync trigger.
  INSERT INTO public.hackathon_admin_assignments (hackathon_id, admin_id, role, assigned_by) VALUES
    (v_h1, v_assigned, 'reviewer', v_super),
    (v_h1, v_pii, 'reviewer', v_super),
    (v_h1, v_noexport, 'reviewer', v_super)
  ON CONFLICT (hackathon_id, admin_id) DO NOTHING;

  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status)
  VALUES (v_team, v_h1, 'Exp Team Alpha', v_student, 'EXPINV0001', 'complete', 'submitted')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role)
  VALUES (v_team, v_student, v_h1, 'leader') ON CONFLICT DO NOTHING;

  -- 1,501 ledger rows on H1 for the pagination proof (1,500 synthetic + 1 named).
  INSERT INTO public.points_ledger (idempotency_key, student_id, hackathon_id, team_id, round_id, milestone_type, role_at_award, points, reason, awarded_by)
  SELECT 'exp28-bulk-' || g, v_student, v_h1, v_team, v_round, 'manual_adjustment', 'leader', 1, 'Bulk row ' || g, v_super
  FROM generate_series(1, 1500) g
  ON CONFLICT DO NOTHING;
  INSERT INTO public.points_ledger (idempotency_key, student_id, hackathon_id, team_id, milestone_type, role_at_award, points, reason, awarded_by)
  VALUES ('exp28-named', v_student, v_h1, v_team, 'participation', 'leader', 5, '=cmd|named row', v_super)
  ON CONFLICT DO NOTHING;

  -- A review on H1 that none of the export-only admins can read through table RLS.
  INSERT INTO public.submissions (id, hackathon_id, round_id, team_id, submitted_by, title, description, status)
  VALUES (v_sub, v_h1, v_round, v_team, v_student, 'Exp Submission', 'desc', 'accepted')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.submission_reviews (id, submission_id, reviewer_id, decision, feedback, score)
  VALUES (v_review, v_sub, v_assigned, 'accepted', 'Looks good', 9)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profile_change_requests (student_id, field_name, old_value, new_value, reason, status)
  VALUES (v_student, 'phone', '+919800000001', '+919800000002', 'new number', 'approved');
END $$;

-- Result holder for the paging proof (written as the authenticated role).
CREATE TEMP TABLE exp28_pages (row_id uuid);
GRANT ALL ON exp28_pages TO authenticated;

-------------------------------------------------------------------------------
-- Capabilities & exportable hackathons
-------------------------------------------------------------------------------
SET ROLE authenticated;

SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT is(
  (public.get_export_capabilities() ->> 'is_super_admin')::boolean AND (public.get_export_capabilities() ->> 'can_export_global')::boolean,
  true, 'TS-EXP-01: Super Admin has global export capability');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000002"}';
SELECT is(
  public.get_export_capabilities() - 'is_super_admin',
  '{"can_export": true, "can_export_global": false, "can_view_personal_data": false, "can_export_audit_logs": false, "can_export_storage_queue": false, "can_export_profile_changes": false}'::jsonb,
  'TS-EXP-02: regular admin with export_data only: no global, personal-data, audit, profile-change or storage capability');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000003"}';
SELECT is((public.get_export_capabilities() ->> 'can_view_personal_data')::boolean, true,
  'TS-EXP-03: view_student_data grants the personal-data capability');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000006"}';
SELECT throws_ok($$ SELECT public.get_export_capabilities() $$, '42501',
  'Access denied: caller is not an active administrator.', 'TS-EXP-04: non-admin denied capabilities');
SELECT throws_ok($$ SELECT * FROM public.get_exportable_hackathons() $$, '42501',
  'Access denied: caller is not an active administrator.', 'TS-EXP-05: non-admin denied hackathon list');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000002"}';
SELECT is(
  (SELECT array_agg(id ORDER BY id) FROM public.get_exportable_hackathons()),
  ARRAY['e0280000-0000-0000-0000-000000000010'::uuid],
  'TS-EXP-06: assigned admin sees exactly the assigned hackathon');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000004"}';
SELECT is(
  (SELECT array_agg(id ORDER BY id) FROM public.get_exportable_hackathons()),
  ARRAY['e0280000-0000-0000-0000-000000000011'::uuid],
  'TS-EXP-07: an in-charge admin with export_data sees the hackathon through its synced assignment');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000007"}';
SELECT is((SELECT count(*)::int FROM public.get_exportable_hackathons()), 0,
  'TS-EXP-07b: in_charge_admin_id alone (assignment removed) grants no exportable hackathons');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000005"}';
SELECT is((SELECT count(*)::int FROM public.get_exportable_hackathons()), 0,
  'TS-EXP-08: assignment without export_data grants no exportable hackathons');

SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT ok(
  (SELECT count(*) FROM public.get_exportable_hackathons()
   WHERE id IN ('e0280000-0000-0000-0000-000000000010', 'e0280000-0000-0000-0000-000000000011')) = 2,
  'TS-EXP-09: Super Admin sees every hackathon');

-------------------------------------------------------------------------------
-- Scope authorization (counts + pages share one authority)
-------------------------------------------------------------------------------
SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000002"}';
SELECT is(
  (public.get_export_dataset_counts('e0280000-0000-0000-0000-000000000010', ARRAY['students', 'points', 'reviews'])),
  '{"students": 1, "points": 1501, "reviews": 1}'::jsonb,
  'TS-EXP-10: assigned admin gets exact counts incl. reviews RLS would hide from them');

SELECT throws_ok(
  $$ SELECT public.get_export_dataset_counts('e0280000-0000-0000-0000-000000000011', ARRAY['students']) $$,
  '42501', 'Access denied: not authorized to export data for this hackathon.',
  'TS-EXP-11: assigned admin denied an unassigned hackathon');
SELECT throws_ok(
  $$ SELECT public.get_export_dataset_counts(NULL, ARRAY['students']) $$,
  '42501', 'Access denied: platform-wide global exports require Super Admin privilege.',
  'TS-EXP-12: regular admin denied global scope');
SELECT throws_ok(
  $$ SELECT * FROM public.export_dataset_page('students', 'e0280000-0000-0000-0000-000000000011', NULL, 10) $$,
  '42501', 'Access denied: not authorized to export data for this hackathon.',
  'TS-EXP-13: page RPC denies an unassigned hackathon');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000007"}';
SELECT throws_ok(
  $$ SELECT * FROM public.export_dataset_page('teams', 'e0280000-0000-0000-0000-000000000012', NULL, 10) $$,
  '42501', 'Access denied: not authorized to export data for this hackathon.',
  'TS-EXP-14: in_charge_admin_id without an assignment cannot bypass the permission model');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000008"}';
SELECT throws_ok(
  $$ SELECT * FROM public.export_dataset_page('teams', 'e0280000-0000-0000-0000-000000000013', NULL, 10) $$,
  '42501', 'Access denied: export_data permission required.',
  'TS-EXP-14b: in-charge admin without export_data is denied');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000005"}';
SELECT throws_ok(
  $$ SELECT * FROM public.export_dataset_page('students', 'e0280000-0000-0000-0000-000000000010', NULL, 10) $$,
  '42501', 'Access denied: export_data permission required.',
  'TS-EXP-15: assignment without export_data denied');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000006"}';
SELECT throws_ok(
  $$ SELECT * FROM public.export_dataset_page('students', 'e0280000-0000-0000-0000-000000000010', NULL, 10) $$,
  '42501', 'Access denied: caller is not an active administrator.',
  'TS-EXP-16: non-admin denied');

SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT lives_ok(
  $$ SELECT public.get_export_dataset_counts(NULL, ARRAY['students', 'storage_objects', 'audit_logs']) $$,
  'TS-EXP-17: Super Admin may export global scope and every advanced dataset');
SELECT throws_ok(
  $$ SELECT public.get_export_dataset_counts('e0280000-0000-0000-0000-0000000000ff', ARRAY['students']) $$,
  'P0002', 'Target hackathon not found.', 'TS-EXP-18: Super Admin gets a clear error for a stale hackathon id');
SELECT throws_ok(
  $$ SELECT public.get_export_dataset_counts(NULL, ARRAY['not_a_dataset']) $$,
  '22023', 'Invalid export dataset: not_a_dataset.', 'TS-EXP-19: unknown dataset rejected');

-------------------------------------------------------------------------------
-- Advanced datasets keep their own permissions
-------------------------------------------------------------------------------
SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000002"}';
SELECT throws_ok(
  $$ SELECT * FROM public.export_dataset_page('audit_logs', 'e0280000-0000-0000-0000-000000000010', NULL, 10) $$,
  '42501', 'Access denied: view_audit_logs permission required to export audit logs.',
  'TS-EXP-20: audit logs need view_audit_logs');
SELECT throws_ok(
  $$ SELECT * FROM public.export_dataset_page('profile_change_requests', 'e0280000-0000-0000-0000-000000000010', NULL, 10) $$,
  '42501', 'Access denied: manage_students permission required to export profile change requests.',
  'TS-EXP-21: profile changes need manage_students');
SELECT throws_ok(
  $$ SELECT * FROM public.export_dataset_page('storage_objects', 'e0280000-0000-0000-0000-000000000010', NULL, 10) $$,
  '42501', 'Access denied: Super Admin status is required to export the storage retention queue.',
  'TS-EXP-22: storage retention queue is Super Admin only');

-------------------------------------------------------------------------------
-- Personal data gating
-------------------------------------------------------------------------------
SELECT is(
  (SELECT (data ? 'email') OR (data ? 'phone')
   FROM public.export_dataset_page('students', 'e0280000-0000-0000-0000-000000000010', NULL, 10) LIMIT 1),
  false, 'TS-EXP-23: email/phone omitted for admin without view_student_data');

SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000003"}';
SELECT is(
  (SELECT data ->> 'email'
   FROM public.export_dataset_page('students', 'e0280000-0000-0000-0000-000000000010', NULL, 10) LIMIT 1),
  'exp-student@test.com', 'TS-EXP-24: email included with view_student_data');

SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT is(
  (SELECT data ->> 'new_value'
   FROM public.export_dataset_page('profile_change_requests', 'e0280000-0000-0000-0000-000000000010', NULL, 10)
   WHERE data ->> 'field_name' = 'phone' LIMIT 1),
  '+919800000002', 'TS-EXP-25: Super Admin sees profile-change phone values');

-------------------------------------------------------------------------------
-- Readable rows, no multiplied joins
-------------------------------------------------------------------------------
SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000002"}';
SELECT is(
  (SELECT data ->> 'team_name' || '/' || (data ->> 'hackathon_title') || '/' || (data ->> 'leader_name') || '/' || (data ->> 'member_count')
   FROM public.export_dataset_page('teams', 'e0280000-0000-0000-0000-000000000010', NULL, 10)),
  'Exp Team Alpha/Exp Hackathon One/Exp Student/1',
  'TS-EXP-26: teams carry names, not only ids, and a single member count');
SELECT is(
  (SELECT count(*)::int FROM public.export_dataset_page('team_members', 'e0280000-0000-0000-0000-000000000010', NULL, 10)),
  1, 'TS-EXP-27: team_members joins do not duplicate rows');
SELECT is(
  (SELECT data ->> 'reviewer_name' || '/' || (data ->> 'team_name') || '/' || (data ->> 'round_name')
   FROM public.export_dataset_page('reviews', 'e0280000-0000-0000-0000-000000000010', NULL, 10)),
  'Exp Assigned/Exp Team Alpha/Exp Round One',
  'TS-EXP-28: reviews are readable and visible to an export-authorized admin');

-------------------------------------------------------------------------------
-- Pagination completeness: 1,501 rows exactly once
-------------------------------------------------------------------------------
DO $$
DECLARE
  v_after uuid := NULL;
  v_n integer;
BEGIN
  LOOP
    WITH page AS (
      SELECT row_id FROM public.export_dataset_page('points', 'e0280000-0000-0000-0000-000000000010', v_after, 1000)
    ), ins AS (
      INSERT INTO exp28_pages SELECT row_id FROM page RETURNING row_id
    )
    SELECT count(*), max(row_id::text)::uuid INTO v_n, v_after FROM ins;
    EXIT WHEN v_n < 1000;
  END LOOP;
END $$;

SELECT is((SELECT count(*)::int FROM exp28_pages), 1501, 'TS-EXP-29: paging returns all 1,501 rows');
SELECT is((SELECT count(DISTINCT row_id)::int FROM exp28_pages), 1501, 'TS-EXP-30: no row is returned twice');

-------------------------------------------------------------------------------
-- Audit lifecycle
-------------------------------------------------------------------------------
SET request.jwt.claims = '{"sub": "e0280000-0000-0000-0000-000000000002"}';
SELECT lives_ok(
  $$ SELECT public.record_data_export(ARRAY['points'], 'xlsx', 'e0280000-0000-0000-0000-000000000010', 'success', '{"points": 1501}'::jsonb, NULL) $$,
  'TS-EXP-31: authorized success is recorded');
SELECT throws_ok(
  $$ SELECT public.record_data_export(ARRAY['points'], 'xlsx', 'e0280000-0000-0000-0000-000000000011', 'success', '{"points": 1}'::jsonb, NULL) $$,
  '42501', 'Access denied: not authorized to export data for this hackathon.',
  'TS-EXP-32: a success entry cannot be forged for an unauthorized scope');
SELECT lives_ok(
  $$ SELECT public.record_data_export(ARRAY['points'], 'csv', 'e0280000-0000-0000-0000-000000000010', 'failed', '{}'::jsonb, 'delivery_interrupted') $$,
  'TS-EXP-33: a failure is recorded with a category');
SELECT throws_ok(
  $$ SELECT public.record_data_export(ARRAY['points'], 'csv', NULL, 'success', '{"points": "x"}'::jsonb, NULL) $$,
  '22023', NULL, 'TS-EXP-34: malformed row counts rejected');

RESET ROLE;
SET request.jwt.claims = '';
SELECT is(
  (SELECT array_agg(action ORDER BY action) FROM public.audit_logs
   WHERE actor_id = 'e0280000-0000-0000-0000-000000000002' AND target_type = 'report'),
  ARRAY['data.export_failed', 'data.exported'],
  'TS-EXP-35: exactly one success and one failure entry, nothing from rejected attempts');
SELECT is(
  (SELECT details ->> 'failure_category' FROM public.audit_logs
   WHERE actor_id = 'e0280000-0000-0000-0000-000000000002' AND action = 'data.export_failed'),
  'delivery_interrupted', 'TS-EXP-36: failure audit stores the category');

SELECT * FROM finish();
ROLLBACK;
