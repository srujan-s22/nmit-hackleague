-- Security hardening batch 1: scope-tighten 3 confirmed over-broad grants.
-- Additive only. Does not edit any already-applied migration.
-- See: Joint Audit report (auto_pause_expired_rounds, is_push_registered,
-- push_delivery_logs/email_delivery_logs).

-- 1. auto_pause_expired_rounds: was reachable by any authenticated student
--    with no internal authorization check in the function body. Only
--    legitimate caller is src/app/api/cron/process-deletions/route.ts via
--    createAdminClient() (service_role). Restrict execution to service_role.
REVOKE EXECUTE ON FUNCTION public.auto_pause_expired_rounds(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auto_pause_expired_rounds(UUID) TO service_role;

-- 2. is_push_registered: previously any caller (including anon) could pass an
--    arbitrary p_user_id and learn whether that user has push registered
--    (enumeration leak). Add an internal ownership check; service_role keeps
--    full access (needed for push-service.ts's cross-user dispatch-targeting
--    check, src/lib/notifications/push-service.ts:413). Grants unchanged
--    (anon/authenticated/service_role) — the function now fails closed to
--    `false` for any non-self, non-service_role request.
--    No session_user IN ('postgres','supabase_admin') bypass: that pattern
--    (used correctly elsewhere for service_role-only worker functions) does
--    not apply here, since this function is deliberately granted to
--    anon/authenticated too. SET LOCAL ROLE changes current_user but never
--    session_user, so a session_user bypass would be unconditionally true
--    for any connection whose underlying login is postgres/supabase_admin
--    regardless of simulated/switched role (confirmed via local pgTAP:
--    TS-HRD-05/06 both leaked under this bypass) — and it added no real
--    value, since a Postgres superuser can already read
--    user_push_subscriptions directly, bypassing RLS entirely.
--    Both comparisons are guarded with an explicit IS NOT NULL check, not
--    just `auth.role() = 'service_role'` / `p_user_id = auth.uid()`: for a
--    true anonymous caller both auth.role() and auth.uid() are NULL, and
--    `x = NULL` evaluates to NULL, not false. `NULL OR false` is NULL, and
--    `NOT NULL` is NULL — a plpgsql IF treats a NULL condition as not-true
--    and skips the THEN branch, so the explicit `RETURN false` never ran
--    and execution fell through to the real EXISTS lookup. Confirmed by
--    direct reproduction against local Postgres with a real subscription
--    fixture present (not just inspecting the GUCs, which read correctly as
--    NULL on their own — the bug is in how NULL propagates through this
--    boolean expression, not in GUC/role simulation): TS-HRD-06 leaked
--    under the single-guard form (only auth.uid() guarded) and is fixed
--    with both comparisons guarded.
CREATE OR REPLACE FUNCTION public.is_push_registered(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (
    (auth.role() IS NOT NULL AND auth.role() = 'service_role')
    OR (auth.uid() IS NOT NULL AND p_user_id = auth.uid())
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_push_subscriptions
    WHERE user_id = p_user_id
      AND active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- 3. push_delivery_logs / email_delivery_logs: UPDATE/DELETE were granted to
--    `authenticated` with zero matching RLS policy anywhere (currently inert
--    since RLS default-denies, but over-broad). Narrow to service_role only,
--    which already performs all real writes to these tables. SELECT/INSERT
--    for authenticated are untouched.
REVOKE UPDATE, DELETE ON TABLE public.push_delivery_logs FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.email_delivery_logs FROM authenticated;
