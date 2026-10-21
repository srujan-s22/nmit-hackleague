'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';
import {
  removeTeamMemberAction,
  leaveTeamAction,
  transferTeamLeadershipAction,
  lockTeamRosterAction,
} from '@/actions/team-actions';
import type { TeamMemberDetail } from '@/lib/teams/queries';

export interface TeamRosterCardProps {
  teamId: string;
  teamName: string;
  members: TeamMemberDetail[];
  currentUserId: string;
  isLeader: boolean;
  internalStatus: string;
  externalStatus: string;
  minTeamSize: number;
  maxTeamSize: number;
  onRosterUpdated?: () => void;
}

export function TeamRosterCard({
  teamId,
  teamName,
  members,
  currentUserId,
  isLeader,
  internalStatus,
  externalStatus,
  minTeamSize,
  maxTeamSize,
  onRosterUpdated,
}: TeamRosterCardProps) {
  const router = useRouter();

  // Dialog States
  const [memberToRemove, setMemberToRemove] = useState<TeamMemberDetail | null>(null);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [newLeaderId, setNewLeaderId] = useState<string>('');
  const [isLockOpen, setIsLockOpen] = useState(false);

  // Loading & Alert States
  const [actionLoading, setActionLoading] = useState(false);
  const [alertState, setAlertState] = useState<{
    variant: 'error' | 'success';
    message: string;
  } | null>(null);

  const isForming = internalStatus === 'forming';
  const isRegistrationNotSubmitted = externalStatus === 'not_submitted';
  const canModifyRoster = isForming && isRegistrationNotSubmitted;
  const canLock = isLeader && isForming && members.length >= minTeamSize;

  const otherMembers = members.filter((m) => m.student_id !== currentUserId);

  // 1. Remove Member
  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    setActionLoading(true);
    setAlertState(null);

    try {
      const res = await removeTeamMemberAction(teamId, memberToRemove.student_id);
      if (!res.success) {
        setAlertState({ variant: 'error', message: res.error || 'Failed to remove member.' });
        setActionLoading(false);
        setMemberToRemove(null);
        return;
      }

      setAlertState({ variant: 'success', message: `${memberToRemove.profile?.full_name || 'Member'} was removed from the team.` });
      setMemberToRemove(null);
      if (onRosterUpdated) onRosterUpdated();
      router.refresh();
    } catch {
      setAlertState({ variant: 'error', message: 'Network error occurred while removing member.' });
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Leave Team
  const handleLeaveTeam = async () => {
    setActionLoading(true);
    setAlertState(null);

    try {
      const res = await leaveTeamAction(teamId);
      if (!res.success) {
        setAlertState({ variant: 'error', message: res.error || 'Failed to leave team.' });
        setActionLoading(false);
        setIsLeaveOpen(false);
        return;
      }

      setIsLeaveOpen(false);
      router.push('/student/teams');
      router.refresh();
    } catch {
      setAlertState({ variant: 'error', message: 'Network error occurred while leaving team.' });
      setActionLoading(false);
    }
  };

  // 3. Transfer Leadership
  const handleTransferLeadership = async () => {
    if (!newLeaderId) return;
    setActionLoading(true);
    setAlertState(null);

    try {
      const res = await transferTeamLeadershipAction(teamId, newLeaderId);
      if (!res.success) {
        setAlertState({ variant: 'error', message: res.error || 'Failed to transfer leadership.' });
        setActionLoading(false);
        setIsTransferOpen(false);
        return;
      }

      setAlertState({ variant: 'success', message: 'Team leadership was successfully transferred.' });
      setIsTransferOpen(false);
      setNewLeaderId('');
      if (onRosterUpdated) onRosterUpdated();
      router.refresh();
    } catch {
      setAlertState({ variant: 'error', message: 'Network error occurred while transferring leadership.' });
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Lock Roster
  const handleLockRoster = async () => {
    setActionLoading(true);
    setAlertState(null);

    try {
      const res = await lockTeamRosterAction(teamId);
      if (!res.success) {
        setAlertState({ variant: 'error', message: res.error || 'Failed to lock team roster.' });
        setActionLoading(false);
        setIsLockOpen(false);
        return;
      }

      setAlertState({ variant: 'success', message: 'Team roster has been locked. Membership is now finalized.' });
      setIsLockOpen(false);
      if (onRosterUpdated) onRosterUpdated();
      router.refresh();
    } catch {
      setAlertState({ variant: 'error', message: 'Network error occurred while locking team roster.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle>Team Roster ({members.length} / {maxTeamSize})</CardTitle>
              <CardDescription>
                {minTeamSize === maxTeamSize
                  ? `Exactly ${minTeamSize} members required.`
                  : `Minimum ${minTeamSize}, maximum ${maxTeamSize} members allowed.`}
              </CardDescription>
            </div>

            {/* Quick Actions Header */}
            <div className="flex items-center gap-2 flex-wrap">
              {isLeader && isForming && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canLock || actionLoading}
                    onClick={() => setIsLockOpen(true)}
                    title={
                      members.length < minTeamSize
                        ? `Cannot lock: need at least ${minTeamSize} members.`
                        : 'Finalize roster and lock membership'
                    }
                  >
                    Lock Roster
                  </Button>

                  {otherMembers.length > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setNewLeaderId(otherMembers[0]?.student_id || '');
                        setIsTransferOpen(true);
                      }}
                    >
                      Transfer Leadership
                    </Button>
                  )}
                </>
              )}

              {canModifyRoster && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsLeaveOpen(true)}
                >
                  {isLeader && members.length === 1 ? 'Disband Team' : 'Leave Team'}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {alertState && (
            <Alert
              variant={alertState.variant}
              onClose={() => setAlertState(null)}
            >
              {alertState.message}
            </Alert>
          )}

          {/* Members Table */}
          <div className="overflow-x-auto border border-border-subtle rounded-md">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle border-b border-border-subtle text-text-secondary font-medium">
                <tr>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Branch & Year</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Joined On</th>
                  {isLeader && canModifyRoster && (
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60 text-text-primary">
                {members.map((member) => {
                  const isCurrent = member.student_id === currentUserId;
                  const isMemberLeader = member.role === 'leader';

                  return (
                    <tr
                      key={member.id}
                      className={isCurrent ? 'bg-brand-primary/5 font-medium' : 'hover:bg-surface-subtle/40'}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          {member.profile?.avatar_url ? (
                            <img
                              src={member.profile.avatar_url}
                              alt={member.profile.full_name || 'Teammate avatar'}
                              className="w-7 h-7 rounded-full object-cover border border-border-subtle"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-surface-muted border border-border-subtle flex items-center justify-center font-semibold text-[10px] text-text-primary select-none shrink-0">
                              {(member.profile?.full_name || 'U')
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="text-text-primary">
                              {member.profile?.full_name || 'Institutional Student'}
                              {isCurrent && (
                                <span className="text-[10px] text-brand-primary ml-1.5 font-bold">
                                  (You)
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-text-muted">
                              {member.profile?.branch ? `${member.profile.branch} Department` : 'Verified Student'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-text-secondary font-medium">
                        {member.profile?.branch
                          ? `${member.profile.branch} • Year ${member.profile.academic_year}`
                          : '—'}
                      </td>
                      <td className="py-3 px-3">
                        {isMemberLeader ? (
                          <Badge variant="info" size="sm">
                            Team Leader
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Member
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-3 text-text-secondary">
                        {new Date(member.joined_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      {isLeader && canModifyRoster && (
                        <td className="py-3 px-3 text-right">
                          {!isMemberLeader && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setMemberToRemove(member)}
                              title={`Remove ${member.profile?.full_name || 'member'} from team`}
                            >
                              Remove
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isForming && (
            <div className="p-3 bg-surface-subtle rounded-sm border border-border-subtle text-xs text-text-secondary">
              <span className="font-semibold text-text-primary">Roster Locked: </span>
              Membership changes are finalized. No additional members can be added, removed, or leave.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 1. Remove Member Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(memberToRemove)}
        onClose={() => !actionLoading && setMemberToRemove(null)}
        title="Remove Team Member?"
        description={`Are you sure you want to remove ${memberToRemove?.profile?.full_name || 'this member'} from ${teamName}?`}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setMemberToRemove(null)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRemoveMember}
              isLoading={actionLoading}
            >
              Remove Member
            </Button>
          </>
        }
      >
        <p className="text-xs text-text-secondary">
          The student will be removed from your team roster immediately. To rejoin, they will need
          a new invitation code from you.
        </p>
      </Dialog>

      {/* 2. Leave Team Confirmation Dialog */}
      <Dialog
        isOpen={isLeaveOpen}
        onClose={() => !actionLoading && setIsLeaveOpen(false)}
        title={isLeader && members.length === 1 ? 'Disband Team?' : 'Leave Team?'}
        description={
          isLeader && members.length === 1
            ? `You are the sole member and leader of ${teamName}. Leaving will permanently disband the team.`
            : `Are you sure you want to leave ${teamName}?`
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsLeaveOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleLeaveTeam}
              isLoading={actionLoading}
            >
              {isLeader && members.length === 1 ? 'Disband Team' : 'Yes, Leave Team'}
            </Button>
          </>
        }
      >
        <p className="text-xs text-text-secondary">
          {isLeader && members.length > 1
            ? 'As the team leader, you must transfer leadership to another member before leaving.'
            : 'You will forfeit your spot on this team. You will be able to join another team if registration is still open.'}
        </p>
      </Dialog>

      {/* 3. Transfer Leadership Dialog */}
      <Dialog
        isOpen={isTransferOpen}
        onClose={() => !actionLoading && setIsTransferOpen(false)}
        title="Transfer Team Leadership"
        description="Select an active team member to become the new team leader."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsTransferOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleTransferLeadership}
              isLoading={actionLoading}
              disabled={!newLeaderId || actionLoading}
            >
              Confirm Transfer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="New Team Leader"
            required
            value={newLeaderId}
            onChange={(e) => setNewLeaderId(e.target.value)}
            disabled={actionLoading}
            options={otherMembers.map((m) => ({
              label: `${m.profile?.full_name || 'Member'} (${m.profile?.roll_number || m.student_id.slice(0, 8)})`,
              value: m.student_id,
            }))}
          />
          <p className="text-xs text-text-secondary">
            Once transferred, the selected member will have full authority over team invitation codes,
            roster locking, and registration proof submissions.
          </p>
        </div>
      </Dialog>

      {/* 4. Lock Roster Confirmation Dialog */}
      <Dialog
        isOpen={isLockOpen}
        onClose={() => !actionLoading && setIsLockOpen(false)}
        title="Lock Team Roster?"
        description="Finalize team composition for this competition."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsLockOpen(false)}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleLockRoster}
              isLoading={actionLoading}
            >
              Yes, Lock Roster
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-text-secondary">
          <p>
            Locking the roster sets the team status to <strong className="text-text-primary">Complete</strong>.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>No new members can join using your invitation code.</li>
            <li>Members cannot leave or be removed.</li>
            <li>You can now proceed to submit your external registration proof screenshot.</li>
          </ul>
        </div>
      </Dialog>
    </>
  );
}
