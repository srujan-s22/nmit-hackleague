'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  getAdminDashboardMetricsAction,
  getAdminParticipationAnalyticsAction,
  type AdminDashboardMetrics,
  type AdminParticipationAnalytics,
} from '@/actions/report-actions';

const emptySubscribe = () => () => {};

export function formatUpdatedTime(
  timestamp: string | null | undefined,
  isMounted: boolean
): string {
  if (!isMounted || !timestamp) {
    return 'Just now';
  }
  try {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? 'Just now' : d.toLocaleTimeString();
  } catch {
    return 'Just now';
  }
}

interface AdminDashboardClientProps {
  initialMetrics: AdminDashboardMetrics;
  initialAnalytics: AdminParticipationAnalytics;
  hackathons: { id: string; title: string }[];
  initialError?: string | null;
  adminName: string;
}

// ----------------------------------------------------------------------------
// Small inline icon set — avoids adding an icon library dependency for a
// handful of KPI-card glyphs. Same stroke-based style as icons already used
// elsewhere in the admin UI (e.g. dialog.tsx's close icon).
// ----------------------------------------------------------------------------
function IconSwatch({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-9 h-9 rounded-lg bg-status-success-bg flex items-center justify-center text-status-success-text shrink-0">
      {children}
    </div>
  );
}

const icons = {
  students: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.42A12.083 12.083 0 0112 21a12.083 12.083 0 01-6.16-10.42L12 14z" />
    </svg>
  ),
  hackathons: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4M6 3h12v4a6 6 0 01-12 0V3zM6 7H4a2 2 0 002 2m12-2h2a2 2 0 01-2 2" />
    </svg>
  ),
  teams: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4.13a4 4 0 10-4-4 4 4 0 004 4zm6 1a4 4 0 10-4-4" />
    </svg>
  ),
  points: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a4 4 0 100-8 4 4 0 000 8zm-6 3.5L8 22l4-2 4 2 2-3.5" />
    </svg>
  ),
  scope: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" />
    </svg>
  ),
  refresh: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
};

