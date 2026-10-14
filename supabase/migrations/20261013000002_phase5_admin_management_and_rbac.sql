-- Migration 13: Phase 5 Role-Based Authorization and Admin Management RPCs
-- Created: 2026-10-13

-- ============================================================================
-- 1. BI-DIRECTIONAL STUDENT / ADMIN MUTUAL EXCLUSIVITY TRIGGERS
-- ============================================================================

-- Trigger Function 1: Prevent inserting or updating into admin_profiles if student exists
CREATE OR REPLACE FUNCTION public.check_no_student_as_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
BEGIN
  -- 1. Protect against primary key mutation on UPDATE
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Identity UUID is immutable and cannot be modified.';
  END IF;

  -- 2. Acquire transaction-scoped exclusive advisory locks on UUID and normalized email in strict ascending order
  FOR v_lock_key IN
    SELECT DISTINCT k
    FROM unnest(ARRAY[
      ('x' || substr(md5('nmit_identity_lock:' || NEW.id::text), 1, 16))::bit(64)::bigint,
      ('x' || substr(md5('nmit_email_lock:' || LOWER(TRIM(NEW.email))), 1, 16))::bit(64)::bigint,
      CASE WHEN TG_OP = 'UPDATE' AND OLD.email IS DISTINCT FROM NEW.email THEN
        ('x' || substr(md5('nmit_email_lock:' || LOWER(TRIM(OLD.email))), 1, 16))::bit(64)::bigint
      ELSE NULL END
    ]) AS k
    WHERE k IS NOT NULL
    ORDER BY k ASC
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  -- 3. Check if student profile exists for this Auth UUID
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Dual-identity violation: user ID % is already registered as a student participant.', NEW.id;
  END IF;

  -- 4. Check if email collides with an existing student
  IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))) THEN
    RAISE EXCEPTION 'Dual-identity collision: email % is already registered to an existing student participant.', NEW.email;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_dual_student_admin ON public.admin_profiles;
CREATE TRIGGER trg_prevent_dual_student_admin
BEFORE INSERT OR UPDATE OF id, email ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.check_no_student_as_admin();

-- Trigger Function 2: Prevent inserting or updating into profiles if admin exists
CREATE OR REPLACE FUNCTION public.check_no_admin_as_student()
RETURNS TRIGGER AS $$
DECLARE
  v_lock_key BIGINT;
BEGIN
  -- 1. Protect against primary key mutation on UPDATE
  IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Identity UUID is immutable and cannot be modified.';
  END IF;

  -- 2. Acquire transaction-scoped exclusive advisory locks on UUID and normalized email in strict ascending order
  FOR v_lock_key IN
    SELECT DISTINCT k
    FROM unnest(ARRAY[
      ('x' || substr(md5('nmit_identity_lock:' || NEW.id::text), 1, 16))::bit(64)::bigint,
      ('x' || substr(md5('nmit_email_lock:' || LOWER(TRIM(NEW.email))), 1, 16))::bit(64)::bigint,
      CASE WHEN TG_OP = 'UPDATE' AND OLD.email IS DISTINCT FROM NEW.email THEN
        ('x' || substr(md5('nmit_email_lock:' || LOWER(TRIM(OLD.email))), 1, 16))::bit(64)::bigint
      ELSE NULL END
    ]) AS k
    WHERE k IS NOT NULL
    ORDER BY k ASC
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  -- 3. Check if admin profile exists for this Auth UUID
  IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = NEW.id) THEN
    RAISE EXCEPTION 'Dual-identity violation: user ID % is already registered as an administrator.', NEW.id;
  END IF;

  -- 4. Check if email collides with an existing admin
  IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE LOWER(TRIM(email)) = LOWER(TRIM(NEW.email))) THEN
    RAISE EXCEPTION 'Dual-identity collision: email % is already registered to an existing administrator.', NEW.email;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_dual_admin_student ON public.profiles;
