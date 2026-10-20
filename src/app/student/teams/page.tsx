import React from 'react';
import type { Metadata } from 'next';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { StudentShell } from '@/components/shells/student-shell';
import { TeamsClient } from './teams-client';
import { getStudentTeams } from '@/lib/teams/queries';
import { computeRegistrationState } from '@/lib/hackathons/registration-state';
import type { HackathonOption } from '@/components/teams/create-team-dialog';

export const metadata: Metadata = {
  title: 'My Teams — NMIT HackLeague',
  description: 'Manage hackathon teams, rosters, invitation codes, and registration proofs.',
};

interface StudentTeamsPageProps {
  searchParams: Promise<{
    action?: string;
    hackathon?: string;
  }>;
}

export default async function StudentTeamsPage({ searchParams }: StudentTeamsPageProps) {
  await requireApprovedStudent();
  const { action, hackathon: preselectedHackathonId } = await searchParams;

  const supabase = await createClient();

  // 1. Fetch current student's teams
  const teams = await getStudentTeams();

  // 2. Fetch published/ongoing hackathons open for team creation
  const { data: hackathonsData } = await supabase
    .from('hackathons_public_view')
    .select(`
      id,
      title,
      status,
      registration_start_at,
      registration_end_at,
      min_team_size,
      max_team_size,
      is_solo_allowed
    `)
    .order('registration_end_at', { ascending: true });

  const availableHackathons: HackathonOption[] = (hackathonsData || [])
    .filter((h): h is typeof h & { id: string; title: string; min_team_size: number; max_team_size: number } =>
      Boolean(h.id && h.title && typeof h.min_team_size === 'number' && typeof h.max_team_size === 'number')
    )
    .map((h) => {
      const regState = computeRegistrationState(
        h.status,
        h.registration_start_at || new Date().toISOString(),
        h.registration_end_at || new Date().toISOString()
      );
      return {
        id: h.id,
        title: h.title,
        min_team_size: h.min_team_size,
        max_team_size: h.max_team_size,
        is_solo_allowed: Boolean(h.is_solo_allowed),
        registration_state: regState,
      };
    })
    .filter((h) => h.registration_state === 'OPEN');

  const initialAction =
    action === 'create' ? 'create' : action === 'join' ? 'join' : undefined;

  return (
    <StudentShell currentPath="/student/teams">
      <TeamsClient
        initialTeams={teams}
        availableHackathons={availableHackathons}
        preselectedHackathonId={preselectedHackathonId}
        initialAction={initialAction}
      />
    </StudentShell>
  );
}
