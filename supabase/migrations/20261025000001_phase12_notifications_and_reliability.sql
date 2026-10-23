-- ==============================================================================
-- Migration: 20261025000001_phase12_notifications_and_reliability.sql
-- Description: Phase 12 Notifications, Transactional Email, Reliability & Auditing
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend announcements for Event-Scoping, Type Categorization, and Metadata
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'hackathon_id'
  ) THEN
    ALTER TABLE public.announcements
      ADD COLUMN hackathon_id UUID REFERENCES public.hackathons(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'announcement_type'
  ) THEN
    ALTER TABLE public.announcements
      ADD COLUMN announcement_type TEXT NOT NULL DEFAULT 'general';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE public.announcements
      ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Add check constraint for announcement_type if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_schema = 'public' AND table_name = 'announcements' AND constraint_name = 'chk_announcements_type'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT chk_announcements_type CHECK (announcement_type IN ('general', 'deadline', 'system', 'urgent'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_announcements_hackathon ON public.announcements(hackathon_id) WHERE hackathon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_type ON public.announcements(announcement_type);

-- ----------------------------------------------------------------------------
-- 2. Update Announcements RLS Policy for Role and Event Scoping
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS announcements_select_all ON public.announcements;
CREATE POLICY announcements_select_all ON public.announcements
FOR SELECT TO authenticated
USING (
  -- Global announcements (no hackathon scoping)
  (hackathon_id IS NULL AND (
    target_role = 'all'
    OR (target_role = 'students' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()))
    OR (target_role = 'admins' AND EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = auth.uid()))
  ))
  OR
  -- Hackathon-scoped announcements
  (hackathon_id IS NOT NULL AND (
    -- Super Admin or authorized admin for this hackathon
    public.current_is_super_admin()
    OR public.can_admin_manage_hackathon(hackathon_id, NULL)
    OR public.current_has_permission('manage_notifications')
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
-- 3. Push Delivery Logs Table (Auditing Web Push attempts, failures, and outcomes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID REFERENCES public.announcements(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_push_subscriptions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'expired')),
  status_code INT,
  error_message TEXT,
  attempt_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_announcement ON public.push_delivery_logs(announcement_id, status);
CREATE INDEX IF NOT EXISTS idx_push_delivery_user ON public.push_delivery_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_status ON public.push_delivery_logs(status);

DROP TRIGGER IF EXISTS trg_push_delivery_logs_updated_at ON public.push_delivery_logs;
CREATE TRIGGER trg_push_delivery_logs_updated_at
BEFORE UPDATE ON public.push_delivery_logs
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.push_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_delivery_logs_admin_select ON public.push_delivery_logs;
CREATE POLICY push_delivery_logs_admin_select ON public.push_delivery_logs
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin()
  OR
  public.current_has_permission('manage_notifications')
  OR
  public.current_has_permission('view_audit_logs')
);

DROP POLICY IF EXISTS push_delivery_logs_user_select ON public.push_delivery_logs;
CREATE POLICY push_delivery_logs_user_select ON public.push_delivery_logs
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS push_delivery_logs_insert ON public.push_delivery_logs;
CREATE POLICY push_delivery_logs_insert ON public.push_delivery_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.current_is_super_admin()
  OR public.current_has_permission('manage_notifications')
  OR user_id = auth.uid()
);

-- ----------------------------------------------------------------------------
-- 4. Transactional Email Queue & Delivery Logs Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'retrying')),
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON public.email_delivery_logs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_user ON public.email_delivery_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_queue_recipient ON public.email_delivery_logs(recipient_email);

DROP TRIGGER IF EXISTS trg_email_delivery_logs_updated_at ON public.email_delivery_logs;
CREATE TRIGGER trg_email_delivery_logs_updated_at
BEFORE UPDATE ON public.email_delivery_logs
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_delivery_admin_select ON public.email_delivery_logs;
CREATE POLICY email_delivery_admin_select ON public.email_delivery_logs
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin()
  OR
  public.current_has_permission('manage_notifications')
  OR
  public.current_has_permission('view_audit_logs')
);

DROP POLICY IF EXISTS email_delivery_user_select ON public.email_delivery_logs;
CREATE POLICY email_delivery_user_select ON public.email_delivery_logs
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
);

DROP POLICY IF EXISTS email_delivery_insert ON public.email_delivery_logs;
CREATE POLICY email_delivery_insert ON public.email_delivery_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.current_is_super_admin()
  OR public.current_has_permission('manage_notifications')
  OR user_id = auth.uid()
);

