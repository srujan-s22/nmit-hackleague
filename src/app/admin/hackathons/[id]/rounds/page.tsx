import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireHackathonScope } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { RoundConfigForm } from '@/components/hackathons/round-config-form';
import type { Hackathon, HackathonRound } from '@/types/hackathon';

export const metadata: Metadata = {
  title: 'Configure Rounds | NMIT HackLeague Admin',
  description: 'Configure chronological rounds and evaluation criteria for a hackathon.',
};

interface RoundsPageProps {
  params: Promise<{ id: string }>;
}

export default async function HackathonRoundsPage({ params }: RoundsPageProps) {
  const { id } = await params;
  const { admin, permissions } = await requireHackathonScope(id, 'manage_hackathons');
  const supabase = await createClient();

  const { data: hackathon, error: hError } = await supabase
    .from('hackathons')
    .select('*')
    .eq('id', id)
    .single();

  if (hError || !hackathon) {
    notFound();
  }

  const { data: rounds } = await supabase
    .from('hackathon_rounds')
    .select('*')
    .eq('hackathon_id', id)
    .order('round_number', { ascending: true });

  const h = hackathon as Hackathon;
  const initialRounds = (rounds as HackathonRound[]) || [];

  return (
    <AdminShell
      currentPath="/admin/hackathons"
      adminProfile={admin}
      permissions={permissions}
    >
      <div className="max-w-4xl space-y-6">
        <div className="mb-6">
          <Link
            href="/admin/hackathons"
            className="text-xs text-brand-primary hover:underline flex items-center gap-1 mb-2"
          >
            &larr; Back to Hackathons
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-text-primary tracking-tight">
                Round Architecture: {h.title}
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                Configure sequential evaluation rounds. At least one round is required before an event can be published.
              </p>
            </div>
            <Link
              href={`/admin/hackathons/${h.id}/edit`}
              className="text-xs text-text-secondary hover:text-text-primary hover:underline"
            >
              Edit Event Info
            </Link>
          </div>
        </div>

        <RoundConfigForm
          hackathonId={h.id}
          hackathonTitle={h.title}
          eventStartAt={h.event_start_at}
          eventEndAt={h.event_end_at}
          initialRounds={initialRounds}
        />
      </div>
    </AdminShell>
  );
}
