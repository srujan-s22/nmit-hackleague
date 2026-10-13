-- Migration 07: Audit Logs and Profile Change Requests
-- Created: 2026-10-12
-- Schema: public

-- 1. Table: public.audit_logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tamper-resistance trigger on audit_logs
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are strictly append-only and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_audit_log_mutation
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- 2. Table: public.profile_change_requests
CREATE TABLE public.profile_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID NULL REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  rejection_reason TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_change_requests_field CHECK (field_name IN ('full_name', 'usn', 'branch', 'academic_year', 'phone')),
  CONSTRAINT chk_change_requests_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE TRIGGER trg_profile_change_requests_updated_at
BEFORE UPDATE ON public.profile_change_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
