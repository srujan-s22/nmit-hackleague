import React from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { HackathonsClient } from './hackathons-client';
import type { Hackathon } from '@/types/hackathon';

export const metadata: Metadata = {
  title: 'Hackathon Management | NMIT HackLeague Admin',
  description: 'Manage institutional hackathons, configure rounds, and control event lifecycles.',
};

export default async function AdminHackathonsPage() {
  const { admin, permissions } = await requireAdmin();
  const supabase = await createClient();

  const isSuperAdmin = Boolean(admin.is_super_admin);
  const canManageHackathons = isSuperAdmin || permissions.includes('manage_hackathons');
  const canAssignHackathons = isSuperAdmin || permissions.includes('assign_hackathons');

  // Fetch assigned hackathon IDs for this administrator
  let assignedHackathonIds: string[] = [];
  try {
    const { data: assignments, error: assignError } = await supabase
      .from('hackathon_admin_assignments')
      .select('hackathon_id')
      .eq('admin_id', admin.id);

    if (!assignError && assignments) {
      assignedHackathonIds = assignments.map((a) => a.hackathon_id);
    }
  } catch {
    assignedHackathonIds = [];
  }

  // Queries base table hackathons
  const { data: rawHackathons, error } = await supabase
    .from('hackathons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching admin hackathons:', error);
  }

  // Include in_charge_admin_id assignments as fallback
  const assignedSet = new Set(assignedHackathonIds);
  for (const h of rawHackathons || []) {
    if (h.in_charge_admin_id === admin.id) {
      assignedSet.add(h.id);
    }
  }
  assignedHackathonIds = Array.from(assignedSet);

  // Server-side authorization filter:
  // Draft hackathons are strictly protected and only accessible to:
  // - Super Admins
  // - Admins with manage_hackathons
  // - Admins with assign_hackathons
  // - Admins explicitly assigned to that specific hackathon
  const scopedHackathons = (rawHackathons || []).filter((h) => {
    if (h.status === 'draft') {
      return canManageHackathons || canAssignHackathons || assignedSet.has(h.id);
    }
    return true;
  });

  return (
    <AdminShell
      currentPath="/admin/hackathons"
      adminProfile={admin}
      permissions={permissions}
      assignedHackathonsCount={assignedHackathonIds.length}
    >
      <div className="space-y-6">
        <HackathonsClient
          initialHackathons={(scopedHackathons as Hackathon[]) || []}
          canManageHackathons={canManageHackathons}
          canAssignHackathons={canAssignHackathons}
          isSuperAdmin={isSuperAdmin}
          assignedHackathonIds={assignedHackathonIds}
        />
      </div>
    </AdminShell>
  );
}
