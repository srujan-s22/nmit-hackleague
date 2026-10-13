-- ============================================================================
-- Migration: 20261013000001_phase4_onboarding_and_review.sql
-- Phase 4: Demographics, Triggers, Review & Rate Limiting RPCs
-- ============================================================================

-- 1. Create gender enum type safely if not already present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gender') THEN
    CREATE TYPE public.gender AS ENUM ('Male', 'Female', 'Other');
  END IF;
END $$;

-- 2. Add demographic columns safely
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sex public.gender;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_dob_valid;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_dob_valid CHECK (
  date_of_birth IS NULL OR (
    date_of_birth >= '1900-01-01'::date AND
    date_of_birth <= '2100-01-01'::date
  )
);

-- 3. Safely replace registration status check constraint to include 'correction_required'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_status;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_status CHECK (
  registration_status IN (
    'draft',
    'pending_verification',
    'under_review',
    'approved',
    'rejected',
    'correction_required',
    'suspended'
  )
);

-- 4. Signup Trigger Function handle_new_auth_user()
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_usn TEXT;
  v_phone TEXT;
  v_branch TEXT;
  v_academic_year INT;
  v_sex public.gender;
  v_dob DATE;
BEGIN
  -- If user has admin role metadata, skip student profile creation
  IF (NEW.raw_app_meta_data->>'claims_admin')::boolean IS TRUE
     OR NEW.raw_app_meta_data->>'role' = 'admin'
     OR NEW.raw_user_meta_data->>'role' = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Skip profile creation for direct raw SQL fixture/admin inserts without metadata
  IF NEW.raw_app_meta_data IS NULL AND NEW.raw_user_meta_data IS NULL THEN
    RETURN NEW;
  END IF;

  v_full_name := trim(COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  v_usn := upper(trim(COALESCE(NEW.raw_user_meta_data->>'usn', '')));
  v_phone := trim(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
  v_branch := trim(COALESCE(NEW.raw_user_meta_data->>'branch', ''));
  v_academic_year := (NEW.raw_user_meta_data->>'academic_year')::INT;
  v_sex := (NEW.raw_user_meta_data->>'sex')::public.gender;
  v_dob := (NEW.raw_user_meta_data->>'date_of_birth')::DATE;

  -- Validate mandatory registration fields
  IF v_full_name = '' OR v_usn = '' OR v_phone = '' OR v_branch = '' OR v_academic_year IS NULL OR v_sex IS NULL OR v_dob IS NULL THEN
    RAISE EXCEPTION 'Missing required registration details in user metadata.';
  END IF;

  -- Validate minimum age 15
  IF (v_dob + INTERVAL '15 years') > CURRENT_DATE THEN
    RAISE EXCEPTION 'Student must be at least 15 years of age to register.';
  END IF;

  -- Insert profile atomically in draft status
  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status
  ) VALUES (
    NEW.id, NEW.email, v_full_name, v_usn, v_phone, v_branch, v_academic_year, v_sex, v_dob, 'draft'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 5. Create private transaction-authorization table
CREATE TABLE IF NOT EXISTS public.profile_action_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xact_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('replace_college_id', 'submit_profile_for_review')),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_profile_action_auth_lookup
ON public.profile_action_authorizations (xact_id, student_id, action_type);

REVOKE ALL ON TABLE public.profile_action_authorizations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.profile_action_authorizations TO service_role;
ALTER TABLE public.profile_action_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_action_authorizations FORCE ROW LEVEL SECURITY;

-- 6. Update trigger function protect_profile_columns()
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER AS $$
DECLARE
  v_is_super_or_service BOOLEAN;
  v_is_admin_or_service BOOLEAN;
  v_authorized INT;
BEGIN
  -- Primary key protection
  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'Profile ID cannot be modified.';
  END IF;

  v_is_super_or_service := (
    (current_user IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() = 'service_role')) OR
    (auth.role() IS NOT NULL AND auth.role() = 'service_role') OR
    public.current_is_super_admin()
  );

  v_is_admin_or_service := (
    v_is_super_or_service OR
    public.current_has_permission('verify_students') OR
    public.current_has_permission('manage_students')
  );

  -- 1. Profile email protection (managed strictly by Supabase Auth)
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    IF NOT v_is_super_or_service THEN
      RAISE EXCEPTION 'Profile email is managed by authentication and cannot be updated directly.';
    END IF;
  END IF;

  -- 2. Administrative fields guarded from non-admin updates
  IF (OLD.registration_status IS DISTINCT FROM NEW.registration_status OR
      OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason OR
      OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by OR
      OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at OR
      OLD.college_id_deleted_at IS DISTINCT FROM NEW.college_id_deleted_at) THEN

    IF NOT v_is_admin_or_service THEN
      -- Verify ephemeral transaction authorization for submit_profile_for_review()
      IF OLD.registration_status IN ('draft', 'correction_required')
         AND NEW.registration_status = 'under_review' THEN

        DELETE FROM public.profile_action_authorizations
        WHERE xact_id = pg_current_xact_id()::text
          AND student_id = OLD.id
          AND action_type = 'submit_profile_for_review'
          AND old_value = OLD.registration_status
          AND new_value = 'under_review'
        RETURNING 1 INTO v_authorized;

        IF v_authorized IS NULL THEN
          RAISE EXCEPTION 'Direct update of registration_status is blocked. Use the submit_profile_for_review() RPC.';
        END IF;

        IF NEW.rejection_reason IS NOT NULL
           OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
           OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
           OR NEW.college_id_deleted_at IS DISTINCT FROM OLD.college_id_deleted_at THEN
          RAISE EXCEPTION 'Unauthorized column modification: registration_status and review metadata can only be updated by authorized administrators.';
        END IF;
      ELSE
        RAISE EXCEPTION 'Unauthorized column modification: registration_status and review metadata can only be updated by authorized administrators.';
      END IF;
    END IF;
  END IF;

  -- 3. Approved student details frozen against direct modification
  IF OLD.registration_status = 'approved' AND NOT v_is_super_or_service THEN
    IF (OLD.usn IS DISTINCT FROM NEW.usn OR
        OLD.full_name IS DISTINCT FROM NEW.full_name OR
        OLD.branch IS DISTINCT FROM NEW.branch OR
        OLD.academic_year IS DISTINCT FROM NEW.academic_year OR
        OLD.college_id_path IS DISTINCT FROM NEW.college_id_path OR
        OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth OR
        OLD.sex IS DISTINCT FROM NEW.sex) THEN
      RAISE EXCEPTION 'Approved student details cannot be modified directly. Submit a profile change request.';
    END IF;
  END IF;

  -- 4. Date of birth validation on profile update
  IF (OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth) AND NEW.date_of_birth IS NOT NULL THEN
    IF (NEW.date_of_birth + INTERVAL '15 years') > CURRENT_DATE THEN
      RAISE EXCEPTION 'Invalid date of birth: student must be at least 15 years old.';
    END IF;
  END IF;

  -- 5. College ID storage path protection
  IF OLD.college_id_path IS DISTINCT FROM NEW.college_id_path THEN
    IF NOT v_is_admin_or_service THEN
      IF NEW.college_id_path IS NULL THEN
        IF OLD.registration_status IN ('under_review', 'approved') THEN
          RAISE EXCEPTION 'College ID cannot be removed while registration is under review or approved.';
        END IF;
      ELSE
        -- Verify ephemeral transaction authorization for replace_college_id()
        IF OLD.registration_status = 'correction_required' THEN
          DELETE FROM public.profile_action_authorizations
          WHERE xact_id = pg_current_xact_id()::text
            AND student_id = OLD.id
            AND action_type = 'replace_college_id'
            AND old_value = OLD.college_id_path
            AND new_value = NEW.college_id_path
          RETURNING 1 INTO v_authorized;

          IF v_authorized IS NULL THEN
            RAISE EXCEPTION 'Direct update of college_id_path is blocked in correction_required status. Use the replace_college_id() RPC.';
          END IF;
        ELSIF OLD.college_id_path IS NOT NULL AND OLD.registration_status IN ('under_review', 'approved') THEN
          RAISE EXCEPTION 'College ID cannot be modified while registration is under review or approved.';
        END IF;

        -- Folder containment check
        IF NOT (NEW.college_id_path LIKE (NEW.id::text || '/%')) THEN
          RAISE EXCEPTION 'Unauthorized college_id_path: storage object path must reside in student folder.';
        END IF;

        -- Object existence and ownership check
        IF NOT EXISTS (
          SELECT 1 FROM storage.objects
          WHERE bucket_id = 'college-ids'
            AND name = NEW.college_id_path
            AND (storage.foldername(name))[1] = NEW.id::text
            AND (
              (owner = NEW.id AND (owner_id IS NULL OR owner_id = NEW.id::text))
              OR (owner IS NULL AND owner_id = NEW.id::text)
            )
        ) THEN
          RAISE EXCEPTION 'Invalid college_id_path: referenced object does not exist in college-ids storage or is not owned by the student.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6. Profile photo storage path protection
  IF OLD.profile_photo_path IS DISTINCT FROM NEW.profile_photo_path THEN
    IF NOT v_is_admin_or_service THEN
      IF NEW.profile_photo_path IS NOT NULL THEN
        IF NOT (NEW.profile_photo_path LIKE (NEW.id::text || '/%')) THEN
          RAISE EXCEPTION 'Unauthorized profile_photo_path: storage object path must reside in student folder.';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM storage.objects
          WHERE bucket_id = 'profile-photos'
            AND name = NEW.profile_photo_path
            AND (storage.foldername(name))[1] = NEW.id::text
            AND (
              (owner = NEW.id AND (owner_id IS NULL OR owner_id = NEW.id::text))
              OR (owner IS NULL AND owner_id = NEW.id::text)
            )
        ) THEN
          RAISE EXCEPTION 'Invalid profile_photo_path: referenced object does not exist in profile-photos storage or is not owned by the student.';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_profile_columns() TO authenticated;

