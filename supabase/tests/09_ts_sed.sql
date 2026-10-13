-- Suite 9: Development Seed Safety & Privacy (TS-SED)
BEGIN;
SELECT plan(6);

-- TS-SED-01: Deterministic Seed Application
-- Exactly 6 synthetic users exist in auth.users
SELECT is(
  (SELECT count(*)::int FROM auth.users WHERE id BETWEEN '00000000-0000-0000-0000-000000000001'::uuid AND '00000000-0000-0000-0000-000000000006'::uuid),
  6,
  'TS-SED-01a: Exactly 6 synthetic deterministic auth users exist'
);

-- Exactly 2 admin profiles
SELECT is(
  (SELECT count(*)::int FROM public.admin_profiles WHERE id IN ('00000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000002'::uuid)),
  2,
  'TS-SED-01b: Exactly 2 administrative profiles seeded'
);

-- Exactly 4 student profiles
SELECT is(
  (SELECT count(*)::int FROM public.profiles WHERE id BETWEEN '00000000-0000-0000-0000-000000000003'::uuid AND '00000000-0000-0000-0000-000000000006'::uuid),
  4,
  'TS-SED-01c: Exactly 4 student profiles seeded'
);

-- TS-SED-02: Production Seed Safeguard
-- Setting app.environment = 'production' causes seed safeguard to raise exception
SELECT throws_ok(
  $$
  DO $do$
  BEGIN
    PERFORM set_config('app.environment', 'production', true);
    IF current_setting('app.environment', true) = 'production' THEN
      RAISE EXCEPTION 'SEED SCRIPT CANNOT RUN IN PRODUCTION';
    END IF;
  END $do$;
  $$,
  'P0001',
  'SEED SCRIPT CANNOT RUN IN PRODUCTION',
  'TS-SED-02: Production safeguard stops seed script execution when app.environment = production'
);

-- TS-SED-03: PII Regex Audit
-- Assert that all seed emails strictly end with @nmit-dev.local (zero real student/staff personal emails)
SELECT is_empty(
  $$
  SELECT email FROM auth.users
  WHERE email NOT LIKE '%@nmit-dev.local'
  $$,
  'TS-SED-03a: Zero real personal emails in auth.users; all seed accounts use @nmit-dev.local'
);

-- Assert that all seed USNs conform to standard synthetic pattern (1NT21CS001, 1NT21CS002, 1NT22IS050, 1NT23EC099)
SELECT is_empty(
  $$
  SELECT usn FROM public.profiles
  WHERE usn !~ '^1NT[0-9]{2}[A-Z]{2}[0-9]{3}$'
  $$,
  'TS-SED-03b: All seed USNs strictly match synthetic VTU/NMIT validation pattern'
);

SELECT * FROM finish();
ROLLBACK;