// ----------------------------------------------------------------------------
// Chart A — Student Participation doughnut (pure SVG, no chart library).
// ----------------------------------------------------------------------------
function ParticipationDoughnut({ participating, total }: { participating: number; total: number }) {
  const pct = total > 0 ? (participating / total) * 100 : 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = total > 0 ? (pct / 100) * circumference : 0;

  return (
    <div className="relative w-[150px] h-[150px] shrink-0">
      <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--color-surface-muted)" strokeWidth="16" />
        {total > 0 && (
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="var(--color-status-success-text)"
            strokeWidth="16"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-text-primary">
          {total > 0 ? `${pct.toFixed(1)}%` : '—'}
        </span>
        <span className="text-[11px] text-text-tertiary">Participating</span>
      </div>
    </div>
  );
}

function formatPct(part: number, total: number): string {
  if (total <= 0) return '0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

// ----------------------------------------------------------------------------
// Chart B — Hackathon Activity bar chart (pure SVG, no chart library).
// ----------------------------------------------------------------------------
function HackathonActivityChart({
  data,
}: {
  data: { hackathon_id: string; title: string; participants: number }[];
}) {
  const width = 480;
  const height = 220;
  const paddingLeft = 36;
  const paddingBottom = 44;
  const paddingTop = 16;
  const chartWidth = width - paddingLeft - 12;
  const chartHeight = height - paddingTop - paddingBottom;

  const maxValue = Math.max(1, ...data.map((d) => d.participants));
  const niceMax = Math.ceil(maxValue / (maxValue <= 5 ? 1 : 5)) * (maxValue <= 5 ? 1 : 5) || 1;
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => Math.round((niceMax / ticks) * i));

  const barSlot = data.length > 0 ? chartWidth / data.length : chartWidth;
  const barWidth = Math.min(48, barSlot * 0.5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Participating students per hackathon">
      {/* Y-axis gridlines + labels */}
      {tickValues.map((tv, i) => {
        const y = paddingTop + chartHeight - (tv / niceMax) * chartHeight;
        return (
          <g key={`tick-${i}`}>
            <line x1={paddingLeft} y1={y} x2={width - 8} y2={y} stroke="var(--color-border-subtle)" strokeWidth="1" />
            <text x={paddingLeft - 8} y={y + 4} textAnchor="end" className="fill-text-tertiary" fontSize="10">
              {tv}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barHeight = (d.participants / niceMax) * chartHeight;
        const x = paddingLeft + barSlot * i + (barSlot - barWidth) / 2;
        const y = paddingTop + chartHeight - barHeight;
        const label = d.title.length > 14 ? `${d.title.slice(0, 13)}…` : d.title;
        return (
          <g key={d.hackathon_id}>
            {d.participants > 0 && (
              <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" className="fill-text-primary" fontSize="11" fontWeight="600">
                {d.participants}
              </text>
            )}
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 0)}
              rx="4"
              fill="var(--color-status-success-text)"
            />
            <text
              x={x + barWidth / 2}
              y={paddingTop + chartHeight + 16}
              textAnchor="middle"
              className="fill-text-secondary"
              fontSize="10"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function AdminDashboardClient({
  initialMetrics,
  initialAnalytics,
  hackathons,
  initialError,
  adminName,
}: AdminDashboardClientProps) {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics>(initialMetrics);
  const [analytics, setAnalytics] = useState<AdminParticipationAnalytics>(initialAnalytics);
  const [selectedHackathon, setSelectedHackathon] = useState<string>(
    initialMetrics.scope.hackathon_id || ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(initialError ?? null);
  const isMounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const loadScope = async (hackathonId: string) => {
    setIsLoading(true);
    setErrorMsg(null);

    const [metricsRes, analyticsRes] = await Promise.all([
      getAdminDashboardMetricsAction(hackathonId || null),
      getAdminParticipationAnalyticsAction(hackathonId || null),
    ]);

    if (metricsRes.success && metricsRes.metrics) {
      setMetrics(metricsRes.metrics);
    } else {
      setErrorMsg(metricsRes.error || 'Failed to update dashboard metrics.');
    }
    if (analyticsRes.success && analyticsRes.analytics) {
      setAnalytics(analyticsRes.analytics);
    } else if (!metricsRes.error) {
      setErrorMsg(analyticsRes.error || 'Failed to update participation analytics.');
    }
    setIsLoading(false);
  };

  const handleScopeChange = (newHackathonId: string) => {
    setSelectedHackathon(newHackathonId);
    void loadScope(newHackathonId);
  };

  const handleRefresh = () => {
    void loadScope(selectedHackathon);
  };

  const formatNumber = (num: number) => num.toLocaleString('en-IN');

  const scopeOptions = useMemo(
    () => [
      { value: '', label: 'Global Platform (All Events)' },
      ...hackathons.map((h) => ({ value: h.id, label: h.title })),
    ],
    [hackathons]
  );

  return (
    <div className="space-y-6">
      {/* Analytics Scope Control Panel */}
      <div className="bg-surface-canvas border border-border-subtle rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label htmlFor="scope-select" className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary uppercase tracking-wider">
            {icons.scope}
            Analytics Scope
          </label>
          <select
            id="scope-select"
            value={selectedHackathon}
            onChange={(e) => handleScopeChange(e.target.value)}
            disabled={isLoading}
            className="bg-surface-subtle border border-border-subtle rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
          >
            {scopeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
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
          <span>Last updated: {formatUpdatedTime(metrics.generated_at, isMounted)}</span>
          <Button variant="outline" size="sm" onClick={handleRefresh} isLoading={isLoading}>
            {icons.refresh}
            Refresh
          </Button>
        </div>
      </div>

      {errorMsg && (
        <Alert variant="error" title="Dashboard Error">
          {errorMsg}
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <IconSwatch>{icons.students}</IconSwatch>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Students</span>
                  <Badge variant="success" size="sm">{metrics.students.approved} Approved</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary mt-1">{formatNumber(metrics.students.total)}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle text-xs text-text-secondary flex justify-between">
              <span>Pending: {formatNumber(metrics.students.pending)}</span>
              <span>Rejected: {formatNumber(metrics.students.rejected)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <IconSwatch>{icons.hackathons}</IconSwatch>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Hackathons</span>
                  <Badge variant="info" size="sm">{metrics.hackathons.published} Published</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary mt-1">{formatNumber(metrics.hackathons.total)}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle text-xs text-text-secondary flex justify-between">
              <span>Draft: {formatNumber(metrics.hackathons.draft)}</span>
              <span>Archived: {formatNumber(metrics.hackathons.archived)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <IconSwatch>{icons.teams}</IconSwatch>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Teams Formed</span>
                  <Badge variant="info" size="sm">{metrics.teams.internal_registered} Registered</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary mt-1">{formatNumber(metrics.teams.total)}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle text-xs text-text-secondary flex justify-between">
              <span>Registration proofs: {formatNumber(metrics.teams.submitted_claims)}</span>
              <span>Rejected: {formatNumber(metrics.teams.rejected_external)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <IconSwatch>{icons.points}</IconSwatch>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">Points Distributed</span>
                  <Badge variant="warning" size="sm">{metrics.points.transactions_count} Awards</Badge>
                </div>
                <div className="text-3xl font-extrabold text-text-primary mt-1">{formatNumber(metrics.points.total_distributed)}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle text-xs text-text-secondary">
              Institutional Leaderboard Points
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Institutional Analytics */}
      <div>
        <h2 className="text-lg font-bold text-text-primary">Institutional Analytics</h2>
        <p className="text-sm text-text-secondary">Participation and event activity.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart A: Student Participation */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <IconSwatch>{icons.teams}</IconSwatch>
                <div>
                  <CardTitle className="text-base">Student Participation</CardTitle>
                  <p className="text-xs text-text-secondary mt-0.5">Approved students in at least one hackathon.</p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-8 flex-wrap">
              <ParticipationDoughnut
                participating={analytics.participation.participating}
                total={analytics.participation.total_students}
              />
              <div className="flex-1 min-w-[180px] space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-success-text" aria-hidden="true" />
                    Participating Students
                  </span>
                  <span className="font-semibold text-text-primary">
                    {formatNumber(analytics.participation.participating)}{' '}
                    <span className="text-text-tertiary font-normal">
                      {formatPct(analytics.participation.participating, analytics.participation.total_students)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span className="w-2.5 h-2.5 rounded-full bg-surface-muted border border-border-default" aria-hidden="true" />
                    Not Participating
                  </span>
                  <span className="font-semibold text-text-primary">
                    {formatNumber(analytics.participation.not_participating)}{' '}
                    <span className="text-text-tertiary font-normal">
                      {formatPct(analytics.participation.not_participating, analytics.participation.total_students)}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm pt-2 border-t border-border-subtle">
                  <span className="text-text-secondary">Total Students</span>
                  <span className="font-semibold text-text-primary">
                    {formatNumber(analytics.participation.total_students)}{' '}
                    <span className="text-text-tertiary font-normal">100%</span>
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart B: Hackathon Activity */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IconSwatch>{icons.hackathons}</IconSwatch>
              <div>
                <CardTitle className="text-base">Hackathon Activity</CardTitle>
                <p className="text-xs text-text-secondary mt-0.5">Participants per hackathon.</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {analytics.activity.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-helper">
                No published hackathons with recorded participation in this scope yet.
              </div>
            ) : (
              <>
                <HackathonActivityChart data={analytics.activity} />
                <div className="flex items-center gap-2 text-xs text-text-secondary mt-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-status-success-text" aria-hidden="true" />
                  Participating Students
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
