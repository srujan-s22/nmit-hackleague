import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type {
  LeaderboardEntry,
  StudentPointsSummary,
  PointConfiguration,
  LeaderboardFilters,
} from '@/types/points';
import { leaderboardFilterSchema } from '@/lib/validation/points-schemas';

/**
 * Fetches the platform-wide leaderboard with optional student study year and event period filters.
 * Dense-ranked, sanitized non-PII, and Cartesian-safe.
 */
export async function getPlatformLeaderboard(
  filters: LeaderboardFilters = {}
): Promise<{ data: LeaderboardEntry[]; error?: string }> {
  try {
    const validated = leaderboardFilterSchema.safeParse(filters);
    if (!validated.success) {
      return { data: [], error: validated.error.issues[0]?.message || 'Invalid filters' };
    }

    const { academicYear, eventAcademicYear, eventTerm, limit, offset } = validated.data;
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('get_platform_leaderboard', {
      p_academic_year: academicYear ?? undefined,
      p_event_academic_year: eventAcademicYear && eventAcademicYear.trim() !== '' ? eventAcademicYear.trim() : undefined,
      p_event_term: eventTerm ?? undefined,
      p_limit: limit ?? 50,
      p_offset: offset ?? 0,
    });

    if (error) {
      return { data: [], error: error.message };
    }

    return {
      data: (data || []).map((row: any) => ({
        student_id: row.student_id,
        full_name: row.full_name,
        branch: row.branch,
        academic_year: row.academic_year,
        total_points: Number(row.total_points || 0),
        verified_qualifications_count: Number(row.verified_qualifications_count || 0),
        rank: Number(row.rank || 0),
      })),
    };
  } catch (err: unknown) {
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Failed to fetch leaderboard.',
    };
  }
}

/**
 * Fetches the points summary, rank, milestone metrics, and transaction ledger history
 * for an authorized student (self or admin).
 */
export async function getStudentPointsSummary(
  studentId: string
): Promise<{ data: StudentPointsSummary | null; error?: string }> {
  try {
    if (!studentId || typeof studentId !== 'string') {
      return { data: null, error: 'Student ID is required.' };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_student_points_summary', {
      p_student_id: studentId,
    });

    if (error) {
      return { data: null, error: error.message };
    }

    if (!data) {
      return { data: null, error: 'Points summary not found.' };
    }

    const summary = data as any;
    return {
      data: {
        student_id: summary.student_id,
        total_points: Number(summary.total_points || 0),
        rank: summary.rank !== null ? Number(summary.rank) : null,
        verified_qualifications_count: Number(summary.verified_qualifications_count || 0),
        submitted_claims_count: Number(summary.submitted_claims_count || 0),
        ledger_history: (summary.ledger_history || []).map((item: any) => ({
          id: item.id,
          milestone_type: item.milestone_type,
          points: Number(item.points),
          reason: item.reason,
          created_at: item.created_at,
          hackathon_id: item.hackathon_id,
          hackathon_title: item.hackathon_title || null,
          reversal_of_id: item.reversal_of_id || null,
          adjusted_entry_id: item.adjusted_entry_id || null,
        })),
      },
    };
  } catch (err: unknown) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Failed to fetch student points summary.',
    };
  }
}

/**
 * Fetches all milestone point configurations from public.point_configurations.
 * Winner bonus rows are explicitly marked as inactive/blocked.
 */
export async function getPointConfigurations(): Promise<{
  data: PointConfiguration[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('point_configurations')
      .select('id, milestone_type, regular_member_points, team_leader_points, is_active, updated_by, updated_at')
      .order('milestone_type');

    if (error) {
      return { data: [], error: error.message };
    }

    return {
      data: (data || []).map((row) => ({
        id: row.id,
        milestone_type: row.milestone_type,
        regular_member_points: row.regular_member_points,
        team_leader_points: row.team_leader_points,
        is_active: Boolean(row.is_active),
        updated_by: row.updated_by,
        updated_at: row.updated_at,
      })),
    };
  } catch (err: unknown) {
    return {
      data: [],
      error: err instanceof Error ? err.message : 'Failed to fetch point configurations.',
    };
  }
}

/**
 * Returns distinct institutional academic years configured on published/completed hackathons.
 */
export async function getAvailableEventAcademicYears(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('hackathons')
      .select('academic_year')
      .neq('academic_year', 'unassigned');

    if (error || !data) {
      return [];
    }

    const uniqueYears = Array.from(new Set(data.map((h) => h.academic_year))).filter(Boolean);
    return uniqueYears.sort().reverse();
  } catch {
    return [];
  }
}
