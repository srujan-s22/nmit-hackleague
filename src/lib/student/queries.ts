import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { getSignedPreviewUrlWithClient } from '@/lib/storage/paths';
import { getStudentTeams } from '@/lib/teams/queries';
import { getStudentPointsSummary } from '@/lib/points/leaderboard-queries';
import type { Database } from '@/types/database';

export type ProfileChangeRequestRow = Database['public']['Tables']['profile_change_requests']['Row'];

export interface TeammateRosterItem {
  id: string;
  studentId: string;
  fullName: string;
  branch: string;
  academicYear: number;
  role: string;
  avatarUrl: string | null;
}

export interface CompetitionParticipationItem {
  teamId: string;
  teamName: string;
  hackathonId: string;
  hackathonTitle: string;
  hackathonSlug: string;
  hackathonStatus: string;
  eventStartAt: string;
  eventEndAt: string;
  role: 'leader' | 'member';
  internalStatus: string;
  externalStatus: string;
  externalStatusLabel: 'Submitted Claim' | 'Not Submitted' | 'Rejected';
  externalProofSubmittedAt: string | null;
  teammates: TeammateRosterItem[];
  milestones: Array<{
    roundId: string;
    roundNumber: number;
    roundName: string;
    status: string;
    isQualified: boolean;
  }>;
  isActive: boolean;
}

export interface StudentProfileData {
  profile: Database['public']['Tables']['profiles']['Row'];
  avatarUrl: string | null;
  totalPoints: number;
  rank: number | null;
  verifiedQualificationsCount: number;
  submittedClaimsCount: number;
}

export interface PendingProfileChangeReviewItem {
  id: string;
  student_id: string;
  field_name: 'full_name' | 'usn' | 'branch' | 'academic_year';
  old_value: string;
  new_value: string;
  reason: string;
  status: string;
  created_at: string;
  student: {
    id: string;
    full_name: string;
    usn: string;
    branch: string;
    academic_year: number;
    email: string;
  };
}

/**
 * Fetches the authenticated approved student's profile along with short-lived signed avatar URL,
 * total points, and platform rank.
 */
export async function getStudentProfileData(): Promise<StudentProfileData> {
  const { profile } = await requireApprovedStudent();
  const supabase = await createClient();

  let avatarUrl: string | null = null;
  if (profile.profile_photo_path) {
    const previewRes = await getSignedPreviewUrlWithClient(
      supabase,
      'profile-photos',
      profile.profile_photo_path,
      900
    );
    if (previewRes.success && previewRes.url) {
      avatarUrl = previewRes.url;
    }
  }

  // Fetch points summary and rank
  const { data: pointsSummary } = await getStudentPointsSummary(profile.id);

  return {
    profile,
    avatarUrl,
    totalPoints: pointsSummary?.total_points ?? 0,
    rank: pointsSummary?.rank ?? null,
    verifiedQualificationsCount: pointsSummary?.verified_qualifications_count ?? 0,
    submittedClaimsCount: pointsSummary?.submitted_claims_count ?? 0,
  };
}

/**
 * Fetches the authenticated student's profile change request history ordered chronologically.
 */
