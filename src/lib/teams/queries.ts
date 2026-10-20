import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { computeRegistrationState } from '@/lib/hackathons/registration-state';
import type { RegistrationState } from '@/types/hackathon';
import { getSignedPreviewUrlWithClient } from '@/lib/storage/paths';

export interface StudentTeamSummary {
  id: string;
  name: string;
  hackathon_id: string;
  leader_id: string;
  is_leader: boolean;
  role: 'leader' | 'member';
  internal_status: string;
  external_status: string;
  external_proof_submitted_at: string | null;
  has_registration_proof: boolean;
  invitation_code: string | null;
  invitation_code_expires_at: string | null;
  joined_at: string;
  hackathon: {
    id: string;
    title: string;
    slug: string;
    status: string;
    registration_start_at: string;
    registration_end_at: string;
    min_team_size: number;
    max_team_size: number;
    is_solo_allowed: boolean;
    registration_state: RegistrationState;
  } | null;
}

export interface TeamMemberDetail {
  id: string;
  team_id: string;
  student_id: string;
  role: 'leader' | 'member';
  joined_at: string;
  profile?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    roll_number: string | null;
  } | null;
}

export interface TeamDetails {
  id: string;
  name: string;
  hackathon_id: string;
  leader_id: string;
  is_leader: boolean;
  internal_status: string;
  external_status: string;
  external_proof_submitted_at: string | null;
  has_registration_proof: boolean;
  can_view_proof: boolean;
  invitation_code: string | null;
  invitation_code_expires_at: string | null;
  created_at: string;
  updated_at: string;
  members: TeamMemberDetail[];
  hackathon: {
    id: string;
    title: string;
    slug: string;
    status: string;
    registration_start_at: string;
    registration_end_at: string;
    min_team_size: number;
    max_team_size: number;
    is_solo_allowed: boolean;
    registration_state: RegistrationState;
    is_round_1_paused: boolean;
  } | null;
}

export interface HackathonRegistrationContext {
  id: string;
  title: string;
  slug: string;
  status: string;
  registration_start_at: string;
  registration_end_at: string;
  min_team_size: number;
  max_team_size: number;
  is_solo_allowed: boolean;
  registration_state: RegistrationState;
  is_round_1_paused: boolean;
  is_registration_open: boolean;
}

/**
 * Fetches the authenticated student's teams, optionally filtered by hackathon.
 * Enforces RLS via session-aware client. Masks invitation codes for non-leaders.
 */
export async function getStudentTeams(hackathonId?: string): Promise<StudentTeamSummary[]> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return [];
  }

  let query = supabase
    .from('team_members')
    .select(`
      id,
      team_id,
      role,
      joined_at,
      hackathon_id,
      teams!fk_team_members_team_composite (
        id,
        name,
        hackathon_id,
        leader_id,
        internal_status,
        external_status,
        external_proof_submitted_at,
        external_proof_path,
        invitation_code,
        invitation_code_expires_at,
        hackathons!teams_hackathon_id_fkey (
          id,
          title,
          slug,
          status,
          registration_start_at,
          registration_end_at,
          min_team_size,
          max_team_size,
          is_solo_allowed
        )
      )
    `)
    .eq('student_id', user.id);

  if (hackathonId) {
    query = query.eq('hackathon_id', hackathonId);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data
    .map((membership) => {
      const team = Array.isArray(membership.teams) ? membership.teams[0] : membership.teams;
      if (!team) return null;

      const hackathon = Array.isArray(team.hackathons) ? team.hackathons[0] : team.hackathons;
      const isLeader = team.leader_id === user.id;

      let regState: RegistrationState = 'CLOSED';
      if (hackathon) {
        regState = computeRegistrationState(
          hackathon.status,
          hackathon.registration_start_at,
          hackathon.registration_end_at
        );
      }

      return {
        id: team.id,
        name: team.name,
        hackathon_id: team.hackathon_id,
        leader_id: team.leader_id,
        is_leader: isLeader,
        role: (membership.role as 'leader' | 'member') || 'member',
        internal_status: team.internal_status,
        external_status: team.external_status,
        external_proof_submitted_at: team.external_proof_submitted_at,
        has_registration_proof: Boolean(team.external_proof_path),
        // Mask invitation code for non-leaders to preserve authorization boundary
        invitation_code: isLeader ? team.invitation_code : null,
        invitation_code_expires_at: isLeader ? team.invitation_code_expires_at : null,
        joined_at: membership.joined_at,
        hackathon: hackathon
          ? {
              id: hackathon.id,
              title: hackathon.title,
              slug: hackathon.slug,
              status: hackathon.status,
              registration_start_at: hackathon.registration_start_at,
              registration_end_at: hackathon.registration_end_at,
              min_team_size: hackathon.min_team_size,
              max_team_size: hackathon.max_team_size,
              is_solo_allowed: hackathon.is_solo_allowed,
              registration_state: regState,
            }
          : null,
      };
    })
    .filter((t): t is StudentTeamSummary => t !== null);
}

