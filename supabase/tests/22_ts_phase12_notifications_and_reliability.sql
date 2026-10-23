-- Test Suite: 22_ts_phase12_notifications_and_reliability.sql
-- Description: Phase 12 - Database verification for Notifications, Transactional Emails, RLS, and Reliability

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(38);

-- ----------------------------------------------------------------------------
-- Fixture Setup
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_super_id UUID := '00000000-0000-0000-0000-000000000001';
  v_notif_admin_id UUID := '11111111-2222-3333-4444-555555555555';
  v_assigned_admin_id UUID := '22222222-3333-4444-5555-666666666666';
  v_unassigned_admin_id UUID := '33333333-4444-5555-6666-777777777777';
  v_student_1_id UUID := '44444444-5555-6666-7777-888888888888';
  v_student_2_id UUID := '55555555-6666-7777-8888-999999999999';
  v_hackathon_id UUID := 'aaaaaaaa-1111-2222-3333-444444444444';
  v_round_id UUID := 'bbbbbbbb-1111-2222-3333-444444444444';
  v_team_id UUID := 'cccccccc-1111-2222-3333-444444444444';
BEGIN
  -- 1. Create auth users
  INSERT INTO auth.users (id, email) VALUES
    (v_notif_admin_id, 'notif_admin@test.com'),
    (v_assigned_admin_id, 'assigned_admin@test.com'),
    (v_unassigned_admin_id, 'unassigned_admin@test.com'),
    (v_student_1_id, 'student1_phase12@test.com'),
    (v_student_2_id, 'student2_phase12@test.com')
  ON CONFLICT (id) DO NOTHING;

  -- 2. Create Admin Profiles
  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active) VALUES
    (v_notif_admin_id, 'notif_admin@test.com', 'Notification Admin', false, true),
    (v_assigned_admin_id, 'assigned_admin@test.com', 'Assigned Admin', false, true),
    (v_unassigned_admin_id, 'unassigned_admin@test.com', 'Unassigned Admin', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = EXCLUDED.is_super_admin;

  -- 3. Grant admin permissions
  INSERT INTO public.admin_permissions (admin_id, permission, granted_by) VALUES
    (v_notif_admin_id, 'manage_notifications', v_super_id),
    (v_assigned_admin_id, 'manage_hackathons', v_super_id),
    (v_unassigned_admin_id, 'export_data', v_super_id)
  ON CONFLICT DO NOTHING;

  -- 4. Create Student Profiles
  INSERT INTO public.profiles (id, full_name, email, usn, branch, academic_year, phone, sex, registration_status) VALUES
    (v_student_1_id, 'Student One', 'student1_phase12@test.com', '1NT21CS888', 'CSE', 3, '+919876543210', 'Male', 'approved'),
    (v_student_2_id, 'Student Two', 'student2_phase12@test.com', '1NT21IS888', 'ISE', 2, '+919876543211', 'Female', 'approved')
  ON CONFLICT (id) DO NOTHING;

  -- 5. Create Hackathon & Round
  INSERT INTO public.hackathons (
    id, title, description, slug, mode, organizer, status, min_team_size, max_team_size,
    is_solo_allowed, registration_start_at, registration_end_at, event_start_at, event_end_at,
    in_charge_admin_id, created_by
  ) VALUES (
    v_hackathon_id, 'Phase 12 Reliability Hackathon', 'Event description', 'p12-hackathon', 'online', 'NMIT', 'published', 1, 4,
    true, now() - interval '1 day', now() + interval '2 days', now() + interval '3 days', now() + interval '5 days',
    v_assigned_admin_id, v_super_id
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.hackathon_rounds (
    id, hackathon_id, round_number, name, start_at, end_at, status
  ) VALUES (
    v_round_id, v_hackathon_id, 1, 'Preliminary Round', now() - interval '1 hour', now() + interval '1 day', 'open'
  ) ON CONFLICT (id) DO NOTHING;

  -- 6. Create Team with Student 1 enrolled
  INSERT INTO public.teams (id, hackathon_id, name, leader_id, invitation_code, internal_status, external_status) VALUES
    (v_team_id, v_hackathon_id, 'P12 Code Warriors', v_student_1_id, 'INVP12WAR', 'complete', 'verified')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.team_members (id, team_id, student_id, hackathon_id, role) VALUES
    ('dddddddd-1111-2222-3333-444444444444', v_team_id, v_student_1_id, v_hackathon_id, 'leader')
  ON CONFLICT DO NOTHING;

  -- 7. Create active push subscription for Student 1
  INSERT INTO public.user_push_subscriptions (id, user_id, endpoint, p256dh, auth, device_fingerprint, active) VALUES
    ('99999999-1111-2222-3333-444444444444', v_student_1_id, 'https://push.example.com/sub/student1', 'dummy-p256dh', 'dummy-auth', 'fp-student1', true)
  ON CONFLICT (endpoint) DO UPDATE SET active = true;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Authorization: publish_announcement
-- ----------------------------------------------------------------------------

-- P12-DB-01: Anonymous caller denied
SET ROLE anon;
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Test Alert', 'Announcement body text') $$,
  '42501',
  NULL,
  'P12-DB-01: Anonymous caller denied publish_announcement'
);

-- P12-DB-02: Student denied
SET ROLE authenticated;
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Test Alert', 'Announcement body text') $$,
  '42501',
  NULL,
  'P12-DB-02: Student denied publish_announcement'
);

