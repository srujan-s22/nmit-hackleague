'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RegistrationStateBadge } from '@/components/hackathons/registration-state-badge';
import { CreateTeamDialog, type HackathonOption } from '@/components/teams/create-team-dialog';
import { JoinTeamDialog } from '@/components/teams/join-team-dialog';
import { formatDate } from '@/lib/utils/date-format';
import type { StudentTeamSummary } from '@/lib/teams/queries';

export interface TeamsClientProps {
  initialTeams: StudentTeamSummary[];
  availableHackathons: HackathonOption[];
  preselectedHackathonId?: string;
  initialAction?: 'create' | 'join';
}

export function TeamsClient({
  initialTeams,
  availableHackathons,
  preselectedHackathonId,
  initialAction,
}: TeamsClientProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(initialAction === 'create');
  const [isJoinOpen, setIsJoinOpen] = useState(initialAction === 'join');
  const [filterHackathon, setFilterHackathon] = useState<string>('all');

  const filteredTeams = initialTeams.filter((t) => {
    if (filterHackathon === 'all') return true;
    return t.hackathon_id === filterHackathon;
  });

  // Unique hackathons student is participating in
  const teamHackathons = Array.from(
    new Set(initialTeams.map((t) => t.hackathon).filter(Boolean))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Teams"
        description="Form and manage your hackathon teams, coordinate rosters, and submit registration proofs."
        breadcrumbs={[
          { label: 'Portal Hub', href: '/' },
          { label: 'Student Workspace', href: '/student' },
          { label: 'My Teams' },
        ]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsJoinOpen(true)}
              leftIcon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
              }
            >
              Join with Code
            </Button>
            {availableHackathons.length > 0 && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                leftIcon={
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                }
              >
                Create Team
              </Button>
            )}
          </div>
        }
      />

      {/* Filter Tabs if multiple hackathons */}
      {teamHackathons.length > 1 && (
        <div className="flex items-center gap-2 border-b border-border-subtle pb-2 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setFilterHackathon('all')}
            className={`px-3 py-1.5 rounded-xs font-medium transition-colors ${
              filterHackathon === 'all'
                ? 'bg-surface-inverse text-text-inverse'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            All Competitions ({initialTeams.length})
          </button>
          {teamHackathons.map((h) => (
            <button
              key={h?.id}
              type="button"
              onClick={() => setFilterHackathon(h?.id || '')}
              className={`px-3 py-1.5 rounded-xs font-medium transition-colors truncate max-w-xs ${
                filterHackathon === h?.id
                  ? 'bg-surface-inverse text-text-inverse'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {h?.title}
            </button>
          ))}
        </div>
      )}

      {/* Teams Grid / Empty State */}
      {filteredTeams.length === 0 ? (
        <EmptyState
          title="No Teams Found"
          description={
            initialTeams.length === 0
              ? 'You have not formed or joined any hackathon teams yet. Create a new team or join with an invitation code.'
              : 'No teams match the selected competition filter.'
          }
          action={
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsJoinOpen(true)}
              >
                Join with Code
              </Button>
              {availableHackathons.length > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsCreateOpen(true)}
                >
                  Create Team
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTeams.map((team) => {
            const isLeader = team.is_leader;
            const isForming = team.internal_status === 'forming';

            return (
              <Card
                key={team.id}
                className="flex flex-col justify-between hover:border-text-primary/40 transition-colors"
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-medium text-text-secondary truncate">
                      {team.hackathon?.title || 'Hackathon'}
                    </span>
                    {team.hackathon?.registration_state && (
                      <RegistrationStateBadge state={team.hackathon.registration_state} />
                    )}
                  </div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span className="truncate">{team.name}</span>
                    {isLeader ? (
                      <Badge variant="info" size="sm">Leader</Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">Member</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Joined on {formatDate(team.joined_at)}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-border-subtle/60">
                    <span className="text-text-secondary">Roster Status:</span>
                    <Badge variant={isForming ? 'warning' : 'success'} size="sm" dot>
                      {isForming ? 'Forming' : 'Locked'}
                    </Badge>
                  </div>

                  <div className="flex justify-between py-1.5 border-b border-border-subtle/60">
                    <span className="text-text-secondary">Registration Proof:</span>
                    <Badge
                      variant={
                        team.external_status === 'submitted'
                          ? 'success'
                          : team.external_status === 'rejected'
                          ? 'error'
                          : 'neutral'
                      }
                      size="sm"
                      dot
                    >
                      {team.external_status === 'submitted'
                        ? 'Submitted'
                        : team.external_status === 'rejected'
                        ? 'Rejected'
                        : 'Not Submitted'}
                    </Badge>
                  </div>

                  {isLeader && isForming && team.invitation_code && (
                    <div className="flex justify-between py-1.5 border-b border-border-subtle/60 font-mono">
                      <span className="text-text-secondary">Invite Code:</span>
                      <span className="font-bold text-text-primary">{team.invitation_code}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    <Link
                      href={`/student/teams/${team.id}`}
                      className="w-full inline-flex items-center justify-center font-medium rounded-sm transition-colors text-xs px-3 py-2 bg-surface-subtle hover:bg-surface-muted text-text-primary border border-border-subtle"
                    >
                      Manage Team &rarr;
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateTeamDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        hackathons={availableHackathons}
        preselectedHackathonId={preselectedHackathonId}
      />

      <JoinTeamDialog
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
      />
    </div>
  );
}
