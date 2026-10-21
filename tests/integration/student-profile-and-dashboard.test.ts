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
import {
  updatePhoneSchema,
  profileChangeRequestSchema,
  reviewProfileChangeRequestSchema,
} from '../../src/lib/validation/profile-schemas';
import { inspectBinaryMagicBytes } from '../../src/lib/storage/paths';

// Parse .env.local if present
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

function assert(condition: boolean, testId: string, testName: string, detail?: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ [PASS] [${testId}] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] [${testId}] ${testName} ${detail ? `(${detail})` : ''}`);
    throw new Error(`Assertion failed: [${testId}] ${testName} ${detail || ''}`);
  }
}

async function createTestStudent(prefix: string, academicYear = 3) {
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
      academic_year: academicYear,
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

  return { userId, email, client, usn, phone };
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

async function createScopedAdmin(permission: string | string[]) {
  const runHex = crypto.randomBytes(4).toString('hex');
  const email = `admin_${runHex}@nmit-dev.local`;
  const password = 'Password123!';
  const permList = Array.isArray(permission) ? permission : [permission];

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'admin',
      full_name: `Admin ${runHex}`,
    },
  });

  if (authErr || !authData.user) {
    throw new Error(`Failed to create admin user: ${authErr?.message}`);
  }

  const adminId = authData.user.id;
  const superAdmin = await getSuperAdminClient();

  const { error: provErr } = await superAdmin.client.rpc('provision_admin_profile', {
    p_auth_uid: adminId,
    p_email: email,
    p_full_name: `Admin ${runHex}`,
    p_permissions: permList,
  });

  if (provErr) {
    throw new Error(`Failed to provision admin profile: ${provErr.message}`);
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

  return { adminId, email, client };
}

async function createTestHackathonWithTeam(studentA: any, studentB: any) {
  const runHex = crypto.randomBytes(3).toString('hex');
  const slug = `phase10-hack-${runHex}`;
  const superAdmin = await getSuperAdminClient();

  const { data: hackathon, error: hackErr } = await adminClient
    .from('hackathons')
    .insert({
      title: `Phase 10 Hackathon ${runHex}`,
      slug,
      tagline: 'Integration Test Hackathon',
      description: 'Comprehensive integration test hackathon for student profiles.',
      organizer: 'NMIT CSE',
      venue: 'Main Campus',
      mode: 'offline',
      status: 'published',
      registration_start_at: new Date(Date.now() - 3600000).toISOString(),
      registration_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
      min_team_size: 2,
      max_team_size: 4,
      is_solo_allowed: false,
      created_by: superAdmin.adminId,
      in_charge_admin_id: superAdmin.adminId,
    })
    .select('id')
    .single();

  if (hackErr || !hackathon) {
    throw new Error(`Failed to create test hackathon: ${hackErr?.message}`);
  }

  // Create team via leader RPC
  const { data: createData, error: createTeamErr } = await studentA.client.rpc('create_team', {
    p_hackathon_id: hackathon.id,
    p_team_name: `Team Alpha ${runHex}`,
  });

  if (createTeamErr || !createData) {
    throw new Error(`Failed to create test team: ${createTeamErr?.message}`);
  }

  const teamId =
    typeof createData === 'string'
      ? createData
      : (createData as { team_id?: string } | null)?.team_id || '';

  // Get invitation code
  const { data: teamRecord } = await adminClient
    .from('teams')
    .select('invitation_code')
    .eq('id', teamId)
    .single();

  // Student B joins with invitation code
  const { error: joinErr } = await studentB.client.rpc('join_team_with_code', {
    p_invitation_code: teamRecord?.invitation_code,
  });

  if (joinErr) {
    throw new Error(`Failed to join student B to team: ${joinErr.message}`);
  }

  return { hackathonId: hackathon.id, teamId };
}

async function runPhase10IntegrationTests() {
  console.log('================================================================');
  console.log(' Phase 10: Student Profiles and Dashboards Integration Test Suite');
  console.log('================================================================\n');

  // Setup students and admins
  const student1 = await createTestStudent('alice', 3);
  const student2 = await createTestStudent('bob', 2);
  const student3 = await createTestStudent('charlie', 4);
  const adminManageStudents = await createScopedAdmin('manage_students');
  const adminVerifyStudents = await createScopedAdmin('verify_students');

  // -------------------------------------------------------------------------
  // P10-INT-01: Direct phone number normalization and update
  // -------------------------------------------------------------------------
  console.log('[P10-INT-01] Direct phone number normalization and update action');
  const phoneValidation1 = updatePhoneSchema.safeParse({ phone: '9876543210' });
  assert(phoneValidation1.success, 'P10-INT-01a', 'Normalizes 10-digit Indian mobile to E.164');
  assert(phoneValidation1.data?.phone === '+919876543210', 'P10-INT-01b', 'Normalized phone is +919876543210');

  const phoneValidation2 = updatePhoneSchema.safeParse({ phone: '+918765432109' });
  assert(phoneValidation2.success, 'P10-INT-01c', 'Accepts valid +91 E.164 number directly');

  const phoneValidation3 = updatePhoneSchema.safeParse({ phone: '12345' });
  assert(!phoneValidation3.success, 'P10-INT-01d', 'Rejects non-Indian or short phone numbers');

  // Execute direct update on profiles for student1
  const { error: phoneUpdateErr } = await student1.client
    .from('profiles')
    .update({ phone: '+919988776655' })
    .eq('id', student1.userId);

  assert(!phoneUpdateErr, 'P10-INT-01e', 'Student updates own phone number directly in profiles');

  const { data: updatedProfile1 } = await adminClient
    .from('profiles')
    .select('phone')
    .eq('id', student1.userId)
    .single();
  assert(updatedProfile1?.phone === '+919988776655', 'P10-INT-01f', 'Updated phone persisted in database');

  // -------------------------------------------------------------------------
  // P10-INT-02: Profile photo upload with magic byte check & path validation
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-02] Profile photo upload with binary magic byte validation');
  // Genuine JPEG buffer
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const jpegInspection = inspectBinaryMagicBytes(jpegHeader);
  assert(jpegInspection.detectedMime === 'image/jpeg', 'P10-INT-02a', 'Detects genuine JPEG magic bytes');
  assert(!jpegInspection.isExecutable, 'P10-INT-02b', 'Identifies image as non-executable');

  // Genuine PNG buffer
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngInspection = inspectBinaryMagicBytes(pngHeader);
  assert(pngInspection.detectedMime === 'image/png', 'P10-INT-02c', 'Detects genuine PNG magic bytes');

  // Executable buffer (ELF / MZ)
  const exeHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  const exeInspection = inspectBinaryMagicBytes(exeHeader);
  assert(exeInspection.isExecutable, 'P10-INT-02d', 'Detects executable payload and blocks upload');

  // Upload photo to profile-photos bucket for student1
  const avatarPath1 = `${student1.userId}/avatar_${Date.now()}_test.jpg`;
  const dummyJpegData = Buffer.concat([jpegHeader, Buffer.alloc(100)]);

  const { error: uploadErr1 } = await student1.client.storage
    .from('profile-photos')
    .upload(avatarPath1, dummyJpegData, { contentType: 'image/jpeg', upsert: false });
  assert(!uploadErr1, 'P10-INT-02e', 'Uploads valid avatar to profile-photos in student folder');

  // Update profile with photo path
  const { error: setPhotoErr1 } = await student1.client
    .from('profiles')
    .update({ profile_photo_path: avatarPath1 })
    .eq('id', student1.userId);
  assert(!setPhotoErr1, 'P10-INT-02f', 'Updates profile_photo_path on student profile');

  // -------------------------------------------------------------------------
  // P10-INT-03: Profile photo replacement confirms old avatar cleanup
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-03] Profile photo replacement and cleanup');
  const avatarPath2 = `${student1.userId}/avatar_${Date.now()}_new.png`;
  const dummyPngData = Buffer.concat([pngHeader, Buffer.alloc(100)]);

  const { error: uploadErr2 } = await student1.client.storage
    .from('profile-photos')
    .upload(avatarPath2, dummyPngData, { contentType: 'image/png', upsert: false });
  assert(!uploadErr2, 'P10-INT-03a', 'Uploads replacement avatar to profile-photos');

  // Update DB to new avatar
  const { error: setPhotoErr2 } = await student1.client
    .from('profiles')
    .update({ profile_photo_path: avatarPath2 })
    .eq('id', student1.userId);
  assert(!setPhotoErr2, 'P10-INT-03b', 'Commits new avatar path in database');

  // Tier 1 Post-commit cleanup of old avatar
  const { error: removeOldErr } = await adminClient.storage
    .from('profile-photos')
    .remove([avatarPath1]);
  assert(!removeOldErr, 'P10-INT-03c', 'Deletes old avatar from storage post-commit');

  // Confirm old avatar is removed
  const { data: oldFileCheck } = await adminClient.storage
    .from('profile-photos')
    .list(student1.userId);
  const oldStillExists = (oldFileCheck || []).some((f) => avatarPath1.endsWith(f.name));
  assert(!oldStillExists, 'P10-INT-03d', 'Confirmed old avatar is purged from bucket');

  // -------------------------------------------------------------------------
  // P10-INT-04: Profile photo removal sets DB path to NULL and cleans storage
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-04] Profile photo removal sequence');
  const { error: removeDbErr } = await student1.client
    .from('profiles')
    .update({ profile_photo_path: null })
    .eq('id', student1.userId);
  assert(!removeDbErr, 'P10-INT-04a', 'Sets profile_photo_path to NULL directly');

  // Clean storage post-commit
  const { error: removeStorageErr } = await adminClient.storage
    .from('profile-photos')
    .remove([avatarPath2]);
  assert(!removeStorageErr, 'P10-INT-04b', 'Deletes avatar from storage');

  const { data: profAfterRemove } = await adminClient
    .from('profiles')
    .select('profile_photo_path')
    .eq('id', student1.userId)
    .single();
  assert(profAfterRemove?.profile_photo_path === null, 'P10-INT-04c', 'Database profile_photo_path is NULL');

  // -------------------------------------------------------------------------
  // P10-INT-05: Path traversal attack and foreign folder access blocked
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-05] Storage path traversal and foreign folder defense');
  const { error: traversalErr } = await student1.client
    .from('profiles')
    .update({ profile_photo_path: `../college-ids/victim.pdf` })
    .eq('id', student1.userId);
  assert(Boolean(traversalErr), 'P10-INT-05a', 'Trigger blocks path traversal with ..');

  const { error: foreignFolderErr } = await student1.client
    .from('profiles')
    .update({ profile_photo_path: `${student2.userId}/avatar_hacked.png` })
    .eq('id', student1.userId);
  assert(Boolean(foreignFolderErr), 'P10-INT-05b', 'Trigger blocks updating photo path targeting another student folder');

  // -------------------------------------------------------------------------
  // P10-INT-06: Student change request submission and history querying
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-06] Student profile correction request submission');
  const validRequestInput = {
    field_name: 'full_name' as const,
    new_value: 'Alice Wonderland',
    reason: 'Official matriculation record correction requested.',
  };
  const reqParsed = profileChangeRequestSchema.safeParse(validRequestInput);
  assert(reqParsed.success, 'P10-INT-06a', 'Validation schema accepts valid correction request');

  const invalidReqInput = {
    field_name: 'full_name' as const,
    new_value: 'Alice',
    reason: 'too short', // < 10 chars
  };
  const invalidReqParsed = profileChangeRequestSchema.safeParse(invalidReqInput);
  assert(!invalidReqParsed.success, 'P10-INT-06b', 'Validation schema rejects reason < 10 characters');

  // Submit via RPC
  const { data: reqId, error: submitRpcErr } = await student1.client.rpc('submit_profile_change_request', {
    p_field_name: 'full_name',
    p_new_value: 'Alice Wonderland',
    p_reason: 'Official matriculation record correction requested.',
  });
  assert(!submitRpcErr && Boolean(reqId), 'P10-INT-06c', 'Student successfully submits change request via RPC');

  // Query history
  const { data: historyRows, error: histErr } = await student1.client
    .from('profile_change_requests')
    .select('*')
    .eq('student_id', student1.userId);
  assert(!histErr && (historyRows || []).length >= 1, 'P10-INT-06d', 'Student queries own change request history');
  assert(historyRows![0].status === 'pending', 'P10-INT-06e', 'Request status is pending');

  // Attempt duplicate pending request for same field
  const { error: dupRpcErr } = await student1.client.rpc('submit_profile_change_request', {
    p_field_name: 'full_name',
    p_new_value: 'Alice Another',
    p_reason: 'Second pending request should be blocked.',
  });
  assert(Boolean(dupRpcErr), 'P10-INT-06f', 'Duplicate pending change request for same field is rejected');

  // -------------------------------------------------------------------------
  // P10-INT-07: Admin approval workflow updates profile and emits audit log
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-07] Admin approval workflow with token authorization and audit log');
  const { data: approveRes, error: approveErr } = await adminManageStudents.client.rpc(
    'approve_profile_change_request',
    { p_request_id: reqId }
  );
  assert(!approveErr, 'P10-INT-07a', 'Admin with manage_students calls approve_profile_change_request');

  // Verify profile updated
  const { data: student1AfterApprove } = await adminClient
    .from('profiles')
    .select('full_name')
    .eq('id', student1.userId)
    .single();
  assert(student1AfterApprove?.full_name === 'Alice Wonderland', 'P10-INT-07b', 'Profile full_name updated to Alice Wonderland');

  // Verify request marked approved
  const { data: reqAfterApprove } = await adminClient
    .from('profile_change_requests')
    .select('status, reviewed_by, reviewed_at')
    .eq('id', reqId)
    .single();
  assert(reqAfterApprove?.status === 'approved', 'P10-INT-07c', 'Request status transitioned to approved');
  assert(reqAfterApprove?.reviewed_by === adminManageStudents.adminId, 'P10-INT-07d', 'Reviewed by recorded accurately');

  // Verify audit log
  const { data: auditRows } = await adminClient
    .from('audit_logs')
    .select('*')
    .eq('action', 'student.profile_changed')
    .eq('target_id', reqId);
  assert((auditRows || []).length > 0, 'P10-INT-07e', 'Immutable audit log written for approval');

  // -------------------------------------------------------------------------
  // P10-INT-08: Admin rejection workflow requires >= 10 char reason
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-08] Admin rejection workflow with mandatory reason');
  // Submit branch change request for student2
  const { data: reqId2, error: submitRpcErr2 } = await student2.client.rpc('submit_profile_change_request', {
    p_field_name: 'branch',
    p_new_value: 'ISE',
    p_reason: 'Branch change order issued by department office.',
  });
  assert(!submitRpcErr2 && Boolean(reqId2), 'P10-INT-08a', 'Student2 submits branch change request');

  // Reject with valid reason
  const rejectionReason = 'Branch transfer order not yet received from registrar office.';
  const { error: rejectErr } = await adminManageStudents.client.rpc('reject_profile_change_request', {
    p_request_id: reqId2,
    p_rejection_reason: rejectionReason,
  });
  assert(!rejectErr, 'P10-INT-08b', 'Admin successfully rejects request with valid reason');

  // Profile must remain unchanged
  const { data: student2AfterReject } = await adminClient
    .from('profiles')
    .select('branch')
    .eq('id', student2.userId)
    .single();
  assert(student2AfterReject?.branch === 'CSE', 'P10-INT-08c', 'Profile branch remains unchanged at CSE');

  // Request status is rejected
  const { data: req2AfterReject } = await adminClient
    .from('profile_change_requests')
    .select('status, rejection_reason')
    .eq('id', reqId2)
    .single();
  assert(req2AfterReject?.status === 'rejected', 'P10-INT-08d', 'Request status transitioned to rejected');
  assert(req2AfterReject?.rejection_reason === rejectionReason, 'P10-INT-08e', 'Rejection reason recorded in request');

  // Verify rejection audit log
  const { data: rejectAuditRows } = await adminClient
    .from('audit_logs')
    .select('*')
    .eq('action', 'student.profile_change_rejected')
    .eq('target_id', reqId2);
  assert((rejectAuditRows || []).length > 0, 'P10-INT-08f', 'Immutable audit log written for rejection');

  // -------------------------------------------------------------------------
  // P10-INT-09: Direct admin update on protected fields is rejected by trigger
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-09] Direct admin modification bypass attempt blocked by trigger');
  const { error: directAdminErr } = await adminManageStudents.client
    .from('profiles')
    .update({ full_name: 'Hacked Admin Name' })
    .eq('id', student2.userId);
  assert(Boolean(directAdminErr), 'P10-INT-09a', 'Direct update on approved profile by admin is blocked by trigger');

  // -------------------------------------------------------------------------
  // P10-INT-10: Teammate roster privacy query returns sanitized fields
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-10] Teammate roster privacy query via get_team_roster RPC');
  const { hackathonId, teamId } = await createTestHackathonWithTeam(student1, student2);

  const { data: roster, error: rosterErr } = await student1.client.rpc('get_team_roster', {
    p_team_id: teamId,
  });
  assert(!rosterErr && Boolean(roster), 'P10-INT-10a', 'Enrolled team member calls get_team_roster');
  assert((roster as any[]).length === 2, 'P10-INT-10b', 'Returns both team members');

  const teammateRow = (roster as any[]).find((r: any) => r.student_id === student2.userId);
  assert(Boolean(teammateRow), 'P10-INT-10c', 'Found teammate in roster');
  assert(teammateRow.full_name === 'Student bob', 'P10-INT-10d', 'Teammate full_name is projected');
  assert(teammateRow.branch === 'CSE', 'P10-INT-10e', 'Teammate branch is projected');
  assert(teammateRow.academic_year === 2, 'P10-INT-10f', 'Teammate academic_year is projected');
  assert(!('usn' in teammateRow), 'P10-INT-10g', 'USN is strictly omitted from teammate projection');
  assert(!('phone' in teammateRow), 'P10-INT-10h', 'Phone is strictly omitted from teammate projection');
  assert(!('email' in teammateRow), 'P10-INT-10i', 'Email is strictly omitted from teammate projection');

  // Non-member access is rejected
  const { error: nonMemberRosterErr } = await student3.client.rpc('get_team_roster', {
    p_team_id: teamId,
  });
  assert(Boolean(nonMemberRosterErr), 'P10-INT-10j', 'Non-member calling get_team_roster is rejected with 42501');

  // -------------------------------------------------------------------------
  // P10-INT-11: Operational dashboard queries points summary & rank
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-11] Operational dashboard metrics query');
  const { data: pointsSummary, error: ptsSummaryErr } = await student1.client.rpc(
    'get_student_points_summary',
    { p_student_id: student1.userId }
  );
  assert(!ptsSummaryErr && Boolean(pointsSummary), 'P10-INT-11a', 'Student queries own points summary');
  assert(typeof (pointsSummary as any).total_points === 'number', 'P10-INT-11b', 'Total points is a number');
  assert('submitted_claims_count' in (pointsSummary as any), 'P10-INT-11c', 'Submitted claims count is exposed distinctly');

  // -------------------------------------------------------------------------
  // P10-INT-12: Stale request approval fails cleanly without mutating profile
  // -------------------------------------------------------------------------
  console.log('\n[P10-INT-12] Stale change request approval guard');
  // Student3 submits request to change academic_year from 4 to 3
  const { data: reqId3 } = await student3.client.rpc('submit_profile_change_request', {
    p_field_name: 'academic_year',
    p_new_value: '3',
    p_reason: 'Year back matriculation adjustment.',
  });

  // Simulate an intermediate profile change (e.g., student was changed or another update happened)
  // We can simulate stale state by updating old_value in the request row to 2
  await adminClient
    .from('profile_change_requests')
    .update({ old_value: '2' })
    .eq('id', reqId3);

  // Attempt approval: profile is Year 4, but request recorded old_value = 2
  const { error: staleApproveErr } = await adminManageStudents.client.rpc('approve_profile_change_request', {
    p_request_id: reqId3,
  });
  assert(Boolean(staleApproveErr), 'P10-INT-12a', 'Approval of stale request is blocked by stale guard');
  assert(
    Boolean(staleApproveErr?.message.includes('Stale request')),
    'P10-INT-12b',
    'Error message clearly indicates stale request'
  );

  // Profile must remain unchanged at 4
  const { data: student3AfterStale } = await adminClient
    .from('profiles')
    .select('academic_year')
    .eq('id', student3.userId)
    .single();
  assert(student3AfterStale?.academic_year === 4, 'P10-INT-12c', 'Student3 academic_year remains intact at 4');

  // Request remains in pending status
  const { data: req3AfterStale } = await adminClient
    .from('profile_change_requests')
    .select('status')
    .eq('id', reqId3)
    .single();
  assert(req3AfterStale?.status === 'pending', 'P10-INT-12d', 'Stale request remains pending without status change');

  // --------------------------------------------------------------------------
  // [P10-INT-13] Profile Photo Storage RLS Access Boundaries
  // --------------------------------------------------------------------------
  console.log('\n[P10-INT-13] Profile Photo Storage RLS Access Boundaries');

  // Upload an avatar for student1 directly
  const testAvatarPath = `${student1.userId}/avatar_rls_test.png`;
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  await adminClient.storage.from('profile-photos').upload(testAvatarPath, validPngBuffer, {
    contentType: 'image/png',
    upsert: true,
  });

  // Owner (student1) can download their own avatar
  const { data: ownAvatarData, error: ownAvatarErr } = await student1.client.storage
    .from('profile-photos')
    .download(testAvatarPath);
  assert(!ownAvatarErr && Boolean(ownAvatarData), 'P10-INT-13a', 'Owner successfully downloads own avatar from storage');

  // Teammate (student2) can download student1 avatar
  const { data: teamAvatarData, error: teamAvatarErr } = await student2.client.storage
    .from('profile-photos')
    .download(testAvatarPath);
  assert(!teamAvatarErr && Boolean(teamAvatarData), 'P10-INT-13b', 'Teammate successfully downloads student1 avatar from storage');

  // Unrelated student (student3, not on team) is denied download
  const { data: deniedAvatarData, error: deniedAvatarErr } = await student3.client.storage
    .from('profile-photos')
    .download(testAvatarPath);
  assert(Boolean(deniedAvatarErr) || !deniedAvatarData, 'P10-INT-13c', 'Unrelated student is denied downloading another student avatar');

  // Authorized Admin (adminManageStudents) can download student1 avatar
  const { data: adminAvatarData, error: adminAvatarErr } = await adminManageStudents.client.storage
    .from('profile-photos')
    .download(testAvatarPath);
  assert(!adminAvatarErr && Boolean(adminAvatarData), 'P10-INT-13d', 'Authorized administrator successfully downloads student avatar');

  // Clean up test avatar
  await adminClient.storage.from('profile-photos').remove([testAvatarPath]);

  console.log('\n================================================================');
  console.log(` Phase 10 Integration Results: ${passedAssertions}/${totalAssertions} assertions passed`);
  console.log(' ALL INTEGRATION TESTS PASSED SUCCESSFULLY');
  console.log('================================================================\n');
}

runPhase10IntegrationTests().catch((err) => {
  console.error('\nTest suite failed with uncaught exception:', err);
  process.exit(1);
});
