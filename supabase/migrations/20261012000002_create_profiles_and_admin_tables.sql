-- Migration 02: Profiles, Admin Profiles, and Administrative Permissions
-- Created: 2026-10-12
-- Schema: public

-- 1. Table: public.admin_profiles
CREATE TABLE public.admin_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At-most-one Super Admin partial unique index
CREATE UNIQUE INDEX uq_single_super_admin ON public.admin_profiles (is_super_admin) WHERE (is_super_admin = true);

-- Updated_at trigger for admin_profiles
CREATE TRIGGER trg_admin_profiles_updated_at
BEFORE UPDATE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Exactly-one active Super Admin verification at commit
CREATE OR REPLACE FUNCTION public.verify_single_active_super_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_active_super_admins INT;
BEGIN
  SELECT COUNT(*) INTO v_active_super_admins
  FROM public.admin_profiles
  WHERE is_super_admin = true AND is_active = true;

  IF v_active_super_admins <> 1 THEN
    RAISE EXCEPTION 'Administrative invariant violation: system must have exactly 1 active Super Admin at transaction commit (found %).', v_active_super_admins;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_verify_single_active_super_admin
AFTER INSERT OR UPDATE OR DELETE ON public.admin_profiles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.verify_single_active_super_admin();

-- Prevent direct deletion of Super Admin
CREATE OR REPLACE FUNCTION public.prevent_super_admin_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_super_admin = true THEN
    RAISE EXCEPTION 'Deletion blocked: Super Admin accounts cannot be deleted directly. Perform an authorized disaster recovery transition first.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_super_admin_deletion
BEFORE DELETE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_super_admin_deletion();

-- Protect admin_profiles against unauthorized role and status modification
CREATE OR REPLACE FUNCTION public.protect_admin_profiles()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.is_super_admin IS DISTINCT FROM NEW.is_super_admin OR
      OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    IF NOT (public.current_is_super_admin() OR session_user IN ('postgres', 'supabase_admin') OR auth.role() = 'service_role') THEN
      RAISE EXCEPTION 'Privilege escalation blocked: only Super Admin or database administrator can alter administrator roles or status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_protect_admin_profiles
BEFORE UPDATE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_profiles();

-- 2. Table: public.admin_permissions
CREATE TABLE public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_admin_permission UNIQUE (admin_id, permission),
  CONSTRAINT chk_admin_permissions_key CHECK (permission IN (
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
  ))
);

-- 3. Table: public.profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  usn TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  branch TEXT NOT NULL,
  academic_year INTEGER NOT NULL,
  profile_photo_path TEXT NULL,
  college_id_path TEXT NULL,
  college_id_deleted_at TIMESTAMPTZ NULL,
  registration_status TEXT NOT NULL DEFAULT 'draft',
  rejection_reason TEXT NULL,
  reviewed_by UUID NULL REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_profiles_usn_format CHECK (usn ~* '^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$'),
  CONSTRAINT chk_profiles_academic_year CHECK (academic_year BETWEEN 1 AND 4),
  CONSTRAINT chk_profiles_status CHECK (registration_status IN ('draft', 'pending_verification', 'under_review', 'approved', 'rejected', 'suspended'))
);

CREATE INDEX idx_profiles_email ON public.profiles (LOWER(TRIM(email)));
CREATE INDEX idx_profiles_status ON public.profiles (registration_status);
CREATE INDEX idx_profiles_branch_year ON public.profiles (branch, academic_year);

-- Updated_at trigger for profiles
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Normalize USN trigger function and trigger
CREATE OR REPLACE FUNCTION public.normalize_profile_usn()
RETURNS TRIGGER AS $$
BEGIN
  NEW.usn := UPPER(TRIM(NEW.usn));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.normalize_profile_usn() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_profile_usn() TO authenticated;

CREATE TRIGGER trg_profiles_normalize_usn
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_usn();

-- Protect profile columns trigger function and trigger
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER AS $$
DECLARE
  v_is_super_or_service BOOLEAN;
  v_is_admin_or_service BOOLEAN;
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
      RAISE EXCEPTION 'Unauthorized column modification: registration_status and review metadata can only be updated by authorized administrators.';
    END IF;
  END IF;

  -- 3. Approved student details frozen against direct modification
  IF OLD.registration_status = 'approved' AND NOT v_is_super_or_service THEN
    IF (OLD.usn IS DISTINCT FROM NEW.usn OR
        OLD.full_name IS DISTINCT FROM NEW.full_name OR
        OLD.branch IS DISTINCT FROM NEW.branch OR
        OLD.academic_year IS DISTINCT FROM NEW.academic_year OR
        OLD.college_id_path IS DISTINCT FROM NEW.college_id_path) THEN
      RAISE EXCEPTION 'Approved student details cannot be modified directly. Submit a profile change request.';
    END IF;
  END IF;

  -- 4. College ID storage path protection
  IF OLD.college_id_path IS DISTINCT FROM NEW.college_id_path THEN
    IF NOT v_is_admin_or_service THEN
      IF NEW.college_id_path IS NULL THEN
        IF OLD.registration_status IN ('under_review', 'approved') THEN
          RAISE EXCEPTION 'College ID cannot be removed while registration is under review or approved.';
        END IF;
      ELSE
        -- 4a. Path must reside within student's own folder
        IF NOT (NEW.college_id_path LIKE (NEW.id::text || '/%')) THEN
          RAISE EXCEPTION 'Unauthorized college_id_path: storage object path must reside in student folder.';
        END IF;

        -- 4b. Object must actually exist in college-ids bucket, reside in permitted folder, and be owned by student
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

  -- 5. Profile photo storage path protection
  IF OLD.profile_photo_path IS DISTINCT FROM NEW.profile_photo_path THEN
    IF NOT v_is_admin_or_service THEN
      IF NEW.profile_photo_path IS NOT NULL THEN
        -- 5a. Path must reside within student's own folder
        IF NOT (NEW.profile_photo_path LIKE (NEW.id::text || '/%')) THEN
          RAISE EXCEPTION 'Unauthorized profile_photo_path: storage object path must reside in student folder.';
        END IF;

        -- 5b. Object must actually exist in profile-photos bucket, reside in permitted folder, and be owned by student
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

CREATE TRIGGER trg_protect_profile_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();
