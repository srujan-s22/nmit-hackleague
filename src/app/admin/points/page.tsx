import React from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { getPointConfigurations } from '@/lib/points/leaderboard-queries';
import { AdminPointsClient } from './admin-points-client';

export const metadata: Metadata = {
  title: 'Points & Ledger Management | NMIT HackLeague Admin',
  description: 'Manage student point adjustments, accounting reversals, and milestone award policies.',
};

export default async function AdminPointsPage() {
  const { admin } = await requireAdmin('manage_points');
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
    <div className="container mx-auto px-4 py-8">
      <AdminPointsClient
        admin={admin}
        configs={configs}
        hackathons={(hackathonsData as Array<{ id: string; title: string; status: string }>) || []}
        configError={configError}
      />
    </div>
  );
}
