'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin, checkAdminPermission } from '@/lib/auth/guards';

export interface AuditLogItem {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  /** Display name of the actor when the viewer can see it (admin or student profile). */
  actor_name?: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface GetAuditLogsParams {
  action?: string;
  targetType?: string;
  limit?: number;
  offset?: number;
}

export interface GetAuditLogsResult {
  success: boolean;
  logs: AuditLogItem[];
  totalCount: number;
  error?: string;
}

/**
 * Fetches scoped audit log entries.
 * Restricted to super admins or admins with 'view_audit_logs' permission.
 */
export async function getAuditLogsAction(
  params: GetAuditLogsParams = {}
): Promise<GetAuditLogsResult> {
  try {
    const { admin, permissions } = await requireAdmin();

    const isAuthorized =
      admin.is_super_admin || permissions.includes('view_audit_logs');

    if (!isAuthorized) {
      return {
        success: false,
        logs: [],
        totalCount: 0,
        error: 'Access denied: requires view_audit_logs permission or Super Admin status.',
      };
    }

    const supabase = await createClient();
    const limit = Math.min(Math.max(params.limit || 50, 1), 100);
    const offset = Math.max(params.offset || 0, 0);

    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.action && params.action.trim()) {
      query = query.eq('action', params.action.trim());
    }

    if (params.targetType && params.targetType.trim()) {
      query = query.eq('target_type', params.targetType.trim());
    }

    const { data, count, error } = await query;

    if (error) {
      return {
        success: false,
        logs: [],
        totalCount: 0,
        error: error.message,
      };
    }

    const logs = (data || []) as unknown as AuditLogItem[];
    // Resolve actor names in two batched lookups. RLS decides what the viewer may see;
    // anything not visible falls back to the role label in the UI.
    const actorIds = Array.from(new Set(logs.map((l) => l.actor_id).filter((id): id is string => Boolean(id))));
    if (actorIds.length > 0) {
      const [{ data: admins }, { data: students }] = await Promise.all([
        supabase.from('admin_profiles').select('id, full_name').in('id', actorIds),
        supabase.from('profiles').select('id, full_name').in('id', actorIds),
      ]);
      const names = new Map<string, string>();
      for (const row of [...(admins || []), ...(students || [])]) names.set(row.id, row.full_name);
      for (const log of logs) log.actor_name = log.actor_id ? names.get(log.actor_id) ?? null : null;
    }

    return {
      success: true,
      logs,
      totalCount: count || 0,
    };
  } catch (err: unknown) {
    return {
      success: false,
      logs: [],
      totalCount: 0,
      error: err instanceof Error ? err.message : 'Failed to fetch audit logs.',
    };
  }
}
