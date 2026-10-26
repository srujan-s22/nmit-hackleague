import React from 'react';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
  const adminClient = createAdminClient();

  // 1. Fetch recent announcements with explicit error capture
  const { data: announcements, error: announcementsError } = await supabase
    .from('announcements')
    .select('id, title, body, target_role, hackathon_id, announcement_type, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const formattedAnnouncements = (announcements || []).map((a) => ({
    id: a.id,
    title: a.title,
    message: a.body,
    target_role: a.target_role,
    hackathon_id: a.hackathon_id,
    announcement_type: a.announcement_type,
    created_at: a.created_at,
  }));

  // 2. Fetch hackathons for event-scoping dropdown
  const { data: hackathons } = await supabase
    .from('hackathons')
    .select('id, title')
    .order('created_at', { ascending: false })
    .limit(20);

  // 3. Fetch push delivery stats with error tracking
  const { data: logs, error: logsError } = await adminClient
    .from('push_delivery_logs')
    .select('status');

  const deliveryStats = {
    delivered: 0,
    failed: 0,
    expired: 0,
    pending: 0,
    totalAttempts: logs?.length || 0,
  };

  (logs || []).forEach((log) => {
    if (log.status === 'delivered') deliveryStats.delivered++;
    else if (log.status === 'failed') deliveryStats.failed++;
    else if (log.status === 'expired') deliveryStats.expired++;
    else if (log.status === 'pending') deliveryStats.pending++;
  });

  return (
    <AdminShell
      currentPath="/admin/notifications"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <PageHeader
          title="Institutional Broadcasts & Announcements"
          description="Send announcements and push notifications."
          breadcrumbs={[
            { label: 'Admin Workspace', href: '/admin' },
            { label: 'Broadcasts & Alerts' },
          ]}
        />

        <NotificationsClient
          initialAnnouncements={formattedAnnouncements}
          hackathons={hackathons || []}
          initialStats={deliveryStats}
          announcementsError={announcementsError ? announcementsError.message : null}
          statsError={logsError ? logsError.message : null}
        />
      </div>
    </AdminShell>
  );
}
