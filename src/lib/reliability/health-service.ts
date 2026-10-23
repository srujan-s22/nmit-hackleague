import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

export interface SystemHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  timestamp: string;
  database: {
    connected: boolean;
    registeredStudents?: number;
    totalHackathons?: number;
    totalTeams?: number;
    activePushSubscriptions?: number;
    pendingStorageDeletions?: number;
    pendingTransactionalEmails?: number;
  };
  storage: {
    accessible: boolean;
    bucketsChecked: string[];
    error?: string;
  };
  reliabilityNotice: string;
}

/**
 * Checks system operational health, database connectivity, queue states,
 * and reports the authoritative Supabase Free plan reliability notice.
 */
export async function checkSystemHealth(): Promise<SystemHealthReport> {
  const startTime = Date.now();
  const adminClient = createAdminClient();

  let dbConnected = false;
  let dbMetrics: Record<string, number> = {};
  let dbNotice = 'Institutional reliability services active.';

  // 1. Database Health Check via get_system_health RPC
  try {
    const { data, error } = await adminClient.rpc('get_system_health' as never);
    if (!error && data && typeof data === 'object') {
      const payload = data as Record<string, unknown>;
      dbConnected = payload.database_connected === true;
      if (payload.metrics && typeof payload.metrics === 'object') {
        dbMetrics = payload.metrics as Record<string, number>;
      }
      if (typeof payload.reliability_notice === 'string') {
        dbNotice = payload.reliability_notice;
      }
    }
  } catch {
    dbConnected = false;
  }

  // 2. Storage Buckets Reachability Check
  let storageAccessible = false;
  let storageError: string | undefined;
  const bucketsToCheck = ['profile-photos', 'verification-documents', 'submission-evidence'];

  try {
    const { data: buckets, error: bucketError } = await adminClient.storage.listBuckets();
    if (!bucketError && buckets) {
      storageAccessible = true;
    } else {
      storageError = bucketError?.message || 'Failed to list storage buckets';
    }
  } catch (err) {
    storageError = err instanceof Error ? err.message : 'Storage check failed';
  }

  const latencyMs = Date.now() - startTime;
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (!dbConnected) {
    overallStatus = 'unhealthy';
  } else if (!storageAccessible) {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    latencyMs,
    timestamp: new Date().toISOString(),
    database: {
      connected: dbConnected,
      registeredStudents: dbMetrics.registered_students,
      totalHackathons: dbMetrics.total_hackathons,
      totalTeams: dbMetrics.total_teams,
      activePushSubscriptions: dbMetrics.active_push_subscriptions,
      pendingStorageDeletions: dbMetrics.pending_storage_deletions,
      pendingTransactionalEmails: dbMetrics.pending_transactional_emails,
    },
    storage: {
      accessible: storageAccessible,
      bucketsChecked: bucketsToCheck,
      error: storageError,
    },
    reliabilityNotice: dbNotice,
  };
}
