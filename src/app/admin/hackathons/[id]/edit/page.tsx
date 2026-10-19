import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireHackathonScope } from '@/lib/auth/guards';
import { HackathonForm } from '@/components/hackathons/hackathon-form';
import type { Hackathon, PrizeTier } from '@/types/hackathon';

export const metadata: Metadata = {
  title: 'Edit Hackathon | NMIT HackLeague Admin',
  description: 'Update hackathon metadata and configuration.',
};

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditHackathonPage({ params }: EditPageProps) {
  const { id } = await params;
  await requireHackathonScope(id, 'manage_hackathons');
  const supabase = await createClient();

  const { data: hackathon, error } = await supabase
    .from('hackathons')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !hackathon) {
    notFound();
  }

  const h = hackathon as Hackathon;
  const prizesDetail = (Array.isArray(h.prizes_detail) ? h.prizes_detail : []) as unknown as PrizeTier[];

  const initialData = {
    id: h.id,
    title: h.title,
    slug: h.slug,
    tagline: h.tagline || '',
    description: h.description,
    organizer: h.organizer,
    mode: h.mode as 'offline' | 'online' | 'hybrid',
    venue: h.venue || '',
    registrationStartAt: h.registration_start_at,
    registrationEndAt: h.registration_end_at,
    eventStartAt: h.event_start_at,
    eventEndAt: h.event_end_at,
    minTeamSize: h.min_team_size,
    maxTeamSize: h.max_team_size,
    isSoloAllowed: h.is_solo_allowed,
    eligibility: h.eligibility || '',
    prizesSummary: h.prizes_summary || '',
    prizesDetail,
    externalRegistrationUrl: h.external_registration_url || '',
    communityUrl: h.community_url || '',
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            href="/admin/hackathons"
            className="text-xs text-brand-primary hover:underline flex items-center gap-1 mb-2"
          >
            &larr; Back to Hackathons
          </Link>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Edit Hackathon: {h.title}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Status: <span className="font-semibold capitalize text-text-primary">{h.status}</span>
          </p>
        </div>

        <Link
          href={`/admin/hackathons/${h.id}/rounds`}
          className="text-xs font-semibold px-3 py-1.5 rounded-xs border border-border-subtle bg-surface-subtle hover:bg-surface-canvas text-text-primary transition-colors"
        >
          Manage Rounds &rarr;
        </Link>
      </div>

      <HackathonForm initialData={initialData} isEdit={true} />
    </div>
  );
}
