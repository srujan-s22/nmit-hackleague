import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // 2. Claim pending deletion jobs atomically with lease lock
  const { data: claimedJobs, error: claimError } = await adminClient.rpc(
    'claim_storage_deletion_jobs' as never,
    {
      p_worker_id: workerId,
      p_batch_size: 50,
      p_lease_seconds: 60,
    } as never
  );

  if (claimError) {
    return NextResponse.json(
      { error: `Failed to claim deletion jobs: ${claimError.message}` },
      { status: 500 }
    );
  }

  const jobs = (claimedJobs as {
    job_id: string;
    bucket_id: string;
    object_path: string;
    target_type: string;
    target_id: string;
    lease_token: string;
    leased_until: string;
  }[] | null) || [];

  let processedCount = 0;
  let failedCount = 0;

  for (const job of jobs) {
    try {
      // Execute object deletion from private storage bucket
      const { error: deleteError } = await adminClient.storage
        .from(job.bucket_id)
        .remove([job.object_path]);

      if (deleteError) {
        const errorLower = deleteError.message.toLowerCase();
        const isNotFound =
          errorLower.includes('not found') ||
          errorLower.includes('does not exist') ||
          errorLower.includes('404');

        if (!isNotFound) {
          // Real operational failure: report failure with retry backoff
          await adminClient.rpc('fail_storage_deletion_job' as never, {
            p_job_id: job.job_id,
            p_lease_token: job.lease_token,
            p_error: deleteError.message,
          } as never);

          failedCount++;
          continue;
        }
      }

      // Deletion succeeded or file confirmed already absent: complete job atomically
      await adminClient.rpc('complete_storage_deletion_job' as never, {
        p_job_id: job.job_id,
        p_lease_token: job.lease_token,
      } as never);

      processedCount++;
    } catch (err) {
      failedCount++;
      const msg = err instanceof Error ? err.message : 'Unknown exception';
      try {
        await adminClient.rpc('fail_storage_deletion_job' as never, {
          p_job_id: job.job_id,
          p_lease_token: job.lease_token,
          p_error: msg,
        } as never);
      } catch {
        // Fail-safe
      }
    }
  }

  // 3. Prune expired rate limit buckets
  let prunedBuckets = 0;
  try {
    const { data: pruned } = await adminClient.rpc(
      'prune_rate_limit_buckets' as never
    );
    prunedBuckets = Number(pruned) || 0;
  } catch {
    // Non-fatal
  }

  return NextResponse.json({
    success: true,
    processed: processedCount,
    failed: failedCount,
    totalClaimed: jobs.length,
    prunedBuckets,
  });
}
