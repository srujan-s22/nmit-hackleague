-- Suite 4: SECURITY DEFINER Invocation Boundaries (TS-SEC)
BEGIN;
SELECT plan(3);

-- TS-SEC-01: Storage Worker Execution Revoked from Client Roles
-- Session authenticated as student attempting to call claim_storage_deletion_jobs throws permission denied
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000003';
SET LOCAL "request.jwt.claim.role" = 'authenticated';

SELECT throws_ok(
  $$SELECT * FROM public.claim_storage_deletion_jobs('w1', 10, 60)$$,
  '42501', -- permission_denied
  NULL,
  'TS-SEC-01: Storage worker function execution revoked from client authenticated role'
);

-- TS-SEC-02: Disaster Recovery Procedure Revoked from Client Roles
-- Session authenticated as admin attempting to call recover_super_admin_identity throws permission denied
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000002';

SELECT throws_ok(
  $$CALL public.recover_super_admin_identity('00000000-0000-0000-0000-000000000001'::uuid, 'test@nmit.ac.in', 'Test', 'Reason')$$,
  '42501', -- permission_denied
  NULL,
  'TS-SEC-02: Disaster recovery procedure execution revoked from client roles'
);

-- TS-SEC-03: Pinned search_path Inspection
-- Verify all custom security definer functions in public schema pin search_path = public, pg_temp
RESET ROLE;
RESET "request.jwt.claim.sub";
RESET "request.jwt.claim.role";

SELECT is_empty(
  $$
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND (
      p.proconfig IS NULL
      OR NOT ('search_path=public, pg_temp' = ANY(p.proconfig))
    )
  $$,
  'TS-SEC-03: All public SECURITY DEFINER routines strictly enforce pinned search_path=public, pg_temp'
);

SELECT * FROM finish();
ROLLBACK;
