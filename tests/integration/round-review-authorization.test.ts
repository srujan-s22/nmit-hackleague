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

async function createAssignedAdmin(superAdminClient: any, prefix: string, permissions: string[] = ['manage_hackathons']) {
  const runHex = crypto.randomBytes(4).toString('hex');
  const email = `admin_${prefix}_${runHex}@nmit-dev.local`;
  const password = 'Password123!';

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin', full_name: `Admin ${prefix}` },
  });

  if (authErr || !authData.user) {
    throw new Error(`Failed to create admin user: ${authErr?.message}`);
  }

  const userId = authData.user.id;

  const { error: provErr } = await superAdminClient.rpc('provision_admin_profile', {
    p_auth_uid: userId,
    p_email: email,
    p_full_name: `Admin ${prefix}`,
    p_permissions: permissions,
  });

  if (provErr) {
    throw new Error(`Failed to provision admin profile: ${provErr?.message}`);
  }

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData.session) {
    throw new Error(`Sign in failed for admin ${email}: ${signInErr?.message}`);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  });

  return { adminId: userId, email, client };
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

async function runAuthorizationSuite() {
  console.log('\n============================================================');
  console.log('   PHASE 8 PENETRATION & AUTHORIZATION TEST SUITE');
  console.log('============================================================');

  console.log('\n--- 1. Setting Up Test Actors & Entities ---');
  const superAdmin = await getSuperAdminClient();
  const assignedAdmin = await createAssignedAdmin(superAdmin.client, 'assigned', ['manage_hackathons']);
  const unassignedAdmin = await createAssignedAdmin(superAdmin.client, 'unassigned', ['manage_hackathons']);
  const leader = await createTestStudent('leader');
  const member = await createTestStudent('member');
  const outsiderStudent = await createTestStudent('outsider');

  // Create Hackathon assigned to assignedAdmin
  const slug = `rnd-auth-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const startAt = new Date(now.getTime() - 3600 * 1000).toISOString();
  const endAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  const { data: hackathon, error: hErr } = await adminClient
    .from('hackathons')
    .insert({
      title: `Phase 8 Auth Hackathon ${slug}`,
      slug,
      description: 'Testing authorization boundaries',
      organizer: 'NMIT Dept of CSE',
      venue: 'Campus Lab',
      eligibility: 'All Engineering Students',
      mode: 'offline',
      status: 'published',
      is_solo_allowed: true,
      min_team_size: 1,
      max_team_size: 4,
      registration_start_at: startAt,
      registration_end_at: endAt,
      event_start_at: startAt,
      event_end_at: endAt,
      in_charge_admin_id: assignedAdmin.adminId,
      created_by: assignedAdmin.adminId,
    })
    .select('id')
    .single();

  if (hErr || !hackathon) throw new Error(`Hackathon creation failed: ${hErr?.message}`);
  const hackathonId = hackathon.id;

  // Assign hackathon explicitly in hackathon_admins
  await adminClient.from('hackathon_admins').insert({
    hackathon_id: hackathonId,
    admin_id: assignedAdmin.adminId,
    role: 'lead_organizer',
  });

  // Create Round 1 (open)
  const { data: round1Data } = await adminClient
    .from('hackathon_rounds')
    .insert({
      hackathon_id: hackathonId,
      round_number: 1,
      name: 'Round 1 Submission',
      status: 'open',
      start_at: startAt,
      end_at: endAt,
    })
    .select('id')
    .single();

  const round1Id = round1Data!.id;
  assert(Boolean(hackathonId && round1Id), 'Test hackathon and open round created');

  // Form Team and register
  const { data: teamRes, error: teamCreateErr } = await leader.client.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: `Team Auth ${slug.slice(0, 10)}`,
  });
  if (teamCreateErr) throw new Error(`create_team failed: ${teamCreateErr.message}`);
  const teamId = typeof teamRes === 'string' ? teamRes : (teamRes as any)?.team_id || (teamRes as any)?.id || '';

  // Add member
  const { data: teamRow } = await adminClient.from('teams').select('invitation_code').eq('id', teamId).single();
  await member.client.rpc('join_team_with_code', { p_invitation_code: teamRow!.invitation_code });

  // Upload registration proof to satisfy external_status
  const regProofPath = `teams/${teamId}/registration/${crypto.randomUUID()}.png`;
  const dummyBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  await adminClient.storage.from('submission-evidence').upload(regProofPath, dummyBuffer, { contentType: 'image/png' });

  const { error: regErr } = await leader.client.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: regProofPath,
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: 'By submitting this screenshot, you confirm that it is genuine, unaltered, and represents your team\'s actual registration on the official hackathon platform. Submitting fake, manipulated, or misleading registration proof may result in strict disciplinary action by the Career Development Centre (CDC), including disqualification from the hackathon and other action under applicable college rules. Your submission may be reviewed, and providing proof does not guarantee acceptance.',
  });
  if (regErr) throw new Error(`submit_registration_proof failed: ${regErr.message}`);

  console.log('\n--- 2. Direct Client RLS Write Denial (AF-15) ---');
  // Attempt direct INSERT on public.submissions by authenticated student
  const { error: directInsertErr } = await leader.client.from('submissions').insert({
    round_id: round1Id,
    team_id: teamId,
    hackathon_id: hackathonId,
    submitted_by: leader.userId,
    title: 'Direct RLS Bypass Attempt',
    is_current: true,
  });
  assert(directInsertErr !== null, 'Direct client INSERT on public.submissions is denied by RLS (AF-15)');

  // Attempt direct UPDATE on public.submissions by authenticated student
  const { error: directUpdateErr } = await leader.client
    .from('submissions')
    .update({ title: 'Hacked Submission' })
    .eq('team_id', teamId);
  assert(directUpdateErr !== null, 'Direct client UPDATE on public.submissions is denied by RLS (AF-15)');

  console.log('\n--- 3. Milestone Submission Role Authorization ---');
  // Non-leader member attempts to submit milestone
  const { error: memberSubErr } = await member.client.rpc('submit_round_milestone', {
    p_round_id: round1Id,
    p_team_id: teamId,
    p_title: 'Unauthorized Member Submission',
  });
  assert(memberSubErr !== null && memberSubErr.code === '42501', 'Member cannot submit milestone (leader role required)');

  // Outsider student attempts to submit milestone
  const { error: outsiderSubErr } = await outsiderStudent.client.rpc('submit_round_milestone', {
    p_round_id: round1Id,
    p_team_id: teamId,
    p_title: 'Outsider Student Submission',
  });
  assert(outsiderSubErr !== null && outsiderSubErr.code === '42501', 'Outsider student cannot submit milestone');

  // Leader submits valid milestone (text-only)
  const { data: subRes, error: subErr } = await leader.client.rpc('submit_round_milestone', {
    p_round_id: round1Id,
    p_team_id: teamId,
    p_title: 'Legitimate Leader Submission',
    p_description: 'Valid prototype details for review evaluation.',
  });
  if (subErr) console.error('subErr details:', subErr);
  assert(subErr === null, 'Leader successfully submitted valid round milestone');
  const submissionId = (subRes as any).submission_id;

  console.log('\n--- 4. Unassigned Admin vs Assigned Admin Review Authorization ---');
  // Unassigned admin attempts review
  const { error: unassignedReviewErr } = await unassignedAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'revision_requested',
    p_feedback: 'Unassigned admin trying to review.',
  });
  assert(
    unassignedReviewErr !== null && unassignedReviewErr.code === '42501',
    'Unassigned admin is denied review authorization (HTTP 403 / 42501)'
  );

  // Super Admin can review submission across any hackathon
  // First test review feedback validation bounds on Super Admin review
  console.log('\n--- 5. Review Feedback Validation Bounds (AF-19) ---');
  // A. Missing feedback on revision_requested
  const { error: noFeedbackErr } = await superAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'revision_requested',
    p_feedback: '',
  });
  assert(noFeedbackErr !== null && noFeedbackErr.code === '22000', 'Revision request requires non-empty feedback (code 22000)');

  // B. Whitespace-only feedback on revision_requested
  const { error: wsFeedbackErr } = await superAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'revision_requested',
    p_feedback: '             ',
  });
  assert(wsFeedbackErr !== null && wsFeedbackErr.code === '22000', 'Whitespace-only feedback is rejected on revision request');

  // C. Short feedback (< 10 non-whitespace chars) on rejection
  const { error: shortFeedbackErr } = await superAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'rejected',
    p_feedback: 'Bad work',
  });
  assert(shortFeedbackErr !== null && shortFeedbackErr.code === '22000', 'Feedback < 10 characters is rejected on rejection');

  // D. Excessively long feedback (> 1000 characters)
  const hugeFeedback = 'A'.repeat(1001);
  const { error: longFeedbackErr } = await superAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'rejected',
    p_feedback: hugeFeedback,
  });
  assert(longFeedbackErr !== null && longFeedbackErr.code === '22000', 'Feedback > 1000 characters is rejected');

  // Assigned admin can review submission with valid feedback
  const { error: assignedReviewErr } = await assignedAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'rejected',
    p_feedback: 'Project does not fulfill technical criteria for this track.',
  });
  assert(assignedReviewErr === null, 'Assigned admin successfully recorded rejection with valid feedback');

  console.log('\n--- 6. Terminal Rejection & Reopening Authorization ---');
  // Student attempts to resubmit a rejected submission directly
  const { error: resubRejectedErr } = await leader.client.rpc('resubmit_round_milestone', {
    p_prior_submission_id: submissionId,
    p_title: 'Trying to bypass terminal rejection',
  });
  assert(
    resubRejectedErr !== null && resubRejectedErr.code === '22023',
    'Student cannot resubmit directly against a rejected submission (terminal rejection enforced)'
  );

  // Student attempts to call reopen_rejected_submission
  const { error: studentReopenErr } = await leader.client.rpc('reopen_rejected_submission', {
    p_submission_id: submissionId,
    p_reason: 'Student trying to reopen their own submission',
    p_target_status: 'revision_requested',
  });
  assert(
    studentReopenErr !== null && studentReopenErr.code === '42501',
    'Student cannot call reopen_rejected_submission (42501)'
  );

  // Admin calls reopen with short reason (< 10 chars)
  const { error: shortReopenErr } = await assignedAdmin.client.rpc('reopen_rejected_submission', {
    p_submission_id: submissionId,
    p_reason: 'Too short',
    p_target_status: 'revision_requested',
  });
  assert(shortReopenErr !== null && shortReopenErr.code === '22000', 'Reopening reason < 10 characters is rejected');

  // Assigned admin reopens rejected submission with valid reason
  const { error: adminReopenErr } = await assignedAdmin.client.rpc('reopen_rejected_submission', {
    p_submission_id: submissionId,
    p_reason: 'Appeal accepted by judging panel upon manual verification.',
    p_target_status: 'revision_requested',
  });
  assert(adminReopenErr === null, 'Assigned admin reopened rejected submission with valid reason');

  // Verify status is now revision_requested
  const { data: reopenedSub } = await adminClient.from('submissions').select('status').eq('id', submissionId).single();
  assert(reopenedSub?.status === 'revision_requested', 'Submission transitioned to revision_requested');

  console.log('\n--- 7. Review Feedback Privacy & Cross-Team Isolation ---');
  // Team leader can view review feedback
  const { data: leaderReviews, error: leaderReviewErr } = await leader.client
    .from('submission_reviews')
    .select('feedback, decision')
    .eq('submission_id', submissionId);
  assert(leaderReviewErr === null && leaderReviews && leaderReviews.length > 0, 'Team leader can view their team review feedback');

  // Outsider student cannot view review feedback of this submission
  const { data: outsiderReviews } = await outsiderStudent.client
    .from('submission_reviews')
    .select('feedback, decision')
    .eq('submission_id', submissionId);
  assert(!outsiderReviews || outsiderReviews.length === 0, 'Outsider student cannot view review feedback of another team');

  console.log('\n--- 8. Review Lifecycle State Matrix Enforcement ---');
  // Reset submission status to 'submitted' to test lifecycle state matrix
  await adminClient.from('submissions').update({ status: 'submitted' }).eq('id', submissionId);

  // 8.1 Round status = 'paused'
  await adminClient.from('hackathon_rounds').update({ status: 'paused' }).eq('id', round1Id);

  const { error: reviewPausedErr } = await assignedAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'accepted',
    p_feedback: 'Valid approval attempt while paused.',
  });
  if (reviewPausedErr) console.error('reviewPausedErr details:', reviewPausedErr);
  assert(reviewPausedErr !== null && reviewPausedErr.code === '55P03', 'Review rejected when round is paused (55P03)');

  // 8.2 Round status = 'completed' (view-only mode)
  await adminClient.from('hackathon_rounds').update({ status: 'completed' }).eq('id', round1Id);

  const { error: reviewCompletedErr } = await assignedAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'accepted',
    p_feedback: 'Review attempt on completed round.',
  });
  assert(
    reviewCompletedErr !== null && reviewCompletedErr.code === '55P03',
    'Review strictly rejected when round is completed (55P03, completed rounds are view-only)'
  );

  // Restore round to open
  await adminClient.from('hackathon_rounds').update({ status: 'open' }).eq('id', round1Id);

  // Acceptance with empty feedback succeeds
  const { error: acceptNoFeedbackErr } = await assignedAdmin.client.rpc('review_round_submission', {
    p_submission_id: submissionId,
    p_decision: 'accepted',
    p_feedback: '',
  });
  assert(acceptNoFeedbackErr === null, 'Acceptance with optional empty feedback succeeds');

  console.log(`\n============================================================`);
  console.log(`   AUTHORIZATION RESULTS: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100.0%)`);
  console.log(`============================================================\n`);
}

runAuthorizationSuite().catch((err) => {
  console.error('\nAuthorization suite failed with unhandled error:', err);
  process.exit(1);
});
