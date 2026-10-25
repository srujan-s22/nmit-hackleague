import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { SuperAdminShell } from '@/components/shells/super-admin-shell';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { AdminsClient } from './admins-client';
import { fetchAdminsAction } from '@/actions/admin-management-actions';

export const metadata: Metadata = {
  title: 'Administrator Governance — NMIT HackLeague',
};

export default async function AdminManagementPage() {
  const { admin: currentAdmin, permissions } = await requireAdmin();
  const isSuperAdmin = Boolean(currentAdmin.is_super_admin);
  const canAssignHackathons = isSuperAdmin || permissions.includes('assign_hackathons');

  if (!canAssignHackathons) {
    redirect('/admin');
  }

  const adminsRes = await fetchAdminsAction();
  const initialAdmins = adminsRes.success && adminsRes.data ? adminsRes.data : [];

  const Shell = isSuperAdmin ? SuperAdminShell : AdminShell;

  return (
    <Shell
      currentPath="/admin/admins"
      adminProfile={currentAdmin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Administrator Governance"
          description={
            isSuperAdmin
              ? 'Provision institutional administrator accounts, configure functional permissions, govern active status, and manage hackathon assignments.'
              : 'Manage hackathon reviewer and coordinator assignments for institutional hackathons.'
          }
          breadcrumbs={[
            { label: 'Administrator Governance', href: '/admin/admins' },
            { label: isSuperAdmin ? 'Accounts & Assignments' : 'Hackathon Assignments' },
          ]}
        />

        <AdminsClient
          initialAdmins={initialAdmins}
          currentSuperAdminId={currentAdmin.id}
          isSuperAdmin={isSuperAdmin}
          canAssignHackathons={canAssignHackathons}
        />
      </div>
    </Shell>
  );
}
