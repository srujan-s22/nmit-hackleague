-- Migration 06: Results, Point Configurations, and Points Ledger
-- Created: 2026-10-12
-- Schema: public

-- 1. Table: public.results
CREATE TABLE public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL,
  round_id UUID NULL,
  team_id UUID NOT NULL,
  milestone_type TEXT NOT NULL,
  placement TEXT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  verified_by UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_results_team_composite FOREIGN KEY (team_id, hackathon_id) REFERENCES public.teams(id, hackathon_id) ON DELETE RESTRICT,
  CONSTRAINT fk_results_round_composite FOREIGN KEY (round_id, hackathon_id) REFERENCES public.hackathon_rounds(id, hackathon_id) ON DELETE RESTRICT,
  CONSTRAINT uq_results_composite UNIQUE (id, hackathon_id),
  CONSTRAINT chk_results_milestone CHECK (milestone_type IN ('participation', 'round_qualification', 'win_placement')),
  CONSTRAINT chk_results_round_linkage CHECK (milestone_type <> 'round_qualification' OR round_id IS NOT NULL)
);

CREATE TRIGGER trg_results_updated_at
BEFORE UPDATE ON public.results
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Table: public.point_configurations
CREATE TABLE public.point_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_type TEXT NOT NULL UNIQUE,
  regular_member_points INTEGER NOT NULL,
  team_leader_points INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_point_configs_milestone CHECK (milestone_type IN ('participation', 'round_qualification', 'win_placement')),
  CONSTRAINT chk_point_configs_values CHECK (regular_member_points >= 0 AND team_leader_points >= 0)
);

CREATE TRIGGER trg_point_configurations_updated_at
BEFORE UPDATE ON public.point_configurations
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Table: public.points_ledger
CREATE TABLE public.points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL,
  round_id UUID NULL,
  result_id UUID NULL,
  reversal_of_id UUID NULL REFERENCES public.points_ledger(id) ON DELETE RESTRICT,
  milestone_type TEXT NOT NULL,
  role_at_award TEXT NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  awarded_by UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_points_ledger_team_member FOREIGN KEY (team_id, student_id, hackathon_id) REFERENCES public.team_members(team_id, student_id, hackathon_id) ON DELETE RESTRICT,
  CONSTRAINT fk_points_round_composite FOREIGN KEY (round_id, hackathon_id) REFERENCES public.hackathon_rounds(id, hackathon_id) ON DELETE RESTRICT,
  CONSTRAINT fk_points_result_composite FOREIGN KEY (result_id, hackathon_id) REFERENCES public.results(id, hackathon_id) ON DELETE RESTRICT,
  CONSTRAINT chk_points_ledger_milestone CHECK (milestone_type IN ('participation', 'round_qualification', 'win_placement', 'manual_adjustment', 'reversal')),
  CONSTRAINT chk_points_ledger_role CHECK (role_at_award IN ('leader', 'member')),
  CONSTRAINT chk_points_ledger_points CHECK (points <> 0),
  CONSTRAINT chk_points_ledger_round_required CHECK (milestone_type <> 'round_qualification' OR round_id IS NOT NULL),
  CONSTRAINT chk_points_ledger_reversal_ref CHECK (milestone_type <> 'reversal' OR reversal_of_id IS NOT NULL),
  CONSTRAINT chk_points_ledger_reversal_negative CHECK (milestone_type <> 'reversal' OR points < 0)
);

CREATE UNIQUE INDEX uq_points_ledger_participation ON public.points_ledger (student_id, hackathon_id) WHERE (milestone_type = 'participation');
CREATE UNIQUE INDEX uq_points_ledger_round_qualification ON public.points_ledger (student_id, hackathon_id, round_id) WHERE (milestone_type = 'round_qualification');
CREATE UNIQUE INDEX uq_points_ledger_win ON public.points_ledger (student_id, hackathon_id) WHERE (milestone_type = 'win_placement');
CREATE UNIQUE INDEX uq_points_ledger_single_reversal ON public.points_ledger (reversal_of_id) WHERE (milestone_type = 'reversal');

-- Immutability enforcement trigger
CREATE OR REPLACE FUNCTION public.prevent_points_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Points ledger entries are immutable and cannot be updated or deleted. Issue an auditable reversal or adjustment instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_points_ledger_immutable
BEFORE UPDATE OR DELETE ON public.points_ledger
FOR EACH ROW EXECUTE FUNCTION public.prevent_points_ledger_mutation();
