import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentAdminProfile, checkAdminPermission } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { getAuditLogsAction } from '@/actions/audit-log-actions';
import { AuditLogsClient } from './audit-logs-client';

export const metadata: Metadata = {
  title: 'Audit Trail & Compliance Logs | NMIT HackLeague Admin',
  description: 'Immutable system audit logs and administrative event history.',
};

export default async function AuditLogsPage() {
  const currentAdmin = await getCurrentAdminProfile();

  if (!currentAdmin) {
    redirect('/login');
  }

  const isSuperAdmin = currentAdmin.admin.is_super_admin;
  const hasViewAuditLogs =
    isSuperAdmin || currentAdmin.permissions.includes('view_audit_logs');

  if (!hasViewAuditLogs) {
    redirect('/admin');
  }

  const initialLogsRes = await getAuditLogsAction({ limit: 50 });

  return (
    <AdminShell
      currentPath="/admin/audit-logs"
      adminProfile={currentAdmin.admin}
      permissions={currentAdmin.permissions}
    >
      <AuditLogsClient
        initialLogs={initialLogsRes.logs || []}
        initialTotalCount={initialLogsRes.totalCount || 0}
        isSuperAdmin={isSuperAdmin}
      />
    </AdminShell>
  );
}
