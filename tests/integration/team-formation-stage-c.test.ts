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
import { MANDATORY_CDC_DECLARATION_TEXT } from '../../src/lib/validation/team-schemas';

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
  const usn = `1NT22CS${Math.floor(100 + Math.random() * 899)}`;

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: `Student ${prefix}`,
      usn,
      phone: `+91987${Math.floor(1000000 + Math.random() * 8999999)}`,
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

  // Set registration_status to approved
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

async function createTestHackathon(opts?: { minTeamSize?: number; maxTeamSize?: number; status?: string }) {
  const slug = `phase7-e2e-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date();
  const startAt = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const endAt = new Date(now.getTime() + 14 * 24 * 3600 * 1000).toISOString();

  const { data: saAdmin } = await adminClient
    .from('admin_profiles')
    .select('id')
    .eq('is_super_admin', true)
    .limit(1)
    .single();

  const superAdminId = saAdmin?.id;

  const { data: hackathon, error } = await adminClient
    .from('hackathons')
    .insert({
      title: `E2E Test Hackathon ${slug}`,
      slug,
      description: 'E2E Integration Test Hackathon Description',
      status: opts?.status || 'published',
      mode: 'offline',
      organizer: 'NMIT CSE Department',
      min_team_size: opts?.minTeamSize ?? 2,
      max_team_size: opts?.maxTeamSize ?? 3,
      is_solo_allowed: false,
      registration_start_at: startAt,
      registration_end_at: endAt,
      event_start_at: startAt,
      event_end_at: endAt,
      created_by: superAdminId,
      in_charge_admin_id: superAdminId,
    })
    .select('*')
    .single();

  if (error || !hackathon) {
    throw new Error(`Failed to create hackathon: ${error?.message}`);
  }

  // Create Round 1
  await adminClient.from('hackathon_rounds').insert({
    hackathon_id: hackathon.id,
    round_number: 1,
    name: 'Ideation & Submission',
    start_at: startAt,
    end_at: endAt,
    status: 'open',
  });

  return hackathon;
}

async function runStageDIntegrationTests() {
  console.log('\n============================================================');
  console.log('   NMIT HACKLEAGUE — PHASE 7 STAGE D E2E INTEGRATION SUITE');
  console.log('============================================================\n');

  // 1. Setup Test Actors & Hackathons
  console.log('--- 1. Setting Up Test Actors & Hackathon Environment ---');
  const leader = await createTestStudent('leader_c');
  const member1 = await createTestStudent('member1_c');
  const member2 = await createTestStudent('member2_c');
  const outsider = await createTestStudent('outsider_c');
  const hackathon = await createTestHackathon({ minTeamSize: 2, maxTeamSize: 3 });

  assert(Boolean(leader.userId && member1.userId && hackathon.id), 'Successfully provisioned 4 student actors and 1 hackathon');

  // 2. Team Creation Flow
  console.log('\n--- 2. Team Creation & Initial State ---');
  const { data: createData, error: createErr } = await leader.client.rpc('create_team', {
    p_hackathon_id: hackathon.id,
    p_team_name: 'Alpha Innovators',
  });

  assert(!createErr, 'create_team RPC succeeded for authenticated student leader');
  const teamId = typeof createData === 'string' ? createData : (createData as { team_id?: string })?.team_id || '';
  assert(Boolean(teamId), `Returned valid team UUID: ${teamId}`);

  // Inspect initial team state via admin
  const { data: initialTeam } = await adminClient.from('teams').select('*').eq('id', teamId).single();
  assert(initialTeam?.internal_status === 'forming', 'Initial internal_status is "forming"');
  assert(initialTeam?.external_status === 'not_submitted', 'Initial external_status is "not_submitted"');
  assert(Boolean(initialTeam?.invitation_code && initialTeam.invitation_code.length === 12), 'Generated 12-character invitation code');
  assert(initialTeam?.leader_id === leader.userId, 'Leader is correctly assigned to creating student');

  // Verify leader membership
  const { data: memberships } = await adminClient.from('team_members').select('*').eq('team_id', teamId);
  assert(memberships?.length === 1, 'Initial team roster has exactly 1 member');
  assert(memberships?.[0]?.role === 'leader', 'Creating student has role "leader" in team_members');

  // 3. Invitation Code & Join Team Flow
  console.log('\n--- 3. Joining Team with Invitation Code ---');
  const inviteCode = initialTeam!.invitation_code;

  // Invalid code rejected
  const { error: invalidCodeErr } = await member1.client.rpc('join_team_with_code', {
    p_invitation_code: 'INVALIDCODE1',
  });
  assert(Boolean(invalidCodeErr), 'Invalid invitation code was safely rejected by database');

  // Valid join
  const { data: joinData, error: joinErr } = await member1.client.rpc('join_team_with_code', {
    p_invitation_code: inviteCode,
  });
  assert(!joinErr, 'member1 joined successfully using valid invitation code');
  assert(joinData === teamId || (joinData as { team_id?: string })?.team_id === teamId, 'join_team_with_code returned matching teamId');

  // Verify member1 role is 'member'
  const { data: m1Membership } = await adminClient
    .from('team_members')
    .select('*')
    .eq('team_id', teamId)
    .eq('student_id', member1.userId)
    .single();
  assert(m1Membership?.role === 'member', 'Joined student has role "member"');

  // 4. One-Team-Per-Hackathon Constraint
  console.log('\n--- 4. One-Team-Per-Hackathon Rule Enforcement ---');
  // member1 tries to create another team for same hackathon
  const { error: dupCreateErr } = await member1.client.rpc('create_team', {
    p_hackathon_id: hackathon.id,
    p_team_name: 'Duplicate Squad',
  });
  assert(Boolean(dupCreateErr), 'Student already on a team cannot create a second team for the same hackathon');

  // member1 tries to join same team again
  const { error: dupJoinErr } = await member1.client.rpc('join_team_with_code', {
    p_invitation_code: inviteCode,
  });
  assert(Boolean(dupJoinErr), 'Student already on a team cannot join again');

  // 5. Team Capacity Enforcement (max_team_size = 3)
  console.log('\n--- 5. Team Capacity Constraints ---');
  // member2 joins (now at capacity: leader, member1, member2 = 3)
  const { error: m2JoinErr } = await member2.client.rpc('join_team_with_code', {
    p_invitation_code: inviteCode,
  });
  assert(!m2JoinErr, 'member2 joined team, bringing roster size to max (3)');

  // outsider tries to join full team
  const { error: overflowErr } = await outsider.client.rpc('join_team_with_code', {
    p_invitation_code: inviteCode,
  });
  assert(Boolean(overflowErr), 'Team exceeding max_team_size correctly rejected additional join attempt');

  // 6. Member Removal & Authorization Boundary
  console.log('\n--- 6. Member Removal & Authorization Check ---');
  // outsider tries to remove member2 -> unauthorized
  const { error: unauthorizedRemoveErr } = await outsider.client.rpc('remove_team_member', {
    p_team_id: teamId,
    p_student_id: member2.userId,
  });
  assert(Boolean(unauthorizedRemoveErr), 'Outsider cannot remove team member');

  // member1 (regular member) tries to remove member2 -> unauthorized
  const { error: memberRemoveErr } = await member1.client.rpc('remove_team_member', {
    p_team_id: teamId,
    p_student_id: member2.userId,
  });
  assert(Boolean(memberRemoveErr), 'Regular team member cannot remove another team member (leader-only)');

  // leader removes member2 -> authorized
  const { error: leaderRemoveErr } = await leader.client.rpc('remove_team_member', {
    p_team_id: teamId,
    p_student_id: member2.userId,
  });
  assert(!leaderRemoveErr, 'Team leader successfully removed unconfirmed member2 during forming phase');

  // Verify member count is now 2
  const { count: postRemoveCount } = await adminClient
    .from('team_members')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);
  assert(postRemoveCount === 2, 'Roster count decreased to 2 after removal');

  // 7. Invitation Code Regeneration Flow
  console.log('\n--- 7. Invitation Code Regeneration ---');
  // member1 tries to regenerate code -> rejected
  const { error: memberRegenErr } = await member1.client.rpc('regenerate_team_invitation_code', {
    p_team_id: teamId,
  });
  assert(Boolean(memberRegenErr), 'Ordinary member cannot regenerate team invitation code (leader-only)');

  // leader regenerates code
  const { data: newCodeData, error: leaderRegenErr } = await leader.client.rpc('regenerate_team_invitation_code', {
    p_team_id: teamId,
  });
  assert(!leaderRegenErr, 'Leader successfully regenerated invitation code');
  const newCode = typeof newCodeData === 'string' ? newCodeData : (newCodeData as { invitation_code?: string })?.invitation_code || '';
  assert(Boolean(newCode && newCode !== inviteCode), 'New code is distinct from previous code');

  // Old code cannot be used by member2
  const { error: oldCodeErr } = await member2.client.rpc('join_team_with_code', {
    p_invitation_code: inviteCode,
  });
  assert(Boolean(oldCodeErr), 'Old revoked invitation code is rejected');

  // New code works for member2
  const { error: newCodeJoinErr } = await member2.client.rpc('join_team_with_code', {
    p_invitation_code: newCode,
  });
  assert(!newCodeJoinErr, 'New invitation code successfully accepted for member2 rejoining');

  // 8. Leadership Transfer Flow
  console.log('\n--- 8. Leadership Transfer ---');
  // outsider tries to transfer leadership -> rejected
  const { error: outsiderTransferErr } = await outsider.client.rpc('transfer_team_leadership', {
    p_team_id: teamId,
    p_new_leader_id: member1.userId,
  });
  assert(Boolean(outsiderTransferErr), 'Unauthorized user cannot transfer leadership');

  // member1 tries to transfer leadership -> rejected
  const { error: memberTransferErr } = await member1.client.rpc('transfer_team_leadership', {
    p_team_id: teamId,
    p_new_leader_id: member2.userId,
  });
  assert(Boolean(memberTransferErr), 'Non-leader cannot transfer team leadership');

  // leader transfers to member1
  const { error: leaderTransferErr } = await leader.client.rpc('transfer_team_leadership', {
    p_team_id: teamId,
    p_new_leader_id: member1.userId,
  });
  assert(!leaderTransferErr, 'Current leader successfully transferred leadership to member1');

  // Verify leader in DB
  const { data: updatedTeam } = await adminClient.from('teams').select('leader_id').eq('id', teamId).single();
  assert(updatedTeam?.leader_id === member1.userId, 'teams.leader_id updated to member1');

  // Verify roles in team_members
  const { data: newLeaderMember } = await adminClient
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('student_id', member1.userId)
    .single();
  assert(newLeaderMember?.role === 'leader', 'member1 role in team_members transitioned to "leader"');

  const { data: oldLeaderMember } = await adminClient
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('student_id', leader.userId)
    .single();
  assert(oldLeaderMember?.role === 'member', 'Former leader role in team_members transitioned to "member"');

  // Transfer back to original leader for remainder of tests
  await member1.client.rpc('transfer_team_leadership', {
    p_team_id: teamId,
    p_new_leader_id: leader.userId,
  });

  // 9. Roster Locking Flow
  console.log('\n--- 9. Roster Locking & Formation Finalization ---');
  // Non-leader member2 tries to lock -> rejected
  const { error: memberLockErr } = await member2.client.rpc('lock_team_roster', {
    p_team_id: teamId,
  });
  assert(Boolean(memberLockErr), 'Ordinary member cannot lock team roster (leader-only)');

  // Leader locks roster (team has 3 members >= min 2)
  const { error: lockErr } = await leader.client.rpc('lock_team_roster', {
    p_team_id: teamId,
  });
  assert(!lockErr, 'Leader successfully locked team roster');

  const { data: lockedTeam } = await adminClient.from('teams').select('internal_status').eq('id', teamId).single();
  assert(lockedTeam?.internal_status === 'complete', 'teams.internal_status transitioned to "complete"');

  // After lock: no new members can join
  const { error: postLockJoinErr } = await outsider.client.rpc('join_team_with_code', {
    p_invitation_code: newCode,
  });
  assert(Boolean(postLockJoinErr), 'No new members can join once roster is locked (internal_status = complete)');

  // After lock: members cannot leave
  const { error: postLockLeaveErr } = await member2.client.rpc('leave_team', {
    p_team_id: teamId,
  });
  assert(Boolean(postLockLeaveErr), 'Members cannot leave after roster is locked');

  // After lock: leader cannot remove members
  const { error: postLockRemoveErr } = await leader.client.rpc('remove_team_member', {
    p_team_id: teamId,
    p_student_id: member2.userId,
  });
  assert(Boolean(postLockRemoveErr), 'Leader cannot remove members after roster is locked');

  // 10. Registration Proof Authorization & Storage Safety
  console.log('\n--- 10. Registration Proof Authorization & Submission ---');
  // Check can_view_registration_proof RPC
  const { data: leaderCanView } = await leader.client.rpc('can_view_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(Boolean(leaderCanView), 'Team leader has authorized access to registration proof preview');

  const { data: memberCanView } = await member1.client.rpc('can_view_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(Boolean(memberCanView), 'Team member has authorized access to registration proof preview');

  const { data: outsiderCanView } = await outsider.client.rpc('can_view_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(!outsiderCanView, 'Outsider student is denied registration proof view authorization');

  // Outsider tries to call submit_registration_proof -> rejected
  const fakeProofPath = `teams/${teamId}/registration/${crypto.randomUUID()}.png`;
  const { error: outsiderProofErr } = await outsider.client.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: fakeProofPath,
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: MANDATORY_CDC_DECLARATION_TEXT,
  });
  assert(Boolean(outsiderProofErr), 'Outsider student cannot submit registration proof for another team');

  // Leader submits registration proof with authentic declaration
  const validProofPath = `teams/${teamId}/registration/${crypto.randomUUID()}.png`;
  // First upload dummy object to submission-evidence bucket via admin
  await adminClient.storage.from('submission-evidence').upload(validProofPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
    contentType: 'image/png',
  });

  const { data: submitRes, error: submitErr } = await leader.client.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: validProofPath,
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: MANDATORY_CDC_DECLARATION_TEXT,
  });
  if (submitErr) {
    console.error('submit_registration_proof error:', submitErr);
  }
  assert(!submitErr, 'Leader successfully submitted registration proof via authenticated RPC');
  assert(Boolean(submitRes?.success), 'submit_registration_proof returned success');

  // Verify external_status is 'submitted'
  const { data: submittedTeam } = await adminClient.from('teams').select('external_status, external_proof_path').eq('id', teamId).single();
  assert(submittedTeam?.external_status === 'submitted', 'teams.external_status updated to "submitted"');
  assert(submittedTeam?.external_proof_path === validProofPath, 'teams.external_proof_path stored correctly');

  // 11. Storage Boundary & Signed URL Isolation
  console.log('\n--- 11. Private Storage Boundary & URL Isolation ---');
  // Attempt to download proof without session via public URL
  const { data: publicUrlData } = adminClient.storage.from('submission-evidence').getPublicUrl(validProofPath);
  const fetchRes = await fetch(publicUrlData.publicUrl);
  assert(fetchRes.status !== 200, `Direct public URL to private bucket object denied (status: ${fetchRes.status})`);

  // Clean up test proof
  await adminClient.storage.from('submission-evidence').remove([validProofPath]);

  // Clean up test data
  console.log('\n--- 12. Teardown & Environment Cleanup ---');
  await adminClient.from('team_members').delete().eq('team_id', teamId);
  await adminClient.from('teams').delete().eq('id', teamId);
  await adminClient.from('hackathon_rounds').delete().eq('hackathon_id', hackathon.id);
  await adminClient.from('hackathons').delete().eq('id', hackathon.id);
  await adminClient.auth.admin.deleteUser(leader.userId);
  await adminClient.auth.admin.deleteUser(member1.userId);
  await adminClient.auth.admin.deleteUser(member2.userId);
  await adminClient.auth.admin.deleteUser(outsider.userId);

  console.log('\n============================================================');
  console.log(`   STAGE D E2E RESULTS: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (${((passedAssertions / totalAssertions) * 100).toFixed(1)}%)`);
  console.log('============================================================\n');

  if (passedAssertions !== totalAssertions) {
    process.exit(1);
  }
}

runStageDIntegrationTests().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
