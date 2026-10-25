-- Suite 29: admin access-change broadcast (TS-ACB)
-- Verifies 20261031000002_admin_access_change_broadcast.sql: triggers publish a
-- payload-free event to the affected admin's private topic only, and the
-- realtime.messages policy lets only that admin receive it (and nobody publish).
BEGIN;
SELECT plan(11);

DO $$
DECLARE
  v_super UUID := '00000000-0000-0000-0000-000000000001';
  v_a UUID := 'e0290000-0000-0000-0000-000000000001';
  v_b UUID := 'e0290000-0000-0000-0000-000000000002';
  v_h UUID := 'e0290000-0000-0000-0000-000000000010';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_a, 'acb-a@test.com'), (v_b, 'acb-b@test.com') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active) VALUES
    (v_a, 'acb-a@test.com', 'Acb A', false, true), (v_b, 'acb-b@test.com', 'Acb B', false, true)
  ON CONFLICT (id) DO UPDATE SET is_active = true, is_super_admin = false;
  INSERT INTO public.hackathons (id, title, slug, description, organizer, mode, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at, in_charge_admin_id, created_by)
  VALUES (v_h, 'Acb Hackathon', 'acb-hackathon', 'd', 'NMIT', 'online', 'published',
    now() - interval '2 days', now() + interval '5 days', now() + interval '6 days', now() + interval '8 days', v_super, v_super)
  ON CONFLICT (id) DO NOTHING;
  -- Setup noise must not count: start each assertion from a clean slate.
  DELETE FROM realtime.messages WHERE topic LIKE 'admin-access:e0290000%';
END $$;

CREATE FUNCTION pg_temp.msgs(p_admin uuid) RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM realtime.messages
  WHERE topic = 'admin-access:' || p_admin::text AND event = 'access_changed' AND extension = 'broadcast'
$$;

-- permission grant -> that admin only
INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
VALUES ('e0290000-0000-0000-0000-000000000001', 'export_data', '00000000-0000-0000-0000-000000000001');
SELECT is(pg_temp.msgs('e0290000-0000-0000-0000-000000000001'), 1, 'TS-ACB-01: granting a permission notifies the affected admin');
SELECT is(pg_temp.msgs('e0290000-0000-0000-0000-000000000002'), 0, 'TS-ACB-02: other admins are not notified');

-- revoke
DELETE FROM public.admin_permissions WHERE admin_id = 'e0290000-0000-0000-0000-000000000001' AND permission = 'export_data';
SELECT is(pg_temp.msgs('e0290000-0000-0000-0000-000000000001'), 2, 'TS-ACB-03: revoking a permission notifies again');

-- assignment
INSERT INTO public.hackathon_admin_assignments (hackathon_id, admin_id, role, assigned_by)
VALUES ('e0290000-0000-0000-0000-000000000010', 'e0290000-0000-0000-0000-000000000002', 'reviewer', '00000000-0000-0000-0000-000000000001');
SELECT is(pg_temp.msgs('e0290000-0000-0000-0000-000000000002'), 1, 'TS-ACB-04: a new hackathon assignment notifies that admin');

-- status changes vs unrelated profile edits
UPDATE public.admin_profiles SET full_name = 'Renamed' WHERE id = 'e0290000-0000-0000-0000-000000000001';
SELECT is(pg_temp.msgs('e0290000-0000-0000-0000-000000000001'), 2, 'TS-ACB-05: an unrelated profile edit does not notify');
UPDATE public.admin_profiles SET is_active = false WHERE id = 'e0290000-0000-0000-0000-000000000001';
SELECT is(pg_temp.msgs('e0290000-0000-0000-0000-000000000001'), 3, 'TS-ACB-06: deactivating an admin notifies them');

-- payload is data-free
SELECT is(
  (SELECT array_agg(DISTINCT k ORDER BY k) FROM realtime.messages m, jsonb_object_keys(m.payload) k
   WHERE m.topic = 'admin-access:e0290000-0000-0000-0000-000000000001' AND m.payload ? 'at'),
  ARRAY['at', 'id'], 'TS-ACB-07: the payload is only a timestamp (plus Realtime''s own message id), no permission or identity data');

-- receive policy
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "e0290000-0000-0000-0000-000000000002"}';
SELECT set_config('realtime.topic', 'admin-access:e0290000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*)::int FROM realtime.messages WHERE topic = 'admin-access:e0290000-0000-0000-0000-000000000002'),
  1, 'TS-ACB-08: an admin can receive messages on their own topic');

SELECT set_config('realtime.topic', 'admin-access:e0290000-0000-0000-0000-000000000001', true);
SELECT is(
  (SELECT count(*)::int FROM realtime.messages WHERE topic = 'admin-access:e0290000-0000-0000-0000-000000000001'),
  0, 'TS-ACB-09: an admin cannot receive another admin''s topic');

SELECT set_config('realtime.topic', 'something-else', true);
SELECT is((SELECT count(*)::int FROM realtime.messages), 0, 'TS-ACB-10: no messages are visible on unrelated topics');

SELECT throws_ok(
  $$ INSERT INTO realtime.messages (topic, extension, event, payload, private)
     VALUES ('admin-access:e0290000-0000-0000-0000-000000000002', 'broadcast', 'access_changed', '{}'::jsonb, true) $$,
  '42501', NULL, 'TS-ACB-11: clients cannot publish to the topic');

SELECT * FROM finish();
ROLLBACK;