-- 7. Student Profile Submission RPC
CREATE OR REPLACE FUNCTION public.submit_profile_for_review()
RETURNS jsonb AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Rate limit check
  IF NOT public.consume_rate_limit('submit_review') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many submission attempts. Please wait.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile record not found.';
  END IF;

  IF v_profile.registration_status NOT IN ('draft', 'correction_required') THEN
    RAISE EXCEPTION 'Profile cannot be submitted from status %.', v_profile.registration_status;
  END IF;

  -- Mandatory validation
  IF v_profile.college_id_path IS NULL THEN
    RAISE EXCEPTION 'Mandatory college ID card image must be uploaded before submitting.';
  END IF;
  IF v_profile.sex IS NULL OR v_profile.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Demographics (sex and date of birth) are required before submitting.';
  END IF;
  IF (v_profile.date_of_birth + INTERVAL '15 years') > CURRENT_DATE THEN
    RAISE EXCEPTION 'Valid date of birth (minimum age 15) is required before submitting registration.';
  END IF;

  -- Step 1: Issue ephemeral transaction-scoped authorization token
  INSERT INTO public.profile_action_authorizations (
    xact_id, student_id, action_type, old_value, new_value
  ) VALUES (
    pg_current_xact_id()::text, v_user_id, 'submit_profile_for_review', v_profile.registration_status, 'under_review'
  );

  -- Step 2: Advance status (Trigger consumes token and verifies operation)
  UPDATE public.profiles
  SET registration_status = 'under_review',
      rejection_reason = NULL,
      updated_at = now()
  WHERE id = v_user_id;

  -- Step 3: Write audit log
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_user_id,
    'student',
    'student.submitted_for_review',
    'profile',
    v_user_id::text,
    jsonb_build_object('status', 'under_review', 'college_id_path', v_profile.college_id_path)
  );

  RETURN jsonb_build_object('success', true, 'status', 'under_review');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.submit_profile_for_review() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_profile_for_review() TO authenticated;

