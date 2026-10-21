-- Migration: 20261023000001_phase10_student_profiles_and_dashboard.sql
-- Description: Phase 10 - Student Profiles, Change Request Review Queue, Teammate Privacy Roster, and Protected Identity Management

BEGIN;

-- ============================================================================
-- 1. PREFLIGHT VERIFICATION CHECKS
-- ============================================================================

DO $$
DECLARE
  v_dup_count INT;
BEGIN
  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT student_id, field_name
    FROM public.profile_change_requests
    WHERE status = 'pending'
    GROUP BY student_id, field_name
    HAVING count(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Phase 10 Preflight Failed: Found % duplicate pending profile change requests. Resolve duplicates before applying migration.', v_dup_count;
  END IF;
END $$;

DO $$
DECLARE
  v_phone_pending_count INT;
BEGIN
  SELECT count(*) INTO v_phone_pending_count
  FROM public.profile_change_requests
  WHERE status = 'pending' AND field_name = 'phone';

  IF v_phone_pending_count > 0 THEN
    RAISE EXCEPTION 'Phase 10 Preflight Failed: Found % pending phone change requests. Phone is now directly student-editable; resolve or reject pending phone requests before applying migration.', v_phone_pending_count;
  END IF;
END $$;

-- ============================================================================
-- 2. SCHEMA EVOLUTION: profile_change_requests & profile_action_authorizations
-- ============================================================================

-- 2a. Update check constraint on profile_change_requests to disallow new phone requests while preserving historical records
ALTER TABLE public.profile_change_requests
  DROP CONSTRAINT IF EXISTS chk_change_requests_field;

ALTER TABLE public.profile_change_requests
  ADD CONSTRAINT chk_change_requests_field
  CHECK (
    status IN ('approved', 'rejected') OR
    (status = 'pending' AND field_name IN ('full_name', 'usn', 'branch', 'academic_year'))
  );

-- 2b. Add partial unique index: exactly one pending change request per student per field
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_change_requests_pending_field
  ON public.profile_change_requests (student_id, field_name)
  WHERE status = 'pending';

-- 2c. Add index for student history and admin queue queries
CREATE INDEX IF NOT EXISTS idx_profile_change_requests_student_created
  ON public.profile_change_requests (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profile_change_requests_status_created
  ON public.profile_change_requests (status, created_at ASC);

-- 2d. Update check constraint on profile_action_authorizations to include approve_profile_change
ALTER TABLE public.profile_action_authorizations
  DROP CONSTRAINT IF EXISTS profile_action_authorizations_action_type_check;

ALTER TABLE public.profile_action_authorizations
  ADD CONSTRAINT profile_action_authorizations_action_type_check
  CHECK (action_type IN ('replace_college_id', 'submit_profile_for_review', 'approve_profile_change'));

-- 2e. Add request_id foreign key column to profile_action_authorizations
ALTER TABLE public.profile_action_authorizations
  ADD COLUMN IF NOT EXISTS request_id UUID NULL REFERENCES public.profile_change_requests(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_profile_action_auth_request_lookup
  ON public.profile_action_authorizations (xact_id, student_id, action_type, request_id);

-- 2f. Add check constraint on profiles for Indian mobile number format (+91XXXXXXXXXX)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_phone_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_phone_format
  CHECK (phone ~ '^\+91[6-9][0-9]{9}$');

-- ============================================================================
-- 3. TRIGGER FUNCTION: protect_profile_columns()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER AS $$
DECLARE
  v_is_super_or_service BOOLEAN;
  v_is_admin_or_service BOOLEAN;
  v_authorized INT;
  v_changed_field_count INT;
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
      -- Ephemeral transaction authorization for submit_profile_for_review()
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
    -- Demographics and college ID path cannot be modified on approved profiles
    IF (OLD.college_id_path IS DISTINCT FROM NEW.college_id_path OR
        OLD.sex IS DISTINCT FROM NEW.sex OR
        OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth) THEN
      RAISE EXCEPTION 'Approved student details cannot be modified directly. Submit a profile change request.';
    END IF;

    -- Check for changes to protected institutional fields
    IF (OLD.full_name IS DISTINCT FROM NEW.full_name OR
        OLD.usn IS DISTINCT FROM NEW.usn OR
        OLD.branch IS DISTINCT FROM NEW.branch OR
        OLD.academic_year IS DISTINCT FROM NEW.academic_year) THEN

      -- Enforce that exactly one institutional field is modified per approved change
      v_changed_field_count := 0;
      IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN v_changed_field_count := v_changed_field_count + 1; END IF;
      IF OLD.usn IS DISTINCT FROM NEW.usn THEN v_changed_field_count := v_changed_field_count + 1; END IF;
      IF OLD.branch IS DISTINCT FROM NEW.branch THEN v_changed_field_count := v_changed_field_count + 1; END IF;
      IF OLD.academic_year IS DISTINCT FROM NEW.academic_year THEN v_changed_field_count := v_changed_field_count + 1; END IF;

      IF v_changed_field_count <> 1 THEN
        RAISE EXCEPTION 'Approved student details cannot be modified directly: exactly one institutional field may be updated per approved change request.';
      END IF;

      -- Atomically verify and consume single-use transaction authorization token.
      -- Bound strictly to:
      --   a) Current transaction ID (pg_current_xact_id()::text)
      --   b) Student ID (OLD.id)
      --   c) Action type ('approve_profile_change')
      --   d) Exact request_id matching an active, locked, pending request in public.profile_change_requests
      --   e) Exact field name and old/new values matching both the token and the pending request row
      --   f) All other protected institutional fields MUST remain completely unchanged
      DELETE FROM public.profile_action_authorizations paa
      USING public.profile_change_requests pcr
      WHERE paa.xact_id = pg_current_xact_id()::text
        AND paa.student_id = OLD.id
        AND paa.action_type = 'approve_profile_change'
        AND paa.request_id IS NOT NULL
        AND paa.request_id = pcr.id
        AND pcr.student_id = OLD.id
        AND pcr.status = 'pending'
        AND (
          (OLD.full_name IS DISTINCT FROM NEW.full_name
           AND OLD.usn IS NOT DISTINCT FROM NEW.usn
           AND OLD.branch IS NOT DISTINCT FROM NEW.branch
           AND OLD.academic_year IS NOT DISTINCT FROM NEW.academic_year
           AND paa.old_value = ('full_name:' || OLD.full_name)
           AND paa.new_value = ('full_name:' || NEW.full_name)
           AND pcr.field_name = 'full_name'
           AND pcr.old_value = OLD.full_name
           AND pcr.new_value = NEW.full_name) OR
          (OLD.usn IS DISTINCT FROM NEW.usn
           AND OLD.full_name IS NOT DISTINCT FROM NEW.full_name
           AND OLD.branch IS NOT DISTINCT FROM NEW.branch
           AND OLD.academic_year IS NOT DISTINCT FROM NEW.academic_year
           AND paa.old_value = ('usn:' || OLD.usn)
           AND paa.new_value = ('usn:' || NEW.usn)
           AND pcr.field_name = 'usn'
           AND pcr.old_value = OLD.usn
           AND pcr.new_value = NEW.usn) OR
          (OLD.branch IS DISTINCT FROM NEW.branch
           AND OLD.full_name IS NOT DISTINCT FROM NEW.full_name
           AND OLD.usn IS NOT DISTINCT FROM NEW.usn
           AND OLD.academic_year IS NOT DISTINCT FROM NEW.academic_year
           AND paa.old_value = ('branch:' || OLD.branch)
           AND paa.new_value = ('branch:' || NEW.branch)
           AND pcr.field_name = 'branch'
           AND pcr.old_value = OLD.branch
           AND pcr.new_value = NEW.branch) OR
          (OLD.academic_year IS DISTINCT FROM NEW.academic_year
           AND OLD.full_name IS NOT DISTINCT FROM NEW.full_name
           AND OLD.usn IS NOT DISTINCT FROM NEW.usn
           AND OLD.branch IS NOT DISTINCT FROM NEW.branch
           AND paa.old_value = ('academic_year:' || OLD.academic_year::text)
           AND paa.new_value = ('academic_year:' || NEW.academic_year::text)
           AND pcr.field_name = 'academic_year'
           AND pcr.old_value = OLD.academic_year::text
           AND pcr.new_value = NEW.academic_year::text)
        )
      RETURNING 1 INTO v_authorized;

      IF v_authorized IS NULL THEN
        RAISE EXCEPTION 'Approved student details cannot be modified directly: missing, invalid, or mismatched change request authorization.';
      END IF;
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
          RAISE EXCEPTION 'Approved student details cannot be modified directly. Submit a profile change request.';
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
        IF NEW.profile_photo_path LIKE '%..%' OR NOT (NEW.profile_photo_path LIKE (NEW.id::text || '/%')) THEN
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

