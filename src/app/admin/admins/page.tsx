import React from 'react';
import type { Metadata } from 'next';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { SuperAdminShell } from '@/components/shells/super-admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { AdminsClient } from './admins-client';
import type { AdminWithPermissions } from '@/types/auth';

export const metadata: Metadata = {
  title: 'Administrator Governance — NMIT HackLeague Super Admin',
};

export default async function AdminManagementPage() {
  const { admin: currentAdmin } = await requireSuperAdmin();
  const supabase = await createClient();

  const { data: admins } = await supabase
    .from('admin_profiles')
    .select('*')
    .order('created_at', { ascending: true });

  const { data: permissionsData } = await supabase
    .from('admin_permissions')
    .select('admin_id, permission');

  const { data: activeHackathonsData } = await supabase
    .from('hackathons')
    .select('id, title, slug, status, in_charge_admin_id')
    .in('status', ['published', 'registration_closed', 'ongoing']);

  const permMap = new Map<string, string[]>();
  for (const p of permissionsData || []) {
    const existing = permMap.get(p.admin_id) || [];
    existing.push(p.permission);
    permMap.set(p.admin_id, existing);
  }

  const hackathonMap = new Map<string, { id: string; title: string; slug: string; status: string }[]>();
  for (const h of activeHackathonsData || []) {
    if (h.in_charge_admin_id) {
      const existing = hackathonMap.get(h.in_charge_admin_id) || [];
      existing.push({
        id: h.id,
        title: h.title,
        slug: h.slug,
        status: h.status,
      });
      hackathonMap.set(h.in_charge_admin_id, existing);
    }
  }

  const initialAdmins: AdminWithPermissions[] = (admins || []).map((adm) => {
    const activeEvents = hackathonMap.get(adm.id) || [];
    return {
      ...adm,
      permissions: (permMap.get(adm.id) || []) as AdminWithPermissions['permissions'],
      activeHackathons: activeEvents,
      activeHackathonsCount: activeEvents.length,
    };
  });

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
