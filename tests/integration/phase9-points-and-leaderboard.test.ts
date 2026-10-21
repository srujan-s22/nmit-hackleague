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
import {
  adjustPointsSchema,
  reversePointsSchema,
  updatePointConfigurationSchema,
  leaderboardFilterSchema,
  setHackathonAcademicPeriodSchema,
} from '../../src/lib/validation/points-schemas';

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

async function createScopedAdmin(permission: string | string[], hackathonId?: string) {
  const runHex = crypto.randomBytes(4).toString('hex');
  const email = `admin_${runHex}@nmit-dev.local`;
  const password = 'Password123!';
  const permList = Array.isArray(permission) ? permission : [permission];

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin', full_name: `Admin ${runHex}` },
  });

  if (authErr || !authData.user) {
    throw new Error(`Failed to create test admin user: ${authErr?.message}`);
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

  // If hackathonId scoped, assign hackathon
  if (hackathonId) {
    await adminClient.from('hackathon_organizers').insert({
      hackathon_id: hackathonId,
      admin_id: adminId,
      role: 'lead',
      assigned_by: superAdmin.adminId,
    });
  }

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInErr || !signInData.session) {
    throw new Error(`Failed to sign in scoped admin: ${signInErr?.message}`);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  });

  return { adminId, email, client };
}

