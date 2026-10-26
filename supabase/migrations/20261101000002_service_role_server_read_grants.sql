-- Migration: 20261101000002_service_role_server_read_grants.sql
-- On the hosted project the service_role has no SELECT/INSERT on most public
-- tables (only TRUNCATE/REFERENCES/TRIGGER), so trusted server code that uses the
-- service-role client silently received empty results or failed:
--   * Student Directory: points always 0, competition history empty
--     (points_ledger, team_members, teams, hackathons)
--   * Broadcast targeting (team_members, hackathons)
--   * Round evidence validation (submissions)
--   * Registration-proof audit entries (audit_logs INSERT)
--   * Student profile recovery (profiles INSERT)
-- These are the exact privileges that server code needs. The service-role key is
-- server-only and bypasses RLS by design; anon/authenticated are unaffected.

GRANT SELECT ON TABLE
  public.hackathons,
  public.hackathon_rounds,
  public.teams,
  public.team_members,
  public.points_ledger,
  public.submissions,
  public.results
TO service_role;

GRANT INSERT ON TABLE public.audit_logs TO service_role;
GRANT INSERT ON TABLE public.profiles TO service_role;
