import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { fetchMyAssignedHackathonsAction } from '@/actions/admin-assignment-actions';
import { AssignedHackathonsClient } from './assigned-hackathons-client';

export const metadata: Metadata = {
  title: 'My Assigned Hackathons | NMIT HackLeague Admin',
  description: 'Dedicated workspace for assigned administrators to review submissions, inspect evidence, and evaluate milestones.',
};

export default async function AdminAssignedHackathonsPage() {
  const { admin, permissions } = await requireAdmin();
  const isSuperAdmin = Boolean(admin.is_super_admin);

  const res = await fetchMyAssignedHackathonsAction();
  const assignedHackathons = res.success && res.data ? res.data : [];

  // Fail-closed authorization boundary:
  // Non-Super-Admin users with no active assignments cannot access this workspace
  if (!isSuperAdmin && assignedHackathons.length === 0) {
    redirect('/admin/hackathons?unassigned=1');
  }

  return (
    <AdminShell
      currentPath="/admin/assigned-hackathons"
      adminProfile={admin}
      permissions={permissions}
      assignedHackathonsCount={assignedHackathons.length}
    >
      <AssignedHackathonsClient
        initialHackathons={assignedHackathons}
        isSuperAdmin={isSuperAdmin}
      />
    </AdminShell>
  );
}
