'use client';

import React, { useState, useTransition } from 'react';
import type { PointConfiguration, StudentPointsSummary } from '@/types/points';
import type { AdminProfile } from '@/types/auth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Dialog } from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  adjustPointsAction,
  reversePointsAction,
} from '@/actions/points-adjustment-actions';
import { updatePointConfigurationAction } from '@/actions/point-config-actions';

interface AdminPointsClientProps {
  admin: AdminProfile;
  configs: PointConfiguration[];
  hackathons: Array<{ id: string; title: string; status: string }>;
  configError?: string;
}

export function AdminPointsClient({
  admin,
  configs: initialConfigs,
  hackathons,
  configError,
}: AdminPointsClientProps) {
  const isSuperAdmin = Boolean(admin.is_super_admin);
  const [activeTab, setActiveTab] = useState<'adjustments' | 'configurations'>('adjustments');

  // Adjustment Form State
  const [adjStudentId, setAdjStudentId] = useState('');
  const [adjHackathonId, setAdjHackathonId] = useState(hackathons[0]?.id || '');
  const [adjTeamId, setAdjTeamId] = useState('');
  const [adjPoints, setAdjPoints] = useState<number | ''>('');
  const [adjReason, setAdjReason] = useState('');
  const [adjEntryId, setAdjEntryId] = useState('');
  const [adjOverrideFloor, setAdjOverrideFloor] = useState(false);
  const [adjFeedback, setAdjFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  // Reversal Form State
  const [revLedgerId, setRevLedgerId] = useState('');
  const [revReason, setRevReason] = useState('');
  const [revFeedback, setRevFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  // Configuration Edit State
  const [configs, setConfigs] = useState<PointConfiguration[]>(initialConfigs);
  const [editingConfig, setEditingConfig] = useState<PointConfiguration | null>(null);
  const [editRegularPts, setEditRegularPts] = useState<number>(0);
  const [editLeaderPts, setEditLeaderPts] = useState<number>(0);
  const [configFeedback, setConfigFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  const [isPending, startTransition] = useTransition();

  // Handlers
  const handleAdjustmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdjFeedback(null);

    if (!adjPoints || adjPoints === 0) {
      setAdjFeedback({ success: false, message: 'Points amount cannot be zero.' });
      return;
    }

    if (adjReason.trim().length < 10) {
      setAdjFeedback({ success: false, message: 'Reason must be at least 10 non-whitespace characters.' });
      return;
    }

    const idempotencyKey = `manual_adj_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    startTransition(async () => {
      const res = await adjustPointsAction({
        studentId: adjStudentId.trim(),
        hackathonId: adjHackathonId,
        teamId: adjTeamId.trim(),
        points: Number(adjPoints),
        reason: adjReason.trim(),
        idempotencyKey,
        adjustedEntryId: adjEntryId.trim() || undefined,
        overrideNegativeFloor: adjOverrideFloor,
      });

      if (res.success) {
        setAdjFeedback({
          success: true,
          message: `Successfully recorded adjustment of ${res.points} points (Ledger ID: ${res.ledgerId}).`,
        });
        setAdjPoints('');
        setAdjReason('');
        setAdjEntryId('');
      } else {
        setAdjFeedback({
          success: false,
          message: res.error || 'Failed to adjust points.',
        });
      }
    });
  };

  const handleReversalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRevFeedback(null);

    if (revReason.trim().length < 10) {
      setRevFeedback({ success: false, message: 'Reason must be at least 10 non-whitespace characters.' });
      return;
    }

    startTransition(async () => {
      const res = await reversePointsAction({
        ledgerId: revLedgerId.trim(),
        reason: revReason.trim(),
      });

      if (res.success) {
        setRevFeedback({
          success: true,
          message: `Successfully reversed entry. Created reversal record with ${res.reversedPoints} points (ID: ${res.reversalLedgerId}).`,
        });
        setRevLedgerId('');
        setRevReason('');
      } else {
        setRevFeedback({
          success: false,
          message: res.error || 'Failed to reverse points entry.',
        });
      }
    });
  };

  const handleOpenConfigModal = (config: PointConfiguration) => {
    setEditingConfig(config);
    setEditRegularPts(config.regular_member_points);
    setEditLeaderPts(config.team_leader_points);
    setConfigFeedback(null);
  };

  const handleSaveConfig = () => {
    if (!editingConfig) return;
    setConfigFeedback(null);

    startTransition(async () => {
      const res = await updatePointConfigurationAction({
        milestoneType: editingConfig.milestone_type,
        regularMemberPoints: Number(editRegularPts),
        teamLeaderPoints: Number(editLeaderPts),
      });

      if (res.success && res.config) {
        setConfigs((prev) =>
          prev.map((c) => (c.milestone_type === res.config?.milestone_type ? res.config : c))
        );
        setEditingConfig(null);
      } else {
        setConfigFeedback({
          success: false,
          message: res.error || 'Failed to update configuration.',
        });
      }
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              Points & Configuration Management
            </h1>
            <Badge variant="neutral" size="sm">
              {isSuperAdmin ? 'Super Admin Console' : 'Admin Console'}
            </Badge>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Execute audited manual points adjustments, Option 2A exact accounting reversals, and configure milestone values.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 bg-surface-subtle p-1 rounded-sm border border-border-subtle">
          <button
            type="button"
            onClick={() => setActiveTab('adjustments')}
            className={`px-3 py-1.5 rounded-xs text-xs font-medium transition-colors ${
              activeTab === 'adjustments'
                ? 'bg-surface-canvas text-text-primary shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Adjustments & Reversals
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('configurations')}
            className={`px-3 py-1.5 rounded-xs text-xs font-medium transition-colors ${
              activeTab === 'configurations'
                ? 'bg-surface-canvas text-text-primary shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Milestone Configurations
          </button>
        </div>
      </div>

      {configError && (
        <Alert variant="error">
          {configError}
        </Alert>
      )}

      {/* TAB 1: ADJUSTMENTS & REVERSALS */}
      {activeTab === 'adjustments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Manual Points Adjustment */}
          <Card>
            <CardHeader className="border-b border-border-subtle">
              <CardTitle className="text-base font-semibold">
                Manual Points Adjustment
              </CardTitle>
              <p className="text-xs text-text-secondary mt-0.5">
                Appends an audited adjustment record to the ledger. Non-negative floor applies to standard adjustments.
              </p>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleAdjustmentSubmit} className="space-y-4">
                {adjFeedback && (
                  <Alert variant={adjFeedback.success ? 'success' : 'error'}>
                    {adjFeedback.message}
                  </Alert>
                )}

                <div>
                  <label htmlFor="adj-student-id" className="block text-xs font-medium text-text-secondary mb-1">
                    Student UUID *
                  </label>
                  <Input
                    id="adj-student-id"
                    type="text"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    value={adjStudentId}
                    onChange={(e) => setAdjStudentId(e.target.value)}
                    required
                    disabled={isPending}
                  />
                </div>

                <div>
                  <label htmlFor="adj-hackathon-id" className="block text-xs font-medium text-text-secondary mb-1">
                    Hackathon Event *
                  </label>
                  <Select
                    id="adj-hackathon-id"
                    value={adjHackathonId}
                    onChange={(e) => setAdjHackathonId(e.target.value)}
                    required
                    disabled={isPending}
                  >
                    {hackathons.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.title} ({h.status})
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label htmlFor="adj-team-id" className="block text-xs font-medium text-text-secondary mb-1">
                    Team UUID *
                  </label>
                  <Input
                    id="adj-team-id"
                    type="text"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    value={adjTeamId}
                    onChange={(e) => setAdjTeamId(e.target.value)}
                    required
                    disabled={isPending}
                  />
                  <p className="text-[11px] text-text-helper mt-1">
                    Student must be an enrolled member of this team.
                  </p>
                </div>

                <div>
                  <label htmlFor="adj-points" className="block text-xs font-medium text-text-secondary mb-1">
                    Adjustment Points (+ or - non-zero integer) *
                  </label>
                  <Input
                    id="adj-points"
                    type="number"
                    step="1"
                    placeholder="e.g. 20 or -15"
                    value={adjPoints}
                    onChange={(e) => setAdjPoints(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    required
                    disabled={isPending}
                  />
                </div>

                <div>
                  <label htmlFor="adj-reason" className="block text-xs font-medium text-text-secondary mb-1">
                    Mandatory Audit Reason (min 10 characters) *
                  </label>
                  <Textarea
                    id="adj-reason"
                    rows={3}
                    placeholder="Provide detailed justification for this manual adjustment..."
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    required
                    disabled={isPending}
                  />
                </div>

                <div>
                  <label htmlFor="adj-entry-id" className="block text-xs font-medium text-text-secondary mb-1">
                    Adjusted Entry ID (Optional)
                  </label>
                  <Input
                    id="adj-entry-id"
                    type="text"
                    placeholder="Optional UUID of prior ledger entry being adjusted"
                    value={adjEntryId}
                    onChange={(e) => setAdjEntryId(e.target.value)}
                    disabled={isPending}
                  />
                </div>

                {isSuperAdmin && (
                  <div className="pt-2">
                    <Checkbox
                      id="adj-override-floor"
                      label="Super Admin: Override Negative Balance Floor"
                      helperText="Permits this adjustment to drive student net points below zero if justified."
                      checked={adjOverrideFloor}
                      onChange={(e) => setAdjOverrideFloor(e.target.checked)}
                      disabled={isPending}
                    />
                  </div>
                )}

                <div className="pt-3">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isPending}
                    className="w-full"
                  >
                    {isPending ? 'Processing Adjustment...' : 'Apply Points Adjustment'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Card 2: Exact Accounting Reversal (Option 2A) */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="border-b border-border-subtle">
                <CardTitle className="text-base font-semibold">
                  Exact Accounting Reversal (Option 2A)
                </CardTitle>
                <p className="text-xs text-text-secondary mt-0.5">
                  Reverses a specific historical award 1:1. Appends an exact negative cancellation row referencing the original entry.
                </p>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleReversalSubmit} className="space-y-4">
                  {revFeedback && (
                    <Alert variant={revFeedback.success ? 'success' : 'error'}>
                      {revFeedback.message}
                    </Alert>
                  )}

                  <div>
                    <label htmlFor="rev-ledger-id" className="block text-xs font-medium text-text-secondary mb-1">
                      Target Points Ledger Entry UUID *
                    </label>
                    <Input
                      id="rev-ledger-id"
                      type="text"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      value={revLedgerId}
                      onChange={(e) => setRevLedgerId(e.target.value)}
                      required
                      disabled={isPending}
                    />
                  </div>

                  <div>
                    <label htmlFor="rev-reason" className="block text-xs font-medium text-text-secondary mb-1">
                      Mandatory Reversal Reason (min 10 characters) *
                    </label>
                    <Textarea
                      id="rev-reason"
                      rows={3}
                      placeholder="State reason for retroactive cancellation of this milestone award..."
                      value={revReason}
                      onChange={(e) => setRevReason(e.target.value)}
                      required
                      disabled={isPending}
                    />
                  </div>

                  <Alert variant="warning">
                    <p className="text-xs">
                      <strong>Option 2A Policy:</strong> Reversals proceed unconditionally to preserve accounting truth.
                      If the original award was 25 pts and current student balance is 10 pts, the reversal produces -25 pts and results in -15 net pts.
                    </p>
                  </Alert>

                  <div className="pt-3">
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={isPending}
                      className="w-full text-status-error-text border-status-error-border hover:bg-status-error-bg"
                    >
                      {isPending ? 'Processing Reversal...' : 'Execute Exact Reversal'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Explanatory Policy Card */}
            <Card>
              <CardContent className="pt-6 text-xs text-text-secondary space-y-2">
                <h4 className="font-semibold text-text-primary text-sm">
                  Lock Hierarchy & Integrity Rules
                </h4>
                <p>
                  All adjustment and reversal actions strictly follow the Directed Acyclic Graph (DAG) lock order:
                  Level 1 (teams) &rarr; Level 2 (profiles) &rarr; Level 3 (points_ledger).
                </p>
                <p>
                  Students who have received points cannot leave or be removed from teams without administrative resolution.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: MILESTONE POINT CONFIGURATIONS */}
      {activeTab === 'configurations' && (
        <Card>
          <CardHeader className="border-b border-border-subtle flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Platform Milestone Point Values
              </CardTitle>
              <p className="text-xs text-text-secondary mt-0.5">
                Configured point values applied when registration proofs are submitted and rounds are approved.
              </p>
            </div>
            {isSuperAdmin ? (
              <Badge variant="success" size="sm">
                Super Admin Authorized
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                Read-Only (Super Admin Access Required to Edit)
              </Badge>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milestone Type</TableHead>
                  <TableHead className="w-36 text-center">Regular Member</TableHead>
                  <TableHead className="w-36 text-center">Team Leader</TableHead>
                  <TableHead className="w-32 text-center">Status</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configs.map((config) => {
                  const isWin = config.milestone_type === 'win_placement';

                  return (
                    <TableRow key={config.id}>
                      <TableCell>
                        <div className="font-medium text-text-primary text-sm capitalize">
                          {config.milestone_type.replace('_', ' ')}
                        </div>
                        <div className="text-xs text-text-muted">
                          {isWin
                            ? 'Winner and placement bonus awards'
                            : config.milestone_type === 'participation'
                            ? 'Submitted registration claims with CDC declaration'
                            : 'Evaluated and accepted round submissions'}
                        </div>
                      </TableCell>

                      <TableCell className="text-center font-mono font-bold text-sm">
                        +{config.regular_member_points} pts
                      </TableCell>

                      <TableCell className="text-center font-mono font-bold text-sm">
                        +{config.team_leader_points} pts
                      </TableCell>

                      <TableCell className="text-center">
                        {isWin ? (
                          <Badge variant="error" size="sm">
                            Disabled (Locked)
                          </Badge>
                        ) : config.is_active ? (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Inactive
                          </Badge>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {isWin ? (
                          <span className="text-xs text-text-muted italic select-none">
                            Blocked
                          </span>
                        ) : isSuperAdmin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenConfigModal(config)}
                          >
                            Edit Values
                          </Button>
                        ) : (
                          <span className="text-xs text-text-muted select-none">
                            Read-Only
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Configuration Dialog */}
      {editingConfig && (
        <Dialog
          isOpen={Boolean(editingConfig)}
          onClose={() => setEditingConfig(null)}
          title={`Edit ${editingConfig.milestone_type.replace('_', ' ')} Points`}
          description="Update point values for this milestone. Changes will apply to all future awards; existing ledger entries remain permanently unchanged."
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setEditingConfig(null)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSaveConfig}
                disabled={isPending}
              >
                {isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2">
            {configFeedback && (
              <Alert variant={configFeedback.success ? 'success' : 'error'}>
                {configFeedback.message}
              </Alert>
            )}

            <div>
              <label htmlFor="edit-regular-pts" className="block text-xs font-medium text-text-secondary mb-1">
                Regular Member Points (0 - 1000)
              </label>
              <Input
                id="edit-regular-pts"
                type="number"
                min="0"
                max="1000"
                value={editRegularPts}
                onChange={(e) => setEditRegularPts(parseInt(e.target.value || '0', 10))}
                disabled={isPending}
              />
            </div>

            <div>
              <label htmlFor="edit-leader-pts" className="block text-xs font-medium text-text-secondary mb-1">
                Team Leader Points (0 - 1000)
              </label>
              <Input
                id="edit-leader-pts"
                type="number"
                min="0"
                max="1000"
                value={editLeaderPts}
                onChange={(e) => setEditLeaderPts(parseInt(e.target.value || '0', 10))}
                disabled={isPending}
              />
            </div>

            <p className="text-[11px] text-text-muted">
              Note: Updating point values creates an immutable record in audit_logs.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
