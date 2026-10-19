'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import {
  generateCsvString,
  generateCsvZipPackage,
  generateExcelWorkbook,
  DatasetExportConfig,
} from '@/lib/reports/export-generators';

export interface ExportReportParams {
  dataset:
    | 'all'
    | 'students'
    | 'hackathons'
    | 'teams'
    | 'team_members'
    | 'registrations'
    | 'round_results'
    | 'points'
    | 'winners'
    | 'hackathon_summary'
    | 'submissions'
    | 'reviews'
    | 'results'
    | 'points_ledger'
    | 'audit_logs'
    | 'storage_objects';
  format: 'csv' | 'xlsx' | 'zip';
  hackathonId?: string | null;
}

export interface ExportReportResult {
  success: boolean;
  base64?: string;
  filename?: string;
  mimeType?: string;
  error?: string;
}

/**
 * Returns list of hackathons accessible to the calling administrator for reporting.
 */
export async function getAccessibleHackathonsForReportsAction(): Promise<{
  success: boolean;
  hackathons: { id: string; title: string }[];
  isSuperAdmin: boolean;
  error?: string;
}> {
  try {
    const { admin } = await requireAdmin('export_data');
    const supabase = await createClient();

    let query = supabase.from('hackathons').select('id, title').order('created_at', { ascending: false });

    if (!admin.is_super_admin) {
      query = query.eq('in_charge_admin_id', admin.id);
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, hackathons: [], isSuperAdmin: admin.is_super_admin, error: error.message };
    }

    return {
      success: true,
      hackathons: data || [],
      isSuperAdmin: admin.is_super_admin,
    };
  } catch (err: unknown) {
    return {
      success: false,
      hackathons: [],
      isSuperAdmin: false,
      error: err instanceof Error ? err.message : 'Failed to retrieve accessible hackathons.',
    };
  }
}

/**
 * Executes a scoped data export with authoritative formula injection protection,
 * multi-format generation (CSV, ZIP, XLSX), and audit logging.
 */
