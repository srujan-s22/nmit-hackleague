-- ==============================================================================
-- Test Suite: 24_ts_notification_system_master_repair.sql
-- Description: Master Repair Verification for Notification System Schema,
--              Permissions, RLS Visibility, Read Receipts, and Delivery Tracking.
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(22);

-- ----------------------------------------------------------------------------
-- Fixture Setup
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_super_id UUID := '00000000-0000-0000-0000-000000000001';
  v_admin_id UUID := '11111111-2222-3333-4444-555555555555';
  v_other_admin_id UUID := '22222222-3333-4444-5555-666666666666';
  v_student_1 UUID := '44444444-5555-6666-7777-888888888888';
  v_student_2 UUID := '55555555-6666-7777-8888-999999999999';
  v_hackathon_id UUID := 'aaaaaaaa-1111-2222-3333-444444444444';
  v_team_id UUID := 'cccccccc-1111-2222-3333-444444444444';
BEGIN
  -- 1. Ensure Auth users exist
  INSERT INTO auth.users (id, email) VALUES
    (v_super_id, 'super_repair@test.com'),
    (v_admin_id, 'admin_notif_repair@test.com'),
    (v_other_admin_id, 'admin_other_repair@test.com'),
    (v_student_1, 'student1_repair@test.com'),
    (v_student_2, 'student2_repair@test.com')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Admin profiles
  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active) VALUES
    (v_super_id, 'super_repair@test.com', 'Super Admin Repair', true, true),
    (v_admin_id, 'admin_notif_repair@test.com', 'Notif Admin Repair', false, true),
    (v_other_admin_id, 'admin_other_repair@test.com', 'Other Admin Repair', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = EXCLUDED.is_super_admin;

  -- 3. Admin permissions
  INSERT INTO public.admin_permissions (admin_id, permission, granted_by) VALUES
    (v_admin_id, 'manage_notifications', v_super_id),
    (v_admin_id, 'manage_hackathons', v_super_id)
  ON CONFLICT DO NOTHING;

  -- 4. Student profiles
  INSERT INTO public.profiles (id, full_name, email, usn, branch, academic_year, phone, sex, registration_status) VALUES
    (v_student_1, 'Student One Repair', 'student1_repair@test.com', '1NT21CS991', 'CSE', 3, '+919876543201', 'Male', 'approved'),
    (v_student_2, 'Student Two Repair', 'student2_repair@test.com', '1NT21IS992', 'ISE', 2, '+919876543202', 'Female', 'approved')
  ON CONFLICT (id) DO NOTHING;

  -- 5. Hackathon & Team with Student 1
  INSERT INTO public.hackathons (
    id, title, description, slug, mode, organizer, status, min_team_size, max_team_size,
    is_solo_allowed, registration_start_at, registration_end_at, event_start_at, event_end_at,
    in_charge_admin_id, created_by
  ) VALUES (
    v_hackathon_id, 'Master Repair Hackathon', 'Event description', 'repair-hackathon', 'online', 'NMIT', 'published', 1, 4,
    true, now() - interval '1 day', now() + interval '2 days', now() + interval '3 days', now() + interval '5 days',
    v_admin_id, v_super_id
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status) VALUES
    (v_team_id, v_hackathon_id, 'Repair Team Alpha', v_student_1, 'INVREPAIR1', 'complete', 'submitted')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.team_members (id, team_id, student_id, hackathon_id, role) VALUES
    ('eeeeeeee-1111-2222-3333-444444444444', v_team_id, v_student_1, v_hackathon_id, 'leader')
  ON CONFLICT DO NOTHING;
END $$;

-- ----------------------------------------------------------------------------
-- SECTION 1: Table Privileges & Grants Verification
-- ----------------------------------------------------------------------------

-- TS-REP-01: Verify authenticated has table grants on announcements
SELECT ok(
  has_table_privilege('authenticated', 'public.announcements', 'SELECT, INSERT, UPDATE, DELETE'),
  'TS-REP-01: Role authenticated has CRUD privileges on public.announcements'
);

-- TS-REP-02: Verify service_role has table grants on announcements
SELECT ok(
  has_table_privilege('service_role', 'public.announcements', 'SELECT, INSERT, UPDATE, DELETE'),
  'TS-REP-02: Role service_role has CRUD privileges on public.announcements'
);

-- TS-REP-03: Verify table grants on announcement_reads
SELECT ok(
  has_table_privilege('authenticated', 'public.announcement_reads', 'SELECT, INSERT, UPDATE, DELETE') AND
  has_table_privilege('service_role', 'public.announcement_reads', 'SELECT, INSERT, UPDATE, DELETE'),
  'TS-REP-03: Roles authenticated and service_role have privileges on public.announcement_reads'
);

-- TS-REP-04: Verify table grants on push_delivery_logs
-- Narrowed by 20261030000001_harden_push_registration_and_round_pause_grants:
-- authenticated keeps read/write-new-row access only; UPDATE/DELETE are
-- service_role-only now (no RLS policy ever permitted them for authenticated,
-- so this closes an unused over-grant). See suite 25 (TS-HRD-08) for the
-- paired negative assertions.
SELECT ok(
  has_table_privilege('authenticated', 'public.push_delivery_logs', 'SELECT, INSERT') AND
  NOT has_table_privilege('authenticated', 'public.push_delivery_logs', 'UPDATE') AND
  NOT has_table_privilege('authenticated', 'public.push_delivery_logs', 'DELETE') AND
  has_table_privilege('service_role', 'public.push_delivery_logs', 'SELECT, INSERT, UPDATE, DELETE'),
  'TS-REP-04: authenticated retains SELECT/INSERT on push_delivery_logs; UPDATE/DELETE now service_role-only'
);

-- TS-REP-05: Verify table grants on user_push_subscriptions
SELECT ok(
  has_table_privilege('authenticated', 'public.user_push_subscriptions', 'SELECT, INSERT, UPDATE, DELETE') AND
  has_table_privilege('service_role', 'public.user_push_subscriptions', 'SELECT, INSERT, UPDATE, DELETE'),
  'TS-REP-05: Roles authenticated and service_role have privileges on public.user_push_subscriptions'
);

-- ----------------------------------------------------------------------------
-- SECTION 2: Foreign Key Constraint on announcement_reads
-- ----------------------------------------------------------------------------

-- TS-REP-06: FK references auth.users(id) instead of profiles(id)
SELECT ok(
  EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conrelid = 'public.announcement_reads'::regclass 
      AND conname = 'announcement_reads_user_id_fkey' 
      AND confrelid = 'auth.users'::regclass
  ),
  'TS-REP-06: announcement_reads_user_id_fkey references auth.users(id)'
);

