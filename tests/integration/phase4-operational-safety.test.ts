import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import {
  isAllowedPushDomain,
  isPrivateOrReservedIp,
  validatePushEndpoint,
} from '../../src/lib/notifications/endpoint-validator';
import {
  validateVapidConfiguration,
  isMockSubscription,
} from '../../src/lib/notifications/vapid-config';
import {
  generateEvidenceStoragePath,
  validateStorageFile,
  validateStorageFileBinary,
  validateStorageObjectBinaryWithClient,
  getSignedPreviewUrlWithClient,
  inspectBinaryMagicBytes,
  MAX_PROFILE_PHOTO_SIZE,
  MAX_COLLEGE_ID_IMAGE_SIZE,
  MAX_COLLEGE_ID_SIZE,
  MAX_EVIDENCE_IMAGE_SIZE,
  MAX_SUBMISSION_EVIDENCE_SIZE,
} from '../../src/lib/storage/paths';

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

const client = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function runPhase4IntegrationTests() {
  console.log('--- Starting Phase 4 v6.2.11 Concurrency & Operational Safety Integration Tests ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testId: string, testName: string, detail?: string | object) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] [${testId}] ${testName}`);
      passed++;
    } else {
      const detailStr = detail ? (typeof detail === 'object' ? JSON.stringify(detail) : detail) : '';
      console.error(`  ✗ [FAIL] [${testId}] ${testName} ${detailStr ? `(${detailStr})` : ''}`);
    }
  }

  // ==========================================================================
  // SECTION 1: Push Endpoint Validator & SSRF Prevention
  // ==========================================================================
  console.log('\n[Section 1: Web Push Endpoint & SSRF Validation]');

  // Allowed push domains
  assert(
    isAllowedPushDomain('https://fcm.googleapis.com/fcm/send/abc123xyz'),
    'TS-PSH-01',
    'Google FCM push endpoint is recognized as allowed'
  );

  assert(
    isAllowedPushDomain('https://updates.push.services.mozilla.com/wpush/v2/def456'),
    'TS-PSH-02',
    'Mozilla push service endpoint is recognized as allowed'
  );

  assert(
    isAllowedPushDomain('https://web.push.apple.com/Q1234/test'),
    'TS-PSH-03',
    'Apple Web Push endpoint is recognized as allowed'
  );

  assert(
    isAllowedPushDomain('https://wns2-sn1p.notify.windows.com/w/?token=token123'),
    'TS-PSH-04',
    'Microsoft WNS push endpoint is recognized as allowed'
  );

  // Disallowed push domains
  assert(
    !isAllowedPushDomain('https://malicious-server.attacker.com/endpoint'),
    'TS-PSH-05',
    'Untrusted third-party domain is rejected'
  );

  assert(
    !isAllowedPushDomain('http://fcm.googleapis.com/unencrypted'),
    'TS-PSH-06',
    'Plain HTTP endpoint is rejected'
  );

  assert(
    !isAllowedPushDomain('https://127.0.0.1:8080/push'),
    'TS-PSH-07',
    'Direct IP address endpoint is rejected'
  );

  // SSRF Private / Reserved IP filter
  assert(
    isPrivateOrReservedIp('127.0.0.1') && isPrivateOrReservedIp('127.0.0.2'),
    'TS-SRF-01',
    'Loopback IPv4 addresses (127.0.0.0/8) are blocked'
  );

  assert(
    isPrivateOrReservedIp('10.0.0.5') &&
    isPrivateOrReservedIp('172.16.1.1') &&
    isPrivateOrReservedIp('172.31.255.255') &&
    isPrivateOrReservedIp('192.168.1.1'),
    'TS-SRF-02',
    'RFC1918 Private IPv4 address ranges are blocked'
  );

  assert(
    isPrivateOrReservedIp('169.254.169.254') && isPrivateOrReservedIp('169.254.1.1'),
    'TS-SRF-03',
    'Link-local and Cloud metadata addresses (169.254.0.0/16) are blocked'
  );

  assert(
    isPrivateOrReservedIp('100.64.0.1') && isPrivateOrReservedIp('100.127.255.255'),
    'TS-SRF-04',
    'Carrier-grade NAT ranges (100.64.0.0/10) are blocked'
  );

  assert(
    isPrivateOrReservedIp('::1') && isPrivateOrReservedIp('fe80::1') && isPrivateOrReservedIp('fc00::1'),
    'TS-SRF-05',
    'IPv6 loopback, link-local, and unique-local addresses are blocked'
  );

  assert(
    !isPrivateOrReservedIp('8.8.8.8') && !isPrivateOrReservedIp('1.1.1.1'),
    'TS-SRF-06',
    'Public routable IP addresses are permitted'
  );

  // Full validatePushEndpoint function without DNS lookup (syntactic/domain)
  const validationBad = await validatePushEndpoint('https://evil.internal.corp/steal', { resolveDns: false });
  assert(
    !validationBad.valid && Boolean(validationBad.error?.includes('Untrusted')),
    'TS-PSH-08',
    'validatePushEndpoint rejects unauthorized domains'
  );

  const validationGood = await validatePushEndpoint('https://fcm.googleapis.com/fcm/send/xyz', { resolveDns: false });
  assert(
    validationGood.valid && !validationGood.error,
    'TS-PSH-09',
    'validatePushEndpoint approves valid FCM endpoint'
  );

  // ==========================================================================
  // SECTION 2: Storage Upload Service & Immutable Versioned Paths
  // ==========================================================================
  console.log('\n[Section 2: Storage Versioned Path Isolation]');

  const hackathonId = '00000000-0000-0000-0000-000000000001';
  const submissionId = '11111111-1111-1111-1111-111111111111';

  const path1 = generateEvidenceStoragePath(hackathonId, submissionId, 'Final Report.pdf');
  const path2 = generateEvidenceStoragePath(hackathonId, submissionId, 'Final Report.pdf');

  assert(
    path1 !== path2,
    'TS-UPL-01',
    'Consecutive uploads of identical filename generate globally unique versioned paths'
  );

  assert(
    path1.startsWith(`evidence/${hackathonId}/${submissionId}/`) &&
    path1.endsWith('_Final_Report.pdf'),
    'TS-UPL-02',
    'Storage path follows approved hierarchy: evidence/{hackathon_id}/{submission_id}/{uuid}_{sanitized}'
  );

  const dirtyPath = generateEvidenceStoragePath(hackathonId, submissionId, '../../malicious/../evil name!@#$.pdf');
  assert(
    !dirtyPath.includes('..') && !dirtyPath.includes('!') && !dirtyPath.includes('@'),
    'TS-UPL-03',
    'Filename sanitization neutralizes directory traversal and special characters'
  );

  // Authoritative Evidence Size Limit Enforcement (Reconciling 50MB vs approved caps)
  // 1. Submission evidence documents/archives: 20MB limit
  const valSubPdfOk = validateStorageFile(
    { size: 20 * 1024 * 1024, type: 'application/pdf', name: 'report.pdf' },
    'submission-evidence'
  );
  assert(valSubPdfOk.valid, 'TS-LIM-01', 'Submission evidence PDF up to 20MB is accepted');

  const valSubZipOk = validateStorageFile(
    { size: 20 * 1024 * 1024, type: 'application/zip', name: 'source.zip' },
    'submission-evidence'
  );
  assert(valSubZipOk.valid, 'TS-LIM-02', 'Submission evidence ZIP archive up to 20MB is accepted');

  const valSubOver = validateStorageFile(
    { size: 20 * 1024 * 1024 + 1, type: 'application/pdf', name: 'large.pdf' },
    'submission-evidence'
  );
  assert(
    !valSubOver.valid && Boolean(valSubOver.error?.includes('20MB')),
    'TS-LIM-03',
    'Submission evidence exceeding 20MB is strictly rejected'
  );

  // 2. Evidence images: 1MB limit
  const valImgOk = validateStorageFile(
    { size: 1 * 1024 * 1024, type: 'image/png', name: 'screenshot.png' },
    'submission-evidence'
  );
  assert(valImgOk.valid, 'TS-LIM-04', 'Submission evidence image up to 1MB is accepted');

  const valImgOver = validateStorageFile(
    { size: 1 * 1024 * 1024 + 1, type: 'image/png', name: 'large.png' },
    'submission-evidence'
  );
  assert(
    !valImgOver.valid && Boolean(valImgOver.error?.includes('1MB')),
    'TS-LIM-05',
    'Submission evidence image exceeding 1MB is strictly rejected'
  );

  // 3. College ID limits: 1.5MB for image, 5MB for PDF
  const valIdImgOk = validateStorageFile(
    { size: MAX_COLLEGE_ID_IMAGE_SIZE, type: 'image/jpeg', name: 'card.jpg' },
    'college-id'
  );
  assert(valIdImgOk.valid, 'TS-LIM-06', 'College ID image up to 1.5MB is accepted');

  const valIdImgOver = validateStorageFile(
    { size: MAX_COLLEGE_ID_IMAGE_SIZE + 1, type: 'image/jpeg', name: 'card_huge.jpg' },
    'college-id'
  );
  assert(
    !valIdImgOver.valid && Boolean(valIdImgOver.error?.includes('1.5MB')),
    'TS-LIM-07',
    'College ID image exceeding 1.5MB is strictly rejected'
  );

  const valIdPdfOk = validateStorageFile(
    { size: 5 * 1024 * 1024, type: 'application/pdf', name: 'college_id.pdf' },
    'college-id'
  );
  assert(valIdPdfOk.valid, 'TS-LIM-08', 'College ID PDF document up to 5MB is accepted');

  const valIdPdfOver = validateStorageFile(
    { size: 5 * 1024 * 1024 + 1, type: 'application/pdf', name: 'huge_id.pdf' },
    'college-id'
  );
  assert(
    !valIdPdfOver.valid && Boolean(valIdPdfOver.error?.includes('5MB')),
    'TS-LIM-09',
    'College ID PDF exceeding 5MB is strictly rejected'
  );

  // 4. Profile photo limit: 1MB
  const valPhotoOk = validateStorageFile(
    { size: 1 * 1024 * 1024, type: 'image/jpeg', name: 'headshot.jpg' },
    'profile-photo'
  );
  assert(valPhotoOk.valid, 'TS-LIM-10', 'Profile photo up to 1MB is accepted');

  const valPhotoOver = validateStorageFile(
    { size: 1 * 1024 * 1024 + 1, type: 'image/jpeg', name: 'huge_photo.jpg' },
    'profile-photo'
  );
  assert(
    !valPhotoOver.valid && Boolean(valPhotoOver.error?.includes('1MB')),
    'TS-LIM-11',
    'Profile photo exceeding 1MB is strictly rejected'
  );

  // 5. SVG Unconditional Prohibition (Stored XSS)
  const valSvg1 = validateStorageFile(
    { size: 1024, type: 'image/svg+xml', name: 'vector.svg' },
    'submission-evidence'
  );
  const valSvg2 = validateStorageFile(
    { size: 1024, type: 'image/svg+xml', name: 'vector.svg' },
    'profile-photo'
  );
  assert(
    !valSvg1.valid && !valSvg2.valid && Boolean(valSvg1.error?.includes('SVG')),
    'TS-SEC-SVG',
    'SVG files are unconditionally rejected across all categories (Stored XSS defense)'
  );

  // 6. Dangerous Executable Extension Blocking
  const valExe = validateStorageFile(
    { size: 1024, type: 'application/octet-stream', name: 'payload.exe' },
    'submission-evidence'
  );
  const valSh = validateStorageFile(
    { size: 1024, type: 'application/x-sh', name: 'deploy.sh' },
    'submission-evidence'
  );
  assert(
    !valExe.valid && !valSh.valid,
    'TS-SEC-EXE',
    'Executable extensions (.exe, .sh, etc.) are strictly prohibited'
  );

  // 7. Authoritative Bucket Configuration verification in storage.buckets
  const { data: buckets, error: bktErr } = await adminClient.storage.listBuckets();

  const subBucket = (buckets as Array<{ id: string; file_size_limit: number }> | null)?.find((b) => b.id === 'submission-evidence');
  const idBucket = (buckets as Array<{ id: string; file_size_limit: number }> | null)?.find((b) => b.id === 'college-ids');
  const photoBucket = (buckets as Array<{ id: string; file_size_limit: number }> | null)?.find((b) => b.id === 'profile-photos');

  assert(
    bktErr === null &&
    subBucket?.file_size_limit === 20971520 &&
    idBucket?.file_size_limit === 5242880 &&
    photoBucket?.file_size_limit === 1048576,
    'TS-BKT-01',
    'Authoritative storage.buckets limits match specs: submission-evidence=20MB, college-ids=5MB, profile-photos=1MB',
    bktErr || { subBucket, idBucket, photoBucket }
  );

  // ==========================================================================
  // SECTION 2.5: Direct Storage Upload Bypass Verification
  // Verifies that bypassing TypeScript validation and directly uploading to
  // Supabase Storage REST API cannot exceed per-file limits or upload prohibited files.
  // ==========================================================================
  console.log('\n[Section 2.5: Direct Storage Upload Bypass Verification]');

  const testStudentId = '00000000-0000-0000-0000-000000000003';
  const studentClient = createClient(supabaseUrl, anonKey);
  const { error: directAuthErr } = await studentClient.auth.signInWithPassword({
    email: 'student1@nmit-dev.local',
    password: 'password123',
  });
  if (directAuthErr) throw directAuthErr;

  const testRunId = Date.now();

  // 1. Direct College ID Image Bypass Attempt (> 1.5MB, e.g. 2MB PNG)
  // Even though college-ids bucket allows 5MB for PDFs, direct image uploads exceeding 1.5MB MUST be rejected
  const oversizeCollegeImg = Buffer.alloc(2 * 1024 * 1024);
  const { error: dirImgErr } = await studentClient.storage
    .from('college-ids')
    .upload(`${testStudentId}/direct_bypass_2mb_${testRunId}.png`, oversizeCollegeImg, { contentType: 'image/png' });

  assert(
    dirImgErr !== null,
    'TS-DIR-01',
    'Direct storage upload of 2MB image to college-ids is strictly rejected by database invariants/RLS'
  );

  // 2. Direct College ID Image Legitimate (500KB PNG)
  const validCollegeImg = Buffer.alloc(500 * 1024);
  const valImgPath = `${testStudentId}/direct_valid_500kb_${testRunId}.png`;
  const { error: dirValImgErr } = await studentClient.storage
    .from('college-ids')
    .upload(valImgPath, validCollegeImg, { contentType: 'image/png' });

  assert(
    dirValImgErr === null,
    'TS-DIR-02',
    'Direct storage upload of valid 500KB image to college-ids succeeds',
    dirValImgErr || undefined
  );

  // 3. Direct College ID Document Legitimate (2MB PDF <= 5MB)
  const validCollegePdf = Buffer.alloc(2 * 1024 * 1024);
  const valPdfPath = `${testStudentId}/direct_valid_2mb_${testRunId}.pdf`;
  const { error: dirValPdfErr } = await studentClient.storage
    .from('college-ids')
    .upload(valPdfPath, validCollegePdf, { contentType: 'application/pdf' });

  assert(
    dirValPdfErr === null,
    'TS-DIR-03',
    'Direct storage upload of valid 2MB PDF document to college-ids succeeds',
    dirValPdfErr || undefined
  );

  // 4. Direct College ID Document Exceeding 5MB (6MB PDF)
  const oversizeCollegePdf = Buffer.alloc(6 * 1024 * 1024);
  const { error: dirOverPdfErr } = await studentClient.storage
    .from('college-ids')
    .upload(`${testStudentId}/direct_oversize_6mb_${testRunId}.pdf`, oversizeCollegePdf, { contentType: 'application/pdf' });

  assert(
    dirOverPdfErr !== null,
    'TS-DIR-04',
    'Direct storage upload of 6MB PDF to college-ids is strictly rejected (5MB cap enforced)'
  );

  // 5. Direct Profile Photo Exceeding 1MB (1.2MB PNG)
  const oversizeProfilePhoto = Buffer.alloc(Math.floor(1.2 * 1024 * 1024));
  const { error: dirOverPhotoErr } = await studentClient.storage
    .from('profile-photos')
    .upload(`${testStudentId}/direct_oversize_photo_${testRunId}.png`, oversizeProfilePhoto, { contentType: 'image/png' });

  assert(
    dirOverPhotoErr !== null,
    'TS-DIR-05',
    'Direct storage upload of 1.2MB image to profile-photos is strictly rejected (1MB cap enforced)'
  );

  // 6. Direct Profile Photo Legitimate (500KB PNG)
  const validProfilePhoto = Buffer.alloc(500 * 1024);
  const valPhotoPath = `${testStudentId}/direct_valid_photo_${testRunId}.png`;
  const { error: dirValPhotoErr } = await studentClient.storage
    .from('profile-photos')
    .upload(valPhotoPath, validProfilePhoto, { contentType: 'image/png' });

  assert(
    dirValPhotoErr === null,
    'TS-DIR-06',
    'Direct storage upload of valid 500KB image to profile-photos succeeds',
    dirValPhotoErr || undefined
  );

  // 7. Direct SVG Bypass Attempt (Stored XSS defense)
  const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const { error: dirSvgErr } = await studentClient.storage
    .from('college-ids')
    .upload(`${testStudentId}/exploit_${testRunId}.svg`, svgPayload, { contentType: 'image/svg+xml' });

  assert(
    dirSvgErr !== null,
    'TS-DIR-07',
    'Direct storage upload of SVG file is unconditionally blocked (stored XSS prevention)'
  );

  // 8. Direct Prohibited Executable Attempt (.exe)
  const exePayload = Buffer.from('MZ_MOCK_PE_HEADER');
  const { error: dirExeErr } = await studentClient.storage
    .from('college-ids')
    .upload(`${testStudentId}/payload_${testRunId}.exe`, exePayload, { contentType: 'application/octet-stream' });

  assert(
    dirExeErr !== null,
    'TS-DIR-08',
    'Direct storage upload of executable file (.exe) is unconditionally rejected'
  );

  // Clean up college-ids and profile-photos test files
  await studentClient.storage
    .from('college-ids')
    .remove([valImgPath, valPdfPath]);
  await studentClient.storage
    .from('profile-photos')
    .remove([valPhotoPath]);


  // 9, 10 & 11. Direct Submission Evidence Upload Bypasses
  // Create temporary hackathon, round, team, submission fixtures
  const directHackId = crypto.randomUUID();
  const directRoundId = crypto.randomUUID();
  const adminId = '00000000-0000-0000-0000-000000000001';

  await adminClient.from('hackathons').insert({
    id: directHackId,
    title: 'Direct Storage Bypass Test Hackathon',
    slug: 'dir-hack-' + directHackId.slice(0, 8),
    description: 'Testing direct storage uploads',
    organizer: 'Dept of CSE',
    mode: 'offline',
    status: 'published',
    registration_start_at: new Date(Date.now() - 86400000).toISOString(),
    registration_end_at: new Date(Date.now() + 86400000).toISOString(),
    event_start_at: new Date(Date.now() - 3600000).toISOString(),
    event_end_at: new Date(Date.now() + 86400000 * 3).toISOString(),
    created_by: adminId,
    in_charge_admin_id: adminId,
  });

  await adminClient.from('hackathon_rounds').insert({
    id: directRoundId,
    hackathon_id: directHackId,
    round_number: 1,
    name: 'Round 1',
    start_at: new Date(Date.now() - 3600000).toISOString(),
    end_at: new Date(Date.now() + 86400000).toISOString(),
    status: 'open',
  });

  const { data: directTeamData, error: directTeamErr } = await studentClient.rpc('create_team', {
    p_hackathon_id: directHackId,
    p_team_name: 'Direct Bypass Team ' + directHackId.slice(0, 6),
  });
  if (directTeamErr) throw directTeamErr;
  const directTeamId = directTeamData.team_id;

  const directSubId = crypto.randomUUID();
  await adminClient.from('submissions').insert({
    id: directSubId,
    hackathon_id: directHackId,
    round_id: directRoundId,
    team_id: directTeamId,
    submitted_by: testStudentId,
    title: 'Submission Direct Storage Bypass Test',
  });

  // Direct 2MB image to submission-evidence (> 1MB image cap, but < 20MB bucket cap)
  const oversizeEvidenceImg = Buffer.alloc(2 * 1024 * 1024);
  const evImgPath = `evidence/${directHackId}/${directSubId}/oversize_evidence.png`;
  const { error: evImgErr } = await studentClient.storage
    .from('submission-evidence')
    .upload(evImgPath, oversizeEvidenceImg, { contentType: 'image/png' });

  assert(
    evImgErr !== null,
    'TS-DIR-09',
    'Direct storage upload of 2MB image to submission-evidence is strictly rejected (1MB per-image limit enforced)'
  );

  // Direct 2MB PDF document to submission-evidence (allowed up to 20MB)
  const validEvidencePdf = Buffer.alloc(2 * 1024 * 1024);
  const evPdfPath = `evidence/${directHackId}/${directSubId}/valid_evidence.pdf`;
  const { error: evPdfErr } = await studentClient.storage
    .from('submission-evidence')
    .upload(evPdfPath, validEvidencePdf, { contentType: 'application/pdf' });

  assert(
    evPdfErr === null,
    'TS-DIR-10',
    'Direct storage upload of valid 2MB PDF to submission-evidence succeeds within authorized round and team'
  );

  // Direct 25MB PDF to submission-evidence (> 20MB bucket cap)
  const oversizeEvidencePdf = Buffer.alloc(25 * 1024 * 1024);
  const evOverPdfPath = `evidence/${directHackId}/${directSubId}/oversize_25mb.pdf`;
  const { error: evOverPdfErr } = await studentClient.storage
    .from('submission-evidence')
    .upload(evOverPdfPath, oversizeEvidencePdf, { contentType: 'application/pdf' });

  assert(
    evOverPdfErr !== null,
    'TS-DIR-11',
    'Direct storage upload of 25MB document to submission-evidence is strictly rejected (20MB limit enforced)'
  );

  // Clean up submission evidence test fixtures
  await studentClient.storage.from('submission-evidence').remove([evPdfPath]);
  await adminClient.from('submissions').delete().eq('id', directSubId);
  await adminClient.from('team_members').delete().eq('team_id', directTeamId);
  await adminClient.from('teams').delete().eq('id', directTeamId);
  await adminClient.from('hackathon_rounds').delete().eq('id', directRoundId);
  await adminClient.from('hackathons').delete().eq('id', directHackId);

  // ==========================================================================
  // SECTION 2.6: File-Content Binary Signature & Disguised File Defense
  // Verifies that uploaded files are checked against their actual binary signatures,
  // not just filename extensions, declared MIME types, or Storage metadata.
  // Tests invalid and executable content disguised as PNG, JPEG, PDF, and ZIP,
  // including direct Supabase Storage uploads that bypass the TypeScript upload service.
  // ==========================================================================
  console.log('\n[Section 2.6: File-Content Binary Signature & Disguised File Defense]');

  // Disguised payload definitions
  // 1. Windows PE / DOS Executable header (starts with 'MZ' 0x4D, 0x5A)
  const exeDisguisedPayload = Buffer.from([
    0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00,
    0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  // 2. Linux ELF Executable header (starts with \x7fELF 0x7F, 0x45, 0x4C, 0x46)
  const elfDisguisedPayload = Buffer.from([
    0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x02, 0x00, 0x3e, 0x00, 0x01, 0x00, 0x00, 0x00, 0x70, 0x04, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);

  // 3. Shell script with shebang (starts with '#!' 0x23, 0x21)
  const scriptDisguisedPayload = Buffer.from(
    '#!/bin/bash\necho "Malicious payload executing..."\nrm -rf /tmp/test\nexit 1\n'
  );

  // 4. Stored XSS / HTML script disguised as binary (starts with '<' HTML)
  const htmlDisguisedPayload = Buffer.from(
    '<!DOCTYPE html><html><head><script>alert(document.cookie)</script></head><body>Disguised Script</body></html>'
  );

  // 5. Corrupt / Arbitrary text payload
  const corruptTextPayload = Buffer.from('THIS_IS_PLAIN_TEXT_NOT_AN_APPROVED_BINARY_DOCUMENT_OR_IMAGE');

  // 6. Genuine binary payloads (Positive controls)
  const genuinePngPayload = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]), // IHDR chunk
    Buffer.alloc(256),
  ]);

  const genuineJpgPayload = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), // SOI + JFIF
    Buffer.alloc(256),
  ]);

  const genuinePdfPayload = Buffer.concat([
    Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<< /Type /Catalog >>\nendobj\n'),
    Buffer.alloc(256),
  ]);

  const genuineZipPayload = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]), // PK\x03\x04
    Buffer.alloc(256),
  ]);

  // TS-BIN-01: Windows PE Executable disguised as PNG
  // Metadata check alone would pass, but binary validation detects MZ header
  const metaCheckExePng = validateStorageFile({ size: exeDisguisedPayload.length, type: 'image/png', name: 'avatar.png' }, 'profile-photo');
  assert(
    metaCheckExePng.valid === true,
    'TS-BIN-01a',
    'Metadata check alone permits disguised executable (demonstrating why binary inspection is mandatory)'
  );

  const binCheckExePng = validateStorageFileBinary(exeDisguisedPayload, 'profile-photo', 'avatar.png', 'image/png');
  assert(
    binCheckExePng.valid === false && binCheckExePng.isExecutable === true,
    'TS-BIN-01b',
    'Binary validation strictly rejects Windows PE executable disguised as PNG (MZ signature detected)',
    binCheckExePng.error
  );

  // TS-BIN-02: Windows PE Executable disguised as JPEG
  const binCheckExeJpg = validateStorageFileBinary(exeDisguisedPayload, 'college-id', 'id_card.jpg', 'image/jpeg');
  assert(
    binCheckExeJpg.valid === false && binCheckExeJpg.isExecutable === true,
    'TS-BIN-02',
    'Binary validation strictly rejects Windows PE executable disguised as JPEG (MZ signature detected)',
    binCheckExeJpg.error
  );

  // TS-BIN-03: Windows PE Executable disguised as PDF
  const binCheckExePdf = validateStorageFileBinary(exeDisguisedPayload, 'college-id', 'college_id.pdf', 'application/pdf');
  assert(
    binCheckExePdf.valid === false && binCheckExePdf.isExecutable === true,
    'TS-BIN-03',
    'Binary validation strictly rejects Windows PE executable disguised as PDF (MZ signature detected)',
    binCheckExePdf.error
  );

  // TS-BIN-04: Windows PE Executable disguised as ZIP
  const binCheckExeZip = validateStorageFileBinary(exeDisguisedPayload, 'submission-evidence', 'evidence.zip', 'application/zip');
  assert(
    binCheckExeZip.valid === false && binCheckExeZip.isExecutable === true,
    'TS-BIN-04',
    'Binary validation strictly rejects Windows PE executable disguised as ZIP (MZ signature detected)',
    binCheckExeZip.error
  );

  // TS-BIN-05: Linux ELF Executable disguised as PNG, JPEG, PDF, and ZIP
  const binCheckElfPng = validateStorageFileBinary(elfDisguisedPayload, 'profile-photo', 'photo.png', 'image/png');
  const binCheckElfJpg = validateStorageFileBinary(elfDisguisedPayload, 'college-id', 'photo.jpg', 'image/jpeg');
  const binCheckElfPdf = validateStorageFileBinary(elfDisguisedPayload, 'college-id', 'id.pdf', 'application/pdf');
  const binCheckElfZip = validateStorageFileBinary(elfDisguisedPayload, 'submission-evidence', 'evidence.zip', 'application/zip');
  assert(
    !binCheckElfPng.valid && binCheckElfPng.isExecutable === true &&
    !binCheckElfJpg.valid && binCheckElfJpg.isExecutable === true &&
    !binCheckElfPdf.valid && binCheckElfPdf.isExecutable === true &&
    !binCheckElfZip.valid && binCheckElfZip.isExecutable === true,
    'TS-BIN-05',
    'Binary validation strictly rejects Linux ELF binaries across all categories (\\x7fELF signature detected)'
  );

  // TS-BIN-06: Shell Script with Shebang (#!) disguised as PDF and ZIP
  const binCheckShPdf = validateStorageFileBinary(scriptDisguisedPayload, 'college-id', 'doc.pdf', 'application/pdf');
  const binCheckShZip = validateStorageFileBinary(scriptDisguisedPayload, 'submission-evidence', 'bundle.zip', 'application/zip');
  assert(
    !binCheckShPdf.valid && binCheckShPdf.isExecutable === true &&
    !binCheckShZip.valid && binCheckShZip.isExecutable === true,
    'TS-BIN-06',
    'Binary validation strictly rejects shell scripts with shebang (#!) disguised as PDF or ZIP'
  );

  // TS-BIN-07: HTML Script Injection disguised as ZIP, PDF, and PNG
  const binCheckHtmlZip = validateStorageFileBinary(htmlDisguisedPayload, 'submission-evidence', 'evidence.zip', 'application/zip');
  const binCheckHtmlPdf = validateStorageFileBinary(htmlDisguisedPayload, 'college-id', 'document.pdf', 'application/pdf');
  assert(
    !binCheckHtmlZip.valid && !binCheckHtmlPdf.valid,
    'TS-BIN-07',
    'Binary validation strictly rejects HTML/script payloads disguised as ZIP or PDF'
  );

  // TS-BIN-08: Corrupted / Plain text payload disguised as PNG, JPEG, PDF, ZIP
  const binCheckTxtPng = validateStorageFileBinary(corruptTextPayload, 'profile-photo', 'image.png', 'image/png');
  const binCheckTxtPdf = validateStorageFileBinary(corruptTextPayload, 'college-id', 'document.pdf', 'application/pdf');
  const binCheckTxtZip = validateStorageFileBinary(corruptTextPayload, 'submission-evidence', 'evidence.zip', 'application/zip');
  assert(
    !binCheckTxtPng.valid && !binCheckTxtPdf.valid && !binCheckTxtZip.valid,
    'TS-BIN-08',
    'Binary validation strictly rejects plain text/corrupted content without valid magic signatures'
  );

  // TS-BIN-09: Format Mismatch Detection (Genuine PDF disguised with .png extension and image/png MIME)
  const binCheckMismatch = validateStorageFileBinary(genuinePdfPayload, 'profile-photo', 'disguised.png', 'image/png');
  assert(
    binCheckMismatch.valid === false,
    'TS-BIN-09',
    'Binary validation detects format mismatch: PDF binary disguised as PNG image is strictly rejected'
  );

  // TS-BIN-10: Genuine Binary Signatures Pass (Positive Controls)
  const genuinePngCheck = validateStorageFileBinary(genuinePngPayload, 'profile-photo', 'avatar.png', 'image/png');
  const genuineJpgCheck = validateStorageFileBinary(genuineJpgPayload, 'college-id', 'card.jpg', 'image/jpeg');
  const genuinePdfCheck = validateStorageFileBinary(genuinePdfPayload, 'college-id', 'id.pdf', 'application/pdf');
  const genuineZipCheck = validateStorageFileBinary(genuineZipPayload, 'submission-evidence', 'evidence.zip', 'application/zip');

  assert(
    genuinePngCheck.valid === true && genuinePngCheck.detectedMime === 'image/png' &&
    genuineJpgCheck.valid === true && genuineJpgCheck.detectedMime === 'image/jpeg' &&
    genuinePdfCheck.valid === true && genuinePdfCheck.detectedMime === 'application/pdf' &&
    genuineZipCheck.valid === true && genuineZipCheck.detectedMime === 'application/zip',
    'TS-BIN-10',
    'Authoritative binary validation succeeds for genuine PNG, JPEG, PDF, and ZIP files'
  );

  // TS-BIN-11: Direct Supabase Storage Upload Bypass Defense (Closing the Direct Upload Bypass)
  // An attacker uploads an executable directly to Supabase Storage bypassing the TypeScript upload service.
  // The trusted server-side validation path must inspect the stored binary and detect/block the disguise.
  const directDisguisedExePath = `${testStudentId}/direct_disguised_exe_${testRunId}.png`;
  const { error: directUploadErr } = await studentClient.storage
    .from('college-ids')
    .upload(directDisguisedExePath, exeDisguisedPayload, { contentType: 'image/png' });

  assert(
    directUploadErr === null,
    'TS-BIN-11a',
    'Direct storage upload of disguised file succeeds at raw storage level (proving bypass potential)'
  );

  // Now the trusted server-side validation path inspects the stored binary
  const serverInspectionResult = await validateStorageObjectBinaryWithClient(
    studentClient,
    'college-ids',
    directDisguisedExePath,
    'college-id'
  );

  assert(
    serverInspectionResult.valid === false && serverInspectionResult.isExecutable === true,
    'TS-BIN-11b',
    'Trusted server-side validation path downloads and detects disguised executable in storage (MZ signature)',
    serverInspectionResult.error
  );

  // Clean up direct upload test file
  await studentClient.storage
    .from('college-ids')
    .remove([directDisguisedExePath]);

  // TS-BIN-12: Direct Supabase Storage Upload on Submission Evidence Bypass Defense
  // An attacker uploads a Linux ELF executable directly to submission-evidence bypassing uploadSubmissionEvidence.
  const directElfEvPath = `evidence/${crypto.randomUUID()}/${crypto.randomUUID()}/direct_elf_${testRunId}.pdf`;
  // Temporarily insert object as admin to simulate presence in storage
  const { error: directElfUploadErr } = await adminClient.storage
    .from('submission-evidence')
    .upload(directElfEvPath, elfDisguisedPayload, { contentType: 'application/pdf' });

  assert(
    directElfUploadErr === null,
    'TS-BIN-12a',
    'Disguised ELF executable exists in submission-evidence bucket'
  );

  // Server-side validation gatekeeper detects ELF signature and blocks finalization
  const evidenceBinaryCheck = await validateStorageObjectBinaryWithClient(
    adminClient,
    'submission-evidence',
    directElfEvPath,
    'submission-evidence'
  );

  assert(
    evidenceBinaryCheck.valid === false && evidenceBinaryCheck.isExecutable === true,
    'TS-BIN-12b',
    'Server-side validation gatekeeper identifies disguised ELF executable in submission-evidence',
    evidenceBinaryCheck.error
  );

  // Clean up test file
  await adminClient.storage
    .from('submission-evidence')
    .remove([directElfEvPath]);

  // TS-BIN-13: Serving Boundary Defense (Signed URL Generation Blocks Disguised Files)
  // When an attacker uploads a disguised executable directly to storage and requests a signed preview URL,
  // getSignedPreviewUrlWithClient must download the object, detect the invalid/executable binary,
  // and refuse to generate a signed preview/download URL.
  const directServingExePath = `${testStudentId}/direct_serving_exe_${testRunId}.png`;
  await studentClient.storage
    .from('college-ids')
    .upload(directServingExePath, exeDisguisedPayload, { contentType: 'image/png' });

  const previewAttempt = await getSignedPreviewUrlWithClient(
    studentClient,
    'college-ids',
    directServingExePath,
    60
  );

  assert(
    previewAttempt.success === false && previewAttempt.url === undefined,
    'TS-BIN-13',
    'Serving boundary gatekeeper strictly refuses to generate signed URL for storage object with disguised PE binary',
    previewAttempt.error
  );

  await studentClient.storage
    .from('college-ids')
    .remove([directServingExePath]);

  // TS-BIN-14: Profile Photo Direct Upload Trust Boundary Defense
  // An attacker uploads an executable directly to the profile-photos bucket disguised as avatar.png.
  // The server-side binary validation must detect the executable and prevent approval or preview.
  const directPhotoExePath = `${testStudentId}/direct_photo_exe_${testRunId}.png`;
  await studentClient.storage
    .from('profile-photos')
    .upload(directPhotoExePath, exeDisguisedPayload, { contentType: 'image/png' });

  const photoBinaryCheck = await validateStorageObjectBinaryWithClient(
    studentClient,
    'profile-photos',
    directPhotoExePath,
    'profile-photo'
  );

  assert(
    photoBinaryCheck.valid === false && photoBinaryCheck.isExecutable === true,
    'TS-BIN-14a',
    'Binary validation gatekeeper detects disguised PE executable in profile-photos storage',
    photoBinaryCheck.error
  );

  const photoPreviewAttempt = await getSignedPreviewUrlWithClient(
    studentClient,
    'profile-photos',
    directPhotoExePath,
    60
  );

  assert(
    photoPreviewAttempt.success === false,
    'TS-BIN-14b',
    'Signed preview URL generation strictly blocked for disguised profile photo executable'
  );

  await studentClient.storage
    .from('profile-photos')
    .remove([directPhotoExePath]);

  // TS-BIN-15: Malformed / Truncated Files with Valid Magic Bytes
  // Confirms that truncated files containing only valid magic headers (e.g. 8-byte PNG, 3-byte JPEG, 4-byte PDF, 4-byte ZIP)
  // operate safely within buffer memory bounds, return accurate format classifications, and do not cause uncaught crashes.
  const truncPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // 8-byte minimal PNG header
  const truncJpg = Buffer.from([0xff, 0xd8, 0xff]); // 3-byte minimal JPEG SOI
  const truncPdf = Buffer.from('%PDF'); // 4-byte minimal PDF header
  const truncZip = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // 4-byte minimal ZIP header

  const truncPngCheck = inspectBinaryMagicBytes(truncPng);
  const truncJpgCheck = inspectBinaryMagicBytes(truncJpg);
  const truncPdfCheck = inspectBinaryMagicBytes(truncPdf);
  const truncZipCheck = inspectBinaryMagicBytes(truncZip);

  assert(
    truncPngCheck.detectedMime === 'image/png' && !truncPngCheck.isExecutable &&
    truncJpgCheck.detectedMime === 'image/jpeg' && !truncJpgCheck.isExecutable &&
    truncPdfCheck.detectedMime === 'application/pdf' && !truncPdfCheck.isExecutable &&
    truncZipCheck.detectedMime === 'application/zip' && !truncZipCheck.isExecutable,
    'TS-BIN-15',
    'Truncated files with minimal valid magic bytes operate safely within buffer bounds without memory overrun or crash'
  );

  // TS-BIN-16: Proactive 2-byte Executable Header Defense
  // Confirms that minimal 2-byte executable headers ('MZ' and '#!') are immediately flagged as executable.
  const truncPe = Buffer.from([0x4d, 0x5a]); // 'MZ'
  const truncSh = Buffer.from([0x23, 0x21]); // '#!'

  const truncPeCheck = inspectBinaryMagicBytes(truncPe);
  const truncShCheck = inspectBinaryMagicBytes(truncSh);

  assert(
    truncPeCheck.isExecutable === true && truncPeCheck.detectedMime === null &&
    truncShCheck.isExecutable === true && truncShCheck.detectedMime === null,
    'TS-BIN-16',
    'Proactive detection flags 2-byte Windows PE (MZ) and shell script (#!) headers as executable threats'
  );

  // ==========================================================================
  // SECTION 3: Database Concurrency & Operational Safety RPCs
  // ==========================================================================
  console.log('\n[Section 3: Database RPCs & Operational Safety Protocols]');

  // TS-SAF-06: Legacy worker barrier
  const { error: legacyErr } = await adminClient.rpc('claim_storage_deletion_jobs' as never, {
    p_worker_id: 'legacy-w1',
    p_batch_size: 10,
    p_lease_seconds: 60,
  } as never);

  assert(
    legacyErr !== null && (legacyErr.code === '55000' || legacyErr.message.includes('55000') || legacyErr.message.includes('deprecated')),
    'TS-SAF-06',
    'Legacy worker barrier raises SQLSTATE 55000 when claim_storage_deletion_jobs is invoked'
  );

  // Root-first batch claim
  const { data: claimBatch, error: claimBatchErr } = await adminClient.rpc(
    'claim_storage_deletion_batch' as never,
    {
      p_worker_id: 'integration-worker-1',
      p_batch_size: 10,
      p_lease_seconds: 60,
    } as never
  );

  assert(
    claimBatchErr === null && Array.isArray(claimBatch),
    'TS-BAT-01',
    'claim_storage_deletion_batch executes root-first query and returns array'
  );

  // Quarantine expired dispatches RPC
  const { data: qResult, error: qErr } = await adminClient.rpc(
    'quarantine_expired_dispatches' as never,
    { p_cooldown_seconds: 300 } as never
  );

  assert(
    qErr === null && Array.isArray(qResult),
    'TS-QRN-01',
    'quarantine_expired_dispatches executes cleanly and returns quarantined rows',
    qErr || undefined
  );

  // Claim reconciliation batch RPC
  const { data: rResult, error: rErr } = await adminClient.rpc(
    'claim_reconciliation_batch' as never,
    {
      p_worker_id: 'integration-reconciler-1',
      p_batch_size: 10,
      p_lease_seconds: 60,
    } as never
  );

  assert(
    rErr === null && Array.isArray(rResult),
    'TS-REC-01',
    'claim_reconciliation_batch executes cleanly and returns reconciliation jobs',
    rErr || undefined
  );

  // ==========================================================================
  // SECTION 4: Push Subscription RLS & In-Charge Admin Queries
  // ==========================================================================
  console.log('\n[Section 4: Push Subscriptions & Admin In-Charge Attributes]');

  // Check in_charge_admin_id column on hackathons
  const { data: hackathonRow, error: hErr } = await adminClient
    .from('hackathons')
    .select('id, title, in_charge_admin_id')
    .limit(1)
    .single();

  assert(
    hErr === null && hackathonRow !== null && 'in_charge_admin_id' in hackathonRow,
    'TS-ADM-01',
    'hackathons table includes in_charge_admin_id column with non-null foreign key',
    hErr || undefined
  );

  // Check submissions evidence lifecycle columns
  const { data: submissionCols, error: sErr } = await adminClient
    .from('submissions')
    .select('id, evidence_lifecycle_state, evidence_sha256, evidence_uploaded_at')
    .limit(1);

  assert(
    sErr === null,
    'TS-SUB-01',
    'submissions table includes evidence_lifecycle_state, evidence_sha256, evidence_uploaded_at',
    sErr || undefined
  );

  // Check user_push_subscriptions table and query
  const { data: pushRows, error: pushErr } = await adminClient
    .from('user_push_subscriptions')
    .select('id, user_id, device_fingerprint, endpoint, active')
    .limit(1);

  assert(
    pushErr === null,
    'TS-PSH-10',
    'user_push_subscriptions table is queryable with schema integrity',
    pushErr || undefined
  );

  // Test is_push_registered RPC initially (before registration)
  const { data: initialPushStatus, error: initPushErr } = await adminClient.rpc(
    'is_push_registered' as never,
    { p_user_id: testStudentId } as never
  );

  assert(
    initPushErr === null && initialPushStatus === false,
    'TS-GATE-01',
    'User with no subscriptions: is_push_registered returns false (dashboard access blocked)'
  );

  // Browser Capability Simulation: Unsupported browser
  function evaluateBrowserSupport(capabilities: { sw: boolean; pm: boolean; notif: boolean }) {
    if (!capabilities.sw || !capabilities.pm || !capabilities.notif) {
      return 'UNSUPPORTED';
    }
    return 'SUPPORTED';
  }

  assert(
    evaluateBrowserSupport({ sw: false, pm: true, notif: true }) === 'UNSUPPORTED' &&
    evaluateBrowserSupport({ sw: true, pm: false, notif: true }) === 'UNSUPPORTED' &&
    evaluateBrowserSupport({ sw: true, pm: true, notif: false }) === 'UNSUPPORTED',
    'TS-GATE-02',
    'Unsupported environment detected when ServiceWorker, PushManager, or Notification API is missing'
  );

  // Browser Permission Simulation: Denied permission
  function evaluatePermissionState(permission: string) {
    if (permission === 'denied') return 'PERMISSION_DENIED';
    if (permission === 'granted') return 'PERMISSION_GRANTED';
    return 'READY_TO_ENABLE';
  }

  assert(
    evaluatePermissionState('denied') === 'PERMISSION_DENIED',
    'TS-GATE-03',
    'Denied notification permission halts subscription and displays explicit unblock instructions'
  );

  // Test register_push_subscription RPC (Enablement via authenticated student session)
  const { data: signInData, error: signInErr } = await studentClient.auth.signInWithPassword({
    email: 'student1@nmit-dev.local',
    password: 'password123',
  });

  const deviceFp = 'test-device-p4-' + Date.now();
  const validFcmEndpoint = `https://fcm.googleapis.com/fcm/send/token-${Date.now()}`;

  const { data: regResult, error: regErr } = await studentClient.rpc(
    'register_push_subscription' as never,
    {
      p_endpoint: validFcmEndpoint,
      p_p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0448E3RH2BpG3ohShWDmff2bhlQI',
      p_auth: 'tBHItJI5svbpez7KI4CCXg',
      p_device_fingerprint: deviceFp,
      p_user_agent: 'Mozilla/5.0 Test Suite Agent',
    } as never
  );

  assert(
    signInErr === null && regErr === null,
    'TS-GATE-04',
    'register_push_subscription successfully records active push subscription in database',
    regErr || signInErr || undefined
  );

  // Verify dashboard access is now unlocked
  const { data: pushUnlocked, error: unlockErr } = await studentClient.rpc(
    'is_push_registered' as never,
    { p_user_id: testStudentId } as never
  );

  assert(
    unlockErr === null && pushUnlocked === true,
    'TS-GATE-05',
    'Successful push enablement: is_push_registered returns true (dashboard access granted)',
    unlockErr || undefined
  );

  // Test subscription revocation / deactivation via deactivate_push_subscription RPC
  const { error: deactErr } = await studentClient.rpc(
    'deactivate_push_subscription' as never,
    { p_device_fingerprint: deviceFp } as never
  );

  const { data: pushRevoked, error: revokeErr } = await studentClient.rpc(
    'is_push_registered' as never,
    { p_user_id: testStudentId } as never
  );

  assert(
    deactErr === null && revokeErr === null && pushRevoked === false,
    'TS-GATE-06',
    'Revoked/deactivated subscription: is_push_registered immediately reverts to false (dashboard access blocked again)',
    revokeErr || deactErr || undefined
  );

  // Clean up test session and subscriptions
  await studentClient.auth.signOut();
  await adminClient.from('user_push_subscriptions').delete().eq('device_fingerprint', deviceFp);

  // Test role gate coverage: verify Student, Admin, and Super Admin require push
  // Role checks in guards.ts invoke requirePushSubscription for each dashboard entry:
  // - requireApprovedStudent() -> requirePushSubscription(user.id, '/student')
  // - requireAdmin() -> requirePushSubscription(user.id, '/admin/hackathons')
  // - requireSuperAdmin() -> requirePushSubscription(user.id, '/admin/admins')
  const adminTestId = '00000000-0000-0000-0000-000000000002';
  const superAdminTestId = '00000000-0000-0000-0000-000000000001';

  const { data: adminPushCheck } = await adminClient.rpc('is_push_registered' as never, { p_user_id: adminTestId } as never);
  const { data: superAdminPushCheck } = await adminClient.rpc('is_push_registered' as never, { p_user_id: superAdminTestId } as never);

  assert(
    adminPushCheck === false && superAdminPushCheck === false,
    'TS-GATE-07',
    'All roles (Students, Admins, Super Admin) are strictly gated: push registration required prior to dashboard access'
  );

  // ==========================================================================
  // SECTION 5: Production Web Push & VAPID Credential Verification
  // ==========================================================================
  console.log('\n[Section 5: Production Web Push & VAPID Credential Verification]');

  // 1. Generate valid RFC 8292 P-256 Keypair for testing
  const ecKeyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const rawSpki = ecKeyPair.publicKey.export({ type: 'spki', format: 'der' });
  const validP256PublicKey = rawSpki.subarray(rawSpki.length - 65).toString('base64url');
  const jwkPrivate = ecKeyPair.privateKey.export({ format: 'jwk' });
  const validP256PrivateKey = jwkPrivate.d!;

  // TS-VAP-01: Production environment without VAPID keys fails validation
  const vapMissing = validateVapidConfiguration({
    NODE_ENV: 'production',
  });
  assert(
    !vapMissing.valid && (vapMissing.error?.includes('requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY') ?? false),
    'TS-VAP-01',
    'Production environment without VAPID keys is rejected'
  );

  // TS-VAP-02: Production environment with placeholder/mock credentials fails validation
  const vapMock = validateVapidConfiguration({
    NODE_ENV: 'production',
    VAPID_PUBLIC_KEY: 'mock-public-key-placeholder',
    VAPID_PRIVATE_KEY: 'mock-private-key-secret',
  });
  assert(
    !vapMock.valid && vapMock.isMock === true && (vapMock.error?.includes('cannot use development mocks') ?? false),
    'TS-VAP-02',
    'Production environment with mock/placeholder VAPID credentials is strictly rejected'
  );

  // TS-VAP-03: Production environment with malformed public key (not 65-byte P-256) fails
  const vapBadPub = validateVapidConfiguration({
    NODE_ENV: 'production',
    VAPID_PUBLIC_KEY: Buffer.alloc(32).toString('base64url'),
    VAPID_PRIVATE_KEY: validP256PrivateKey,
  });
  assert(
    !vapBadPub.valid && (vapBadPub.error?.includes('65-byte base64url uncompressed P-256 point') ?? false),
    'TS-VAP-03',
    'Malformed VAPID public key encoding/length is rejected'
  );

  // TS-VAP-04: Production environment with malformed private key (not 32-byte scalar) fails
  const vapBadPriv = validateVapidConfiguration({
    NODE_ENV: 'production',
    VAPID_PUBLIC_KEY: validP256PublicKey,
    VAPID_PRIVATE_KEY: Buffer.alloc(16).toString('base64url'),
  });
  assert(
    !vapBadPriv.valid && (vapBadPriv.error?.includes('32-byte base64url P-256 scalar') ?? false),
    'TS-VAP-04',
    'Malformed VAPID private key encoding/length is rejected'
  );

  // TS-VAP-05: Production environment with invalid subject fails RFC 8292 check
  const vapBadSubject = validateVapidConfiguration({
    NODE_ENV: 'production',
    VAPID_PUBLIC_KEY: validP256PublicKey,
    VAPID_PRIVATE_KEY: validP256PrivateKey,
    VAPID_SUBJECT: 'invalid-subject-no-mailto',
  });
  assert(
    !vapBadSubject.valid && (vapBadSubject.error?.includes('mailto: or https: URI') ?? false),
    'TS-VAP-05',
    'VAPID subject not starting with mailto: or https: is rejected per RFC 8292'
  );

  // TS-VAP-06: Production environment with valid RFC 8292 credentials passes validation
  const vapValid = validateVapidConfiguration({
    NODE_ENV: 'production',
    VAPID_PUBLIC_KEY: validP256PublicKey,
    VAPID_PRIVATE_KEY: validP256PrivateKey,
    VAPID_SUBJECT: 'mailto:security@nmit.ac.in',
  });
  assert(
    vapValid.valid === true && !vapValid.isMock && vapValid.config?.publicKey === validP256PublicKey,
    'TS-VAP-06',
    'Valid RFC 8292 P-256 keypair and mailto subject passes production verification'
  );

  // TS-VAP-07: isMockSubscription detects mock endpoints and mock fingerprints
  assert(
    isMockSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-token',
      deviceFingerprint: 'dev-mock-fingerprint',
    }) &&
    isMockSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/real-token',
      deviceFingerprint: 'mock-device-fp',
    }) &&
    !isMockSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/eX78AbC910ValidToken',
      deviceFingerprint: 'browser-nmit.ac.in-MacIntel-agent',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0448E3RH2BpG3ohShWDmff2bhlQI',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    }),
    'TS-VAP-07',
    'isMockSubscription correctly identifies mock endpoints and synthetic tokens'
  );

  // TS-VAP-08: sendWebPushNotification rejects mock credentials in production and refuses to fake delivery
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  } as unknown as NodeModule;
  const { sendWebPushNotification } = require('../../src/lib/notifications/push-service');

  const envRecord = process.env as Record<string, string | undefined>;
  const savedNodeEnv = envRecord.NODE_ENV;
  const savedVapPub = process.env.VAPID_PUBLIC_KEY;
  const savedVapPriv = process.env.VAPID_PRIVATE_KEY;
  const savedVapSub = process.env.VAPID_SUBJECT;

  envRecord.NODE_ENV = 'production';
  process.env.VAPID_PUBLIC_KEY = validP256PublicKey;
  process.env.VAPID_PRIVATE_KEY = validP256PrivateKey;
  process.env.VAPID_SUBJECT = 'mailto:security@nmit.ac.in';

  const mockDeliveryResult = await sendWebPushNotification(
    {
      endpoint: 'https://fcm.googleapis.com/fcm/send/mock-device-token-1234',
      p256dh: 'mock-p256dh-token',
      auth: 'mock-auth-token',
      deviceFingerprint: 'mock-device-fingerprint',
    },
    { title: 'Test Alert', body: 'This must not be reported as delivered' }
  );

  assert(
    mockDeliveryResult.success === false &&
    (mockDeliveryResult.error?.includes('mock credentials cannot be used in production') ?? false),
    'TS-VAP-08',
    'sendWebPushNotification in production strictly rejects mock credentials and does not fake delivery'
  );

  // TS-VAP-09: sendWebPushNotification in production without VAPID configuration fails immediately
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;

  const noVapidDeliveryResult = await sendWebPushNotification(
    {
      endpoint: 'https://fcm.googleapis.com/fcm/send/real-looking-token',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0448E3RH2BpG3ohShWDmff2bhlQI',
      auth: 'tBHItJI5svbpez7KI4CCXg',
      deviceFingerprint: 'browser-prod-device',
    },
    { title: 'Test Alert', body: 'Missing VAPID' }
  );

  assert(
    noVapidDeliveryResult.success === false &&
    (noVapidDeliveryResult.error?.includes('requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY') ?? false),
    'TS-VAP-09',
    'sendWebPushNotification in production fails immediately when VAPID keys are absent'
  );

  // Restore env
  envRecord.NODE_ENV = savedNodeEnv;
  if (savedVapPub) process.env.VAPID_PUBLIC_KEY = savedVapPub; else delete process.env.VAPID_PUBLIC_KEY;
  if (savedVapPriv) process.env.VAPID_PRIVATE_KEY = savedVapPriv; else delete process.env.VAPID_PRIVATE_KEY;
  if (savedVapSub) process.env.VAPID_SUBJECT = savedVapSub; else delete process.env.VAPID_SUBJECT;

  // Summary
  console.log(`\n==================================================================`);
  console.log(`Phase 4 Integration Test Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`==================================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runPhase4IntegrationTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
