-- Migration: 20261101000005_submission_guard_reviewer_authority.sql
-- protect_submission_columns still gated review-status changes on the old global
-- manage_hackathons permission. Since the reviewer model was decoupled (an admin is
-- authorized to review a hackathon through hackathon_admin_assignments, checked by
-- can_admin_review_hackathon), an assigned reviewer's review_round_submission call was
-- rejected with "Students cannot alter submission review status."
-- Review authority is now: Super Admin, an admin who can review this hackathon, or the
-- service role. All other protections are unchanged.

CREATE OR REPLACE FUNCTION public.protect_submission_columns()
RETURNS TRIGGER AS $$
DECLARE
  v_is_reviewer boolean;
BEGIN
  -- Immutable structural linkages and creation timestamp
  IF (OLD.hackathon_id <> NEW.hackathon_id OR
      OLD.round_id <> NEW.round_id OR
      OLD.team_id <> NEW.team_id OR
      OLD.submitted_by <> NEW.submitted_by OR
      OLD.created_at <> NEW.created_at) THEN
    RAISE EXCEPTION 'Cannot alter structural submission linkages (hackathon, round, team, submitted_by, created_at).';
  END IF;

  v_is_reviewer := public.current_is_super_admin()
    OR public.can_admin_review_hackathon(OLD.hackathon_id);

  -- Non-reviewer updates cannot alter review status, evidence_deleted_at, or evidence_lifecycle_state
  IF NOT (
    v_is_reviewer OR
    (auth.role() IS NOT NULL AND auth.role() = 'service_role')
  ) THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'Students cannot alter submission review status.';
    END IF;
    IF OLD.evidence_deleted_at IS DISTINCT FROM NEW.evidence_deleted_at THEN
      RAISE EXCEPTION 'Students cannot alter evidence deletion timestamps.';
    END IF;
    IF OLD.evidence_lifecycle_state IS DISTINCT FROM NEW.evidence_lifecycle_state AND NEW.evidence_lifecycle_state NOT IN ('uploaded') THEN
      RAISE EXCEPTION 'Students cannot alter terminal evidence lifecycle states.';
    END IF;
  END IF;

  -- Reviewers cannot alter student submission content (title, description, repos, evidence_path, version)
  IF v_is_reviewer AND NOT public.current_is_team_member(OLD.team_id) THEN
    IF (OLD.title IS DISTINCT FROM NEW.title OR
        OLD.description IS DISTINCT FROM NEW.description OR
        OLD.repo_url IS DISTINCT FROM NEW.repo_url OR
        OLD.demo_url IS DISTINCT FROM NEW.demo_url OR
        OLD.evidence_path IS DISTINCT FROM NEW.evidence_path OR
        OLD.version IS DISTINCT FROM NEW.version) THEN
      RAISE EXCEPTION 'Administrators cannot modify student submission payload; only review status and administrative metadata may be updated.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
