import type {
  RegistrationState,
  EventTimingState,
  RegistrationStateDisplay,
} from '@/types/hackathon';
import { REGISTRATION_STATE_CONFIG } from '@/types/hackathon';

/**
 * Computes the real-time registration state for a hackathon.
 * Mirrors the PostgreSQL STABLE function public.compute_registration_state exactly.
 */
export function computeRegistrationState(
  status: string | null | undefined,
  regStart: string | Date,
  regEnd: string | Date,
  referenceTime: Date = new Date()
): RegistrationState {
  if (status === 'draft') {
    return 'DRAFT';
  }

  if (status === 'archived') {
    return 'ARCHIVED';
  }

  if (status === 'registration_closed') {
    return 'CLOSED';
  }

  const nowMs = referenceTime.getTime();
  const startMs = typeof regStart === 'string' ? new Date(regStart).getTime() : regStart.getTime();
  const endMs = typeof regEnd === 'string' ? new Date(regEnd).getTime() : regEnd.getTime();

  if (nowMs < startMs) {
    return 'UPCOMING';
  }

  // Exact inclusive deadline contract: now <= registration_end_at
  if (nowMs <= endMs) {
    return 'OPEN';
  }

  return 'DEADLINE_PASSED';
}

/**
 * Computes the event timeline state for event start and conclusion.
 */
export function computeEventTimingState(
  eventStart: string | Date,
  eventEnd: string | Date,
  referenceTime: Date = new Date()
): EventTimingState {
  const nowMs = referenceTime.getTime();
  const startMs = typeof eventStart === 'string' ? new Date(eventStart).getTime() : eventStart.getTime();
  const endMs = typeof eventEnd === 'string' ? new Date(eventEnd).getTime() : eventEnd.getTime();

  if (nowMs < startMs) {
    return 'TIMING_UPCOMING';
  }

  if (nowMs <= endMs) {
    return 'TIMING_IN_PROGRESS';
  }

  return 'TIMING_CONCLUDED';
}

/**
 * Returns UI display metadata (badge label, variant, description) for a registration state.
 */
export function getRegistrationStateDisplay(state: RegistrationState): RegistrationStateDisplay {
  const config = REGISTRATION_STATE_CONFIG[state] ?? REGISTRATION_STATE_CONFIG.DRAFT;
  return {
    state,
    ...config,
  };
}
