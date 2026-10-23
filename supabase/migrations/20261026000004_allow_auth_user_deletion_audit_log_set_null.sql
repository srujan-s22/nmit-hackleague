-- Migration: 20261026000004_allow_auth_user_deletion_audit_log_set_null.sql
-- Description: Allow foreign key ON DELETE SET NULL on public.audit_logs(actor_id)
--              when an auth user is deleted from auth.users, while strictly preserving
--              the append-only guarantee against any manual, client, or admin mutation.

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Unconditionally reject all DELETE operations under all circumstances
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit logs are strictly append-only and cannot be deleted.';
  END IF;

  -- 2. Handle UPDATE operations
  IF TG_OP = 'UPDATE' THEN
    -- Only permit the foreign key ON DELETE SET NULL action triggered by Auth user deletion:
    -- - actor_id transitions from a non-null UUID to NULL
    -- - All other columns remain strictly unchanged
    -- - The referenced user has been removed from auth.users in the current transaction
    IF OLD.actor_id IS NOT NULL
       AND NEW.actor_id IS NULL
       AND NEW.id = OLD.id
       AND NEW.actor_role = OLD.actor_role
       AND NEW.action = OLD.action
       AND NEW.target_type = OLD.target_type
       AND NEW.target_id IS NOT DISTINCT FROM OLD.target_id
       AND NEW.ip_address IS NOT DISTINCT FROM OLD.ip_address
       AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
       AND NEW.details = OLD.details
       AND NEW.created_at = OLD.created_at
       AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.actor_id)
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Audit logs are strictly append-only and cannot be modified.';
  END IF;

  RETURN NEW;
END;
$$;

-- Secure function execution privileges:
-- Revoke all default EXECUTE privileges from PUBLIC and untrusted client roles,
-- and grant EXECUTE strictly to trusted administrative and service roles.
REVOKE ALL ON FUNCTION public.prevent_audit_log_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_audit_log_mutation() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_audit_log_mutation() TO postgres, service_role, supabase_auth_admin;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

COMMENT ON FUNCTION public.prevent_audit_log_mutation() IS
  'Protects public.audit_logs from tampering. Completely prohibits DELETE. Permits UPDATE exclusively for foreign-key ON DELETE SET NULL cascade when an auth.users record is removed.';