export async function exportReportAction(params: ExportReportParams): Promise<ExportReportResult> {
  try {
    const { admin } = await requireAdmin('export_data');
    const supabase = await createClient();

    const hackathonId = params.hackathonId || null;

    // Enforce hackathon scoping for non-super admins
    if (!admin.is_super_admin && !hackathonId) {
      return {
        success: false,
        error: 'Hackathon selection is required. Scoped administrators may only export data for assigned hackathons.',
      };
    }

    // Call audit_data_export RPC to verify authorization and log activity
    const { error: auditError } = await supabase.rpc('audit_data_export', {
      p_dataset: params.dataset,
      p_format: params.format,
      ...(hackathonId ? { p_hackathon_id: hackathonId } : {}),
      p_filters: {},
    });

    if (auditError) {
      return {
        success: false,
        error: `Export denied: ${auditError.message}`,
      };
    }

    // Fetch datasets based on requested dataset and scoping
    const datasets: DatasetExportConfig[] = [];

    // 1. Students Dataset
    if (params.dataset === 'all' || params.dataset === 'students') {
      const { data: students } = await supabase
        .from('profiles')
        .select('id, full_name, usn, email, branch, academic_year, phone, sex, registration_status, created_at')
        .order('created_at', { ascending: false });

      datasets.push({
        id: 'students',
        title: 'Students',
        headers: [
          { key: 'id', label: 'Student ID' },
          { key: 'full_name', label: 'Full Name' },
          { key: 'usn', label: 'USN' },
          { key: 'email', label: 'Institutional Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'branch', label: 'Branch' },
          { key: 'academic_year', label: 'Academic Year' },
          { key: 'sex', label: 'Gender' },
          { key: 'registration_status', label: 'Status' },
          { key: 'created_at', label: 'Registered At' },
        ],
        rows: ((students || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 2. Hackathons Dataset
    if (params.dataset === 'all' || params.dataset === 'hackathons') {
      let query = supabase
        .from('hackathons')
        .select('id, title, slug, mode, organizer, status, min_team_size, max_team_size, is_solo_allowed, registration_start_at, registration_end_at, event_start_at, event_end_at, created_at');

      if (hackathonId) {
        query = query.eq('id', hackathonId);
      }

      const { data: hackathons } = await query.order('created_at', { ascending: false });

      datasets.push({
        id: 'hackathons',
        title: 'Hackathons',
        headers: [
          { key: 'id', label: 'Hackathon ID' },
          { key: 'title', label: 'Title' },
          { key: 'slug', label: 'Slug' },
          { key: 'mode', label: 'Mode' },
          { key: 'organizer', label: 'Organizer' },
          { key: 'status', label: 'Status' },
          { key: 'min_team_size', label: 'Min Team Size' },
          { key: 'max_team_size', label: 'Max Team Size' },
          { key: 'is_solo_allowed', label: 'Solo Allowed' },
          { key: 'registration_start_at', label: 'Registration Opens' },
          { key: 'registration_end_at', label: 'Registration Closes' },
          { key: 'event_start_at', label: 'Event Starts' },
          { key: 'event_end_at', label: 'Event Ends' },
          { key: 'created_at', label: 'Created At' },
        ],
        rows: ((hackathons || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 3. Teams Dataset
    if (params.dataset === 'all' || params.dataset === 'teams') {
      let query = supabase
        .from('teams')
        .select('id, hackathon_id, name, leader_id, internal_status, external_status, invitation_code, created_at');

      if (hackathonId) {
        query = query.eq('hackathon_id', hackathonId);
      }

      const { data: teams } = await query.order('created_at', { ascending: false });

      datasets.push({
        id: 'teams',
        title: 'Teams',
        headers: [
          { key: 'id', label: 'Team ID' },
          { key: 'hackathon_id', label: 'Hackathon ID' },
          { key: 'name', label: 'Team Name' },
          { key: 'leader_id', label: 'Leader ID' },
          { key: 'internal_status', label: 'Internal Status' },
          { key: 'external_status', label: 'External Status' },
          { key: 'invitation_code', label: 'Invitation Code' },
          { key: 'created_at', label: 'Created At' },
        ],
        rows: ((teams || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 4. Team Members Dataset
    if (params.dataset === 'all' || params.dataset === 'team_members') {
      let query = supabase
        .from('team_members')
        .select('id, team_id, student_id, hackathon_id, role, joined_at');

      if (hackathonId) {
        query = query.eq('hackathon_id', hackathonId);
      }

      const { data: members } = await query.order('joined_at', { ascending: false });

      datasets.push({
        id: 'team_members',
        title: 'Team Members',
        headers: [
          { key: 'id', label: 'Member ID' },
          { key: 'team_id', label: 'Team ID' },
          { key: 'student_id', label: 'Student ID' },
          { key: 'hackathon_id', label: 'Hackathon ID' },
          { key: 'role', label: 'Role' },
          { key: 'joined_at', label: 'Joined At' },
        ],
        rows: ((members || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 5. Registrations Dataset
    if (params.dataset === 'all' || params.dataset === 'registrations') {
      let query = supabase
        .from('teams')
        .select('id, hackathon_id, name, leader_id, external_status, external_proof_path, cdc_declaration_accepted, cdc_declaration_accepted_at, cdc_declaration_text_version, created_at');

      if (hackathonId) {
        query = query.eq('hackathon_id', hackathonId);
      }

      const { data: registrations } = await query.order('created_at', { ascending: false });

      datasets.push({
        id: 'registrations',
        title: 'Registrations',
        headers: [
          { key: 'id', label: 'Team ID' },
          { key: 'hackathon_id', label: 'Hackathon ID' },
          { key: 'name', label: 'Team Name' },
          { key: 'leader_id', label: 'Leader ID' },
          { key: 'external_status', label: 'Status' },
          { key: 'external_proof_path', label: 'Proof Storage Path' },
          { key: 'cdc_declaration_accepted', label: 'CDC Declaration Accepted' },
          { key: 'cdc_declaration_accepted_at', label: 'CDC Acceptance Time' },
          { key: 'cdc_declaration_text_version', label: 'CDC Version' },
          { key: 'created_at', label: 'Submitted At' },
        ],
        rows: ((registrations || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 6. Round Results Dataset
    if (params.dataset === 'all' || params.dataset === 'round_results' || params.dataset === 'results') {
      let query = supabase
        .from('results')
        .select('id, hackathon_id, round_id, team_id, milestone_type, placement, is_published, notes, verified_by, verified_at, created_at');

      if (hackathonId) {
        query = query.eq('hackathon_id', hackathonId);
      }

      const { data: results } = await query.order('created_at', { ascending: false });

      datasets.push({
        id: 'round_results',
        title: 'Round Results',
        headers: [
          { key: 'id', label: 'Result ID' },
          { key: 'hackathon_id', label: 'Hackathon ID' },
          { key: 'round_id', label: 'Round ID' },
          { key: 'team_id', label: 'Team ID' },
          { key: 'milestone_type', label: 'Milestone' },
          { key: 'placement', label: 'Placement' },
          { key: 'is_published', label: 'Published' },
          { key: 'notes', label: 'Notes' },
          { key: 'verified_by', label: 'Verified By' },
          { key: 'verified_at', label: 'Verified At' },
          { key: 'created_at', label: 'Created At' },
        ],
        rows: ((results || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 7. Points Dataset
    if (params.dataset === 'all' || params.dataset === 'points' || params.dataset === 'points_ledger') {
      let query = supabase
        .from('points_ledger')
        .select('id, student_id, hackathon_id, team_id, round_id, milestone_type, role_at_award, points, reason, awarded_by, created_at');

      if (hackathonId) {
        query = query.eq('hackathon_id', hackathonId);
      }

      const { data: ledger } = await query.order('created_at', { ascending: false });

      datasets.push({
        id: 'points',
        title: 'Points',
        headers: [
          { key: 'id', label: 'Transaction ID' },
          { key: 'student_id', label: 'Student ID' },
          { key: 'hackathon_id', label: 'Hackathon ID' },
          { key: 'team_id', label: 'Team ID' },
          { key: 'round_id', label: 'Round ID' },
          { key: 'milestone_type', label: 'Milestone' },
          { key: 'role_at_award', label: 'Role at Award' },
          { key: 'points', label: 'Points' },
          { key: 'reason', label: 'Reason' },
          { key: 'awarded_by', label: 'Awarded By' },
          { key: 'created_at', label: 'Awarded At' },
        ],
        rows: ((ledger || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 8. Winners Dataset
    if (params.dataset === 'all' || params.dataset === 'winners') {
      let query = supabase
        .from('results')
        .select('id, hackathon_id, round_id, team_id, placement, is_published, notes, verified_by, verified_at, created_at')
        .eq('milestone_type', 'win_placement');

      if (hackathonId) {
        query = query.eq('hackathon_id', hackathonId);
      }

      const { data: winners } = await query.order('placement', { ascending: true });

      datasets.push({
        id: 'winners',
        title: 'Winners',
        headers: [
          { key: 'id', label: 'Award ID' },
          { key: 'hackathon_id', label: 'Hackathon ID' },
          { key: 'round_id', label: 'Round ID' },
          { key: 'team_id', label: 'Team ID' },
          { key: 'placement', label: 'Placement Rank' },
          { key: 'is_published', label: 'Published' },
          { key: 'notes', label: 'Citation / Notes' },
          { key: 'verified_by', label: 'Verified By' },
          { key: 'verified_at', label: 'Verified At' },
          { key: 'created_at', label: 'Awarded At' },
        ],
        rows: ((winners || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 9. Hackathon Summary Dataset
    if (params.dataset === 'all' || params.dataset === 'hackathon_summary') {
      let hQuery = supabase.from('hackathons').select('id, title, status, organizer, event_start_at, event_end_at');
      if (hackathonId) {
        hQuery = hQuery.eq('id', hackathonId);
      }
      const { data: hList } = await hQuery;

      const summaryRows: Record<string, unknown>[] = [];
      for (const h of hList || []) {
        const { count: teamCount } = await supabase.from('teams').select('*', { count: 'exact', head: true }).eq('hackathon_id', h.id);
        const { count: memCount } = await supabase.from('team_members').select('*', { count: 'exact', head: true }).eq('hackathon_id', h.id);
        const { count: subCount } = await supabase.from('submissions').select('*', { count: 'exact', head: true }).eq('hackathon_id', h.id);
        const { count: winCount } = await supabase.from('results').select('*', { count: 'exact', head: true }).eq('hackathon_id', h.id).eq('milestone_type', 'win_placement');

        summaryRows.push({
          hackathon_id: h.id,
          title: h.title,
          status: h.status,
          organizer: h.organizer,
          total_teams: teamCount || 0,
          total_members: memCount || 0,
          total_submissions: subCount || 0,
          total_winners: winCount || 0,
          event_start: h.event_start_at,
          event_end: h.event_end_at,
        });
      }

      datasets.push({
        id: 'hackathon_summary',
        title: 'Hackathon Summary',
        headers: [
          { key: 'hackathon_id', label: 'Hackathon ID' },
          { key: 'title', label: 'Hackathon Title' },
          { key: 'status', label: 'Status' },
          { key: 'organizer', label: 'Organizer' },
          { key: 'total_teams', label: 'Total Teams' },
          { key: 'total_members', label: 'Total Participants' },
          { key: 'total_submissions', label: 'Total Submissions' },
          { key: 'total_winners', label: 'Total Winners' },
          { key: 'event_start', label: 'Event Start' },
          { key: 'event_end', label: 'Event End' },
        ],
        rows: summaryRows,
      });
    }

    // 10. Submissions Dataset (Supplementary)
    if (params.dataset === 'submissions') {
      let query = supabase
        .from('submissions')
        .select('id, hackathon_id, round_id, team_id, status, title, description, demo_url, repo_url, evidence_path, evidence_sha256, created_at, updated_at');

      if (hackathonId) {
        query = query.eq('hackathon_id', hackathonId);
      }

      const { data: submissions } = await query.order('created_at', { ascending: false });

      datasets.push({
        id: 'submissions',
        title: 'Submissions',
        headers: [
          { key: 'id', label: 'Submission ID' },
          { key: 'hackathon_id', label: 'Hackathon ID' },
          { key: 'round_id', label: 'Round ID' },
          { key: 'team_id', label: 'Team ID' },
          { key: 'status', label: 'Review Status' },
          { key: 'title', label: 'Title' },
          { key: 'description', label: 'Description' },
          { key: 'demo_url', label: 'Demo URL' },
          { key: 'repo_url', label: 'Repo URL' },
          { key: 'evidence_path', label: 'Evidence Path' },
          { key: 'evidence_sha256', label: 'SHA256 Hash' },
          { key: 'created_at', label: 'Submitted At' },
          { key: 'updated_at', label: 'Updated At' },
        ],
        rows: ((submissions || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 11. Reviews Dataset (Supplementary)
    if (params.dataset === 'reviews') {
      const { data: reviews } = await supabase
        .from('submission_reviews')
        .select('id, submission_id, reviewer_id, decision, score, feedback, reviewed_at')
        .order('reviewed_at', { ascending: false });

      datasets.push({
        id: 'reviews',
        title: 'Reviews',
        headers: [
          { key: 'id', label: 'Review ID' },
          { key: 'submission_id', label: 'Submission ID' },
          { key: 'reviewer_id', label: 'Reviewer Admin ID' },
          { key: 'decision', label: 'Decision' },
          { key: 'score', label: 'Score' },
          { key: 'feedback', label: 'Feedback' },
          { key: 'reviewed_at', label: 'Reviewed At' },
        ],
        rows: ((reviews || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 12. Audit Logs Dataset (Supplementary)
    if (params.dataset === 'audit_logs') {
      let query = supabase
        .from('audit_logs')
        .select('id, actor_id, actor_role, action, target_type, target_id, details, created_at');

      if (hackathonId) {
        query = query.eq('target_id', hackathonId);
      }

      const { data: auditLogs } = await query.order('created_at', { ascending: false }).limit(1000);

      datasets.push({
        id: 'audit_logs',
        title: 'Audit Logs',
        headers: [
          { key: 'id', label: 'Log ID' },
          { key: 'actor_id', label: 'Actor ID' },
          { key: 'actor_role', label: 'Role' },
          { key: 'action', label: 'Action' },
          { key: 'target_type', label: 'Target Type' },
          { key: 'target_id', label: 'Target ID' },
          { key: 'details', label: 'Details' },
          { key: 'created_at', label: 'Timestamp' },
        ],
        rows: ((auditLogs || []) as unknown) as Record<string, unknown>[],
      });
    }

    // 13. Storage Retention & Deletion Queue Dataset (Supplementary)
    if (params.dataset === 'storage_objects') {
      const { data: storageJobs } = await supabase
        .from('storage_deletion_queue')
        .select('id, bucket_id, object_path, target_type, target_id, event_id, status, retention_deadline_at, created_at, completed_at')
        .order('created_at', { ascending: false });

      datasets.push({
        id: 'storage_objects',
        title: 'Storage & Retention Queue',
        headers: [
          { key: 'id', label: 'Job ID' },
          { key: 'bucket_id', label: 'Bucket' },
          { key: 'object_path', label: 'Path' },
          { key: 'target_type', label: 'Target Type' },
          { key: 'target_id', label: 'Target ID' },
          { key: 'event_id', label: 'Event ID' },
          { key: 'status', label: 'Status' },
          { key: 'retention_deadline_at', label: 'Retention Deadline' },
          { key: 'created_at', label: 'Queued At' },
          { key: 'completed_at', label: 'Processed At' },
        ],
        rows: ((storageJobs || []) as unknown) as Record<string, unknown>[],
      });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (params.format === 'zip') {
      const zipBuffer = await generateCsvZipPackage(datasets);
      const filename = `hackleague_report_${params.dataset}_${timestamp}.zip`;
      return {
        success: true,
        base64: zipBuffer.toString('base64'),
        filename,
        mimeType: 'application/zip',
      };
    }

    if (params.format === 'xlsx') {
      const excelBuffer = await generateExcelWorkbook(datasets, 'NMIT HackLeague Report');
      const filename = `hackleague_report_${params.dataset}_${timestamp}.xlsx`;
      return {
        success: true,
        base64: excelBuffer.toString('base64'),
        filename,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    // Format is CSV: if dataset is 'all', export first or combine; otherwise export selected dataset
    const targetDataset = datasets[0];
    if (!targetDataset) {
      return {
        success: false,
        error: 'No data records found for the requested export criteria.',
      };
    }

    const csvContent = generateCsvString(targetDataset.headers, targetDataset.rows);
    const filename = `hackleague_${targetDataset.id}_${timestamp}.csv`;
    return {
      success: true,
      base64: Buffer.from(csvContent, 'utf-8').toString('base64'),
      filename,
      mimeType: 'text/csv; charset=utf-8',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred during data export.',
    };
  }
}
