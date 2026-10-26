import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { StudentShell } from '@/components/shells/student-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EventCard } from '@/components/hackathons/event-card';
import {
  getStudentProfileData,
  getStudentParticipationTimeline,
} from '@/lib/student/queries';
import type { HackathonPublicView } from '@/types/hackathon';

export const metadata: Metadata = {
  title: 'Student Command Center — NMIT HackLeague',
};

export default async function StudentPortalPage() {
  await requireApprovedStudent();
  const supabase = await createClient();

  const [profileData, timeline, { data: upcomingEvents }] = await Promise.all([
    getStudentProfileData(),
    getStudentParticipationTimeline(),
    supabase
      .from('hackathons_public_view')
      .select('*')
      .order('event_start_at', { ascending: true })
      .limit(3),
  ]);

  const profile = profileData.profile;
  const events = (upcomingEvents as HackathonPublicView[]) || [];
  const activeTeams = timeline.active;

  return (
    <StudentShell
      currentPath="/student"
      studentProfile={{
        full_name: profile.full_name,
        usn: profile.usn,
        branch: profile.branch,
        academic_year: profile.academic_year,
        profile_photo_path: profile.profile_photo_path,
        avatarUrl: profileData.avatarUrl,
      }}
    >
      <div className="space-y-8">
        <PageHeader
          title={`Welcome back, ${profile.full_name}`}
          description={`USN: ${profile.usn} • ${profile.branch} Department • Year ${profile.academic_year}`}
          breadcrumbs={[
            { label: 'Portal Hub', href: '/' },
            { label: 'Student Workspace' },
          ]}
        />

        {/* 1. Key Operational Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Points */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Total Points
                </span>
                <span className="text-brand-primary text-base">★</span>
              </div>
              <p className="text-2xl font-bold text-brand-primary">
                {profileData.totalPoints.toLocaleString()}
              </p>
              <Link
                href="/student/points"
                className="text-[11px] font-medium text-brand-primary hover:underline mt-1 inline-block"
              >
                View Points Ledger &rarr;
              </Link>
            </CardContent>
          </Card>

          {/* Platform Rank */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Platform Rank
                </span>
                <span className="text-text-helper text-xs">#</span>
              </div>
              <p className="text-2xl font-bold text-text-primary">
                {profileData.rank !== null && profileData.totalPoints > 0 ? `#${profileData.rank}` : 'Unranked'}
              </p>
              <Link
                href="/leaderboard"
                className="text-[11px] font-medium text-brand-primary hover:underline mt-1 inline-block"
              >
                View Leaderboard &rarr;
              </Link>
            </CardContent>
          </Card>

          {/* Verified Qualifications */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Qualifications
                </span>
                <Badge variant="success" size="sm">Rounds</Badge>
              </div>
              <p className="text-2xl font-bold text-text-primary">
                {profileData.verifiedQualificationsCount}
              </p>
              <p className="text-[11px] text-text-secondary mt-1">
                Verified milestone rounds passed
              </p>
            </CardContent>
          </Card>

          {/* Submitted Claims (Distinct from verified) */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Submitted Claims
                </span>
                <Badge variant="warning" size="sm">Pending</Badge>
              </div>
              <p className="text-2xl font-bold text-status-warning">
                {profileData.submittedClaimsCount}
              </p>
              <p className="text-[11px] text-text-secondary mt-1">
                External proofs under review
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 2. Active Competitions Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text-primary">My Active Competitions</h2>
              <p className="text-xs text-text-secondary">
                Hackathons you are currently participating in with your team.
              </p>
            </div>
            <Link
              href="/student/teams"
              className="text-xs font-semibold text-brand-primary hover:underline"
            >
              All My Teams &rarr;
            </Link>
          </div>

          {activeTeams.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-surface-subtle border border-border-subtle flex items-center justify-center text-text-secondary">
                  <svg
                    className="w-6 h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-text-primary">No Active Hackathon Enrolments</h3>
                <p className="text-xs text-text-secondary max-w-md mx-auto">
                  You are not in an active hackathon yet. Browse events to create a team, or join one with an invitation code.
                </p>
                <div className="pt-2 flex justify-center gap-3">
                  <Link href="/student/hackathons">
                    <Button variant="primary" size="sm">
                      Browse Hackathons
                    </Button>
                  </Link>
                  <Link href="/student/teams">
                    <Button variant="outline" size="sm">
                      Join Team With Code
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeTeams.map((team) => (
                <Card key={team.teamId} className="hover:border-border-strong transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <CardTitle className="text-base">{team.hackathonTitle}</CardTitle>
                          <Badge variant={team.role === 'leader' ? 'info' : 'neutral'} size="sm">
                            {team.role === 'leader' ? 'Team Leader' : 'Member'}
                          </Badge>
                        </div>
                        <CardDescription>
                          Team: <span className="font-semibold text-text-primary">{team.teamName}</span>
                          {' • '}
                          Roster: <span className="font-medium capitalize text-text-primary">{team.internalStatus}</span>
                        </CardDescription>
                      </div>

                      <Link href={`/student/teams/${team.teamId}`}>
                        <Button variant="outline" size="sm">
                          Team Hub
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-0">
                    {/* Registration Status Pill */}
                    <div className="p-2.5 rounded-md bg-surface-subtle border border-border-subtle flex items-center justify-between text-xs">
                      <span className="text-text-secondary">Registration Proof:</span>
                      {team.externalStatusLabel === 'Submitted Claim' ? (
                        <Badge variant="success" size="sm">Submitted</Badge>
                      ) : team.externalStatusLabel === 'Rejected' ? (
                        <Badge variant="error" size="sm">Proof Rejected</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Proof Not Submitted</Badge>
                      )}
                    </div>

                    {/* Teammates Preview (Privacy Preserved: Branch & Year, No USN) */}
                    <div>
                      <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                        Squad ({team.teammates.length} Members)
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {team.teammates.map((teammate) => (
                          <div
                            key={teammate.id}
                            className="flex items-center gap-1.5 px-2 py-1 bg-surface-canvas border border-border-subtle rounded text-xs"
                          >
                            <span className="font-medium text-text-primary">
                              {teammate.fullName}
                            </span>
                            <span className="text-[10px] text-text-helper">
                              ({teammate.branch})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* 3. Upcoming Competitions & Quick Navigation Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Upcoming Hackathons (2 cols) */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Upcoming Competitions</CardTitle>
                  <CardDescription>
                    Open for registration.
                  </CardDescription>
                </div>
                <Link
                  href="/student/hackathons"
                  className="text-xs font-semibold text-brand-primary hover:underline"
                >
                  View Catalogue &rarr;
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="bg-surface-subtle border border-border-subtle rounded-md p-6 text-center text-xs text-text-secondary">
                  <p className="font-medium text-text-primary mb-1">
                    No active competitions published yet
                  </p>
                  <p>
                    New departmental and college-wide hackathons will appear here once published.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {events.slice(0, 2).map((event) => (
                    <EventCard key={event.id} hackathon={event} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Shortcuts (1 col) */}
          <Card>
            <CardHeader>
              <CardTitle>Workspace Shortcuts</CardTitle>
              <CardDescription>Quick access to student services</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Link
                href="/student/profile"
                className="flex items-center justify-between p-3 rounded-lg border border-border-subtle bg-surface-subtle/50 hover:bg-surface-subtle transition-colors group"
              >
                <div>
                  <span className="text-xs font-semibold text-text-primary block">
                    My Profile & Credentials
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    Identity, phone, and change requests
                  </span>
                </div>
                <span className="text-text-helper group-hover:text-text-primary transition-colors text-xs font-bold">
                  &rarr;
                </span>
              </Link>

              <Link
                href="/student/teams"
                className="flex items-center justify-between p-3 rounded-lg border border-border-subtle bg-surface-subtle/50 hover:bg-surface-subtle transition-colors group"
              >
                <div>
                  <span className="text-xs font-semibold text-text-primary block">
                    Team Management
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    Invites, rosters, and registration proof
                  </span>
                </div>
                <span className="text-text-helper group-hover:text-text-primary transition-colors text-xs font-bold">
                  &rarr;
                </span>
              </Link>

              <Link
                href="/student/points"
                className="flex items-center justify-between p-3 rounded-lg border border-border-subtle bg-surface-subtle/50 hover:bg-surface-subtle transition-colors group"
              >
                <div>
                  <span className="text-xs font-semibold text-text-primary block">
                    Points & Awards Ledger
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    Transaction history and qualification audit
                  </span>
                </div>
                <span className="text-text-helper group-hover:text-text-primary transition-colors text-xs font-bold">
                  &rarr;
                </span>
              </Link>

              <Link
                href="/leaderboard"
                className="flex items-center justify-between p-3 rounded-lg border border-border-subtle bg-surface-subtle/50 hover:bg-surface-subtle transition-colors group"
              >
                <div>
                  <span className="text-xs font-semibold text-text-primary block">
                    Platform Leaderboard
                  </span>
                  <span className="text-[11px] text-text-secondary">
                    Global standings and department rank
                  </span>
                </div>
                <span className="text-text-helper group-hover:text-text-primary transition-colors text-xs font-bold">
                  &rarr;
                </span>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentShell>
  );
}