-- ----------------------------------------------------------------------------
-- SECTION 3: RLS Visibility for Broadcast History & Creator
-- ----------------------------------------------------------------------------

-- Create test announcements
DO $$
DECLARE
  v_admin_id UUID := '11111111-2222-3333-4444-555555555555';
BEGIN
  -- Announcement 1: Global student-targeted
  INSERT INTO public.announcements (id, title, body, target_role, created_by)
  VALUES ('11110000-0000-0000-0000-000000000001', 'Student Alert Only', 'Message for students only.', 'students', v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- Announcement 2: Global admin-targeted
  INSERT INTO public.announcements (id, title, body, target_role, created_by)
  VALUES ('11110000-0000-0000-0000-000000000002', 'Admin Alert Only', 'Message for admins only.', 'admins', v_admin_id)
  ON CONFLICT (id) DO NOTHING;

  -- Announcement 3: Scoped hackathon announcement
  INSERT INTO public.announcements (id, title, body, target_role, hackathon_id, created_by)
  VALUES ('11110000-0000-0000-0000-000000000003', 'Scoped Round 1 Announcement', 'Hackathon round is open.', 'students', 'aaaaaaaa-1111-2222-3333-444444444444', v_admin_id)
  ON CONFLICT (id) DO NOTHING;
END $$;

-- TS-REP-07: Admin with manage_notifications can view student-targeted global announcement
SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555';
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.announcements WHERE id = '11110000-0000-0000-0000-000000000001'
  ),
  'TS-REP-07: Admin with manage_notifications can view student-targeted broadcast in history'
);

-- TS-REP-08: Admin with manage_notifications can view admin-targeted global announcement
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.announcements WHERE id = '11110000-0000-0000-0000-000000000002'
  ),
  'TS-REP-08: Admin can view admin-targeted announcement in broadcast history'
);

-- TS-REP-09: Creator can view their own announcement even if scoped
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.announcements WHERE id = '11110000-0000-0000-0000-000000000003'
  ),
  'TS-REP-09: Announcement creator can view their scoped broadcast'
);

-- TS-REP-10: Student 1 (enrolled in hackathon) can view scoped announcement
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.announcements WHERE id = '11110000-0000-0000-0000-000000000003'
  ),
  'TS-REP-10: Enrolled Student 1 can view scoped hackathon announcement'
);

-- TS-REP-11: Student 2 (not enrolled in hackathon) cannot view scoped announcement
SET request.jwt.claim.sub = '55555555-6666-7777-8888-999999999999';
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.announcements WHERE id = '11110000-0000-0000-0000-000000000003'
  ),
  'TS-REP-11: Unenrolled Student 2 cannot view scoped hackathon announcement'
);

