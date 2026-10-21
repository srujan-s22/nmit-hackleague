import React from 'react';
import type { Metadata } from 'next';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { StudentShell } from '@/components/shells/student-shell';
import { getStudentPointsSummary } from '@/lib/points/leaderboard-queries';
import { StudentPointsClient } from './student-points-client';

export const metadata: Metadata = {
  title: 'My Points & Milestones — NMIT HackLeague',
  description: 'View your net points, platform ranking, and complete transaction history.',
};

export default async function StudentPointsPage() {
  const { profile, user } = await requireApprovedStudent();

  const { data: summary, error } = await getStudentPointsSummary(user.id);

  return (
    <StudentShell currentPath="/student/points">
      <StudentPointsClient
        summary={summary}
        error={error}
        profile={profile}
      />
    </StudentShell>
  );
}
