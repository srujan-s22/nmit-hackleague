-- Migration 20: Phase 8 Round Tracking, Evidence Review, and Storage Retention
-- Created: 2026-10-21
-- Authoritative Specification: PHASE_08_IMPLEMENTATION_PLAN.md v1.1.4

-- ============================================================================
-- 1. FAIL-SAFE PREFLIGHT SANITY VERIFICATION BLOCK
-- ============================================================================
DO $$
DECLARE
  v_dup_versions INT;
  v_invalid_versions INT;
  v_version_gaps INT;
  v_inconsistent_parents INT;
  v_dup_current INT;
  r RECORD;
BEGIN
  -- Check 1: Duplicate version numbers per (round_id, team_id)
  SELECT COUNT(*) INTO v_dup_versions
  FROM (
    SELECT round_id, team_id, version, COUNT(*)
    FROM public.submissions
    GROUP BY round_id, team_id, version
    HAVING COUNT(*) > 1
  ) dups;

  IF v_dup_versions > 0 THEN
    FOR r IN (
      SELECT round_id, team_id, version, COUNT(*) as cnt
      FROM public.submissions
      GROUP BY round_id, team_id, version
      HAVING COUNT(*) > 1
    ) LOOP
      RAISE WARNING 'Conflict: round_id=%, team_id=%, version=% has % duplicate records.',
        r.round_id, r.team_id, r.version, r.cnt;
    END LOOP;
    RAISE EXCEPTION 'Preflight backfill aborted: % duplicate (round_id, team_id, version) tuples found in public.submissions. Manual data resolution required.', v_dup_versions USING ERRCODE = '22000';
  END IF;

  -- Check 2: Invalid version values (NULL or < 1)
  SELECT COUNT(*) INTO v_invalid_versions
  FROM public.submissions
  WHERE version IS NULL OR version < 1;

  IF v_invalid_versions > 0 THEN
    FOR r IN (
      SELECT id, round_id, team_id, version
      FROM public.submissions
      WHERE version IS NULL OR version < 1
    ) LOOP
      RAISE WARNING 'Conflict: invalid submission version on id=%, round_id=%, team_id=%, version=%.',
        r.id, r.round_id, r.team_id, r.version;
    END LOOP;
    RAISE EXCEPTION 'Preflight backfill aborted: % invalid submission version values (NULL or < 1) found. Manual data resolution required.', v_invalid_versions USING ERRCODE = '22000';
  END IF;

  -- Check 3: Version sequence gaps and root integrity (must start at 1 and be contiguous: 1, 2, ..., N)
  SELECT COUNT(*) INTO v_version_gaps
  FROM (
    SELECT round_id, team_id, MIN(version) as min_v, MAX(version) as max_v, COUNT(*) as cnt
    FROM public.submissions
    GROUP BY round_id, team_id
    HAVING MIN(version) <> 1 OR MAX(version) <> COUNT(*)
  ) gaps;

  IF v_version_gaps > 0 THEN
    FOR r IN (
      SELECT round_id, team_id, MIN(version) as min_v, MAX(version) as max_v, COUNT(*) as cnt
      FROM public.submissions
      GROUP BY round_id, team_id
      HAVING MIN(version) <> 1 OR MAX(version) <> COUNT(*)
    ) LOOP
      RAISE WARNING 'Conflict: version sequence gap or invalid root on round_id=%, team_id=% (min=%, max=%, count=%).',
        r.round_id, r.team_id, r.min_v, r.max_v, r.cnt;
    END LOOP;
    RAISE EXCEPTION 'Preflight backfill aborted: % version sequence gaps / non-contiguous sequences found in public.submissions. Manual data resolution required.', v_version_gaps USING ERRCODE = '22000';
  END IF;

  -- Check 4: Inconsistent parent relationships, missing links, & orphan parent pointers (if parent_submission_id column exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'parent_submission_id'
  ) THEN
    SELECT COUNT(*) INTO v_inconsistent_parents
    FROM public.submissions child
    LEFT JOIN public.submissions parent ON child.parent_submission_id = parent.id
    WHERE 
      (child.version = 1 AND child.parent_submission_id IS NOT NULL)
      OR (child.version > 1 AND child.parent_submission_id IS NULL)
      OR (
        child.parent_submission_id IS NOT NULL
        AND (
          parent.id IS NULL
          OR child.id = parent.id
          OR child.team_id <> parent.team_id
          OR child.round_id <> parent.round_id
          OR child.version <= parent.version
          OR child.version <> parent.version + 1
        )
      );

    IF v_inconsistent_parents > 0 THEN
      FOR r IN (
        SELECT 
          child.id AS child_id,
          child.team_id AS child_team,
          child.round_id AS child_round,
          child.version AS child_version,
          child.parent_submission_id,
          parent.id AS parent_id,
          parent.team_id AS parent_team,
          parent.round_id AS parent_round,
          parent.version AS parent_version,
          CASE 
            WHEN child.version = 1 AND child.parent_submission_id IS NOT NULL THEN 'Root submission (v=1) has non-null parent pointer'
            WHEN child.version > 1 AND child.parent_submission_id IS NULL THEN 'Non-root submission (v>1) missing parent pointer'
            WHEN parent.id IS NULL THEN 'Dangling parent (no matching submission)'
            WHEN child.id = parent.id THEN 'Self-referencing cycle'
            WHEN child.team_id <> parent.team_id THEN 'Team mismatch'
            WHEN child.round_id <> parent.round_id THEN 'Round mismatch'
            WHEN child.version <= parent.version THEN 'Version inversion / cycle'
            WHEN child.version <> parent.version + 1 THEN 'Non-linear version jump'
            ELSE 'Unknown parent anomaly'
          END AS anomaly_reason
        FROM public.submissions child
        LEFT JOIN public.submissions parent ON child.parent_submission_id = parent.id
        WHERE 
          (child.version = 1 AND child.parent_submission_id IS NOT NULL)
          OR (child.version > 1 AND child.parent_submission_id IS NULL)
          OR (
            child.parent_submission_id IS NOT NULL
            AND (
              parent.id IS NULL
              OR child.id = parent.id
              OR child.team_id <> parent.team_id
              OR child.round_id <> parent.round_id
              OR child.version <= parent.version
              OR child.version <> parent.version + 1
            )
          )
      ) LOOP
        RAISE WARNING 'Parent relationship anomaly on child id=% (team=%, round=%, v=%): parent_submission_id=% (parent_id=%, parent_team=%, parent_round=%, parent_v=%) -> Reason: %',
          r.child_id, r.child_team, r.child_round, r.child_version, r.parent_submission_id,
          r.parent_id, r.parent_team, r.parent_round, r.parent_version, r.anomaly_reason;
      END LOOP;
      RAISE EXCEPTION 'Preflight backfill aborted: % inconsistent, missing, or dangling parent submission relationships found in public.submissions. Manual data resolution required.', v_inconsistent_parents USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Check 5: Duplicate current submissions (if is_current column already exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'submissions' AND column_name = 'is_current'
  ) THEN
    SELECT COUNT(*) INTO v_dup_current
    FROM (
      SELECT round_id, team_id, COUNT(*)
      FROM public.submissions
      WHERE is_current = true
      GROUP BY round_id, team_id
      HAVING COUNT(*) > 1
    ) cur_dups;

    IF v_dup_current > 0 THEN
      RAISE EXCEPTION 'Preflight backfill aborted: % duplicate active submissions (is_current = true) found. Manual data resolution required.', v_dup_current USING ERRCODE = '22000';
    END IF;
  END IF;

  RAISE NOTICE 'Preflight sanity checks completed cleanly. 0 anomalies detected. Proceeding with schema alterations and deterministic backfill.';
END $$;

-- ============================================================================
-- 2. SCHEMA ALTERATIONS & DETERMINISTIC BACKFILL
-- ============================================================================

