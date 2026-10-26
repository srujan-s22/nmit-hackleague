'use client';

import React from 'react';
import type { StudentPointsSummary } from '@/types/points';
import type { StudentProfile } from '@/types/auth';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils/date-format';

interface StudentPointsClientProps {
  summary: StudentPointsSummary | null;
  error?: string;
  profile: StudentProfile;
}

export function StudentPointsClient({
  summary,
  error,
  profile,
}: StudentPointsClientProps) {
  const ledger = summary?.ledger_history || [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">
              My Points & Milestones
            </h1>
            <Badge variant="neutral" size="sm">
              Study Year {profile.academic_year}
            </Badge>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Your points, rank and point history.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* KPI Metric Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Points */}
        <Card className="border-border-subtle shadow-xs">
          <CardContent className="pt-6">
            <div className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Total Net Points
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-text-primary">
                {summary?.total_points ?? 0}
              </span>
              <span className="text-sm text-text-muted">points</span>
            </div>
            <p className="text-xs text-text-helper mt-1">
              Across all events
            </p>
          </CardContent>
        </Card>

        {/* Platform Rank */}
        <Card className="border-border-subtle shadow-xs">
          <CardContent className="pt-6">
            <div className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Platform Rank
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-text-primary">
                {summary?.rank && (summary.total_points ?? 0) > 0 ? `#${summary.rank}` : 'Unranked'}
              </span>
            </div>
            <p className="text-xs text-text-helper mt-1">
              Among approved students
            </p>
          </CardContent>
        </Card>

        {/* Verified Qualifications */}
        <Card className="border-border-subtle shadow-xs">
          <CardContent className="pt-6">
            <div className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Verified Qualifications
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-status-success-text">
                {summary?.verified_qualifications_count ?? 0}
              </span>
              <span className="text-sm text-text-muted">rounds</span>
            </div>
            <p className="text-xs text-text-helper mt-1">
              Rounds passed
            </p>
          </CardContent>
        </Card>

        {/* Submitted Claims */}
        <Card className="border-border-subtle shadow-xs">
          <CardContent className="pt-6">
            <div className="text-xs font-medium text-text-secondary uppercase tracking-wider">
              Participation Claims
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-text-secondary">
                {summary?.submitted_claims_count ?? 0}
              </span>
              <span className="text-sm text-text-muted">claims</span>
            </div>
            <p className="text-xs text-text-helper mt-1">
              Registration proofs submitted
            </p>
          </CardContent>
        </Card>
      </div>


      {/* Transaction History Ledger */}
      <Card>
        <CardHeader className="pb-3 border-b border-border-subtle flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Transaction History ({ledger.length})
          </CardTitle>
        </CardHeader>

        {ledger.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title="No point transactions yet"
              description="Points will appear here as you submit hackathon registration proofs and qualify through rounds."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Date & Time</TableHead>
                <TableHead className="w-56">Hackathon</TableHead>
                <TableHead className="w-48">Milestone Type</TableHead>
                <TableHead className="w-28 text-right">Points</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.map((entry) => {
                const isPositive = entry.points > 0;
                const isReversal = entry.milestone_type === 'reversal';
                const isAdjustment = entry.milestone_type === 'manual_adjustment';
                const isQualification = entry.milestone_type === 'round_qualification';
                const isParticipation = entry.milestone_type === 'participation';

                return (
                  <TableRow key={entry.id}>
                    {/* Timestamp */}
                    <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                      {formatDateTime(entry.created_at)}
                    </TableCell>

                    {/* Hackathon Title */}
                    <TableCell className="font-medium text-sm text-text-primary">
                      {entry.hackathon_title || 'Hackathon Event'}
                    </TableCell>

                    {/* Milestone Type */}
                    <TableCell>
                      {isParticipation && (
                        <Badge variant="neutral" size="sm">
                          Participation Claim
                        </Badge>
                      )}
                      {isQualification && (
                        <Badge variant="success" size="sm">
                          Round Qualification
                        </Badge>
                      )}
                      {isAdjustment && (
                        <Badge variant="warning" size="sm">
                          Manual Adjustment
                        </Badge>
                      )}
                      {isReversal && (
                        <Badge variant="error" size="sm">
                          Reversal
                        </Badge>
                      )}
                    </TableCell>

                    {/* Points Value */}
                    <TableCell className="text-right">
                      <span
                        className={`font-mono font-bold text-sm ${
                          isPositive
                            ? 'text-status-success-text'
                            : 'text-status-error-text'
                        }`}
                      >
                        {isPositive ? `+${entry.points}` : entry.points}
                      </span>
                      <span className="text-xs text-text-muted ml-1">pts</span>
                    </TableCell>

                    {/* Reason & Linkage */}
                    <TableCell className="text-xs text-text-secondary">
                      <p>{entry.reason}</p>
                      {entry.reversal_of_id && (
                        <p className="text-[11px] text-text-muted mt-0.5">
                          Cancels award: <code className="bg-surface-subtle px-1 py-0.5 rounded font-mono">{entry.reversal_of_id.slice(0, 8)}</code>
                        </p>
                      )}
                      {entry.adjusted_entry_id && (
                        <p className="text-[11px] text-text-muted mt-0.5">
                          Adjusts entry: <code className="bg-surface-subtle px-1 py-0.5 rounded font-mono">{entry.adjusted_entry_id.slice(0, 8)}</code>
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
