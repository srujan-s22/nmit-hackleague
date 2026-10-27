import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { computeRegistrationState } from '@/lib/hackathons/registration-state';
import type { RegistrationState } from '@/types/hackathon';
import { getSignedPreviewUrlWithClient } from '@/lib/storage/paths';
import { refreshRoundStatuses } from '@/lib/hackathons/round-status';

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
    email?: string;
    avatar_url: string | null;
    roll_number?: string | null;
    branch?: string;
    academic_year?: number;
    profile_photo_path?: string | null;
  } | null;
}

export interface TeamRoundMilestone {
  round: {
    id: string;
    round_number: number;
    name: string;
    status: 'scheduled' | 'open' | 'evaluation' | 'completed' | 'paused';
    start_at: string;
    end_at: string;
  };
  isQualified: boolean;
  currentSubmission: any | null;
  history: any[];
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
  roundMilestones: TeamRoundMilestone[];
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
    external_registration_url: string | null;
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
  await refreshRoundStatuses(supabase);
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
        is_solo_allowed,
        external_registration_url
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

  // 3. Fetch team members via scoped RPC get_team_roster (RLS safe & sanitized)
  const { data: rosterData } = await supabase.rpc('get_team_roster', {
    p_team_id: teamId,
  });

  const members: TeamMemberDetail[] = await Promise.all(
    ((rosterData as any[]) || []).map(async (m) => {
      let avatarUrl: string | null = null;
      if (m.profile_photo_path) {
        const previewRes = await getSignedPreviewUrlWithClient(
          supabase,
          'profile-photos',
          m.profile_photo_path,
          900
        );
        if (previewRes.success && previewRes.url) {
          avatarUrl = previewRes.url;
        }
      }

      return {
        id: m.id,
        team_id: m.team_id || teamId,
        student_id: m.student_id,
        role: (m.role as 'leader' | 'member') || 'member',
        joined_at: m.joined_at || team.created_at,
        profile: {
          id: m.student_id,
          full_name: m.full_name,
          email: '', // sanitized: email omitted from roster projection
          avatar_url: avatarUrl,
          roll_number: null, // sanitized: USN omitted from roster projection
          branch: m.branch,
          academic_year: m.academic_year,
          profile_photo_path: m.profile_photo_path,
        },
      };
    })
  );

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

  // 5. Fetch Hackathon Rounds
  const { data: roundsData } = await supabase
    .from('hackathon_rounds')
    .select('id, round_number, name, status, start_at, end_at')
    .eq('hackathon_id', team.hackathon_id)
    .order('round_number', { ascending: true });

  const rounds = roundsData || [];

  // 6. Fetch Team Results (for qualification)
  const { data: resultsData } = await supabase
    .from('results')
    .select('round_id, milestone_type')
    .eq('team_id', teamId)
    .eq('milestone_type', 'round_qualification');

  const qualifiedRoundIds = new Set((resultsData || []).map((r) => r.round_id));

  // 7. Fetch Submissions with Reviews for this team
  const { data: submissionsData } = await supabase
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
      github_url:repo_url,
      live_demo_url:demo_url,
      evidence_path,
      evidence_deleted_at,
      evidence_lifecycle_state,
      submitted_at:created_at,
      created_at,
      updated_at,
      reviews:submission_reviews (
        id,
        reviewer_id,
        decision,
        feedback,
        reviewed_at
      )
    `)
    .eq('team_id', teamId)
    .order('version', { ascending: false });

  const allSubmissions = (submissionsData || []) as any[];

  const roundMilestones: TeamRoundMilestone[] = rounds.map((r) => {
    const isRound1 = r.round_number === 1;
    let isQualified = false;
    if (isRound1) {
      isQualified = team.external_status !== 'not_submitted';
    } else {
      const prevRound = rounds.find((pr) => pr.round_number === r.round_number - 1);
      isQualified = Boolean(prevRound && qualifiedRoundIds.has(prevRound.id));
    }

    const roundSubs = allSubmissions.filter((s) => s.round_id === r.id);
    const currentSub = roundSubs.find((s) => s.is_current) || null;
    const history = roundSubs.filter((s) => !s.is_current);

    return {
      round: {
        id: r.id,
        round_number: r.round_number,
        name: r.name,
        status: r.status as any,
        start_at: r.start_at,
        end_at: r.end_at,
      },
      isQualified,
      currentSubmission: currentSub,
      history,
    };
  });

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
    roundMilestones,
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
          // Only leaders register the team externally, so only they get the link.
          external_registration_url: isLeader ? hackathon.external_registration_url : null,
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
  await refreshRoundStatuses(supabase, hackathonId);

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
