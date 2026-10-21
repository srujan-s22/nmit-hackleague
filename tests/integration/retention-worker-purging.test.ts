import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

const { purgeOrphanedRoundEvidence } = require('../../src/lib/storage/round-evidence-service');
const { createAdminClient } = require('../../src/lib/supabase/admin');

import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHddiHzlDeINvg_3BJ';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_NMIT_DEVELOPMENT_SERVICE_ROLE_KEY_2026';

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, message: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ [PASS] ${message}`);
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function createTestStudent(prefix: string) {
  const runHex = crypto.randomBytes(4).toString('hex');
  const email = `${prefix}_${runHex}@nmit-dev.local`;
  const password = 'Password123!';
  const year = Math.floor(18 + Math.random() * 8);
  const branchList = ['CS', 'IS', 'EC', 'EE', 'ME', 'AI'];
  const branch = branchList[Math.floor(Math.random() * branchList.length)];
  const roll = String(Math.floor(100 + Math.random() * 899)).padStart(3, '0');
  const usn = `1NT${year}${branch}${roll}`;
  const phone = `+91${Math.floor(6000000000 + Math.random() * 3999999999)}`;

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: `Student ${prefix}`,
      usn,
      phone,
      branch: 'CSE',
      academic_year: 3,
      sex: 'Other',
      date_of_birth: '2002-05-05',
    },
  });

  if (authErr || !authData.user) {
    throw new Error(`Failed to create test user: ${authErr?.message}`);
  }

  const userId = authData.user.id;

  await adminClient
    .from('profiles')
    .update({ registration_status: 'approved' })
    .eq('id', userId);

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData.session) {
    throw new Error(`Sign in failed for ${email}: ${signInErr?.message}`);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  });

  return { userId, email, client };
}

async function runRetentionSuite() {
  console.log('\n============================================================');
  console.log('   PHASE 8 RETENTION SCANNER & WORKER PURGING TEST SUITE');
  console.log('============================================================');

  console.log('\n--- 1. Setting Up Historical Hackathon & Evidence Objects ---');
  const student = await createTestStudent('ret_student');
  const slug = `rnd-ret-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  // Hackathon ended 8 days ago (eligible for retention scanning)
  const eventStartAt = new Date(now.getTime() - 15 * 24 * 3600 * 1000).toISOString();
  const eventEndAt = new Date(now.getTime() - 8 * 24 * 3600 * 1000).toISOString();

  // Active hackathon ended only 2 days ago (ineligible for retention scanning)
  const activeEndAt = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();

  const { data: saProfile } = await adminClient
    .from('admin_profiles')
    .select('id')
    .eq('is_super_admin', true)
    .single();
  const superAdminId = saProfile!.id;

  // 1.1 Ineligible Hackathon (< 7 days post-event)
  const { data: youngHackathon } = await adminClient
    .from('hackathons')
    .insert({
      title: `Young Hackathon ${slug}`,
      slug: `${slug}-young`,
      description: 'Recent hackathon',
      organizer: 'NMIT AI Club',
      venue: 'Online',
      eligibility: 'All Students',
      mode: 'online',
      status: 'completed',
      is_solo_allowed: true,
      min_team_size: 1,
      max_team_size: 4,
      registration_start_at: eventStartAt,
      registration_end_at: activeEndAt,
      event_start_at: eventStartAt,
      event_end_at: activeEndAt,
      in_charge_admin_id: superAdminId,
      created_by: superAdminId,
    })
    .select('id')
    .single();

  // 1.2 Eligible Hackathon (setup with active deadline initially, aged to > 7 days after submissions)
  const tempActiveEnd = new Date(now.getTime() + 3600 * 1000).toISOString();
  const { data: oldHackathon } = await adminClient
    .from('hackathons')
    .insert({
      title: `Historical Hackathon ${slug}`,
      slug: `${slug}-old`,
      description: 'Concluded hackathon',
      organizer: 'NMIT Research Group',
      venue: 'Campus Lab',
      eligibility: 'All Students',
      mode: 'offline',
      status: 'published',
      is_solo_allowed: true,
      min_team_size: 1,
      max_team_size: 4,
      registration_start_at: eventStartAt,
      registration_end_at: tempActiveEnd,
      event_start_at: eventStartAt,
      event_end_at: tempActiveEnd,
      in_charge_admin_id: superAdminId,
      created_by: superAdminId,
    })
    .select('id')
    .single();

  const hackathonId = oldHackathon!.id;

  // Round for historical hackathon
  const { data: roundData } = await adminClient
    .from('hackathon_rounds')
    .insert({
      hackathon_id: hackathonId,
      round_number: 1,
      name: 'Round 1 Final Submission',
      status: 'open',
      start_at: eventStartAt,
      end_at: tempActiveEnd,
    })
    .select('id')
    .single();
  const roundId = roundData!.id;

  // Team setup via authenticated leader RPC
  const { data: teamRes, error: teamErr } = await student.client.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: `Team Ret ${slug.slice(0, 8)}`,
  });
  if (teamErr) throw new Error(`create_team failed: ${teamErr.message}`);
  const teamId = typeof teamRes === 'string' ? teamRes : (teamRes as any)?.team_id || (teamRes as any)?.id || '';

  // Upload evidence objects to submission-evidence bucket
  const dummyBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const sharedEvidencePath = `teams/${teamId}/rounds/${roundId}/${crypto.randomUUID()}.png`;
  const regProofPath = `teams/${teamId}/registration/${crypto.randomUUID()}.png`;

  await adminClient.storage.from('submission-evidence').upload(sharedEvidencePath, dummyBuffer, { contentType: 'image/png' });
  await adminClient.storage.from('submission-evidence').upload(regProofPath, dummyBuffer, { contentType: 'image/png' });

  // Update team with registration proof path
  await adminClient.from('teams').update({ external_proof_path: regProofPath }).eq('id', teamId);

  // Insert two submission versions sharing the exact same evidence path
  const subV1Id = crypto.randomUUID();
  const subV2Id = crypto.randomUUID();

  const { error: subInsertErr } = await adminClient.from('submissions').insert([
    {
      id: subV1Id,
      hackathon_id: hackathonId,
      round_id: roundId,
      team_id: teamId,
      submitted_by: student.userId,
      version: 1,
      is_current: false,
      status: 'revision_requested',
      title: 'Historical V1 Milestone',
      evidence_path: sharedEvidencePath,
      evidence_sha256: crypto.createHash('sha256').update(dummyBuffer).digest('hex'),
      created_at: new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: subV2Id,
      hackathon_id: hackathonId,
      round_id: roundId,
      team_id: teamId,
      submitted_by: student.userId,
      version: 2,
      parent_submission_id: subV1Id,
      is_current: true,
      status: 'accepted',
      title: 'Historical V2 Milestone',
      evidence_path: sharedEvidencePath,
      evidence_sha256: crypto.createHash('sha256').update(dummyBuffer).digest('hex'),
      created_at: new Date(now.getTime() - 9 * 24 * 3600 * 1000).toISOString(),
    },
  ]);
  if (subInsertErr) console.error('  [DEBUG subInsertErr]:', subInsertErr);

  const { data: dbSubCheck } = await adminClient.from('submissions').select('id, evidence_path').eq('hackathon_id', hackathonId);
  console.log('  [DEBUG dbSubCheck]:', dbSubCheck);

  // Age the hackathon and round to concluded > 7 days ago
  await adminClient.from('hackathons').update({
    event_end_at: eventEndAt,
    registration_end_at: eventEndAt,
    status: 'completed',
  }).eq('id', hackathonId);

  await adminClient.from('hackathon_rounds').update({
    end_at: eventEndAt,
    status: 'completed',
  }).eq('id', roundId);

  // Insert results, reviews, points ledger, and audit log records to verify metadata persistence
  const resultId = crypto.randomUUID();
  await adminClient.from('results').insert({
    id: resultId,
    hackathon_id: hackathonId,
    round_id: roundId,
    team_id: teamId,
    milestone_type: 'round_qualification',
    is_published: true,
    verified_by: superAdminId,
  });

  await adminClient.from('submission_reviews').insert({
    submission_id: subV2Id,
    reviewer_id: superAdminId,
    decision: 'accepted',
    feedback: 'Excellent work in historical round.',
  });

  const ledgerId = crypto.randomUUID();
  await adminClient.from('points_ledger').insert({
    id: ledgerId,
    idempotency_key: `retention_test_${slug}`,
    student_id: student.userId,
    hackathon_id: hackathonId,
    team_id: teamId,
    round_id: roundId,
    result_id: resultId,
    milestone_type: 'round_qualification',
    role_at_award: 'leader',
    points: 25,
    reason: 'Verified qualification award',
    awarded_by: superAdminId,
  });

  console.log('\n--- 2. Enqueuing Ineligible vs Eligible Hackathons ---');
  // 2.1 Attempt enqueuing ineligible hackathon (< 7 days)
  const { data: youngRes } = await adminClient.rpc('enqueue_hackathon_evidence_retention', {
    p_hackathon_id: youngHackathon!.id,
  });
  assert((youngRes as any)?.eligible === false, 'enqueue_hackathon_evidence_retention returns eligible = false when < 7 days');

  // 2.2 Enqueue eligible historical hackathon (> 7 days)
  const { data: oldRes, error: oldErr } = await adminClient.rpc('enqueue_hackathon_evidence_retention', {
    p_hackathon_id: hackathonId,
  });
  assert(oldErr === null, 'enqueue_hackathon_evidence_retention succeeded for historical hackathon');
  assert((oldRes as any)?.eligible === true, 'enqueue_hackathon_evidence_retention returns eligible = true');
  if (oldRes) console.log('  [DEBUG oldRes]:', oldRes);
  assert((oldRes as any)?.submissions_enqueued === 1, 'Deduplicated: exactly 1 submission evidence item enqueued for shared versions');
  assert((oldRes as any)?.registration_proofs_enqueued === 1, 'Exactly 1 registration proof item enqueued');

  // Verify deletion queue entries exist with Option 5A retention deadline
  const { data: queuedJobs } = await adminClient
    .from('storage_deletion_queue')
    .select('id, bucket_id, object_path, target_type, retention_deadline_at, status')
    .eq('event_id', hackathonId);

  assert(queuedJobs !== null && queuedJobs.length === 2, 'Exactly 2 deletion jobs present in storage_deletion_queue');

  for (const job of queuedJobs!) {
    assert(job.bucket_id === 'submission-evidence', `Job targets bucket 'submission-evidence' (found ${job.bucket_id})`);
    assert(job.status === 'pending', 'Job is initially in status pending');
    // Option 5A check: retention deadline is ~7 days in future from scan time, NOT expired event_end_at
    const deadline = new Date(job.retention_deadline_at).getTime();
    const sevenDaysFromNow = Date.now() + 6 * 24 * 3600 * 1000;
    assert(
      deadline > sevenDaysFromNow,
      'Option 5A: retention_deadline_at stamps an absolute 7-day grace period from scan time'
    );
  }

  console.log('\n--- 3. Worker Execution: Lease Claiming & Purge Stamping ---');
  // Find submission evidence job
  const subJob = queuedJobs!.find((j) => j.target_type === 'submission_evidence')!;
  const leaseToken = crypto.randomUUID();

  // Transition to claimed and dispatching
  await adminClient
    .from('storage_deletion_queue')
    .update({
      status: 'dispatching',
      lease_token: leaseToken,
      leased_until: new Date(Date.now() + 60000).toISOString(),
    })
    .eq('id', subJob.id);

  // Storage purge from bucket
  const { error: removeErr } = await adminClient.storage.from('submission-evidence').remove([subJob.object_path]);
  assert(removeErr === null, 'Worker purged object from submission-evidence storage bucket');

  // Complete job via complete_storage_deletion_job (HTTP 200)
  const { error: compErr } = await adminClient.rpc('complete_storage_deletion_job', {
    p_job_id: subJob.id,
    p_lease_token: leaseToken,
    p_http_status: 200,
  });
  assert(compErr === null, 'complete_storage_deletion_job succeeded with HTTP 200');

  // 3.1 Multi-Version Purge Atomicity Verification
  const { data: updatedSubs } = await adminClient
    .from('submissions')
    .select('id, version, evidence_deleted_at')
    .in('id', [subV1Id, subV2Id]);

  assert(
    updatedSubs !== null && updatedSubs.length === 2,
    'Both submission versions retrieved'
  );
  assert(
    updatedSubs![0].evidence_deleted_at !== null && updatedSubs![1].evidence_deleted_at !== null,
    'Both submission versions sharing evidence_path are atomically stamped evidence_deleted_at'
  );

  console.log('\n--- 4. HTTP 404 Idempotency Verification ---');
  // Complete the registration proof job with HTTP 404 (file already removed / absent)
  const regJob = queuedJobs!.find((j) => j.target_type === 'registration_screenshot')!;
  const regLease = crypto.randomUUID();

  await adminClient
    .from('storage_deletion_queue')
    .update({
      status: 'dispatching',
      lease_token: regLease,
      leased_until: new Date(Date.now() + 60000).toISOString(),
    })
    .eq('id', regJob.id);

  const { error: http404CompErr } = await adminClient.rpc('complete_storage_deletion_job', {
    p_job_id: regJob.id,
    p_lease_token: regLease,
    p_http_status: 404,
  });
  assert(http404CompErr === null, 'complete_storage_deletion_job succeeds idempotently on HTTP 404');

  const { data: completedRegJob } = await adminClient
    .from('storage_deletion_queue')
    .select('status')
    .eq('id', regJob.id)
    .single();
  assert(completedRegJob?.status === 'completed', 'Job status marked completed upon HTTP 404');

  console.log('\n--- 5. Orphan and Abandoned Intent Cleanup ---');
  // Upload unreferenced evidence object
  const unreferencedPath = `teams/${teamId}/rounds/${roundId}/${crypto.randomUUID()}.png`;
  await adminClient.storage.from('submission-evidence').upload(unreferencedPath, dummyBuffer, { contentType: 'image/png' });

  // Verify it exists in storage
  const { data: storageBefore } = await adminClient.storage.from('submission-evidence').list(`teams/${teamId}/rounds/${roundId}`);
  const unrefFilename = path.basename(unreferencedPath);
  assert(storageBefore?.some((f) => f.name === unrefFilename) === true, 'Unreferenced evidence object exists in storage');

  // Run purgeOrphanedRoundEvidence on unreferenced object
  const appAdminClient = createAdminClient();
  await purgeOrphanedRoundEvidence(appAdminClient, unreferencedPath);

  // Verify object was deleted from storage
  const { data: storageAfter } = await adminClient.storage.from('submission-evidence').list(`teams/${teamId}/rounds/${roundId}`);
  assert(storageAfter?.some((f) => f.name === unrefFilename) === false, 'purgeOrphanedRoundEvidence cleanly purged unreferenced object');

  // Verify that referenced objects are NOT deleted by purgeOrphanedRoundEvidence
  const referencedMock = `teams/${teamId}/rounds/${roundId}/referenced_v1.png`;
  await adminClient.storage.from('submission-evidence').upload(referencedMock, dummyBuffer, { contentType: 'image/png' });
  const { error: updErr } = await adminClient.from('submissions').update({ evidence_path: referencedMock }).eq('id', subV1Id);
  if (updErr) console.error('  [DEBUG updErr]:', updErr);

  await purgeOrphanedRoundEvidence(appAdminClient, referencedMock);
  const { data: storageRefCheck } = await adminClient.storage.from('submission-evidence').list(`teams/${teamId}/rounds/${roundId}`);
  assert(storageRefCheck?.some((f) => f.name === 'referenced_v1.png') === true, 'purgeOrphanedRoundEvidence safely preserves referenced objects');

  console.log('\n--- 6. Metadata Invariant Preservation ---');
  // Verify results table is intact
  const { data: resCheck } = await adminClient.from('results').select('id').eq('id', resultId).single();
  assert(resCheck?.id === resultId, 'Results records remain completely intact after evidence purging');

  // Verify submission reviews are intact
  const { data: revCheck } = await adminClient.from('submission_reviews').select('decision').eq('submission_id', subV2Id).single();
  assert(revCheck?.decision === 'accepted', 'Submission reviews remain completely intact after evidence purging');

  // Verify points ledger is intact
  const { data: ptsCheck } = await adminClient.from('points_ledger').select('id, points').eq('id', ledgerId).single();
  assert(ptsCheck?.id === ledgerId && ptsCheck?.points === 25, 'Points ledger remains completely intact with positive balance');

  // Verify audit logs are intact
  const { data: auditCheck } = await adminClient
    .from('audit_logs')
    .select('id')
    .eq('target_id', subJob.id);
  assert(Boolean(auditCheck && auditCheck.length > 0), 'Audit logs recorded for worker completion events');

  console.log(`\n============================================================`);
  console.log(`   RETENTION RESULTS: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100.0%)`);
  console.log(`============================================================\n`);
}

runRetentionSuite().catch((err) => {
  console.error('\nRetention suite failed with unhandled error:', err);
  process.exit(1);
});