-- P12-DB-03: Admin without manage_notifications denied global announcement
SET request.jwt.claim.sub = '33333333-4444-5555-6666-777777777777';
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Test Alert', 'Announcement body text') $$,
  '42501',
  NULL,
  'P12-DB-03: Admin without manage_notifications denied global announcement'
);

-- P12-DB-04: Admin with manage_notifications succeeds
SET request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555';
SELECT lives_ok(
  $$ SELECT public.publish_announcement('Important Notice', 'Platform maintenance scheduled for midnight.', 'all') $$,
  'P12-DB-04: Admin with manage_notifications succeeds on global announcement'
);

-- P12-DB-05: Audit log recorded for announcement
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE action = 'notification.announcement_published'
      AND actor_id = '11111111-2222-3333-4444-555555555555'
  ),
  'P12-DB-05: Audit log recorded for announcement publication'
);

-- P12-DB-06: Super Admin succeeds on global announcement
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT lives_ok(
  $$ SELECT public.publish_announcement('Campus Super Notice', 'Campus hackathon registration begins today.', 'all') $$,
  'P12-DB-06: Super Admin succeeds on global announcement'
);

-- ----------------------------------------------------------------------------
-- 2. Input Validation: publish_announcement
-- ----------------------------------------------------------------------------

-- P12-DB-07: Short title (< 3 chars) rejected
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Hi', 'Valid announcement body goes here.') $$,
  '22023',
  NULL,
  'P12-DB-07: Short title rejected with 22023'
);

-- P12-DB-08: Short body (< 5 chars) rejected
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Valid Title', 'Bad') $$,
  '22023',
  NULL,
  'P12-DB-08: Short body rejected with 22023'
);

-- P12-DB-09: Invalid target role rejected
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Valid Title', 'Valid announcement body', 'superusers') $$,
  '22023',
  NULL,
  'P12-DB-09: Invalid target role rejected with 22023'
);

-- P12-DB-10: Invalid announcement type rejected
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Valid Title', 'Valid announcement body', 'all', NULL, 'invalid_type') $$,
  '22023',
  NULL,
  'P12-DB-10: Invalid announcement type rejected with 22023'
);

-- ----------------------------------------------------------------------------
-- 3. Event Scoping & Assigned Admin Permissions
-- ----------------------------------------------------------------------------

-- P12-DB-11: Assigned admin succeeds on scoped hackathon announcement
SET request.jwt.claim.sub = '22222222-3333-4444-5555-666666666666';
SELECT lives_ok(
  $$ SELECT public.publish_announcement('Round 1 Guidelines', 'Check the rules for round 1 submissions.', 'students', 'aaaaaaaa-1111-2222-3333-444444444444', 'general') $$,
  'P12-DB-11: Assigned admin succeeds on scoped hackathon announcement'
);

