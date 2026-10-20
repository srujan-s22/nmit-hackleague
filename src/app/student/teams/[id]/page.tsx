import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { StudentShell } from '@/components/shells/student-shell';
import { TeamManageClient } from './team-manage-client';
import { getTeamDetails } from '@/lib/teams/queries';

interface TeamManagePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TeamManagePageProps): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeamDetails(id);

  if (!team) {
    return { title: 'Team Not Found | NMIT HackLeague' };
  }

  return {
    title: `${team.name} — Team Console | NMIT HackLeague`,
    description: `Manage team roster, invitation code, and registration proof for ${team.name}.`,
  };
}

export default async function TeamManagePage({ params }: TeamManagePageProps) {
  const { user } = await requireApprovedStudent();
  const { id } = await params;

  const team = await getTeamDetails(id);

  if (!team) {
    notFound();
  }

  return (
    <StudentShell currentPath="/student/teams">
      <TeamManageClient initialTeam={team} currentUserId={user.id} />
    </StudentShell>
  );
}
