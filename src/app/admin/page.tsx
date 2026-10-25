import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { AdminDashboardClient } from './admin-dashboard-client';
import {
  getAdminDashboardMetricsAction,
  getAdminParticipationAnalyticsAction,
  type AdminDashboardMetrics,
  type AdminParticipationAnalytics,
} from '@/actions/report-actions';

export const metadata: Metadata = {
  title: 'Executive Analytics & Overview — NMIT HackLeague Admin',
  description: 'Institutional metrics, hackathon progression, team registration claims, and student analytics.',
};

export default async function AdminDashboardPage() {
  const { admin, permissions } = await requireAdmin();
  // Homepage analytics are identical for every admin: default scope is the
  // whole platform, and the scope dropdown lists every hackathon (supplied by
  // the analytics RPC itself, so it never depends on the caller's RLS access).
  const defaultHackathonId = null;

  // Retrieve initial metrics
  const [metricsResult, analyticsResult] = await Promise.all([
    getAdminDashboardMetricsAction(defaultHackathonId),
    getAdminParticipationAnalyticsAction(defaultHackathonId),
  ]);

  const fallbackMetrics: AdminDashboardMetrics = {
    scope: {
      is_global: true,
      hackathon_id: defaultHackathonId,
      events_count: 0,
    },
    students: {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    },
    hackathons: {
      total: 0,
      published: 0,
      draft: 0,
      archived: 0,
    },
    teams: {
      total: 0,
      internal_registered: 0,
      submitted_claims: 0,
      verified_external: 0,
      rejected_external: 0,
    },
    submissions: {
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
    },
    results: {
      verified_outcomes: 0,
      winners_count: 0,
    },
    points: {
      total_distributed: 0,
      transactions_count: 0,
    },
    profile_changes: {
      pending: 0,
      approved: 0,
      rejected: 0,
    },
    generated_at: new Date().toISOString(),
  };

  const initialMetrics = metricsResult.success && metricsResult.metrics
    ? metricsResult.metrics
    : fallbackMetrics;

  const fallbackAnalytics: AdminParticipationAnalytics = {
    participation: { participating: 0, not_participating: 0, total_students: 0 },
    activity: [],
    hackathons: [],
  };
  const initialAnalytics = analyticsResult.success && analyticsResult.analytics
    ? analyticsResult.analytics
    : fallbackAnalytics;

  return (
    <AdminShell
      currentPath="/admin"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Executive Overview & Analytics"
          description="Institutional performance at a glance across student participation, hackathon activity, and points distribution."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Overview & Analytics' },
          ]}
        />

        <AdminDashboardClient
          initialMetrics={initialMetrics}
          initialAnalytics={initialAnalytics}
          hackathons={initialAnalytics.hackathons}
          initialError={metricsResult.error || analyticsResult.error || null}
          adminName={admin.email.split('@')[0]}
        />
      </div>
    </AdminShell>
  );
}
