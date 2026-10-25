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

  // Fetch external registration claims for teams in this hackathon
  const { data: rawClaims, error: claimsError } = await supabase
    .from('teams')
    .select(`
      id,
      name,
      hackathon_id,
      leader_id,
      internal_status,
      external_status,
      external_proof_path,
      external_proof_submitted_at,
      cdc_declaration_accepted,
      cdc_declaration_accepted_at,
      created_at,
      leader:profiles!teams_leader_id_fkey (
        id,
        full_name,
        usn,
        branch,
        academic_year
      )
    `)
    .eq('hackathon_id', id)
    .or('external_proof_path.not.is.null,external_status.neq.not_submitted')
    .order('created_at', { ascending: false });

  if (claimsError) {
    console.error('Error fetching hackathon registration claims:', {
      message: claimsError.message,
      code: claimsError.code,
      details: claimsError.details,
      hint: claimsError.hint,
      context: 'teams registration claims query with leader join',
      hackathonId: id,
    });
  }

  const initialClaims = ((rawClaims || []) as unknown as any[]).map((c) => ({
    id: c.id,
    name: c.name,
    hackathon_id: c.hackathon_id,
    leader_id: c.leader_id,
    internal_status: c.internal_status,
    external_status: c.external_status,
    external_proof_path: c.external_proof_path,
    external_proof_submitted_at: c.external_proof_submitted_at,
    cdc_declaration_accepted: Boolean(c.cdc_declaration_accepted),
    cdc_declaration_accepted_at: c.cdc_declaration_accepted_at,
    created_at: c.created_at,
    leader: c.leader || null,
  }));

  // Fetch all round submissions for this hackathon with team details
  const { data: rawSubmissions, error: subError } = await supabase
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
      repo_url,
      demo_url,
      evidence_path,
      evidence_deleted_at,
      evidence_lifecycle_state,
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

  if (subError) {
    console.error('Error fetching hackathon submissions:', {
      message: subError.message,
      code: subError.code,
      details: subError.details,
      hint: subError.hint,
      context: 'submissions query with team & reviews joins',
      hackathonId: id,
    });
  }

  const initialSubmissions = ((rawSubmissions || []) as any[]).map((s) => ({
    ...s,
    github_url: s.repo_url,
    live_demo_url: s.demo_url,
    submitted_at: s.created_at,
  }));

  // Fetch results to identify winner placements
  const { data: results } = await supabase
    .from('results')
    .select('id, round_id, team_id, milestone_type, rank')
    .eq('hackathon_id', id);

  const fetchError = claimsError || subError
    ? 'Unable to load all submission or claim records. Please refresh the page.'
    : null;

  const content = (
    <SubmissionsClient
      hackathon={hackathon}
      rounds={rounds || []}
      initialSubmissions={initialSubmissions}
      initialClaims={initialClaims}
      results={(results as any) || []}
      isSuperAdmin={scope.isSuperAdmin}
      fetchError={fetchError}
    />
  );

  if (scope.isSuperAdmin) {
    const { SuperAdminShell } = await import('@/components/shells/super-admin-shell');
    return (
      <SuperAdminShell
        currentPath="/admin/hackathons"
        adminProfile={currentAdmin?.admin}
        permissions={currentAdmin?.permissions}
      >
        {content}
      </SuperAdminShell>
    );
  }

  return (
    <AdminShell
      currentPath="/admin/hackathons"
      adminProfile={currentAdmin?.admin}
      permissions={currentAdmin?.permissions}
    >
      {content}
    </AdminShell>
  );
}