-- Add columns without immediate NOT NULL / UNIQUE constraint
ALTER TABLE public.submissions
ADD COLUMN IF NOT EXISTS parent_submission_id UUID NULL REFERENCES public.submissions(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS is_current BOOLEAN NULL;

-- Deterministic backfill: exactly one row per (round_id, team_id) receives is_current = true
WITH ranked_submissions AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY round_id, team_id
    ORDER BY version DESC, created_at DESC
  ) as rn
  FROM public.submissions
)
UPDATE public.submissions s
SET is_current = (r.rn = 1)
FROM ranked_submissions r
WHERE s.id = r.id
  AND (s.is_current IS NULL OR s.is_current <> (r.rn = 1));

-- Post-backfill verification: verify is_current count matches distinct (round_id, team_id) count
DO $$
DECLARE
  v_current_count INT;
  v_distinct_count INT;
BEGIN
  SELECT COUNT(*) INTO v_current_count FROM public.submissions WHERE is_current = true;
  SELECT COUNT(DISTINCT (round_id, team_id)) INTO v_distinct_count FROM public.submissions;

  IF v_current_count <> v_distinct_count THEN
    RAISE EXCEPTION 'Backfill verification failed: active submission count (%) does not match distinct team-round count (%). Aborting.',
      v_current_count, v_distinct_count;
  END IF;
END $$;

-- Backfill parent_submission_id for sequential versions
UPDATE public.submissions child
SET parent_submission_id = parent.id
FROM public.submissions parent
WHERE child.round_id = parent.round_id
  AND child.team_id = parent.team_id
  AND child.version = parent.version + 1
  AND child.parent_submission_id IS NULL;

-- Post-backfill verification: verify bidirectional parent chain integrity across all records
DO $$
DECLARE
  v_parent_anomalies INT;
BEGIN
  SELECT COUNT(*) INTO v_parent_anomalies
  FROM public.submissions child
  LEFT JOIN public.submissions parent ON child.parent_submission_id = parent.id
  WHERE 
    (child.version = 1 AND child.parent_submission_id IS NOT NULL)
    OR (child.version > 1 AND child.parent_submission_id IS NULL)
    OR (
      child.parent_submission_id IS NOT NULL
      AND (
        parent.id IS NULL
        OR child.id = parent.id
        OR child.team_id <> parent.team_id
        OR child.round_id <> parent.round_id
        OR child.version <> parent.version + 1
      )
    );

  IF v_parent_anomalies > 0 THEN
    RAISE EXCEPTION 'Backfill parent verification failed: % anomalies detected in post-backfill parent chains. Aborting migration.',
      v_parent_anomalies USING ERRCODE = '22000';
  END IF;
  RAISE NOTICE 'Parent chain backfill verification passed cleanly. All submission parent chains are strictly linear, valid, and acyclic.';
END $$;

-- Enforce NOT NULL, DEFAULT, and partial unique index
ALTER TABLE public.submissions
ALTER COLUMN is_current SET NOT NULL,
ALTER COLUMN is_current SET DEFAULT true;

DROP INDEX IF EXISTS public.uq_submissions_current_active;
CREATE UNIQUE INDEX uq_submissions_current_active
ON public.submissions (round_id, team_id)
WHERE (is_current = true);

CREATE INDEX IF NOT EXISTS idx_submissions_parent ON public.submissions (parent_submission_id);

-- Revoke direct client write access to public.submissions to enforce RPC usage
DROP POLICY IF EXISTS "submissions_insert_member" ON public.submissions;
DROP POLICY IF EXISTS "submissions_update_student" ON public.submissions;
REVOKE INSERT, UPDATE ON TABLE public.submissions FROM authenticated;

-- ============================================================================
-- 3. AUTHORITATIVE EVIDENCE VALIDATION INTENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.evidence_validation_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
  round_id UUID NOT NULL REFERENCES public.hackathon_rounds(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  object_path TEXT NOT NULL UNIQUE,
  sha256_hash TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 1048576),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'abandoned')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at TIMESTAMPTZ NULL,
  submission_id UUID NULL REFERENCES public.submissions(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'evidence_validation_intents_file_size_bytes_check'
  ) THEN
    ALTER TABLE public.evidence_validation_intents
    ADD CONSTRAINT evidence_validation_intents_file_size_bytes_check
    CHECK (file_size_bytes > 0 AND file_size_bytes <= 1048576);
  END IF;
END $$;

ALTER TABLE public.evidence_validation_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_validation_intents FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.evidence_validation_intents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.evidence_validation_intents TO service_role;

CREATE INDEX IF NOT EXISTS idx_evidence_intents_lookup 
ON public.evidence_validation_intents (object_path, team_id, round_id, status);

CREATE INDEX IF NOT EXISTS idx_evidence_intents_expiry 
ON public.evidence_validation_intents (status, expires_at) 
WHERE status = 'pending';

-- ============================================================================
-- 4. REVIEW FEEDBACK VALIDATION PREFLIGHT & CONSTRAINT
-- ============================================================================
DO $$
DECLARE
  v_feedback_violations INT;
  r RECORD;
BEGIN
  SELECT COUNT(*) INTO v_feedback_violations
  FROM public.submission_reviews
  WHERE 
    length(trim(COALESCE(feedback, ''))) > 1000
    OR (
      decision IN ('rejected', 'revision_requested')
      AND length(trim(COALESCE(feedback, ''))) < 10
    );

  IF v_feedback_violations > 0 THEN
    FOR r IN (
      SELECT 
        id, 
        submission_id, 
        reviewer_id, 
        decision, 
        length(trim(COALESCE(feedback, ''))) AS trimmed_len,
        CASE 
          WHEN length(trim(COALESCE(feedback, ''))) > 1000 THEN 'Feedback exceeds maximum 1000 characters'
          WHEN decision IN ('rejected', 'revision_requested') AND length(trim(COALESCE(feedback, ''))) < 10 THEN 'Rejected/Revision review has fewer than 10 non-whitespace characters'
          ELSE 'Unknown feedback rule violation'
        END AS violation_reason,
        LEFT(feedback, 50) AS feedback_preview
      FROM public.submission_reviews
      WHERE 
        length(trim(COALESCE(feedback, ''))) > 1000
        OR (
          decision IN ('rejected', 'revision_requested')
          AND length(trim(COALESCE(feedback, ''))) < 10
        )
    ) LOOP
      RAISE WARNING 'Conflict: submission_reviews feedback violation on id=% (submission=%, reviewer=%, decision=%, trimmed_len=%): Reason: %, Preview: "%"',
        r.id, r.submission_id, r.reviewer_id, r.decision, r.trimmed_len, r.violation_reason, r.feedback_preview;
    END LOOP;

    RAISE EXCEPTION 'Migration 20 aborted: % historical submission_reviews record(s) violate feedback constraints. Manual data review required before applying chk_submission_reviews_feedback_rules.',
      v_feedback_violations USING ERRCODE = '22000';
  END IF;

  RAISE NOTICE 'Submission review feedback preflight checks completed cleanly. 0 violations detected. Proceeding to apply constraint.';
END $$;

ALTER TABLE public.submission_reviews
DROP CONSTRAINT IF EXISTS chk_submission_reviews_feedback_rules;

ALTER TABLE public.submission_reviews
ADD CONSTRAINT chk_submission_reviews_feedback_rules CHECK (
  (length(trim(COALESCE(feedback, ''))) <= 1000) AND
  (decision = 'accepted' OR length(trim(COALESCE(feedback, ''))) >= 10)
);

-- ============================================================================
-- 5. STORAGE RLS POLICIES FOR BUCKET submission-evidence
-- ============================================================================