async function runPhase9IntegrationTests() {
  console.log('\n============================================================');
  console.log('   PHASE 9.2: POINTS & LEADERBOARD APPLICATION LAYER TESTS  ');
  console.log('============================================================\n');

  const createdUserIds: string[] = [];
  const createdHackathonIds: string[] = [];

  try {
    // Setup actors and event
    const superAdmin = await getSuperAdminClient();
    const student1 = await createTestStudent('p9_std1', 3);
    createdUserIds.push(student1.userId);
    const student2 = await createTestStudent('p9_std2', 3);
    createdUserIds.push(student2.userId);
    const student3 = await createTestStudent('p9_std3', 4);
    createdUserIds.push(student3.userId);

    // Create an admin with manage_points and manage_hackathons
    const pointsAdmin = await createScopedAdmin(['manage_points', 'manage_hackathons']);
    createdUserIds.push(pointsAdmin.adminId);
    // Create an admin with manage_hackathons but WITHOUT manage_points
    const verifierAdmin = await createScopedAdmin(['verify_students', 'manage_hackathons']);
    createdUserIds.push(verifierAdmin.adminId);

    const slug = `p9-test-hack-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date();
    const { data: hackathon, error: hErr } = await adminClient
      .from('hackathons')
      .insert({
        title: 'Phase 9 Points Championship',
        slug,
        organizer: 'ISE Department',
        description: 'Phase 9 integration test event description for testing points and leaderboards',
        mode: 'hybrid',
        status: 'ongoing',
        registration_start_at: new Date(now.getTime() - 86400000).toISOString(),
        registration_end_at: new Date(now.getTime() + 86400000).toISOString(),
        event_start_at: new Date(now.getTime() - 3600000).toISOString(),
        event_end_at: new Date(now.getTime() + 86400000).toISOString(),
        created_by: superAdmin.adminId,
        in_charge_admin_id: pointsAdmin.adminId,
        academic_year: '2026-2027',
        academic_term: 'odd_sem',
      })
      .select()
      .single();

    if (hErr || !hackathon) {
      throw new Error(`Failed to create test hackathon: ${hErr?.message}`);
    }

    const hackathonId = hackathon.id;
    createdHackathonIds.push(hackathonId);

  // Create teams and team rosters via RPC
  const { data: t1Res, error: t1Err } = await student1.client.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: 'P9 Team Alpha',
  });
  if (t1Err || !t1Res) {
    throw new Error(`Failed to create team 1: ${t1Err?.message}`);
  }
  const team1Id = (t1Res as any).team_id;
  const t1Code = (t1Res as any).invitation_code;

  const { error: joinErr } = await student2.client.rpc('join_team_with_code', {
    p_invitation_code: t1Code,
  });
  if (joinErr) {
    throw new Error(`Failed to join team 1: ${joinErr?.message}`);
  }

  const { data: t2Res, error: t2Err } = await student3.client.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: 'P9 Team Beta',
  });
  if (t2Err || !t2Res) {
    throw new Error(`Failed to create team 2: ${t2Err?.message}`);
  }
  const team2Id = (t2Res as any).team_id;

  // --------------------------------------------------------------------------
  // SECTION 1: Zod Schema Validations
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Zod Validation Schemas ---');

  const validAdj = adjustPointsSchema.safeParse({
    studentId: student1.userId,
    hackathonId,
    points: 15,
    reason: 'Exceptional technical demonstration during campus exhibition',
    allowNegative: false,
  });
  assert(validAdj.success, 'P9-VAL-01', 'Valid adjustPointsSchema parsed successfully');

  const shortReasonAdj = adjustPointsSchema.safeParse({
    studentId: student1.userId,
    hackathonId,
    points: 10,
    reason: 'Too short',
  });
  assert(!shortReasonAdj.success, 'P9-VAL-02', 'adjustPointsSchema rejects short reason (<10 chars)');

  const zeroPointsAdj = adjustPointsSchema.safeParse({
    studentId: student1.userId,
    hackathonId,
    points: 0,
    reason: 'Reasonable description for zero points',
  });
  assert(!zeroPointsAdj.success, 'P9-VAL-03', 'adjustPointsSchema rejects 0 points adjustment');

  const validRev = reversePointsSchema.safeParse({
    ledgerId: crypto.randomUUID(),
    reason: 'Accidental double entry corrected by organizing faculty lead',
  });
  assert(validRev.success, 'P9-VAL-04', 'Valid reversePointsSchema parsed successfully');

  const shortRev = reversePointsSchema.safeParse({
    ledgerId: crypto.randomUUID(),
    reason: 'Mistake',
  });
  assert(!shortRev.success, 'P9-VAL-05', 'reversePointsSchema rejects reason under 10 chars');

  const validConfigUpdate = updatePointConfigurationSchema.safeParse({
    milestoneType: 'participation',
    regularMemberPoints: 20,
    teamLeaderPoints: 30,
  });
  assert(validConfigUpdate.success, 'P9-VAL-06', 'updatePointConfigurationSchema permits participation config');

  const lockedWinnerConfig = updatePointConfigurationSchema.safeParse({
    milestoneType: 'win_placement' as any,
    regularMemberPoints: 50,
    teamLeaderPoints: 50,
  });
  assert(!lockedWinnerConfig.success, 'P9-VAL-07', 'updatePointConfigurationSchema strictly rejects win_placement configuration updates');

  const validFilter = leaderboardFilterSchema.safeParse({
    academicYear: 3,
    eventAcademicYear: '2026-2027',
    eventTerm: 'odd_sem',
    limit: 25,
    offset: 0,
  });
  assert(validFilter.success, 'P9-VAL-08', 'leaderboardFilterSchema validates valid filter parameters');

  const invalidStudyYear = leaderboardFilterSchema.safeParse({
    academicYear: 5, // Only 1..4 allowed
  });
  assert(!invalidStudyYear.success, 'P9-VAL-09', 'leaderboardFilterSchema rejects studyYear > 4');

  const validAcademicPeriod = setHackathonAcademicPeriodSchema.safeParse({
    hackathonId,
    academicYear: '2026-2027',
    academicTerm: 'odd_sem',
  });
  assert(validAcademicPeriod.success, 'P9-VAL-10', 'setHackathonAcademicPeriodSchema validates correct period input');

  // --------------------------------------------------------------------------
  // SECTION 2: Authentication, Scoping & Authorization Security
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Server-Side Authorization & Student Isolation ---');

  // Student attempting to call adjust_points_ledger_entry directly
  const { error: stdAdjErr } = await student1.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student1.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: 10,
    p_reason: 'Self-awarding points attempt by student client',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });
  assert(
    Boolean(stdAdjErr && (stdAdjErr.code === '42501' || stdAdjErr.message.includes('manage_points'))),
    'P9-SEC-01',
    'Student attempting adjust_points_ledger_entry rejected with 42501 Unauthorized'
  );

  // Verifier admin (lacks manage_points) attempting adjust_points_ledger_entry
  const { error: noPermAdjErr } = await verifierAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student1.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: 10,
    p_reason: 'Admin lacking manage_points attempting points adjustment',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });
  assert(
    Boolean(noPermAdjErr && (noPermAdjErr.code === '42501' || noPermAdjErr.message.includes('manage_points'))),
    'P9-SEC-02',
    'Admin without manage_points permission rejected with 42501'
  );

  // Student 1 querying their own points summary -> succeeds
  const { data: ownSummary, error: ownSumErr } = await student1.client.rpc('get_student_points_summary', {
    p_student_id: student1.userId,
  });
  assert(!ownSumErr && ownSummary && (ownSummary as any).student_id === student1.userId, 'P9-SEC-03', 'Student can access their own points summary');

  // Student 1 attempting to query Student 2 points summary -> rejected with 42501
  const { error: otherSumErr } = await student1.client.rpc('get_student_points_summary', {
    p_student_id: student2.userId,
  });
  assert(
    Boolean(otherSumErr && (otherSumErr.code === '42501' || otherSumErr.message.includes('Access denied'))),
    'P9-SEC-04',
    'Student attempting to access another student points summary rejected with 42501'
  );

  // Admin with manage_points can query student points summary
  const { data: adminViewSummary, error: adminSumErr } = await pointsAdmin.client.rpc('get_student_points_summary', {
    p_student_id: student1.userId,
  });
  assert(!adminSumErr && adminViewSummary && (adminViewSummary as any).student_id === student1.userId, 'P9-SEC-05', 'Authorized admin can inspect student points summary');

  // Student attempting set_hackathon_academic_period
  const { error: stdPeriodErr } = await student1.client.rpc('set_hackathon_academic_period', {
    p_hackathon_id: hackathonId,
    p_academic_year: '2026-2027',
    p_academic_term: 'even_sem',
  });
  assert(
    Boolean(stdPeriodErr && (stdPeriodErr.code === '42501' || stdPeriodErr.message.includes('Unauthorized'))),
    'P9-SEC-06',
    'Student calling set_hackathon_academic_period rejected with 42501'
  );

  // --------------------------------------------------------------------------
  // SECTION 3: Points Adjustments, Ledger Integrity & Accounting Reversals
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Points Ledger Operations & Accounting Reversals ---');

  // Admin awards 25 points adjustment to Student 1
  const { data: adjResult, error: adjErr } = await pointsAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student1.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: 25,
    p_reason: 'Recognition for excellent architectural design in Stage B',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });
  console.log('DEBUG adjResult:', adjResult, 'adjErr:', adjErr);
  assert(!adjErr && adjResult && (adjResult as any).ledger_id, 'P9-LED-01', 'Authorized admin successfully records 25-point adjustment');
  const originalEntryId = (adjResult as any).ledger_id;

  // Verify Student 1 summary shows 25 net points
  const { data: std1SumAfterAdj } = await student1.client.rpc('get_student_points_summary', {
    p_student_id: student1.userId,
  });
  assert(
    std1SumAfterAdj && (std1SumAfterAdj as any).total_points === 25,
    'P9-LED-02',
    'Student points summary accurately reflects 25 net points after adjustment'
  );

  // Zero-Floor Enforcement: Non-Super Admin attempting adjustment that would drive balance negative (-30 from 25)
  const { error: floorErr } = await pointsAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student1.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: -30,
    p_reason: 'Penalty attempting to breach zero-floor without super admin',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });
  assert(
    Boolean(floorErr && (floorErr.message.includes('below zero') || floorErr.code === 'P0001')),
    'P9-LED-03',
    'Zero-floor policy stops adjustment driving balance negative'
  );

  // Ordinary admin attempting allow_negative = true override -> rejected because not super admin
  const { error: nonSaFloorErr } = await pointsAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student1.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: -30,
    p_reason: 'Ordinary admin trying to override zero-floor constraint',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: true,
  });
  assert(
    Boolean(nonSaFloorErr && (nonSaFloorErr.code === '42501' || nonSaFloorErr.message.includes('Super admin'))),
    'P9-LED-04',
    'Negative-floor override strictly rejected for non-super-admin'
  );

  // Option 2A: Exact Accounting Reversal of original entry (25 points)
  // An exact reversal uses reverse_points_ledger_entry and issues an exact negative quantity (-25).
  const { data: revResult, error: revErr } = await pointsAdmin.client.rpc('reverse_points_ledger_entry', {
    p_ledger_id: originalEntryId,
    p_reason: 'Reversing erroneous 25-point design award following faculty review',
  });
  assert(!revErr && revResult && (revResult as any).reversal_ledger_id, 'P9-LED-05', 'Exact accounting reversal (Option 2A) records successfully');

  // Verify Student 1 net points returned to 0
  const { data: std1SumAfterRev } = await student1.client.rpc('get_student_points_summary', {
    p_student_id: student1.userId,
  });
  assert(
    std1SumAfterRev && (std1SumAfterRev as any).total_points === 0,
    'P9-LED-06',
    'Student 1 balance returned to 0 after exact reversal'
  );

  // Option 2A Integrity: Exact reversal works even if resulting balance is negative
  // Give Student 2 an adjustment of 10 points
  const { data: s2Adj1 } = await pointsAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student2.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: 10,
    p_reason: 'Preliminary bonus awarded before review',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });
  const s2Entry1Id = (s2Adj1 as any).ledger_id;

  // Deduct 5 points manually (balance becomes 5)
  await pointsAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student2.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: -5,
    p_reason: 'Administrative correction bringing balance down to 5',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });

  // Now execute exact reversal of s2Entry1 (reversing 10 points: 5 - 10 = -5).
  // Under Option 2A accounting standard, an exact reversal of an original entry must NOT be blocked by zero-floor.
  const { data: s2RevResult, error: s2RevErr } = await pointsAdmin.client.rpc('reverse_points_ledger_entry', {
    p_ledger_id: s2Entry1Id,
    p_reason: 'Option 2A exact reversal of 10-point preliminary bonus',
  });
  assert(!s2RevErr && s2RevResult && (s2RevResult as any).reversal_ledger_id, 'P9-LED-07', 'Option 2A exact reversal succeeds even when resulting balance dips negative (-5)');

  const { data: std2SumAfterRev } = await student2.client.rpc('get_student_points_summary', {
    p_student_id: student2.userId,
  });
  assert(
    std2SumAfterRev && (std2SumAfterRev as any).total_points === -5,
    'P9-LED-08',
    'Student 2 net balance is accurately -5 following Option 2A reversal'
  );

  // Super Admin negative-floor override test on Student 3
  const { data: saAdj, error: saAdjErr } = await superAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student3.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team2Id,
    p_points: -15,
    p_reason: 'Super admin institutional disciplinary deduction overriding zero-floor',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: true,
  });
  assert(!saAdjErr && saAdj && (saAdj as any).ledger_id, 'P9-LED-09', 'Super Admin successfully applies negative adjustment with override');

  // Verify audit log record exists for the adjustments
  const { data: auditEntries } = await adminClient
    .from('audit_logs')
    .select('*')
    .in('action', ['points.adjusted', 'points.reversed'])
    .order('created_at', { ascending: false })
    .limit(5);
  assert(
    Boolean(auditEntries && auditEntries.length > 0),
    'P9-AUD-01',
    'points.adjusted/points.reversed action logged in immutable audit_logs table'
  );

  // --------------------------------------------------------------------------
  // SECTION 4: Platform Leaderboard, Dense Ranking & Filters
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Platform Leaderboard & Dense Ranking ---');

  // Set up controlled points for ranking:
  // Give Student 1: 50 points
  await superAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student1.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: 50,
    p_reason: 'Championship qualification points',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });

  // Give Student 2: 55 points (so -5 + 55 = 50 points -> TIED with Student 1!)
  await superAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student2.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team1Id,
    p_points: 55,
    p_reason: 'Championship qualification points',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });

  // Give Student 3: 40 points (so -15 + 40 = 25 points -> Rank 2)
  await superAdmin.client.rpc('adjust_points_ledger_entry', {
    p_student_id: student3.userId,
    p_hackathon_id: hackathonId,
    p_team_id: team2Id,
    p_points: 40,
    p_reason: 'Championship runner up points',
    p_idempotency_key: crypto.randomUUID(),
    p_override_negative_floor: false,
  });

  // Query platform leaderboard with no filters (authenticated as Super Admin or Student)
  const { data: boardAll, error: boardErr } = await superAdmin.client.rpc('get_platform_leaderboard', {
    p_academic_year: null,
    p_event_academic_year: null,
    p_event_term: null,
    p_limit: 100,
    p_offset: 0,
  });
  assert(!boardErr && Array.isArray(boardAll), 'P9-RNK-01', 'get_platform_leaderboard query executes successfully');

  // Verify tied rank: Student 1 (50 pts) and Student 2 (50 pts) must both have dense_rank
  const s1Board = boardAll?.find((b: any) => b.student_id === student1.userId);
  const s2Board = boardAll?.find((b: any) => b.student_id === student2.userId);
  const s3Board = boardAll?.find((b: any) => b.student_id === student3.userId);

  assert(
    Boolean(s1Board && s2Board && s1Board.total_points === 50 && s2Board.total_points === 50),
    'P9-RNK-02',
    'Student 1 and Student 2 tied at 50 net points'
  );
  assert(
    Boolean(s1Board && s2Board && s1Board.rank === s2Board.rank),
    'P9-RNK-03',
    `Dense rank preserves ties: Student 1 rank ${s1Board?.rank} equals Student 2 rank ${s2Board?.rank}`
  );
  assert(
    Boolean(s3Board && s3Board.total_points === 25 && s3Board.rank > s1Board.rank),
    'P9-RNK-04',
    `Student 3 with 25 points is ranked below top leaders (rank ${s3Board?.rank} > ${s1Board?.rank})`
  );

  // Verify dense ranking has zero gaps across distinct point values in result set
  const distinctRanks = [...new Set(boardAll?.map((b: any) => b.rank))];
  const hasNoGaps = distinctRanks.every((rnk, idx) => rnk === idx + 1);
  assert(hasNoGaps, 'P9-RNK-05', `Dense rank has zero gaps: ranks are ${distinctRanks.join(', ')}`);

  // Filter by study year = 3 (Student 1 & Student 2 are Year 3; Student 3 is Year 4)
  const { data: boardYear3 } = await superAdmin.client.rpc('get_platform_leaderboard', {
    p_academic_year: 3,
    p_event_academic_year: null,
    p_event_term: null,
    p_limit: 10,
    p_offset: 0,
  });
  const hasOnlyYear3 = boardYear3?.every((b: any) => b.academic_year === 3);
  assert(
    Boolean(hasOnlyYear3 && boardYear3?.some((b: any) => b.student_id === student1.userId)),
    'P9-FLT-01',
    'Filter by study_year=3 correctly filters leaderboard to Year 3 students only'
  );

  // Filter by academic period: academic_year = '2026-2027', academic_term = 'odd_sem'
  const { data: boardOddSem } = await superAdmin.client.rpc('get_platform_leaderboard', {
    p_academic_year: null,
    p_event_academic_year: '2026-2027',
    p_event_term: 'odd_sem',
    p_limit: 10,
    p_offset: 0,
  });
  assert(
    Boolean(boardOddSem && boardOddSem.some((b: any) => b.student_id === student1.userId)),
    'P9-FLT-02',
    'Leaderboard filters points by event academic year and semester'
  );

  // Filter by different semester ('even_sem'): should return 0 entries for these events
  const { data: boardEvenSem } = await superAdmin.client.rpc('get_platform_leaderboard', {
    p_academic_year: null,
    p_event_academic_year: '2026-2027',
    p_event_term: 'even_sem',
    p_limit: 10,
    p_offset: 0,
  });
  const hasNoMatchingEvents = !boardEvenSem?.some((b: any) => b.student_id === student1.userId);
  assert(
    hasNoMatchingEvents,
    'P9-FLT-03',
    'Leaderboard does not leak points from different academic periods (no inference from event dates)'
  );

  // PII Protection: verify returned columns
  const firstEntry = boardAll?.[0];
  const keys = Object.keys(firstEntry || {});
  assert(!keys.includes('email'), 'P9-PII-01', 'Leaderboard does not expose student email');
  assert(!keys.includes('phone'), 'P9-PII-02', 'Leaderboard does not expose student phone number');
  assert(!keys.includes('usn'), 'P9-PII-03', 'Leaderboard does not expose student USN');
  assert(keys.includes('full_name'), 'P9-PII-04', 'Leaderboard exposes display name');
  assert(keys.includes('branch'), 'P9-PII-05', 'Leaderboard exposes academic branch');

  // Pagination boundaries
  const { data: pagedEntries } = await superAdmin.client.rpc('get_platform_leaderboard', {
    p_academic_year: null,
    p_event_academic_year: null,
    p_event_term: null,
    p_limit: 1,
    p_offset: 0,
  });
  assert(pagedEntries?.length === 1, 'P9-PAG-01', 'Leaderboard obeys limit parameter strictly');

  // --------------------------------------------------------------------------
  // SECTION 5: Permanent Lockout of Winner Bonuses
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Winner Bonus Lockout Integrity ---');

  // Point configuration for win_placement is disabled in table
  const { data: winConfig } = await adminClient
    .from('point_configurations')
    .select('*')
    .eq('milestone_type', 'win_placement')
    .single();

  assert(
    winConfig?.is_active === false &&
      winConfig?.regular_member_points === 0 &&
      winConfig?.team_leader_points === 0,
    'P9-WIN-01',
    'win_placement point configuration is deactivated with 0 points'
  );

  // Attempting to update point_configurations as ordinary admin
  const { data: updatedRows, error: nonSaConfigErr } = await pointsAdmin.client
    .from('point_configurations')
    .update({ regular_member_points: 100 })
    .eq('milestone_type', 'win_placement')
    .select();

  const { data: verifyUntouched } = await adminClient
    .from('point_configurations')
    .select('*')
    .eq('milestone_type', 'win_placement')
    .single();

  assert(
    (!updatedRows || updatedRows.length === 0) && verifyUntouched?.regular_member_points === 0,
    'P9-WIN-02',
    'Ordinary admin blocked by RLS from altering point_configurations (0 rows updated)'
  );

  // Even Super Admin cannot reactivate win_placement (database trigger trg_point_configs_block_win_placement blocks it)
  const { error: reactivateErr } = await superAdmin.client
    .from('point_configurations')
    .update({ is_active: true })
    .eq('milestone_type', 'win_placement');

  assert(
    Boolean(reactivateErr),
    'P9-WIN-03',
    'Database trigger strictly prevents reactivation of win_placement even for super admin'
  );

  console.log('\n============================================================');
  console.log(`   PHASE 9.2 TEST RESULTS: ${passedAssertions} / ${totalAssertions} ASSERTIONS PASSED`);
  console.log('============================================================\n');
  } finally {
    if (createdUserIds.length > 0 || createdHackathonIds.length > 0) {
      const uList = createdUserIds.map((u) => `'${u}'`).join(', ');
      const hList = createdHackathonIds.map((h) => `'${h}'`).join(', ');
      const cleanupSql = `
        BEGIN;
        SET LOCAL session_replication_role = 'replica';
        DELETE FROM public.points_ledger WHERE ${hList ? `hackathon_id IN (${hList}) OR ` : ''}student_id IN (${uList});
        DELETE FROM public.team_members WHERE ${hList ? `hackathon_id IN (${hList}) OR ` : ''}student_id IN (${uList});
        ${hList ? `DELETE FROM public.teams WHERE hackathon_id IN (${hList});` : ''}
        ${hList ? `DELETE FROM public.hackathon_rounds WHERE hackathon_id IN (${hList});` : ''}
        ${hList ? `DELETE FROM public.hackathons WHERE id IN (${hList});` : ''}
        DELETE FROM public.admin_permissions WHERE admin_id IN (${uList});
        DELETE FROM public.admin_profiles WHERE id IN (${uList});
        DELETE FROM public.profiles WHERE id IN (${uList});
        DELETE FROM auth.users WHERE id IN (${uList});
        COMMIT;
      `;
      try {
        execSync(`docker exec -i supabase_db_hackleague psql -U postgres -d postgres -c "${cleanupSql}"`, {
          stdio: 'ignore',
        });
        console.log('  ✓ [TEARDOWN-CLEAN] Integration test fixtures safely purged post-execution\n');
      } catch (err) {
        console.warn('  ⚠️ Teardown notice:', err);
      }
    }
  }
}

runPhase9IntegrationTests().catch((err) => {
  console.error('\n❌ Phase 9.2 Test Suite failed:', err);
  process.exit(1);
});
