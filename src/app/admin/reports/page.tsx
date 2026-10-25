import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import {
  fetchExportCapabilities,
  fetchExportableHackathons,
  type ExportRpcClient,
  type ExportableHackathon,
} from '@/lib/reports/export-service';
import type { ExportCapabilities } from '@/lib/reports/dataset-catalog';
import { ReportsClient } from './reports-client';

export const metadata: Metadata = {
  title: 'Data & Reports Hub — NMIT HackLeague Admin',
  description: 'Export authorized institutional records with clear scope, reliable row counts, and secure delivery.',
};

export default async function AdminReportsPage() {
  const { admin, permissions } = await requireAdmin('export_data');
  const supabase = (await createClient()) as unknown as ExportRpcClient;

  // Which hackathons and datasets are exportable is decided by the database
  // (get_exportable_hackathons / get_export_capabilities), the same authority the
  // export endpoint uses — never by in_charge_admin_id or UI state.
  let capabilities: ExportCapabilities | null = null;
  let hackathons: ExportableHackathon[] = [];
  let loadError: string | null = null;
  try {
    [capabilities, hackathons] = await Promise.all([
      fetchExportCapabilities(supabase),
      fetchExportableHackathons(supabase),
    ]);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load export access.';
  }

  return (
    <AdminShell currentPath="/admin/reports" adminProfile={admin} permissions={permissions}>
      <div className="space-y-6">
        <PageHeader
          title="Data & Reports Hub"
          description="Export authorized institutional records with clear scope, reliable row counts, and secure delivery."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Reports & Exports' },
          ]}
        />

        {loadError || !capabilities ? (
          <Alert variant="error" title="Exports unavailable">
            {loadError ?? 'Export access could not be determined. Please refresh the page.'}
          </Alert>
        ) : (
          <ReportsClient hackathons={hackathons} capabilities={capabilities} />
        )}
      </div>
    </AdminShell>
  );
}
