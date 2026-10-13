-- Migration 05: Submissions and Reviews
-- Created: 2026-10-12
-- Schema: public

-- 1. Table: public.submissions
CREATE TABLE public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL,
  round_id UUID NOT NULL,
  team_id UUID NOT NULL,
  submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NULL,
  repo_url TEXT NULL,
  demo_url TEXT NULL,
  evidence_path TEXT NULL,
  evidence_deleted_at TIMESTAMPTZ NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_submissions_team_composite FOREIGN KEY (team_id, hackathon_id) REFERENCES public.teams(id, hackathon_id) ON DELETE RESTRICT,
  CONSTRAINT fk_submissions_round_composite FOREIGN KEY (round_id, hackathon_id) REFERENCES public.hackathon_rounds(id, hackathon_id) ON DELETE RESTRICT,
  CONSTRAINT uq_submissions_composite UNIQUE (id, hackathon_id),
  CONSTRAINT uq_submission_version UNIQUE (round_id, team_id, version),
  CONSTRAINT chk_submissions_status CHECK (status IN ('submitted', 'under_review', 'accepted', 'rejected', 'revision_requested'))
);

CREATE TRIGGER trg_submissions_updated_at
BEFORE UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Column protection trigger for submissions
CREATE OR REPLACE FUNCTION public.protect_submission_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Immutable structural linkages and creation timestamp
  IF (OLD.hackathon_id <> NEW.hackathon_id OR
      OLD.round_id <> NEW.round_id OR
      OLD.team_id <> NEW.team_id OR
      OLD.submitted_by <> NEW.submitted_by OR
      OLD.created_at <> NEW.created_at) THEN
    RAISE EXCEPTION 'Cannot alter structural submission linkages (hackathon, round, team, submitted_by, created_at).';
  END IF;

  -- Non-admin updates cannot alter status or evidence_deleted_at
  IF NOT (
    public.current_has_permission('manage_hackathons') OR
    public.current_is_super_admin() OR
    (auth.role() IS NOT NULL AND auth.role() = 'service_role')
  ) THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'Students cannot alter submission review status.';
    END IF;
    IF OLD.evidence_deleted_at IS DISTINCT FROM NEW.evidence_deleted_at THEN
      RAISE EXCEPTION 'Students cannot alter evidence deletion timestamps.';
    END IF;
  END IF;

  -- Admin updates cannot alter student submission content (title, description, repos, evidence, version)
  IF (public.current_has_permission('manage_hackathons') OR public.current_is_super_admin()) AND NOT public.current_is_team_member(OLD.team_id) THEN
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

REVOKE ALL ON FUNCTION public.protect_submission_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_submission_columns() TO authenticated;

CREATE TRIGGER trg_protect_submission_columns
BEFORE UPDATE ON public.submissions
FOR EACH ROW EXECUTE FUNCTION public.protect_submission_columns();

-- 2. Table: public.submission_reviews
CREATE TABLE public.submission_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL,
  feedback TEXT NULL,
  score NUMERIC(5,2) NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_submission_reviews_decision CHECK (decision IN ('accepted', 'rejected', 'revision_requested')),
  CONSTRAINT chk_submission_reviews_score CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT uq_submission_reviewer UNIQUE (submission_id, reviewer_id)
);