-- ----------------------------------------------------------------------------
-- 5. RPC: log_push_delivery_outcome
-- Records Web Push send results and deactivates expired / invalid subscriptions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_push_delivery_outcome(
  p_announcement_id UUID DEFAULT NULL,
  p_subscription_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_endpoint TEXT DEFAULT '',
  p_status TEXT DEFAULT 'delivered',
  p_status_code INT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_attempt_count INT DEFAULT 1
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  IF p_status NOT IN ('pending', 'delivered', 'failed', 'expired') THEN
    RAISE EXCEPTION 'Invalid delivery status: %' , p_status USING ERRCODE = '22023';
  END IF;

  -- Authorization guard: Service role (auth.uid() IS NULL) is permitted.
  -- Authenticated callers must be super_admin, have notification/announcement admin permission, or target their own subscription/user_id.
  IF auth.uid() IS NOT NULL THEN
    IF NOT (
      public.current_is_super_admin() OR
      public.current_has_permission('manage_notifications') OR
      public.current_has_permission('manage_announcements') OR
      (p_user_id IS NOT NULL AND p_user_id = auth.uid()) OR
      (p_subscription_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.user_push_subscriptions WHERE id = p_subscription_id AND user_id = auth.uid()
      ))
    ) THEN
      RAISE EXCEPTION 'Access denied to log push delivery outcome' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.push_delivery_logs (
    announcement_id,
    subscription_id,
    user_id,
    endpoint,
    status,
    status_code,
    error_message,
    attempt_count
  ) VALUES (
    p_announcement_id,
    p_subscription_id,
    p_user_id,
    p_endpoint,
    p_status,
    p_status_code,
    p_error_message,
    COALESCE(p_attempt_count, 1)
  )
  RETURNING id INTO v_log_id;

  -- Automatically deactivate subscription if gateway reported 404/410 or expired
  IF p_status = 'expired' OR p_status_code IN (404, 410) THEN
    IF p_subscription_id IS NOT NULL THEN
      UPDATE public.user_push_subscriptions
      SET active = false,
          updated_at = now()
      WHERE id = p_subscription_id;
    ELSE
      UPDATE public.user_push_subscriptions
      SET active = false,
          updated_at = now()
      WHERE endpoint = p_endpoint;
    END IF;
  END IF;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.log_push_delivery_outcome FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_push_delivery_outcome TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. RPC: Enhanced publish_announcement
