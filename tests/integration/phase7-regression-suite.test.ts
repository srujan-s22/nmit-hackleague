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

async function runPhase7RegressionSuite() {
  console.log('\n============================================================');
  console.log('   PHASE 7 REGRESSION VERIFICATION SUITE');
  console.log('============================================================');

  console.log('\n--- 1. Setting Up Test Actors & Event ---');
  const superAdmin = await getSuperAdminClient();
  const leader = await createTestStudent('p7_ldr');
  const member = await createTestStudent('p7_mbr');

  const slug = `p7-reg-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const startAt = new Date(now.getTime() - 3600 * 1000).toISOString();
  const endAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  const { data: hackathon, error: hErr } = await adminClient
    .from('hackathons')
    .insert({
      title: `Phase 7 Regression Hackathon ${slug}`,
      slug,
      description: 'Phase 7 full regression verification',
      organizer: 'NMIT Student Club',
      venue: 'Lab 3',
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
      name: 'Round 1 Submission',
      status: 'open',
      start_at: startAt,
      end_at: endAt,
    })
    .select('id')
    .single();
  const roundId = roundData!.id;
  assert(Boolean(hackathonId && roundId), 'Hackathon and Round 1 created');

  console.log('\n--- 2. Phase 7 Team Formation & Membership Workflows ---');
  // 2.1 create_team
  const { data: teamRes, error: teamErr } = await leader.client.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: `Team P7 Reg ${slug.slice(0, 8)}`,
  });
  assert(teamErr === null, 'create_team succeeded');
  const teamId = typeof teamRes === 'string' ? teamRes : (teamRes as any)?.team_id || (teamRes as any)?.id || '';
  assert(Boolean(teamId), 'Valid team UUID returned');

  // Verify leader role
  const { data: tmRows } = await adminClient
    .from('team_members')
    .select('student_id, role')
    .eq('team_id', teamId);
  assert(tmRows !== null && tmRows.length === 1, 'Initial team roster contains 1 member');
  assert(tmRows![0].student_id === leader.userId && tmRows![0].role === 'leader', 'Creating student is assigned leader role');

  // 2.2 join_team_with_code
  const { data: teamRow } = await adminClient.from('teams').select('invitation_code').eq('id', teamId).single();
  const { error: joinErr } = await member.client.rpc('join_team_with_code', {
    p_invitation_code: teamRow!.invitation_code,
  });
  assert(joinErr === null, 'join_team_with_code succeeded for second member');

  const { data: updatedRoster } = await adminClient
    .from('team_members')
    .select('student_id, role')
    .eq('team_id', teamId);
  assert(updatedRoster !== null && updatedRoster.length === 2, 'Roster count incremented to 2');

  // 2.3 lock_team_roster
  const { error: lockErr } = await leader.client.rpc('lock_team_roster', {
    p_team_id: teamId,
  });
  assert(lockErr === null, 'lock_team_roster succeeded for team leader');

  const { data: lockedTeam } = await adminClient.from('teams').select('internal_status').eq('id', teamId).single();
  assert(lockedTeam?.internal_status === 'complete', 'Team internal_status transitioned to complete');

  console.log('\n--- 3. Phase 7 Registration Proof Upload & CDC Declaration ---');
  const proofPath = `teams/${teamId}/registration/${crypto.randomUUID()}.png`;
  const dummyBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  await adminClient.storage.from('submission-evidence').upload(proofPath, dummyBuffer, { contentType: 'image/png' });

  // Tampered CDC declaration rejected
  const { error: tamperedCdcErr } = await leader.client.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: proofPath,
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: 'Invalid or altered declaration text',
  });
  assert(tamperedCdcErr !== null, 'Tampered or mismatched CDC declaration rejected');

  // Valid CDC declaration accepted
  const { error: validProofErr } = await leader.client.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: proofPath,
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: 'By submitting this screenshot, you confirm that it is genuine, unaltered, and represents your team\'s actual registration on the official hackathon platform. Submitting fake, manipulated, or misleading registration proof may result in strict disciplinary action by the Career Development Centre (CDC), including disqualification from the hackathon and other action under applicable college rules. Your submission may be reviewed, and providing proof does not guarantee acceptance.',
  });
  assert(validProofErr === null, 'submit_registration_proof succeeded with genuine CDC declaration');

  const { data: submittedTeam } = await adminClient
    .from('teams')
    .select('external_status, external_proof_path')
    .eq('id', teamId)
    .single();
  assert(submittedTeam?.external_status === 'submitted', 'Team external_status transitioned to submitted');
  assert(submittedTeam?.external_proof_path === proofPath, 'Stored external_proof_path matches uploaded path');

  console.log('\n--- 4. Phase 7 Participation Points Awarding ---');
  const { data: leaderPoints } = await adminClient
    .from('points_ledger')
    .select('points, milestone_type, role_at_award')
    .eq('student_id', leader.userId)
    .eq('milestone_type', 'participation')
    .single();
  assert(leaderPoints !== null && leaderPoints.points > 0, 'Team leader awarded participation points');
  assert(leaderPoints?.role_at_award === 'leader', 'Leader participation points recorded with role_at_award = leader');

  const { data: memberPoints } = await adminClient
    .from('points_ledger')
    .select('points, milestone_type, role_at_award')
    .eq('student_id', member.userId)
    .eq('milestone_type', 'participation')
    .single();
  assert(memberPoints !== null && memberPoints.points > 0, 'Team member awarded participation points');
  assert(memberPoints?.role_at_award === 'member', 'Member participation points recorded with role_at_award = member');

  console.log(`\n============================================================`);
  console.log(`   PHASE 7 REGRESSION RESULTS: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100.0%)`);
  console.log(`============================================================\n`);
}

runPhase7RegressionSuite().catch((err) => {
  console.error('\nPhase 7 regression suite failed with unhandled error:', err);
  process.exit(1);
});