/**
 * Fetches full details for a specific team including roster and registration proof status.
 * Enforces RLS and verifies private viewing authorization via can_view_registration_proof.
 */
export async function getTeamDetails(teamId: string): Promise<TeamDetails | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return null;
  }

  // 1. Fetch team and hackathon
  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .select(`
      id,
      name,
      hackathon_id,
      leader_id,
      internal_status,
      external_status,
      external_proof_submitted_at,
      external_proof_path,
      invitation_code,
      invitation_code_expires_at,
      created_at,
      updated_at,
      hackathons!teams_hackathon_id_fkey (
        id,
        title,
        slug,
        status,
        registration_start_at,
        registration_end_at,
        min_team_size,
        max_team_size,
        is_solo_allowed
      )
    `)
    .eq('id', teamId)
    .single();

  if (teamErr || !team) {
    return null;
  }

  const hackathon = Array.isArray(team.hackathons) ? team.hackathons[0] : team.hackathons;
  const isLeader = team.leader_id === user.id;

  // 2. Check if caller can view registration proof
  const { data: canViewProof } = await supabase.rpc('can_view_registration_proof', {
    p_team_id_text: teamId,
  });

  // 3. Fetch team members
  const { data: membersData } = await supabase
    .from('team_members')
    .select(`
      id,
      team_id,
      student_id,
      role,
      joined_at,
      profiles!team_members_student_id_fkey (
        id,
        full_name,
        email,
        avatar_url,
        roll_number
      )
    `)
    .eq('team_id', teamId)
    .order('joined_at', { ascending: true });

  const members: TeamMemberDetail[] = (membersData || []).map((m) => {
    const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      id: m.id,
      team_id: m.team_id,
      student_id: m.student_id,
      role: (m.role as 'leader' | 'member') || 'member',
      joined_at: m.joined_at,
      profile: prof
        ? {
            id: prof.id,
            full_name: prof.full_name,
            email: prof.email,
            avatar_url: prof.avatar_url,
            roll_number: prof.roll_number,
          }
        : null,
    };
  });

  // 4. Check paused status for Round 1
  let isRound1Paused = false;
  if (hackathon) {
    const { data: round1 } = await supabase
      .from('hackathon_rounds')
      .select('status, end_at')
      .eq('hackathon_id', hackathon.id)
      .eq('round_number', 1)
      .single();

    if (round1) {
      isRound1Paused =
        round1.status === 'paused' ||
        (round1.status === 'open' && new Date(round1.end_at) <= new Date());
    }
  }

  let regState: RegistrationState = 'CLOSED';
  if (hackathon) {
    regState = computeRegistrationState(
      hackathon.status,
      hackathon.registration_start_at,
      hackathon.registration_end_at
    );
  }

  return {
    id: team.id,
    name: team.name,
    hackathon_id: team.hackathon_id,
    leader_id: team.leader_id,
    is_leader: isLeader,
    internal_status: team.internal_status,
    external_status: team.external_status,
    external_proof_submitted_at: team.external_proof_submitted_at,
    has_registration_proof: Boolean(team.external_proof_path),
    can_view_proof: Boolean(canViewProof),
    // Mask invitation code for non-leaders
    invitation_code: isLeader ? team.invitation_code : null,
    invitation_code_expires_at: isLeader ? team.invitation_code_expires_at : null,
    created_at: team.created_at,
    updated_at: team.updated_at,
    members,
    hackathon: hackathon
      ? {
          id: hackathon.id,
          title: hackathon.title,
          slug: hackathon.slug,
          status: hackathon.status,
          registration_start_at: hackathon.registration_start_at,
          registration_end_at: hackathon.registration_end_at,
          min_team_size: hackathon.min_team_size,
          max_team_size: hackathon.max_team_size,
          is_solo_allowed: hackathon.is_solo_allowed,
          registration_state: regState,
          is_round_1_paused: isRound1Paused,
        }
      : null,
  };
}

