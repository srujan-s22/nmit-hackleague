// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

import {
  validateStorageFile,
  validateStorageFileBinary,
  inspectBinaryMagicBytes,
  MAX_COLLEGE_ID_SIZE,
  MAX_COLLEGE_ID_IMAGE_SIZE,
  MAX_PROFILE_PHOTO_SIZE,
} from '../../src/lib/storage/paths';

async function runOnboardingUploadTests() {
  console.log('=== NMIT HackLeague: Onboarding Direct Upload & Storage Security Tests ===\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  // --------------------------------------------------------------------------
  // Suite 1: File Size & Format Rules (Client & Server Pre-Flight)
  // --------------------------------------------------------------------------
  console.log('[Suite 1: File Size & Format Boundaries]');

  // 1a. College ID PDF limits (up to 5MB allowed)
  const validPdf2Mb = { name: 'valid_evidence.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' };
  assert(
    validateStorageFile(validPdf2Mb, 'college-id').valid,
    '2.00 MB PDF College ID is accepted by validation'
  );

  const exactPdf5Mb = { name: 'max_id.pdf', size: 5 * 1024 * 1024, type: 'application/pdf' };
  assert(
    validateStorageFile(exactPdf5Mb, 'college-id').valid,
    '5.00 MB PDF College ID (maximum limit) is accepted'
  );

  const oversizedPdf5MbPlus = { name: 'too_large.pdf', size: 5 * 1024 * 1024 + 1, type: 'application/pdf' };
  const oversizedPdfRes = validateStorageFile(oversizedPdf5MbPlus, 'college-id');
  assert(
    Boolean(!oversizedPdfRes.valid && oversizedPdfRes.error?.includes('5MB')),
    '5.01 MB PDF College ID is rejected with 5MB limit message'
  );

  // 1b. College ID Image limits (up to 1.5MB allowed)
  const validImg1Mb = { name: 'id_card.png', size: 1 * 1024 * 1024, type: 'image/png' };
  assert(
    validateStorageFile(validImg1Mb, 'college-id').valid,
    '1.00 MB PNG College ID is accepted'
  );

  const oversizedImg2Mb = { name: 'id_card.png', size: 2 * 1024 * 1024, type: 'image/png' };
  const oversizedImgRes = validateStorageFile(oversizedImg2Mb, 'college-id');
  assert(
    Boolean(!oversizedImgRes.valid && oversizedImgRes.error?.includes('1.5MB')),
    '2.00 MB image College ID is rejected with 1.5MB limit message'
  );

  // 1c. Profile photo limits (1MB limit in storage)
  const validPhoto620Kb = { name: 'photo.jpg', size: 620 * 1024, type: 'image/jpeg' };
  assert(
    validateStorageFile(validPhoto620Kb, 'profile-photo').valid,
    '0.62 MB profile photo is accepted'
  );

  const oversizedPhoto1MbPlus = { name: 'photo.jpg', size: 1048576 + 10, type: 'image/jpeg' };
  assert(
    !validateStorageFile(oversizedPhoto1MbPlus, 'profile-photo').valid,
    'Profile photo exceeding 1MB is rejected'
  );

  // 1d. Dangerous files rejected unconditionally
  const svgAttack = { name: 'xss.svg', size: 1024, type: 'image/svg+xml' };
  assert(
    !validateStorageFile(svgAttack, 'college-id').valid,
    'SVG image is unconditionally rejected (XSS defense)'
  );

  const exeAttack = { name: 'malware.exe', size: 1024, type: 'application/octet-stream' };
  assert(
    !validateStorageFile(exeAttack, 'college-id').valid,
    'Executable (.exe) extension is unconditionally rejected'
  );

  // --------------------------------------------------------------------------
  // Suite 2: Cryptographic Binary Content Validation (Magic Bytes)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 2: Cryptographic Binary Magic Bytes Verification]');

  // 2a. Genuine PDF magic bytes (%PDF-1.4)
  const genuinePdfHeader = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n');
  const validPdfBinary = validateStorageFileBinary(genuinePdfHeader, 'college-id', 'document.pdf', 'application/pdf');
  assert(validPdfBinary.valid, 'Genuine PDF binary header (%PDF-) passes binary validation');

  // 2b. Genuine PNG magic bytes (\x89PNG\r\n\x1a\n)
  const genuinePngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  const validPngBinary = validateStorageFileBinary(genuinePngHeader, 'college-id', 'card.png', 'image/png');
  assert(validPngBinary.valid, 'Genuine PNG binary header passes binary validation');

  // 2c. Genuine JPEG magic bytes (\xff\xd8\xff)
  const genuineJpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const validJpgBinary = validateStorageFileBinary(genuineJpgHeader, 'college-id', 'card.jpg', 'image/jpeg');
  assert(validJpgBinary.valid, 'Genuine JPEG binary header passes binary validation');

  // 2d. Disguised Windows PE/DOS executable (MZ signature) named .pdf
  const fakePdfWithExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // 'MZ'
  const fakePdfResult = validateStorageFileBinary(fakePdfWithExe, 'college-id', 'trojan.pdf', 'application/pdf');
  assert(
    !fakePdfResult.valid && fakePdfResult.isExecutable === true,
    'Disguised Windows executable (.exe with .pdf name) is detected and rejected'
  );

  // 2e. Disguised Linux ELF executable (\x7fELF) named .pdf
  const fakePdfWithElf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]); // '\x7fELF'
  const fakeElfResult = validateStorageFileBinary(fakePdfWithElf, 'college-id', 'exploit.pdf', 'application/pdf');
  assert(
    !fakeElfResult.valid && fakeElfResult.isExecutable === true,
    'Disguised Linux ELF binary (.bin with .pdf name) is detected and rejected'
  );

  // 2f. Plain text script disguised as PDF
  const scriptDisguisedAsPdf = Buffer.from('#!/bin/bash\necho "pwned"\n');
  const fakeScriptResult = validateStorageFileBinary(scriptDisguisedAsPdf, 'college-id', 'script.pdf', 'application/pdf');
  assert(
    !fakeScriptResult.valid,
    'Plain text shell script disguised as PDF fails magic bytes check'
  );

  // 2g. Legitimate PDF with UTF-8 BOM (\xef\xbb\xbf%PDF-1.4)
  const bomPdf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), genuinePdfHeader]);
  const bomPdfResult = validateStorageFileBinary(bomPdf, 'college-id', 'scanned_id.pdf', 'application/pdf');
  assert(
    bomPdfResult.valid === true && bomPdfResult.detectedMime === 'application/pdf',
    'PDF with UTF-8 BOM passes binary validation per ISO 32000-1'
  );

  // 2h. Zero-filled dummy file (reproducing empty/corrupt fixture rejection)
  const zeroDummy = Buffer.alloc(2048);
  const zeroDummyResult = validateStorageFileBinary(zeroDummy, 'college-id', 'valid_evidence.pdf', 'application/pdf');
  assert(
    zeroDummyResult.valid === false && !zeroDummyResult.error?.endsWith('..'),
    'Zero-filled dummy fixture is rejected with clean error message ending with single period'
  );

  // --------------------------------------------------------------------------
  // Suite 3: Server Action Path Containment & Cross-User Security
  // --------------------------------------------------------------------------
  console.log('\n[Suite 3: Path Containment & Cross-User Authorization]');

  const testUserId = '11111111-2222-3333-4444-555555555555';
  const victimUserId = '99999999-8888-7777-6666-555555555555';

  let downloadedObjects: string[] = [];
  let removedObjects: string[] = [];
  let updatedProfiles: any[] = [];
  let rpcCalls: { name: string; args: any }[] = [];

  // Mock server Supabase client
  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: testUserId, email: 'student@example.com' } },
        error: null,
      }),
    },
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          downloadedObjects.push(path);
          if (path.includes('nonexistent')) {
            return { data: null, error: new Error('Object not found') };
          }
          if (path.includes('corrupt')) {
            return { data: { arrayBuffer: async () => Buffer.from('corrupt_binary_data') }, error: null };
          }
          if (path.includes('executable')) {
            return { data: { arrayBuffer: async () => Buffer.from([0x4d, 0x5a, 0x90, 0x00]) }, error: null };
          }
          // Genuine PDF by default
          return { data: { arrayBuffer: async () => genuinePdfHeader }, error: null };
        },
        remove: async (paths: string[]) => {
          removedObjects.push(...paths);
          return { data: paths, error: null };
        },
      }),
    },
    from: (table: string) => ({
      update: (fields: any) => ({
        eq: async (col: string, val: any) => {
          updatedProfiles.push({ table, fields, col, val });
          return { error: null };
        },
      }),
    }),
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return { data: { success: true }, error: null };
    },
  };

  const serverClientPath = require.resolve('../../src/lib/supabase/server');
  require.cache[serverClientPath] = {
    id: serverClientPath,
    filename: serverClientPath,
    loaded: true,
    exports: {
      createClient: async () => mockSupabase,
    },
  } as unknown as NodeModule;

  // Import onboarding actions dynamically
  const {
    uploadCollegeIdAction,
    replaceCollegeIdAction,
    uploadProfilePhotoAction,
  } = require('../../src/actions/onboarding-actions');

  // Test 3a: Cross-user storage path is strictly rejected
  const crossUserAttempt = await uploadCollegeIdAction({
    storagePath: `${victimUserId}/stolen_id.pdf`,
  });
  assert(
    !crossUserAttempt.success && crossUserAttempt.error?.includes('Unauthorized storage path'),
    'Cross-user storage path attempt is rejected by uploadCollegeIdAction'
  );

  // Test 3b: Directory traversal attempt is strictly rejected
  const traversalAttempt = await uploadCollegeIdAction({
    storagePath: `${testUserId}/../../secret.pdf`,
  });
  assert(
    !traversalAttempt.success && traversalAttempt.error?.includes('Unauthorized storage path'),
    'Directory traversal path (..) is rejected by uploadCollegeIdAction'
  );

  // Test 3c: Valid own-folder direct storage path succeeds
  downloadedObjects = [];
  updatedProfiles = [];
  const validDirectPath = `${testUserId}/uuid-card-123.pdf`;
  const validDirectResult = await uploadCollegeIdAction({
    storagePath: validDirectPath,
  });
  assert(
    validDirectResult.success && validDirectResult.data?.path === validDirectPath,
    'Valid own-folder direct storage path succeeds and updates profile'
  );
  assert(
    updatedProfiles.some((p) => p.fields.college_id_path === validDirectPath),
    'Profile table is updated with validated direct storage path'
  );

  // --------------------------------------------------------------------------
  // Suite 4: Compensating Rollback on Invalid Binary Uploads
  // --------------------------------------------------------------------------
  console.log('\n[Suite 4: Safe Cleanup on Validation Failure]');

  removedObjects = [];
  const corruptPath = `${testUserId}/corrupt_document.pdf`;
  const corruptResult = await uploadCollegeIdAction({
    storagePath: corruptPath,
  });
  assert(
    !corruptResult.success && corruptResult.error?.includes('Binary validation failed'),
    'Invalid binary content upload is rejected'
  );
  assert(
    removedObjects.includes(corruptPath),
    'Compensating cleanup: invalid file is deleted from Supabase Storage'
  );

  removedObjects = [];
  const exePath = `${testUserId}/executable_disguised.pdf`;
  const exeResult = await uploadCollegeIdAction({
    storagePath: exePath,
  });
  assert(
    !exeResult.success,
    'Executable disguised as PDF is rejected'
  );
  assert(
    removedObjects.includes(exePath),
    'Compensating cleanup: malicious executable object is deleted from storage'
  );

  // --------------------------------------------------------------------------
  // Suite 5: Replacement College ID Workflow (replaceCollegeIdAction)
  // --------------------------------------------------------------------------
  console.log('\n[Suite 5: Replacement College ID Workflow]');

  rpcCalls = [];
  const replacementPath = `${testUserId}/replacement_uuid_456.pdf`;
  const replaceResult = await replaceCollegeIdAction({
    storagePath: replacementPath,
  });
  assert(
    replaceResult.success && replaceResult.data?.path === replacementPath,
    'Valid replacement storage path succeeds'
  );
  assert(
    rpcCalls.some((c) => c.name === 'replace_college_id' && c.args.p_new_storage_path === replacementPath),
    'PostgreSQL replace_college_id RPC is invoked with validated replacement path'
  );

  // Cross-user replacement attempt rejected
  const crossUserReplace = await replaceCollegeIdAction({
    storagePath: `${victimUserId}/victim_replacement.pdf`,
  });
  assert(
    !crossUserReplace.success && crossUserReplace.error?.includes('Unauthorized storage path'),
    'Cross-user replacement attempt is rejected before calling RPC'
  );

  console.log('\n========================================');
  console.log(`Test Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('========================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runOnboardingUploadTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
