'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  getAdminDashboardMetricsAction,
  type AdminDashboardMetrics,
} from '@/actions/report-actions';

interface AdminDashboardClientProps {
  initialMetrics: AdminDashboardMetrics;
  hackathons: { id: string; title: string }[];
  isSuperAdmin: boolean;
  adminName: string;
}

export function AdminDashboardClient({
  initialMetrics,
  hackathons,
  isSuperAdmin,
  adminName,
}: AdminDashboardClientProps) {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics>(initialMetrics);
  const [selectedHackathon, setSelectedHackathon] = useState<string>(
    initialMetrics.scope.hackathon_id || ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleScopeChange = async (newHackathonId: string) => {
    setSelectedHackathon(newHackathonId);
    setIsLoading(true);
    setErrorMsg(null);

    const res = await getAdminDashboardMetricsAction(newHackathonId || null);
    if (res.success && res.metrics) {
      setMetrics(res.metrics);
    } else {
      setErrorMsg(res.error || 'Failed to update dashboard metrics.');
    }
    setIsLoading(false);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    const res = await getAdminDashboardMetricsAction(selectedHackathon || null);
    if (res.success && res.metrics) {
      setMetrics(res.metrics);
    } else {
      setErrorMsg(res.error || 'Failed to refresh dashboard metrics.');
    }
    setIsLoading(false);
  };

  const formatNumber = (num: number) => num.toLocaleString('en-IN');

  return (
    <div className="space-y-8">
      {/* Scope Selector Bar */}
      <div className="bg-surface-canvas border border-border-subtle rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label htmlFor="scope-select" className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Scope Filter:
          </label>
          <select
            id="scope-select"
            value={selectedHackathon}
            onChange={(e) => handleScopeChange(e.target.value)}
            disabled={isLoading}
            className="bg-surface-subtle border border-border-subtle rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            {isSuperAdmin && <option value="">Global Platform (All Events)</option>}
            {hackathons.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
              </option>
            ))}
          </select>

          <Badge variant={metrics.scope.is_global ? 'info' : 'neutral'} size="sm">
            {metrics.scope.is_global
              ? 'Platform-Wide Scope'
              : `Scoped: ${metrics.scope.events_count} Event(s)`}
          </Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-text-tertiary">
          <span>Updated: {metrics.generated_at ? new Date(metrics.generated_at).toLocaleTimeString() : 'Just now'}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            isLoading={isLoading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {errorMsg && (
        <Alert variant="error" title="Metrics Error">
          {errorMsg}
        </Alert>
      )}

      {/* Top Overview KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Students
              </span>
              <Badge variant="success" size="sm">
                {metrics.students.approved} Approved
              </Badge>
            </div>
            <CardTitle className="text-3xl font-extrabold text-text-primary mt-1">
              {formatNumber(metrics.students.total)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-text-secondary flex justify-between">
            <span>Pending: {formatNumber(metrics.students.pending)}</span>
            <span>Rejected: {formatNumber(metrics.students.rejected)}</span>
          </CardContent>
        </Card>

        {/* Hackathons */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Hackathons
              </span>
              <Badge variant="info" size="sm">
                {metrics.hackathons.published} Published
              </Badge>
            </div>
            <CardTitle className="text-3xl font-extrabold text-text-primary mt-1">
              {formatNumber(metrics.hackathons.total)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-text-secondary flex justify-between">
            <span>Draft: {formatNumber(metrics.hackathons.draft)}</span>
            <span>Archived: {formatNumber(metrics.hackathons.archived)}</span>
          </CardContent>
        </Card>

        {/* Teams Formed */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Teams Formed
              </span>
              <Badge variant="info" size="sm">
                {metrics.teams.internal_registered} Registered
              </Badge>
            </div>
            <CardTitle className="text-3xl font-extrabold text-text-primary mt-1">
              {formatNumber(metrics.teams.total)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-text-secondary flex justify-between">
            <span>Verified Ext: {formatNumber(metrics.teams.verified_external)}</span>
            <span>Claims: {formatNumber(metrics.teams.submitted_claims)}</span>
          </CardContent>
        </Card>

        {/* Institutional Points */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Points Distributed
              </span>
              <Badge variant="warning" size="sm">
                {metrics.points.transactions_count} Awards
              </Badge>
            </div>
            <CardTitle className="text-3xl font-extrabold text-text-primary mt-1 text-amber-500">
              {formatNumber(metrics.points.total_distributed)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-text-secondary flex justify-between">
            <span>Institutional Leaderboard Points</span>
          </CardContent>
        </Card>
      </div>

      {/* Operational Breakdown Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Team External Registrations & CDC Proofs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span>External Registration Claims</span>
              <Badge variant="neutral" size="sm">
                CDC Proofs
              </Badge>
            </CardTitle>
            <CardDescription>
              External hackathon registration proofs submitted by team leaders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
              <span className="text-text-secondary">Verified Participation:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatNumber(metrics.teams.verified_external)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
              <span className="text-text-secondary">Submitted Claims (Pending Review):</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {formatNumber(metrics.teams.submitted_claims)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
              <span className="text-text-secondary">Rejected Claims:</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                {formatNumber(metrics.teams.rejected_external)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 text-sm">
              <span className="text-text-secondary">Internal Only / Registered:</span>
              <span className="font-semibold text-text-primary">
                {formatNumber(metrics.teams.internal_registered)}
              </span>
            </div>

            <div className="pt-2">
              <Link
                href="/admin/verifications"
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
              >
                Review Submitted Claims &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Submissions & Round Evaluations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span>Submissions & Rounds</span>
              <Badge variant="neutral" size="sm">
                Stages
              </Badge>
            </CardTitle>
            <CardDescription>
              Project deliverables submitted across tournament rounds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
              <span className="text-text-secondary">Total Submissions:</span>
              <span className="font-semibold text-text-primary">
                {formatNumber(metrics.submissions.total)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
              <span className="text-text-secondary">Accepted / Qualified:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatNumber(metrics.submissions.accepted)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
              <span className="text-text-secondary">Pending Evaluation:</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {formatNumber(metrics.submissions.pending)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 text-sm">
              <span className="text-text-secondary">Verified Results & Winners:</span>
              <span className="font-semibold text-brand-primary">
                {formatNumber(metrics.results.verified_outcomes)} ({formatNumber(metrics.results.winners_count)} podiums)
              </span>
            </div>

            <div className="pt-2">
              <Link
                href="/admin/hackathons"
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
              >
                Manage Hackathons & Rounds &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Profile Correction Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold flex items-center justify-between">
              <span>Profile Correction Queue</span>
              {metrics.profile_changes.pending > 0 ? (
                <Badge variant="warning" size="sm">
                  {metrics.profile_changes.pending} Pending
                </Badge>
              ) : (
                <Badge variant="success" size="sm">
                  Clear
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Student change requests for institutional fields (USN, Branch, Year, Name).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
              <span className="text-text-secondary">Pending Review:</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                {formatNumber(metrics.profile_changes.pending)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border-subtle/50 text-sm">
              <span className="text-text-secondary">Approved Corrections:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {formatNumber(metrics.profile_changes.approved)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 text-sm">
              <span className="text-text-secondary">Rejected Requests:</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                {formatNumber(metrics.profile_changes.rejected)}
              </span>
            </div>

            <div className="pt-2">
              <Link
                href="/admin/verifications"
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
              >
                Go to Verification Queue &rarr;
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation & Export Hub CTA */}
      <div className="bg-gradient-to-r from-blue-900/10 via-purple-900/10 to-indigo-900/10 border border-border-subtle rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-text-primary">
            Institutional Data Exports & Reports
          </h3>
          <p className="text-xs text-text-secondary max-w-xl">
            Export comprehensive spreadsheets for student rosters, team participations, round results, points ledgers, and audit logs in multi-sheet Excel (.xlsx), ZIP packages, or CSV with built-in formula injection protection.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/reports"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-surface-inverse text-text-inverse text-sm font-semibold hover:bg-neutral-800 transition-colors shadow-xs"
          >
            Open Data & Reports Hub
          </Link>
          <Link
            href="/admin/verifications"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-surface-subtle border border-border-subtle text-text-primary text-sm font-semibold hover:bg-surface-canvas transition-colors"
          >
            Verification Queue
          </Link>
        </div>
      </div>
    </div>
  );
}
