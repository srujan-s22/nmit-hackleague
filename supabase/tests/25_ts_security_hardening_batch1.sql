-- Suite 25: Security hardening batch 1 (TS-HRD)
-- Covers: auto_pause_expired_rounds grants, is_push_registered ownership
-- enforcement, push_delivery_logs/email_delivery_logs UPDATE/DELETE grants.
BEGIN;
SELECT plan(8);

-- ----------------------------------------------------------------------------
-- Isolated fixture: one target student (real active subscription) + one
-- caller identity, both synthetic, scoped to this transaction only.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    ('a0000000-0000-0000-0000-00000000aaa1'::uuid, 'hrd-target@example.com'),
    ('a0000000-0000-0000-0000-00000000aaa2'::uuid, 'hrd-caller@example.com')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_push_subscriptions (
    id, user_id, endpoint, p256dh, auth, device_fingerprint, active
  ) VALUES (
    'b0000000-0000-0000-0000-00000000aaa1'::uuid,
    'a0000000-0000-0000-0000-00000000aaa1'::uuid,
    'https://fcm.googleapis.com/fcm/send/hrd-test-token',
    'dummy-p256', 'dummy-auth', 'fp-hrd-1', true
  ) ON CONFLICT (endpoint) DO UPDATE SET active = true;
END $$;

-- TS-HRD-01/02: auto_pause_expired_rounds execute privilege (static catalog
-- checks — no role switch needed, mirrors TS-REP-04's style in suite 24)
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.auto_pause_expired_rounds(uuid)', 'EXECUTE'),
  'TS-HRD-01: authenticated can no longer execute auto_pause_expired_rounds'
);
SELECT ok(
  has_function_privilege('service_role', 'public.auto_pause_expired_rounds(uuid)', 'EXECUTE'),
  'TS-HRD-02: service_role retains execute on auto_pause_expired_rounds'
);

-- TS-HRD-03/04: self-check correctness in both directions, against a known
-- fixture state (not a different user's data).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-00000000aaa2';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT is(
  public.is_push_registered('a0000000-0000-0000-0000-00000000aaa2'::uuid), false,
  'TS-HRD-03: self-check on own id with no subscription fixture returns false'
);

RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-00000000aaa1';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT is(
  public.is_push_registered('a0000000-0000-0000-0000-00000000aaa1'::uuid), true,
  'TS-HRD-04: self-check on own id with a real active subscription returns true'
);

-- TS-HRD-05: authenticated caller probing a DIFFERENT user who genuinely has
-- an active subscription must get false, not the real status (the leak this
-- migration closes).
RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-00000000aaa2';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SELECT is(
  public.is_push_registered('a0000000-0000-0000-0000-00000000aaa1'::uuid), false,
  'TS-HRD-05: authenticated caller probing a different real-subscribed user gets false'
);

-- TS-HRD-06: anon probing the same genuinely-subscribed user must also get
-- false. Mirrors 03_ts_rls.sql's exact anon-simulation convention (real role
-- switch, claims reset rather than set, since anon carries no sub/role claim).
RESET ROLE; RESET "request.jwt.claim.sub"; RESET "request.jwt.claim.role";
SET LOCAL ROLE anon;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";
SELECT is(
  public.is_push_registered('a0000000-0000-0000-0000-00000000aaa1'::uuid), false,
  'TS-HRD-06: anon probing a real-subscribed user gets false, status not leaked'
);

-- TS-HRD-07: service_role retains the legitimate cross-user lookup (needed by
-- push-service.ts's dispatch-targeting check). Real ROLE switch + matching
-- JWT role claim, mirroring the combined pattern at 11_ts_onb.sql:471-472.
RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL "request.jwt.claim.role" = 'service_role';
SELECT is(
  public.is_push_registered('a0000000-0000-0000-0000-00000000aaa1'::uuid), true,
  'TS-HRD-07: service_role sees the real status for any user (legitimate dispatch check preserved)'
);
RESET ROLE; RESET "request.jwt.claim.role";

-- TS-HRD-08: delivery-log grants match the migration exactly — SELECT/INSERT
-- preserved for authenticated, UPDATE/DELETE revoked; service_role untouched.
SELECT ok(
  has_table_privilege('authenticated', 'public.push_delivery_logs', 'SELECT') AND
  has_table_privilege('authenticated', 'public.push_delivery_logs', 'INSERT') AND
  NOT has_table_privilege('authenticated', 'public.push_delivery_logs', 'UPDATE') AND
  NOT has_table_privilege('authenticated', 'public.push_delivery_logs', 'DELETE') AND
  has_table_privilege('authenticated', 'public.email_delivery_logs', 'SELECT') AND
  has_table_privilege('authenticated', 'public.email_delivery_logs', 'INSERT') AND
  NOT has_table_privilege('authenticated', 'public.email_delivery_logs', 'UPDATE') AND
  NOT has_table_privilege('authenticated', 'public.email_delivery_logs', 'DELETE') AND
  has_table_privilege('service_role', 'public.push_delivery_logs', 'SELECT, INSERT, UPDATE, DELETE') AND
  has_table_privilege('service_role', 'public.email_delivery_logs', 'SELECT, INSERT, UPDATE, DELETE'),
  'TS-HRD-08: authenticated keeps SELECT/INSERT, loses UPDATE/DELETE; service_role fully unaffected'
);

SELECT * FROM finish();
ROLLBACK;