-- P12-DB-12: Unassigned admin without manage_notifications denied on scoped hackathon
SET request.jwt.claim.sub = '33333333-4444-5555-6666-777777777777';
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Hacked Alert', 'Unauthorized attempt to alert hackathon.', 'students', 'aaaaaaaa-1111-2222-3333-444444444444', 'general') $$,
  '42501',
  NULL,
  'P12-DB-12: Unassigned admin denied on scoped hackathon'
);

-- P12-DB-13: Scoped announcement for non-existent hackathon raises P0002
SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
SELECT throws_ok(
  $$ SELECT public.publish_announcement('Invalid Event', 'Valid announcement body', 'students', '99999999-9999-9999-9999-999999999999', 'general') $$,
  'P0002',
  NULL,
  'P12-DB-13: Non-existent hackathon raises P0002'
);

-- ----------------------------------------------------------------------------
-- 4. RLS on Announcements (Role and Event Scoping)
-- ----------------------------------------------------------------------------

-- Seed test announcements
DO $$
BEGIN
  -- Global announcement for students
  INSERT INTO public.announcements (id, title, body, target_role, created_by)
  VALUES ('10000000-0000-0000-0000-000000000001', 'Student Only Alert', 'Students please update your profiles.', 'students', '00000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;

  -- Global announcement for admins
  INSERT INTO public.announcements (id, title, body, target_role, created_by)
  VALUES ('10000000-0000-0000-0000-000000000002', 'Admin Only Alert', 'Admins please review pending submissions.', 'admins', '00000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;

  -- Event-scoped announcement for p12-hackathon
  INSERT INTO public.announcements (id, title, body, target_role, hackathon_id, created_by)
  VALUES ('10000000-0000-0000-0000-000000000003', 'P12 Event Alert', 'Specific alert for P12 Hackathon participants.', 'students', 'aaaaaaaa-1111-2222-3333-444444444444', '00000000-0000-0000-0000-000000000001')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- P12-DB-14: Student 1 (enrolled) can view global student announcement
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT ok(
  EXISTS (SELECT 1 FROM public.announcements WHERE id = '10000000-0000-0000-0000-000000000001'),
  'P12-DB-14: Student 1 can view global student announcement'
);

-- P12-DB-15: Student 1 CANNOT view admin-only announcement
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.announcements WHERE id = '10000000-0000-0000-0000-000000000002'),
  'P12-DB-15: Student 1 cannot view admin-only announcement'
);

-- P12-DB-16: Student 1 (enrolled in hackathon team) CAN view scoped event announcement
SELECT ok(
  EXISTS (SELECT 1 FROM public.announcements WHERE id = '10000000-0000-0000-0000-000000000003'),
  'P12-DB-16: Enrolled student can view scoped event announcement'
);

-- P12-DB-17: Student 2 (NOT enrolled in hackathon team) CANNOT view scoped event announcement
SET request.jwt.claim.sub = '55555555-6666-7777-8888-999999999999';
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.announcements WHERE id = '10000000-0000-0000-0000-000000000003'),
  'P12-DB-17: Non-enrolled student cannot view scoped event announcement'
);

-- P12-DB-18: Admin can view admin-only announcement
SET request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555';
SELECT ok(
  EXISTS (SELECT 1 FROM public.announcements WHERE id = '10000000-0000-0000-0000-000000000002'),
  'P12-DB-18: Admin can view admin-only announcement'
);

-- ----------------------------------------------------------------------------
-- 5. Read Receipt Tracking: mark_announcement_read
-- ----------------------------------------------------------------------------

-- P12-DB-19: Student 1 marks announcement as read
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT lives_ok(
  $$ SELECT public.mark_announcement_read('10000000-0000-0000-0000-000000000001') $$,
  'P12-DB-19: mark_announcement_read succeeds for student'
);

