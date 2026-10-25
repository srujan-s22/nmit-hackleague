import React from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { getPointConfigurations } from '@/lib/points/leaderboard-queries';
import {
  getPointsOverviewAction,
  getPointsActivityAction,
} from '@/actions/points-admin-view-actions';
import { AdminPointsClient } from './admin-points-client';

export const metadata: Metadata = {
  title: 'Points & Awards Management | NMIT HackLeague Admin',
  description: 'Manage student points, make manual adjustments, and maintain an auditable points ledger.',
};

export default async function AdminPointsPage() {
  const { admin, permissions } = await requireAdmin('manage_points');
  const supabase = await createClient();

  // Hackathons for the adjustment form's event dropdown
  const { data: hackathonsData, error: hackathonsError } = await supabase
    .from('hackathons')
    .select('id, title, status')
    .order('created_at', { ascending: false });

  if (hackathonsError) {
    console.error('Error fetching hackathons for points management:', hackathonsError);
  }

  const [{ data: configs, error: configError }, overviewRes, activityRes] = await Promise.all([
    getPointConfigurations(),
    getPointsOverviewAction(),
    getPointsActivityAction({ days: 30, page: 1, pageSize: 10 }),
  ]);

  return (
    <AdminShell
      currentPath="/admin/points"
      adminProfile={admin}
      permissions={permissions}
    >
      <AdminPointsClient
        admin={admin}
        configs={configs}
        hackathons={(hackathonsData as Array<{ id: string; title: string; status: string }>) || []}
        configError={configError}
        initialOverview={overviewRes.overview ?? null}
        initialActivity={activityRes.activity ?? null}
        initialLoadError={overviewRes.error || activityRes.error || null}
      />
    </AdminShell>
  );
}
