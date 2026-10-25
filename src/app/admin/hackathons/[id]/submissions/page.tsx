import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireHackathonReviewScope, getCurrentAdminProfile } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { SubmissionsClient } from './submissions-client';

export const metadata: Metadata = {
  title: 'Round Submissions Review Queue | NMIT HackLeague Admin',
  description: 'Evaluate sequential round milestone submissions and evidence artifacts.',
};

interface SubmissionsPageProps {
  params: Promise<{ id: string }>;
}

export default async function HackathonSubmissionsPage({ params }: SubmissionsPageProps) {
  const { id } = await params;
  const scope = await requireHackathonReviewScope(id);
  const currentAdmin = await getCurrentAdminProfile();
  const supabase = await createClient();

  // Fetch hackathon details
  const { data: hackathon, error: hError } = await supabase
    .from('hackathons')
    .select('id, title, slug, status, event_start_at, event_end_at')
    .eq('id', id)
    .single();

  if (hError || !hackathon) {
    notFound();
  }

  // Fetch hackathon rounds
  const { data: rounds } = await supabase
    .from('hackathon_rounds')
    .select('id, round_number, name, status, start_at, end_at')
    .eq('hackathon_id', id)
    .order('round_number', { ascending: true });

  // Fetch all submissions for this hackathon with team details
  const { data: submissions } = await supabase
    .from('submissions')
    .select(`
      id,
      hackathon_id,
      round_id,
      team_id,
      submitted_by,
      parent_submission_id,
      version,
      is_current,
      status,
      title,
      description,
      github_url,
      live_demo_url,
      evidence_path,
      evidence_deleted_at,
      evidence_lifecycle_state,
      submitted_at,
      created_at,
      updated_at,
      team:teams!inner (
        id,
        name,
        leader_id,
        external_status,
        external_proof_path,
        external_proof_submitted_at,
        cdc_declaration_accepted
      ),
      reviews:submission_reviews (
        id,
        reviewer_id,
        decision,
        feedback,
        reviewed_at
      )
    `)
    .eq('hackathon_id', id)
    .order('created_at', { ascending: false });

  // Fetch results to identify winner placements
  const { data: results } = await supabase
    .from('results')
    .select('id, round_id, team_id, milestone_type, rank')
    .eq('hackathon_id', id);

  return (
    <AdminShell
      currentPath="/admin/hackathons"
      adminProfile={currentAdmin?.admin}
      permissions={currentAdmin?.permissions}
    >
      <SubmissionsClient
        hackathon={hackathon}
        rounds={rounds || []}
        initialSubmissions={(submissions as any) || []}
        results={(results as any) || []}
        isSuperAdmin={scope.isSuperAdmin}
      />
    </AdminShell>
  );
}
