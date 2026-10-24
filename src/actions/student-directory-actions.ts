'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { getSignedPreviewUrlWithClient } from '@/lib/storage/paths';
import { getStudentPointsSummary } from '@/lib/points/leaderboard-queries';
import { BRANCHES } from '@/lib/validation/auth-schemas';
import { z } from 'zod';

export interface StudentDirectoryItem {
  id: string;
  full_name: string;
  usn: string;
  branch: string;
  academic_year: number;
  avatar_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  total_points: number;
}

export interface StudentDirectoryParams {
  search?: string;
  branch?: string;
  academic_year?: number;
  page?: number;
  pageSize?: number;
  sortBy?: 'full_name' | 'usn' | 'branch' | 'academic_year' | 'created_at';
  sortDirection?: 'asc' | 'desc';
}

export interface StudentDirectoryResult {
  success: boolean;
  students: StudentDirectoryItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

export interface StudentDetailCompetition {
  team_id: string;
  team_name: string;
  hackathon_id: string;
  hackathon_title: string;
  hackathon_slug: string;
  hackathon_status: string;
  role: 'leader' | 'member';
  team_status: string;
}

export interface StudentDetailView {
  id: string;
  full_name: string;
  usn: string;
  email: string;
  phone: string;
  branch: string;
  academic_year: number;
  sex: string | null;
  registration_status: string;
  avatar_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  total_points: number;
  rank: number | null;
  created_at: string;
  competitions: StudentDetailCompetition[];
}

export interface StudentDetailResult {
  success: boolean;
  data?: StudentDetailView;
  error?: string;
}

const ALLOWED_SORT_COLUMNS = [
  'full_name',
  'usn',
  'branch',
  'academic_year',
  'created_at',
] as const;

/**
 * Fetches paginated, filtered list of approved students for the Student Directory.
 * Strictly enforces 'view_student_data' permission or Super Admin authority.
 * Excludes phone numbers, date of birth, and storage paths from returned payload.
 */
export async function getStudentDirectoryAction(
  rawParams: StudentDirectoryParams = {}
): Promise<StudentDirectoryResult> {
  try {
    // 1. Authenticate caller and check required permission
    const { admin, permissions } = await requireAdmin();
    const isAuthorized =
      admin.is_super_admin || permissions.includes('view_student_data');

    if (!isAuthorized) {
      return {
        success: false,
        students: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        error: 'Access denied: requires view_student_data permission or Super Admin status.',
      };
    }

    // 2. Validate and bound pagination and sorting parameters
    const page = Math.max(Number(rawParams.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(rawParams.pageSize) || 20, 1), 50);
    const offset = (page - 1) * pageSize;

    const sortBy = ALLOWED_SORT_COLUMNS.includes(rawParams.sortBy as (typeof ALLOWED_SORT_COLUMNS)[number])
      ? (rawParams.sortBy as (typeof ALLOWED_SORT_COLUMNS)[number])
      : 'full_name';
    const sortAscending = rawParams.sortDirection !== 'desc';

    // 3. Construct explicit, non-PII query projection using adminClient
    const adminClient = createAdminClient();

    let query = adminClient
      .from('profiles')
      .select(
        'id, full_name, usn, branch, academic_year, profile_photo_path, linkedin_url, github_url, created_at',
        { count: 'exact' }
      )
      .eq('registration_status', 'approved');

    // 4. Sanitize and apply search criteria
    if (rawParams.search && typeof rawParams.search === 'string') {
      const sanitized = rawParams.search.replace(/[^a-zA-Z0-9\s_-]/g, '').trim();
      if (sanitized.length > 0) {
        query = query.or(`full_name.ilike.%${sanitized}%,usn.ilike.%${sanitized}%`);
      }
    }

    // 5. Apply branch filter if valid
    if (
      rawParams.branch &&
      typeof rawParams.branch === 'string' &&
      BRANCHES.includes(rawParams.branch as (typeof BRANCHES)[number])
    ) {
      query = query.eq('branch', rawParams.branch);
    }

    // 6. Apply academic year filter if valid (1-4)
    if (
      rawParams.academic_year !== undefined &&
      Number.isInteger(Number(rawParams.academic_year)) &&
      Number(rawParams.academic_year) >= 1 &&
      Number(rawParams.academic_year) <= 4
    ) {
      query = query.eq('academic_year', Number(rawParams.academic_year));
    }

    // 7. Apply ordering and range bounds
    query = query
      .order(sortBy, { ascending: sortAscending })
      .range(offset, offset + pageSize - 1);

    const { data: rows, count, error: queryErr } = await query;

    if (queryErr) {
      return {
        success: false,
        students: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        error: `Database query failed: ${queryErr.message}`,
      };
    }

    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / pageSize);

    if (!rows || rows.length === 0) {
      return {
        success: true,
        students: [],
        totalCount,
        page,
        pageSize,
        totalPages,
      };
    }

    // 8. Batch query points for returned students from points_ledger
    const studentIds = rows.map((r) => r.id);
    const { data: ledgerEntries } = await adminClient
      .from('points_ledger')
      .select('student_id, points')
      .in('student_id', studentIds);

    const pointsMap: Record<string, number> = {};
    if (ledgerEntries) {
      for (const entry of ledgerEntries) {
        pointsMap[entry.student_id] = (pointsMap[entry.student_id] || 0) + Number(entry.points || 0);
      }
    }

    // 9. Generate secure, short-lived avatar preview URLs and sanitize output
    const students: StudentDirectoryItem[] = await Promise.all(
      rows.map(async (row) => {
        let avatarUrl: string | null = null;
        if (row.profile_photo_path) {
          try {
            const previewRes = await getSignedPreviewUrlWithClient(
              adminClient,
              'profile-photos',
              row.profile_photo_path,
              900
            );
            if (previewRes.success && previewRes.url) {
              avatarUrl = previewRes.url;
            }
          } catch {
            avatarUrl = null;
          }
        }

        return {
          id: row.id,
          full_name: row.full_name,
          usn: row.usn,
          branch: row.branch,
          academic_year: row.academic_year,
          avatar_url: avatarUrl,
          linkedin_url: row.linkedin_url ?? null,
          github_url: row.github_url ?? null,
          total_points: pointsMap[row.id] || 0,
        };
      })
    );

    return {
      success: true,
      students,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  } catch (err: unknown) {
    return {
      success: false,
      students: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      error: err instanceof Error ? err.message : 'Internal error loading directory.',
    };
  }
}

/**
 * Fetches authorized, comprehensive student detail view including verified contact details.
 * Strictly enforces 'view_student_data' permission or Super Admin authority.
 * Phone number is exclusively exposed in this view and never in directory listings.
 */
export async function getStudentDetailAction(
  rawStudentId: string
): Promise<StudentDetailResult> {
  try {
    // 1. Authenticate caller and check required permission
    const { admin, permissions } = await requireAdmin();
    const isAuthorized =
      admin.is_super_admin || permissions.includes('view_student_data');

    if (!isAuthorized) {
      return {
        success: false,
        error: 'Access denied: requires view_student_data permission or Super Admin status.',
      };
    }

    // 2. Validate student UUID format
    const uuidParse = z.string().uuid().safeParse(rawStudentId);
    if (!uuidParse.success) {
      return {
        success: false,
        error: 'Invalid student ID format.',
      };
    }
    const studentId = uuidParse.data;

    // 3. Fetch approved student record with explicit column allowlist
    const adminClient = createAdminClient();

    const { data: student, error: studentErr } = await adminClient
      .from('profiles')
      .select(
        'id, full_name, usn, email, phone, branch, academic_year, sex, registration_status, profile_photo_path, linkedin_url, github_url, created_at'
      )
      .eq('id', studentId)
      .eq('registration_status', 'approved')
      .single();

    if (studentErr || !student) {
      return {
        success: false,
        error: 'Approved student profile not found.',
      };
    }

    // 4. Generate avatar preview if profile photo exists
    let avatarUrl: string | null = null;
    if (student.profile_photo_path) {
      try {
        const previewRes = await getSignedPreviewUrlWithClient(
          adminClient,
          'profile-photos',
          student.profile_photo_path,
          900
        );
        if (previewRes.success && previewRes.url) {
          avatarUrl = previewRes.url;
        }
      } catch {
        avatarUrl = null;
      }
    }

    // 5. Fetch points summary & platform rank in parallel
    const [pointsSummaryRes, membershipsRes] = await Promise.all([
      getStudentPointsSummary(studentId),
      adminClient
        .from('team_members')
        .select('team_id, hackathon_id, role')
        .eq('student_id', studentId),
    ]);

    const pointsSummary = pointsSummaryRes.data;
    const memberships = membershipsRes.data || [];

    // 6. Fetch competition context if team memberships exist
    let competitions: StudentDetailCompetition[] = [];
    if (memberships.length > 0) {
      const teamIds = Array.from(new Set(memberships.map((m) => m.team_id)));
      const hackathonIds = Array.from(new Set(memberships.map((m) => m.hackathon_id)));

      const [{ data: teamsData }, { data: hackathonsData }] = await Promise.all([
        adminClient
          .from('teams')
          .select('id, name, internal_status, external_status')
          .in('id', teamIds),
        adminClient
          .from('hackathons')
          .select('id, title, slug, status')
          .in('id', hackathonIds),
      ]);

      const teamsMap = new Map((teamsData || []).map((t) => [t.id, t]));
      const hackathonsMap = new Map((hackathonsData || []).map((h) => [h.id, h]));

      competitions = memberships.map((m) => {
        const team = teamsMap.get(m.team_id);
        const hackathon = hackathonsMap.get(m.hackathon_id);

        return {
          team_id: m.team_id,
          team_name: team?.name || 'Assigned Team',
          hackathon_id: m.hackathon_id,
          hackathon_title: hackathon?.title || 'Unknown Hackathon',
          hackathon_slug: hackathon?.slug || '',
          hackathon_status: hackathon?.status || 'unknown',
          role: m.role as 'leader' | 'member',
          team_status: team?.external_status || team?.internal_status || 'active',
        };
      });
    }

    return {
      success: true,
      data: {
        id: student.id,
        full_name: student.full_name,
        usn: student.usn,
        email: student.email,
        phone: student.phone, // Safely exposed only in this authorized detail query
        branch: student.branch,
        academic_year: student.academic_year,
        sex: student.sex,
        registration_status: student.registration_status,
        avatar_url: avatarUrl,
        linkedin_url: student.linkedin_url ?? null,
        github_url: student.github_url ?? null,
        total_points: pointsSummary?.total_points || 0,
        rank: pointsSummary?.rank || null,
        created_at: student.created_at,
        competitions,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Internal error loading student details.',
    };
  }
}
