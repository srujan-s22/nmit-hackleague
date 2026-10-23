-- Test Suite: 23_ts_auth_deletion_audit_immutability.sql
-- Description: Verification of audit log immutability and foreign-key ON DELETE SET NULL on auth user deletion

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(10);

-- Fixture setup
DO $$
DECLARE
  v_test_uid uuid := 'e0000000-0000-0000-0000-000000000001';
  v_log_id uuid := 'e0000000-0000-0000-0000-000000000002';
BEGIN
  -- Insert mock auth user (with admin role metadata to bypass student profile creation triggers)
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    v_test_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'audit_immutability_test@nmit-dev.local', 'fake_hash', now(),
    '{"provider":"email","providers":["email"],"claims_admin":true}'::jsonb,
    '{"role":"admin"}'::jsonb,
    now(), now()
  );

  -- Insert audit log referencing this auth user with fixed deterministic values
  INSERT INTO public.audit_logs (
    id, actor_id, actor_role, action, target_type, target_id, ip_address, user_agent, details, created_at
  ) VALUES (
    v_log_id, v_test_uid, 'admin', 'test.audit_action', 'test_target', 'target-123',
    '127.0.0.1'::inet, 'pgTAP-Test-Agent/1.0', '{"original": true}'::jsonb, '2026-10-26 12:00:00+00'::timestamptz
  );
END;
$$;

-- TS-AUD-01: Untrusted role 'anon' cannot execute prevent_audit_log_mutation()
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.prevent_audit_log_mutation() $$,
  '42501',
  NULL,
  'TS-AUD-01: anon role has EXECUTE revoked on prevent_audit_log_mutation()'
);

-- TS-AUD-02: Untrusted role 'authenticated' cannot execute prevent_audit_log_mutation()
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.prevent_audit_log_mutation() $$,
  '42501',
  NULL,
  'TS-AUD-02: authenticated role has EXECUTE revoked on prevent_audit_log_mutation()'
);

-- Reset to postgres administrative role
RESET ROLE;

-- TS-AUD-03: Attempt manual UPDATE actor_id to NULL while auth user still exists
SELECT throws_ok(
  $$ UPDATE public.audit_logs SET actor_id = NULL WHERE id = 'e0000000-0000-0000-0000-000000000002' $$,
  'P0001',
  'Audit logs are strictly append-only and cannot be modified.',
  'TS-AUD-03: Manual UPDATE actor_id to NULL fails when auth user exists'
);

-- TS-AUD-04: Attempt manual UPDATE of audit log details
SELECT throws_ok(
  $$ UPDATE public.audit_logs SET details = '{"tampered":true}'::jsonb WHERE id = 'e0000000-0000-0000-0000-000000000002' $$,
  'P0001',
  'Audit logs are strictly append-only and cannot be modified.',
  'TS-AUD-04: Manual UPDATE of details fails closed'
);

-- TS-AUD-05: Attempt direct DELETE of audit log row
SELECT throws_ok(
  $$ DELETE FROM public.audit_logs WHERE id = 'e0000000-0000-0000-0000-000000000002' $$,
  'P0001',
  'Audit logs are strictly append-only and cannot be deleted.',
  'TS-AUD-05: Direct DELETE on audit_logs fails closed'
);

-- TS-AUD-06: Foreign key cascade executes ON DELETE SET NULL when auth user is deleted
DO $$
BEGIN
  -- Deleting auth.users simulates GoTrue / Supabase Auth Admin deletion
  DELETE FROM auth.users WHERE id = 'e0000000-0000-0000-0000-000000000001';
END;
$$;

SELECT ok(
  NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'e0000000-0000-0000-0000-000000000001'),
  'TS-AUD-06: auth.users record was successfully deleted'
);

-- TS-AUD-07: The referencing audit log row still exists in public.audit_logs
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs WHERE id = 'e0000000-0000-0000-0000-000000000002'),
  1,
  'TS-AUD-07: Referencing audit_log row still exists after user deletion'
);

-- TS-AUD-08: actor_id set to NULL while all other 9 audit fields remain strictly unchanged
SELECT ok(
  (
    SELECT actor_id IS NULL
       AND id = 'e0000000-0000-0000-0000-000000000002'::uuid
       AND actor_role = 'admin'
       AND action = 'test.audit_action'
       AND target_type = 'test_target'
       AND target_id = 'target-123'
       AND ip_address = '127.0.0.1'::inet
       AND user_agent = 'pgTAP-Test-Agent/1.0'
       AND details = '{"original": true}'::jsonb
       AND created_at = '2026-10-26 12:00:00+00'::timestamptz
    FROM public.audit_logs
    WHERE id = 'e0000000-0000-0000-0000-000000000002'
  ),
  'TS-AUD-08: actor_id set to NULL while all other 9 audit fields (id, actor_role, action, target_type, target_id, ip_address, user_agent, details, created_at) remain unchanged'
);

-- TS-AUD-09: Manual UPDATE on the audit log row after actor_id is NULL remains blocked
SELECT throws_ok(
  $$ UPDATE public.audit_logs SET action = 'tampered_post_deletion' WHERE id = 'e0000000-0000-0000-0000-000000000002' $$,
  'P0001',
  'Audit logs are strictly append-only and cannot be modified.',
  'TS-AUD-09: Manual UPDATE after actor_id is NULL remains blocked'
);

-- TS-AUD-10: Manual DELETE on the audit log row after actor_id is NULL remains blocked
SELECT throws_ok(
  $$ DELETE FROM public.audit_logs WHERE id = 'e0000000-0000-0000-0000-000000000002' $$,
  'P0001',
  'Audit logs are strictly append-only and cannot be deleted.',
  'TS-AUD-10: Manual DELETE after actor_id is NULL remains blocked'
);

SELECT * FROM finish();
ROLLBACK;
