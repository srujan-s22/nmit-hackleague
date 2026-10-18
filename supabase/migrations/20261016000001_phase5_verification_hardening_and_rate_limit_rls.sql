-- Migration: 20261016000001_phase5_verification_hardening_and_rate_limit_rls.sql
-- Purpose:
-- 1. Enable Row Level Security on public.rate_limit_buckets (satisfies Supabase security linter; default-denies direct access to anon and authenticated).
-- 2. Revoke unnecessary EXECUTE grants on authorization functions from anon role (current_has_permission, can_admin_manage_hackathon).

-- ============================================================================
-- 1. RATE LIMIT BUCKETS ROW LEVEL SECURITY
-- ============================================================================
-- Table ownership is postgres (superuser). SECURITY DEFINER functions (consume_rate_limit,
-- prune_rate_limit_buckets) execute with table owner privileges, bypassing RLS cleanly.
-- service_role has BYPASSRLS in PostgreSQL.
-- Without policies for anon and authenticated, direct client reads and writes are blocked by RLS default-deny.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. REVOKE UNNECESSARY ANONYMOUS EXECUTION GRANTS
-- ============================================================================
-- Revoke anon execution from current_has_permission; ensure authenticated retains execute.
REVOKE EXECUTE ON FUNCTION public.current_has_permission(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.current_has_permission(TEXT) TO authenticated;

-- Revoke anon execution from can_admin_manage_hackathon; ensure authenticated retains execute.
REVOKE EXECUTE ON FUNCTION public.can_admin_manage_hackathon(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_admin_manage_hackathon(UUID, TEXT) TO authenticated;
