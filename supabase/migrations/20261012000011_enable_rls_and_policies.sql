-- Migration 11: Enable RLS, Public Table Policies, Storage Policies, and SQL Grants
-- Created: 2026-10-12
-- Schema: public, storage

-- ============================================================================
-- 1. ENABLE AND FORCE ROW LEVEL SECURITY ON ALL 15 APPLICATION TABLES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathons FORCE ROW LEVEL SECURITY;

ALTER TABLE public.hackathon_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathon_rounds FORCE ROW LEVEL SECURITY;

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams FORCE ROW LEVEL SECURITY;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members FORCE ROW LEVEL SECURITY;

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.submission_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_reviews FORCE ROW LEVEL SECURITY;

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results FORCE ROW LEVEL SECURITY;

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger FORCE ROW LEVEL SECURITY;

ALTER TABLE public.point_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_configurations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profile_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_change_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE public.storage_deletion_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_deletion_queue FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. SQL TABLE GRANTS (NARROWLY SCOPED LEAST-PRIVILEGE MODEL)
-- ============================================================================

-- Table 1: profiles
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- Table 2: admin_profiles
REVOKE ALL ON TABLE public.admin_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.admin_profiles TO authenticated;

-- Table 3: admin_permissions
REVOKE ALL ON TABLE public.admin_permissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.admin_permissions TO authenticated;

-- Table 4: hackathons
REVOKE ALL ON TABLE public.hackathons FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.hackathons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.hackathons TO authenticated;

-- Table 5: hackathon_rounds
REVOKE ALL ON TABLE public.hackathon_rounds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.hackathon_rounds TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.hackathon_rounds TO authenticated;

-- Table 6: teams
REVOKE ALL ON TABLE public.teams FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.teams TO anon, authenticated;

-- Table 7: team_members
REVOKE ALL ON TABLE public.team_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.team_members TO anon, authenticated;

-- Table 8: submissions
REVOKE ALL ON TABLE public.submissions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.submissions TO authenticated;

-- Table 9: submission_reviews
REVOKE ALL ON TABLE public.submission_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.submission_reviews TO authenticated;

-- Table 10: results
REVOKE ALL ON TABLE public.results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.results TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.results TO authenticated;

-- Table 11: points_ledger
REVOKE ALL ON TABLE public.points_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.points_ledger TO authenticated;

-- Table 12: point_configurations
REVOKE ALL ON TABLE public.point_configurations FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON TABLE public.point_configurations TO authenticated;

-- Table 13: audit_logs
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- Table 14: profile_change_requests
REVOKE ALL ON TABLE public.profile_change_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profile_change_requests TO authenticated;

-- Table 15: storage_deletion_queue
REVOKE ALL ON TABLE public.storage_deletion_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.storage_deletion_queue TO service_role;

-- ============================================================================
-- 3. ROW-LEVEL SECURITY POLICIES FOR APPLICATION TABLES
-- ============================================================================

-- Table 1: profiles
CREATE POLICY profiles_select_student ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY profiles_select_admin ON public.profiles
FOR SELECT TO authenticated
USING (
  public.current_has_permission('verify_students') OR
  public.current_has_permission('manage_students') OR
  public.current_is_super_admin()
);

CREATE POLICY profiles_update_student ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_admin ON public.profiles
FOR UPDATE TO authenticated
USING (
  public.current_has_permission('verify_students') OR
  public.current_has_permission('manage_students') OR
  public.current_is_super_admin()
)
WITH CHECK (true);

-- Table 2: admin_profiles
CREATE POLICY admin_profiles_select_own ON public.admin_profiles
FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY admin_profiles_select_super ON public.admin_profiles
FOR SELECT TO authenticated
USING (public.current_is_super_admin());

CREATE POLICY admin_profiles_update_super ON public.admin_profiles
FOR UPDATE TO authenticated
USING (public.current_is_super_admin())
WITH CHECK (public.current_is_super_admin());

-- Table 3: admin_permissions
CREATE POLICY admin_permissions_select_own ON public.admin_permissions
FOR SELECT TO authenticated
USING (admin_id = auth.uid());

CREATE POLICY admin_permissions_select_super ON public.admin_permissions
FOR SELECT TO authenticated
USING (public.current_is_super_admin());

CREATE POLICY admin_permissions_insert_super ON public.admin_permissions
FOR INSERT TO authenticated
WITH CHECK (public.current_is_super_admin());

CREATE POLICY admin_permissions_delete_super ON public.admin_permissions
FOR DELETE TO authenticated
USING (public.current_is_super_admin());

-- Table 4: hackathons
CREATE POLICY hackathons_select_published ON public.hackathons
FOR SELECT
USING (status IN ('published', 'registration_closed', 'ongoing', 'completed'));

CREATE POLICY hackathons_admin_manage ON public.hackathons
FOR ALL TO authenticated
USING (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
)
WITH CHECK (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
);

-- Table 5: hackathon_rounds
CREATE POLICY hackathon_rounds_select_visible ON public.hackathon_rounds
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.hackathons h
    WHERE h.id = hackathon_id AND h.status <> 'draft'
  )
);

CREATE POLICY hackathon_rounds_admin_manage ON public.hackathon_rounds
FOR ALL TO authenticated
USING (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
)
WITH CHECK (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
);

-- Table 6: teams
CREATE POLICY teams_select_completed ON public.teams
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.hackathons h
    WHERE h.id = hackathon_id AND h.status = 'completed'
  )
);

CREATE POLICY teams_select_member ON public.teams
FOR SELECT TO authenticated
USING (public.current_is_team_member(id));

CREATE POLICY teams_select_admin ON public.teams
FOR SELECT TO authenticated
USING (
  public.current_has_permission('manage_teams') OR
  public.current_is_super_admin()
);

