import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { ReportsClient } from './reports-client';

export const metadata: Metadata = {
  title: 'Data & Reports Hub — NMIT HackLeague Admin',
  description: 'Download institutional event datasets, participant rosters, submissions, reviews, and points ledgers.',
};

export default async function AdminReportsPage() {
  const { admin, permissions } = await requireAdmin('export_data');
  const supabase = await createClient();

  let query = supabase.from('hackathons').select('id, title').order('created_at', { ascending: false });

  if (!admin.is_super_admin) {
    query = query.eq('in_charge_admin_id', admin.id);
  }

  const { data: hackathons } = await query;

  return (
    <AdminShell
      currentPath="/admin/reports"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Data & Reports Hub"
          description="Export comprehensive institutional records with automatic spreadsheet formula injection protection. Formats include multi-sheet Excel (.xlsx), complete ZIP archives, and raw CSV files."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Reports & Exports' },
          ]}
        />

        <ReportsClient
          hackathons={hackathons || []}
          isSuperAdmin={admin.is_super_admin}
        />
      </div>
    </AdminShell>
  );
}