-- ============================================================================
-- 4. TRANSACTIONAL RPC: submit_profile_change_request
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_profile_change_request(
  p_field_name TEXT,
  p_new_value TEXT,
  p_reason TEXT
)
RETURNS UUID AS $$
DECLARE
  v_student_id UUID;
  v_student public.profiles%ROWTYPE;
  v_old_value TEXT;
  v_trimmed_reason TEXT;
  v_normalized_new TEXT;
  v_request_id UUID;
  v_year_int INT;
BEGIN
  v_student_id := auth.uid();
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 1. Lock and verify student profile
  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = v_student_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_student.registration_status <> 'approved' THEN
    RAISE EXCEPTION 'Only verified, approved students may submit profile correction requests.' USING ERRCODE = '22023';
  END IF;

  -- 2. Validate field name
  IF p_field_name NOT IN ('full_name', 'usn', 'branch', 'academic_year') THEN
    RAISE EXCEPTION 'Invalid field name: % (Must be full_name, usn, branch, or academic_year).', p_field_name USING ERRCODE = '22023';
  END IF;

  -- 3. Validate reason
  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters long.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_trimmed_reason) > 500 THEN
    RAISE EXCEPTION 'Reason cannot exceed 500 characters.' USING ERRCODE = '22023';
  END IF;

  -- 4. Validate and normalize new value
  v_normalized_new := TRIM(COALESCE(p_new_value, ''));

  IF p_field_name = 'full_name' THEN
    v_old_value := v_student.full_name;
    IF LENGTH(v_normalized_new) < 2 OR LENGTH(v_normalized_new) > 100 THEN
      RAISE EXCEPTION 'Full name must be between 2 and 100 characters.' USING ERRCODE = '22023';
    END IF;

  ELSIF p_field_name = 'usn' THEN
    v_old_value := v_student.usn;
    v_normalized_new := UPPER(v_normalized_new);
    IF NOT (v_normalized_new ~* '^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$') THEN
      RAISE EXCEPTION 'USN must follow standard format (e.g., 1NT22CS001).' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE usn = v_normalized_new AND id <> v_student_id) THEN
      RAISE EXCEPTION 'USN % is already registered to another student.', v_normalized_new USING ERRCODE = '23505';
    END IF;

  ELSIF p_field_name = 'branch' THEN
    v_old_value := v_student.branch;
    IF v_normalized_new NOT IN ('CSE', 'ISE', 'AIML', 'AIDS', 'ECE', 'EEE', 'ME', 'CV', 'BT') THEN
      RAISE EXCEPTION 'Branch must be an accredited academic department.' USING ERRCODE = '22023';
    END IF;

  ELSIF p_field_name = 'academic_year' THEN
    v_old_value := v_student.academic_year::text;
    BEGIN
      v_year_int := v_normalized_new::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Academic year must be an integer between 1 and 4.' USING ERRCODE = '22023';
    END;
    IF v_year_int < 1 OR v_year_int > 4 THEN
      RAISE EXCEPTION 'Academic year must be between 1 and 4.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 5. Prevent no-op requests
  IF v_old_value = v_normalized_new THEN
    RAISE EXCEPTION 'Proposed value is identical to current profile value.' USING ERRCODE = '22023';
  END IF;

  -- 6. Insert pending request (partial unique index catches duplicate pending)
  BEGIN
    INSERT INTO public.profile_change_requests (
      student_id,
      field_name,
      old_value,
      new_value,
      reason,
      status
    ) VALUES (
      v_student_id,
      p_field_name,
      v_old_value,
      v_normalized_new,
      v_trimmed_reason,
      'pending'
    ) RETURNING id INTO v_request_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'A pending change request for % already exists. Wait for review before submitting another.', p_field_name USING ERRCODE = '23505';
  END;

  RETURN v_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.submit_profile_change_request(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_profile_change_request(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 5. TRANSACTIONAL RPC: approve_profile_change_request
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_profile_change_request(
  p_request_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_admin_id UUID;
  v_req public.profile_change_requests%ROWTYPE;
  v_student public.profiles%ROWTYPE;
  v_current_val TEXT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 1. Authorization check: requires manage_students or super_admin
  IF NOT (public.current_is_super_admin() OR public.current_has_permission('manage_students')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires manage_students permission.' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock request row FOR UPDATE
  SELECT * INTO v_req
  FROM public.profile_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile change request % not found.', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot approve request: Request is not pending (current status: %).', v_req.status USING ERRCODE = '22023';
  END IF;

  -- 3. Lock student profile row FOR UPDATE
  SELECT * INTO v_student
  FROM public.profiles
  WHERE id = v_req.student_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated student profile not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_student.registration_status <> 'approved' THEN
    RAISE EXCEPTION 'Cannot approve change request: Student registration is not approved.' USING ERRCODE = '22023';
  END IF;

  -- 4. STALE REQUEST GUARD:
  -- Explicitly compare the locked profile's current field value against request's recorded old_value.
  -- If mismatched, abort transaction immediately.
  IF v_req.field_name = 'full_name' THEN
    v_current_val := v_student.full_name;
  ELSIF v_req.field_name = 'usn' THEN
    v_current_val := v_student.usn;
  ELSIF v_req.field_name = 'branch' THEN
    v_current_val := v_student.branch;
  ELSIF v_req.field_name = 'academic_year' THEN
    v_current_val := v_student.academic_year::text;
  ELSE
    RAISE EXCEPTION 'Invalid field name in request: %', v_req.field_name USING ERRCODE = '22023';
  END IF;

  IF v_current_val IS DISTINCT FROM v_req.old_value THEN
    RAISE EXCEPTION 'Stale request: Current profile % (%) does not match request old_value (%). Profile was modified after this request was submitted.',
      v_req.field_name, v_current_val, v_req.old_value USING ERRCODE = '22023';
  END IF;

  -- If USN change, re-verify uniqueness against other profiles
  IF v_req.field_name = 'usn' THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE usn = v_req.new_value AND id <> v_req.student_id) THEN
      RAISE EXCEPTION 'USN % is already registered to another student.', v_req.new_value USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 5. Issue ephemeral transaction-scoped authorization token in public.profile_action_authorizations
  INSERT INTO public.profile_action_authorizations (
    xact_id,
    student_id,
    action_type,
    old_value,
    new_value,
    request_id
  ) VALUES (
    pg_current_xact_id()::text,
    v_req.student_id,
    'approve_profile_change',
    v_req.field_name || ':' || v_req.old_value,
    v_req.field_name || ':' || v_req.new_value,
    p_request_id
  );

  -- 6. Apply profile update (Trigger protect_profile_columns consumes the token via DELETE ... RETURNING 1)
  IF v_req.field_name = 'full_name' THEN
    UPDATE public.profiles SET full_name = v_req.new_value, updated_at = now() WHERE id = v_req.student_id;
  ELSIF v_req.field_name = 'usn' THEN
    UPDATE public.profiles SET usn = v_req.new_value, updated_at = now() WHERE id = v_req.student_id;
  ELSIF v_req.field_name = 'branch' THEN
    UPDATE public.profiles SET branch = v_req.new_value, updated_at = now() WHERE id = v_req.student_id;
  ELSIF v_req.field_name = 'academic_year' THEN
    UPDATE public.profiles SET academic_year = v_req.new_value::integer, updated_at = now() WHERE id = v_req.student_id;
  END IF;

  -- 7. Update change request record
  UPDATE public.profile_change_requests
  SET
    status = 'approved',
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    rejection_reason = NULL,
    updated_at = now()
  WHERE id = p_request_id;

  -- 8. Write immutable audit log
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_admin_id,
    CASE WHEN public.current_is_super_admin() THEN 'super_admin' ELSE 'admin' END,
    'student.profile_changed',
    'profile_change_request',
    p_request_id::text,
    jsonb_build_object(
      'student_id', v_req.student_id,
      'field_name', v_req.field_name,
      'old_value', v_req.old_value,
      'new_value', v_req.new_value,
      'reason', v_req.reason,
      'decision', 'approved'
    )
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.approve_profile_change_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_profile_change_request(UUID) TO authenticated;

-- ============================================================================
-- 6. TRANSACTIONAL RPC: reject_profile_change_request
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_profile_change_request(
  p_request_id UUID,
  p_rejection_reason TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_admin_id UUID;
  v_req public.profile_change_requests%ROWTYPE;
  v_trimmed_reason TEXT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 1. Authorization check: requires manage_students or super_admin
  IF NOT (public.current_is_super_admin() OR public.current_has_permission('manage_students')) THEN
    RAISE EXCEPTION 'Unauthorized: Requires manage_students permission.' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock request row FOR UPDATE
  SELECT * INTO v_req
  FROM public.profile_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile change request % not found.', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot reject request: Request is not pending (current status: %).', v_req.status USING ERRCODE = '22023';
  END IF;

  -- 3. Validate mandatory rejection reason
  v_trimmed_reason := TRIM(COALESCE(p_rejection_reason, ''));
  IF LENGTH(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Rejection reason must be at least 10 characters long.' USING ERRCODE = '22023';
  END IF;
  IF LENGTH(v_trimmed_reason) > 500 THEN
    RAISE EXCEPTION 'Rejection reason cannot exceed 500 characters.' USING ERRCODE = '22023';
  END IF;

  -- 4. Update request status to rejected
  UPDATE public.profile_change_requests
  SET
    status = 'rejected',
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    rejection_reason = v_trimmed_reason,
    updated_at = now()
  WHERE id = p_request_id;

  -- 5. Write immutable audit log
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_admin_id,
    CASE WHEN public.current_is_super_admin() THEN 'super_admin' ELSE 'admin' END,
    'student.profile_change_rejected',
    'profile_change_request',
    p_request_id::text,
    jsonb_build_object(
      'student_id', v_req.student_id,
      'field_name', v_req.field_name,
      'decision', 'rejected',
      'rejection_reason', v_trimmed_reason
    )
  );

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.reject_profile_change_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_profile_change_request(UUID, TEXT) TO authenticated;

-- ============================================================================
-- 7. SECURITY DEFINER RPC: get_team_roster (Teammate Privacy & Scoped Roster Access)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_team_roster(
  p_team_id UUID
)
RETURNS TABLE (
  id UUID,
  team_id UUID,
  student_id UUID,
  role TEXT,
  joined_at TIMESTAMPTZ,
  full_name TEXT,
  branch TEXT,
  academic_year INTEGER,
  profile_photo_path TEXT
) AS $$
#variable_conflict use_column
DECLARE
  v_caller_id UUID;
  v_team public.teams%ROWTYPE;
  v_is_authorized BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  -- 1. Fetch team to resolve hackathon_id
  SELECT * INTO v_team
  FROM public.teams t
  WHERE t.id = p_team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Authorization check:
  -- Caller MUST be an active enrolled member of this team,
  -- OR Super Admin,
  -- OR assigned administrator for this specific hackathon with manage_teams,
  -- OR global export_data auditor.
  -- General administrators with manage_teams who are NOT assigned to this hackathon are denied.
  v_is_authorized := (
    public.current_is_super_admin() OR
    public.can_admin_manage_hackathon(v_team.hackathon_id, 'manage_teams') OR
    public.current_has_permission('export_data') OR
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = p_team_id
        AND tm.student_id = v_caller_id
    )
  );

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Access denied: You must be a member of this team or an authorized administrator for this event.' USING ERRCODE = '42501';
  END IF;

  -- 3. Return sanitized projection of enrolled team members
  -- Excludes USN, phone, email, date_of_birth, sex, and college_id_path.
  RETURN QUERY
  SELECT
    tm.id,
    tm.team_id,
    tm.student_id,
    tm.role,
    tm.joined_at,
    p.full_name,
    p.branch,
    p.academic_year,
    p.profile_photo_path
  FROM public.team_members tm
  JOIN public.profiles p ON p.id = tm.student_id
  WHERE tm.team_id = p_team_id
  ORDER BY
    CASE WHEN tm.role = 'leader' THEN 0 ELSE 1 END,
    tm.joined_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.get_team_roster(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_roster(UUID) TO authenticated;

COMMIT;
