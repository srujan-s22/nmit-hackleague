import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

interface StorageDeletionJob {
  job_id: string;
  event_id: string | null;
  bucket_id: string;
  object_path: string;
  target_type: string;
  target_id: string;
  lease_token: string;
  leased_until: string;
}

export async function POST(request: NextRequest) {
  // 1. Authenticate CRON_SECRET using timing-safe comparison
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret || expectedSecret.length < 32) {
    return NextResponse.json(
      { error: 'CRON_SECRET configuration error: secret missing or insecure.' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const providedToken = tokenMatch ? tokenMatch[1] : '';

  const expectedBuffer = Buffer.from(expectedSecret);
  const providedBuffer = Buffer.from(providedToken);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return NextResponse.json(
      { error: 'Unauthorized: invalid or missing cron secret.' },
      { status: 401 }
    );
  }

  const adminClient = createAdminClient();
  const workerId = `worker-${crypto.randomUUID()}`;

  // --------------------------------------------------------------------------
  // STEP 1: Quarantine Expired Dispatches
  // --------------------------------------------------------------------------
  let quarantinedCount = 0;
  try {
    const { data: qData, error: qError } = await adminClient.rpc(
      'quarantine_expired_dispatches' as never,
      { p_cooldown_seconds: 300 } as never
    );
    if (!qError && qData) {
      quarantinedCount = (qData as { job_id: string }[]).length;
    }
  } catch (err) {
    console.warn('[process-deletions] Quarantine check warning:', err);
  }

  // --------------------------------------------------------------------------
  // STEP 2: Claim & Dispatch Deletions (Phase 4 Root-First Leased Batch)
  // --------------------------------------------------------------------------
  const { data: claimedData, error: claimError } = await adminClient.rpc(
    'claim_storage_deletion_batch' as never,
    {
      p_worker_id: workerId,
      p_batch_size: 50,
      p_lease_seconds: 60,
    } as never
  );

  if (claimError) {
    return NextResponse.json(
      { error: `Failed to claim storage deletion batch: ${claimError.message}` },
      { status: 500 }
    );
  }

  const claimedJobs = (claimedData as StorageDeletionJob[] | null) || [];
  let dispatchedCompletedCount = 0;
  let dispatchedFailedCount = 0;

  for (const job of claimedJobs) {
    try {
      // Transition from claimed -> dispatching under lock
      const { data: preflightOk, error: preflightError } = await adminClient.rpc(
        'confirm_deletion_preflight' as never,
        {
          p_job_id: job.job_id,
          p_lease_token: job.lease_token,
        } as never
      );

      if (preflightError || !preflightOk) {
        // Job was preempted, expired, or modified; skip to next
        continue;
      }

      // Execute storage deletion with 10-second timeout
      let statusCode = 200;
      let deletionErrorMsg: string | null = null;

      try {
        const { error: removeError } = await adminClient.storage
          .from(job.bucket_id)
          .remove([job.object_path]);

        if (removeError) {
          const errMsg = removeError.message.toLowerCase();
          if (
            errMsg.includes('not found') ||
            errMsg.includes('does not exist') ||
            errMsg.includes('404')
          ) {
            statusCode = 404; // Confirmed absent
          } else {
            statusCode = 500;
            deletionErrorMsg = removeError.message;
          }
        }
      } catch (storageEx) {
        statusCode = 500;
        deletionErrorMsg = storageEx instanceof Error ? storageEx.message : 'Storage remove failed';
      }

      // Attempt completion (handles 200/404 success or error, and race loss against quarantine)
      const { error: completeError } = await adminClient.rpc(
        'complete_storage_deletion_job' as never,
        {
          p_job_id: job.job_id,
          p_lease_token: job.lease_token,
          p_http_status: statusCode,
        } as never
      );

      if (completeError) {
        // If SQLSTATE 55P03, job was quarantined or lease expired concurrently. This is expected under race.
        if (completeError.message.includes('55P03')) {
          console.info(`[process-deletions] Job ${job.job_id} lost race to quarantine/reconciliation.`);
        } else {
          console.warn(`[process-deletions] Job ${job.job_id} complete returned error:`, completeError.message);
          dispatchedFailedCount++;
        }
      } else {
        if (statusCode === 200 || statusCode === 404) {
          dispatchedCompletedCount++;
        } else {
          dispatchedFailedCount++;
        }
      }
    } catch (jobEx) {
      dispatchedFailedCount++;
      console.error(`[process-deletions] Unexpected error on job ${job.job_id}:`, jobEx);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 3: Claim & Resolve Reconciliation Jobs
  // --------------------------------------------------------------------------
  const { data: reconcilingData, error: reconcilerClaimError } = await adminClient.rpc(
    'claim_reconciliation_batch' as never,
    {
      p_worker_id: workerId,
      p_batch_size: 50,
      p_lease_seconds: 60,
    } as never
  );

  const reconcilingJobs = reconcilerClaimError ? [] : ((reconcilingData as StorageDeletionJob[] | null) || []);
  let reconciledAbsentCount = 0;
  let reconciledPresentCount = 0;

  for (const rJob of reconcilingJobs) {
    try {
      // Check if object exists in storage
      // We test existence by attempting a download / check with storage API
      const { data: downloadData, error: downloadError } = await adminClient.storage
        .from(rJob.bucket_id)
        .download(rJob.object_path);

      const objectExists = !downloadError && downloadData !== null;

      if (objectExists) {
        // Object still exists -> resolve to investigation_required
        await adminClient.rpc(
          'resolve_reconciliation_job' as never,
          {
            p_job_id: rJob.job_id,
            p_lease_token: rJob.lease_token,
            p_confirmed_absent: false,
            p_details: 'Object verified present in storage during reconciliation audit',
          } as never
        );
        reconciledPresentCount++;
      } else {
        // Object absent -> resolve to completed and clear metadata
        await adminClient.rpc(
          'resolve_reconciliation_job' as never,
          {
            p_job_id: rJob.job_id,
            p_lease_token: rJob.lease_token,
            p_confirmed_absent: true,
            p_details: 'Object confirmed absent during reconciliation check',
          } as never
        );
        reconciledAbsentCount++;
      }
    } catch (rEx) {
      console.warn(`[process-deletions] Reconciliation error on job ${rJob.job_id}:`, rEx);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: Prune Expired Rate Limit Buckets
  // --------------------------------------------------------------------------
  let prunedBuckets = 0;
  try {
    const { data: pruned } = await adminClient.rpc('prune_rate_limit_buckets' as never);
    prunedBuckets = Number(pruned) || 0;
  } catch {
    // Non-fatal
  }

  return NextResponse.json({
    success: true,
    quarantinedCount,
    dispatched: {
      claimed: claimedJobs.length,
      completed: dispatchedCompletedCount,
      failed: dispatchedFailedCount,
    },
    reconciliation: {
      claimed: reconcilingJobs.length,
      confirmedAbsent: reconciledAbsentCount,
      flaggedInvestigation: reconciledPresentCount,
    },
    prunedBuckets,
  });
}