-- P12-DB-20: Read receipt recorded in public.announcement_reads
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.announcement_reads
    WHERE announcement_id = '10000000-0000-0000-0000-000000000001'
      AND user_id = '44444444-5555-6666-7777-888888888888'
  ),
  'P12-DB-20: Read receipt exists in announcement_reads'
);

-- P12-DB-21: Idempotent: repeated mark_announcement_read does not raise error
SELECT lives_ok(
  $$ SELECT public.mark_announcement_read('10000000-0000-0000-0000-000000000001') $$,
  'P12-DB-21: Repeated mark_announcement_read is idempotent'
);

-- P12-DB-22: Student 2 CANNOT read Student 1 receipt under RLS
SET request.jwt.claim.sub = '55555555-6666-7777-8888-999999999999';
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.announcement_reads
    WHERE user_id = '44444444-5555-6666-7777-888888888888'
  ),
  'P12-DB-22: Student 2 cannot read Student 1 read receipts under RLS'
);

-- ----------------------------------------------------------------------------
-- 6. Push Delivery Outcome Logging & Invalid Subscription Deactivation
-- ----------------------------------------------------------------------------

-- P12-DB-23: Notification admin can log delivery outcome
SET request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555';
SELECT lives_ok(
  $$ SELECT public.log_push_delivery_outcome(
    '10000000-0000-0000-0000-000000000001',
    '99999999-1111-2222-3333-444444444444',
    '44444444-5555-6666-7777-888888888888',
    'https://push.example.com/sub/student1',
    'delivered',
    201,
    NULL,
    1
  ) $$,
  'P12-DB-23: Notification admin can log push delivery outcome'
);

-- P12-DB-24: Unauthorized student caller denied from logging push outcome for another user
SET request.jwt.claim.sub = '55555555-6666-7777-8888-999999999999';
SELECT throws_ok(
  $$ SELECT public.log_push_delivery_outcome(
    '10000000-0000-0000-0000-000000000001',
    '99999999-1111-2222-3333-444444444444',
    '44444444-5555-6666-7777-888888888888',
    'https://push.example.com/sub/student1',
    'delivered',
    201
  ) $$,
  '42501',
  NULL,
  'P12-DB-24: Student 2 denied from logging push outcome for Student 1'
);

-- P12-DB-25: 410 Gone / expired status automatically deactivates subscription
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT lives_ok(
  $$ SELECT public.log_push_delivery_outcome(
    '10000000-0000-0000-0000-000000000001',
    '99999999-1111-2222-3333-444444444444',
    '44444444-5555-6666-7777-888888888888',
    'https://push.example.com/sub/student1',
    'expired',
    410,
    'Subscription expired at push gateway'
  ) $$,
  'P12-DB-25: Student 1 logging expired outcome for own subscription succeeds'
);

-- P12-DB-26: Subscription active flag was updated to false
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT is(
  (SELECT active FROM public.user_push_subscriptions WHERE id = '99999999-1111-2222-3333-444444444444'),
  false,
  'P12-DB-26: Push subscription is now inactive'
);

-- P12-DB-27: Student 1 can select their own push delivery logs
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT ok(
  EXISTS (SELECT 1 FROM public.push_delivery_logs WHERE user_id = '44444444-5555-6666-7777-888888888888'),
  'P12-DB-27: Student 1 can view own push delivery logs'
);

-- P12-DB-28: Student 2 CANNOT view Student 1 push delivery logs
SET request.jwt.claim.sub = '55555555-6666-7777-8888-999999999999';
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.push_delivery_logs WHERE user_id = '44444444-5555-6666-7777-888888888888'),
  'P12-DB-28: Student 2 cannot view Student 1 push delivery logs'
);

-- ----------------------------------------------------------------------------
-- 7. Transactional Email Queue & Idempotency
-- ----------------------------------------------------------------------------

-- Seed test email
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
DO $$
BEGIN
  INSERT INTO public.email_delivery_logs (
    recipient_email,
    user_id,
    template_name,
    subject,
    idempotency_key,
    status
  ) VALUES (
    'student1_phase12@test.com',
    '44444444-5555-6666-7777-888888888888',
    'account_verification',
    'Verify your NMIT HackLeague account',
    'idem-test-token-001',
    'sent'
  );
