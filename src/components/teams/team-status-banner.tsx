'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { RegistrationStateBadge } from '@/components/hackathons/registration-state-badge';
import type { RegistrationState } from '@/types/hackathon';

export interface TeamStatusBannerProps {
  teamName: string;
  hackathonTitle: string;
  isLeader: boolean;
  internalStatus: string;
  externalStatus: string;
  memberCount: number;
  minTeamSize: number;
  maxTeamSize: number;
  registrationState?: RegistrationState;
  registrationEndAt?: string;
}

export function TeamStatusBanner({
  teamName,
  hackathonTitle,
  isLeader,
  internalStatus,
  externalStatus,
  memberCount,
  minTeamSize,
  maxTeamSize,
  registrationState,
  registrationEndAt,
}: TeamStatusBannerProps) {
  const isForming = internalStatus === 'forming';

  const getInternalBadge = () => {
    if (isForming) {
      return (
        <Badge variant="warning" dot size="sm">
          Forming Roster
        </Badge>
      );
    }
    return (
      <Badge variant="success" dot size="sm">
        Roster Finalized
      </Badge>
    );
  };

  const getExternalBadge = () => {
    switch (externalStatus) {
      case 'verified':
        return (
          <Badge variant="success" dot size="sm">
            Registration Approved
          </Badge>
        );
      case 'submitted':
        return (
          <Badge variant="info" dot size="sm">
            Proof Submitted (Review Pending)
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="error" dot size="sm">
            Proof Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="neutral" dot size="sm">
            Registration Proof Not Submitted
          </Badge>
        );
    }
  };

  const formattedDeadline = registrationEndAt
    ? new Date(registrationEndAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="bg-surface-canvas border border-border-subtle rounded-md p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs text-text-secondary font-medium">
              {hackathonTitle}
            </span>
            <span>&bull;</span>
            {isLeader ? (
              <Badge variant="info" size="sm">Team Leader</Badge>
            ) : (
              <Badge variant="neutral" size="sm">Team Member</Badge>
            )}
            {registrationState && <RegistrationStateBadge state={registrationState} />}
          </div>
          <h2 className="text-2xl font-bold text-text-primary tracking-tight">
            {teamName}
          </h2>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {getInternalBadge()}
          {getExternalBadge()}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-border-subtle/60 text-xs">
        <div>
          <span className="text-text-muted block">Team Roster:</span>
          <span className="font-semibold text-text-primary">
            {memberCount} / {maxTeamSize} Members
            {memberCount < minTeamSize && (
              <span className="text-status-error-text ml-1.5 font-normal">
                (Need {minTeamSize - memberCount} more)
              </span>
            )}
          </span>
        </div>

        <div>
          <span className="text-text-muted block">Internal Status:</span>
          <span className="font-semibold capitalize text-text-primary">
            {isForming ? 'Open for Invitations' : 'Locked & Ready'}
          </span>
        </div>

        <div>
          <span className="text-text-muted block">Registration Deadline:</span>
          <span className="font-semibold text-text-primary">
            {formattedDeadline || 'See event page'}
          </span>
        </div>
      </div>
    </div>
  );
}
