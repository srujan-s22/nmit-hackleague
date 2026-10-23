import React from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { getPointConfigurations } from '@/lib/points/leaderboard-queries';
import { AdminPointsClient } from './admin-points-client';

export const metadata: Metadata = {
  title: 'Points & Ledger Management | NMIT HackLeague Admin',
  description: 'Manage student point adjustments, accounting reversals, and milestone award policies.',
};

export default async function AdminPointsPage() {
  const { admin, permissions } = await requireAdmin('manage_points');
  const supabase = await createClient();

  // Query hackathons for event-scoped adjustments
  const { data: hackathonsData, error: hackathonsError } = await supabase
    .from('hackathons')
    .select('id, title, status')
    .order('created_at', { ascending: false });

  if (hackathonsError) {
    console.error('Error fetching hackathons for points management:', hackathonsError);
  }

  const { data: configs, error: configError } = await getPointConfigurations();

  return (
    <AdminShell
      currentPath="/admin/points"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="space-y-6">
        <AdminPointsClient
          admin={admin}
          configs={configs}
          hackathons={(hackathonsData as Array<{ id: string; title: string; status: string }>) || []}
          configError={configError}
        />
      </div>
    </AdminShell>
  );
}
