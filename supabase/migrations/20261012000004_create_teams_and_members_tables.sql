-- Migration 04: Teams and Team Memberships
-- Created: 2026-10-12
-- Schema: public

-- 1. Table: public.teams
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  leader_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  invitation_code TEXT NOT NULL UNIQUE,
  invitation_code_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  internal_status TEXT NOT NULL DEFAULT 'forming',
  external_status TEXT NOT NULL DEFAULT 'not_submitted',
  external_proof_path TEXT NULL,
  external_proof_submitted_at TIMESTAMPTZ NULL,
  external_proof_reviewed_by UUID NULL REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  external_proof_reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_teams_name_valid CHECK (length(TRIM(name)) >= 2 AND length(TRIM(name)) <= 50),
  CONSTRAINT chk_teams_internal_status CHECK (internal_status IN ('forming', 'complete', 'locked', 'disqualified')),
  CONSTRAINT chk_teams_external_status CHECK (external_status IN ('not_submitted', 'submitted', 'verified', 'rejected')),
  CONSTRAINT uq_teams_composite_hackathon UNIQUE (id, hackathon_id)
);

CREATE UNIQUE INDEX uq_teams_hackathon_name_ci ON public.teams (hackathon_id, LOWER(TRIM(name)));

CREATE TRIGGER trg_teams_updated_at
BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Table: public.team_members
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  hackathon_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_team_members_team_composite FOREIGN KEY (team_id, hackathon_id) REFERENCES public.teams(id, hackathon_id) ON DELETE RESTRICT,
  CONSTRAINT uq_team_members_unique_team_student UNIQUE (team_id, student_id),
  CONSTRAINT uq_team_members_one_team_per_hackathon UNIQUE (hackathon_id, student_id),
  CONSTRAINT uq_team_members_t_s_h UNIQUE (team_id, student_id, hackathon_id),
  CONSTRAINT chk_team_members_role CHECK (role IN ('leader', 'member'))
);

CREATE UNIQUE INDEX uq_team_single_leader ON public.team_members (team_id) WHERE (role = 'leader');

-- Circular deferred foreign key from teams to team_members
ALTER TABLE public.teams
ADD CONSTRAINT fk_teams_leader_member
FOREIGN KEY (id, leader_id) REFERENCES public.team_members(team_id, student_id)
DEFERRABLE INITIALLY DEFERRED;

-- 3. Team leadership constraint triggers
CREATE OR REPLACE FUNCTION public.verify_team_leader_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_leader_member_id UUID;
BEGIN
  SELECT student_id INTO v_leader_member_id
  FROM public.team_members
  WHERE team_id = NEW.id AND role = 'leader';

  IF v_leader_member_id IS NULL THEN
    RAISE EXCEPTION 'Team leadership integrity violation: team % has no assigned leader in team_members.', NEW.id;
  END IF;

  IF v_leader_member_id <> NEW.leader_id THEN
    RAISE EXCEPTION 'Team leadership integrity violation: teams.leader_id (%) does not match leader in team_members (%).', NEW.leader_id, v_leader_member_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_verify_team_leader_integrity
AFTER INSERT OR UPDATE ON public.teams
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.verify_team_leader_integrity();

CREATE OR REPLACE FUNCTION public.verify_team_member_leader_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_team_id UUID;
  v_leader_count INT;
  v_team_leader_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.team_id IS DISTINCT FROM NEW.team_id THEN
    IF EXISTS (SELECT 1 FROM public.teams WHERE id = OLD.team_id) THEN
      SELECT COUNT(*) INTO v_leader_count
      FROM public.team_members
      WHERE team_id = OLD.team_id AND role = 'leader';

      IF v_leader_count <> 1 THEN
        RAISE EXCEPTION 'Team leadership integrity violation: old team % must have exactly 1 leader (found %).', OLD.team_id, v_leader_count;
      END IF;

      SELECT student_id INTO v_team_leader_id
      FROM public.team_members
      WHERE team_id = OLD.team_id AND role = 'leader'
      LIMIT 1;

      IF EXISTS (SELECT 1 FROM public.teams WHERE id = OLD.team_id AND leader_id <> v_team_leader_id) THEN
        RAISE EXCEPTION 'Team leadership integrity violation: teams.leader_id does not match team_members leader for old team.';
      END IF;
    END IF;
  END IF;

  v_team_id := COALESCE(NEW.team_id, OLD.team_id);

  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = v_team_id) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) INTO v_leader_count
  FROM public.team_members
  WHERE team_id = v_team_id AND role = 'leader';

  IF v_leader_count <> 1 THEN
    RAISE EXCEPTION 'Team leadership integrity violation: team % must have exactly 1 leader (found %).', v_team_id, v_leader_count;
  END IF;

  SELECT student_id INTO v_team_leader_id
  FROM public.team_members
  WHERE team_id = v_team_id AND role = 'leader'
  LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.teams WHERE id = v_team_id AND leader_id <> v_team_leader_id) THEN
    RAISE EXCEPTION 'Team leadership integrity violation: teams.leader_id does not match team_members leader for team %.', v_team_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_verify_member_leader_integrity
AFTER INSERT OR UPDATE OR DELETE ON public.team_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.verify_team_member_leader_integrity();