-- 8. Student College ID Replacement RPC
CREATE OR REPLACE FUNCTION public.replace_college_id(
  p_new_storage_path TEXT
)
RETURNS jsonb AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_old_path TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Rate limit check
  IF NOT public.consume_rate_limit('replace_id') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many ID upload attempts.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.'; END IF;

  IF v_profile.registration_status <> 'correction_required' THEN
    RAISE EXCEPTION 'ID replacement is only permitted while in correction_required status.';
  END IF;

  IF v_profile.college_id_path IS NULL THEN
    RAISE EXCEPTION 'Invalid profile state: active College ID is missing in correction_required status.';
  END IF;

  IF p_new_storage_path = v_profile.college_id_path THEN
    RAISE EXCEPTION 'Replacement storage path must differ from current college ID path.';
  END IF;

  -- Validate new storage object exists and is owned by student
  IF NOT (p_new_storage_path LIKE (v_user_id::text || '/%')) THEN
    RAISE EXCEPTION 'Unauthorized path: storage object must reside in user folder.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'college-ids'
      AND name = p_new_storage_path
      AND (storage.foldername(name))[1] = v_user_id::text
      AND (
        (owner = v_user_id AND (owner_id IS NULL OR owner_id = v_user_id::text))
        OR (owner IS NULL AND owner_id = v_user_id::text)
      )
  ) THEN
    RAISE EXCEPTION 'Invalid storage path: referenced object does not exist in college-ids or is not owned by user.';
  END IF;

  v_old_path := v_profile.college_id_path;

  -- Step A: Enqueue old path for deletion under superseded target_type
  PERFORM public.enqueue_storage_deletion_job(
    'college-ids', v_old_path, 'profile_college_id_superseded', v_user_id::text
  );

  -- Step B: Issue ephemeral transaction-scoped authorization token
  INSERT INTO public.profile_action_authorizations (
    xact_id, student_id, action_type, old_value, new_value
  ) VALUES (
    pg_current_xact_id()::text, v_user_id, 'replace_college_id', v_old_path, p_new_storage_path
  );

  -- Step C: Update profile with new path (Trigger consumes token and verifies operation)
  UPDATE public.profiles
  SET college_id_path = p_new_storage_path,
      updated_at = now()
  WHERE id = v_user_id;

  -- Step D: Audit log
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_user_id,
    'student',
    'college_id.replaced',
    'profile',
    v_user_id::text,
    jsonb_build_object('old_path', v_old_path, 'new_path', p_new_storage_path)
  );

  RETURN jsonb_build_object('success', true, 'new_path', p_new_storage_path);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.replace_college_id(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_college_id(TEXT) TO authenticated;

-- 9. Administrative Review RPC
CREATE OR REPLACE FUNCTION public.review_student_registration(
  p_student_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
BEGIN
  -- Verify administrator account is not inactive
  IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_admin_id AND is_active = false) THEN
    RAISE EXCEPTION 'Access denied: administrator account is inactive.';
  END IF;

  -- Strict permission check
  IF NOT (public.current_has_permission('verify_students') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: requires verify_students permission or Super Admin authority.';
  END IF;

  -- Verify active admin profile
  IF NOT EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_admin_id AND is_active = true) THEN
    RAISE EXCEPTION 'Access denied: administrator account is inactive.';
  END IF;

  -- Rate limit check
  IF NOT public.consume_rate_limit('review_action') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many review operations. Please wait.';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'correction_required') THEN
    RAISE EXCEPTION 'Invalid review decision: %.', p_decision;
  END IF;

  IF p_decision IN ('rejected', 'correction_required') AND (p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) = 0) THEN
    RAISE EXCEPTION 'A non-empty reason is required when rejecting or requesting correction.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found.';
  END IF;

  IF v_profile.registration_status NOT IN ('under_review', 'pending_verification') THEN
    RAISE EXCEPTION 'Student is not currently under review (status: %).', v_profile.registration_status;
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.profiles
    SET registration_status = 'approved',
        rejection_reason = NULL,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_student_id;

    IF v_profile.college_id_path IS NOT NULL THEN
      PERFORM public.enqueue_storage_deletion_job(
        'college-ids', v_profile.college_id_path, 'profile_college_id', p_student_id::text
      );
    END IF;

  ELSIF p_decision = 'rejected' THEN
    UPDATE public.profiles
    SET registration_status = 'rejected',
        rejection_reason = trim(p_rejection_reason),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_student_id;

    IF v_profile.college_id_path IS NOT NULL THEN
      PERFORM public.enqueue_storage_deletion_job(
        'college-ids', v_profile.college_id_path, 'profile_college_id', p_student_id::text
      );
    END IF;

  ELSIF p_decision = 'correction_required' THEN
    UPDATE public.profiles
    SET registration_status = 'correction_required',
        rejection_reason = trim(p_rejection_reason),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_student_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_admin_id,
    'admin',
    'student.reviewed',
    'profile',
    p_student_id::text,
    jsonb_build_object('decision', p_decision, 'reason', p_rejection_reason)
  );

  RETURN jsonb_build_object('success', true, 'status', p_decision);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.review_student_registration(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_student_registration(UUID, TEXT, TEXT) TO authenticated;

-- 10. Atomic Rate Limiter Table & Functions
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_prune
ON public.rate_limit_buckets (window_start);

REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_action TEXT,
  p_custom_key TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_key TEXT;
  v_max_requests INT;
  v_window_seconds INT;
  v_count INT;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_role TEXT := COALESCE(auth.role(), 'none');
BEGIN
  -- 1. Determine key and fixed limits strictly based on server logic (NOT caller parameters)
  IF p_action = 'signup' THEN
    IF (v_role = 'authenticated') OR (v_role <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin')) THEN
      RAISE EXCEPTION 'Access denied: unauthenticated action rate-limiting requires service_role authority.';
    END IF;
    IF p_custom_key IS NULL OR length(trim(p_custom_key)) < 16 THEN
      RAISE EXCEPTION 'Valid client IP HMAC key required for unauthenticated signup limiting.';
    END IF;
    v_key := 'anon:' || trim(p_custom_key);
    v_max_requests := 5;      -- Max 5 signups per hour per IP
    v_window_seconds := 3600; -- 1 hour window

  ELSIF p_action = 'submit_review' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    v_key := 'user:' || auth.uid()::text;
    v_max_requests := 5;      -- Max 5 submissions
    v_window_seconds := 900;  -- per 15 mins

  ELSIF p_action = 'replace_id' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    v_key := 'user:' || auth.uid()::text;
    v_max_requests := 10;     -- Max 10 uploads
    v_window_seconds := 3600; -- per hour

  ELSIF p_action = 'review_action' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    v_key := 'admin:' || auth.uid()::text;
    v_max_requests := 120;    -- Max 120 review actions
    v_window_seconds := 300;  -- per 5 mins

  ELSIF p_action = 'view_college_id' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    v_key := 'admin:' || auth.uid()::text;
    v_max_requests := 60;     -- Max 60 ID views
    v_window_seconds := 300;  -- per 5 mins

  ELSE
    RAISE EXCEPTION 'Unknown rate-limited action: %', p_action;
  END IF;

  -- 2. Concurrency-safe atomic upsert with row-level lock
  INSERT INTO public.rate_limit_buckets (bucket_key, action, window_start, request_count)
  VALUES (v_key, p_action, v_now, 1)
  ON CONFLICT (bucket_key, action) DO UPDATE
  SET request_count = CASE
        WHEN public.rate_limit_buckets.window_start < (v_now - (v_window_seconds || ' seconds')::interval) THEN 1
        ELSE public.rate_limit_buckets.request_count + 1
      END,
      window_start = CASE
        WHEN public.rate_limit_buckets.window_start < (v_now - (v_window_seconds || ' seconds')::interval) THEN v_now
        ELSE public.rate_limit_buckets.window_start
      END
  RETURNING request_count INTO v_count;

  -- 3. Evaluate threshold
  IF v_count > v_max_requests THEN
    RETURN false; -- Rate limit exceeded
  END IF;

  RETURN true; -- Allowed
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT) TO authenticated, service_role;

-- 11. Bounded Rate Limit Pruning & Maintenance Function
CREATE OR REPLACE FUNCTION public.prune_rate_limit_buckets(
  p_batch_size INT DEFAULT 500
)
RETURNS INT AS $$
DECLARE
  v_deleted INT := 0;
  v_cutoff TIMESTAMPTZ := clock_timestamp() - INTERVAL '24 hours';
BEGIN
  IF COALESCE(auth.role(), 'none') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: bucket maintenance requires service_role authority.';
  END IF;

  -- 1. Atomic batch pruning using SKIP LOCKED
  WITH expired AS (
    SELECT bucket_key, action
    FROM public.rate_limit_buckets
    WHERE window_start < v_cutoff
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.rate_limit_buckets b
  USING expired e
  WHERE b.bucket_key = e.bucket_key AND b.action = e.action;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2. Defensive maintenance: purge any unconsumed authorizations older than 1 hour
  DELETE FROM public.profile_action_authorizations
  WHERE created_at < clock_timestamp() - INTERVAL '1 hour';

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.prune_rate_limit_buckets(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_rate_limit_buckets(INT) TO service_role;
