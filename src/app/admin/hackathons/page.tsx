import React from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { HackathonsClient } from './hackathons-client';
import type { Hackathon } from '@/types/hackathon';

export const metadata: Metadata = {
  title: 'Hackathon Management | NMIT HackLeague Admin',
  description: 'Manage institutional hackathons, configure rounds, and control event lifecycles.',
};

export default async function AdminHackathonsPage() {
  await requireAdmin('manage_hackathons');
  const supabase = await createClient();

  // Queries base table hackathons (accessible to authorized admins via RLS policy hackathons_admin_manage)
  const { data: hackathons, error } = await supabase
    .from('hackathons')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching admin hackathons:', error);
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <HackathonsClient initialHackathons={(hackathons as Hackathon[]) || []} />
    </div>
  );
}
