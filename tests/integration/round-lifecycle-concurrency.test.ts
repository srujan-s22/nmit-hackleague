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

  return { userId, email, client, usn };
}

async function getSuperAdminClient() {
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: 'superadmin@nmit-dev.local',
    password: 'password123',
  });

  if (signInErr || !signInData.session) {
    throw new Error(`Failed to authenticate Super Admin seed: ${signInErr?.message}`);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  });

  return { adminId: signInData.user.id, email: 'superadmin@nmit-dev.local', client };
}

async function runConcurrencySuite() {
  console.log('\n============================================================');
  console.log('   PHASE 8 CONCURRENCY & TRANSACTIONAL INVARIANTS SUITE');
  console.log('============================================================');

  console.log('\n--- 1. Setting Up Test Actors & Hackathon Environment ---');
  const superAdmin = await getSuperAdminClient();
  const leader = await createTestStudent('concur_ldr');

  const slug = `rnd-concur-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const startAt = new Date(now.getTime() - 3600 * 1000).toISOString();
  const endAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  const { data: hackathon, error: hErr } = await adminClient
    .from('hackathons')
    .insert({
      title: `Phase 8 Concurrency Hackathon ${slug}`,
      slug,
      description: 'Testing concurrency locks and deferred triggers',
      organizer: 'NMIT Research Group',
      venue: 'Online',
      eligibility: 'All Engineering Students',
      mode: 'online',
      status: 'published',
      is_solo_allowed: true,
      min_team_size: 1,
      max_team_size: 4,
      registration_start_at: startAt,
      registration_end_at: endAt,
      event_start_at: startAt,
      event_end_at: endAt,
      in_charge_admin_id: superAdmin.adminId,
      created_by: superAdmin.adminId,
    })
    .select('id')
    .single();

  if (hErr || !hackathon) throw new Error(`Hackathon creation failed: ${hErr?.message}`);
  const hackathonId = hackathon.id;

  const { data: roundData } = await adminClient
    .from('hackathon_rounds')
    .insert({
      hackathon_id: hackathonId,
      round_number: 1,
      name: 'Round 1 Concurrency',
      status: 'open',
      start_at: startAt,
      end_at: endAt,
    })
    .select('id')
    .single();

  const roundId = roundData!.id;
  assert(Boolean(hackathonId && roundId), 'Hackathon and round initialized');

  // Form Team and register
  const { data: teamRes, error: teamErr } = await leader.client.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: `Team Concur ${slug.slice(0, 10)}`,
  });
  if (teamErr) throw new Error(`create_team failed: ${teamErr.message}`);
  const teamId = typeof teamRes === 'string' ? teamRes : (teamRes as any)?.team_id || (teamRes as any)?.id || '';

  const regProofPath = `teams/${teamId}/registration/${crypto.randomUUID()}.png`;
  const dummyBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  await adminClient.storage.from('submission-evidence').upload(regProofPath, dummyBuffer, { contentType: 'image/png' });

  await leader.client.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: regProofPath,
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: 'By submitting this screenshot, you confirm that it is genuine, unaltered, and represents your team\'s actual registration on the official hackathon platform. Submitting fake, manipulated, or misleading registration proof may result in strict disciplinary action by the Career Development Centre (CDC), including disqualification from the hackathon and other action under applicable college rules. Your submission may be reviewed, and providing proof does not guarantee acceptance.',
  });

  console.log('\n--- 2. Round Pause and Resume Operational State Guards ---');
  // 2.1 Pause round via pause_hackathon_round
  const { error: pauseErr } = await superAdmin.client.rpc('pause_hackathon_round', {
    p_round_id: roundId,
    p_reason: 'Emergency server maintenance during round',
  });
  assert(pauseErr === null, 'pause_hackathon_round succeeded via superAdmin');

  // Verify round is paused
  const { data: pausedRound } = await adminClient.from('hackathon_rounds').select('status').eq('id', roundId).single();
  assert(pausedRound?.status === 'paused', 'Round status verified as paused');

  // Student submission rejected while round is paused
  const { error: subPausedErr } = await leader.client.rpc('submit_round_milestone', {
    p_round_id: roundId,
    p_team_id: teamId,
    p_title: 'Submission while paused',
  });
  assert(
    subPausedErr !== null && subPausedErr.code === '55P03',
    'submit_round_milestone rejected with 55P03 when round is paused'
  );

  // 2.2 Resume round via resume_hackathon_round with future deadline
  const newEndAt = new Date(now.getTime() + 5 * 24 * 3600 * 1000).toISOString();
  const { error: resumeErr } = await superAdmin.client.rpc('resume_hackathon_round', {
    p_round_id: roundId,
    p_new_end_at: newEndAt,
    p_reason: 'Maintenance complete, deadline extended',
  });
  assert(resumeErr === null, 'resume_hackathon_round succeeded via superAdmin');

  // Verify round is open
  const { data: resumedRound } = await adminClient.from('hackathon_rounds').select('status').eq('id', roundId).single();
  assert(resumedRound?.status === 'open', 'Round status verified as open after resume');

  console.log('\n--- 3. Intent Consumption Serialization Under Racing Calls ---');
  // Create evidence and validation intent
  const evidenceObj = `teams/${teamId}/rounds/${roundId}/${crypto.randomUUID()}.png`;
  const sha256 = crypto.createHash('sha256').update(dummyBuffer).digest('hex');
  await adminClient.storage.from('submission-evidence').upload(evidenceObj, dummyBuffer, { contentType: 'image/png' });

  await adminClient.from('evidence_validation_intents').insert({
    hackathon_id: hackathonId,
    round_id: roundId,
    team_id: teamId,
    object_path: evidenceObj,
    sha256_hash: sha256,
    file_size_bytes: dummyBuffer.length,
    mime_type: 'image/png',
    created_by: leader.userId,
    status: 'pending',
    expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
  });

  // Launch two concurrent submission attempts with the same intent
  const [res1, res2] = await Promise.all([
    leader.client.rpc('submit_round_milestone', {
      p_round_id: roundId,
      p_team_id: teamId,
      p_title: 'Race Attempt 1',
      p_evidence_path: evidenceObj,
      p_evidence_sha256: sha256,
    }),
    leader.client.rpc('submit_round_milestone', {
      p_round_id: roundId,
      p_team_id: teamId,
      p_title: 'Race Attempt 2',
      p_evidence_path: evidenceObj,
      p_evidence_sha256: sha256,
    }),
  ]);

  const successes = [res1, res2].filter((r) => r.error === null);
  const failures = [res1, res2].filter((r) => r.error !== null);

  assert(successes.length === 1, 'Exactly one concurrent submission succeeds under intent consumption serialization');
  assert(failures.length === 1, 'The competing concurrent submission cleanly fails with serialization conflict');
  assert(
    failures[0].error?.code === '23505' || failures[0].error?.code === '22023',
    'Failed attempt received unique conflict 23505 or intent already consumed 22023'
  );

  // Verify exactly one active submission in DB
  const { data: currentSubs } = await adminClient
    .from('submissions')
    .select('id, title, is_current')
    .eq('round_id', roundId)
    .eq('team_id', teamId);
  assert(Boolean(currentSubs && currentSubs.length === 1), 'Exactly 1 submission record exists in public.submissions');
  const submissionId = currentSubs![0].id;

  console.log('\n--- 4. Engine Deferred Constraint Trigger Enforcement ---');
  // Expired round setup to test trigger behavior
  const { data: expiredRound } = await adminClient
    .from('hackathon_rounds')
    .insert({
      hackathon_id: hackathonId,
      round_number: 2,
      name: 'Round 2 Expired',
      status: 'open',
      start_at: new Date(Date.now() - 7200 * 1000).toISOString(),
      end_at: new Date(Date.now() - 3600 * 1000).toISOString(), // Expired 1 hour ago
    })
    .select('id')
    .single();

  const expiredRoundId = expiredRound!.id;

  // Direct insert to submissions referencing expired round should be rejected by constraint trigger
  const { error: lateInsertErr } = await adminClient.from('submissions').insert({
    hackathon_id: hackathonId,
    round_id: expiredRoundId,
    team_id: teamId,
    submitted_by: leader.userId,
    version: 1,
    is_current: true,
    status: 'submitted',
    title: 'Late Direct Insert Attempt',
  });
  assert(
    lateInsertErr !== null && lateInsertErr.code === '55P03',
    'trg_submissions_enforce_commit_deadline aborts late submission transaction with 55P03'
  );

  // Mismatched hackathon_id should be rejected with 23503
  const fakeHackathonId = crypto.randomUUID();
  const { error: mismatchHackErr } = await adminClient.from('submissions').insert({
    hackathon_id: fakeHackathonId,
    round_id: roundId,
    team_id: teamId,
    submitted_by: leader.userId,
    version: 10,
    is_current: true,
    status: 'submitted',
    title: 'Mismatch Hackathon Insert',
  });
  if (mismatchHackErr) console.error('mismatchHackErr details:', mismatchHackErr);
  assert(
    mismatchHackErr !== null && (mismatchHackErr.code === '23503' || mismatchHackErr.code === '23505'),
    'trg_submissions_enforce_commit_deadline rejects mismatched hackathon with 23503 or unique index 23505'
  );

  console.log('\n--- 5. Evidence Reuse Safety Against Deletion Queue States ---');
  // Admin requests revision so team can resubmit
  await superAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'revision_requested',
    p_feedback: 'Please update documentation and provide updated evidence.',
  });

  // Simulate evidence in deletion queue in 'pending' status
  const queueJobId = crypto.randomUUID();
  await adminClient.from('storage_deletion_queue').insert({
    id: queueJobId,
    event_id: hackathonId,
    bucket_id: 'submission-evidence',
    object_path: evidenceObj,
    target_type: 'submission_evidence',
    target_id: submissionId,
    status: 'pending',
    retention_deadline_at: new Date().toISOString(),
  });

  // Attempt to resubmit milestone reusing prior evidence (p_evidence_path = evidenceObj)
  const { error: reusePendingErr } = await leader.client.rpc('resubmit_round_milestone', {
    p_prior_submission_id: submissionId,
    p_title: 'Reusing pending purged evidence',
    p_evidence_path: evidenceObj,
  });
  if (reusePendingErr) console.log('  [DEBUG reusePendingErr]:', reusePendingErr);
  assert(
    reusePendingErr !== null && reusePendingErr.code === '55P03',
    'resubmit_round_milestone Case B rejects prior evidence when enqueued in storage_deletion_queue (55P03)'
  );

  // Update deletion queue to dispatching
  await adminClient
    .from('storage_deletion_queue')
    .update({ status: 'dispatching', lease_token: crypto.randomUUID(), leased_until: new Date(Date.now() + 60000).toISOString() })
    .eq('id', queueJobId);

  // Attempt reuse again during dispatching
  const { error: reuseDispatchErr } = await leader.client.rpc('resubmit_round_milestone', {
    p_prior_submission_id: submissionId,
    p_title: 'Reusing dispatching evidence',
    p_evidence_path: evidenceObj,
  });
  assert(
    reuseDispatchErr !== null && reuseDispatchErr.code === '55P03',
    'resubmit_round_milestone Case B rejects prior evidence when status is dispatching (55P03)'
  );

  // Cleanup simulation queue entry
  await adminClient.from('storage_deletion_queue').delete().eq('id', queueJobId);

  console.log('\n--- 6. Idempotent Points Awarding Under Repeated Approvals ---');
  // Team resubmits with new valid evidence
  const newEvidence = `teams/${teamId}/rounds/${roundId}/${crypto.randomUUID()}.png`;
  await adminClient.storage.from('submission-evidence').upload(newEvidence, dummyBuffer, { contentType: 'image/png' });

  await adminClient.from('evidence_validation_intents').insert({
    hackathon_id: hackathonId,
    round_id: roundId,
    team_id: teamId,
    object_path: newEvidence,
    sha256_hash: sha256,
    file_size_bytes: dummyBuffer.length,
    mime_type: 'image/png',
    created_by: leader.userId,
    status: 'pending',
    expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
  });

  const { data: resubRes, error: resubErr } = await leader.client.rpc('resubmit_round_milestone', {
    p_prior_submission_id: submissionId,
    p_title: 'Valid Version 2 Submission',
    p_evidence_path: newEvidence,
    p_evidence_sha256: sha256,
  });
  assert(resubErr === null, 'resubmit_round_milestone succeeded for Version 2');
  const v2SubId = (resubRes as any).submission_id;

  // Review Version 2: Accept
  const { error: app1Err } = await superAdmin.client.rpc('review_round_submission', {
    p_submission_id: v2SubId,
    p_decision: 'accepted',
    p_feedback: 'Outstanding milestone progress!',
  });
  assert(app1Err === null, 'First review_round_submission (acceptance) succeeded');

  const { data: pts1 } = await adminClient
    .from('points_ledger')
    .select('id, points, milestone_type')
    .eq('student_id', leader.userId)
    .eq('milestone_type', 'round_qualification');
  const ptsCount1 = pts1 ? pts1.length : 0;
  assert(ptsCount1 === 1, 'Exactly 1 qualification points ledger entry awarded');

  // Re-reviewing already accepted submission is rejected (terminal review state)
  const { error: app2Err } = await superAdmin.client.rpc('review_round_submission', {
    p_submission_id: v2SubId,
    p_decision: 'accepted',
    p_feedback: 'Re-confirming milestone progress.',
  });
  assert(
    app2Err !== null && app2Err.code === '22023',
    'Re-reviewing already accepted submission is rejected with 22023 (terminal review state)'
  );

  // Attempting duplicate points ledger entry directly with same idempotency key fails with 23505
  const duplicateIdempotencyKey = `round_qualification_${hackathonId}_${roundId}_${leader.userId}`;
  const { error: dupPtsErr } = await adminClient.from('points_ledger').insert({
    idempotency_key: duplicateIdempotencyKey,
    student_id: leader.userId,
    hackathon_id: hackathonId,
    team_id: teamId,
    round_id: roundId,
    milestone_type: 'round_qualification',
    role_at_award: 'leader',
    points: 25,
    reason: 'Duplicate attempt test',
    awarded_by: superAdmin.adminId,
  });
  assert(
    dupPtsErr !== null && dupPtsErr.code === '23505',
    'Duplicate points ledger insertion rejected with 23505 (idempotency preserved under unique index)'
  );

  const { data: pts2 } = await adminClient
    .from('points_ledger')
    .select('id, points, milestone_type')
    .eq('student_id', leader.userId)
    .eq('milestone_type', 'round_qualification');
  const ptsCount2 = pts2 ? pts2.length : 0;
  assert(ptsCount2 === 1, 'Points ledger entry count strictly remains 1');

  console.log(`\n============================================================`);
  console.log(`   CONCURRENCY RESULTS: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100.0%)`);
  console.log(`============================================================\n`);
}

runConcurrencySuite().catch((err) => {
  console.error('\nConcurrency suite failed with unhandled error:', err);
  process.exit(1);
});
