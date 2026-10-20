import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Neutralize server-only package when running in standalone tsx integration test environment
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

import { createClient } from '@supabase/supabase-js';

import {
  inspectBinaryMagicBytes,
  validateStorageFileBinary,
  generateRegistrationProofStoragePath,
} from '../../src/lib/storage/paths';

import {
  teamNameSchema,
  createTeamSchema,
  invitationCodeSchema,
  joinTeamSchema,
  leaveTeamSchema,
  removeTeamMemberSchema,
  transferLeadershipSchema,
  regenerateInvitationCodeSchema,
  lockTeamRosterSchema,
  submitRegistrationProofSchema,
  registrationProofFileSchema,
  MANDATORY_CDC_DECLARATION_TEXT,
} from '../../src/lib/validation/team-schemas';

const {
  executeThreeTierOrphanRecovery,
  uploadRegistrationProofScreenshot,
} = require('../../src/lib/storage/registration-proof-service');

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

const anonClient = createClient(supabaseUrl, anonKey, {
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

async function runStageBTestSuite() {
  console.log('\n===============================================================');
  console.log('--- Starting Phase 7 Stage B Verification Test Suite ---');
  console.log('===============================================================\n');

  // ==========================================================================
  // SUITE 1: ZOD SCHEMAS & INPUT VALIDATION
  // ==========================================================================
  console.log('[Suite 1: Zod Schemas & Input Validation]');

  // 1.1 Team name validation
  assert(!teamNameSchema.safeParse('').success, 'teamNameSchema rejects empty string');
  assert(!teamNameSchema.safeParse('ab').success, 'teamNameSchema rejects < 3 characters');
  assert(
    !teamNameSchema.safeParse('A'.repeat(51)).success,
    'teamNameSchema rejects > 50 characters'
  );
  assert(
    !teamNameSchema.safeParse('<script>alert(1)</script>').success,
    'teamNameSchema rejects HTML script tags'
  );
  assert(
    !teamNameSchema.safeParse('Team "Alpha"').success,
    'teamNameSchema rejects quotes'
  );
  assert(
    teamNameSchema.safeParse('Code Warriors 2026_v1.0-alpha').success,
    'teamNameSchema accepts alphanumeric with spaces, dots, underscores, and hyphens'
  );

  // 1.2 Create team schema
  assert(
    !createTeamSchema.safeParse({ hackathonId: 'not-a-uuid', name: 'Team Alpha' }).success,
    'createTeamSchema rejects invalid hackathon UUID'
  );
  const sampleUuid = crypto.randomUUID();
  assert(
    createTeamSchema.safeParse({ hackathonId: sampleUuid, name: 'Team Alpha' }).success,
    'createTeamSchema accepts valid hackathon UUID and name'
  );

  // 1.3 Invitation code schema (12-char Crockford Base32)
  assert(!invitationCodeSchema.safeParse('SHORT').success, 'invitationCodeSchema rejects short code');
  assert(
    !invitationCodeSchema.safeParse('TOOLONGBYFAR123').success,
    'invitationCodeSchema rejects long code'
  );
  assert(
    !invitationCodeSchema.safeParse('234567890ABC').success,
    'invitationCodeSchema rejects "0" (forbidden in Crockford)'
  );
  assert(
    !invitationCodeSchema.safeParse('234567891ABC').success,
    'invitationCodeSchema rejects "1" (forbidden in Crockford)'
  );
  assert(
    !invitationCodeSchema.safeParse('23456789IABC').success,
    'invitationCodeSchema rejects "I" (forbidden in Crockford)'
  );
  assert(
    !invitationCodeSchema.safeParse('23456789OABC').success,
    'invitationCodeSchema rejects "O" (forbidden in Crockford)'
  );
  const validCode = '23456789ABCD';
  const parsedCode = invitationCodeSchema.safeParse(validCode.toLowerCase());
  assert(parsedCode.success, 'invitationCodeSchema accepts valid Crockford code');
  if (parsedCode.success) {
    assert(parsedCode.data === validCode, 'invitationCodeSchema normalizes to uppercase');
  }

  // 1.4 Join team schema
  assert(
    joinTeamSchema.safeParse({ invitationCode: '23456789ABCD' }).success,
    'joinTeamSchema accepts valid invitation code'
  );

  // 1.5 Leave & remove member schemas
  assert(
    leaveTeamSchema.safeParse({ teamId: sampleUuid }).success,
    'leaveTeamSchema accepts valid team UUID'
  );
  assert(
    !leaveTeamSchema.safeParse({ teamId: 'invalid' }).success,
    'leaveTeamSchema rejects malformed team UUID'
  );
  assert(
    removeTeamMemberSchema.safeParse({ teamId: sampleUuid, studentId: crypto.randomUUID() }).success,
    'removeTeamMemberSchema accepts valid UUIDs'
  );
  assert(
    !removeTeamMemberSchema.safeParse({ teamId: sampleUuid, studentId: 'invalid' }).success,
    'removeTeamMemberSchema rejects invalid studentId'
  );

  // 1.6 Transfer leadership, regenerate code, lock roster
  assert(
    transferLeadershipSchema.safeParse({ teamId: sampleUuid, newLeaderId: crypto.randomUUID() }).success,
    'transferLeadershipSchema accepts valid UUIDs'
  );
  assert(
    regenerateInvitationCodeSchema.safeParse({ teamId: sampleUuid }).success,
    'regenerateInvitationCodeSchema accepts valid UUID'
  );
  assert(
    lockTeamRosterSchema.safeParse({ teamId: sampleUuid }).success,
    'lockTeamRosterSchema accepts valid UUID'
  );

  // 1.7 Submit registration proof schema & CDC declaration
  assert(
    !submitRegistrationProofSchema.safeParse({
      teamId: sampleUuid,
      proofPath: 'teams/' + sampleUuid + '/registration/test.png',
      cdcAccepted: false,
      cdcDeclarationText: MANDATORY_CDC_DECLARATION_TEXT,
    }).success,
    'submitRegistrationProofSchema rejects cdcAccepted = false'
  );
  assert(
    !submitRegistrationProofSchema.safeParse({
      teamId: sampleUuid,
      proofPath: 'teams/' + sampleUuid + '/registration/test.png',
      cdcAccepted: true,
      cdcDeclarationText: 'Fake declaration text without required phrases.',
    }).success,
    'submitRegistrationProofSchema rejects tampered CDC declaration text'
  );
  assert(
    submitRegistrationProofSchema.safeParse({
      teamId: sampleUuid,
      proofPath: 'teams/' + sampleUuid + '/registration/test.png',
      cdcAccepted: true,
      cdcDeclarationText: MANDATORY_CDC_DECLARATION_TEXT,
    }).success,
    'submitRegistrationProofSchema accepts valid CDC declaration and proof path'
  );

  // 1.8 Registration proof file metadata schema (1 MB limit, PNG/JPEG/WebP only)
  assert(
    !registrationProofFileSchema.safeParse({ size: 0, type: 'image/png' }).success,
    'registrationProofFileSchema rejects 0-byte file'
  );
  assert(
    !registrationProofFileSchema.safeParse({ size: 1048577, type: 'image/png' }).success,
    'registrationProofFileSchema rejects > 1,048,576 bytes (1 MB limit)'
  );
  assert(
    registrationProofFileSchema.safeParse({ size: 1048576, type: 'image/png' }).success,
    'registrationProofFileSchema accepts exactly 1,048,576 bytes (1 MB)'
  );
  assert(
    !registrationProofFileSchema.safeParse({ size: 50000, type: 'application/pdf' }).success,
    'registrationProofFileSchema rejects PDF documents'
  );
  assert(
    !registrationProofFileSchema.safeParse({ size: 50000, type: 'image/gif' }).success,
    'registrationProofFileSchema rejects GIF images'
  );
  assert(
    registrationProofFileSchema.safeParse({ size: 50000, type: 'image/webp' }).success,
    'registrationProofFileSchema accepts WebP images'
  );

  // ==========================================================================
  // SUITE 2: BINARY MAGIC BYTE VALIDATION & STORAGE PATH GENERATION
  // ==========================================================================
  console.log('\n[Suite 2: Binary Signature & Magic Byte Defense]');

  // 2.1 Genuine PNG buffer
  const genuinePng = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(100, 0),
  ]);
  const pngInspection = inspectBinaryMagicBytes(genuinePng);
  assert(pngInspection.detectedMime === 'image/png', 'inspectBinaryMagicBytes detects genuine PNG');
  assert(!pngInspection.isExecutable, 'PNG is not marked as executable');

  // 2.2 Genuine JPEG buffer
  const genuineJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.alloc(100, 0),
  ]);
  const jpegInspection = inspectBinaryMagicBytes(genuineJpeg);
  assert(jpegInspection.detectedMime === 'image/jpeg', 'inspectBinaryMagicBytes detects genuine JPEG');

  // 2.3 Genuine WebP buffer
  const genuineWebp = Buffer.concat([
    Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x24, 0x00, 0x00, 0x00, // length
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]),
    Buffer.alloc(50, 0),
  ]);
  const webpInspection = inspectBinaryMagicBytes(genuineWebp);
  assert(webpInspection.detectedMime === 'image/webp', 'inspectBinaryMagicBytes detects genuine WebP');

  // 2.4 Executable disguise rejection
  const peExecutable = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ
  const peInspection = inspectBinaryMagicBytes(peExecutable);
  assert(peInspection.isExecutable, 'inspectBinaryMagicBytes detects Windows PE/DOS executable');

  const elfExecutable = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7fELF
  assert(inspectBinaryMagicBytes(elfExecutable).isExecutable, 'inspectBinaryMagicBytes detects Linux ELF');

  const shellScript = Buffer.from('#!/bin/bash\nrm -rf /');
  assert(inspectBinaryMagicBytes(shellScript).isExecutable, 'inspectBinaryMagicBytes detects shell script shebang');

  const htmlSvgAttack = Buffer.from('<svg onload=alert(1)></svg>');
  assert(inspectBinaryMagicBytes(htmlSvgAttack).isExecutable, 'inspectBinaryMagicBytes detects HTML/SVG vector');

  // 2.5 validateStorageFileBinary extension consistency
  const validPngValidation = validateStorageFileBinary(
    genuinePng,
    'submission-evidence',
    'screenshot.png',
    'image/png'
  );
  assert(validPngValidation.valid, 'validateStorageFileBinary passes genuine PNG with .png extension');

  const mismatchedExtValidation = validateStorageFileBinary(
    genuinePng,
    'submission-evidence',
    'screenshot.jpg',
    'image/jpeg'
  );
  assert(
    !mismatchedExtValidation.valid,
    'validateStorageFileBinary rejects PNG binary spoofed with .jpg extension'
  );

  // 2.6 Storage path format generator
  const generatedPath = generateRegistrationProofStoragePath(sampleUuid, 'png');
  const pathRegex = new RegExp(
    `^teams/${sampleUuid}/registration/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.png$`
  );
  assert(
    pathRegex.test(generatedPath),
    'generateRegistrationProofStoragePath produces exact teams/{id}/registration/{uuid}.png format'
  );

  // ==========================================================================
  // SUITE 3: THREE-TIER ORPHAN RECOVERY BEHAVIOR
  // ==========================================================================
  console.log('\n[Suite 3: Three-Tier Resilient Orphan Recovery Unit Tests]');

  const testStudentId = crypto.randomUUID();
  const testTeamId = sampleUuid;
  const testObjectPath = generatedPath;

  // 3.1 Tier 1: Immediate Storage Purge Success
  const mockTier1Client = {
    storage: {
      from: (_bucket: string) => ({
        remove: async (_paths: string[]) => ({ data: [], error: null }),
      }),
    },
  } as unknown as ReturnType<typeof createClient>;

  const tier1Res = await executeThreeTierOrphanRecovery(
    mockTier1Client as any,
    testStudentId,
    undefined,
    testTeamId,
    testObjectPath
  );
  assert(tier1Res.cleanup_state === 'purged_immediately', 'Tier 1 succeeds -> returns purged_immediately');

  // 3.2 Tier 2: Storage Removal Fails -> Queue Insertion Success
  const mockTier2Client = {
    storage: {
      from: (_bucket: string) => ({
        remove: async (_paths: string[]) => ({
          data: null,
          error: { message: 'Storage connection timeout' },
        }),
      }),
    },
    from: (table: string) => {
      if (table === 'storage_deletion_queue') {
        return {
          insert: async (payload: any) => {
            assert(payload.target_type === 'orphaned_registration_proof', 'Tier 2 uses orphaned_registration_proof');
            assert(payload.target_id === testTeamId, 'Tier 2 records teamId');
            return { error: null };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  } as unknown as ReturnType<typeof createClient>;

  const tier2Res = await executeThreeTierOrphanRecovery(
    mockTier2Client as any,
    testStudentId,
    undefined,
    testTeamId,
    testObjectPath
  );
  assert(tier2Res.cleanup_state === 'enqueued_durable', 'Tier 2 succeeds -> returns enqueued_durable');

  // 3.3 Tier 3: Storage Removal Fails AND Queue Insertion Fails -> Emergency Audit Success
  const mockTier3Client = {
    storage: {
      from: (_bucket: string) => ({
        remove: async (_paths: string[]) => ({
          data: null,
          error: { message: 'Storage connection timeout' },
        }),
      }),
    },
    from: (table: string) => {
      if (table === 'storage_deletion_queue') {
        return {
          insert: async () => ({
            error: { message: 'Queue database lock timeout' },
          }),
        };
      }
      if (table === 'audit_logs') {
        return {
          insert: async (payload: any) => {
            assert(payload.action === 'storage.orphan_leak_unresolved', 'Tier 3 logs storage.orphan_leak_unresolved');
            assert(payload.actor_role === 'system_recovery', 'Tier 3 sets actor_role to system_recovery');
            return { error: null };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
  } as unknown as ReturnType<typeof createClient>;

  const tier3Res = await executeThreeTierOrphanRecovery(
    mockTier3Client as any,
    testStudentId,
    undefined,
    testTeamId,
    testObjectPath
  );
  assert(tier3Res.cleanup_state === 'unresolved_leak', 'Tier 3 returns unresolved_leak');
  assert(tier3Res.unresolved_artifact?.audit_logged === true, 'Tier 3 sets audit_logged = true');

  // 3.4 Compound Persistence Failure (TEST-RECOV-01D): Storage, Queue, AND Audit ALL fail
  // Emits [CRITICAL_STORAGE_LEAK_UNPERSISTED] to stderr and sets audit_logged = false
  let stderrLogged = false;
  const originalStderr = console.error;
  console.error = (...args: any[]) => {
    if (args.some((a) => typeof a === 'string' && a.includes('[CRITICAL_STORAGE_LEAK_UNPERSISTED]'))) {
      stderrLogged = true;
    }
    originalStderr(...args);
  };

  const mockCompoundFailureClient = {
    storage: {
      from: (_bucket: string) => ({
        remove: async (_paths: string[]) => ({
          data: null,
          error: { message: 'Storage unavailable' },
        }),
      }),
    },
    from: (table: string) => ({
      insert: async () => ({
        error: { message: 'All database tables read-only or unreachable' },
      }),
    }),
  } as unknown as ReturnType<typeof createClient>;

  try {
    const compoundRes = await executeThreeTierOrphanRecovery(
      mockCompoundFailureClient as any,
      testStudentId,
      undefined,
      testTeamId,
      testObjectPath
    );
    assert(
      compoundRes.cleanup_state === 'unresolved_leak',
      'Compound failure returns cleanup_state = unresolved_leak'
    );
    assert(
      compoundRes.unresolved_artifact?.audit_logged === false,
      'Compound failure returns audit_logged = false (NEVER claims durable recovery)'
    );
    assert(
      Boolean(compoundRes.unresolved_artifact?.audit_error),
      'Compound failure returns audit_error details'
    );
    assert(
      stderrLogged,
      'Compound failure emits [CRITICAL_STORAGE_LEAK_UNPERSISTED] to runtime stderr'
    );
  } finally {
    console.error = originalStderr;
  }

  // ==========================================================================
  // SUITE 4: LOCAL DATABASE INTEGRATION TESTS (AUTH, RPCS & QUERIES)
  // ==========================================================================
  console.log('\n[Suite 4: Local Database Integration: Roster, Upload Preflight, & RLS]');

  const runId = Date.now();
  const leaderEmail = `leader.${runId}@nmit-dev.local`;
  const memberEmail = `member.${runId}@nmit-dev.local`;
  const outsiderEmail = `outsider.${runId}@nmit-dev.local`;

  // 4.1 Create test users via adminClient
  const leaderUsn = `1NT22CS${Math.floor(100 + Math.random() * 899)}`;
  const memberUsn = `1NT22IS${Math.floor(100 + Math.random() * 899)}`;
  const outsiderUsn = `1NT22EC${Math.floor(100 + Math.random() * 899)}`;

  const { data: leaderAuth, error: lErr } = await adminClient.auth.admin.createUser({
    email: leaderEmail,
    password: 'password123',
    email_confirm: true,
    user_metadata: {
      full_name: 'Team Leader',
      usn: leaderUsn,
      phone: '+919876543210',
      branch: 'CSE',
      academic_year: 3,
      sex: 'Male',
      date_of_birth: '2002-01-01',
    },
  });
  if (lErr || !leaderAuth.user) throw new Error(`Failed to create leader: ${lErr?.message}`);
  const leaderId = leaderAuth.user.id;

  const { data: memberAuth, error: mErr } = await adminClient.auth.admin.createUser({
    email: memberEmail,
    password: 'password123',
    email_confirm: true,
    user_metadata: {
      full_name: 'Team Member',
      usn: memberUsn,
      phone: '+919876543211',
      branch: 'ISE',
      academic_year: 3,
      sex: 'Female',
      date_of_birth: '2002-02-02',
    },
  });
  if (mErr || !memberAuth.user) throw new Error(`Failed to create member: ${mErr?.message}`);
  const memberId = memberAuth.user.id;

  const { data: outsiderAuth, error: oErr } = await adminClient.auth.admin.createUser({
    email: outsiderEmail,
    password: 'password123',
    email_confirm: true,
    user_metadata: {
      full_name: 'Outsider Student',
      usn: outsiderUsn,
      phone: '+919876543212',
      branch: 'ECE',
      academic_year: 3,
      sex: 'Male',
      date_of_birth: '2002-03-03',
    },
  });
  if (oErr || !outsiderAuth.user) throw new Error(`Failed to create outsider: ${oErr?.message}`);
  const outsiderId = outsiderAuth.user.id;

  // Set registration_status to approved for all test users
  await adminClient
    .from('profiles')
    .update({ registration_status: 'approved' })
    .in('id', [leaderId, memberId, outsiderId]);

  // Sign in each student to get session-aware Supabase clients
  const { data: leaderLogin } = await anonClient.auth.signInWithPassword({
    email: leaderEmail,
    password: 'password123',
  });
  const leaderClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${leaderLogin?.session?.access_token}` } },
  });

  const { data: memberLogin } = await anonClient.auth.signInWithPassword({
    email: memberEmail,
    password: 'password123',
  });
  const memberClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${memberLogin?.session?.access_token}` } },
  });

  const { data: outsiderLogin } = await anonClient.auth.signInWithPassword({
    email: outsiderEmail,
    password: 'password123',
  });
  const outsiderClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${outsiderLogin?.session?.access_token}` } },
  });

  // Fetch super admin ID for hackathon creation
  const { data: saAdmin } = await adminClient
    .from('admin_profiles')
    .select('id')
    .eq('is_super_admin', true)
    .limit(1)
    .single();

  const superAdminId = saAdmin?.id;

  // Create test hackathon: registration open, min_team_size = 2, max_team_size = 4
  const pastStart = new Date(Date.now() - 3600000).toISOString();
  const futureEnd = new Date(Date.now() + 86400000).toISOString();

  const { data: testHackathon, error: hckErr } = await adminClient
    .from('hackathons')
    .insert({
      title: `Stage B Verification Hackathon ${runId}`,
      slug: `stage-b-hackathon-${runId}`,
      mode: 'online',
      organizer: 'NMIT Dept of CSE',
      status: 'published',
      min_team_size: 2,
      max_team_size: 4,
      is_solo_allowed: false,
      registration_start_at: pastStart,
      registration_end_at: futureEnd,
      event_start_at: futureEnd,
      event_end_at: new Date(Date.now() + 172800000).toISOString(),
      created_by: superAdminId,
      in_charge_admin_id: superAdminId,
      description: 'Testing team formation and registration proof submission in Stage B',
    })
    .select('id')
    .single();

  if (hckErr || !testHackathon) throw new Error(`Failed to create test hackathon: ${hckErr?.message}`);
  const hackathonId = testHackathon.id;

  // Insert round 1 with status open
  await adminClient.from('hackathon_rounds').insert({
    hackathon_id: hackathonId,
    round_number: 1,
    name: 'Round 1: Idea Pitch & Registration',
    status: 'open',
    start_at: pastStart,
    end_at: futureEnd,
  });

  // 4.2 Test create_team under leader session
  const { data: createData, error: createTeamErr } = await leaderClient.rpc('create_team', {
    p_hackathon_id: hackathonId,
    p_team_name: `Devs of NMIT ${runId}`,
  });
  assert(!createTeamErr && Boolean(createData), 'create_team succeeds under authenticated leader session');
  const teamId =
    typeof createData === 'string'
      ? createData
      : (createData as { team_id?: string } | null)?.team_id || '';

  // Fetch invitation code using admin client
  const { data: teamRecord } = await adminClient
    .from('teams')
    .select('invitation_code, leader_id, internal_status')
    .eq('id', teamId)
    .single();

  assert(teamRecord?.leader_id === leaderId, 'Leader ID in teams matches caller session');
  assert(teamRecord?.internal_status === 'forming', 'Team internal_status initializes to "forming"');
  const invCode = teamRecord?.invitation_code as string;

  // 4.3 Test join_team_with_code under member session
  const { data: joinData, error: joinErr } = await memberClient.rpc('join_team_with_code', {
    p_invitation_code: invCode,
  });
  const joinedTeamId =
    typeof joinData === 'string'
      ? joinData
      : (joinData as { team_id?: string } | null)?.team_id || '';

  assert(!joinErr && joinedTeamId === teamId, 'join_team_with_code succeeds under member session');

  // 4.4 Non-leader cannot regenerate invitation code
  const { error: nonLeaderRegenErr } = await memberClient.rpc('regenerate_team_invitation_code', {
    p_team_id: teamId,
  });
  assert(Boolean(nonLeaderRegenErr), 'regenerate_team_invitation_code rejected for non-leader member (42501)');

  // 4.5 Leader can regenerate invitation code
  const { data: newCodeData, error: leaderRegenErr } = await leaderClient.rpc('regenerate_team_invitation_code', {
    p_team_id: teamId,
  });
  assert(!leaderRegenErr && Boolean(newCodeData), 'regenerate_team_invitation_code succeeds for team leader');

  // 4.6 Non-leader cannot remove team members
  const { error: nonLeaderRemoveErr } = await memberClient.rpc('remove_team_member', {
    p_team_id: teamId,
    p_student_id: leaderId,
  });
  assert(Boolean(nonLeaderRemoveErr), 'remove_team_member rejected for non-leader (42501)');

  // 4.7 Test Preflight Check: can_upload_registration_proof
  // Non-member (outsider) -> false
  const { data: outsiderCanUpload } = await outsiderClient.rpc('can_upload_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(outsiderCanUpload === false, 'can_upload_registration_proof returns false for non-member student');

  // Member (non-leader) -> false
  const { data: memberCanUpload } = await memberClient.rpc('can_upload_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(memberCanUpload === false, 'can_upload_registration_proof returns false for non-leader member');

  // Leader -> true
  const { data: leaderCanUpload } = await leaderClient.rpc('can_upload_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(leaderCanUpload === true, 'can_upload_registration_proof returns true for authenticated team leader');

  // 4.8 Preflight Rejection when Round 1 is paused
  await adminClient
    .from('hackathon_rounds')
    .update({ status: 'paused' })
    .eq('hackathon_id', hackathonId)
    .eq('round_number', 1);

  const { data: leaderCanUploadPaused } = await leaderClient.rpc('can_upload_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(
    leaderCanUploadPaused === false,
    'can_upload_registration_proof rejects fail-closed when Round 1 is paused'
  );

  // Unpause Round 1
  await adminClient
    .from('hackathon_rounds')
    .update({ status: 'open' })
    .eq('hackathon_id', hackathonId)
    .eq('round_number', 1);

  // 4.9 End-to-End Registration Proof Submission via User Client
  // First, upload a valid screenshot to Storage as the service-role client
  const screenshotPath = generateRegistrationProofStoragePath(teamId, 'png');
  const { error: storageUploadErr } = await adminClient.storage
    .from('submission-evidence')
    .upload(screenshotPath, genuinePng, {
      contentType: 'image/png',
      upsert: false,
    });
  assert(!storageUploadErr, 'Storage upload to submission-evidence succeeds via service-role');

  // Call submit_registration_proof via authenticated leaderClient (preserves auth.uid())
  const { data: submitResult, error: submitRpcErr } = await leaderClient.rpc('submit_registration_proof', {
    p_team_id: teamId,
    p_proof_path: screenshotPath,
    p_cdc_declaration_accepted: true,
    p_cdc_declaration_text: MANDATORY_CDC_DECLARATION_TEXT,
  });

  assert(!submitRpcErr, 'submit_registration_proof succeeds via authenticated leaderClient');
  const submitData = submitResult as { success?: boolean; external_status?: string; points_awarded?: boolean } | null;
  assert(submitData?.success === true, 'submit_registration_proof returns success = true');
  assert(submitData?.external_status === 'submitted', 'external_status transitions to "submitted"');

  // Verify participation points in points_ledger
  const { data: ledgerEntries } = await adminClient
    .from('points_ledger')
    .select('student_id, points, role_at_award')
    .eq('team_id', teamId)
    .eq('milestone_type', 'participation');

  assert(ledgerEntries?.length === 2, 'Points awarded to both team members (leader + member)');
  const leaderPoints = ledgerEntries?.find((e) => e.student_id === leaderId)?.points;
  const memberPoints = ledgerEntries?.find((e) => e.student_id === memberId)?.points;
  assert(leaderPoints === 15, 'Leader awarded +15 participation points');
  assert(memberPoints === 10, 'Member awarded +10 participation points');

  // 4.10 Roster is now locked: cannot leave team once proof is submitted
  const { error: leaveLockedErr } = await memberClient.rpc('leave_team', {
    p_team_id: teamId,
  });
  assert(
    Boolean(leaveLockedErr),
    'leave_team rejected after registration proof is submitted (55P03 locked)'
  );

  // 4.11 Verification & Privacy Checks (can_view_registration_proof)
  // Outsider student cannot view registration proof
  const { data: outsiderCanView } = await outsiderClient.rpc('can_view_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(outsiderCanView === false, 'can_view_registration_proof returns false for outsider student');

  // Team member CAN view registration proof
  const { data: memberCanView } = await memberClient.rpc('can_view_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(memberCanView === true, 'can_view_registration_proof returns true for team member');

  // Team leader CAN view registration proof
  const { data: leaderCanView } = await leaderClient.rpc('can_view_registration_proof', {
    p_team_id_text: teamId,
  });
  assert(leaderCanView === true, 'can_view_registration_proof returns true for team leader');

  // 4.12 Storage RLS SELECT Policy Isolation
  // Verify that an outsider client cannot SELECT the screenshot directly from storage.objects
  const { data: outsiderStorageRead } = await outsiderClient.storage
    .from('submission-evidence')
    .download(screenshotPath);
  assert(!outsiderStorageRead, 'Outsider student Storage download fails under hardened SELECT policy');

  // Team leader CAN download the screenshot
  const { data: leaderStorageRead, error: leaderDownloadErr } = await leaderClient.storage
    .from('submission-evidence')
    .download(screenshotPath);
  assert(
    !leaderDownloadErr && Boolean(leaderStorageRead),
    'Team leader Storage download succeeds under submission_evidence_select_registration_proof policy'
  );

  // Cleanup test storage object
  await adminClient.storage.from('submission-evidence').remove([screenshotPath]);

  // ==========================================================================
  // SUITE 5: SERVER ACTIONS VALIDATION & SECURE UPLOAD BOUNDARY
  // ==========================================================================
  console.log('\n[Suite 5: Server Actions Validation & Secure Upload Service Boundary]');

  const {
    createTeamAction,
    joinTeamWithCodeAction,
    leaveTeamAction,
    removeTeamMemberAction,
    regenerateInvitationCodeAction,
    lockTeamRosterAction,
    transferTeamLeadershipAction,
    getMyTeamsAction,
    getTeamDetailsAction,
    getRegistrationProofPreviewUrlAction,
  } = require('../../src/actions/team-actions');

  // 5.1 Server Actions input validation (fails fast before any database call)
  const actCreateBad = await createTeamAction('not-a-uuid', 'ab');
  assert(!actCreateBad.success, 'createTeamAction rejects invalid hackathon UUID and short name');

  const actJoinBad = await joinTeamWithCodeAction('BADCODE');
  assert(!actJoinBad.success, 'joinTeamWithCodeAction rejects invalid invitation code length');

  const actLeaveBad = await leaveTeamAction('not-a-uuid');
  assert(!actLeaveBad.success, 'leaveTeamAction rejects malformed team ID');

  const actRemoveBad = await removeTeamMemberAction('not-a-uuid', 'also-bad');
  assert(!actRemoveBad.success, 'removeTeamMemberAction rejects malformed UUIDs');

  const actLockBad = await lockTeamRosterAction('not-a-uuid');
  assert(!actLockBad.success, 'lockTeamRosterAction rejects malformed team ID');

  const actRegenBad = await regenerateInvitationCodeAction('not-a-uuid');
  assert(!actRegenBad.success, 'regenerateInvitationCodeAction rejects malformed team ID');

  const actTransferBad = await transferTeamLeadershipAction('not-a-uuid', 'not-a-uuid');
  assert(!actTransferBad.success, 'transferTeamLeadershipAction rejects malformed UUIDs');

  // 5.2 Server Actions unauthenticated fail-closed
  const actUnauthCreate = await createTeamAction(sampleUuid, 'Alpha Team 2026');
  assert(!actUnauthCreate.success, 'createTeamAction rejects unauthenticated invocation fail-closed');

  const actUnauthJoin = await joinTeamWithCodeAction('23456789ABCD');
  assert(!actUnauthJoin.success, 'joinTeamWithCodeAction rejects unauthenticated invocation fail-closed');

  const actUnauthLeave = await leaveTeamAction(sampleUuid);
  assert(!actUnauthLeave.success, 'leaveTeamAction rejects unauthenticated invocation fail-closed');


  // 5.3 Upload service boundary: validation before buffering into memory
  const oversizedDummyFile = {
    size: 2 * 1024 * 1024, // 2 MB
    type: 'image/png',
    name: 'oversized.png',
    arrayBuffer: async () => {
      throw new Error('arrayBuffer should NOT have been called for oversized file!');
    },
  };

  const uploadOversizedRes = await uploadRegistrationProofScreenshot(
    sampleUuid,
    oversizedDummyFile,
    true,
    MANDATORY_CDC_DECLARATION_TEXT
  );
  assert(
    !uploadOversizedRes.success,
    'uploadRegistrationProofScreenshot rejects oversized file (> 1 MB)'
  );

  const emptyDummyFile = {
    size: 0,
    type: 'image/png',
    name: 'empty.png',
    arrayBuffer: async () => new ArrayBuffer(0),
  };

  const uploadEmptyRes = await uploadRegistrationProofScreenshot(
    sampleUuid,
    emptyDummyFile,
    true,
    MANDATORY_CDC_DECLARATION_TEXT
  );
  assert(
    !uploadEmptyRes.success,
    'uploadRegistrationProofScreenshot rejects 0-byte file'
  );

  const uploadNoCdcRes = await uploadRegistrationProofScreenshot(
    sampleUuid,
    { size: 5000, type: 'image/png', name: 'valid.png', arrayBuffer: async () => new ArrayBuffer(5000) },
    false,
    MANDATORY_CDC_DECLARATION_TEXT
  );
  assert(
    !uploadNoCdcRes.success,
    'uploadRegistrationProofScreenshot rejects missing CDC declaration acceptance'
  );

  const uploadForgedCdcRes = await uploadRegistrationProofScreenshot(
    sampleUuid,
    { size: 5000, type: 'image/png', name: 'valid.png', arrayBuffer: async () => new ArrayBuffer(5000) },
    true,
    'Forged declaration text missing required legal clauses.'
  );
  assert(
    !uploadForgedCdcRes.success,
    'uploadRegistrationProofScreenshot rejects forged CDC declaration text'
  );

  console.log('\n===============================================================');
  console.log(`Phase 7 Stage B Verification Complete: ${passedAssertions}/${totalAssertions} assertions passed.`);
  console.log('===============================================================\n');

}

runStageBTestSuite().catch((err) => {
  console.error('\nTest suite execution failed:', err);
  process.exit(1);
});
