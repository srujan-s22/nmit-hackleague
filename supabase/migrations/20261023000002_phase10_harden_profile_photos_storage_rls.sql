-- ============================================================================
-- Migration: 20261023000002_phase10_harden_profile_photos_storage_rls.sql
-- Description: Phase 10 Audit Remediation — Properly Scoped Storage RLS Policy
--              for private 'profile-photos' bucket.
-- ============================================================================

BEGIN;

-- 1. Helper function: public.can_view_profile_photo
-- Determines if the calling user is authorized to read an avatar object
-- belonging to target student p_student_id_text.
-- Bypasses table-level RLS safely with SECURITY DEFINER and strict search_path.
-- Does NOT query storage.objects, preventing recursive RLS.
CREATE OR REPLACE FUNCTION public.can_view_profile_photo(
  p_student_id_text TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_caller_id UUID;
  v_target_student_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN false;
  END IF;

  -- Validate target student ID format (fail-closed against path traversal or malformed input)
  IF p_student_id_text IS NULL OR p_student_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  v_target_student_id := p_student_id_text::uuid;

  -- 1. Owner: Student reading their own profile photo
  IF v_caller_id = v_target_student_id THEN
    RETURN true;
  END IF;

  -- 2. Super Administrator
  IF public.current_is_super_admin() THEN
    RETURN true;
  END IF;

  -- 3. Institutional Administrators with relevant student permissions
  IF public.current_has_permission('manage_students') OR
     public.current_has_permission('verify_students') OR
     public.current_has_permission('export_data') THEN
    RETURN true;
  END IF;

  -- 4. Teammate: Caller and target student are co-enrolled in at least one team
  IF EXISTS (
    SELECT 1
    FROM public.team_members tm_caller
    JOIN public.team_members tm_target ON tm_target.team_id = tm_caller.team_id
    WHERE tm_caller.student_id = v_caller_id
      AND tm_target.student_id = v_target_student_id
  ) THEN
    RETURN true;
  END IF;

  -- 5. Assigned Hackathon Administrator: Admin assigned to an event the student is participating in
  IF EXISTS (
    SELECT 1
    FROM public.team_members tm_target
    JOIN public.teams t ON t.id = tm_target.team_id
    WHERE tm_target.student_id = v_target_student_id
      AND (
        public.can_admin_manage_hackathon(t.hackathon_id, 'manage_teams') OR
        public.can_admin_manage_hackathon(t.hackathon_id, 'manage_hackathons')
      )
  ) THEN
    RETURN true;
  END IF;

  -- Fail-closed default: unrelated authenticated users denied
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.can_view_profile_photo(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile_photo(TEXT) TO authenticated;

-- 2. Replace broad profile_photos_select policy on storage.objects
DROP POLICY IF EXISTS "profile_photos_select" ON storage.objects;

CREATE POLICY "profile_photos_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  public.can_view_profile_photo((storage.foldername(name))[1])
);

COMMIT;
