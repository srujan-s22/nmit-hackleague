-- Migration: 20261031000002_admin_access_change_broadcast.sql
-- Description: Tell a signed-in admin's browser when THEIR access changes
-- (permissions, hackathon assignments, active / super-admin status) so the app can
-- re-render the sidebar and re-run page authorization immediately, instead of the
-- menu staying stale until the next reload.
--
-- Mechanism: a trigger broadcasts a payload-free "access_changed" event over Supabase
-- Realtime on the PRIVATE topic  admin-access:<admin uuid>.
--   * The message carries no data about what changed (just a timestamp); the client
--     re-fetches everything from the server, which re-authorizes as usual.
--   * Only that admin can receive it: an RLS policy on realtime.messages allows
--     SELECT only when the channel topic equals 'admin-access:' || auth.uid().
--   * Clients get no INSERT policy, so they cannot publish to the topic; only these
--     SECURITY DEFINER triggers can.
--   * A broadcast failure must never block the permission change itself.

-- ============================================================================
-- 1. TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.broadcast_admin_access_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'admin_profiles' THEN
    v_admin_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_admin_id := COALESCE(NEW.admin_id, OLD.admin_id);
  END IF;

  IF v_admin_id IS NOT NULL THEN
    BEGIN
      PERFORM realtime.send(
        jsonb_build_object('at', (extract(epoch FROM clock_timestamp()) * 1000)::bigint),
        'access_changed',
        'admin-access:' || v_admin_id::text,
        true
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never block the underlying permission / assignment change.
      RAISE WARNING 'broadcast_admin_access_changed failed: %', SQLERRM;
    END;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_admin_access_changed() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. TRIGGERS
-- ============================================================================
DROP TRIGGER IF EXISTS trg_broadcast_access_admin_permissions ON public.admin_permissions;
CREATE TRIGGER trg_broadcast_access_admin_permissions
AFTER INSERT OR UPDATE OR DELETE ON public.admin_permissions
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_access_changed();

DROP TRIGGER IF EXISTS trg_broadcast_access_hackathon_assignments ON public.hackathon_admin_assignments;
CREATE TRIGGER trg_broadcast_access_hackathon_assignments
AFTER INSERT OR UPDATE OR DELETE ON public.hackathon_admin_assignments
FOR EACH ROW EXECUTE FUNCTION public.broadcast_admin_access_changed();

DROP TRIGGER IF EXISTS trg_broadcast_access_admin_profiles ON public.admin_profiles;
CREATE TRIGGER trg_broadcast_access_admin_profiles
AFTER UPDATE ON public.admin_profiles
FOR EACH ROW
WHEN (
  OLD.is_active IS DISTINCT FROM NEW.is_active
  OR OLD.is_super_admin IS DISTINCT FROM NEW.is_super_admin
  OR OLD.must_change_password IS DISTINCT FROM NEW.must_change_password
)
EXECUTE FUNCTION public.broadcast_admin_access_changed();

-- ============================================================================
-- 3. WHO MAY RECEIVE: only the admin the topic is named after
-- ============================================================================
DROP POLICY IF EXISTS admin_access_topic_receive ON realtime.messages;
CREATE POLICY admin_access_topic_receive ON realtime.messages
FOR SELECT TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  AND (SELECT realtime.topic()) = 'admin-access:' || (SELECT auth.uid())::text
);
