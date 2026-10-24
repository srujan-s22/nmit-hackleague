/**
 * NMIT HackLeague - Onboarding-Only Profile Picture & Read-Only Profile Security Test
 *
 * Verifies that:
 * 1. Eligible student can upload a profile picture during onboarding.
 * 2. Student can complete onboarding without a profile picture (it is optional).
 * 3. Student who has submitted their profile for review cannot upload or replace a picture.
 * 4. Verified/completed student cannot upload or replace a picture.
 * 5. Administrator cannot use the student onboarding upload action.
 * 6. Student cannot write to another student's storage path or profile.
 * 7. Invalid MIME type and oversized files are rejected.
 * 8. Student profile page has no photo upload or removal controls.
 * 9. Existing profile pictures remain visible (read-only avatar capsule).
 * 10. Existing college ID upload and onboarding submission continue working.
 */

import fs from 'fs';
import path from 'path';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failCount++;
  }
}

async function runProfilePhotoTests() {
  console.log('=== NMIT HackLeague: Onboarding-Only Profile Photo & Security Tests ===\n');

  const onboardingClientPath = path.resolve(__dirname, '../../src/app/onboarding/onboarding-client.tsx');
  const profileClientPath = path.resolve(__dirname, '../../src/app/student/profile/profile-client.tsx');
  const onboardingActionsPath = path.resolve(__dirname, '../../src/actions/onboarding-actions.ts');
  const profileActionsPath = path.resolve(__dirname, '../../src/actions/profile-actions.ts');

  const onboardingClientContent = fs.readFileSync(onboardingClientPath, 'utf8');
  const profileClientContent = fs.readFileSync(profileClientPath, 'utf8');

  // --------------------------------------------------------------------------
  // Suite 1: Student Onboarding UI Inspection (Onboarding Upload Restored)
  // --------------------------------------------------------------------------
  console.log('[Suite 1: Student Onboarding UI Verification]');

  assert(
    onboardingClientContent.includes('profile-photo-input'),
    'Onboarding UI contains profile-photo-input file element'
  );

  assert(
    onboardingClientContent.includes('uploadProfilePhotoAction'),
    'Onboarding UI imports and calls uploadProfilePhotoAction'
  );

  assert(
    onboardingClientContent.includes('photoFile'),
    'Onboarding UI maintains photoFile state'
  );

  assert(
    onboardingClientContent.includes('isUploadingPhoto'),
    'Onboarding UI maintains isUploadingPhoto state'
  );

  assert(
    onboardingClientContent.includes('handleUploadPhoto'),
    'Onboarding UI declares handleUploadPhoto handler'
  );

  assert(
    onboardingClientContent.includes('photoPreview'),
    'Onboarding UI supports instant photo preview'
  );

  assert(
    onboardingClientContent.includes('Optional'),
    'Onboarding UI clearly marks profile picture as optional'
  );

  assert(
    onboardingClientContent.includes('college-id-input'),
    'College ID file input remains present in onboarding UI'
  );

  assert(
    onboardingClientContent.includes('uploadCollegeIdAction'),
    'uploadCollegeIdAction call remains active in onboarding UI'
  );

  assert(
    onboardingClientContent.includes('submitProfileForReviewAction'),
    'submitProfileForReviewAction call remains active in onboarding UI'
  );

  // --------------------------------------------------------------------------
  // Suite 2: Student Profile UI Read-Only Enforcement
  // --------------------------------------------------------------------------
  console.log('\n[Suite 2: Student Profile UI Read-Only Verification]');

  assert(
    !profileClientContent.includes('uploadProfilePhotoAction'),
    'Student profile UI does not import or call uploadProfilePhotoAction'
  );

  assert(
    !profileClientContent.includes('removeProfilePhotoAction'),
    'Student profile UI does not import or call removeProfilePhotoAction'
  );

  assert(
    !profileClientContent.includes('handleFileChange'),
    'Student profile UI does not declare handleFileChange for photo uploads'
  );

  assert(
    !profileClientContent.includes('handleRemovePhoto'),
    'Student profile UI does not declare handleRemovePhoto handler'
  );

  assert(
    !profileClientContent.includes('fileInputRef'),
    'Student profile UI does not contain fileInputRef'
  );

  assert(
    !profileClientContent.includes('type="file"'),
    'Student profile UI contains zero file input elements'
  );

  assert(
    !profileClientContent.includes('Upload Photo') && !profileClientContent.includes('Change Photo'),
    'Student profile UI does not contain Upload/Change Photo button'
  );

  assert(
    !profileClientContent.includes('Remove Photo'),
    'Student profile UI does not contain Remove Photo button'
  );

  assert(
    profileClientContent.includes('avatarUrl'),
    'Student profile UI preserves read-only avatar rendering (existing photo or initials fallback)'
  );

  assert(
    profileClientContent.includes('updatePhoneNumberAction'),
    'Student profile UI preserves verified phone number editing'
  );

  assert(
    profileClientContent.includes('submitProfileCorrectionAction'),
    'Student profile UI preserves institutional profile correction requests'
  );

  // --------------------------------------------------------------------------
  // Suite 3: Client & Server Pre-Flight Size & Format Boundary Checks
  // --------------------------------------------------------------------------
  console.log('\n[Suite 3: File Format & Size Limits]');
  const { validateStorageFile } = require('../../src/lib/storage/paths');

  // Valid image types
  assert(
    validateStorageFile({ name: 'avatar.png', size: 500 * 1024, type: 'image/png' }, 'profile-photo').valid,
    '500 KB PNG profile photo is accepted'
  );
  assert(
    validateStorageFile({ name: 'avatar.jpg', size: 800 * 1024, type: 'image/jpeg' }, 'profile-photo').valid,
    '800 KB JPEG profile photo is accepted'
  );
  assert(
    validateStorageFile({ name: 'avatar.webp', size: 300 * 1024, type: 'image/webp' }, 'profile-photo').valid,
    '300 KB WebP profile photo is accepted'
  );

  // Oversized photo (> 1MB)
  assert(
    !validateStorageFile({ name: 'avatar.jpg', size: 1048576 + 1, type: 'image/jpeg' }, 'profile-photo').valid,
    'Oversized (> 1MB) profile photo is rejected'
  );

  // Invalid MIME types (SVG XSS attack, PDF in profile photo)
  assert(
    !validateStorageFile({ name: 'avatar.svg', size: 50 * 1024, type: 'image/svg+xml' }, 'profile-photo').valid,
    'SVG profile photo is unconditionally rejected'
  );
  assert(
    !validateStorageFile({ name: 'avatar.pdf', size: 50 * 1024, type: 'application/pdf' }, 'profile-photo').valid,
    'PDF is rejected for profile photos'
  );

  // --------------------------------------------------------------------------
  // Suite 4: Server Action Gating, Status Model & Ownership Enforcement
  // --------------------------------------------------------------------------
  console.log('\n[Suite 4: Server-Side Onboarding Status Gating & Ownership]');

  // Mock server-only in Node test environment
  try {
    const serverOnlyPath = require.resolve('server-only');
    require.cache[serverOnlyPath] = {
      id: serverOnlyPath,
      filename: serverOnlyPath,
      loaded: true,
      exports: {},
    } as unknown as NodeModule;
  } catch {
    // server-only not found or already mocked
  }

  const studentId = '11111111-1111-4111-a111-111111111111';
  const victimId = '99999999-9999-4999-a999-999999999999';
  const adminId = '22222222-2222-4222-a222-222222222222';

  let currentCallerId = studentId;
  let currentCallerIsAdmin = false;
  let currentStudentStatus = 'draft';
  let mockProfilePhotoPath: string | null = null;
  const genuinePngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

  const mockSupabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: currentCallerId, email: 'user@hackleague.nmit.ac.in' } },
        error: null,
      }),
    },
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === 'admin_profiles') {
              return currentCallerIsAdmin ? { data: { id: val }, error: null } : { data: null, error: null };
            }
            if (table === 'profiles') {
              return {
                data: {
                  id: val,
                  registration_status: currentStudentStatus,
                  profile_photo_path: mockProfilePhotoPath,
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          single: async () => {
            if (table === 'profiles') {
              return {
                data: {
                  id: val,
                  college_id_path: `${val}/valid_id.pdf`,
                  profile_photo_path: mockProfilePhotoPath,
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
        }),
      }),
      update: (fields: any) => ({
        eq: async (_col: string, val: string) => {
          if (fields.profile_photo_path) {
            mockProfilePhotoPath = fields.profile_photo_path;
          }
          return { error: null };
        },
      }),
    }),
    storage: {
      from: (bucket: string) => ({
        download: async (path: string) => {
          if (path.includes('corrupt')) {
            return { data: null, error: new Error('File not found') };
          }
          return {
            data: { arrayBuffer: async () => genuinePngHeader },
            error: null,
          };
        },
        remove: async (paths: string[]) => ({ data: paths, error: null }),
      }),
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

  const onboardingActions = require(onboardingActionsPath);
  const profileActions = require(profileActionsPath);

  // 4a. Eligible student in 'draft' status can upload photo
  currentCallerId = studentId;
  currentCallerIsAdmin = false;
  currentStudentStatus = 'draft';
  const draftUploadResult = await onboardingActions.uploadProfilePhotoAction({
    storagePath: `${studentId}/avatar.png`,
  });
  assert(
    draftUploadResult.success === true && draftUploadResult.data?.path === `${studentId}/avatar.png`,
    'Eligible student in draft status can upload profile picture during onboarding'
  );

  // 4b. Student under review cannot upload or replace photo
  currentStudentStatus = 'under_review';
  const underReviewResult = await onboardingActions.uploadProfilePhotoAction({
    storagePath: `${studentId}/avatar2.png`,
  });
  assert(
    underReviewResult.success === false && underReviewResult.error?.includes('submitted for review'),
    'Student whose profile is under_review cannot upload or replace profile picture'
  );

  // 4c. Verified/approved student cannot upload or replace photo
  currentStudentStatus = 'approved';
  const approvedResult = await onboardingActions.uploadProfilePhotoAction({
    storagePath: `${studentId}/avatar3.png`,
  });
  assert(
    approvedResult.success === false && approvedResult.error?.includes('complete'),
    'Approved student cannot upload or replace profile picture'
  );

  // 4d. Administrator cannot use onboarding upload action
  currentCallerIsAdmin = true;
  currentStudentStatus = 'draft';
  const adminAttempt = await onboardingActions.uploadProfilePhotoAction({
    storagePath: `${studentId}/avatar.png`,
  });
  assert(
    adminAttempt.success === false && adminAttempt.error?.includes('Administrators cannot upload'),
    'Administrator is rejected from using student onboarding upload action'
  );

  // 4e. Cross-user storage path is rejected (writing to another student's storage path)
  currentCallerIsAdmin = false;
  currentStudentStatus = 'draft';
  const crossUserAttempt = await onboardingActions.uploadProfilePhotoAction({
    storagePath: `${victimId}/stolen.png`,
  });
  assert(
    crossUserAttempt.success === false && crossUserAttempt.error?.includes('Unauthorized storage path'),
    'Cross-user storage path attempt is rejected by uploadProfilePhotoAction'
  );

  // 4f. Path traversal (..) is rejected
  const traversalAttempt = await onboardingActions.uploadProfilePhotoAction({
    storagePath: `${studentId}/../../hack.png`,
  });
  assert(
    traversalAttempt.success === false && traversalAttempt.error?.includes('Unauthorized storage path'),
    'Directory traversal path (..) is rejected by uploadProfilePhotoAction'
  );

  // --------------------------------------------------------------------------
  // Suite 5: Profile Settings Actions Remain Strictly Disabled
  // --------------------------------------------------------------------------
  console.log('\n[Suite 5: Profile Page Actions Remain Fail-Closed]');

  const profileUploadResult = await profileActions.uploadProfilePhotoAction();
  assert(
    profileUploadResult.success === false && profileUploadResult.error?.includes('removed'),
    'profile-actions uploadProfilePhotoAction remains fail-closed'
  );

  const profileRemoveResult = await profileActions.removeProfilePhotoAction();
  assert(
    profileRemoveResult.success === false &&
      (profileRemoveResult.error?.includes('removed') || profileRemoveResult.error?.includes('not permitted')),
    'profile-actions removeProfilePhotoAction remains fail-closed'
  );

  console.log('\n========================================');
  console.log(`Test Results: ${passCount}/${passCount + failCount} passed (${((passCount / (passCount + failCount)) * 100).toFixed(1)}%)`);
  console.log('========================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runProfilePhotoTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
