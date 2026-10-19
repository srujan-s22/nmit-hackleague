import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { NotificationsClient } from './notifications-client';

export const metadata: Metadata = {
  title: 'Broadcasts & Announcements — NMIT HackLeague Admin',
  description: 'Dispatch platform-wide alerts and push notifications to students and organizers.',
};

export default async function AdminNotificationsPage() {
  const { admin, permissions } = await requireAdmin('manage_notifications');
  const supabase = await createClient();

  const { data: announcements } = await supabase
    .from('announcements')
    .select('id, title, body, target_role, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const formattedAnnouncements = (announcements || []).map((a) => ({
    id: a.id,
    title: a.title,
    message: a.body,
    target_role: a.target_role,
    created_at: a.created_at,
  }));

  return (
    <AdminShell
      currentPath="/admin/notifications"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Institutional Broadcasts & Announcements"
          description="Send website announcements and Web Push notifications to participants, organizers, and campus stakeholders."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Broadcasts & Alerts' },
          ]}
        />

        <NotificationsClient initialAnnouncements={formattedAnnouncements} />
      </div>
    </AdminShell>
  );
}
