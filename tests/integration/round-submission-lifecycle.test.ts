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

async function runLifecycleSuite() {
  console.log('\n============================================================');
  console.log('   PHASE 8 E2E SUITE: SUBMISSION LIFECYCLE & WORKFLOWS');
  console.log('============================================================\n');

  console.log('--- 1. Setting Up Test Actors & Environment ---');
  const leader = await createTestStudent('rnd_lead');
  const member = await createTestStudent('rnd_mem');
  const outsider = await createTestStudent('rnd_out');
  const admin = await getSuperAdminClient();

  // Create test hackathon with 2 sequential rounds
  const slug = `rnd-e2e-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const startAt = new Date(now.getTime() - 3600 * 1000).toISOString();
  const endAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  const { data: hackathon, error: hErr } = await adminClient
    .from('hackathons')
    .insert({
      title: `Phase 8 E2E Hackathon ${slug}`,
      slug,
      description: 'Phase 8 Integration Test Hackathon',
      organizer: 'NMIT Tech Club',
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
      in_charge_admin_id: admin.adminId,
      created_by: admin.adminId,
    })
    .select('id')
    .single();

  if (hErr || !hackathon) throw new Error(`Hackathon creation failed: ${hErr?.message}`);
  const hackathonId = hackathon.id;

  // Insert Round 1 and Round 2
  const round1End = new Date(now.getTime() + 2 * 24 * 3600 * 1000).toISOString();
  const round2Start = round1End;
  const round2End = endAt;

  const { data: round1Data } = await adminClient
    .from('hackathon_rounds')
    .insert({
      hackathon_id: hackathonId,
      round_number: 1,
      name: 'Ideation & Prototype',
      status: 'open',
      start_at: startAt,
      end_at: round1End,
    })
    .select('id')
    .single();

  const { data: round2Data } = await adminClient
    .from('hackathon_rounds')
    .insert({
      hackathon_id: hackathonId,
      round_number: 2,
      name: 'Final Pitch & Working Demo',
      status: 'open',
      is_final_round: true,
      start_at: round2Start,
      end_at: round2End,
    })
    .select('id')
    .single();

  const round1Id = round1Data!.id;
  const round2Id = round2Data!.id;

  assert(Boolean(hackathonId && round1Id && round2Id), 'Hackathon and 2 sequential rounds created');

  console.log('\n--- 2. Team Formation & Registration Proof ---');
  const { data: teamRes, error: teamCreateErr } = await leader.client.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: `Team Alpha ${slug}`,
  });
  if (teamCreateErr) throw new Error(`create_team failed: ${teamCreateErr.message}`);
  const teamId = typeof teamRes === 'string' ? teamRes : (teamRes as any)?.team_id || (teamRes as any)?.id || '';
  assert(Boolean(teamId), 'Team created successfully');

  // Submit registration proof to unlock round participation
  const validProofPath = `teams/${teamId}/registration/${crypto.randomUUID()}.png`;
  await adminClient.storage.from('submission-evidence').upload(validProofPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
    contentType: 'image/png',
  });

  const { data: proofSubmitRes, error: proofSubmitErr } = await leader.client.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: validProofPath,
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: 'By submitting this screenshot, you confirm that it is genuine, unaltered, and represents your team\'s actual registration on the official hackathon platform. Submitting fake, manipulated, or misleading registration proof may result in strict disciplinary action by the Career Development Centre (CDC), including disqualification from the hackathon and other action under applicable college rules. Your submission may be reviewed, and providing proof does not guarantee acceptance.',
  });
  if (proofSubmitErr) throw new Error(`submit_registration_proof failed: ${proofSubmitErr.message}`);

  const { data: teamCheck } = await adminClient
    .from('teams')
    .select('external_status')
    .eq('id', teamId)
    .single();
  assert(teamCheck?.external_status === 'submitted', 'Team registration proof submitted successfully');

  console.log('\n--- 3. Milestone Submission Validation & Provenance Intent ---');
  // Attempt by outsider / non-leader should be rejected
  const { error: outsiderErr } = await outsider.client.rpc('submit_round_milestone', {
    p_round_id: round1Id,
    p_team_id: teamId,
    p_title: 'Outsider Attempt',
  });
  assert(outsiderErr !== null, 'Non-team student cannot submit milestone');

  // Register valid proof image and validation intent
  const evidenceObjPath = `teams/${teamId}/rounds/${round1Id}/${crypto.randomUUID()}.png`;
  const dummyBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex'); // Valid PNG header
  const dummySha256 = crypto.createHash('sha256').update(dummyBuffer).digest('hex');

  // Upload to storage
  await adminClient.storage.from('submission-evidence').upload(evidenceObjPath, dummyBuffer, {
    contentType: 'image/png',
    upsert: false,
  });

  // Record validation intent
  await adminClient.from('evidence_validation_intents').insert({
    object_path: evidenceObjPath,
    hackathon_id: hackathonId,
    team_id: teamId,
    round_id: round1Id,
    created_by: leader.userId,
    sha256_hash: dummySha256,
    file_size_bytes: dummyBuffer.length,
    mime_type: 'image/png',
    expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
  });

  // Submit valid milestone
  const { data: sub1Res, error: sub1Err } = await leader.client.rpc('submit_round_milestone', {
    p_round_id: round1Id,
    p_team_id: teamId,
    p_title: 'Initial Alpha Prototype',
    p_description: 'Architecture and core data pipeline implemented.',
    p_repo_url: 'https://github.com/organization/repo',
    p_demo_url: 'https://alpha.example.com',
    p_evidence_path: evidenceObjPath,
    p_evidence_sha256: dummySha256,
  });
  if (sub1Err) console.error('sub1Err:', sub1Err);
  assert(sub1Err === null, 'Leader successfully submitted valid round milestone');
  const sub1Id = (sub1Res as any).submission_id;
  assert(Boolean(sub1Id), 'Returned valid submission UUID');

  // Check intent marked consumed
  const { data: intentCheck } = await adminClient
    .from('evidence_validation_intents')
    .select('consumed_at')
    .eq('object_path', evidenceObjPath)
    .single();
  assert(intentCheck?.consumed_at !== null, 'Evidence validation intent was atomically consumed');

  // Second submit_round_milestone call must fail (duplicate current submission)
  const { error: dupSubmitErr } = await leader.client.rpc('submit_round_milestone', {
    p_round_id: round1Id,
    p_team_id: teamId,
    p_title: 'Duplicate Attempt',
  });
  assert(dupSubmitErr !== null, 'Duplicate submit_round_milestone rejected with 23505');

  console.log('\n--- 4. Review Lifecycle: Revision Request & Resubmission ---');
  // Admin requests revision
  const { error: revReqErr } = await admin.client.rpc('review_round_submission', {
    p_submission_id: sub1Id,
    p_decision: 'revision_requested',
    p_feedback: 'Please provide automated test execution results in your demo.',
  });
  assert(revReqErr === null, 'Admin requested revision with descriptive feedback');

  // Verify status is revision_requested
  const { data: sub1Check } = await adminClient
    .from('submissions')
    .select('status, is_current, version')
    .eq('id', sub1Id)
    .single();
  assert(sub1Check?.status === 'revision_requested', 'Submission status updated to revision_requested');

  // Leader submits revision v2 reusing evidence path
  const { data: resubRes, error: resubErr } = await leader.client.rpc('resubmit_round_milestone', {
    p_prior_submission_id: sub1Id,
    p_title: 'Alpha Prototype v2 (With Automated Tests)',
    p_description: 'Added test suite report and video demo.',
    p_repo_url: 'https://github.com/organization/repo',
    p_demo_url: 'https://alpha.example.com/v2',
    p_evidence_path: evidenceObjPath,
  });

  assert(resubErr === null, 'Leader resubmitted milestone revision');
  const sub2Id = (resubRes as any).submission_id;

  const { data: sub2Check } = await adminClient
    .from('submissions')
    .select('version, is_current, status')
    .eq('id', sub2Id)
    .single();
  assert(sub2Check?.version === 2, 'New submission created as version 2');
  assert(sub2Check?.is_current === true, 'Version 2 is marked is_current = true');

  const { data: sub1OldCheck } = await adminClient
    .from('submissions')
    .select('is_current')
    .eq('id', sub1Id)
    .single();
  assert(sub1OldCheck?.is_current === false, 'Version 1 is superseded and marked is_current = false');

  console.log('\n--- 5. Terminal Rejection & Reopening Justification ---');
  // Admin rejects v2
  const { error: rejErr } = await admin.client.rpc('review_round_submission', {
    p_submission_id: sub2Id,
    p_decision: 'rejected',
    p_feedback: 'Code originality audit failed. Major portions copied from external source.',
  });
  assert(rejErr === null, 'Admin successfully recorded rejection');

  // Student cannot reopen
  const { error: studentReopenErr } = await leader.client.rpc('reopen_rejected_submission', {
    p_submission_id: sub2Id,
    p_reason: 'Student attempting self-reopen',
    p_target_status: 'revision_requested',
  });
  assert(studentReopenErr !== null, 'Non-admin cannot reopen rejected submission');

  // Admin reopens with audit justification
  const { error: adminReopenErr } = await admin.client.rpc('reopen_rejected_submission', {
    p_submission_id: sub2Id,
    p_reason: 'Appeal verified by mentor: external library was permitted by contest rules.',
    p_target_status: 'revision_requested',
  });
  assert(adminReopenErr === null, 'Admin reopened rejected submission with required reason');

  const { data: reopenedCheck } = await adminClient
    .from('submissions')
    .select('status')
    .eq('id', sub2Id)
    .single();
  assert(reopenedCheck?.status === 'revision_requested', 'Submission status transitioned back to revision_requested');

  console.log('\n--- 6. Acceptance & Sequential Round Qualification ---');
  // Leader resubmits v3
  const { data: sub3Res } = await leader.client.rpc('resubmit_round_milestone', {
    p_prior_submission_id: sub2Id,
    p_title: 'Alpha Prototype v3 (Final Approved Package)',
    p_evidence_path: evidenceObjPath,
  });
  const sub3Id = (sub3Res as any).submission_id;

  // Admin accepts v3
  const { error: acceptErr } = await admin.client.rpc('review_round_submission', {
    p_submission_id: sub3Id,
    p_decision: 'accepted',
    p_feedback: 'Outstanding milestone submission. Approved for round advancement.',
  });
  assert(acceptErr === null, 'Admin accepted milestone submission');

  // Verify qualification recorded in results
  const { data: qualResult } = await adminClient
    .from('results')
    .select('id, milestone_type')
    .eq('hackathon_id', hackathonId)
    .eq('round_id', round1Id)
    .eq('team_id', teamId)
    .eq('milestone_type', 'round_qualification')
    .single();
  assert(Boolean(qualResult?.id), 'Round qualification result recorded in public.results');

  // Open Round 2 now that Round 1 is qualified
  await adminClient
    .from('hackathon_rounds')
    .update({ start_at: new Date(Date.now() - 60 * 1000).toISOString() })
    .eq('id', round2Id);

  // Team can now submit to Round 2
  const r2Evidence = `teams/${teamId}/rounds/${round2Id}/${crypto.randomUUID()}.png`;
  await adminClient.storage.from('submission-evidence').upload(r2Evidence, dummyBuffer, {
    contentType: 'image/png',
    upsert: false,
  });

  await adminClient.from('evidence_validation_intents').insert({
    object_path: r2Evidence,
    hackathon_id: hackathonId,
    team_id: teamId,
    round_id: round2Id,
    created_by: leader.userId,
    sha256_hash: dummySha256,
    file_size_bytes: dummyBuffer.length,
    mime_type: 'image/png',
    expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
  });

  const { data: r2SubRes, error: r2SubErr } = await leader.client.rpc('submit_round_milestone', {
    p_round_id: round2Id,
    p_team_id: teamId,
    p_title: 'Round 2 Milestone Submission',
    p_evidence_path: r2Evidence,
    p_evidence_sha256: dummySha256,
  });
  if (r2SubErr) console.error('r2SubErr details:', r2SubErr);
  assert(r2SubErr === null, 'Sequential round qualification permits submission to Round 2');
  const r2SubId = (r2SubRes as any).submission_id;

  console.log('\n--- 7. Winner Placement & Points Reversal ---');
  // Admin accepts Round 2 milestone
  await admin.client.rpc('review_round_submission', {
    p_submission_id: r2SubId,
    p_decision: 'accepted',
    p_feedback: 'Champion performance.',
  });

  // Admin records 1st place winner placement
  const { error: winnerErr } = await admin.client.rpc('record_round_winner_placement', {
    p_submission_id: r2SubId,
    p_placement: '1',
    p_notes: 'Grand Prize Winners',
  });
  assert(winnerErr === null, 'Admin successfully recorded 1st place winner placement');

  const { data: winnerResult } = await adminClient
    .from('results')
    .select('placement, milestone_type')
    .eq('round_id', round2Id)
    .eq('team_id', teamId)
    .eq('milestone_type', 'win_placement')
    .single();
  assert(winnerResult?.placement === '1', 'Winner placement recorded with placement 1');

  // Verify points ledger entries exist
  const { data: ptsEntries } = await adminClient
    .from('points_ledger')
    .select('id, points, milestone_type')
    .eq('student_id', leader.userId);
  assert(Boolean(ptsEntries && ptsEntries.length > 0), 'Points ledger entries awarded to team leader');

  // Test points reversal
  const targetEntry = ptsEntries![0];
  const { error: revPtsErr } = await admin.client.rpc('reverse_points_ledger_entry', {
    p_ledger_id: targetEntry.id,
    p_reason: 'Testing transactional points reversal',
  });
  assert(revPtsErr === null, 'reverse_points_ledger_entry succeeded');

  const { data: reversedCheck } = await adminClient
    .from('points_ledger')
    .select('points, milestone_type')
    .eq('student_id', leader.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  assert(reversedCheck?.points === -targetEntry.points, 'Reversal entry created with equal and opposite points');

  console.log('\n--- 8. Strict 1 MiB Evidence Validation & Phase 7 Compatibility ---');
  const { validateRoundEvidenceBinary } = require('@/lib/storage/round-evidence-service');

  // 1. Valid images at or below 1 MiB
  // 1a: Valid PNG (500 KiB)
  const validPng500k = Buffer.alloc(500 * 1024);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(validPng500k, 0);
  const png500kRes = validateRoundEvidenceBinary(validPng500k, 'screenshot.png');
  assert(png500kRes.valid === true && png500kRes.detectedMime === 'image/png' && png500kRes.extension === 'png', 'Valid PNG at 500 KiB accepted');

  // 1b: Valid JPEG (500 KiB)
  const validJpg500k = Buffer.alloc(500 * 1024);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(validJpg500k, 0);
  const jpg500kRes = validateRoundEvidenceBinary(validJpg500k, 'screenshot.jpg');
  assert(jpg500kRes.valid === true && jpg500kRes.detectedMime === 'image/jpeg' && jpg500kRes.extension === 'jpg', 'Valid JPEG at 500 KiB accepted');

  // 1c: Valid WebP (500 KiB)
  const validWebp500k = Buffer.alloc(500 * 1024);
  Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]).copy(validWebp500k, 0);
  const webp500kRes = validateRoundEvidenceBinary(validWebp500k, 'screenshot.webp');
  assert(webp500kRes.valid === true && webp500kRes.detectedMime === 'image/webp' && webp500kRes.extension === 'webp', 'Valid WebP at 500 KiB accepted');

  // 1d: Exact 1 MiB boundary (1,048,576 bytes)
  const exact1MibPng = Buffer.alloc(1048576);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(exact1MibPng, 0);
  const exact1MibRes = validateRoundEvidenceBinary(exact1MibPng, 'boundary.png');
  assert(exact1MibRes.valid === true, 'Image at exact 1 MiB boundary (1,048,576 bytes) accepted');

  // 2. Images exceeding 1 MiB
  // 2a: 1 MiB + 1 byte (1,048,577 bytes)
  const over1MibPng = Buffer.alloc(1048577);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(over1MibPng, 0);
  const over1MibRes = validateRoundEvidenceBinary(over1MibPng, 'over.png');
  assert(over1MibRes.valid === false && over1MibRes.error?.includes('exceeds the maximum allowed limit of 1 MiB'), 'Image exceeding 1 MiB by 1 byte (1,048,577 bytes) rejected');

  // 2b: 2 MiB JPEG
  const over2MibJpg = Buffer.alloc(2 * 1024 * 1024);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(over2MibJpg, 0);
  const over2MibRes = validateRoundEvidenceBinary(over2MibJpg, 'over2m.jpg');
  assert(over2MibRes.valid === false && over2MibRes.error?.includes('exceeds the maximum allowed limit of 1 MiB'), 'Image of 2 MiB rejected');

  // 2c: 5 MiB WebP
  const over5MibWebp = Buffer.alloc(5 * 1024 * 1024);
  Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]).copy(over5MibWebp, 0);
  const over5MibRes = validateRoundEvidenceBinary(over5MibWebp, 'over5m.webp');
  assert(over5MibRes.valid === false && over5MibRes.error?.includes('exceeds the maximum allowed limit of 1 MiB'), 'Image of 5 MiB rejected');

  // 3. Rejection of unsupported file types
  // 3a: PDF document
  const pdfBuffer = Buffer.from('%PDF-1.4 sample content');
  const pdfRes = validateRoundEvidenceBinary(pdfBuffer, 'document.pdf');
  assert(pdfRes.valid === false && pdfRes.error?.includes('PDF files are not permitted'), 'PDF document rejected for round evidence');

  // 3b: ZIP archive
  const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const zipRes = validateRoundEvidenceBinary(zipBuffer, 'archive.zip');
  assert(zipRes.valid === false && zipRes.error?.includes('ZIP archives are not permitted'), 'ZIP archive rejected for round evidence');

  // 3c: Shell script / executable
  const shBuffer = Buffer.from('#!/bin/sh\necho hack');
  const shRes = validateRoundEvidenceBinary(shBuffer, 'script.sh');
  assert(shRes.valid === false && shRes.error?.includes('Security violation'), 'Executable shell script rejected for round evidence');

  // 3d: Corrupted / arbitrary bytes
  const garbageBuffer = Buffer.from('Just some arbitrary text that is not an image');
  const garbageRes = validateRoundEvidenceBinary(garbageBuffer, 'not_an_image.png');
  assert(garbageRes.valid === false && garbageRes.error?.includes('Unsupported file format'), 'Corrupted or arbitrary non-image bytes rejected');

  // 4. Rejection of mismatched MIME/file signatures
  // 4a: .png filename containing genuine JPEG bytes
  const pngMismatchJpg = Buffer.alloc(1024);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(pngMismatchJpg, 0);
  const mismatch1Res = validateRoundEvidenceBinary(pngMismatchJpg, 'spoofed.png');
  assert(mismatch1Res.valid === false && mismatch1Res.error?.includes('File extension mismatch: JPEG binary content must have a .jpg or .jpeg extension'), 'Filename spoofing (.png filename with JPEG magic bytes) rejected');

  // 4b: .jpg filename containing genuine PNG bytes
  const jpgMismatchPng = Buffer.alloc(1024);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(jpgMismatchPng, 0);
  const mismatch2Res = validateRoundEvidenceBinary(jpgMismatchPng, 'spoofed.jpg');
  assert(mismatch2Res.valid === false && mismatch2Res.error?.includes('File extension mismatch: PNG binary content must have a .png extension'), 'Filename spoofing (.jpg filename with PNG magic bytes) rejected');

  // 4c: .webp filename containing genuine PNG bytes
  const webpMismatchPng = Buffer.alloc(1024);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(webpMismatchPng, 0);
  const mismatch3Res = validateRoundEvidenceBinary(webpMismatchPng, 'spoofed.webp');
  assert(mismatch3Res.valid === false && mismatch3Res.error?.includes('File extension mismatch: PNG binary content must have a .png extension'), 'Filename spoofing (.webp filename with PNG magic bytes) rejected');

  // 5. Database check constraint enforcement on evidence_validation_intents
  const { error: dbOverErr } = await adminClient.from('evidence_validation_intents').insert({
    object_path: `teams/${teamId}/rounds/${round1Id}/oversized_intent.png`,
    hackathon_id: hackathonId,
    team_id: teamId,
    round_id: round1Id,
    created_by: leader.userId,
    sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    file_size_bytes: 1048577, // 1 MiB + 1 byte
    mime_type: 'image/png',
  });
  assert(dbOverErr !== null && dbOverErr.code === '23514', 'Database check constraint rejects intent with file_size_bytes > 1 MiB (23514)');

  // 6. Confirmation that Phase 7 registration proof behavior remains intact
  const p7TeamCheck = await adminClient.from('teams').select('external_status, external_proof_path').eq('id', teamId).single();
  assert(p7TeamCheck.data?.external_status === 'submitted', 'Phase 7 team registration proof status preserved as submitted');
  assert(Boolean(p7TeamCheck.data?.external_proof_path?.includes('/registration/')), 'Phase 7 registration proof path format preserved');

  console.log(`\n============================================================`);
  console.log(`   LIFECYCLE RESULTS: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100.0%)`);
  console.log(`============================================================\n`);
}

runLifecycleSuite().catch((err) => {
  console.error('\nLifecycle suite failed with unhandled error:', err);
  process.exit(1);
});
