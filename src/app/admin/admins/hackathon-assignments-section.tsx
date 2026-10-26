'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/alert';
import { AssignAdminDialog } from './assign-admin-dialog';
import { RemoveAssignmentDialog } from './remove-assignment-dialog';
import {
  fetchHackathonsForAssignmentAction,
  fetchActiveAdminsForAssignmentAction,
  fetchHackathonAssignmentsAction,
  type HackathonAssignmentItem,
} from '@/actions/admin-assignment-actions';
import { formatDate } from '@/lib/utils/date-format';

interface HackathonItem {
  id: string;
  title: string;
  slug: string;
  status: string;
  mode: string;
  venue: string | null;
  in_charge_admin_id: string | null;
  event_start_at: string;
  event_end_at: string;
}

interface ActiveAdminItem {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  is_super_admin: boolean;
}

interface HackathonAssignmentsSectionProps {
  isSuperAdmin: boolean;
  canAssignHackathons: boolean;
  currentAdminId: string;
}

export function HackathonAssignmentsSection({
  isSuperAdmin: _isSuperAdmin,
  canAssignHackathons: _canAssignHackathons,
  currentAdminId: _currentAdminId,
}: HackathonAssignmentsSectionProps) {
  const [hackathons, setHackathons] = useState<HackathonItem[]>([]);
  const [selectedHackathonId, setSelectedHackathonId] = useState<string>('');
  const [assignments, setAssignments] = useState<HackathonAssignmentItem[]>([]);
  const [inChargeAdminId, setInChargeAdminId] = useState<string | null>(null);
  const [activeAdmins, setActiveAdmins] = useState<ActiveAdminItem[]>([]);
  const [isLoadingHackathons, setIsLoadingHackathons] = useState(true);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Dialog states
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [removingAssignment, setRemovingAssignment] = useState<{
    id: string;
    hackathon_id: string;
    admin_id: string;
    admin_name: string;
    admin_email: string;
    role: string;
    hackathon_title: string;
    is_in_charge?: boolean;
  } | null>(null);

  // 1. Load initial hackathons and active administrators on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [hRes, aRes] = await Promise.all([
          fetchHackathonsForAssignmentAction(),
          fetchActiveAdminsForAssignmentAction(),
        ]);

        if (!isMounted) return;

        if (hRes.success && hRes.data) {
          const list = hRes.data;
          setHackathons(list);
          if (list.length > 0) {
            setSelectedHackathonId((prev) => prev || list[0].id);
          }
        } else {
          setError(hRes.error || 'Failed to load hackathons.');
        }

        if (aRes.success && aRes.data) {
          setActiveAdmins(aRes.data);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'An error occurred while loading initial data.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingHackathons(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Load assignments for selected hackathon
  const loadAssignments = useCallback(async (hackathonId: string) => {
    if (!hackathonId) {
      setAssignments([]);
      return;
    }
    setIsLoadingAssignments(true);
    try {
      const res = await fetchHackathonAssignmentsAction(hackathonId);
      if (res.success && res.data) {
        setAssignments(res.data.assignments);
        setInChargeAdminId(res.data.inChargeAdminId);
      } else {
        setError(res.error || 'Failed to fetch assignments.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while fetching assignments.');
    } finally {
      setIsLoadingAssignments(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedHackathonId) return;
    let isMounted = true;
    fetchHackathonAssignmentsAction(selectedHackathonId)
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          setAssignments(res.data.assignments);
          setInChargeAdminId(res.data.inChargeAdminId);
        } else {
          setError(res.error || 'Failed to fetch assignments.');
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'An error occurred while fetching assignments.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingAssignments(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedHackathonId]);

  const selectedHackathon = hackathons.find((h) => h.id === selectedHackathonId) || null;
  const existingAssignedAdminIds = assignments.map((a) => a.admin_id);

  const handleAssignmentSuccess = () => {
    setFeedback({
      type: 'success',
      message: 'Administrator assignment updated successfully.',
    });
    if (selectedHackathonId) {
      loadAssignments(selectedHackathonId);
    }
  };

  const handleRemovalSuccess = () => {
    setFeedback({
      type: 'success',
      message: 'Administrator unassigned successfully.',
    });
    if (selectedHackathonId) {
      loadAssignments(selectedHackathonId);
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <Alert
          variant={feedback.type === 'success' ? 'success' : 'error'}
          title={feedback.type === 'success' ? 'Success' : 'Notice'}
        >
          {feedback.message}
        </Alert>
      )}

      {error && (
        <Alert variant="error" title="Error">
          {error}
        </Alert>
      )}

      {/* Hackathon Selection & Actions Header */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">
              Select Institutional Hackathon
            </label>
            {isLoadingHackathons ? (
              <div className="h-9 w-72 bg-surface-subtle animate-pulse rounded-xs" />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedHackathonId}
                  onChange={(e) => setSelectedHackathonId(e.target.value)}
                  className="w-full sm:w-80 h-9 px-3 text-xs bg-surface-canvas border border-border-subtle rounded-xs focus:outline-none focus:ring-1 focus:ring-brand-primary"
                >
                  {hackathons.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.title} ({h.status.replace('_', ' ')})
                    </option>
                  ))}
                </select>

                {selectedHackathon && (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        selectedHackathon.status === 'published'
                          ? 'success'
                          : selectedHackathon.status === 'draft'
                          ? 'neutral'
                          : 'neutral'
                      }
                      size="sm"
                      className="capitalize"
                    >
                      {selectedHackathon.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-text-muted">
                      {formatDate(selectedHackathon.event_start_at)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setIsAssignOpen(true)}
              disabled={!selectedHackathon || isLoadingAssignments}
            >
              + Assign Reviewers
            </Button>
          </div>
        </div>
      </Card>

      {/* Current Assignments Table */}
      <Card className="overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-primary">
              Assigned Administrators ({assignments.length})
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Administrators assigned to review submissions or coordinate operations for{' '}
              <span className="font-medium text-text-primary">
                {selectedHackathon?.title || 'this event'}
              </span>
              .
            </p>
          </div>

          <span className="text-[11px] text-text-muted">
            Multiple admins per hackathon supported
          </span>
        </div>

        {isLoadingAssignments ? (
          <div className="p-10 flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
              <span>Loading assignments...</span>
            </div>
          </div>
        ) : assignments.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No Administrators Assigned"
              description="No reviewers or coordinators have been assigned to this hackathon yet. Click '+ Assign Reviewers' to assign active administrators."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-subtle text-text-secondary font-medium border-b border-border-subtle">
                <tr>
                  <th className="py-2.5 px-4">Administrator</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Role</th>
                  <th className="py-2.5 px-4">Assigned On</th>
                  <th className="py-2.5 px-4">Assigned By</th>
                  <th className="py-2.5 px-4">Notes</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface-canvas">
                {assignments.map((assignment) => {
                  const isInCharge = assignment.admin_id === inChargeAdminId;
                  const isTargetActive = assignment.admin?.is_active ?? true;

                  return (
                    <tr
                      key={assignment.id}
                      className={`hover:bg-surface-subtle/50 transition-colors ${
                        !isTargetActive ? 'opacity-60 bg-status-error-bg/5' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-text-primary">
                          {assignment.admin?.full_name || 'Unknown Admin'}
                        </div>
                        <div className="text-[11px] text-text-muted">
                          {assignment.admin?.email}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {isTargetActive ? (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge
                            variant="error"
                            size="sm"
                            title="Inactive administrator account: effective access is strictly blocked at database RPC, guard, and storage layers."
                          >
                            Inactive (Blocked)
                          </Badge>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={
                              isInCharge
                                ? 'success'
                                : assignment.role === 'coordinator'
                                ? 'neutral'
                                : 'neutral'
                            }
                            size="sm"
                            className="capitalize"
                          >
                            {assignment.role === 'in_charge' ? 'In charge' : assignment.role}
                          </Badge>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-text-secondary">
                        {formatDate(assignment.assigned_at)}
                      </td>

                      <td className="py-3 px-4 text-text-secondary">
                        {assignment.assigner?.full_name || 'System / Direct'}
                      </td>

                      <td className="py-3 px-4 text-text-muted max-w-xs truncate" title={assignment.notes || ''}>
                        {assignment.notes && !/^(Synchronized automatically|Automated initial backfill)/.test(assignment.notes)
                          ? assignment.notes
                          : '—'}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isInCharge ? (
                          <span
                            className="text-[11px] text-text-muted italic"
                            title="Primary in-charge admin cannot be unassigned directly. Use Reassign In-Charge to replace."
                          >
                            In-Charge
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-status-error-text hover:bg-status-error-bg/10 hover:border-status-error-border text-[11px] py-1 px-2.5 h-auto"
                            onClick={() =>
                              setRemovingAssignment({
                                id: assignment.id,
                                hackathon_id: assignment.hackathon_id,
                                admin_id: assignment.admin_id,
                                admin_name: assignment.admin?.full_name || 'Admin',
                                admin_email: assignment.admin?.email || '',
                                role: assignment.role,
                                hackathon_title: selectedHackathon?.title || 'Hackathon',
                                is_in_charge: isInCharge,
                              })
                            }
                          >
                            Unassign
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Assign Admin Dialog */}
      <AssignAdminDialog
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        hackathon={selectedHackathon}
        activeAdmins={activeAdmins}
        existingAssignedAdminIds={existingAssignedAdminIds}
        onSuccess={handleAssignmentSuccess}
      />

      {/* Remove Assignment Dialog */}
      <RemoveAssignmentDialog
        isOpen={Boolean(removingAssignment)}
        onClose={() => setRemovingAssignment(null)}
        assignment={removingAssignment}
        onSuccess={handleRemovalSuccess}
      />
    </div>
  );
}
