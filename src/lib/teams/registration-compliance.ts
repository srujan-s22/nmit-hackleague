/**
 * External registration is compulsory: a team counts as registered only once its
 * registration proof is submitted. Until the hackathon's registration deadline a team
 * without proof is "pending"; after it, the team is "not_registered" and cannot continue
 * (the database already blocks its round submissions). An admin can reopen registration
 * by extending the deadline.
 *
 * Mirrors public.team_registration_state in the database (used by exports).
 */
export type TeamRegistrationState = 'registered' | 'pending' | 'not_registered';

export function teamRegistrationState(
  externalStatus: string | null | undefined,
  registrationEndAt: string | Date | null | undefined,
  now: Date = new Date()
): TeamRegistrationState {
  if (externalStatus === 'submitted') return 'registered';
  if (!registrationEndAt) return 'pending';
  const end = typeof registrationEndAt === 'string' ? new Date(registrationEndAt) : registrationEndAt;
  return now.getTime() > end.getTime() ? 'not_registered' : 'pending';
}

export const TEAM_REGISTRATION_LABEL: Record<TeamRegistrationState, string> = {
  registered: 'Registered',
  pending: 'Registration pending',
  not_registered: 'Not registered',
};

/** Whole days left until the deadline (0 on the last day, negative once passed). */
export function daysUntilDeadline(registrationEndAt: string | Date, now: Date = new Date()): number {
  const end = typeof registrationEndAt === 'string' ? new Date(registrationEndAt) : registrationEndAt;
  return Math.floor((end.getTime() - now.getTime()) / 86_400_000);
}