-- Supports optional event scoping (p_hackathon_id), announcement type, and metadata.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_announcement(
  p_title TEXT,
  p_body TEXT,
  p_target_role TEXT DEFAULT 'all',
  p_hackathon_id UUID DEFAULT NULL,
  p_announcement_type TEXT DEFAULT 'general',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_has_manage_notif BOOLEAN;
  v_new_id UUID;
  v_trimmed_title TEXT;
  v_trimmed_body TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT is_super_admin INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_has_manage_notif := (v_caller_is_super IS TRUE) OR public.current_has_permission('manage_notifications');

  -- Verify event authorization if hackathon-scoped
  IF p_hackathon_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id) THEN
      RAISE EXCEPTION 'Hackathon not found: %', p_hackathon_id USING ERRCODE = 'P0002';
    END IF;

    IF NOT (
      v_caller_is_super IS TRUE 
      OR v_has_manage_notif 
      OR public.can_admin_manage_hackathon(p_hackathon_id, 'manage_hackathons')
      OR public.can_admin_manage_hackathon(p_hackathon_id, NULL)
    ) THEN
      RAISE EXCEPTION 'Access denied: You are not authorized to publish announcements for this hackathon.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT v_has_manage_notif THEN
      RAISE EXCEPTION 'Access denied: manage_notifications permission or Super Admin authority required.' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_trimmed_title := trim(COALESCE(p_title, ''));
  v_trimmed_body := trim(COALESCE(p_body, ''));

  IF length(v_trimmed_title) < 3 OR length(v_trimmed_title) > 200 THEN
    RAISE EXCEPTION 'Invalid title: must be between 3 and 200 characters.' USING ERRCODE = '22023';
  END IF;

  IF length(v_trimmed_body) < 5 THEN
    RAISE EXCEPTION 'Invalid body: must be at least 5 characters.' USING ERRCODE = '22023';
  END IF;

  IF p_target_role NOT IN ('all', 'students', 'admins') THEN
    RAISE EXCEPTION 'Invalid target role: % (must be all, students, or admins).' , p_target_role USING ERRCODE = '22023';
  END IF;

  IF p_announcement_type NOT IN ('general', 'deadline', 'system', 'urgent') THEN
    RAISE EXCEPTION 'Invalid announcement type: %', p_announcement_type USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.announcements (
    title,
    body,
    target_role,
    hackathon_id,
    announcement_type,
    metadata,
    created_by
  ) VALUES (
    v_trimmed_title,
    v_trimmed_body,
    p_target_role,
    p_hackathon_id,
    p_announcement_type,
    COALESCE(p_metadata, '{}'::jsonb),
    v_caller_id
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END,
    'notification.announcement_published',
    'announcement',
    v_new_id::text,
    jsonb_build_object(
      'title', v_trimmed_title,
      'target_role', p_target_role,
      'hackathon_id', p_hackathon_id,
      'announcement_type', p_announcement_type
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'announcement_id', v_new_id,
    'title', v_trimmed_title,
    'hackathon_id', p_hackathon_id,
    'announcement_type', p_announcement_type
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.publish_announcement(TEXT, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_announcement(TEXT, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- Drop old 3-arg function to avoid signature ambiguity with the defaulted 6-arg version
DROP FUNCTION IF EXISTS public.publish_announcement(TEXT, TEXT, TEXT);

-- ----------------------------------------------------------------------------
-- 7. RPC: publish_deadline_reminder
-- Targeted announcement for an upcoming round submission deadline.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_deadline_reminder(
  p_hackathon_id UUID,
  p_round_id UUID,
  p_deadline TIMESTAMPTZ,
  p_custom_message TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_hackathon_title TEXT;
  v_round_name TEXT;
  v_round_number INT;
  v_title TEXT;
  v_body TEXT;
  v_result JSONB;
BEGIN
  IF p_hackathon_id IS NULL OR p_round_id IS NULL OR p_deadline IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: hackathon_id, round_id, and deadline are required.' USING ERRCODE = '22023';
  END IF;

  SELECT title INTO v_hackathon_title
  FROM public.hackathons
  WHERE id = p_hackathon_id;

  IF v_hackathon_title IS NULL THEN
    RAISE EXCEPTION 'Hackathon not found: %', p_hackathon_id USING ERRCODE = 'P0002';
  END IF;

  SELECT name, round_number INTO v_round_name, v_round_number
  FROM public.hackathon_rounds
  WHERE id = p_round_id AND hackathon_id = p_hackathon_id;

  IF v_round_name IS NULL THEN
    RAISE EXCEPTION 'Round not found for specified hackathon: %', p_round_id USING ERRCODE = 'P0002';
  END IF;

  v_title := format('Deadline Alert: %s (Round %s)', v_round_name, v_round_number);
  
  IF p_custom_message IS NOT NULL AND length(trim(p_custom_message)) >= 5 THEN
    v_body := format('%s. Submission deadline is %s. %s', v_hackathon_title, to_char(p_deadline, 'YYYY-MM-DD HH24:MI UTC'), trim(p_custom_message));
  ELSE
    v_body := format('Submissions for Round %s (%s) of "%s" are due by %s. Please submit your project evidence on time.',
                     v_round_number, v_round_name, v_hackathon_title, to_char(p_deadline, 'YYYY-MM-DD HH24:MI UTC'));
  END IF;

  v_result := public.publish_announcement(
    p_title := v_title,
    p_body := v_body,
    p_target_role := 'students',
    p_hackathon_id := p_hackathon_id,
    p_announcement_type := 'deadline',
    p_metadata := jsonb_build_object(
      'round_id', p_round_id,
      'round_number', v_round_number,
      'deadline', p_deadline
    )
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.publish_deadline_reminder(UUID, UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_deadline_reminder(UUID, UUID, TIMESTAMPTZ, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. RPC: get_system_health
-- Audits database connectivity, table operational volumes, queue depth,
-- and documents known Supabase Free plan operational limitations.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_system_health()
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_admin BOOLEAN := false;
  v_students_count INT;
  v_hackathons_count INT;
  v_teams_count INT;
  v_pending_storage_deletions INT;
  v_active_push_subscriptions INT;
  v_pending_emails INT;
  v_free_plan_notice CONSTANT TEXT := 'Supabase Free plan is subject to automatic inactivity pausing after 7 days without queries. Automated keepalives reduce risk but 100% availability requires upgrading to Supabase Pro.';
BEGIN
  -- Service role (v_caller_id IS NULL) or administrative identity receives full metrics
  IF v_caller_id IS NULL THEN
    v_is_admin := true;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_caller_id) INTO v_is_admin;
  END IF;

  SELECT COUNT(*) INTO v_pending_storage_deletions FROM public.storage_deletion_queue WHERE status = 'pending';
  SELECT COUNT(*) INTO v_active_push_subscriptions FROM public.user_push_subscriptions WHERE active = true;
  SELECT COUNT(*) INTO v_pending_emails FROM public.email_delivery_logs WHERE status = 'pending';

  IF v_is_admin THEN
    SELECT COUNT(*) INTO v_students_count FROM public.profiles;
    SELECT COUNT(*) INTO v_hackathons_count FROM public.hackathons;
    SELECT COUNT(*) INTO v_teams_count FROM public.teams;

    RETURN jsonb_build_object(
      'status', 'healthy',
      'database_connected', true,
      'timestamp', now(),
      'metrics', jsonb_build_object(
        'registered_students', v_students_count,
        'total_hackathons', v_hackathons_count,
        'total_teams', v_teams_count,
        'active_push_subscriptions', v_active_push_subscriptions,
        'pending_storage_deletions', v_pending_storage_deletions,
        'pending_transactional_emails', v_pending_emails
      ),
      'reliability_notice', v_free_plan_notice
    );
  ELSE
    RETURN jsonb_build_object(
      'status', 'healthy',
      'database_connected', true,
      'timestamp', now(),
      'reliability_notice', v_free_plan_notice
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_system_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_system_health() TO authenticated, service_role;