/**
 * Fetches hackathon registration lifecycle and deadline context.
 */
export async function getHackathonRegistrationContext(
  hackathonId: string
): Promise<HackathonRegistrationContext | null> {
  const supabase = await createClient();

  const { data: hackathon, error } = await supabase
    .from('hackathons')
    .select(`
      id,
      title,
      slug,
      status,
      registration_start_at,
      registration_end_at,
      min_team_size,
      max_team_size,
      is_solo_allowed
    `)
    .eq('id', hackathonId)
    .single();

  if (error || !hackathon) {
    return null;
  }

  // Check Round 1 paused state
  const { data: round1 } = await supabase
    .from('hackathon_rounds')
    .select('status, end_at')
    .eq('hackathon_id', hackathonId)
    .eq('round_number', 1)
    .single();

  const isRound1Paused =
    round1?.status === 'paused' ||
    (round1?.status === 'open' && new Date(round1.end_at) <= new Date());

  const regState = computeRegistrationState(
    hackathon.status,
    hackathon.registration_start_at,
    hackathon.registration_end_at
  );

  const isRegistrationOpen =
    regState === 'OPEN' &&
    !isRound1Paused &&
    ['published', 'ongoing'].includes(hackathon.status);

  return {
    id: hackathon.id,
    title: hackathon.title,
    slug: hackathon.slug,
    status: hackathon.status,
    registration_start_at: hackathon.registration_start_at,
    registration_end_at: hackathon.registration_end_at,
    min_team_size: hackathon.min_team_size,
    max_team_size: hackathon.max_team_size,
    is_solo_allowed: hackathon.is_solo_allowed,
    registration_state: regState,
    is_round_1_paused: isRound1Paused,
    is_registration_open: isRegistrationOpen,
  };
}

/**
 * Generates a short-lived (60s) secure signed preview URL for registration proof screenshot.
 * Strictly verifies caller authorization via can_view_registration_proof.
 */
export async function getRegistrationProofPreviewUrl(
  teamId: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { success: false, error: 'Authentication required.' };
  }

  // Verify private view authorization via RPC
  const { data: canView, error: checkErr } = await supabase.rpc('can_view_registration_proof', {
    p_team_id_text: teamId,
  });

  if (checkErr || !canView) {
    return {
      success: false,
      error: 'Unauthorized: you do not have permission to view this registration proof.',
    };
  }

  // Fetch proof path from teams table
  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .select('external_proof_path')
    .eq('id', teamId)
    .single();

  if (teamErr || !team || !team.external_proof_path) {
    return { success: false, error: 'Registration proof screenshot not found.' };
  }

  return getSignedPreviewUrlWithClient(supabase, 'submission-evidence', team.external_proof_path, 60);
}
