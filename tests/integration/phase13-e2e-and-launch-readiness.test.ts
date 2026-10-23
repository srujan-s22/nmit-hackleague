import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';

// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

import { createClient } from '@supabase/supabase-js';
import { testBackupRestoration } from '../../scripts/test-backup-restoration';
import { sanitizeCellValue, generateCsvString, generateExcelWorkbook } from '../../src/lib/reports/export-generators';
import { validatePushEndpoint } from '../../src/lib/notifications/endpoint-validator';

// Import server-only modules after require.cache patch
const { sendTransactionalEmail } = require('../../src/lib/email/resend-service');
const { checkSystemHealth } = require('../../src/lib/reliability/health-service');
const { GET: healthGet } = require('../../src/app/api/health/route');

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

async function createAuthenticatedStudent(prefix: string) {
  const runId = crypto.randomUUID().slice(0, 8);
  const email = `qa_student_${prefix}_${runId}@nmit-dev.local`;
  const password = 'Password123!';

  // Generate compliant 10-char USN: ^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$
  let usn = '';
  while (!usn) {
    const candidate = `1NT${Math.floor(11 + Math.random() * 12)}CS${Math.floor(600 + Math.random() * 399)}`;
    const { data } = await adminClient.from('profiles').select('id').eq('usn', candidate).maybeSingle();
    if (!data) usn = candidate;
  }

  const phone = `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;

  const lowercaseUsn = usn.toLowerCase();
  const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: `QA Student ${prefix}`,
      usn: lowercaseUsn,
      phone,
      branch: 'CSE',
      academic_year: 3,
      sex: 'Male',
      date_of_birth: '2003-05-15',
    },
  });

  if (authErr || !authUser.user) {
    throw new Error(`Failed to create test auth user: ${authErr?.message}`);
  }

  // Authenticate client session
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData } = await anonClient.auth.signInWithPassword({ email, password });

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${sessionData?.session?.access_token}` } },
  });

  return {
    userId: authUser.user.id,
    email,
    usn,
    phone,
    client,
  };
}

