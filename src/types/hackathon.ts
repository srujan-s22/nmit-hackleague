import type { Database } from '@/types/database';

export type PersistedHackathonStatus =
  | 'draft'
  | 'published'
  | 'registration_closed'
  | 'ongoing'
  | 'completed'
  | 'archived';

export type RegistrationState =
  | 'DRAFT'
  | 'UPCOMING'
  | 'OPEN'
  | 'DEADLINE_PASSED'
  | 'CLOSED'
  | 'ARCHIVED';

export type EventTimingState =
  | 'TIMING_UPCOMING'
  | 'TIMING_IN_PROGRESS'
  | 'TIMING_CONCLUDED';

export interface RegistrationStateDisplay {
  state: RegistrationState;
  badgeLabel: string;
  badgeVariant: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  description: string;
  isActionable: boolean;
}

export const REGISTRATION_STATE_CONFIG: Record<
  RegistrationState,
  Omit<RegistrationStateDisplay, 'state'>
> = {
  DRAFT: {
    badgeLabel: 'Draft',
    badgeVariant: 'neutral',
    description: 'Private draft under administrative preparation.',
    isActionable: false,
  },
  UPCOMING: {
    badgeLabel: 'Registration Upcoming',
    badgeVariant: 'info',
    description: 'Registration opens soon.',
    isActionable: false,
  },
  OPEN: {
    badgeLabel: 'Registration Open',
    badgeVariant: 'success',
    description: 'Team registrations are currently being accepted.',
    isActionable: true,
  },
  DEADLINE_PASSED: {
    badgeLabel: 'Registration Closed',
    badgeVariant: 'error',
    description: 'The registration deadline for this competition has passed.',
    isActionable: false,
  },
  CLOSED: {
    badgeLabel: 'Registration Closed',
    badgeVariant: 'error',
    description: 'Registration has been officially closed by event organizers.',
    isActionable: false,
  },
  ARCHIVED: {
    badgeLabel: 'Archived',
    badgeVariant: 'neutral',
    description: 'This competition has concluded and is archived for institutional records.',
    isActionable: false,
  },
};

export interface PrizeTier {
  placement: string;
  reward: string;
  description?: string;
}

export type Hackathon = Database['public']['Tables']['hackathons']['Row'];
export type HackathonInsert = Database['public']['Tables']['hackathons']['Insert'];
export type HackathonUpdate = Database['public']['Tables']['hackathons']['Update'];

export type HackathonRound = Database['public']['Tables']['hackathon_rounds']['Row'];
export type HackathonRoundInsert = Database['public']['Tables']['hackathon_rounds']['Insert'];
export type HackathonRoundUpdate = Database['public']['Tables']['hackathon_rounds']['Update'];

export type HackathonPublicView = Database['public']['Views']['hackathons_public_view']['Row'];
export type HackathonRoundPublicView = Database['public']['Views']['hackathon_rounds_public_view']['Row'];

export interface HackathonWithRounds extends Hackathon {
  rounds: HackathonRound[];
}

export interface HackathonPublicWithRounds extends HackathonPublicView {
  rounds: HackathonRoundPublicView[];
}

export type HackathonStatusFilter = 'all' | PersistedHackathonStatus;
