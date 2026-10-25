'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';

// Read-side data for the admin Points & Awards page (summary cards, student
// lookup, recent activity). Writes still go through adjustPointsAction.
//
// Data-access notes (verified against hosted, not assumed):
//  - The service-role client can only read `profiles` / `admin_profiles` on
//    hosted (no table grant on points_ledger, teams, team_members, hackathons),
//    so it is used ONLY for those two tables (names/emails of students/admins).
//  - Everything else is read through the caller's own session, so RLS decides
//    visibility: a Super Admin sees the whole ledger; a manage_points admin sees
//    the ledger rows of hackathons they are assigned to.

const LEDGER_PAGE_SIZE = 1000; // PostgREST max_rows is 1000 per request
const LEDGER_MAX_PAGES = 100; // hard stop at 100k rows rather than looping forever
const RECENT_DAYS = 30;

export interface PointsOverview {
  approved_students: number;
  students_with_points: number;
  total_awarded: number;
  total_reversed: number;
  reversal_count: number;
  recent_adjustments: number;
  recent_days: number;
}

export interface StudentCandidate {
  id: string;
  full_name: string;
  email: string;
  usn: string;
  registration_status: string;
}

export interface StudentMembership {
  hackathon_id: string;
  hackathon_title: string;
  team_id: string;
  team_name: string;
  role: 'leader' | 'member';
}

export interface StudentPointsContext {
  student: StudentCandidate;
  total_points: number;
  memberships: StudentMembership[];
}

export interface PointsActivityRow {
  id: string;
  created_at: string;
  student_name: string;
  student_email: string;
  hackathon_title: string;
  team_name: string;
  points: number;
  milestone_type: string;
  reason: string;
  awarded_by_email: string;
}

export interface PointsActivityPage {
  rows: PointsActivityRow[];
  total: number;
  page: number;
  page_size: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep only characters that are safe inside a PostgREST ilike/or filter. */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9 @.+_-]/g, '').replace(/[%_]/g, '').trim().slice(0, 100);
}

/**
 * Summary-card aggregates, computed from the ledger with these definitions:
 *  - students_with_points: distinct students whose NET ledger total is > 0
 *  - total_awarded: sum of positive, non-reversal entries
 *  - total_reversed: sum of 'reversal' entries (stored negative); reversal_count = their number
 *  - recent_adjustments: 'manual_adjustment' entries in the last RECENT_DAYS days
 * Rows are paged client-side-of-PostgREST because aggregates are not enabled.
 */
