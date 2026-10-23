-- ==============================================================================
-- Migration: 20261026000005_repair_notifications_schema_and_grants.sql
-- Description: Master Repair for Notification System Permissions, RLS Visibility,
--              Foreign Key References, and Web Push Reliability.
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- 1. Explicit SQL Table Grants for Authenticated and Service Role
-- ----------------------------------------------------------------------------
-- Guarantees that PostgREST and administrative API services can select, insert,
-- update, and delete on all notification, subscription, and delivery log tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.announcements TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.announcement_reads TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_delivery_logs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_push_subscriptions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_delivery_logs TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Repair Foreign Key Constraint on announcement_reads
-- ----------------------------------------------------------------------------
-- announcement_reads.user_id originally referenced public.profiles(id), which
-- excluded administrators (who exist in public.admin_profiles). Both are auth.users.
-- Updating to auth.users(id) allows all platform actors to record read status.
DO $$
BEGIN
  ALTER TABLE public.announcement_reads
    DROP CONSTRAINT IF EXISTS announcement_reads_user_id_fkey;

  ALTER TABLE public.announcement_reads
    ADD CONSTRAINT announcement_reads_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Repair Announcements RLS Policy for Broadcast History & Creator Visibility
-- ----------------------------------------------------------------------------
-- Allows Super Admins, administrators with 'manage_notifications', and announcement
-- creators to view all broadcast history entries, including student-targeted ones.
DROP POLICY IF EXISTS announcements_select_all ON public.announcements;
CREATE POLICY announcements_select_all ON public.announcements
FOR SELECT TO authenticated
USING (
  -- Super Admin, administrators with notification management permission, or creator
  public.current_is_super_admin()
  OR public.current_has_permission('manage_notifications')
  OR created_by = auth.uid()
  OR
  -- Global announcements (no hackathon scoping)
  (hackathon_id IS NULL AND (
    target_role = 'all'
    OR (target_role = 'students' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()))
    OR (target_role = 'admins' AND EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = auth.uid()))
  ))
  OR
  -- Hackathon-scoped announcements
  (hackathon_id IS NOT NULL AND (
    public.can_admin_manage_hackathon(hackathon_id, NULL)
    OR
    -- Student enrolled in a team for this hackathon
    EXISTS (
      SELECT 1 FROM public.team_members tm
      JOIN public.teams t ON tm.team_id = t.id
      WHERE tm.student_id = auth.uid()
        AND t.hackathon_id = announcements.hackathon_id
        AND (announcements.target_role IN ('all', 'students'))
    )
  ))
);

-- ----------------------------------------------------------------------------
-- 4. User Push Subscriptions RLS: Allow Administrators with manage_notifications
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view push subscriptions for dispatch" ON public.user_push_subscriptions;
CREATE POLICY "Admins can view push subscriptions for dispatch"
ON public.user_push_subscriptions FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.current_is_super_admin()
  OR public.current_has_permission('manage_notifications')
);