END $$;

-- P12-DB-29: Duplicate idempotency key fails with 23505
SELECT throws_ok(
  $$ INSERT INTO public.email_delivery_logs (
       recipient_email, user_id, template_name, subject, idempotency_key, status
     ) VALUES (
       'student1_phase12@test.com', '44444444-5555-6666-7777-888888888888', 'account_verification', 'Duplicate Subject', 'idem-test-token-001', 'pending'
     ) $$,
  '23505',
  NULL,
  'P12-DB-29: Duplicate idempotency_key rejected with 23505'
);

-- P12-DB-30: Student 1 can view their own email logs
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT ok(
  EXISTS (SELECT 1 FROM public.email_delivery_logs WHERE user_id = '44444444-5555-6666-7777-888888888888'),
  'P12-DB-30: Student 1 can view own email logs'
);

-- P12-DB-31: Student 2 CANNOT view Student 1 email logs
SET request.jwt.claim.sub = '55555555-6666-7777-8888-999999999999';
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.email_delivery_logs WHERE user_id = '44444444-5555-6666-7777-888888888888'),
  'P12-DB-31: Student 2 cannot view Student 1 email logs'
);

-- P12-DB-32: Admin can view all email logs
SET request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555';
SELECT ok(
  EXISTS (SELECT 1 FROM public.email_delivery_logs WHERE user_id = '44444444-5555-6666-7777-888888888888'),
  'P12-DB-32: Admin can view email delivery logs'
);

-- ----------------------------------------------------------------------------
-- 8. Deadline Reminders: publish_deadline_reminder
-- ----------------------------------------------------------------------------

-- P12-DB-33: Assigned admin publishes valid deadline reminder
SET request.jwt.claim.sub = '22222222-3333-4444-5555-666666666666';
SELECT lives_ok(
  $$ SELECT public.publish_deadline_reminder(
    'aaaaaaaa-1111-2222-3333-444444444444',
    'bbbbbbbb-1111-2222-3333-444444444444',
    now() + interval '6 hours',
    'Submit your prototype repo before cutoff!'
  ) $$,
  'P12-DB-33: Assigned admin publishes valid deadline reminder'
);

-- P12-DB-34: Deadline reminder stored with type = deadline
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.announcements
    WHERE hackathon_id = 'aaaaaaaa-1111-2222-3333-444444444444'
      AND announcement_type = 'deadline'
  ),
  'P12-DB-34: Announcement stored with announcement_type = deadline'
);

-- P12-DB-35: Mismatched round/hackathon raises P0002
SELECT throws_ok(
  $$ SELECT public.publish_deadline_reminder(
    'aaaaaaaa-1111-2222-3333-444444444444',
    '99999999-0000-0000-0000-000000000000',
    now() + interval '6 hours'
  ) $$,
  'P0002',
  NULL,
  'P12-DB-35: Invalid round raises P0002'
);

-- ----------------------------------------------------------------------------
-- 9. System Health & Reliability Check: get_system_health
-- ----------------------------------------------------------------------------

-- P12-DB-36: Authenticated user can execute get_system_health
SET request.jwt.claim.sub = '44444444-5555-6666-7777-888888888888';
SELECT ok(
  (public.get_system_health()->>'database_connected')::boolean = true,
  'P12-DB-36: Student receives database_connected = true'
);

-- P12-DB-37: Admin receives detailed operational metrics
SET request.jwt.claim.sub = '11111111-2222-3333-4444-555555555555';
SELECT ok(
  public.get_system_health()->'metrics' IS NOT NULL,
  'P12-DB-37: Admin receives operational metrics payload'
);

-- P12-DB-38: Free plan reliability warning note is documented in response
SELECT ok(
  public.get_system_health()->>'reliability_notice' LIKE '%Supabase Free plan%',
  'P12-DB-38: Supabase Free plan operational limitation documented in health notice'
);

ROLLBACK;
