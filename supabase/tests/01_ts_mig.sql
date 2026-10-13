-- Suite 1: Clean Migration Application & Catalog Schema Verification (TS-MIG)
BEGIN;
SELECT plan(20);

-- Verify all 15 public application tables exist
SELECT has_table('public', 'profiles', 'public.profiles table exists');
SELECT has_table('public', 'admin_profiles', 'public.admin_profiles table exists');
SELECT has_table('public', 'admin_permissions', 'public.admin_permissions table exists');
SELECT has_table('public', 'hackathons', 'public.hackathons table exists');
SELECT has_table('public', 'hackathon_rounds', 'public.hackathon_rounds table exists');
SELECT has_table('public', 'teams', 'public.teams table exists');
SELECT has_table('public', 'team_members', 'public.team_members table exists');
SELECT has_table('public', 'submissions', 'public.submissions table exists');
SELECT has_table('public', 'submission_reviews', 'public.submission_reviews table exists');
SELECT has_table('public', 'results', 'public.results table exists');
SELECT has_table('public', 'points_ledger', 'public.points_ledger table exists');
SELECT has_table('public', 'point_configurations', 'public.point_configurations table exists');
SELECT has_table('public', 'audit_logs', 'public.audit_logs table exists');
SELECT has_table('public', 'profile_change_requests', 'public.profile_change_requests table exists');
SELECT has_table('public', 'storage_deletion_queue', 'public.storage_deletion_queue table exists');

-- Verify key helper functions exist
SELECT has_function('public', 'current_is_super_admin', ARRAY[]::text[], 'current_is_super_admin() helper exists');
SELECT has_function('public', 'current_has_permission', ARRAY['text'], 'current_has_permission(text) helper exists');
SELECT has_function('public', 'current_is_approved_student', ARRAY[]::text[], 'current_is_approved_student() helper exists');
SELECT has_function('public', 'current_is_team_member', ARRAY['uuid'], 'current_is_team_member(uuid) helper exists');

-- Verify Super Admin recovery procedure exists with prokind = 'p' (stored procedure)
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'recover_super_admin_identity' AND p.prokind = 'p'
  ),
  'recover_super_admin_identity procedure exists as PostgreSQL Stored Procedure (prokind = p)'
);

SELECT * FROM finish();
ROLLBACK;
