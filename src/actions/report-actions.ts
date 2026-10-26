'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { ALL_DATASET_IDS, datasetAllowed } from '@/lib/reports/dataset-catalog';
import {
  ExportError,
  fetchDatasetCounts,
  fetchExportCapabilities,
  type ExportRpcClient,
} from '@/lib/reports/export-service';

export interface ExportPreviewResult {
  success: boolean;
  /** Exact row counts at the time of the request (not a live total). */
  counts?: Record<string, number>;
  error?: string;
}

/**
 * Exact per-dataset row counts for a scope, for the export summary. Authorization is
 * decided by the database (get_export_dataset_counts); datasets the caller may not
 * export are rejected, not silently skipped.
 *
 * The actual export is generated and delivered by POST /api/admin/reports/export.
 */
export async function getExportPreviewAction(params: {
  hackathonId: string | null;
  datasets: string[];
}): Promise<ExportPreviewResult> {
  try {
    await requireAdmin('export_data');
    const supabase = (await createClient()) as unknown as ExportRpcClient;

    const known = new Set<string>(ALL_DATASET_IDS);
    const datasets = Array.from(new Set(params.datasets));
    if (datasets.length === 0 || datasets.some((id) => !known.has(id))) {
      return { success: false, error: 'Invalid dataset selection.' };
    }
    if (params.hackathonId !== null && !/^[0-9a-f-]{36}$/i.test(params.hackathonId)) {
      return { success: false, error: 'Invalid hackathon selection.' };
    }

    const caps = await fetchExportCapabilities(supabase);
    const denied = datasets.find((id) => !datasetAllowed(id, caps));
    if (denied) {
      return { success: false, error: `You do not have permission to export ${denied}.` };
    }

    const counts = await fetchDatasetCounts(supabase, params.hackathonId, datasets);
    return { success: true, counts };
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err;
    return {
      success: false,
      error: err instanceof ExportError ? err.message : 'Failed to load export preview.',
    };
  }
}

export interface AdminDashboardMetrics {
  scope: {
    is_global: boolean;
    events_count: number;
    hackathon_id: string | null;
  };
  students: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  hackathons: {
    total: number;
    published: number;
    draft: number;
    archived: number;
  };
  teams: {
    total: number;
    internal_registered: number;
    submitted_claims: number;
    rejected_external: number;
  };
  submissions: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
  };
  results: {
    winners_count: number;
    verified_outcomes: number;
  };
  points: {
    total_distributed: number;
    transactions_count: number;
  };
  profile_changes: {
    pending: number;
    approved: number;
    rejected: number;
  };
  generated_at?: string;
}

/**
 * Retrieves aggregate platform or event-scoped administrative metrics.
 */
export async function getAdminDashboardMetricsAction(hackathonId?: string | null): Promise<{
  success: boolean;
  metrics?: AdminDashboardMetrics;
  error?: string;
}> {
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      'get_admin_dashboard_metrics' as never,
      {
        p_hackathon_id: hackathonId || null,
      } as never
    );

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    const metricsData = (data as unknown) as any;
    if (metricsData) {
      metricsData.generated_at = new Date().toISOString();
    }

    return {
      success: true,
      metrics: metricsData as AdminDashboardMetrics,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to retrieve administrative metrics.',
    };
  }
}

export interface AdminParticipationAnalytics {
  participation: {
    participating: number;
    not_participating: number;
    total_students: number;
  };
  activity: { hackathon_id: string; title: string; participants: number }[];
  /** Every hackathon, for the scope dropdown — identical for every admin. */
  hackathons: { id: string; title: string }[];
}

/**
 * Participation analytics for the admin overview dashboard. Delegates to the
 * SECURITY DEFINER RPC get_admin_participation_analytics, which returns the
 * same platform-wide aggregates (and scope-dropdown options) to every active
 * admin regardless of role, permissions, or hackathon assignments, and denies
 * everyone else. The RPC is used instead of direct table reads because (a)
 * ordinary-admin RLS on team_members/profiles is permission-gated and silently
 * returns zero rows, and (b) the service-role key has no table grant on
 * hackathons/team_members on hosted, so a service-role client errors.
 */
export async function getAdminParticipationAnalyticsAction(hackathonId?: string | null): Promise<{
  success: boolean;
  analytics?: AdminParticipationAnalytics;
  error?: string;
}> {
  try {
    await requireAdmin();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      'get_admin_participation_analytics' as never,
      { p_hackathon_id: hackathonId || null } as never
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      analytics: (data as unknown) as AdminParticipationAnalytics,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve participation analytics.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return { success: false, error: message };
  }
}
