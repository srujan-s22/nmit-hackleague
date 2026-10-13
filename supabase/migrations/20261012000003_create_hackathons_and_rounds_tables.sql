-- Migration 03: Hackathons and Rounds
-- Created: 2026-10-12
-- Schema: public

-- 1. Table: public.hackathons
CREATE TABLE public.hackathons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  organizer TEXT NOT NULL,
  mode TEXT NOT NULL,
  venue TEXT NULL,
  registration_start_at TIMESTAMPTZ NOT NULL,
  registration_end_at TIMESTAMPTZ NOT NULL,
  event_start_at TIMESTAMPTZ NOT NULL,
  event_end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  min_team_size INTEGER NOT NULL DEFAULT 1,
  max_team_size INTEGER NOT NULL DEFAULT 4,
  is_solo_allowed BOOLEAN NOT NULL DEFAULT false,
  external_registration_url TEXT NULL,
  community_url TEXT NULL,
  prizes_summary TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES public.admin_profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_hackathons_mode CHECK (mode IN ('offline', 'online', 'hybrid')),
  CONSTRAINT chk_hackathons_status CHECK (status IN ('draft', 'published', 'registration_closed', 'ongoing', 'completed', 'archived')),
  CONSTRAINT chk_hackathons_team_size CHECK (min_team_size >= 1 AND max_team_size >= min_team_size),
  CONSTRAINT chk_hackathons_reg_window CHECK (registration_end_at > registration_start_at),
  CONSTRAINT chk_hackathons_event_window CHECK (event_end_at >= event_start_at),
  CONSTRAINT chk_hackathons_chronology CHECK (event_start_at >= registration_start_at),
  CONSTRAINT uq_hackathons_id_status UNIQUE (id, status)
);

CREATE TRIGGER trg_hackathons_updated_at
BEFORE UPDATE ON public.hackathons
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. Table: public.hackathon_rounds
CREATE TABLE public.hackathon_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE RESTRICT,
  round_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_final_round BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_hackathon_round_number UNIQUE (hackathon_id, round_number),
  CONSTRAINT uq_hackathon_rounds_composite UNIQUE (id, hackathon_id),
  CONSTRAINT chk_hackathon_rounds_status CHECK (status IN ('scheduled', 'open', 'evaluation', 'completed')),
  CONSTRAINT chk_hackathon_rounds_window CHECK (end_at >= start_at)
);

CREATE TRIGGER trg_hackathon_rounds_updated_at
BEFORE UPDATE ON public.hackathon_rounds
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