export async function getStudentProfileChangeRequests(): Promise<ProfileChangeRequestRow[]> {
  const { profile } = await requireApprovedStudent();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profile_change_requests')
    .select('*')
    .eq('student_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch profile change requests:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetches comprehensive participation history for the authenticated student,
 * querying teammates via public.get_team_roster RPC to preserve teammate privacy.
 * Clearly separates Active Competitions vs. Completed Events.
 * Strictly labels unreviewed screenshots as 'Submitted Claim'.
 */
export async function getStudentParticipationTimeline(): Promise<{
  active: CompetitionParticipationItem[];
  completed: CompetitionParticipationItem[];
}> {
  const { profile } = await requireApprovedStudent();
  const supabase = await createClient();

  // 1. Fetch student's teams
  const teams = await getStudentTeams();

  const active: CompetitionParticipationItem[] = [];
  const completed: CompetitionParticipationItem[] = [];

  for (const team of teams) {
    if (!team.hackathon) continue;

    // 2. Fetch sanitized team roster via RPC
    const { data: rosterData } = await supabase.rpc('get_team_roster', {
      p_team_id: team.id,
    });

    const teammates: TeammateRosterItem[] = await Promise.all(
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
          studentId: m.student_id,
          fullName: m.full_name,
          branch: m.branch,
          academicYear: m.academic_year,
          role: m.role,
          avatarUrl,
        };
      })
    );

    // 3. Fetch round milestones for this team's hackathon
    const { data: rounds } = await supabase
      .from('hackathon_rounds')
      .select('id, round_number, name, status')
      .eq('hackathon_id', team.hackathon_id)
      .order('round_number', { ascending: true });

    // Fetch team round submissions to determine qualification
    const { data: teamSubmissions } = await supabase
      .from('submissions')
      .select('round_id, status')
      .eq('team_id', team.id);

    const qualifiedRoundIds = new Set(
      (teamSubmissions || [])
        .filter((s) => s.status === 'qualified' || s.status === 'advanced' || s.status === 'winner')
        .map((s) => s.round_id)
    );

    const milestones = (rounds || []).map((r) => ({
      roundId: r.id,
      roundNumber: r.round_number,
      roundName: r.name,
      status: r.status,
      isQualified: qualifiedRoundIds.has(r.id),
    }));

    // Determine strict external status label
    let externalStatusLabel: CompetitionParticipationItem['externalStatusLabel'] = 'Not Submitted';
    if (team.external_status === 'submitted') {
      externalStatusLabel = 'Submitted Claim';
    } else if (team.external_status === 'rejected') {
      externalStatusLabel = 'Rejected';
    }

    // Determine active vs completed
    const hStatus = team.hackathon.status;
    const isEventCompleted =
      hStatus === 'completed' || hStatus === 'archived' || hStatus === 'results_published';

    const item: CompetitionParticipationItem = {
      teamId: team.id,
      teamName: team.name,
      hackathonId: team.hackathon.id,
      hackathonTitle: team.hackathon.title,
      hackathonSlug: team.hackathon.slug,
      hackathonStatus: team.hackathon.status,
      eventStartAt: team.hackathon.registration_start_at,
      eventEndAt: team.hackathon.registration_end_at,
      role: team.role,
      internalStatus: team.internal_status,
      externalStatus: team.external_status,
      externalStatusLabel,
      externalProofSubmittedAt: team.external_proof_submitted_at,
      teammates,
      milestones,
      isActive: !isEventCompleted,
    };

    if (isEventCompleted) {
      completed.push(item);
    } else {
      active.push(item);
    }
  }

  return { active, completed };
}

/**
 * Fetches all pending profile change requests for the administrative review queue.
 * Requires manage_students or super_admin permission.
 */
export async function getPendingProfileChangeRequests(): Promise<PendingProfileChangeReviewItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profile_change_requests')
    .select(`
      id,
      student_id,
      field_name,
      old_value,
      new_value,
      reason,
      status,
      created_at,
      profiles!profile_change_requests_student_id_fkey (
        id,
        full_name,
        usn,
        branch,
        academic_year,
        email
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Failed to fetch pending profile change requests:', error);
    return [];
  }

  return ((data || []) as any[]).map((row) => {
    const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      student_id: row.student_id,
      field_name: row.field_name,
      old_value: row.old_value,
      new_value: row.new_value,
      reason: row.reason,
      status: row.status,
      created_at: row.created_at,
      student: {
        id: prof?.id || row.student_id,
        full_name: prof?.full_name || 'Unknown Student',
        usn: prof?.usn || '—',
        branch: prof?.branch || '—',
        academic_year: prof?.academic_year || 1,
        email: prof?.email || '—',
      },
    };
  });
}