-- Deny direct client INSERT for teams/* namespace.
-- Canonical round evidence and registration proofs must be uploaded via server actions.
-- Legacy evidence/{hackathon_id}/{submission_id}/* format preserved for Phase 6 tests.
DROP POLICY IF EXISTS "submission_evidence_insert_member" ON storage.objects;
CREATE POLICY "submission_evidence_insert_member" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'submission-evidence' AND
  lower(name) NOT LIKE '%.svg' AND
  lower(name) NOT LIKE '%.exe' AND
  lower(name) NOT LIKE '%.bat' AND
  lower(name) NOT LIKE '%.sh' AND
  lower(name) NOT LIKE '%.bin' AND
  (
    (storage.foldername(name))[1] = 'evidence' AND
    public.can_upload_submission_evidence(
      ((storage.foldername(name))[2])::uuid,
      ((storage.foldername(name))[3])::uuid
    ) AND
    (
      ((lower(name) ~ '\.(jpg|jpeg|png|webp)$' OR (metadata->>'mimetype') IN ('image/jpeg', 'image/png', 'image/webp')) AND
       coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) <= 1048576)
      OR
      ((lower(name) ~ '\.(pdf|zip)$' OR (metadata->>'mimetype') IN ('application/pdf', 'application/zip')) AND
       coalesce((metadata->>'size')::bigint, (metadata->>'contentLength')::bigint, 0) <= 20971520)
    )
  )
);

-- Hardened SELECT policy with hackathon-scoped Admin access and Phase 7 compatibility:
DROP POLICY IF EXISTS "submission_evidence_select" ON storage.objects;
CREATE POLICY "submission_evidence_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'submission-evidence' AND
  (
    -- Format 1: Phase 7 registration proofs (delegates strictly to can_view_registration_proof)
    (
      (storage.foldername(name))[1] = 'teams' AND
      (storage.foldername(name))[3] = 'registration' AND
      public.can_view_registration_proof((storage.foldername(name))[2])
    )
    OR
    -- Format 2: Round evidence and non-registration objects (teams/{team_id}/rounds/{round_id}/{filename})
    (
      (storage.foldername(name))[1] = 'teams' AND
      COALESCE((storage.foldername(name))[3], '') <> 'registration' AND
      (
        public.current_is_super_admin() OR
        public.current_has_permission('manage_hackathons') OR
        public.current_is_team_member(((storage.foldername(name))[2])::uuid) OR
        EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = ((storage.foldername(name))[2])::uuid
            AND public.can_admin_manage_hackathon(t.hackathon_id, 'manage_hackathons')
        )
      )
    )
    OR
    -- Format 3: Legacy evidence format (evidence/{hackathon_id}/{submission_id}/{filename})
    (
      (storage.foldername(name))[1] = 'evidence' AND
      (
        public.current_is_super_admin() OR
        public.current_has_permission('manage_hackathons') OR
        public.can_view_submission_evidence(((storage.foldername(name))[3])::uuid) OR
        public.can_admin_manage_hackathon(((storage.foldername(name))[2])::uuid, 'manage_hackathons')
      )
    )
  )
);

-- ============================================================================
-- 6. ENGINE-ENFORCED PRE-COMMIT DEFERRED CONSTRAINT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trg_fn_enforce_submission_commit_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_round RECORD;
  v_hackathon RECORD;
BEGIN
  IF NEW.is_current = true AND (
    TG_OP = 'INSERT' OR
    OLD.is_current IS NOT TRUE OR
    OLD.evidence_path IS DISTINCT FROM NEW.evidence_path OR
    OLD.version IS DISTINCT FROM NEW.version OR
    OLD.round_id IS DISTINCT FROM NEW.round_id OR
    OLD.hackathon_id IS DISTINCT FROM NEW.hackathon_id
  ) THEN
    -- If the row has been deleted or changed to not current in the same transaction, skip enforcement
    IF NOT EXISTS (
      SELECT 1 FROM public.submissions
      WHERE id = NEW.id AND is_current = true
    ) THEN
      RETURN NEW;
    END IF;

    -- Authoritative lookup 1: Verify referenced round exists
    SELECT id, hackathon_id, end_at
    INTO v_round
    FROM public.hackathon_rounds
    WHERE id = NEW.round_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Commit deadline enforcement failed: referenced round % not found.',
        NEW.round_id USING ERRCODE = '23503';
    END IF;

    -- Authoritative lookup 2: Verify submission hackathon_id matches round hackathon_id
    IF NEW.hackathon_id IS DISTINCT FROM v_round.hackathon_id THEN
      RAISE EXCEPTION 'Commit deadline enforcement failed: submission hackathon_id % does not match round hackathon_id %.',
        NEW.hackathon_id, v_round.hackathon_id USING ERRCODE = '23503';
    END IF;

    -- Authoritative lookup 3: Verify referenced hackathon exists
    SELECT id, event_end_at
    INTO v_hackathon
    FROM public.hackathons
    WHERE id = v_round.hackathon_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Commit deadline enforcement failed: referenced hackathon % not found.',
        v_round.hackathon_id USING ERRCODE = '23503';
    END IF;

    -- Fail-closed validation 4: Ensure deadlines are not null
    IF v_round.end_at IS NULL OR v_hackathon.event_end_at IS NULL THEN
      RAISE EXCEPTION 'Commit deadline enforcement failed: round or event end timestamp is null.'
        USING ERRCODE = '23502';
    END IF;

    -- Commit-boundary round deadline check
    IF clock_timestamp() >= v_round.end_at THEN
      RAISE EXCEPTION 'Submission transaction rejected at commit: round deadline passed at %, current time is %.',
        v_round.end_at, clock_timestamp() USING ERRCODE = '55P03';
    END IF;

    -- Commit-boundary hackathon competition conclusion check
    IF clock_timestamp() >= v_hackathon.event_end_at THEN
      RAISE EXCEPTION 'Submission transaction rejected at commit: hackathon event concluded at %, current time is %.',
        v_hackathon.event_end_at, clock_timestamp() USING ERRCODE = '55P03';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_enforce_commit_deadline ON public.submissions;
CREATE CONSTRAINT TRIGGER trg_submissions_enforce_commit_deadline
AFTER INSERT OR UPDATE ON public.submissions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_enforce_submission_commit_deadline();

-- ============================================================================
-- 7. TRANSACTIONAL SUBMISSION & REVIEW RPCS
-- ============================================================================

-- 7.1 submit_round_milestone
CREATE OR REPLACE FUNCTION public.submit_round_milestone(
  p_round_id UUID,
  p_team_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_repo_url TEXT DEFAULT NULL,
  p_demo_url TEXT DEFAULT NULL,
  p_evidence_path TEXT DEFAULT NULL,
  p_evidence_sha256 TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_round RECORD;
  v_hackathon RECORD;
  v_team RECORD;
  v_prev_round_id UUID;
  v_clean_title TEXT;
  v_clean_desc TEXT;
  v_clean_repo TEXT;
  v_clean_demo TEXT;
  v_intent public.evidence_validation_intents%ROWTYPE;
  v_submission_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required.' USING ERRCODE = '42501';
  END IF;

  v_clean_title := TRIM(COALESCE(p_title, ''));
  IF length(v_clean_title) < 3 OR length(v_clean_title) > 120 THEN
    RAISE EXCEPTION 'Title must be between 3 and 120 characters.' USING ERRCODE = '22000';
  END IF;

  v_clean_desc := NULLIF(TRIM(COALESCE(p_description, '')), '');
  v_clean_repo := NULLIF(TRIM(COALESCE(p_repo_url, '')), '');
  v_clean_demo := NULLIF(TRIM(COALESCE(p_demo_url, '')), '');

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = p_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.' USING ERRCODE = '22023';
  END IF;

  -- Level 1 Hackathon Root Lock Protocol (FOR SHARE)
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = '22023';
  END IF;

  -- Hackathon Competition State Guard
  IF v_hackathon.status NOT IN ('published', 'ongoing') OR clock_timestamp() >= v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Submission rejected: hackathon is not active in competition.' USING ERRCODE = '55P03';
  END IF;

  -- Round Operational State Guard
  IF v_round.status = 'paused' THEN
    RAISE EXCEPTION 'Submission rejected: round is currently paused.' USING ERRCODE = '55P03';
  END IF;

  IF v_round.status <> 'open' OR clock_timestamp() < v_round.start_at OR clock_timestamp() >= v_round.end_at THEN
    RAISE EXCEPTION 'Submission rejected: round is not open for submissions.' USING ERRCODE = '55P03';
  END IF;

  -- Team & Leader Verification
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = '22023';
  END IF;

  IF v_team.hackathon_id <> v_round.hackathon_id THEN
    RAISE EXCEPTION 'Team does not belong to this hackathon.' USING ERRCODE = '22023';
  END IF;

  IF v_team.leader_id <> v_caller_id THEN
    RAISE EXCEPTION 'Access denied: only the team leader can submit round milestones.' USING ERRCODE = '42501';
  END IF;

  IF v_team.external_status = 'not_submitted' THEN
    RAISE EXCEPTION 'Submission rejected: team has not submitted initial registration proof.' USING ERRCODE = '22023';
  END IF;

  -- Sequential Round Qualification Verification
  IF v_round.round_number > 1 THEN
    SELECT r_prev.id INTO v_prev_round_id
    FROM public.hackathon_rounds r_prev
    WHERE r_prev.hackathon_id = v_round.hackathon_id
      AND r_prev.round_number = v_round.round_number - 1;

    IF NOT EXISTS (
      SELECT 1 FROM public.results res
      WHERE res.hackathon_id = v_round.hackathon_id
        AND res.round_id = v_prev_round_id
        AND res.team_id = p_team_id
        AND res.milestone_type = 'round_qualification'
    ) THEN
      RAISE EXCEPTION 'Submission rejected: team did not qualify from previous round.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Check if a current submission already exists
  IF EXISTS (
    SELECT 1 FROM public.submissions
    WHERE round_id = p_round_id AND team_id = p_team_id AND is_current = true
  ) THEN
    RAISE EXCEPTION 'A current submission already exists for this round. Use resubmit_round_milestone to submit revisions.' USING ERRCODE = '23505';
  END IF;

  -- 8-Layer Cryptographically Bound Evidence Validation Pipeline
  IF p_evidence_path IS NOT NULL THEN
    -- Layer 3: Canonical Path Regex Enforcement
    IF p_evidence_path !~ ('^teams/' || p_team_id::text || '/rounds/' || p_round_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$') THEN
      RAISE EXCEPTION 'Invalid evidence path: must match canonical round storage format.' USING ERRCODE = '22023';
    END IF;

    -- Layer 4: Authoritative Server Validation Intent Check (under FOR UPDATE lock)
    SELECT * INTO v_intent
    FROM public.evidence_validation_intents
    WHERE object_path = p_evidence_path
      AND team_id = p_team_id
      AND round_id = p_round_id
      AND hackathon_id = v_round.hackathon_id
      AND created_by = v_caller_id
      AND sha256_hash = p_evidence_sha256
      AND status = 'pending'
      AND expires_at > clock_timestamp()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Evidence validation failed: no valid, unexpired server validation record found for this object. Direct or unverified uploads cannot be attached.' USING ERRCODE = '22023';
    END IF;

    -- Layer 5: Intent Metadata Verification
    IF v_intent.file_size_bytes <= 0 OR v_intent.file_size_bytes > 1048576 OR v_intent.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
      RAISE EXCEPTION 'Evidence validation failed: file size or MIME type violates policy.' USING ERRCODE = '22023';
    END IF;

    -- Layer 6: Direct Storage Catalog Existence Check
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'submission-evidence' AND name = p_evidence_path
    ) THEN
      RAISE EXCEPTION 'Evidence validation failed: specified object does not exist in storage.' USING ERRCODE = 'P0002';
    END IF;

    -- Layer 7: Cross-Team Anti-Reuse & Active Duplicate Binding Check
    IF EXISTS (
      SELECT 1 FROM public.submissions
      WHERE evidence_path = p_evidence_path AND team_id <> p_team_id
    ) THEN
      RAISE EXCEPTION 'Evidence validation failed: object is already bound to another team.' USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.submissions
      WHERE evidence_path = p_evidence_path AND is_current = true
    ) THEN
      RAISE EXCEPTION 'Evidence validation failed: object is already attached to an active submission.' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Insert Submission v1
  INSERT INTO public.submissions (
    hackathon_id,
    round_id,
    team_id,
    submitted_by,
    version,
    parent_submission_id,
    is_current,
    status,
    title,
    description,
    repo_url,
    demo_url,
    evidence_path,
    evidence_sha256
  ) VALUES (
    v_round.hackathon_id,
    p_round_id,
    p_team_id,
    v_caller_id,
    1,
    NULL,
    true,
    'submitted',
    v_clean_title,
    v_clean_desc,
    v_clean_repo,
    v_clean_demo,
    p_evidence_path,
    p_evidence_sha256
  )
  RETURNING id INTO v_submission_id;

  -- Layer 8: Atomic Intent Consumption
  IF v_intent.id IS NOT NULL THEN
    UPDATE public.evidence_validation_intents
    SET status = 'consumed',
        consumed_at = clock_timestamp(),
        submission_id = v_submission_id
    WHERE id = v_intent.id;
  END IF;

  -- Audit Log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    'student',
    'submission.created',
    'submissions',
    v_submission_id::text,
    jsonb_build_object(
      'submission_id', v_submission_id,
      'team_id', p_team_id,
      'round_id', p_round_id,
      'hackathon_id', v_round.hackathon_id,
      'version', 1,
      'has_evidence', (p_evidence_path IS NOT NULL)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'version', 1,
    'status', 'submitted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.submit_round_milestone(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_round_milestone(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 7.2 resubmit_round_milestone
CREATE OR REPLACE FUNCTION public.resubmit_round_milestone(
  p_prior_submission_id UUID,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_repo_url TEXT DEFAULT NULL,
  p_demo_url TEXT DEFAULT NULL,
  p_evidence_path TEXT DEFAULT NULL,
  p_evidence_sha256 TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_prior RECORD;
  v_round RECORD;
  v_hackathon RECORD;
  v_team RECORD;
  v_clean_title TEXT;
  v_clean_desc TEXT;
  v_clean_repo TEXT;
  v_clean_demo TEXT;
  v_intent public.evidence_validation_intents%ROWTYPE;
  v_final_sha256 TEXT;
  v_new_submission_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required.' USING ERRCODE = '42501';
  END IF;

  v_clean_title := TRIM(COALESCE(p_title, ''));
  IF length(v_clean_title) < 3 OR length(v_clean_title) > 120 THEN
    RAISE EXCEPTION 'Title must be between 3 and 120 characters.' USING ERRCODE = '22000';
  END IF;

  v_clean_desc := NULLIF(TRIM(COALESCE(p_description, '')), '');
  v_clean_repo := NULLIF(TRIM(COALESCE(p_repo_url, '')), '');
  v_clean_demo := NULLIF(TRIM(COALESCE(p_demo_url, '')), '');

  -- Prior Submission Lock & Verification
  SELECT * INTO v_prior
  FROM public.submissions
  WHERE id = p_prior_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prior submission not found.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_prior.is_current THEN
    RAISE EXCEPTION 'Cannot resubmit: prior submission is not the active version.' USING ERRCODE = '22023';
  END IF;

  IF v_prior.status <> 'revision_requested' THEN
    RAISE EXCEPTION 'Cannot resubmit: submission is in status %, only revision_requested submissions can be resubmitted.', v_prior.status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_round
  FROM public.hackathon_rounds
  WHERE id = v_prior.round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Round not found.' USING ERRCODE = '22023';
  END IF;

  -- Level 1 Hackathon Root Lock Protocol (FOR SHARE)
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_round.hackathon_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = '22023';
  END IF;

  -- Leader Identity Verification
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = v_prior.team_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = '22023';
  END IF;

  IF v_team.leader_id <> v_caller_id THEN
    RAISE EXCEPTION 'Access denied: only the team leader can resubmit round milestones.' USING ERRCODE = '42501';
  END IF;

  -- Hackathon Competition State Guard
  IF v_hackathon.status NOT IN ('published', 'ongoing') OR clock_timestamp() >= v_hackathon.event_end_at THEN
    RAISE EXCEPTION 'Resubmission rejected: hackathon is not active in competition.' USING ERRCODE = '55P03';
  END IF;

  -- Round Operational State Guard
  IF v_round.status = 'paused' THEN
    RAISE EXCEPTION 'Resubmission rejected: round is currently paused.' USING ERRCODE = '55P03';
  END IF;

  IF v_round.status <> 'open' OR clock_timestamp() < v_round.start_at OR clock_timestamp() >= v_round.end_at THEN
    RAISE EXCEPTION 'Resubmission rejected: round is not open for submissions.' USING ERRCODE = '55P03';
  END IF;

  -- Evidence Handling: Case A (New Evidence) vs. Case B (Retaining Prior Evidence)
  IF p_evidence_path IS NOT NULL THEN
    IF p_evidence_path IS DISTINCT FROM v_prior.evidence_path THEN
      -- Case A: New Evidence Uploaded -> 8-layer validation
      IF p_evidence_path !~ ('^teams/' || v_prior.team_id::text || '/rounds/' || v_prior.round_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$') THEN
        RAISE EXCEPTION 'Invalid evidence path: must match canonical round storage format.' USING ERRCODE = '22023';
      END IF;

      SELECT * INTO v_intent
      FROM public.evidence_validation_intents
      WHERE object_path = p_evidence_path
        AND team_id = v_prior.team_id
        AND round_id = v_prior.round_id
        AND hackathon_id = v_round.hackathon_id
        AND created_by = v_caller_id
        AND sha256_hash = p_evidence_sha256
        AND status = 'pending'
        AND expires_at > clock_timestamp()
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Evidence validation failed: no valid, unexpired server validation record found for this object. Direct or unverified uploads cannot be attached.' USING ERRCODE = '22023';
      END IF;

      IF v_intent.file_size_bytes <= 0 OR v_intent.file_size_bytes > 1048576 OR v_intent.mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
        RAISE EXCEPTION 'Evidence validation failed: file size or MIME type violates policy.' USING ERRCODE = '22023';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM storage.objects
        WHERE bucket_id = 'submission-evidence' AND name = p_evidence_path
      ) THEN
        RAISE EXCEPTION 'Evidence validation failed: specified object does not exist in storage.' USING ERRCODE = 'P0002';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.submissions
        WHERE evidence_path = p_evidence_path AND team_id <> v_prior.team_id
      ) THEN
        RAISE EXCEPTION 'Evidence validation failed: object is already bound to another team.' USING ERRCODE = '23505';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.submissions
        WHERE evidence_path = p_evidence_path AND is_current = true
      ) THEN
        RAISE EXCEPTION 'Evidence validation failed: object is already attached to an active submission.' USING ERRCODE = '23505';
      END IF;

      v_final_sha256 := p_evidence_sha256;
    ELSE
      -- Case B: Retaining Prior Evidence
      IF clock_timestamp() >= v_hackathon.event_end_at THEN
        RAISE EXCEPTION 'Evidence reuse rejected: hackathon competition has concluded. Fresh validated image upload required.' USING ERRCODE = '55P03';
      END IF;

      IF clock_timestamp() >= v_hackathon.event_end_at + interval '7 days' THEN
        RAISE EXCEPTION 'Evidence reuse rejected: hackathon evidence retention period has elapsed. A fresh validated image upload is required.' USING ERRCODE = '55P03';
      END IF;

      IF v_prior.evidence_deleted_at IS NOT NULL OR COALESCE(v_prior.evidence_lifecycle_state, 'active') = 'purged_worker_confirmed' THEN
        RAISE EXCEPTION 'Evidence reuse rejected: prior evidence was purged. A fresh validated image upload is required.' USING ERRCODE = '55P03';
      END IF;

      -- Queue State Inspection across all 8 states (fail-closed)
      IF EXISTS (
        SELECT 1 FROM public.storage_deletion_queue
        WHERE bucket_id = 'submission-evidence'
          AND object_path = p_evidence_path
          AND status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required', 'completed', 'failed')
      ) THEN
        RAISE EXCEPTION 'Evidence reuse rejected: prior evidence is queued, leased, failed, or committed for deletion. A fresh validated image upload is required.' USING ERRCODE = '55P03';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM storage.objects
        WHERE bucket_id = 'submission-evidence' AND name = p_evidence_path
      ) THEN
        RAISE EXCEPTION 'Evidence reuse rejected: object does not exist in storage.' USING ERRCODE = 'P0002';
      END IF;

      IF p_evidence_path !~ ('^teams/' || v_prior.team_id::text || '/rounds/' || v_prior.round_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$') THEN
        RAISE EXCEPTION 'Invalid evidence path: must match canonical round storage format.' USING ERRCODE = '22023';
      END IF;

      v_final_sha256 := v_prior.evidence_sha256;
    END IF;
  ELSE
    v_final_sha256 := NULL;
  END IF;

  -- Demote Prior Submission
  UPDATE public.submissions
  SET is_current = false,
      updated_at = clock_timestamp()
  WHERE id = v_prior.id;

  -- Insert Versioned Resubmission (v_n+1)
  INSERT INTO public.submissions (
    hackathon_id,
    round_id,
    team_id,
    submitted_by,
    version,
    parent_submission_id,
    is_current,
    status,
    title,
    description,
    repo_url,
    demo_url,
    evidence_path,
    evidence_sha256
  ) VALUES (
    v_round.hackathon_id,
    v_prior.round_id,
    v_prior.team_id,
    v_caller_id,
    v_prior.version + 1,
    v_prior.id,
    true,
    'submitted',
    v_clean_title,
    v_clean_desc,
    v_clean_repo,
    v_clean_demo,
    p_evidence_path,
    v_final_sha256
  )
  RETURNING id INTO v_new_submission_id;

  -- Consume Intent if Case A
  IF v_intent.id IS NOT NULL THEN
    UPDATE public.evidence_validation_intents
    SET status = 'consumed',
        consumed_at = clock_timestamp(),
        submission_id = v_new_submission_id
    WHERE id = v_intent.id;
  END IF;

  -- Audit Log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    'student',
    'submission.resubmitted',
    'submissions',
    v_new_submission_id::text,
    jsonb_build_object(
      'submission_id', v_new_submission_id,
      'prior_submission_id', v_prior.id,
      'team_id', v_prior.team_id,
      'round_id', v_prior.round_id,
      'version', v_prior.version + 1,
      'evidence_reused', (p_evidence_path IS NOT NULL AND p_evidence_path = v_prior.evidence_path)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_new_submission_id,
    'version', v_prior.version + 1,
    'status', 'submitted'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.resubmit_round_milestone(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resubmit_round_milestone(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 7.3 review_round_submission
CREATE OR REPLACE FUNCTION public.review_round_submission(
  p_submission_id UUID,
  p_decision TEXT,
  p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_submission RECORD;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_feedback TEXT;
  v_stored_feedback TEXT;
  v_review_id UUID;
  v_result_id UUID;
  v_leader_points INT;
  v_member_points INT;
  v_member RECORD;
  v_idempotency_key TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('accepted', 'rejected', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid decision. Must be accepted, rejected, or revision_requested.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_feedback := TRIM(COALESCE(p_feedback, ''));
  IF length(v_trimmed_feedback) > 1000 THEN
    RAISE EXCEPTION 'Feedback exceeds maximum allowed length of 1000 characters.' USING ERRCODE = '22000';
  END IF;

  IF p_decision IN ('revision_requested', 'rejected') AND length(v_trimmed_feedback) < 10 THEN
    RAISE EXCEPTION 'Decision % requires a nonblank explanation of at least 10 characters.', p_decision USING ERRCODE = '22000';
  END IF;

  v_stored_feedback := NULLIF(v_trimmed_feedback, '');

  -- Submission Lock & Verification
  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_submission.is_current THEN
    RAISE EXCEPTION 'Cannot review historical submission version. Only active submissions can be reviewed.' USING ERRCODE = '22023';
  END IF;

  IF v_submission.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'Submission cannot be reviewed in status %.', v_submission.status USING ERRCODE = '22023';
  END IF;

  -- Admin Scope Verification
  IF NOT public.current_is_super_admin() AND NOT public.can_admin_manage_hackathon(v_submission.hackathon_id, 'manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to review submissions for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = v_submission.hackathon_id;
  SELECT * INTO v_round FROM public.hackathon_rounds WHERE id = v_submission.round_id;

  -- Database-Enforced Lifecycle Matrix
  IF v_hackathon.status IN ('archived', 'completed') THEN
    RAISE EXCEPTION 'Cannot review submission: hackathon is % and locked.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'scheduled' OR clock_timestamp() < v_round.start_at THEN
    RAISE EXCEPTION 'Cannot review submission: round is scheduled and has not commenced.' USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'paused' THEN
    RAISE EXCEPTION 'Cannot review submission: round is currently paused. Resume round or transition to evaluation before reviewing.' USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'open' AND clock_timestamp() >= v_round.end_at THEN
    RAISE EXCEPTION 'Cannot review submission: stage deadline has expired. Round must be transitioned to evaluation or resumed with an extended deadline before reviewing.' USING ERRCODE = '55P03';
  END IF;

  IF v_round.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot review submission: round is completed and locked.' USING ERRCODE = '55P03';
  END IF;

  -- Update submission status
  UPDATE public.submissions
  SET status = p_decision,
      updated_at = clock_timestamp()
  WHERE id = p_submission_id;

  -- Insert review record
  INSERT INTO public.submission_reviews (
    submission_id,
    reviewer_id,
    decision,
    feedback,
    reviewed_at
  ) VALUES (
    p_submission_id,
    v_caller_id,
    p_decision,
    v_stored_feedback,
    clock_timestamp()
  )
  ON CONFLICT (submission_id, reviewer_id) DO UPDATE SET
    decision = EXCLUDED.decision,
    feedback = EXCLUDED.feedback,
    reviewed_at = EXCLUDED.reviewed_at
  RETURNING id INTO v_review_id;

  -- If accepted, publish round_qualification result & award points
  IF p_decision = 'accepted' THEN
    SELECT id INTO v_result_id
    FROM public.results
    WHERE hackathon_id = v_submission.hackathon_id
      AND round_id = v_submission.round_id
      AND team_id = v_submission.team_id
      AND milestone_type = 'round_qualification';

    IF v_result_id IS NULL THEN
      INSERT INTO public.results (
        hackathon_id,
        round_id,
        team_id,
        milestone_type,
        is_published,
        verified_by,
        verified_at,
        notes
      ) VALUES (
        v_submission.hackathon_id,
        v_submission.round_id,
        v_submission.team_id,
        'round_qualification',
        true,
        v_caller_id,
        clock_timestamp(),
        v_stored_feedback
      )
      RETURNING id INTO v_result_id;
    END IF;

    -- Retrieve configured points
    SELECT
      COALESCE(MAX(CASE WHEN milestone_type = 'round_qualification' THEN team_leader_points END), 25),
      COALESCE(MAX(CASE WHEN milestone_type = 'round_qualification' THEN regular_member_points END), 20)
    INTO v_leader_points, v_member_points
    FROM public.point_configurations
    WHERE is_active = true;

    v_leader_points := COALESCE(v_leader_points, 25);
    v_member_points := COALESCE(v_member_points, 20);

    -- Award points to team members
    FOR v_member IN
      SELECT student_id, role
      FROM public.team_members
      WHERE team_id = v_submission.team_id AND hackathon_id = v_submission.hackathon_id
    LOOP
      v_idempotency_key := 'round_qualification_' || v_submission.hackathon_id::text || '_' || v_submission.round_id::text || '_' || v_member.student_id::text;

      INSERT INTO public.points_ledger (
        idempotency_key,
        student_id,
        hackathon_id,
        team_id,
        round_id,
        result_id,
        milestone_type,
        role_at_award,
        points,
        reason,
        awarded_by
      ) VALUES (
        v_idempotency_key,
        v_member.student_id,
        v_submission.hackathon_id,
        v_submission.team_id,
        v_submission.round_id,
        v_result_id,
        'round_qualification',
        v_member.role,
        CASE WHEN v_member.role = 'leader' THEN v_leader_points ELSE v_member_points END,
        'Round qualification verified by administrator',
        v_caller_id
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
  END IF;

  -- Audit Log
  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    'admin',
    'submission.reviewed',
    'submissions',
    p_submission_id::text,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'decision', p_decision,
      'review_id', v_review_id,
      'result_id', v_result_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', p_decision,
    'review_id', v_review_id,
    'result_id', v_result_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.review_round_submission(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_round_submission(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 7.4 reopen_rejected_submission
CREATE OR REPLACE FUNCTION public.reopen_rejected_submission(
  p_submission_id UUID,
  p_target_status TEXT,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_submission RECORD;
  v_round RECORD;
  v_trimmed_reason TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_target_status NOT IN ('under_review', 'revision_requested') THEN
    RAISE EXCEPTION 'Invalid target status. Must be under_review or revision_requested.' USING ERRCODE = '22023';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Reopening reason must be at least 10 non-whitespace characters.' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_submission.is_current THEN
    RAISE EXCEPTION 'Cannot reopen historical submission version. Only active submissions can be reopened.' USING ERRCODE = '22023';
  END IF;

  IF v_submission.status <> 'rejected' THEN
    RAISE EXCEPTION 'Cannot reopen submission: only rejected submissions can be reopened (current status: %).', v_submission.status USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_is_super_admin() AND NOT public.can_admin_manage_hackathon(v_submission.hackathon_id, 'manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to reopen submissions for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round FROM public.hackathon_rounds WHERE id = v_submission.round_id;
  IF v_round.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot reopen submission: round is completed and locked.' USING ERRCODE = '55P03';
  END IF;

  UPDATE public.submissions
  SET status = p_target_status,
      updated_at = clock_timestamp()
  WHERE id = p_submission_id;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    'admin',
    'submission.reopened',
    'submissions',
    p_submission_id::text,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'prior_status', 'rejected',
      'target_status', p_target_status,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'status', p_target_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.reopen_rejected_submission(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_rejected_submission(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 7.5 record_round_winner_placement
CREATE OR REPLACE FUNCTION public.record_round_winner_placement(
  p_submission_id UUID,
  p_placement TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_submission RECORD;
  v_round RECORD;
  v_hackathon RECORD;
  v_trimmed_placement TEXT;
  v_result_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required.' USING ERRCODE = '42501';
  END IF;

  v_trimmed_placement := TRIM(COALESCE(p_placement, ''));
  IF length(v_trimmed_placement) = 0 THEN
    RAISE EXCEPTION 'Placement cannot be empty.' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_submission
  FROM public.submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found.' USING ERRCODE = '22023';
  END IF;

  IF NOT v_submission.is_current THEN
    RAISE EXCEPTION 'Cannot record winner placement on historical submission.' USING ERRCODE = '22023';
  END IF;

  IF v_submission.status <> 'accepted' THEN
    RAISE EXCEPTION 'Winner placement can only be recorded for accepted submissions (current status: %).', v_submission.status USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_is_super_admin() AND NOT public.can_admin_manage_hackathon(v_submission.hackathon_id, 'manage_hackathons') THEN
    RAISE EXCEPTION 'Access denied: caller does not have permission to manage placements for this hackathon.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_round FROM public.hackathon_rounds WHERE id = v_submission.round_id;
  SELECT * INTO v_hackathon FROM public.hackathons WHERE id = v_submission.hackathon_id;

  IF NOT v_round.is_final_round THEN
    IF (SELECT COUNT(*) FROM public.hackathon_rounds WHERE hackathon_id = v_submission.hackathon_id) > 1 THEN
      RAISE EXCEPTION 'Winner placements can only be awarded in the final round of a multi-round competition.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT id INTO v_result_id
  FROM public.results
  WHERE hackathon_id = v_submission.hackathon_id
    AND team_id = v_submission.team_id
    AND milestone_type = 'win_placement';

  IF v_result_id IS NOT NULL THEN
    UPDATE public.results
    SET placement = v_trimmed_placement,
        round_id = v_submission.round_id,
        notes = NULLIF(TRIM(COALESCE(p_notes, '')), ''),
        verified_by = v_caller_id,
        verified_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = v_result_id;
  ELSE
    INSERT INTO public.results (
      hackathon_id,
      round_id,
      team_id,
      milestone_type,
      placement,
      is_published,
      verified_by,
      verified_at,
      notes
    ) VALUES (
      v_submission.hackathon_id,
      v_submission.round_id,
      v_submission.team_id,
      'win_placement',
      v_trimmed_placement,
      true,
      v_caller_id,
      clock_timestamp(),
      NULLIF(TRIM(COALESCE(p_notes, '')), '')
    )
    RETURNING id INTO v_result_id;
  END IF;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    'admin',
    'submission.winner_placed',
    'results',
    v_result_id::text,
    jsonb_build_object(
      'submission_id', p_submission_id,
      'placement', v_trimmed_placement,
      'result_id', v_result_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'result_id', v_result_id,
    'placement', v_trimmed_placement
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.record_round_winner_placement(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_round_winner_placement(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 7.6 reverse_points_ledger_entry
CREATE OR REPLACE FUNCTION public.reverse_points_ledger_entry(
  p_ledger_id UUID,
  p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID;
  v_orig RECORD;
  v_trimmed_reason TEXT;
  v_reversal_key TEXT;
  v_reversal_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required.' USING ERRCODE = '42501';
  END IF;

  v_trimmed_reason := TRIM(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) < 10 THEN
    RAISE EXCEPTION 'Reversal reason must be at least 10 non-whitespace characters.' USING ERRCODE = '22000';
  END IF;

  SELECT * INTO v_orig
  FROM public.points_ledger
  WHERE id = p_ledger_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Points ledger entry not found.' USING ERRCODE = '22023';
  END IF;

  IF v_orig.milestone_type = 'reversal' THEN
    RAISE EXCEPTION 'Cannot reverse a reversal entry.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.points_ledger
    WHERE reversal_of_id = p_ledger_id
  ) THEN
    RAISE EXCEPTION 'Points ledger entry has already been reversed.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.current_is_super_admin() AND NOT public.can_admin_manage_hackathon(v_orig.hackathon_id, 'manage_points') THEN
    RAISE EXCEPTION 'Access denied: manage_points permission required.' USING ERRCODE = '42501';
  END IF;

  v_reversal_key := 'reversal_' || p_ledger_id::text;

  INSERT INTO public.points_ledger (
    idempotency_key,
    student_id,
    hackathon_id,
    team_id,
    round_id,
    result_id,
    reversal_of_id,
    milestone_type,
    role_at_award,
    points,
    reason,
    awarded_by
  ) VALUES (
    v_reversal_key,
    v_orig.student_id,
    v_orig.hackathon_id,
    v_orig.team_id,
    v_orig.round_id,
    v_orig.result_id,
    v_orig.id,
    'reversal',
    v_orig.role_at_award,
    -1 * v_orig.points,
    v_trimmed_reason,
    v_caller_id
  )
  RETURNING id INTO v_reversal_id;

  INSERT INTO public.audit_logs (
    actor_id, actor_role, action, target_type, target_id, details
  ) VALUES (
    v_caller_id,
    'admin',
    'points.reversed',
    'points_ledger',
    v_reversal_id::text,
    jsonb_build_object(
      'original_ledger_id', p_ledger_id,
      'reversal_ledger_id', v_reversal_id,
      'reversed_points', -1 * v_orig.points,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'reversal_ledger_id', v_reversal_id,
    'reversed_points', -1 * v_orig.points
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.reverse_points_ledger_entry(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_points_ledger_entry(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 8. RETENTION & DELETION CORRECTNESS (APPROVED OPTION 5A & 404 IDEMPOTENCY)
-- ============================================================================

-- 8.1 enqueue_hackathon_evidence_retention (Option 5A: Two-Stage Retention Queue Grace Period)
CREATE OR REPLACE FUNCTION public.enqueue_hackathon_evidence_retention(
  p_hackathon_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_hackathon RECORD;
  v_submissions_enqueued INT := 0;
  v_registration_proofs_enqueued INT := 0;
  v_queue_deadline TIMESTAMPTZ;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    IF NOT public.current_has_permission('manage_hackathons') AND NOT public.current_is_super_admin() THEN
      RAISE EXCEPTION 'Access denied: manage_hackathons permission or service_role authority required.';
    END IF;
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.';
  END IF;

  -- Threshold 1: Hackathon event must have ended at least 7 days ago
  IF clock_timestamp() < v_hackathon.event_end_at + interval '7 days' THEN
    RETURN jsonb_build_object(
      'success', false,
      'eligible', false,
      'hackathon_id', p_hackathon_id,
      'message', 'Hackathon evidence is not yet eligible for retention deletion (eligible at ' || (v_hackathon.event_end_at + interval '7 days')::text || ').'
    );
  END IF;

  -- Option 5A: Newly enqueued items receive an absolute 7-day grace period from enqueue instant
  v_queue_deadline := clock_timestamp() + interval '7 days';

  -- 1. Enqueue submission evidence (bucket: submission-evidence, deduplicated across versions)
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, retention_deadline_at, status
  )
  SELECT DISTINCT ON (s.evidence_path)
    p_hackathon_id,
    'submission-evidence',
    s.evidence_path,
    'submission_evidence',
    s.id::text,
    v_queue_deadline,
    'pending'
  FROM public.submissions s
  WHERE s.hackathon_id = p_hackathon_id
    AND s.evidence_path IS NOT NULL
    AND s.evidence_deleted_at IS NULL
  ORDER BY s.evidence_path, s.version DESC
  ON CONFLICT (bucket_id, object_path) WHERE (status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required'))
  DO NOTHING;

  GET DIAGNOSTICS v_submissions_enqueued = ROW_COUNT;

  -- 2. Enqueue external registration proofs
  INSERT INTO public.storage_deletion_queue (
    event_id, bucket_id, object_path, target_type, target_id, retention_deadline_at, status
  )
  SELECT
    p_hackathon_id,
    CASE WHEN t.external_proof_path LIKE 'teams/%' THEN 'submission-evidence' ELSE 'evidence' END,
    t.external_proof_path,
    'registration_screenshot',
    t.id::text,
    v_queue_deadline,
    'pending'
  FROM public.teams t
  WHERE t.hackathon_id = p_hackathon_id
    AND t.external_proof_path IS NOT NULL
  ON CONFLICT (bucket_id, object_path) WHERE (status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required'))
  DO NOTHING;

  GET DIAGNOSTICS v_registration_proofs_enqueued = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'eligible', true,
    'hackathon_id', p_hackathon_id,
    'retention_deadline_at', v_queue_deadline,
    'submissions_enqueued', v_submissions_enqueued,
    'registration_proofs_enqueued', v_registration_proofs_enqueued,
    'total_enqueued', v_submissions_enqueued + v_registration_proofs_enqueued
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.enqueue_hackathon_evidence_retention(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_hackathon_evidence_retention(UUID) TO authenticated, service_role;

-- 8.2 complete_storage_deletion_job (HTTP 404 Idempotency & Multi-Version Purge Stamping)
CREATE OR REPLACE FUNCTION public.complete_storage_deletion_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_http_status INT
)
RETURNS VOID AS $$
DECLARE
  v_job_snapshot RECORD;
  v_submission public.submissions%ROWTYPE;
  v_job RECORD;
BEGIN
  IF session_user NOT IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
    RAISE EXCEPTION 'Access denied: storage deletion worker functions require service_role authority.' USING ERRCODE = '42501';
  END IF;

  SELECT id, event_id, target_type, target_id, object_path, bucket_id, status, lease_token, leased_until
  INTO v_job_snapshot
  FROM public.storage_deletion_queue
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % not found in deletion queue.', p_job_id USING ERRCODE = '22023';
  END IF;

  -- Level 1 Lock: Hackathon root
  IF v_job_snapshot.event_id IS NOT NULL THEN
    PERFORM 1 FROM public.hackathons WHERE id = v_job_snapshot.event_id FOR SHARE;
  END IF;

  -- Level 3 Lock: Target Submission
  IF v_job_snapshot.target_type = 'submission_evidence' AND v_job_snapshot.target_id IS NOT NULL THEN
    SELECT * INTO v_submission
    FROM public.submissions
    WHERE id = v_job_snapshot.target_id::uuid
    FOR UPDATE;
  END IF;

  -- Level 4 Lock: Queue row
  SELECT * INTO v_job
  FROM public.storage_deletion_queue
  WHERE id = p_job_id
  FOR UPDATE;

  -- Invariant validation
  IF v_job.status IN ('completed', 'failed') THEN
    RETURN;
  END IF;

  IF v_job.status <> 'dispatching' THEN
    RAISE EXCEPTION 'Invalid transition: job % is in status %, expected dispatching.', p_job_id, v_job.status
      USING ERRCODE = '55P03';
  END IF;

  IF v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Lease token mismatch for job %. Worker does not hold active lease.', p_job_id
      USING ERRCODE = '55P03';
  END IF;

  IF v_job.leased_until < now() THEN
    RAISE EXCEPTION 'Lease for job % has expired (leased_until: %). Completion rejected.', p_job_id, v_job.leased_until
      USING ERRCODE = '55P03';
  END IF;

  IF v_job.event_id IS DISTINCT FROM v_job_snapshot.event_id OR
     v_job.target_id IS DISTINCT FROM v_job_snapshot.target_id OR
     v_job.object_path IS DISTINCT FROM v_job_snapshot.object_path THEN
    RAISE EXCEPTION 'Database metadata anomaly detected for job %. Aborting transaction.', p_job_id
      USING ERRCODE = 'XX000';
  END IF;

  -- HTTP 200, 204, and 404 (already absent) are treated as successful deletions
  -- BRANCH A: Target Submission is Missing / Orphaned
  IF v_job.target_type = 'submission_evidence' AND v_submission.id IS NULL THEN
    IF p_http_status IN (200, 204, 404) THEN
      UPDATE public.storage_deletion_queue
      SET status = 'completed',
          deletion_outcome = 'PURGED_ORPHANED_OBJECT',
          lease_token = NULL,
          leased_until = NULL,
          completed_at = now(),
          updated_at = now()
      WHERE id = p_job_id;

      INSERT INTO public.audit_logs (
        actor_id, actor_role, action, target_type, target_id, details
      ) VALUES (
        NULL, 'service_role', 'orphaned_object_purged', 'storage_deletion_queue', p_job_id::text,
        jsonb_build_object('job_id', p_job_id, 'object_path', v_job.object_path, 'target_id', v_job.target_id, 'http_status', p_http_status)
      );
    ELSE
      UPDATE public.storage_deletion_queue
      SET status = 'investigation_required',
          deletion_outcome = 'UNCERTAIN_ORPHANED_OBJECT_FAILURE',
          updated_at = now()
      WHERE id = p_job_id;

      INSERT INTO public.audit_logs (
        actor_id, actor_role, action, target_type, target_id, details
      ) VALUES (
        NULL, 'service_role', 'orphaned_object_deletion_failed', 'storage_deletion_queue', p_job_id::text,
        jsonb_build_object('job_id', p_job_id, 'object_path', v_job.object_path, 'http_status', p_http_status)
      );
    END IF;
    RETURN;
  END IF;

  -- BRANCH B: Replacement Upload Isolation (Path Mismatch)
  IF v_job.target_type = 'submission_evidence' AND v_submission.id IS NOT NULL AND v_submission.evidence_path IS DISTINCT FROM v_job.object_path THEN
    IF p_http_status IN (200, 204, 404) THEN
      UPDATE public.storage_deletion_queue
      SET status = 'completed',
          deletion_outcome = 'PURGED_SUPERSEDED_VERSION',
          lease_token = NULL,
          leased_until = NULL,
          completed_at = now(),
          updated_at = now()
      WHERE id = p_job_id;

      -- Multi-version purge atomicity: stamp all submission rows sharing this superseded path
      UPDATE public.submissions
      SET evidence_lifecycle_state = 'purged_worker_confirmed',
          evidence_deleted_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE hackathon_id = v_job.event_id
        AND evidence_path = v_job.object_path
        AND evidence_deleted_at IS NULL;
    ELSE
      UPDATE public.storage_deletion_queue
      SET status = 'investigation_required',
          deletion_outcome = 'UNCERTAIN_SUPERSEDED_VERSION_INVESTIGATION',
          updated_at = now()
      WHERE id = p_job_id;
    END IF;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      NULL, 'service_role', 'superseded_version_resolved', 'storage_deletion_queue', p_job_id::text,
      jsonb_build_object(
        'submission_id', v_submission.id,
        'superseded_path', v_job.object_path,
        'active_path', v_submission.evidence_path,
        'http_status', p_http_status,
        'outcome', (SELECT deletion_outcome FROM public.storage_deletion_queue WHERE id = p_job_id)
      )
    );
    RETURN;
  END IF;

  -- BRANCH C: Active Current Version (Path Match) or other target types
  IF p_http_status IN (200, 204, 404) THEN
    UPDATE public.storage_deletion_queue
    SET status = 'completed',
        deletion_outcome = 'PURGED_WORKER_CONFIRMED',
        lease_token = NULL,
        leased_until = NULL,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_job_id;

    -- Multi-version purge atomicity: stamp all submission rows sharing this path
    IF v_job.target_type = 'submission_evidence' THEN
      UPDATE public.submissions
      SET evidence_lifecycle_state = 'purged_worker_confirmed',
          evidence_deleted_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE hackathon_id = v_job.event_id
        AND evidence_path = v_job.object_path
        AND evidence_deleted_at IS NULL;
    END IF;

    -- Handle profile college_id if applicable
    IF v_job.target_type = 'profile_college_id' THEN
      UPDATE public.profiles
      SET college_id_path = NULL,
          college_id_deleted_at = now()
      WHERE id = v_job.target_id::uuid
        AND (college_id_path = v_job.object_path OR college_id_path IS NULL);
    END IF;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      NULL, 'service_role', 'evidence_purged_worker_confirmed', 'storage_deletion_queue', p_job_id::text,
      jsonb_build_object('target_id', v_job.target_id, 'object_path', v_job.object_path, 'http_status', p_http_status)
    );
  ELSE
    UPDATE public.storage_deletion_queue
    SET status = 'investigation_required',
        deletion_outcome = 'UNCERTAIN_DISPATCH_FAILURE',
        updated_at = now()
    WHERE id = p_job_id;

    INSERT INTO public.audit_logs (
      actor_id, actor_role, action, target_type, target_id, details
    ) VALUES (
      NULL, 'service_role', 'evidence_deletion_dispatch_failed', 'storage_deletion_queue', p_job_id::text,
      jsonb_build_object('target_id', v_job.target_id, 'http_status', p_http_status)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.complete_storage_deletion_job(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_storage_deletion_job(UUID, UUID, INT) TO service_role;

-- Backward compatible 2-argument overload
CREATE OR REPLACE FUNCTION public.complete_storage_deletion_job(
  p_job_id UUID,
  p_lease_token UUID
)
RETURNS VOID AS $$
BEGIN
  PERFORM public.complete_storage_deletion_job(p_job_id, p_lease_token, 200);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.complete_storage_deletion_job(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_storage_deletion_job(UUID, UUID) TO service_role;

-- ============================================================================
-- 9. REVIEW VISIBILITY RLS POLICY
-- ============================================================================
DROP POLICY IF EXISTS "submission_reviews_select_published" ON public.submission_reviews;
DROP POLICY IF EXISTS "submission_reviews_select_team_member" ON public.submission_reviews;

CREATE POLICY "submission_reviews_select_team_member" ON public.submission_reviews
FOR SELECT TO authenticated
USING (
  public.current_is_super_admin() OR
  EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.id = submission_reviews.submission_id
      AND (
        public.can_admin_manage_hackathon(s.hackathon_id, 'manage_hackathons') OR
        public.current_is_team_member(s.team_id)
      )
  )
);
