'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { TeamStatusBanner } from '@/components/teams/team-status-banner';
import { TeamRosterCard } from '@/components/teams/team-roster-card';
import { InvitationCodeCard } from '@/components/teams/invitation-code-card';
import { RegistrationProofCard } from '@/components/teams/registration-proof-card';
import { RoundMilestoneSubmissionCard } from '@/components/submissions/round-milestone-submission-card';
import { SubmissionVersionHistoryCard } from '@/components/submissions/submission-version-history-card';
import type { TeamDetails } from '@/lib/teams/queries';

export interface TeamManageClientProps {
  initialTeam: TeamDetails;
  currentUserId: string;
}

export function TeamManageClient({ initialTeam, currentUserId }: TeamManageClientProps) {
  const router = useRouter();
  const team = initialTeam;
  const isLeader = team.is_leader;
  const hackathon = team.hackathon;

  return (
    <div className="space-y-6">
      <PageHeader
        title={team.name}
        description={`Team console for ${hackathon?.title || 'Hackathon'}`}
        breadcrumbs={[
          { label: 'Portal Hub', href: '/' },
          { label: 'Student Workspace', href: '/student' },
          { label: 'My Teams', href: '/student/teams' },
          { label: team.name },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {hackathon?.slug && (
              <Link
                href={`/student/hackathons/${hackathon.slug}`}
                className="text-xs font-medium text-brand-primary hover:underline"
              >
                View Hackathon Details &rarr;
              </Link>
            )}
          </div>
        }
      />

      {/* Main Status Banner */}
      <TeamStatusBanner
        teamName={team.name}
        hackathonTitle={hackathon?.title || 'Hackathon'}
        isLeader={isLeader}
        internalStatus={team.internal_status}
        externalStatus={team.external_status}
        memberCount={team.members.length}
        minTeamSize={hackathon?.min_team_size || 1}
        maxTeamSize={hackathon?.max_team_size || 4}
        registrationState={hackathon?.registration_state}
        registrationEndAt={hackathon?.registration_end_at}
      />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Team Roster (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-6">
          <TeamRosterCard
            teamId={team.id}
            teamName={team.name}
            members={team.members}
            currentUserId={currentUserId}
            isLeader={isLeader}
            internalStatus={team.internal_status}
            externalStatus={team.external_status}
            minTeamSize={hackathon?.min_team_size || 1}
            maxTeamSize={hackathon?.max_team_size || 4}
          />

          {/* Round Milestone Submissions (Phase 8) */}
          {team.roundMilestones && team.roundMilestones.length > 0 && (
            <div className="space-y-6" id="round-milestone-submissions-section">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-text-primary">
                  Competition Rounds & Milestone Deliverables
                </h2>
                <span className="text-xs text-text-muted">
                  Sequential Round Advancement
                </span>
              </div>

              {team.roundMilestones.map((rm) => (
                <div key={rm.round.id} className="space-y-4">
                  <RoundMilestoneSubmissionCard
                    hackathonId={team.hackathon_id}
                    teamId={team.id}
                    isLeader={isLeader}
                    round={rm.round}
                    isQualified={rm.isQualified}
                    isRegistrationSubmitted={team.external_status !== 'not_submitted'}
                    currentSubmission={rm.currentSubmission}
                    onSubmissionSuccess={() => router.refresh()}
                  />

                  {rm.history && rm.history.length > 0 && (
                    <SubmissionVersionHistoryCard
                      versions={rm.history}
                      teamName={team.name}
                      roundName={`Round ${rm.round.round_number}: ${rm.round.name}`}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Hackathon Rules Reference Card */}
          {hackathon && (
            <Card>
              <CardHeader>
                <CardTitle>Competition Guidelines</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-text-secondary">
                <div className="flex justify-between py-1 border-b border-border-subtle/50">
                  <span>Permitted Team Size:</span>
                  <strong className="text-text-primary">
                    {hackathon.min_team_size === hackathon.max_team_size
                      ? `${hackathon.min_team_size} members`
                      : `${hackathon.min_team_size} to ${hackathon.max_team_size} members`}
                  </strong>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle/50">
                  <span>Solo Entries:</span>
                  <strong className="text-text-primary">
                    {hackathon.is_solo_allowed ? 'Allowed' : 'Team Required'}
                  </strong>
                </div>
                <div className="flex justify-between py-1 border-b border-border-subtle/50">
                  <span>Registration Window:</span>
                  <span className="text-text-primary">
                    {new Date(hackathon.registration_start_at).toLocaleDateString()} —{' '}
                    {new Date(hackathon.registration_end_at).toLocaleDateString()}
                  </span>
                </div>
                {hackathon.is_round_1_paused && (
                  <div className="p-2 bg-status-warning-bg text-status-warning-text rounded-xs mt-2">
                    ⚠ Round 1 is currently paused by organizers. No new registrations can be accepted.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Code Card & Proof Card */}
        <div className="space-y-6">
          {/* Invitation Code (Leader-Only, Forming Phase) */}
          {isLeader && team.internal_status === 'forming' && (
            <InvitationCodeCard
              teamId={team.id}
              invitationCode={team.invitation_code}
              expiresAt={team.invitation_code_expires_at}
              isLeader={isLeader}
              internalStatus={team.internal_status}
            />
          )}

          {/* Registration Proof Card */}
          <RegistrationProofCard
            teamId={team.id}
            isLeader={isLeader}
            canViewProof={team.can_view_proof}
            hasRegistrationProof={team.has_registration_proof}
            externalStatus={team.external_status}
            externalProofSubmittedAt={team.external_proof_submitted_at}
            internalStatus={team.internal_status}
            memberCount={team.members.length}
            minTeamSize={hackathon?.min_team_size || 1}
          />
        </div>
      </div>
    </div>
  );
}
