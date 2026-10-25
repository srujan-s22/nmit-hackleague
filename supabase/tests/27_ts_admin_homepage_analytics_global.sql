-- Suite 27: Admin homepage analytics are identical and platform-wide for every
-- active admin (TS-HPA). Fully self-contained fixture (own id space, no reliance
-- on seed.sql). Does not create a second super admin: the single real one
-- (uq_single_super_admin) is reused as the "Super Admin" caller.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(11);

DO $$
DECLARE
  v_creator UUID := 'eeeeeeee-0000-0000-0000-000000000001'; -- non-super admin, manage_hackathons (in-charge)
  v_plain UUID := 'eeeeeeee-0000-0000-0000-000000000002';   -- non-super admin, NO permissions, no assignments
  v_s1 UUID := 'eeeeeeee-0000-0000-0000-000000000011';
  v_s2 UUID := 'eeeeeeee-0000-0000-0000-000000000012';
  v_s3 UUID := 'eeeeeeee-0000-0000-0000-000000000013';      -- approved, never joins a team
  v_h1 UUID := 'eeeeeeee-0000-0000-0000-000000000021';
  v_h2 UUID := 'eeeeeeee-0000-0000-0000-000000000022';
  v_h3 UUID := 'eeeeeeee-0000-0000-0000-000000000023';      -- draft
  v_t1 UUID := 'eeeeeeee-0000-0000-0000-000000000031';
  v_t2 UUID := 'eeeeeeee-0000-0000-0000-000000000032';
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (v_creator, 'hpa-creator@example.com'), (v_plain, 'hpa-plain@example.com'),
    (v_s1, 'hpa-s1@example.com'), (v_s2, 'hpa-s2@example.com'), (v_s3, 'hpa-s3@example.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active) VALUES
    (v_creator, 'hpa-creator@example.com', 'HPA Creator', false, true),
    (v_plain, 'hpa-plain@example.com', 'HPA Plain Admin', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true;

  INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
  VALUES (v_creator, 'manage_hackathons', v_creator)
  ON CONFLICT (admin_id, permission) DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, usn, phone, branch, academic_year, registration_status) VALUES
    (v_s1, 'hpa-s1@example.com', 'HPA Student One', '1HP22CS001', '+919876501001', 'CSE', 3, 'approved'),
    (v_s2, 'hpa-s2@example.com', 'HPA Student Two', '1HP22CS002', '+919876501002', 'CSE', 3, 'approved'),
    (v_s3, 'hpa-s3@example.com', 'HPA Student Three', '1HP22CS003', '+919876501003', 'CSE', 3, 'approved')
  ON CONFLICT (id) DO UPDATE SET registration_status = 'approved';

  INSERT INTO public.hackathons (
    id, title, slug, description, organizer, mode, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at, created_by
  ) VALUES
    (v_h1, 'HPA Alpha', 'hpa-alpha', 'fixture', 'Dept', 'online', 'published',
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days', v_creator),
    (v_h2, 'HPA Beta', 'hpa-beta', 'fixture', 'Dept', 'online', 'published',
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days', v_creator),
    (v_h3, 'HPA Gamma Draft', 'hpa-gamma', 'fixture', 'Dept', 'online', 'draft',
     now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days', v_creator);

  -- H1: team of s1 (leader) + s2. H2: s2 alone (same student, different hackathon).
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code)
  VALUES (v_t1, v_h1, 'HPA Team One', v_s1, 'HPAINV000001'), (v_t2, v_h2, 'HPA Team Two', v_s2, 'HPAINV000002');
  INSERT INTO public.team_members (team_id, student_id, hackathon_id, role) VALUES
    (v_t1, v_s1, v_h1, 'leader'), (v_t1, v_s2, v_h1, 'member'), (v_t2, v_s2, v_h2, 'leader');
END $$;

-- ---------------------------------------------------------------------------
-- Caller 1: the real Super Admin. Capture its outputs in transaction-local GUCs
-- so they can be compared against the plain admin's outputs byte-for-byte.
-- ---------------------------------------------------------------------------
SELECT set_config('hpa.sa_id', (SELECT id::text FROM public.admin_profiles WHERE is_super_admin = true), true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('hpa.sa_id'), true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('hpa.sa_metrics', (public.get_admin_dashboard_metrics()::text), true);
SELECT set_config('hpa.sa_analytics', (public.get_admin_participation_analytics()::text), true);

-- ---------------------------------------------------------------------------
-- Caller 2: ordinary admin with NO permissions and NO assignments.
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000002', true);

SELECT is(
  (public.get_admin_dashboard_metrics()->'scope'->>'is_global')::boolean, true,
  'TS-HPA-01: plain admin (no permissions/assignments) gets the platform-wide metrics scope'
);
SELECT is(
  (public.get_admin_dashboard_metrics())::text, current_setting('hpa.sa_metrics'),
  'TS-HPA-02: plain admin KPI metrics are byte-identical to the Super Admin''s'
);
SELECT is(
  (public.get_admin_participation_analytics())::text, current_setting('hpa.sa_analytics'),
  'TS-HPA-03: plain admin chart analytics are byte-identical to the Super Admin''s'
);

-- Fixture-specific numbers (scoped to the fixture hackathons, so absolute
-- totals from other data in the database don't matter).
SELECT is(
  (public.get_admin_participation_analytics('eeeeeeee-0000-0000-0000-000000000021')->'participation'->>'participating')::int, 2,
  'TS-HPA-04: scoped to H1, plain admin sees 2 distinct participating students'
);
SELECT is(
  (public.get_admin_participation_analytics('eeeeeeee-0000-0000-0000-000000000022')->'participation'->>'participating')::int, 1,
  'TS-HPA-05: scoped to H2, plain admin sees 1 distinct participating student'
);
SELECT is(
  jsonb_array_length(public.get_admin_participation_analytics('eeeeeeee-0000-0000-0000-000000000021')->'activity'), 1,
  'TS-HPA-06: scoped activity chart contains only the selected hackathon'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.get_admin_participation_analytics()->'activity') e
    WHERE e->>'hackathon_id' = 'eeeeeeee-0000-0000-0000-000000000023'
  ),
  'TS-HPA-07: draft hackathon is excluded from the activity chart'
);
SELECT ok(
  (public.get_admin_participation_analytics()->'participation'->>'participating')::bigint
    + (public.get_admin_participation_analytics()->'participation'->>'not_participating')::bigint
    = (public.get_admin_participation_analytics()->'participation'->>'total_students')::bigint,
  'TS-HPA-08: participating + not_participating reconciles to total eligible students'
);

-- ---------------------------------------------------------------------------
-- Denials
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000013', true); -- approved student, not an admin
SELECT throws_ok(
  $$ SELECT public.get_admin_participation_analytics() $$,
  'P0001', 'Access denied: caller is not an active administrator.',
  'TS-HPA-09: an approved student (non-admin) is denied'
);

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.get_admin_participation_analytics() $$,
  '42501', NULL,
  'TS-HPA-10: anon cannot execute the analytics RPC'
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000002', true);
SELECT throws_ok(
  $$ SELECT public.get_admin_participation_analytics('00000000-0000-0000-0000-00000000dead') $$,
  'P0002', 'Target hackathon not found.',
  'TS-HPA-11: unknown hackathon id is rejected'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