export async function getPointsOverviewAction(): Promise<{
  success: boolean;
  overview?: PointsOverview;
  error?: string;
}> {
  try {
    await requireAdmin('manage_points');
    const supabase = await createClient();
    const adminClient = createAdminClient();

    const { count: approvedCount, error: approvedErr } = await adminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('registration_status', 'approved');
    if (approvedErr) return { success: false, error: approvedErr.message };

    const netByStudent = new Map<string, number>();
    let totalAwarded = 0;
    let totalReversed = 0;
    let reversalCount = 0;
    let recentAdjustments = 0;
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;

    for (let page = 0; page < LEDGER_MAX_PAGES; page++) {
      const from = page * LEDGER_PAGE_SIZE;
      const { data, error } = await supabase
        .from('points_ledger')
        .select('student_id, milestone_type, points, created_at')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + LEDGER_PAGE_SIZE - 1);
      if (error) return { success: false, error: error.message };

      for (const row of data || []) {
        netByStudent.set(row.student_id, (netByStudent.get(row.student_id) || 0) + row.points);
        if (row.milestone_type === 'reversal') {
          totalReversed += row.points;
          reversalCount += 1;
        } else if (row.points > 0) {
          totalAwarded += row.points;
        }
        if (row.milestone_type === 'manual_adjustment' && new Date(row.created_at).getTime() >= cutoff) {
          recentAdjustments += 1;
        }
      }
      if (!data || data.length < LEDGER_PAGE_SIZE) break;
    }

    let studentsWithPoints = 0;
    for (const net of netByStudent.values()) {
      if (net > 0) studentsWithPoints += 1;
    }

    return {
      success: true,
      overview: {
        approved_students: approvedCount || 0,
        students_with_points: studentsWithPoints,
        total_awarded: totalAwarded,
        total_reversed: totalReversed,
        reversal_count: reversalCount,
        recent_adjustments: recentAdjustments,
        recent_days: RECENT_DAYS,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load points overview.';
    if (message.includes('NEXT_REDIRECT')) throw err;
    return { success: false, error: message };
  }
}

/** Email search (contains, case-insensitive). Returns up to 6 candidates; the UI disambiguates. */
export async function searchStudentsByEmailAction(query: string): Promise<{
  success: boolean;
  candidates?: StudentCandidate[];
  error?: string;
}> {
  try {
    await requireAdmin('manage_points');
    const term = sanitizeSearchTerm(query || '');
    if (term.length < 3) {
      return { success: false, error: 'Enter at least 3 characters of the student email.' };
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('profiles')
      .select('id, full_name, email, usn, registration_status')
      .ilike('email', `%${term}%`)
      .order('email', { ascending: true })
      .limit(6);
    if (error) return { success: false, error: error.message };

    const exact = (data || []).filter((p) => p.email.toLowerCase() === term.toLowerCase());
    return { success: true, candidates: exact.length === 1 ? exact : data || [] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Student search failed.';
    if (message.includes('NEXT_REDIRECT')) throw err;
    return { success: false, error: message };
  }
}

/** Selected-student panel + team options: identity, net points, and team memberships. */
export async function getStudentPointsContextAction(studentId: string): Promise<{
  success: boolean;
  context?: StudentPointsContext;
  error?: string;
}> {
  try {
    await requireAdmin('manage_points');
    if (!UUID_RE.test(studentId || '')) {
      return { success: false, error: 'Invalid student selection.' };
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();

    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, full_name, email, usn, registration_status')
      .eq('id', studentId)
      .maybeSingle();
    if (profileErr) return { success: false, error: profileErr.message };
    if (!profile) return { success: false, error: 'Student not found.' };

    const { data: ledger, error: ledgerErr } = await supabase
      .from('points_ledger')
      .select('points')
      .eq('student_id', studentId);
    if (ledgerErr) return { success: false, error: ledgerErr.message };
    const totalPoints = (ledger || []).reduce((sum, r) => sum + r.points, 0);

    const { data: members, error: memberErr } = await supabase
      .from('team_members')
      .select('team_id, hackathon_id, role')
      .eq('student_id', studentId);
    if (memberErr) return { success: false, error: memberErr.message };

    const teamIds = Array.from(new Set((members || []).map((m) => m.team_id)));
    const hackathonIds = Array.from(new Set((members || []).map((m) => m.hackathon_id)));
    const [teamsRes, hackathonsRes] = await Promise.all([
      teamIds.length
        ? supabase.from('teams').select('id, name').in('id', teamIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      hackathonIds.length
        ? supabase.from('hackathons').select('id, title').in('id', hackathonIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[], error: null }),
    ]);
    const teamName = new Map((teamsRes.data || []).map((t) => [t.id, t.name]));
    const hackathonTitle = new Map((hackathonsRes.data || []).map((h) => [h.id, h.title]));

    const memberships: StudentMembership[] = (members || []).map((m) => ({
      hackathon_id: m.hackathon_id,
      hackathon_title: hackathonTitle.get(m.hackathon_id) || 'Unknown hackathon',
      team_id: m.team_id,
      team_name: teamName.get(m.team_id) || 'Unknown team',
      role: m.role === 'leader' ? 'leader' : 'member',
    }));

    return {
      success: true,
      context: { student: profile as StudentCandidate, total_points: totalPoints, memberships },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load student points context.';
    if (message.includes('NEXT_REDIRECT')) throw err;
    return { success: false, error: message };
  }
}

const ACTION_FILTERS = ['all', 'manual_adjustment', 'reversal', 'participation', 'round_qualification', 'win_placement'] as const;

/** Recent Points Activity table: newest first, searchable, filterable, paginated. */
export async function getPointsActivityAction(params: {
  search?: string;
  action?: string;
  days?: number | null;
  page?: number;
  pageSize?: number;
}): Promise<{ success: boolean; activity?: PointsActivityPage; error?: string }> {
  try {
    await requireAdmin('manage_points');
    const supabase = await createClient();
    const adminClient = createAdminClient();

    const pageSize = Math.min(Math.max(Math.trunc(params.pageSize || 10), 1), 50);
    const page = Math.max(Math.trunc(params.page || 1), 1);
    const action = ACTION_FILTERS.includes(params.action as (typeof ACTION_FILTERS)[number])
      ? (params.action as string)
      : 'all';
    const emptyPage: PointsActivityPage = { rows: [], total: 0, page, page_size: pageSize };

    let query = supabase
      .from('points_ledger')
      .select(
        'id, created_at, student_id, hackathon_id, team_id, points, milestone_type, reason, awarded_by',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (action !== 'all') query = query.eq('milestone_type', action);
    if (params.days && params.days > 0) {
      query = query.gte('created_at', new Date(Date.now() - params.days * 24 * 60 * 60 * 1000).toISOString());
    }

    const term = sanitizeSearchTerm(params.search || '');
    if (term) {
      const [studentsRes, hackathonsRes] = await Promise.all([
        adminClient.from('profiles').select('id').or(`email.ilike.%${term}%,full_name.ilike.%${term}%`).limit(200),
        supabase.from('hackathons').select('id').ilike('title', `%${term}%`).limit(200),
      ]);
      const studentIds = (studentsRes.data || []).map((s) => s.id);
      const hackathonIds = (hackathonsRes.data || []).map((h) => h.id);
      const clauses: string[] = [];
      if (studentIds.length) clauses.push(`student_id.in.(${studentIds.join(',')})`);
      if (hackathonIds.length) clauses.push(`hackathon_id.in.(${hackathonIds.join(',')})`);
      if (clauses.length === 0) {
        return { success: true, activity: emptyPage };
      }
      query = query.or(clauses.join(','));
    }

    const from = (page - 1) * pageSize;
    const { data: ledger, count, error } = await query.range(from, from + pageSize - 1);
    if (error) return { success: false, error: error.message };
    if (!ledger || ledger.length === 0) {
      return { success: true, activity: { ...emptyPage, total: count || 0 } };
    }

    const studentIds = Array.from(new Set(ledger.map((r) => r.student_id)));
    const hackathonIds = Array.from(new Set(ledger.map((r) => r.hackathon_id)));
    const teamIds = Array.from(new Set(ledger.map((r) => r.team_id)));
    const adminIds = Array.from(new Set(ledger.map((r) => r.awarded_by)));

    const [studentsRes, hackathonsRes, teamsRes, adminsRes] = await Promise.all([
      adminClient.from('profiles').select('id, full_name, email').in('id', studentIds),
      supabase.from('hackathons').select('id, title').in('id', hackathonIds),
      supabase.from('teams').select('id, name').in('id', teamIds),
      adminClient.from('admin_profiles').select('id, email').in('id', adminIds),
    ]);
    const students = new Map((studentsRes.data || []).map((s) => [s.id, s]));
    const hackathons = new Map((hackathonsRes.data || []).map((h) => [h.id, h.title]));
    const teams = new Map((teamsRes.data || []).map((t) => [t.id, t.name]));
    const admins = new Map((adminsRes.data || []).map((a) => [a.id, a.email]));

    const rows: PointsActivityRow[] = ledger.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      student_name: students.get(r.student_id)?.full_name || 'Unknown student',
      student_email: students.get(r.student_id)?.email || '',
      hackathon_title: hackathons.get(r.hackathon_id) || '—',
      team_name: teams.get(r.team_id) || '—',
      points: r.points,
      milestone_type: r.milestone_type,
      reason: r.reason,
      awarded_by_email: admins.get(r.awarded_by) || '—',
    }));

    return { success: true, activity: { rows, total: count || 0, page, page_size: pageSize } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load points activity.';
    if (message.includes('NEXT_REDIRECT')) throw err;
    return { success: false, error: message };
  }
}
