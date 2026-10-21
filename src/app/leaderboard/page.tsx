import React from 'react';
import type { Metadata } from 'next';
import { requireAuth, getStudentProfile, getCurrentAdminProfile } from '@/lib/auth/guards';
import { redirect } from 'next/navigation';
import { StudentShell } from '@/components/shells/student-shell';
import { AdminShell } from '@/components/shells/admin-shell';
import { getPlatformLeaderboard, getAvailableEventAcademicYears } from '@/lib/points/leaderboard-queries';
import { LeaderboardClient } from './leaderboard-client';

export const metadata: Metadata = {
  title: 'Platform Leaderboard — NMIT HackLeague',
  description: 'Platform-wide student leaderboard tracking verified milestone achievements and points.',
};

interface LeaderboardPageProps {
  searchParams: Promise<{
    year?: string;
    eventYear?: string;
    term?: string;
    page?: string;
  }>;
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const { user } = await requireAuth();

  // Role check: Active Admin or Approved Student
  const adminProfile = await getCurrentAdminProfile();
  const studentProfile = !adminProfile ? await getStudentProfile() : null;

  if (!adminProfile && (!studentProfile || studentProfile.registration_status !== 'approved')) {
    redirect('/status/pending');
  }

  const params = await searchParams;
  const academicYear = params.year ? parseInt(params.year, 10) : undefined;
  const eventAcademicYear = params.eventYear || undefined;
  const eventTerm = (params.term as 'odd_sem' | 'even_sem' | 'summer_term') || undefined;
  const page = params.page ? Math.max(1, parseInt(params.page, 10)) : 1;
  const limit = 50;
  const offset = (page - 1) * limit;

  const [{ data: entries, error }, availableEventYears] = await Promise.all([
    getPlatformLeaderboard({
      academicYear: isNaN(Number(academicYear)) ? undefined : academicYear,
      eventAcademicYear,
      eventTerm,
      limit,
      offset,
    }),
    getAvailableEventAcademicYears(),
  ]);

  const content = (
    <LeaderboardClient
      entries={entries}
      error={error}
      filters={{
        academicYear,
        eventAcademicYear,
        eventTerm,
        limit,
        offset,
      }}
      currentPage={page}
      availableEventYears={availableEventYears}
      currentUserId={user.id}
    />
  );

  if (adminProfile) {
    return (
      <AdminShell
        currentPath="/leaderboard"
        adminProfile={adminProfile.admin}
        permissions={adminProfile.permissions}
      >
        {content}
      </AdminShell>
    );
  }

  return (
    <StudentShell currentPath="/leaderboard">
      {content}
    </StudentShell>
  );
}
