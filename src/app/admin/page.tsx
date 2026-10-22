import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { AdminDashboardClient } from './admin-dashboard-client';
import {
  getAdminDashboardMetricsAction,
  type AdminDashboardMetrics,
} from '@/actions/report-actions';

export const metadata: Metadata = {
  title: 'Executive Analytics & Overview — NMIT HackLeague Admin',
  description: 'Institutional metrics, hackathon progression, team registration claims, and student analytics.',
};

export default async function AdminDashboardPage() {
  const { admin, permissions } = await requireAdmin();
  const supabase = await createClient();

  // Fetch hackathons accessible to this admin
  let query = supabase
    .from('hackathons')
    .select('id, title')
    .order('created_at', { ascending: false });

  if (!admin.is_super_admin) {
    query = query.eq('in_charge_admin_id', admin.id);
  }

  const { data: hackathons } = await query;
  const accessibleHackathons = hackathons || [];

  // Default hackathon ID for non-super admins
  const defaultHackathonId = !admin.is_super_admin && accessibleHackathons.length > 0
    ? accessibleHackathons[0].id
    : null;

  // Retrieve initial metrics
  const metricsResult = await getAdminDashboardMetricsAction(defaultHackathonId);

  const fallbackMetrics: AdminDashboardMetrics = {
    scope: {
      is_global: admin.is_super_admin,
      hackathon_id: defaultHackathonId,
      events_count: accessibleHackathons.length,
    },
    students: {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    },
    hackathons: {
      total: accessibleHackathons.length,
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

  return (
    <AdminShell
      currentPath="/admin"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Executive Overview & Analytics"
          description="Institutional KPI dashboard covering student onboardings, hackathon participation, round milestones, CDC claims, and points distribution."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Overview & Analytics' },
          ]}
        />

        <AdminDashboardClient
          initialMetrics={initialMetrics}
          hackathons={accessibleHackathons}
          isSuperAdmin={admin.is_super_admin}
          adminName={admin.email.split('@')[0]}
        />
      </div>
    </AdminShell>
  );
}