CREATE TRIGGER trg_prevent_dual_admin_student
BEFORE INSERT OR UPDATE OF id, email ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.check_no_admin_as_student();

-- ============================================================================
-- 2. TRANSACTIONAL ADMINISTRATOR PROVISIONING RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.provision_admin_profile(
  p_auth_uid UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_permissions TEXT[]
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_auth_email TEXT;
  v_normalized_email TEXT;
  v_trimmed_name TEXT;
  v_normalized_perms TEXT[] := ARRAY[]::TEXT[];
  v_perm TEXT;
  v_lock_key BIGINT;
BEGIN
  -- 1. Validate caller authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 2. Verify caller is an active Super Admin
  SELECT (is_super_admin = true AND is_active = true) INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only active Super Admin can provision new administrators.';
  END IF;

  -- 3. Fail-closed on arguments
  IF p_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: auth UID cannot be null.';
  END IF;

  IF p_email IS NULL OR TRIM(p_email) = '' OR LOWER(TRIM(p_email)) !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid argument: valid email address is mandatory.';
  END IF;

  v_trimmed_name := TRIM(COALESCE(p_full_name, ''));
  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Invalid argument: non-empty full name is mandatory.';
  END IF;

  IF p_permissions IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: permission list cannot be null. Provide an empty array for zero initial permissions.';
  END IF;

  -- 4. Authoritative Auth identity and email verification
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = p_auth_uid;

  IF NOT FOUND OR v_auth_email IS NULL THEN
    RAISE EXCEPTION 'Identity binding failure: Auth user % does not exist in auth.users.', p_auth_uid;
  END IF;

  -- Verify supplied email matches authoritative email on Auth record (case-insensitive)
  IF LOWER(TRIM(v_auth_email)) <> LOWER(TRIM(p_email)) THEN
    RAISE EXCEPTION 'Identity binding violation: supplied email % does not match authoritative Auth email % for user %.',
      LOWER(TRIM(p_email)), LOWER(TRIM(v_auth_email)), p_auth_uid;
  END IF;

  v_normalized_email := LOWER(TRIM(v_auth_email));

  -- 4.5. Acquire transaction-scoped exclusive advisory locks on UUID and normalized email in strict ascending order
  -- Serializes RPC collision pre-checks under the identical protocol prior to table insertion
  FOR v_lock_key IN
    SELECT DISTINCT k
    FROM unnest(ARRAY[
      ('x' || substr(md5('nmit_identity_lock:' || p_auth_uid::text), 1, 16))::bit(64)::bigint,
      ('x' || substr(md5('nmit_email_lock:' || v_normalized_email), 1, 16))::bit(64)::bigint
    ]) AS k
    WHERE k IS NOT NULL
    ORDER BY k ASC
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  -- 5. Mutual exclusivity check: target must not exist in public.profiles (by UUID or email)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_auth_uid) THEN
    RAISE EXCEPTION 'Dual-identity violation: user ID % is already registered as a student participant.', p_auth_uid;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(TRIM(email)) = v_normalized_email) THEN
    RAISE EXCEPTION 'Dual-identity collision: email % is already registered to an existing student participant.', v_normalized_email;
  END IF;

  -- 6. Uniqueness check in public.admin_profiles (by UUID or email)
  IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = p_auth_uid) THEN
    RAISE EXCEPTION 'Administrator conflict: user ID % is already registered as an administrator.', p_auth_uid;
  END IF;

  IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE LOWER(TRIM(email)) = v_normalized_email) THEN
    RAISE EXCEPTION 'Administrator conflict: email % is already registered to an administrator.', v_normalized_email;
  END IF;

  -- 7. Validate permission keys against canonical catalog
  FOREACH v_perm IN ARRAY p_permissions LOOP
    IF v_perm IS NULL THEN
      RAISE EXCEPTION 'Invalid argument: permission list cannot contain null elements.';
    END IF;

    IF v_perm NOT IN (
      'verify_students',
      'manage_password_resets',
      'manage_hackathons',
      'manage_teams',
      'manage_followups',
      'manage_students',
      'view_analytics',
      'export_data',
      'view_audit_logs',
      'manage_points'
    ) THEN
      RAISE EXCEPTION 'Invalid permission key: %', v_perm;
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), ARRAY[]::TEXT[]) INTO v_normalized_perms
  FROM unnest(p_permissions) p;

  -- 8. Atomically insert into admin_profiles using authoritative normalized email
  INSERT INTO public.admin_profiles (
    id,
    email,
    full_name,
    is_super_admin,
    is_active,
    created_by
  ) VALUES (
    p_auth_uid,
    v_normalized_email,
    v_trimmed_name,
    false,
    true,
    v_caller_id
  );

  -- 9. Atomically insert initial permissions
  IF cardinality(v_normalized_perms) > 0 THEN
    INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
    SELECT p_auth_uid, p, v_caller_id
    FROM unnest(v_normalized_perms) p;
  END IF;

  -- 10. Atomically insert structured audit log
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    'super_admin',
    'admin.created',
    'admin_profile',
    p_auth_uid::text,
    jsonb_build_object(
      'email', v_normalized_email,
      'full_name', v_trimmed_name,
      'initial_permissions', v_normalized_perms
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', p_auth_uid,
    'email', v_normalized_email,
    'permissions', v_normalized_perms
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.provision_admin_profile(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provision_admin_profile(UUID, TEXT, TEXT, TEXT[]) TO authenticated;

-- ============================================================================
-- 3. HARDENED MANAGE_ADMIN_PERMISSIONS RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.manage_admin_permissions(
  p_target_admin_id UUID,
  p_permissions TEXT[]
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_target_is_super BOOLEAN;
  v_target_active BOOLEAN;
  v_normalized_perms TEXT[] := ARRAY[]::TEXT[];
  v_old_perms TEXT[];
  v_added_perms TEXT[];
  v_removed_perms TEXT[];
  v_perm TEXT;
BEGIN
  -- 1. Validate caller authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 2. Verify caller is an active Super Admin
  SELECT (is_super_admin = true AND is_active = true) INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only active Super Admin can manage administrator permissions.';
  END IF;

  -- 3. Fail-closed on target admin validation
  IF p_target_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target administrator ID cannot be null.';
  END IF;

  -- 4. Fail-closed on NULL input array
  IF p_permissions IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: permission list cannot be null. Provide an empty array to revoke all permissions.';
  END IF;

  -- 5. Lock target admin row to serialize concurrent mutations
  SELECT is_super_admin, is_active INTO v_target_is_super, v_target_active
  FROM public.admin_profiles
  WHERE id = p_target_admin_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target administrator not found.';
  END IF;

  -- 6. Guard against editing Super Admin permissions
  IF v_target_is_super = true THEN
    RAISE EXCEPTION 'Permission mutation blocked: Super Admin permissions are implicit and cannot be edited.';
  END IF;

  -- 7. Validate elements and normalize (deduplicate and sort deterministically)
  FOREACH v_perm IN ARRAY p_permissions LOOP
    IF v_perm IS NULL THEN
      RAISE EXCEPTION 'Invalid argument: permission list cannot contain null elements.';
    END IF;

    IF v_perm NOT IN (
      'verify_students',
      'manage_password_resets',
      'manage_hackathons',
      'manage_teams',
      'manage_followups',
      'manage_students',
      'view_analytics',
      'export_data',
      'view_audit_logs',
      'manage_points'
    ) THEN
      RAISE EXCEPTION 'Invalid permission key: %', v_perm;
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), ARRAY[]::TEXT[]) INTO v_normalized_perms
  FROM unnest(p_permissions) p;

  -- 8. Capture current permissions deterministically
  SELECT COALESCE(array_agg(permission ORDER BY permission), ARRAY[]::TEXT[]) INTO v_old_perms
  FROM public.admin_permissions
  WHERE admin_id = p_target_admin_id;

  -- 9. Compute differences
  SELECT COALESCE(array_agg(p ORDER BY p), ARRAY[]::TEXT[]) INTO v_added_perms
  FROM unnest(v_normalized_perms) p
  WHERE p NOT IN (SELECT unnest(v_old_perms));

  SELECT COALESCE(array_agg(p ORDER BY p), ARRAY[]::TEXT[]) INTO v_removed_perms
  FROM unnest(v_old_perms) p
  WHERE p NOT IN (SELECT unnest(v_normalized_perms));

  -- 10. If no changes, return clean deterministic response without redundant audit writes
  IF cardinality(v_added_perms) = 0 AND cardinality(v_removed_perms) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'admin_id', p_target_admin_id,
      'permissions', v_normalized_perms,
      'status_unchanged', true
    );
  END IF;

  -- 11. Synchronize permissions atomically
  IF cardinality(v_removed_perms) > 0 THEN
    DELETE FROM public.admin_permissions
    WHERE admin_id = p_target_admin_id
      AND permission = ANY(v_removed_perms);
  END IF;

  IF cardinality(v_added_perms) > 0 THEN
    INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
    SELECT p_target_admin_id, p, v_caller_id
    FROM unnest(v_added_perms) p;
  END IF;

  -- 12. Write immutable audit log
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    'super_admin',
    'admin.permissions_updated',
    'admin_profile',
    p_target_admin_id::text,
    jsonb_build_object(
      'old_permissions', v_old_perms,
      'new_permissions', v_normalized_perms,
      'added', v_added_perms,
      'removed', v_removed_perms
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'admin_id', p_target_admin_id,
    'permissions', v_normalized_perms,
    'added', v_added_perms,
    'removed', v_removed_perms
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.manage_admin_permissions(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_admin_permissions(UUID, TEXT[]) TO authenticated;

-- ============================================================================
-- 4. HARDENED SET_ADMIN_ACTIVE_STATUS RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_admin_active_status(
  p_target_admin_id UUID,
  p_is_active BOOLEAN,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_target_is_super BOOLEAN;
  v_old_active BOOLEAN;
BEGIN
  -- 1. Validate caller authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 2. Verify caller is active Super Admin
  SELECT (is_super_admin = true AND is_active = true) INTO v_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_super IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: only active Super Admin can alter administrator account status.';
  END IF;

  -- 3. Fail-closed on arguments
  IF p_target_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target administrator ID cannot be null.';
  END IF;

  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: is_active status cannot be null.';
  END IF;

  IF TRIM(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A non-empty reason is mandatory for administrator status changes.';
  END IF;

  -- 4. Lock target admin row
  SELECT is_super_admin, is_active INTO v_target_is_super, v_old_active
  FROM public.admin_profiles
  WHERE id = p_target_admin_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target administrator not found.';
  END IF;

  -- 5. Guard against self-deactivation
  IF p_target_admin_id = v_caller_id THEN
    RAISE EXCEPTION 'Action blocked: Super Admin cannot deactivate or alter their own account status.';
  END IF;

  -- 6. Guard against altering Super Admin row
  IF v_target_is_super = true THEN
    RAISE EXCEPTION 'Action blocked: Super Admin account status cannot be modified via administrative RPC.';
  END IF;

  -- 7. No-op check
  IF v_old_active = p_is_active THEN
    RETURN jsonb_build_object('success', true, 'status_unchanged', true);
  END IF;

  -- 8. Update status
  UPDATE public.admin_profiles
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_target_admin_id;

  -- 9. Write immutable audit log
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    'super_admin',
    'admin.deactivated'::text,
    'admin_profile',
    p_target_admin_id::text,
    jsonb_build_object(
      'previous_status', v_old_active,
      'new_status', p_is_active,
      'reason', TRIM(p_reason)
    )
  );

  RETURN jsonb_build_object('success', true, 'admin_id', p_target_admin_id, 'is_active', p_is_active);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.set_admin_active_status(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_admin_active_status(UUID, BOOLEAN, TEXT) TO authenticated;

-- ============================================================================
-- 5. DEDICATED SUPER ADMIN BOOTSTRAP RPC (SERVICE-ROLE EXCLUSIVE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(
  p_auth_uid UUID,
  p_email TEXT,
  p_full_name TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_auth_email TEXT;
  v_normalized_email TEXT;
  v_trimmed_name TEXT;
  v_existing_super_id UUID;
  v_existing_super_active BOOLEAN;
  v_existing_target_is_super BOOLEAN;
  v_existing_target_is_active BOOLEAN;
  v_lock_key BIGINT;
BEGIN
  -- 1. Trust boundary: verify execution context is service_role or DB superuser
  IF current_setting('request.jwt.claim.role', true) <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: bootstrap_super_admin is restricted to service_role authority.';
  END IF;

  -- 2. Validate arguments fail-closed
  IF p_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: auth UID cannot be null.';
  END IF;

  IF p_email IS NULL OR TRIM(p_email) = '' THEN
    RAISE EXCEPTION 'Invalid argument: email cannot be null or empty.';
  END IF;

  v_trimmed_name := TRIM(COALESCE(p_full_name, ''));
  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Invalid argument: full name cannot be empty.';
  END IF;

  -- 3. Authoritative Auth identity and email verification
  SELECT email INTO v_auth_email
  FROM auth.users
  WHERE id = p_auth_uid;

  IF NOT FOUND OR v_auth_email IS NULL THEN
    RAISE EXCEPTION 'Identity binding failure: Auth user % does not exist in auth.users.', p_auth_uid;
  END IF;

  IF LOWER(TRIM(v_auth_email)) <> LOWER(TRIM(p_email)) THEN
    RAISE EXCEPTION 'Identity binding violation: supplied email % does not match authoritative Auth email % for user %.',
      LOWER(TRIM(p_email)), LOWER(TRIM(v_auth_email)), p_auth_uid;
  END IF;

  v_normalized_email := LOWER(TRIM(v_auth_email));

  -- 4. Concurrency control: acquire transaction-scoped exclusive advisory locks in strict ascending numerical order
  -- Includes dedicated system bootstrap lock, identity lock, and email lock
  FOR v_lock_key IN
    SELECT DISTINCT k
    FROM unnest(ARRAY[
      ('x' || substr(md5('nmit_system_bootstrap_lock'), 1, 16))::bit(64)::bigint,
      ('x' || substr(md5('nmit_identity_lock:' || p_auth_uid::text), 1, 16))::bit(64)::bigint,
      ('x' || substr(md5('nmit_email_lock:' || v_normalized_email), 1, 16))::bit(64)::bigint
    ]) AS k
    WHERE k IS NOT NULL
    ORDER BY k ASC
  LOOP
    PERFORM pg_advisory_xact_lock(v_lock_key);
  END LOOP;

  -- 5. Inspect existing Super Admin state in the database
  SELECT id, is_active INTO v_existing_super_id, v_existing_super_active
  FROM public.admin_profiles
  WHERE is_super_admin = true
  LIMIT 1;

  IF v_existing_super_id IS NOT NULL THEN
    -- A Super Admin record already exists in the system
    IF v_existing_super_id = p_auth_uid AND v_existing_super_active = true THEN
      -- Outcome 2: Retry after successful bootstrap with identical active identity
      -- Return safe, explicit already-bootstrapped result WITHOUT modifying data or appending audit logs
      RETURN jsonb_build_object(
        'success', true,
        'status', 'already_bootstrapped',
        'admin_id', p_auth_uid,
        'email', v_normalized_email,
        'message', 'Super Admin identity already established; no mutations applied.'
      );
    ELSIF v_existing_super_id = p_auth_uid AND v_existing_super_active = false THEN
      -- Outcome 5: Existing inactive or demoted Super Admin cannot be recovered via bootstrap
      RAISE EXCEPTION 'Bootstrap denied: Super Admin identity % is inactive or demoted. Use recover_super_admin_identity for disaster recovery.', p_auth_uid;
    ELSE
      -- A distinct Super Admin already exists in the system
      RAISE EXCEPTION 'Bootstrap denied: an active or initialized Super Admin already exists in the system (existing ID: %).', v_existing_super_id;
    END IF;
  END IF;

  -- 6. Check if target p_auth_uid already exists in public.admin_profiles as an ordinary admin
  SELECT is_super_admin, is_active INTO v_existing_target_is_super, v_existing_target_is_active
  FROM public.admin_profiles
  WHERE id = p_auth_uid;

  IF FOUND THEN
    -- Outcome 4: Existing ordinary admin must NEVER be elevated to Super Admin via bootstrap!
    RAISE EXCEPTION 'Privilege escalation blocked: identity % already exists as an ordinary administrator and cannot be elevated via bootstrap.', p_auth_uid;
  END IF;

  -- 7. Check if target email already exists in public.admin_profiles under another ID
  IF EXISTS (SELECT 1 FROM public.admin_profiles WHERE LOWER(TRIM(email)) = v_normalized_email) THEN
    RAISE EXCEPTION 'Identity collision: email % is already registered to an existing administrator.', v_normalized_email;
  END IF;

  -- 8. Mutual exclusivity checks: target must NOT exist in public.profiles (Student)
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_auth_uid) THEN
    RAISE EXCEPTION 'Dual-identity violation: user ID % is already registered as a student participant.', p_auth_uid;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE LOWER(TRIM(email)) = v_normalized_email) THEN
    RAISE EXCEPTION 'Dual-identity collision: email % is already registered to an existing student participant.', v_normalized_email;
  END IF;

  -- 9. Insert Super Admin profile (Outcome 1: First bootstrap)
  -- Plain INSERT without ON CONFLICT DO UPDATE — guarantees zero accidental overwrite or elevation!
  -- Note: Super Admin possesses implicit authorization for all platform capabilities; no rows are inserted into public.admin_permissions.
  INSERT INTO public.admin_profiles (
    id,
    email,
    full_name,
    is_super_admin,
    is_active,
    created_by
  ) VALUES (
    p_auth_uid,
    v_normalized_email,
    v_trimmed_name,
    true,
    true,
    NULL
  );

  -- 10. Write structured audit log with actor_id = NULL and actor_role = 'system_bootstrap'
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    NULL,
    'system_bootstrap',
    'super_admin.provisioned',
    'admin_profile',
    p_auth_uid::text,
    jsonb_build_object(
      'email', v_normalized_email,
      'full_name', v_trimmed_name,
      'method', 'service_role_bootstrap_rpc',
      'executed_by', 'system_operator'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'bootstrapped',
    'admin_id', p_auth_uid,
    'email', v_normalized_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.bootstrap_super_admin(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_super_admin(UUID, TEXT, TEXT) TO service_role;

-- ============================================================================
-- 6. REPLACEMENT AUTHORIZATION HELPER: current_has_permission(TEXT)
-- ============================================================================

-- Replaces the Phase 3 helper (which strictly joined admin_permissions) to grant
-- implicit authorization to active Super Admins without rows in admin_permissions,
-- while requiring an explicit matching permission row for ordinary active Admins,
-- and returning false for inactive administrators, students, and unauthenticated callers.
CREATE OR REPLACE FUNCTION public.current_has_permission(p_permission_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
BEGIN
  IF auth.uid() IS NULL OR p_permission_key IS NULL THEN
    RETURN false;
  END IF;

  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = auth.uid();

  IF v_is_active IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF v_is_super IS TRUE THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.admin_permissions
    WHERE admin_id = auth.uid()
      AND permission = p_permission_key
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.current_has_permission(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_has_permission(TEXT) TO authenticated;
