import React from 'react';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { SuperAdminShell } from '@/components/shells/super-admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { AdminsClient } from './admins-client';
import { fetchAdminsAction } from '@/actions/admin-management-actions';

export const metadata: Metadata = {
  title: 'Administrator Governance — NMIT HackLeague Super Admin',
};

export default async function AdminManagementPage() {
  const { admin: currentAdmin } = await requireSuperAdmin();
  const adminsRes = await fetchAdminsAction();
  const initialAdmins = adminsRes.success && adminsRes.data ? adminsRes.data : [];

  return (
    <SuperAdminShell
      currentPath="/admin/admins"
      adminProfile={currentAdmin}
      permissions={[]}
    >
      <div className="space-y-6">
        <PageHeader
          title="Administrator Governance"
          description="Provision institutional administrator accounts, configure functional permissions, and govern active account status."
          breadcrumbs={[
            { label: 'Super Admin Governance', href: '/admin/admins' },
            { label: 'Administrator Accounts' },
          ]}
        />

        <AdminsClient
          initialAdmins={initialAdmins}
          currentSuperAdminId={currentAdmin.id}
        />
      </div>
    </SuperAdminShell>
  );
}
