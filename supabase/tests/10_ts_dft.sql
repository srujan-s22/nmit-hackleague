-- Suite 10: Migration Drift & Catalog Stability (TS-DFT)
BEGIN;
SELECT plan(5);

-- 15 public tables
SELECT is(
  (
    SELECT count(*)::int
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'admin_profiles', 'admin_permissions', 'hackathons', 'hackathon_rounds',
        'teams', 'team_members', 'submissions', 'submission_reviews', 'results',
        'points_ledger', 'point_configurations', 'audit_logs', 'profile_change_requests',
        'storage_deletion_queue'
      )
  ),
  15,
  'TS-DFT-01a: Exactly 15 application tables exist in public schema'
);

-- RLS enabled on all 15 public tables
SELECT is(
  (
    SELECT count(*)::int
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = true
      AND c.relname IN (
        'profiles', 'admin_profiles', 'admin_permissions', 'hackathons', 'hackathon_rounds',
        'teams', 'team_members', 'submissions', 'submission_reviews', 'results',
        'points_ledger', 'point_configurations', 'audit_logs', 'profile_change_requests',
        'storage_deletion_queue'
      )
  ),
  15,
  'TS-DFT-01b: Row-Level Security is ENABLED and FORCED on all 15 public application tables'
);

-- Exactly 3 private storage buckets
SELECT is(
  (
    SELECT count(*)::int
    FROM storage.buckets
    WHERE id IN ('college-ids', 'profile-photos', 'submission-evidence')
      AND public = false
  ),
  3,
  'TS-DFT-01c: Exactly 3 private storage buckets configured'
);

-- 4 Security Definer RLS helper functions exist and are marked STABLE
SELECT is(
  (
    SELECT count(*)::int
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'current_is_super_admin',
        'current_has_permission',
        'current_is_approved_student',
        'current_is_team_member'
      )
      AND p.prosecdef = true
      AND p.provolatile = 's' -- 's' indicates STABLE
  ),
  4,
  'TS-DFT-01d: All 4 Security Definer RLS helpers are STABLE to prevent recursive policy loops'
);

-- Exactly 1 Super Admin stored procedure with prokind = 'p'
SELECT is(
  (
    SELECT count(*)::int
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'recover_super_admin_identity'
      AND p.prokind = 'p'
  ),
  1,
  'TS-DFT-01e: Super Admin recovery routine is strictly a PostgreSQL Stored Procedure (prokind = p)'
);

SELECT * FROM finish();
ROLLBACK;