async function runPhase13Suite() {
  console.log('================================================================');
  console.log(' Phase 13: End-to-End QA, Security & Launch Readiness Test Suite');
  console.log('================================================================\n');

  const superAdmin = await getSuperAdminClient();

  // --------------------------------------------------------------------------
  // Area 1: Student Onboarding, USN Normalization & Review State Transitions
  // --------------------------------------------------------------------------
  console.log('[P13-QA-01] Student Registration, USN Normalization & Review Transitions');

  const student1 = await createAuthenticatedStudent('alpha');

  // Verify USN is normalized to UPPERCASE in database via trigger
  const { data: studentProfile } = await adminClient
    .from('profiles')
    .select('usn, registration_status, full_name')
    .eq('id', student1.userId)
    .single();

  assert(
    studentProfile?.usn === student1.usn.toUpperCase(),
    'P13-QA-01a',
    'USN normalization trigger automatically converts USN to UPPERCASE'
  );
  assert(
    studentProfile?.registration_status === 'draft',
    'P13-QA-01b',
    'Initial student registration status is draft upon signup'
  );

  // Transition to under_review
  await adminClient
    .from('profiles')
    .update({ registration_status: 'under_review' })
    .eq('id', student1.userId);

  // Super Admin reviews student registration -> approves
  const { data: reviewRes, error: reviewErr } = await superAdmin.client.rpc(
    'review_student_registration' as never,
    {
      p_student_id: student1.userId,
      p_decision: 'approved',
      p_rejection_reason: null,
    } as never
  );

  assert(!reviewErr, 'P13-QA-01c', 'review_student_registration RPC executes cleanly', reviewErr?.message);
  assert((reviewRes as any)?.status === 'approved' || (reviewRes as any)?.success === true, 'P13-QA-01d', 'Student approved');

  const { data: approvedProfile } = await adminClient
    .from('profiles')
    .select('registration_status')
    .eq('id', student1.userId)
    .single();

  assert(
    approvedProfile?.registration_status === 'approved',
    'P13-QA-01e',
    'Database records approved registration status'
  );

  // --------------------------------------------------------------------------
  // Area 2: Role-Based Access Control, Scoping & Privilege Escalation Defenses
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-02] Admin RBAC, Scoped Access & Anti-Escalation Safeguards');

  // Create scoped admin with only manage_notifications
  const scopedAdminId = crypto.randomUUID();
  const scopedAdminEmail = `scoped_admin_${Date.now()}@nmit-dev.local`;

  const { error: adminCreateErr } = await adminClient.auth.admin.createUser({
    id: scopedAdminId,
    email: scopedAdminEmail,
    password: 'Password123!',
    email_confirm: true,
    user_metadata: { role: 'admin' },
  });
  if (adminCreateErr) {
    throw new Error(`Failed to create scoped admin: ${adminCreateErr.message}`);
  }

  await adminClient.from('admin_profiles').insert({
    id: scopedAdminId,
    email: scopedAdminEmail,
    full_name: 'Scoped Notification Admin',
    is_super_admin: false,
    is_active: true,
  });

  await adminClient.from('admin_permissions').insert({
    admin_id: scopedAdminId,
    permission: 'manage_notifications',
    granted_by: superAdmin.adminId,
  });

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: scopedSession, error: scopedSignErr } = await anonClient.auth.signInWithPassword({
    email: scopedAdminEmail,
    password: 'Password123!',
  });
  if (scopedSignErr || !scopedSession?.session) {
    throw new Error(`Failed to sign in scoped admin: ${scopedSignErr?.message}`);
  }

  const scopedClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${scopedSession.session.access_token}` } },
  });

  // Scoped admin CAN publish general announcement
  const { data: scopedAnn, error: scopedAnnErr } = await scopedClient.rpc(
    'publish_announcement' as never,
    {
      p_title: 'Notice from Notification Admin',
      p_body: 'Testing role permission boundary.',
      p_target_role: 'all',
      p_announcement_type: 'general',
    } as never
  );
  assert(!scopedAnnErr && (scopedAnn as any)?.success === true, 'P13-QA-02a', 'Admin with manage_notifications can publish announcement', scopedAnnErr?.message || JSON.stringify(scopedAnn));

  // Scoped admin CANNOT grant themselves extra permissions (Privilege Escalation Defense)
  const { error: escalateErr } = await scopedClient.from('admin_permissions').insert({
    admin_id: scopedAdminId,
    permission: 'manage_admins',
    granted_by: scopedAdminId,
  });
  assert(!!escalateErr, 'P13-QA-02b', 'Admin cannot grant themselves permissions (RLS blocks insert)');

  // --------------------------------------------------------------------------
  // Area 3: Student Profiles, Direct Fields vs Approval-Required Fields
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-03] Student Profiles, Direct Edit Fields vs Request-Approval Guard');

  // Direct edit: phone number update is permitted for student
  const updatedPhone = '+919876543210';
  const { error: phoneErr } = await student1.client
    .from('profiles')
    .update({ phone: updatedPhone })
    .eq('id', student1.userId);

  assert(!phoneErr, 'P13-QA-03a', 'Student can update direct contact fields (phone)', phoneErr?.message);

  // Direct edit: changing full_name directly without approval request is blocked
  const { error: directNameErr } = await student1.client
    .from('profiles')
    .update({ full_name: 'Malicious Name Tamper' })
    .eq('id', student1.userId);

  // Trigger protect_profile_columns blocks unauthorized name changes
  assert(!!directNameErr, 'P13-QA-03b', 'Direct modification of full_name is strictly blocked by column protection trigger');

  // Student submits profile change request for name update
  const { data: reqId, error: reqErr } = await student1.client.rpc(
    'submit_profile_change_request' as never,
    {
      p_field_name: 'full_name',
      p_new_value: 'Student Alpha Verified',
      p_reason: 'Legal name correction per university registrar records',
    } as never
  );

  assert(!reqErr && !!reqId, 'P13-QA-03c', 'Student can submit official profile change request', reqErr?.message);

  // Super Admin approves the profile change request
  const { data: approveReq, error: approveReqErr } = await superAdmin.client.rpc(
    'approve_profile_change_request' as never,
    { p_request_id: reqId } as never
  );

  assert(!approveReqErr, 'P13-QA-03d', 'Admin approves profile change request', approveReqErr?.message);

  const { data: updatedNameProfile } = await adminClient
    .from('profiles')
    .select('full_name')
    .eq('id', student1.userId)
    .single();

  assert(
    updatedNameProfile?.full_name === 'Student Alpha Verified',
    'P13-QA-03e',
    'Approved profile change is atomically applied to public.profiles'
  );

  // --------------------------------------------------------------------------
  // Area 4: Hackathon Lifecycles, Round Timings & Stage Pausing
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-04] Hackathon Setup, Scoped In-Charge Admin & Stage Schedules');

  // Grant manage_hackathons permission to scopedAdminId so they qualify as in-charge admin
  await adminClient.from('admin_permissions').insert({
    admin_id: scopedAdminId,
    permission: 'manage_hackathons',
    granted_by: superAdmin.adminId,
  });

  const hackathonSlug = `p13-qa-hackathon-${Date.now()}`;
  const hackathonId = crypto.randomUUID();

  // Create published hackathon assigned to scopedAdminId
  const { error: h1Err } = await adminClient.from('hackathons').insert({
    id: hackathonId,
    title: 'NMIT Inter-Collegiate Hackathon 2026',
    slug: hackathonSlug,
    description: 'Comprehensive QA Hackathon event for launch testing.',
    mode: 'hybrid',
    organizer: 'NMIT Dept of CSE',
    status: 'published',
    min_team_size: 2,
    max_team_size: 4,
    is_solo_allowed: false,
    registration_start_at: new Date(Date.now() - 3600000).toISOString(),
    registration_end_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    event_start_at: new Date(Date.now() + 86400000 * 3).toISOString(),
    event_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
    in_charge_admin_id: scopedAdminId,
    created_by: superAdmin.adminId,
  });
  if (h1Err) {
    throw new Error(`Failed to create hackathon 1: ${h1Err.message}`);
  }

  // Create second published hackathon assigned to Super Admin (unassigned to scopedAdminId)
  const hackathon2Id = crypto.randomUUID();
  await adminClient.from('hackathons').insert({
    id: hackathon2Id,
    title: 'NMIT Internal Hackathon 2026',
    slug: `p13-internal-${Date.now()}`,
    description: 'Internal hackathon not assigned to scoped admin.',
    mode: 'online',
    organizer: 'NMIT',
    status: 'published',
    min_team_size: 1,
    max_team_size: 3,
    is_solo_allowed: true,
    registration_start_at: new Date(Date.now() - 3600000).toISOString(),
    registration_end_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    event_start_at: new Date(Date.now() + 86400000 * 3).toISOString(),
    event_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
    in_charge_admin_id: superAdmin.adminId,
    created_by: superAdmin.adminId,
  });

  const round1Id = crypto.randomUUID();
  const { error: r1Err } = await adminClient.from('hackathon_rounds').insert({
    id: round1Id,
    hackathon_id: hackathonId,
    round_number: 1,
    name: 'Round 1: Ideation & Architecture',
    start_at: new Date(Date.now() - 1000).toISOString(),
    end_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'open',
  });
  if (r1Err) {
    throw new Error(`Failed to create round 1: ${r1Err.message}`);
  }

  // 1. Scoped admin CAN manage their assigned hackathon
  const { data: assignedEvents, error: assignedErr } = await scopedClient
    .from('hackathons')
    .select('id, title, in_charge_admin_id')
    .eq('id', hackathonId)
    .single();

  assert(
    !assignedErr && assignedEvents?.in_charge_admin_id === scopedAdminId,
    'P13-QA-04a',
    'Assigned in-charge admin with manage_hackathons can access assigned hackathon',
    assignedErr?.message
  );

  // 2. Scoped admin CANNOT manage unassigned hackathon 2 under RLS
  const { data: unassignedAccess } = await scopedClient
    .from('hackathons')
    .select('id')
    .eq('id', hackathon2Id)
    .maybeSingle();

  assert(
    unassignedAccess === null,
    'P13-QA-04a1',
    'Scoped admin cannot access unassigned hackathon despite having manage_hackathons'
  );

  // Test stage pause RPC
  const { data: pauseRes, error: pauseErr } = await superAdmin.client.rpc(
    'pause_hackathon_round' as never,
    {
      p_round_id: round1Id,
      p_reason: 'Scheduled maintenance intermission during testing',
    } as never
  );

  assert(!pauseErr, 'P13-QA-04b', 'pause_hackathon_round RPC executed successfully', pauseErr?.message);
  assert((pauseRes as any)?.status === 'paused', 'P13-QA-04c', 'Round status transitioned to paused');

  // Resume round with new schedule
  const newEndAt = new Date(Date.now() + 86400000 * 2).toISOString();
  const { data: resumeRes, error: resumeErr } = await superAdmin.client.rpc(
    'resume_hackathon_round' as never,
    {
      p_round_id: round1Id,
      p_new_end_at: newEndAt,
      p_reason: 'Intermission complete; schedule extended for testing',
    } as never
  );

  assert(!resumeErr, 'P13-QA-04d', 'resume_hackathon_round RPC executed cleanly', resumeErr?.message);
  assert((resumeRes as any)?.status === 'open', 'P13-QA-04e', 'Round restored to open status');

  // --------------------------------------------------------------------------
  // Area 5: Team Formation, Capacity Limits & Duplicate Membership Prevention
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-05] Team Formation, Invitation Codes & Duplicate Membership Rejection');

  const student2 = await createAuthenticatedStudent('beta');
  await adminClient.from('profiles').update({ registration_status: 'approved' }).eq('id', student2.userId);

  // Student 1 creates team for the hackathon
  const { data: teamRes, error: teamErr } = await student1.client.rpc(
    'create_team' as never,
    {
      p_hackathon_id: hackathonId,
      p_team_name: 'Team Vanguard QA',
    } as never
  );

  assert(!teamErr && !!(teamRes as any)?.team_id, 'P13-QA-05a', 'create_team succeeds for student', teamErr?.message);
  const teamId = (teamRes as any)?.team_id;
  const inviteCode = (teamRes as any)?.invitation_code;
  assert(typeof inviteCode === 'string' && inviteCode.length >= 6, 'P13-QA-05b', 'Secure invite code generated');

  // Student 2 joins team using invite code
  const { data: joinRes, error: joinErr } = await student2.client.rpc(
    'join_team_with_code' as never,
    { p_invitation_code: inviteCode } as never
  );

  assert(!joinErr && (joinRes as any)?.team_id === teamId, 'P13-QA-05c', 'Student 2 successfully joins team with invite code');

  // Duplicate membership attempt: Student 2 tries to create or join another team for the SAME hackathon
  const { error: dupTeamErr } = await student2.client.rpc(
    'create_team' as never,
    {
      p_hackathon_id: hackathonId,
      p_team_name: 'Duplicate Team Attempt',
    } as never
  );

  assert(!!dupTeamErr, 'P13-QA-05d', 'Duplicate team membership in same hackathon strictly prevented');

  // Verify team roster reflects both students
  const { data: roster, error: rosterErr } = await superAdmin.client.rpc(
    'get_team_roster' as never,
    { p_team_id: teamId } as never
  );

  assert(!rosterErr && Array.isArray(roster) && roster.length === 2, 'P13-QA-05e', 'Team roster contains exactly 2 members');

  // --------------------------------------------------------------------------
  // Area 6: Submissions, Self-Declaration & Admin Milestone Review
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-06] Submissions, CDC Self-Declaration & Round Review Lifecycle');

  // Round 1 registration proof submission (self-declared, auto-accepted)
  const { data: proofRes, error: proofErr } = await student1.client.rpc(
    'submit_registration_proof' as never,
    {
      p_team_id: teamId,
      p_proof_path: 'evidence/registration/test_cdc_proof.png',
      p_cdc_declaration_accepted: true,
      p_cdc_declaration_text: 'I confirm with the Career Development Centre (CDC) that this proof is genuine, unaltered, and authentic.',
    } as never
  );

  assert(!proofErr && (proofRes as any)?.success === true, 'P13-QA-06a', 'submit_registration_proof with CDC declaration succeeds', proofErr?.message);

  // Round 1 milestone submission
  const { data: subRes, error: subErr } = await student1.client.rpc(
    'submit_round_milestone' as never,
    {
      p_round_id: round1Id,
      p_team_id: teamId,
      p_title: 'Prototype Implementation Delivery',
      p_description: 'Full-stack application prototype built and deployed.',
      p_repo_url: 'https://github.com/nmit-hackleague/prototype',
      p_demo_url: 'https://prototype.nmit.ac.in',
      p_evidence_path: null,
      p_evidence_sha256: null,
    } as never
  );

  assert(!subErr && !!(subRes as any)?.submission_id, 'P13-QA-06b', 'submit_round_milestone succeeds for team leader', subErr?.message);
  const submissionId = (subRes as any)?.submission_id;

  // Admin reviews submission -> accepted
  const { data: reviewSubRes, error: reviewSubErr } = await superAdmin.client.rpc(
    'review_round_submission' as never,
    {
      p_submission_id: submissionId,
      p_decision: 'accepted',
      p_feedback: 'Demonstrated complete functional architecture and test coverage.',
    } as never
  );

  assert(!reviewSubErr, 'P13-QA-06c', 'review_round_submission approves milestone', reviewSubErr?.message);

  // --------------------------------------------------------------------------
  // Area 7: Append-Only Points Ledger, Immutability & Leaderboard
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-07] Append-Only Points Ledger, Immutability & Platform Leaderboard');

  const { data: ledgerEntries, error: ledgerFetchErr } = await adminClient
    .from('points_ledger')
    .select('id, points, student_id')
    .eq('team_id', teamId);

  assert(!ledgerFetchErr && ledgerEntries && ledgerEntries.length > 0, 'P13-QA-07a', 'Points awarded in points_ledger');
  const pointsEntryId = ledgerEntries![0].id;

  // Immutability Check: UPDATE on points_ledger must be blocked by trigger
  const { error: updateLedgerErr } = await adminClient
    .from('points_ledger')
    .update({ points: 999 })
    .eq('id', pointsEntryId);

  assert(!!updateLedgerErr, 'P13-QA-07b', 'UPDATE on points_ledger is blocked by immutability trigger');

  // Immutability Check: DELETE on points_ledger must be blocked by trigger
  const { error: deleteLedgerErr } = await adminClient
    .from('points_ledger')
    .delete()
    .eq('id', pointsEntryId);

  assert(!!deleteLedgerErr, 'P13-QA-07c', 'DELETE on points_ledger is blocked by immutability trigger');

  // Query platform leaderboard
  const { data: leaderboard, error: lbErr } = await superAdmin.client.rpc(
    'get_platform_leaderboard' as never,
    { p_limit: 10 } as never
  );

  assert(!lbErr && Array.isArray(leaderboard) && leaderboard.length > 0, 'P13-QA-07d', 'get_platform_leaderboard returns ranked participants');
  const studentRankEntry = (leaderboard as any[]).find((e) => e.student_id === student1.userId);
  assert(studentRankEntry && studentRankEntry.total_points > 0, 'P13-QA-07e', 'Leaderboard accurately computes student cumulative points');

  // --------------------------------------------------------------------------
  // Area 8: Data Exports, Formula Injection Defenses & Data Privacy
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-08] Data Exports, Formula Injection Defenses & Privacy Auditing');

  // 8a: CSV Formula Injection sanitization
  const testVectors = [
    '=cmd|"/c calc"!A0',
    '   =1+1',
    '  \t+SUM(A1:A10)',
    '\r\n-10-20',
    '@HYPERLINK("http://evil.com")',
    '   @SUM(B1:B5)',
    '\t=2+3',
    '%0a=cmd',
  ];

  for (const v of testVectors) {
    const sanitized = sanitizeCellValue(v);
    assert(sanitized.startsWith("'"), 'P13-QA-08a', `Sanitizes formula payload: ${v.slice(0, 15)}...`);
  }

  // 8b: Privacy Compliance: Verify student exports exclude sensitive PII (DOB, Sex, Photos)
  const sampleStudentRow = {
    usn: '1NT23CS101',
    full_name: 'Privacy Test Student',
    branch: 'CSE',
    academic_year: 3,
    email: 'test@nmit.ac.in',
    phone: '+919876543210',
    date_of_birth: '2003-01-15',
    sex: 'Female',
    college_id_path: 'verification-documents/private_id.jpg',
    profile_photo_path: 'profile-photos/photo.jpg',
  };

  const headers = [
    { key: 'usn', label: 'USN' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'branch', label: 'Branch' },
    { key: 'academic_year', label: 'Academic Year' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
  ];

  const csvOutput = generateCsvString(headers, [sampleStudentRow]);

  assert(!csvOutput.includes('2003-01-15'), 'P13-QA-08b', 'CSV export excludes student date_of_birth');
  assert(!csvOutput.includes('Female'), 'P13-QA-08c', 'CSV export excludes student sex/gender');
  assert(!csvOutput.includes('private_id.jpg'), 'P13-QA-08d', 'CSV export excludes college_id_path');
  assert(!csvOutput.includes('photo.jpg'), 'P13-QA-08e', 'CSV export excludes profile_photo_path');

  // 8c: Multi-format packaging: Excel workbook generator
  const excelBuffer = await generateExcelWorkbook([
    {
      id: 'leaderboard',
      title: 'Platform Leaderboard',
      headers: [
        { key: 'usn', label: 'USN' },
        { key: 'name', label: 'Student Name' },
        { key: 'points', label: 'Points' },
      ],
      rows: [
        { usn: '1NT23CS001', name: 'Student One', points: 250 },
        { usn: '1NT23CS002', name: 'Student Two', points: 180 },
      ],
    },
  ]);

  assert(Buffer.isBuffer(excelBuffer) && excelBuffer.length > 500, 'P13-QA-08f', 'Excel workbook generated as valid binary buffer');

  // --------------------------------------------------------------------------
  // Area 9: Web Push Security, Email Idempotency & Free-Plan Reliability
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-09] Web Push SSRF Safeguards, Email Idempotency & Public Health Sanity');

  // 9a: Push Endpoint SSRF Preventions
  const privateEndpoint = await validatePushEndpoint('https://169.254.169.254/push', { resolveDns: false });
  assert(privateEndpoint.valid === false, 'P13-QA-09a', 'Cloud metadata IP 169.254.169.254 blocked');

  const nonStandardPortEndpoint = await validatePushEndpoint('https://fcm.googleapis.com:8443/fcm/send/123');
  assert(nonStandardPortEndpoint.valid === false, 'P13-QA-09b', 'Non-standard port 8443 rejected');

  const credEndpoint = await validatePushEndpoint('https://admin:pass@fcm.googleapis.com/fcm/send/123');
  assert(credEndpoint.valid === false, 'P13-QA-09c', 'Endpoint with user credentials rejected');

  // 9b: Email Idempotency Check
  const emailKey = `p13_idem_${Date.now()}_${crypto.randomUUID().slice(0, 6)}`;
  const emailRes1 = await sendTransactionalEmail({
    to: student1.email,
    subject: 'Phase 13 Launch Readiness Verification',
    template: 'deadline_reminder',
    variables: {
      hackathonTitle: 'HackLeague 2026',
      roundName: 'Round 1 Final Submission',
      deadlineTime: 'Today at 11:59 PM',
    },
    idempotencyKey: emailKey,
  });

  assert(emailRes1.success === true, 'P13-QA-09d', 'Initial transactional email dispatches cleanly');

  const emailRes2 = await sendTransactionalEmail({
    to: student1.email,
    subject: 'Phase 13 Launch Readiness Verification',
    template: 'deadline_reminder',
    variables: {
      hackathonTitle: 'HackLeague 2026',
      roundName: 'Round 1 Final Submission',
      deadlineTime: 'Today at 11:59 PM',
    },
    idempotencyKey: emailKey,
  });

  assert(emailRes2.duplicatePrevented === true, 'P13-QA-09e', 'Duplicate email dispatch strictly prevented');

  // 9c: Public /api/health sanitization check
  const publicReq = new Request('http://localhost/api/health');
  const healthResp = await healthGet(publicReq);
  const healthJson = await healthResp.json();

  assert(healthJson.status === 'healthy' || healthJson.status === 'degraded', 'P13-QA-09f', 'Public /api/health returns valid operational status');
  assert(healthJson.database === undefined, 'P13-QA-09g', 'Public /api/health does NOT expose internal database metrics');
  assert(healthJson.storage === undefined, 'P13-QA-09h', 'Public /api/health does NOT expose storage error details');
  assert(
    typeof healthJson.reliabilityNotice === 'string' && healthJson.reliabilityNotice.includes('Free plan'),
    'P13-QA-09i',
    'Public /api/health clearly includes the Supabase Free plan inactivity pausing notice'
  );

  // --------------------------------------------------------------------------
  // Area 10: Database Backup, Checksum Verification & Row Restoration Test
  // --------------------------------------------------------------------------
  console.log('\n[P13-QA-10] Independent Database Backup & Checksummed Data Restoration');

  const backupReport = await testBackupRestoration();

  assert(backupReport.success === true, 'P13-QA-10a', 'Database backup and restoration test succeeded');
  assert(backupReport.checksumVerified === true, 'P13-QA-10b', 'Backup SHA-256 cryptographic checksum matched');
  assert(backupReport.schemaVerification.missingTables.length === 0, 'P13-QA-10c', 'All core tables confirmed in backup');

  // Clean up QA test artifacts using replica session to safely remove immutable fixtures
  const cleanupSql = `
    BEGIN;
    SET LOCAL session_replication_role = 'replica';
    DELETE FROM public.points_ledger WHERE hackathon_id IN ('${hackathonId}', '${hackathon2Id}');
    DELETE FROM public.submission_reviews WHERE submission_id = '${submissionId}';
    DELETE FROM public.submissions WHERE hackathon_id = '${hackathonId}';
    DELETE FROM public.results WHERE hackathon_id = '${hackathonId}';
    DELETE FROM public.team_members WHERE team_id = '${teamId}';
    DELETE FROM public.teams WHERE id = '${teamId}';
    DELETE FROM public.hackathon_rounds WHERE hackathon_id IN ('${hackathonId}', '${hackathon2Id}');
    DELETE FROM public.hackathons WHERE id IN ('${hackathonId}', '${hackathon2Id}');
    DELETE FROM public.admin_permissions WHERE admin_id = '${scopedAdminId}';
    DELETE FROM public.admin_profiles WHERE id = '${scopedAdminId}';
    DELETE FROM auth.users WHERE id = '${scopedAdminId}';
    DELETE FROM public.profiles WHERE id IN ('${student1.userId}', '${student2.userId}');
    DELETE FROM auth.users WHERE id IN ('${student1.userId}', '${student2.userId}');
    COMMIT;
  `;
  try {
    execSync(`docker exec -i supabase_db_hackleague psql -U postgres -d postgres -c "${cleanupSql}"`, { stdio: 'pipe' });
  } catch (cleanErr) {
    console.warn('Cleanup warning:', cleanErr);
  }

  console.log('\n================================================================');
  console.log(` Phase 13 E2E QA Test Results: ${passedAssertions}/${totalAssertions} assertions passed`);
  console.log(' ALL PHASE 13 QA ASSERTIONS PASSED SUCCESSFULLY');
  console.log('================================================================\n');
}

runPhase13Suite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nPhase 13 QA test suite failed:', err);
    process.exit(1);
  });
