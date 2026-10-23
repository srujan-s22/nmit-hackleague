/**
 * NMIT HackLeague - Student Profile Photo Removal & Security Verification Test
 *
 * Verifies that:
 * 1. Student Onboarding UI does not expose photo file picker, upload button, or uploadProfilePhotoAction.
 * 2. Student Profile UI does not expose photo file picker, change button, or remove button.
 * 3. Server actions for student profile photo upload and removal are strictly disabled / reject invocations.
 * 4. College ID upload and review submission remain fully operational.
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

async function runProfilePhotoRemovalTests() {
  console.log('=== NMIT HackLeague: Student Profile Photo Removal Unit Tests ===\n');

  const onboardingClientPath = path.resolve(__dirname, '../../src/app/onboarding/onboarding-client.tsx');
  const profileClientPath = path.resolve(__dirname, '../../src/app/student/profile/profile-client.tsx');
  const onboardingActionsPath = path.resolve(__dirname, '../../src/actions/onboarding-actions.ts');
  const profileActionsPath = path.resolve(__dirname, '../../src/actions/profile-actions.ts');

  const onboardingClientContent = fs.readFileSync(onboardingClientPath, 'utf8');
  const profileClientContent = fs.readFileSync(profileClientPath, 'utf8');

  // --------------------------------------------------------------------------
  // Suite 1: Student Onboarding UI Inspection
  // --------------------------------------------------------------------------
  console.log('[Suite 1: Student Onboarding UI Verification]');

  assert(
    !onboardingClientContent.includes('profile-photo-input'),
    'Onboarding UI does not contain profile-photo-input file element'
  );

  assert(
    !onboardingClientContent.includes('uploadProfilePhotoAction'),
    'Onboarding UI does not import or call uploadProfilePhotoAction'
  );

  assert(
    !onboardingClientContent.includes('photoFile'),
    'Onboarding UI does not maintain photoFile state'
  );

  assert(
    !onboardingClientContent.includes('isUploadingPhoto'),
    'Onboarding UI does not maintain isUploadingPhoto state'
  );

  assert(
    !onboardingClientContent.includes('handleUploadPhoto'),
    'Onboarding UI does not declare handleUploadPhoto handler'
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
  // Suite 2: Student Profile UI Inspection
  // --------------------------------------------------------------------------
  console.log('\n[Suite 2: Student Profile UI Verification]');

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
  // Suite 3: Server Actions Rejection & Fail-Closed Security
  // --------------------------------------------------------------------------
  console.log('\n[Suite 3: Server Actions Rejection & Fail-Closed Security]');

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

  const onboardingActions = require(onboardingActionsPath);
  const profileActions = require(profileActionsPath);

  // 3a. Onboarding uploadProfilePhotoAction rejection
  const onboardingPhotoResult = await onboardingActions.uploadProfilePhotoAction();
  assert(
    onboardingPhotoResult.success === false,
    'onboarding-actions uploadProfilePhotoAction rejects execution'
  );
  assert(
    onboardingPhotoResult.error?.includes('removed'),
    'onboarding-actions uploadProfilePhotoAction provides clear removal notice'
  );

  // 3b. Profile uploadProfilePhotoAction rejection
  const profileUploadResult = await profileActions.uploadProfilePhotoAction();
  assert(
    profileUploadResult.success === false,
    'profile-actions uploadProfilePhotoAction rejects execution'
  );
  assert(
    profileUploadResult.error?.includes('removed'),
    'profile-actions uploadProfilePhotoAction provides clear removal notice'
  );

  // 3c. Profile removeProfilePhotoAction rejection
  const profileRemoveResult = await profileActions.removeProfilePhotoAction();
  assert(
    profileRemoveResult.success === false,
    'profile-actions removeProfilePhotoAction rejects execution'
  );
  assert(
    profileRemoveResult.error?.includes('removed'),
    'profile-actions removeProfilePhotoAction provides clear removal notice'
  );

  // --------------------------------------------------------------------------
  // Suite 4: College ID Verification & Institutional Profile Flow Integrity
  // --------------------------------------------------------------------------
  console.log('\n[Suite 4: College ID Verification & Core Workflows Intact]');

  assert(
    typeof onboardingActions.uploadCollegeIdAction === 'function',
    'uploadCollegeIdAction is exported and active in onboarding-actions'
  );

  assert(
    typeof onboardingActions.replaceCollegeIdAction === 'function',
    'replaceCollegeIdAction is exported and active in onboarding-actions'
  );

  assert(
    typeof onboardingActions.submitProfileForReviewAction === 'function',
    'submitProfileForReviewAction is exported and active in onboarding-actions'
  );

  assert(
    typeof profileActions.updatePhoneNumberAction === 'function',
    'updatePhoneNumberAction is exported and active in profile-actions'
  );

  assert(
    typeof profileActions.submitProfileCorrectionAction === 'function',
    'submitProfileCorrectionAction is exported and active in profile-actions'
  );

  console.log('\n========================================');
  console.log(`Test Results: ${passCount}/${passCount + failCount} passed (${((passCount / (passCount + failCount)) * 100).toFixed(1)}%)`);
  console.log('========================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runProfilePhotoRemovalTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
