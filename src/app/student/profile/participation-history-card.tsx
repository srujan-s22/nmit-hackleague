'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CompetitionParticipationItem } from '@/lib/student/queries';

export interface ParticipationHistoryCardProps {
  activeCompetitions: CompetitionParticipationItem[];
  completedCompetitions: CompetitionParticipationItem[];
}

export function ParticipationHistoryCard({
  activeCompetitions,
  completedCompetitions,
}: ParticipationHistoryCardProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  const items = activeTab === 'active' ? activeCompetitions : completedCompetitions;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Hackathon Participation History</CardTitle>
            <CardDescription>
              Your teams and round progress.
            </CardDescription>
          </div>

          {/* Tab buttons */}
          <div className="flex items-center gap-1.5 p-1 bg-surface-subtle border border-border-subtle rounded-lg self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'active'
                  ? 'bg-surface-canvas text-text-primary shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Active Competitions ({activeCompetitions.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('completed')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeTab === 'completed'
                  ? 'bg-surface-canvas text-text-primary shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Completed History ({completedCompetitions.length})
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <div className="py-12 px-4 text-center border border-dashed border-border-subtle rounded-lg bg-surface-subtle/50">
            <svg
              className="w-10 h-10 mx-auto text-text-helper mb-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 14 14" />
            </svg>
            <p className="text-sm font-medium text-text-primary mb-1">
              No {activeTab} hackathon participations found
            </p>
            <p className="text-xs text-text-secondary mb-4">
              {activeTab === 'active'
                ? 'You are not currently enrolled in any active hackathons.'
                : 'You have not completed any hackathons yet.'}
            </p>
            {activeTab === 'active' && (
              <Link
                href="/student/hackathons"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary hover:underline"
              >
                Browse Open Hackathons &rarr;
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.teamId}
                className="border border-border-subtle rounded-lg p-5 bg-surface-canvas hover:border-border-strong transition-colors"
              >
                {/* Event & Team Header */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link
                        href={`/student/teams/${item.teamId}`}
                        className="text-base font-semibold text-text-primary hover:text-brand-primary transition-colors"
                      >
                        {item.hackathonTitle}
                      </Link>
                      <Badge variant="neutral" size="sm">
                        Team: {item.teamName}
                      </Badge>
                      <Badge
                        variant={item.role === 'leader' ? 'info' : 'neutral'}
                        size="sm"
                      >
                        {item.role === 'leader' ? 'Team Leader' : 'Team Member'}
                      </Badge>
                    </div>

                    <p className="text-xs text-text-secondary">
                      Internal Status: <span className="font-medium capitalize text-text-primary">{item.internalStatus}</span>
                      {' • '}
                      Registration Proof:{' '}
                      {item.externalStatusLabel === 'Submitted Claim' ? (
                        <span className="text-status-success font-semibold">Submitted</span>
                      ) : item.externalStatusLabel === 'Rejected' ? (
                        <span className="text-status-error font-semibold">Claim Rejected</span>
                      ) : (
                        <span className="text-text-helper font-medium">Not Submitted</span>
                      )}
                    </p>
                  </div>

                  <Link
                    href={`/student/teams/${item.teamId}`}
                    className="self-start text-xs font-semibold text-brand-primary hover:underline"
                  >
                    View Team &rarr;
                  </Link>
                </div>

                {/* Teammates Roster (Privacy-Preserved: Branch & Year, No USN) */}
                <div className="border-t border-border-subtle/70 pt-3 mb-3">
                  <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Teammates ({item.teammates.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.teammates.map((teammate) => (
                      <div
                        key={teammate.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 bg-surface-subtle border border-border-subtle rounded-md text-xs"
                      >
                        {teammate.avatarUrl ? (
                          <img
                            src={teammate.avatarUrl}
                            alt={teammate.fullName}
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-surface-muted flex items-center justify-center font-bold text-[9px] text-text-secondary">
                            {teammate.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-text-primary">
                          {teammate.fullName}
                        </span>
                        <span className="text-[10px] text-text-helper">
                          ({teammate.branch} • Y{teammate.academicYear})
                        </span>
                        {teammate.role === 'leader' && (
                          <span className="text-[10px] font-bold text-brand-primary">
                            ★
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Round Milestones Progression */}
                {item.milestones.length > 0 && (
                  <div className="border-t border-border-subtle/70 pt-3">
                    <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-2">
                      Round Milestones
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {item.milestones.map((m) => (
                        <div
                          key={m.roundId}
                          className="flex items-center justify-between p-2 rounded-md bg-surface-subtle/60 border border-border-subtle/60 text-xs"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-text-secondary truncate">
                              {/^round\s*\d+/i.test(m.roundName.trim()) ? m.roundName : `Round ${m.roundNumber}: ${m.roundName}`}
                            </span>
                          </div>
                          {m.isQualified ? (
                            <Badge variant="success" size="sm">
                              Qualified
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm" className="capitalize">
                              {m.status}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
