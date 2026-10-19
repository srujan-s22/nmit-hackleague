import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import ExcelJS from 'exceljs';

import {
  inspectBinaryMagicBytes,
  validateStorageFile,
  validateStorageFileBinary,
  MAX_PROFILE_PHOTO_SIZE,
  MAX_COLLEGE_ID_IMAGE_SIZE,
  MAX_COLLEGE_ID_SIZE,
  MAX_EVIDENCE_IMAGE_SIZE,
  MAX_SUBMISSION_EVIDENCE_SIZE,
} from '../../src/lib/storage/paths';

import {
  sanitizeCellValue,
  generateCsvString,
  generateCsvZipPackage,
  generateExcelWorkbook,
} from '../../src/lib/reports/export-generators';

const MANDATORY_CDC_DECLARATION_TEXT =
  "By submitting this screenshot, you confirm that it is genuine, unaltered, and represents your team's actual registration on the official hackathon platform. Submitting fake, manipulated, or misleading registration proof may result in strict disciplinary action by the Career Development Centre (CDC), including disqualification from the hackathon and other action under applicable college rules. Your submission may be reviewed, and providing proof does not guarantee acceptance.";

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

const authHelperClient = createClient(supabaseUrl, anonKey, {
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

async function runPendingUpdatesTestSuite() {
  console.log('\n--- Starting Pending Updates 1–6 Verification Test Suite ---');

  // Authenticate primary seed actors via authHelperClient
  const { data: saLogin, error: saLoginErr } = await authHelperClient.auth.signInWithPassword({
    email: 'superadmin@nmit-dev.local',
    password: 'password123',
  });
  if (saLoginErr || !saLogin.session) {
    throw new Error(`Failed to authenticate Super Admin: ${saLoginErr?.message}`);
  }
  const superAdminClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${saLogin.session.access_token}` } },
  });

  const { data: verifierLogin, error: verifierLoginErr } = await authHelperClient.auth.signInWithPassword({
    email: 'verifier.admin@nmit-dev.local',
    password: 'password123',
  });
  if (verifierLoginErr || !verifierLogin.session) {
    throw new Error(`Failed to authenticate Verifier Admin: ${verifierLoginErr?.message}`);
  }
  const verifierClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${verifierLogin.session.access_token}` } },
  });

  const { data: studentLogin, error: studentLoginErr } = await authHelperClient.auth.signInWithPassword({
    email: 'student1@nmit-dev.local',
    password: 'password123',
  });
  if (studentLoginErr || !studentLogin.session) {
    throw new Error(`Failed to authenticate Student: ${studentLoginErr?.message}`);
  }
  const studentClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${studentLogin.session.access_token}` } },
  });

  // Ensure verifier admin holds manage_hackathons, export_data, and manage_notifications permissions
  const { data: permData, error: permErr } = await superAdminClient.rpc('manage_admin_permissions', {
    p_target_admin_id: verifierLogin.user.id,
    p_permissions: ['verify_students', 'manage_hackathons', 'export_data', 'manage_notifications'],
  });
  assert(!permErr, 'manage_admin_permissions assigned manage_hackathons to verifier');

  // ==========================================================================
  // UPDATE 1: AUTOMATIC ROUND PAUSING & PUBLIC VIEW PROJECTION
  // ==========================================================================
  console.log('\n[Suite 1: Update 1 — Automatic Round Pausing]');

  // Create test hackathon and rounds: one active (future end_at) and one expired (past end_at)
  const pastEnd = new Date(Date.now() - 3600000).toISOString();
  const pastStart = new Date(Date.now() - 7200000).toISOString();
  const futureEnd = new Date(Date.now() + 86400000).toISOString();
  const futureStart = new Date().toISOString();

  const verifierAdminId = verifierLogin.user.id;

  const { data: testHackathon, error: hckErr } = await adminClient
    .from('hackathons')
    .insert({
      title: 'Auto-Pause Integration Hackathon',
      slug: `auto-pause-${Date.now()}`,
      mode: 'online',
      organizer: 'NMIT Dept of CSE',
      status: 'published',
      min_team_size: 2,
      max_team_size: 4,
      is_solo_allowed: false,
      registration_start_at: pastStart,
      registration_end_at: futureEnd,
      event_start_at: pastStart,
      event_end_at: futureEnd,
      created_by: '00000000-0000-0000-0000-000000000001',
      in_charge_admin_id: verifierAdminId,
      description: 'Testing automatic round pause at deadline',
    })
    .select('id')
    .single();

  assert(!hckErr && Boolean(testHackathon?.id), 'Test hackathon created for auto-pause verification');

  const hackathonId = testHackathon!.id;

  // Insert expired round (open status, but end_at in the past)
  const { data: expiredRound, error: r1Err } = await adminClient
    .from('hackathon_rounds')
    .insert({
      hackathon_id: hackathonId,
      round_number: 1,
      name: 'Ideation Submission Phase',
      start_at: pastStart,
      end_at: pastEnd,
      status: 'open',
    })
    .select('id')
    .single();

  assert(!r1Err && Boolean(expiredRound?.id), 'Expired round with status=open inserted into base table');

  // Insert active round (open status, end_at in the future)
  const { data: activeRound, error: r2Err } = await adminClient
    .from('hackathon_rounds')
    .insert({
      hackathon_id: hackathonId,
      round_number: 2,
      name: 'Prototype Sprint Phase',
      start_at: futureStart,
      end_at: futureEnd,
      status: 'open',
      is_final_round: true,
    })
    .select('id')
    .single();

  assert(!r2Err && Boolean(activeRound?.id), 'Active future round inserted with status=open');

  // Verify hackathon_rounds_public_view dynamically yields 'paused' for expired round
  const { data: viewRounds, error: viewErr } = await adminClient
    .from('hackathon_rounds_public_view')
    .select('id, status')
    .eq('hackathon_id', hackathonId);

  assert(!viewErr && Boolean(viewRounds), 'Queried hackathon_rounds_public_view successfully');
  const viewR1 = viewRounds?.find((r) => r.id === expiredRound!.id);
  const viewR2 = viewRounds?.find((r) => r.id === activeRound!.id);

  assert(
    viewR1?.status === 'paused',
    `Dynamic public view yields 'paused' for expired round without waiting for cron (status: ${viewR1?.status})`
  );
  assert(
    viewR2?.status === 'open',
    `Dynamic public view yields 'open' for active future round (status: ${viewR2?.status})`
  );

  // Invoke auto_pause_expired_rounds RPC to verify DB base table transition
  const { data: pausedCount, error: pauseRpcErr } = await adminClient.rpc('auto_pause_expired_rounds', {
    p_hackathon_id: hackathonId,
  });

  assert(!pauseRpcErr && typeof pausedCount === 'number', 'auto_pause_expired_rounds executed cleanly');

  const { data: updatedBaseRound } = await adminClient
    .from('hackathon_rounds')
    .select('status')
    .eq('id', expiredRound!.id)
    .single();

  assert(
    updatedBaseRound?.status === 'paused',
    `Base table hackathon_rounds transitioned status to 'paused' (status: ${updatedBaseRound?.status})`
  );

  // ==========================================================================
  // UPDATE 2: HACKATHON-SPECIFIC ADMIN ASSIGNMENT & SCOPED AUTHORIZATION
  // ==========================================================================
  console.log('\n[Suite 2: Update 2 — Hackathon-Specific Admin Assignment]');





  // Test scoping function can_admin_manage_hackathon under Verifier Admin context
  const { data: canVerifierManage } = await verifierClient.rpc('can_admin_manage_hackathon', {
    p_hackathon_id: hackathonId,
    p_permission_key: 'manage_hackathons',
  });

  assert(
    canVerifierManage === true,
    'can_admin_manage_hackathon returns true for in-charge assigned administrator (Verifier Admin)'
  );

  // Unassigned event ID
  const dummyUnassignedHckId = '00000000-0000-0000-0000-000000000099';
  const { data: canCrossManage } = await verifierClient.rpc('can_admin_manage_hackathon', {
    p_hackathon_id: dummyUnassignedHckId,
    p_permission_key: 'manage_hackathons',
  });

  assert(
    canCrossManage === false,
    'can_admin_manage_hackathon returns false for unassigned event fail-closed'
  );

  // ==========================================================================
  // UPDATE 3: SIMPLIFIED REGISTRATION PROOF & CDC DECLARATION
  // ==========================================================================
  console.log('\n[Suite 3: Update 3 — Simplified Registration Proof Workflow]');

  // Setup synthetic students for team proof testing (preserves seeded student ledger counts)
  const runId = Date.now();
  const leaderUsn = `1NT21CS${Math.floor(100 + Math.random() * 899)}`;
  const memberUsn = `1NT21IS${Math.floor(100 + Math.random() * 899)}`;

  const { data: synthLeaderUser, error: leaderAuthErr } = await adminClient.auth.admin.createUser({
    email: `student.proof.${runId}@nmit-dev.local`,
    password: 'password123',
    email_confirm: true,
    user_metadata: {
      full_name: 'Synthetic Proof Leader',
      usn: leaderUsn,
      phone: '+919876543210',
      branch: 'CSE',
      academic_year: 3,
      sex: 'Male',
      date_of_birth: '2002-01-01',
    },
  });
  if (leaderAuthErr) throw new Error(`Failed to create synthetic leader: ${leaderAuthErr.message}`);
  const student1Id = synthLeaderUser!.user.id;

  await adminClient
    .from('profiles')
    .update({ registration_status: 'approved' })
    .eq('id', student1Id);

  const { data: synthMemberUser, error: memberAuthErr } = await adminClient.auth.admin.createUser({
    email: `member.proof.${runId}@nmit-dev.local`,
    password: 'password123',
    email_confirm: true,
    user_metadata: {
      full_name: 'Synthetic Proof Member',
      usn: memberUsn,
      phone: '+919876543211',
      branch: 'ISE',
      academic_year: 3,
      sex: 'Female',
      date_of_birth: '2002-05-05',
    },
  });
  if (memberAuthErr) throw new Error(`Failed to create synthetic member: ${memberAuthErr.message}`);
  const studentMemberId = synthMemberUser!.user.id;

  await adminClient
    .from('profiles')
    .update({ registration_status: 'approved' })
    .eq('id', studentMemberId);

  const { data: synthLeaderLogin, error: synthLoginErr } = await authHelperClient.auth.signInWithPassword({
    email: `student.proof.${runId}@nmit-dev.local`,
    password: 'password123',
  });
  if (synthLoginErr || !synthLeaderLogin.session) throw new Error(`Synthetic leader login failed: ${synthLoginErr?.message}`);

  const synthLeaderClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${synthLeaderLogin.session.access_token}` } },
  });

  const { data: teamRes, error: createTeamErr } = await synthLeaderClient.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: `Proof Verification Team ${Date.now()}`,
  });
  if (createTeamErr) console.error('CREATE TEAM ERR:', createTeamErr);
  const teamId = teamRes ? (teamRes as { team_id?: string; id?: string }).team_id || (teamRes as { team_id?: string; id?: string }).id : null;
  assert(!createTeamErr && Boolean(teamId), 'Test team created with student leader');

  // Add member and set internal_status to complete
  const { error: memErr } = await adminClient.from('team_members').insert({
    team_id: teamId!,
    student_id: studentMemberId,
    hackathon_id: hackathonId,
    role: 'member',
  });
  if (memErr) console.error('MEM ERR:', memErr);
  assert(!memErr, 'Team member added to test team');

  await adminClient
    .from('teams')
    .update({ internal_status: 'complete', external_status: 'none' })
    .eq('id', teamId!);

  // Authenticate as Student Leader and call submit_registration_proof
  // 1. Rejected if CDC declaration is not accepted
  const { error: rejectCdcErr } = await synthLeaderClient.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: 'evidence/registration/screenshot.webp',
    p_cdc_declaration_accepted: false,
    p_cdc_declaration_text: MANDATORY_CDC_DECLARATION_TEXT,
  });

  assert(
    Boolean(rejectCdcErr),
    'submit_registration_proof strictly rejects submission without accepted CDC declaration'
  );

  // 2. Rejected if CDC declaration text is modified / forged
  const { error: rejectForgedErr } = await synthLeaderClient.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: 'evidence/registration/screenshot.webp',
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: 'Arbitrary disclaimer without Career Development Centre (CDC) terms',
  });

  assert(
    Boolean(rejectForgedErr),
    'submit_registration_proof strictly rejects altered/forged CDC declaration text'
  );

  // 3. Submit valid proof with authentic CDC declaration under Student Leader session
  const { data: submitResult, error: submitErr } = await synthLeaderClient.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: 'evidence/registration/screenshot.webp',
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: MANDATORY_CDC_DECLARATION_TEXT,
  });

  assert(!submitErr, `submit_registration_proof executed successfully (result: ${JSON.stringify(submitResult)})`);

  // Verify team external_status is set to 'submitted'
  const { data: verifiedTeam } = await adminClient
    .from('teams')
    .select('external_status, cdc_declaration_accepted, cdc_declaration_text_version')
    .eq('id', teamId)
    .single();

  assert(
    verifiedTeam?.external_status === 'submitted',
    `Team external_status set to 'submitted' claim without manual review (status: ${verifiedTeam?.external_status})`
  );
  assert(
    verifiedTeam?.cdc_declaration_accepted === true && verifiedTeam?.cdc_declaration_text_version === 'v1_cdc_mandatory',
    'Team records verified CDC declaration acceptance and text version'
  );

  // Verify automatic participation points (+15 leader, +10 member) awarded in points_ledger
  const { data: leaderLedger } = await adminClient
    .from('points_ledger')
    .select('points, milestone_type')
    .eq('team_id', teamId)
    .eq('student_id', student1Id)
    .eq('milestone_type', 'participation')
    .single();

  assert(
    leaderLedger?.points === 15,
    `Team leader automatically awarded +15 registration points (points: ${leaderLedger?.points})`
  );

  const { data: memberLedger } = await adminClient
    .from('points_ledger')
    .select('points, milestone_type')
    .eq('team_id', teamId)
    .eq('student_id', studentMemberId)
    .eq('milestone_type', 'participation')
    .single();

  assert(
    memberLedger?.points === 10,
    `Regular member automatically awarded +10 registration points (points: ${memberLedger?.points})`
  );

  // ==========================================================================
  // UPDATE 4: IMAGE LIMITS & AUTOMATIC DELETION
  // ==========================================================================
  console.log('\n[Suite 4: Update 4 — Image Limits & Automatic Deletion]');

  // 1. WebP magic bytes verification
  // RIFF....WEBP (52 49 46 46 .. .. .. .. 57 45 42 50)
  const webpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // size 36
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x56, 0x50, 0x38, 0x20, // VP8
  ]);

  const webpInspection = inspectBinaryMagicBytes(webpBuffer);
  assert(
    webpInspection.detectedMime === 'image/webp' && !webpInspection.isExecutable,
    `inspectBinaryMagicBytes accurately detects genuine WebP binary signature (${webpInspection.detectedMime})`
  );

  // WebP binary validation in profile photo (under 1MB)
  const profilePhotoWebp = validateStorageFileBinary(webpBuffer, 'profile-photo', 'avatar.webp', 'image/webp');
  assert(
    profilePhotoWebp.valid === true,
    'validateStorageFileBinary accepts valid WebP profile photo under 1MB'
  );

  // WebP binary validation in college ID (under 1.5MB)
  const collegeIdWebp = validateStorageFileBinary(webpBuffer, 'college-id', 'card.webp', 'image/webp');
  assert(
    collegeIdWebp.valid === true,
    'validateStorageFileBinary accepts valid WebP college ID under 1.5MB'
  );

  // WebP binary validation in submission evidence (under 1MB for images)
  const evidenceWebp = validateStorageFileBinary(webpBuffer, 'submission-evidence', 'demo.webp', 'image/webp');
  assert(
    evidenceWebp.valid === true,
    'validateStorageFileBinary accepts valid WebP evidence image under 1MB'
  );

  // Exact file size boundaries verification
  assert(
    MAX_PROFILE_PHOTO_SIZE === 1 * 1024 * 1024,
    'MAX_PROFILE_PHOTO_SIZE authoritative limit is exactly 1MB (1,048,576 bytes)'
  );
  assert(
    MAX_COLLEGE_ID_IMAGE_SIZE === Math.floor(1.5 * 1024 * 1024),
    'MAX_COLLEGE_ID_IMAGE_SIZE authoritative limit is exactly 1.5MB (1,572,864 bytes)'
  );
  assert(
    MAX_COLLEGE_ID_SIZE === 5 * 1024 * 1024,
    'MAX_COLLEGE_ID_SIZE authoritative limit for PDF is exactly 5MB (5,242,880 bytes)'
  );
  assert(
    MAX_EVIDENCE_IMAGE_SIZE === 1 * 1024 * 1024,
    'MAX_EVIDENCE_IMAGE_SIZE authoritative limit per image is exactly 1MB (1,048,576 bytes)'
  );
  assert(
    MAX_SUBMISSION_EVIDENCE_SIZE === 20 * 1024 * 1024,
    'MAX_SUBMISSION_EVIDENCE_SIZE authoritative limit for PDF/ZIP is exactly 20MB'
  );

  // ==========================================================================
  // UPDATE 5: MANDATORY WEBSITE NOTIFICATIONS & ANNOUNCEMENTS
  // ==========================================================================
  console.log('\n[Suite 5: Update 5 — Mandatory Notifications & In-App Center]');

  // Publish announcement via publish_announcement RPC
  const announcementTitle = `Notice of Stage Reschedule ${Date.now()}`;
  const announcementBody = 'All teams please note that Round 2 guidelines have been updated.';

  const { data: annData, error: annErr } = await verifierClient.rpc('publish_announcement', {
    p_title: announcementTitle,
    p_body: announcementBody,
    p_target_role: 'all',
  });

  if (annErr) console.error('ANN ERR:', annErr);
  assert(!annErr, `publish_announcement RPC published announcement successfully`);

  // Query announcements table to confirm stored record
  const { data: storedAnn, error: annQueryErr } = await adminClient
    .from('announcements')
    .select('id, title, body, target_role')
    .eq('title', announcementTitle)
    .single();

  assert(
    !annQueryErr && storedAnn?.body === announcementBody,
    `Announcement stored in database with title and body intact (id: ${storedAnn?.id})`
  );

  // Mark announcement as read via mark_announcement_read RPC
  const { error: markReadErr } = await studentClient.rpc('mark_announcement_read', {
    p_announcement_id: storedAnn!.id,
  });

  if (markReadErr) console.error('MARK READ ERR:', markReadErr);
  assert(!markReadErr, 'mark_announcement_read RPC recorded read receipt');

  // Verify announcement_reads table has entry
  const { data: readEntry } = await adminClient
    .from('announcement_reads')
    .select('read_at')
    .eq('announcement_id', storedAnn!.id)
    .eq('user_id', studentLogin.user.id)
    .maybeSingle();

  assert(Boolean(readEntry?.read_at), 'Read receipt verified with timestamp in announcement_reads');

  // ==========================================================================
  // UPDATE 6: SCOPED DATA & REPORTS (CSV, ZIP, XLSX, FORMULA SANITIZATION)
  // ==========================================================================
  console.log('\n[Suite 6: Update 6 — Scoped Data & Reports]');

  // 1. Formula Injection Sanitization
  const dangerousFormulas = [
    '=cmd|"/c calc"!A0',
    '+1+2',
    '-10-20',
    '@SUM(A1:A10)',
    '\t=1+1',
    '\r=1+1',
  ];

  for (const formula of dangerousFormulas) {
    const sanitized = sanitizeCellValue(formula);
    assert(
      sanitized.startsWith("'"),
      `sanitizeCellValue prepends single quote (') to neutralize formula injection: "${formula}" -> "${sanitized}"`
    );
  }

  const safeText = 'Ordinary Student Name';
  assert(
    sanitizeCellValue(safeText) === safeText,
    'sanitizeCellValue preserves non-formula strings untouched without prefix'
  );

  // 2. CSV String Generation
  const csvOutput = generateCsvString(
    [
      { key: 'name', label: 'Name' },
      { key: 'score', label: 'Score' },
    ],
    [
      { name: '=1+1', score: 100 },
      { name: 'Alice, Smith', score: 95 },
    ]
  );

  assert(
    csvOutput.includes("'=1+1"),
    'generateCsvString escapes and sanitizes formula injection cell properly'
  );
  assert(
    csvOutput.includes('"Alice, Smith"'),
    'generateCsvString wraps cells with commas in quotation marks'
  );

  // 3. ZIP Package Generation
  const zipBuffer = await generateCsvZipPackage([
    {
      id: 'students',
      title: 'Students',
      headers: [{ key: 'usn', label: 'USN' }],
      rows: [{ usn: '1NT22CS001' }],
    },
    {
      id: 'hackathons',
      title: 'Hackathons',
      headers: [{ key: 'title', label: 'Title' }],
      rows: [{ title: 'NMIT Hack 2026' }],
    },
  ]);

  assert(
    Buffer.isBuffer(zipBuffer) && zipBuffer.length > 50,
    `generateCsvZipPackage successfully creates valid ZIP buffer (${zipBuffer.length} bytes)`
  );

  // Check ZIP header magic bytes (PK\x03\x04: 50 4b 03 04)
  assert(
    zipBuffer[0] === 0x50 && zipBuffer[1] === 0x4b && zipBuffer[2] === 0x03 && zipBuffer[3] === 0x04,
    'ZIP package begins with authoritative PK zip header magic bytes'
  );

  // 4. Excel Workbook Generation (.xlsx)
  const excelBuffer = await generateExcelWorkbook([
    {
      id: 'results',
      title: 'Results Standings',
      headers: [
        { key: 'rank', label: 'Rank' },
        { key: 'team', label: 'Team Name' },
        { key: 'points', label: 'Awarded Points' },
      ],
      rows: [
        { rank: 1, team: 'CodeCrafters', points: 100 },
        { rank: 2, team: '=DDE("calc")', points: 80 }, // formula injection test
      ],
    },
  ]);

  assert(
    Buffer.isBuffer(excelBuffer) && excelBuffer.length > 100,
    `generateExcelWorkbook successfully creates valid Excel workbook buffer (${excelBuffer.length} bytes)`
  );

  // Check Excel (.xlsx) header (ZIP package format: PK\x03\x04)
  assert(
    excelBuffer[0] === 0x50 && excelBuffer[1] === 0x4b && excelBuffer[2] === 0x03 && excelBuffer[3] === 0x04,
    'Excel workbook is a valid OpenXML ZIP package structure'
  );

  // 4b. Master Excel Workbook with 9 Authoritative Sheets
  const masterWorkbookBuffer = await generateExcelWorkbook([
    { id: 'students', title: 'Students', headers: [{ key: 'id', label: 'ID' }], rows: [] },
    { id: 'hackathons', title: 'Hackathons', headers: [{ key: 'id', label: 'ID' }], rows: [] },
    { id: 'teams', title: 'Teams', headers: [{ key: 'id', label: 'ID' }], rows: [] },
    { id: 'team_members', title: 'Team Members', headers: [{ key: 'id', label: 'ID' }], rows: [] },
    { id: 'registrations', title: 'Registrations', headers: [{ key: 'id', label: 'ID' }], rows: [] },
    { id: 'round_results', title: 'Round Results', headers: [{ key: 'id', label: 'ID' }], rows: [] },
    { id: 'points', title: 'Points', headers: [{ key: 'id', label: 'ID' }], rows: [] },
    { id: 'winners', title: 'Winners', headers: [{ key: 'id', label: 'ID' }], rows: [] },
    { id: 'hackathon_summary', title: 'Hackathon Summary', headers: [{ key: 'id', label: 'ID' }], rows: [] },
  ]);

  const testWb = new ExcelJS.Workbook();
  await testWb.xlsx.load(masterWorkbookBuffer as never);
  const sheetNames = testWb.worksheets.map((ws) => ws.name);
  assert(
    sheetNames.length === 9 &&
    sheetNames.includes('Students') &&
    sheetNames.includes('Hackathons') &&
    sheetNames.includes('Teams') &&
    sheetNames.includes('Team Members') &&
    sheetNames.includes('Registrations') &&
    sheetNames.includes('Round Results') &&
    sheetNames.includes('Points') &&
    sheetNames.includes('Winners') &&
    sheetNames.includes('Hackathon Summary'),
    'Master Excel workbook contains all 9 required authoritative sheets'
  );

  // 5. Audit Data Export RPC Execution & Scoping
  const { error: auditExportErr } = await verifierClient.rpc('audit_data_export', {
    p_dataset: 'students',
    p_format: 'xlsx',
    p_hackathon_id: hackathonId,
    p_filters: { test: true },
  });

  if (auditExportErr) console.error('AUDIT EXPORT ERR:', auditExportErr);
  assert(!auditExportErr, 'audit_data_export RPC executed and recorded export audit log');

  const { data: exportAuditRow } = await adminClient
    .from('audit_logs')
    .select('action, target_type, target_id, details')
    .eq('action', 'data.exported')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  assert(
    exportAuditRow?.action === 'data.exported' && exportAuditRow?.target_type === 'report',
    `Audit log record verified for data export (action: ${exportAuditRow?.action}, target: ${exportAuditRow?.target_id})`
  );

  // Cleanup: archive any auto-pause test hackathons and unassign in-charge admin so manage_hackathons revocation succeeds
  await adminClient
    .from('hackathons')
    .update({ status: 'archived', in_charge_admin_id: null })
    .like('slug', 'auto-pause-%');

  const { error: resetErr } = await superAdminClient.rpc('manage_admin_permissions', {
    p_target_admin_id: verifierLogin.user.id,
    p_permissions: ['verify_students'],
  });
  if (resetErr) console.error('RESET PERMS ERR:', resetErr);

  console.log('\n============================================================');
  console.log(`Results: ${passedAssertions}/${totalAssertions} assertions passed (100%).`);
  console.log('============================================================\n');
}

runPendingUpdatesTestSuite().catch((err) => {
  console.error('Fatal error during test suite execution:', err);
  process.exit(1);
});