-- TS-REP-12: Student cannot view admin-targeted announcement
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.announcements WHERE id = '11110000-0000-0000-0000-000000000002'
  ),
  'TS-REP-12: Students cannot view admin-only announcement'
);

-- TS-REP-13: Student can view global student-targeted announcement
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.announcements WHERE id = '11110000-0000-0000-0000-000000000001'
  ),
  'TS-REP-13: Students can view global student-targeted announcement'
);

-- ----------------------------------------------------------------------------
-- SECTION 4: Read Receipts by Administrators & Students
-- ----------------------------------------------------------------------------

-- TS-REP-14: Admin can mark announcement as read without FK violation
SET request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555';
SELECT lives_ok(
  $$ SELECT public.mark_announcement_read('11110000-0000-0000-0000-000000000001') $$,
  'TS-REP-14: Admin can mark announcement as read without FK violation'
);

-- TS-REP-15: Student 1 can mark announcement as read
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT lives_ok(
  $$ SELECT public.mark_announcement_read('11110000-0000-0000-0000-000000000001') $$,
  'TS-REP-15: Student 1 can mark announcement as read'
);

-- TS-REP-16: Calling mark_announcement_read again is idempotent (no duplicate key crash)
SELECT lives_ok(
  $$ SELECT public.mark_announcement_read('11110000-0000-0000-0000-000000000001') $$,
  'TS-REP-16: Repeated mark_announcement_read is strictly idempotent'
);

-- TS-REP-17: Reads row correctly persisted for Student 1
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.announcement_reads
    WHERE announcement_id = '11110000-0000-0000-0000-000000000001'
      AND user_id = '44444444-5555-6666-7777-888888888888'
  ),
  'TS-REP-17: Read receipt record is present in public.announcement_reads'
);

-- ----------------------------------------------------------------------------
-- SECTION 5: Push Delivery Outcome & Deactivation
-- ----------------------------------------------------------------------------

-- Setup subscription fixture for Student 1
DO $$
BEGIN
  INSERT INTO public.user_push_subscriptions (
    id, user_id, endpoint, p256dh, auth, device_fingerprint, active
  ) VALUES (
    '88880000-0000-0000-0000-000000000001',
    '44444444-5555-6666-7777-888888888888',
    'https://fcm.googleapis.com/fcm/send/repair-test-token-1',
    'dummy-p256',
    'dummy-auth',
    'fp-repair-1',
    true
  ) ON CONFLICT (endpoint) DO UPDATE SET active = true;
END $$;

-- TS-REP-18: Admin can log push delivery outcome (delivered)
SET request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555';
SELECT lives_ok(
  $$
    SELECT public.log_push_delivery_outcome(
      '11110000-0000-0000-0000-000000000001',
      '88880000-0000-0000-0000-000000000001',
      '44444444-5555-6666-7777-888888888888',
      'https://fcm.googleapis.com/fcm/send/repair-test-token-1',
      'delivered',
      201,
      NULL,
      1
    )
  $$,
  'TS-REP-18: log_push_delivery_outcome records delivered status'
);

-- TS-REP-19: Logging expired outcome (410 Gone) deactivates subscription
SELECT lives_ok(
  $$
    SELECT public.log_push_delivery_outcome(
      '11110000-0000-0000-0000-000000000001',
      '88880000-0000-0000-0000-000000000001',
      '44444444-5555-6666-7777-888888888888',
      'https://fcm.googleapis.com/fcm/send/repair-test-token-1',
      'expired',
      410,
      'Subscription expired at push gateway',
      2
    )
  $$,
  'TS-REP-19: log_push_delivery_outcome records expired status'
);

-- TS-REP-20: Subscription was automatically deactivated in public.user_push_subscriptions
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.user_push_subscriptions
    WHERE id = '88880000-0000-0000-0000-000000000001'
      AND active = false
  ),
  'TS-REP-20: Expired subscription marked active = false automatically'
);

-- TS-REP-21: Push delivery logs count contains delivered and expired records
SELECT is(
  (SELECT COUNT(*)::INT FROM public.push_delivery_logs WHERE announcement_id = '11110000-0000-0000-0000-000000000001'),
  2,
  'TS-REP-21: push_delivery_logs contains both delivery attempts'
);

-- TS-REP-22: Admin can query push_delivery_logs for stats
SELECT ok(
  (SELECT COUNT(*) FROM public.push_delivery_logs WHERE status = 'delivered') >= 1,
  'TS-REP-22: Admin can query delivered push delivery logs'
);

ROLLBACK;
