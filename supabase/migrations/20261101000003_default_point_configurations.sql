-- Migration: 20261101000003_default_point_configurations.sql
-- point_configurations was only populated by supabase/seed.sql, which never runs on
-- the hosted project. With the table empty, milestone awards that require an active
-- configuration (round qualification) cannot be granted, and the Points page shows an
-- empty "Platform Milestone Point Values" table.
-- Insert the documented defaults once; existing rows (including admin edits) are kept.
-- updated_by must reference an admin, so the active Super Admin is recorded.

INSERT INTO public.point_configurations (milestone_type, regular_member_points, team_leader_points, is_active, updated_by)
SELECT v.milestone_type, v.regular_member_points, v.team_leader_points, v.is_active, sa.id
FROM (VALUES
  ('participation', 10, 15, true),
  ('round_qualification', 20, 25, true),
  ('win_placement', 0, 0, false)
) AS v(milestone_type, regular_member_points, team_leader_points, is_active)
CROSS JOIN LATERAL (
  SELECT id FROM public.admin_profiles WHERE is_super_admin = true AND is_active = true LIMIT 1
) sa
ON CONFLICT (milestone_type) DO NOTHING;
