import React from 'react';
import type { Metadata } from 'next';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { StudentShell } from '@/components/shells/student-shell';
import { PageHeader } from '@/components/layout/page-header';
import {
  getStudentProfileData,
  getStudentProfileChangeRequests,
  getStudentParticipationTimeline,
} from '@/lib/student/queries';
import { ProfileClient } from './profile-client';

export const metadata: Metadata = {
  title: 'Student Profile & Progression — NMIT HackLeague',
};

export default async function StudentProfilePage() {
  await requireApprovedStudent();

  const [profileData, requests, timeline] = await Promise.all([
    getStudentProfileData(),
    getStudentProfileChangeRequests(),
    getStudentParticipationTimeline(),
  ]);

  return (
    <StudentShell
      currentPath="/student/profile"
      studentProfile={{
        full_name: profileData.profile.full_name,
        usn: profileData.profile.usn,
        branch: profileData.profile.branch,
        academic_year: profileData.profile.academic_year,
        profile_photo_path: profileData.profile.profile_photo_path,
        avatarUrl: profileData.avatarUrl,
      }}
    >
      <div className="space-y-6">
        <PageHeader
          title="Student Profile & Progression"
          description="Manage your institutional identity, verified contact details, and comprehensive competition history."
          breadcrumbs={[
            { label: 'Portal Hub', href: '/' },
            { label: 'Student Workspace', href: '/student' },
            { label: 'Profile & History' },
          ]}
        />

        <ProfileClient
          initialData={profileData}
          initialRequests={requests}
          activeCompetitions={timeline.active}
          completedCompetitions={timeline.completed}
        />
      </div>
    </StudentShell>
  );
}