-- Table 7: team_members
CREATE POLICY team_members_select_completed ON public.team_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.hackathons h
    WHERE h.id = hackathon_id AND h.status = 'completed'
  )
);

CREATE POLICY team_members_select_member ON public.team_members
FOR SELECT TO authenticated
USING (public.current_is_team_member(team_id));

CREATE POLICY team_members_select_admin ON public.team_members
FOR SELECT TO authenticated
USING (
  public.current_has_permission('manage_teams') OR
  public.current_is_super_admin()
);

-- Table 8: submissions
CREATE POLICY submissions_select_member ON public.submissions
FOR SELECT TO authenticated
USING (public.current_is_team_member(team_id));

CREATE POLICY submissions_select_admin ON public.submissions
FOR SELECT TO authenticated
USING (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
);

CREATE POLICY submissions_insert_member ON public.submissions
FOR INSERT TO authenticated
WITH CHECK (
  public.current_is_team_member(team_id) AND
  EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.id = round_id AND r.status = 'open' AND now() <= r.end_at
  )
);

CREATE POLICY submissions_update_student ON public.submissions
FOR UPDATE TO authenticated
USING (
  public.current_is_team_member(team_id) AND
  status IN ('submitted', 'revision_requested') AND
  EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.id = round_id AND r.status = 'open' AND now() <= r.end_at
  )
)
WITH CHECK (
  public.current_is_team_member(team_id) AND
  status IN ('submitted', 'revision_requested')
);

CREATE POLICY submissions_update_admin ON public.submissions
FOR UPDATE TO authenticated
USING (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
)
WITH CHECK (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
);

-- Table 9: submission_reviews
CREATE POLICY submission_reviews_select_published ON public.submission_reviews
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.results r
    WHERE r.hackathon_id = (SELECT s.hackathon_id FROM public.submissions s WHERE s.id = submission_id)
      AND r.is_published = true
  ) AND
  public.current_is_team_member((SELECT s.team_id FROM public.submissions s WHERE s.id = submission_id))
);

CREATE POLICY submission_reviews_admin_manage ON public.submission_reviews
FOR ALL TO authenticated
USING (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
)
WITH CHECK (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
);

-- Table 10: results
CREATE POLICY results_select_published ON public.results
FOR SELECT
USING (is_published = true);

CREATE POLICY results_admin_manage ON public.results
FOR ALL TO authenticated
USING (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
)
WITH CHECK (
  public.current_has_permission('manage_hackathons') OR
  public.current_is_super_admin()
);

-- Table 11: points_ledger
CREATE POLICY points_ledger_select_student ON public.points_ledger
FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY points_ledger_select_admin ON public.points_ledger
FOR SELECT TO authenticated
USING (
  public.current_has_permission('view_analytics') OR
  public.current_has_permission('manage_points') OR
  public.current_is_super_admin()
);

-- Table 12: point_configurations
CREATE POLICY point_configurations_select ON public.point_configurations
FOR SELECT TO authenticated
USING (true);

CREATE POLICY point_configurations_update_super ON public.point_configurations
FOR UPDATE TO authenticated
USING (public.current_is_super_admin())
WITH CHECK (public.current_is_super_admin());

-- Table 13: audit_logs
CREATE POLICY audit_logs_select_admin ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.current_has_permission('view_audit_logs') OR
  public.current_is_super_admin()
);

-- Table 14: profile_change_requests
CREATE POLICY profile_change_requests_select_student ON public.profile_change_requests
FOR SELECT TO authenticated
USING (student_id = auth.uid());

CREATE POLICY profile_change_requests_insert_student ON public.profile_change_requests
FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY profile_change_requests_select_admin ON public.profile_change_requests
FOR SELECT TO authenticated
USING (
  public.current_has_permission('manage_students') OR
  public.current_is_super_admin()
);

CREATE POLICY profile_change_requests_update_admin ON public.profile_change_requests
FOR UPDATE TO authenticated
USING (
  public.current_has_permission('manage_students') OR
  public.current_is_super_admin()
)
WITH CHECK (
  public.current_has_permission('manage_students') OR
  public.current_is_super_admin()
);

-- Table 15: storage_deletion_queue
CREATE POLICY storage_deletion_queue_service_role ON public.storage_deletion_queue
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 4. STORAGE OBJECT ROW-LEVEL SECURITY POLICIES (storage.objects)
-- ============================================================================

-- college-ids bucket policies
CREATE POLICY "college_ids_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'college-ids' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "college_ids_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'college-ids' AND (
    auth.uid()::text = (storage.foldername(name))[1] OR
    public.current_has_permission('verify_students') OR
    public.current_is_super_admin()
  )
);

-- profile-photos bucket policies
CREATE POLICY "profile_photos_insert_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "profile_photos_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'profile-photos');

CREATE POLICY "profile_photos_delete_own" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'profile-photos' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- submission-evidence bucket policies
CREATE POLICY "submission_evidence_insert_member" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'submission-evidence' AND
  (storage.foldername(name))[1] = 'teams' AND
  (storage.foldername(name))[3] = 'rounds' AND
  public.current_is_team_member(((storage.foldername(name))[2])::uuid) AND
  EXISTS (
    SELECT 1 FROM public.hackathon_rounds r
    WHERE r.id = ((storage.foldername(name))[4])::uuid
      AND r.status = 'open'
      AND now() <= r.end_at
  )
);

CREATE POLICY "submission_evidence_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'submission-evidence' AND
  (storage.foldername(name))[1] = 'teams' AND (
    public.current_is_team_member(((storage.foldername(name))[2])::uuid) OR
    public.current_has_permission('manage_hackathons') OR
    public.current_is_super_admin()
  )
);
