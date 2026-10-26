import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireHackathonReviewScope, getCurrentAdminProfile } from '@/lib/auth/guards';
import { AdminShell } from '@/components/shells/admin-shell';
import { SuperAdminShell } from '@/components/shells/super-admin-shell';
import { TeamsClient, type RosterTeamItem } from './teams-client';

export const metadata: Metadata = {
  title: 'Registered Teams Roster | NMIT HackLeague Admin',
  description: 'Inspect registered teams, roster composition, and external registration claims.',
};

interface TeamsPageProps {
  params: Promise<{ id: string }>;
}

export default async function HackathonTeamsPage({ params }: TeamsPageProps) {
  const { id } = await params;

  // 1. Enforce strict server-side authorization:
  // Requires Super Admin or actively assigned reviewer / in-charge admin for this hackathon
  const scope = await requireHackathonReviewScope(id);
  const currentAdmin = await getCurrentAdminProfile();
  const supabase = await createClient();

  // 2. Fetch hackathon details
  const { data: hackathon, error: hError } = await supabase
    .from('hackathons')
    .select('id, title, slug, status, min_team_size, max_team_size, is_solo_allowed, registration_end_at')
    .eq('id', id)
    .single();

  if (hError || !hackathon) {
    notFound();
  }

  // 3. Fetch all teams for this hackathon
  // Strict non-leak query: only essential student profile fields (id, full_name, usn, branch, academic_year)
  const { data: rawTeams, error: tError } = await supabase
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
      ),
      team_members:team_members!fk_team_members_team_composite (
        id,
        role,
        student:profiles!team_members_student_id_fkey (
          id,
          full_name,
          usn,
          branch,
          academic_year
        )
      )
    `)
    .eq('hackathon_id', id)
    .order('created_at', { ascending: false });

  if (tError) {
    console.error('Error fetching hackathon registered teams:', {
      message: tError.message,
      code: tError.code,
      details: tError.details,
      hint: tError.hint,
      context: 'teams query with leader & team_members joins',
      hackathonId: id,
    });
  }

  const teams: RosterTeamItem[] = ((rawTeams || []) as unknown as any[]).map((t) => {
    const memberStudents: any[] = (t.team_members || [])
      .map((m: any) => m.student)
      .filter(Boolean);

    // Ensure leader is present in the full confirmed student members list
    if (t.leader && !memberStudents.some((s: any) => s.id === t.leader.id)) {
      memberStudents.unshift(t.leader);
    }

    return {
      id: t.id,
      name: t.name,
      hackathon_id: t.hackathon_id,
      leader_id: t.leader_id,
      internal_status: t.internal_status,
      external_status: t.external_status,
      external_proof_path: t.external_proof_path,
      external_proof_submitted_at: t.external_proof_submitted_at,
      cdc_declaration_accepted: t.cdc_declaration_accepted,
      cdc_declaration_accepted_at: t.cdc_declaration_accepted_at,
      created_at: t.created_at,
      leader: t.leader || null,
      members: memberStudents,
    };
  });

  const content = (
    <TeamsClient
      hackathon={hackathon}
      initialTeams={teams}
      isSuperAdmin={scope.isSuperAdmin}
      fetchError={tError ? 'Unable to load registered teams roster. Please refresh or verify permissions.' : null}
    />
  );

  if (scope.isSuperAdmin) {
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
