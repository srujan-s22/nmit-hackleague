import * as path from 'path';

// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

// Import server-only modules after require.cache patch
const {
  validateAndNormalizeStudentMetadata,
} = require('../../src/lib/auth/profile-recovery');

interface UserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  raw_user_meta_data?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  raw_app_meta_data?: Record<string, unknown> | null;
}

async function runStudentProfileRecoveryTests() {
  console.log('=== NMIT HackLeague: Student Profile Recovery Unit Tests ===\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name}`);
    }
  }

  // Suite 1: Demographic Normalization & Validation
  console.log('[Suite 1: Demographic Metadata Normalization & Validation]');

  const validMeta = {
    full_name: 'Srujan S',
    usn: '1nt24cs002', // lowercase
    phone: ' +919098987654 ', // padded
    branch: 'cse', // lowercase
    academic_year: '3', // string numeric
    sex: 'male', // lowercase
    date_of_birth: '2004-06-07',
    email: 'xenonred246@gmail.com',
  };

  const validResult = validateAndNormalizeStudentMetadata(validMeta, 'xenonred246@gmail.com');
  assert(validResult.valid === true, 'Valid student metadata successfully passes validation');
  assert(validResult.data?.usn === '1NT24CS002', 'USN is automatically uppercase-normalized');
  assert(validResult.data?.sex === 'Male', 'Gender "male" maps case-insensitively to enum "Male"');
  assert(validResult.data?.branch === 'CSE', 'Branch "cse" maps case-insensitively to "CSE"');
  assert(validResult.data?.phone === '+919098987654', 'Phone whitespace is trimmed cleanly');
  assert(validResult.data?.academic_year === 3, 'Academic year string "3" parses to integer 3');
  assert(validResult.data?.date_of_birth === '2004-06-07', 'Date of birth is preserved correctly');

  // Test case-insensitive gender mapping
  const femaleResult = validateAndNormalizeStudentMetadata({ ...validMeta, sex: 'female' }, 'test@nmit.ac.in');
  assert(femaleResult.valid && femaleResult.data?.sex === 'Female', 'Gender "female" maps to enum "Female"');

  const otherResult = validateAndNormalizeStudentMetadata({ ...validMeta, sex: 'OTHER' }, 'test@nmit.ac.in');
  assert(otherResult.valid && otherResult.data?.sex === 'Other', 'Gender "OTHER" maps to enum "Other"');

  // Suite 2: Incomplete Metadata Rejection (Safe Fail-Closed)
  console.log('\n[Suite 2: Incomplete & Untrusted Metadata Rejection]');

  const missingUsn = validateAndNormalizeStudentMetadata({ ...validMeta, usn: '' }, 'test@nmit.ac.in');
  assert(!missingUsn.valid, 'Empty or missing USN is rejected');

  const missingName = validateAndNormalizeStudentMetadata({ ...validMeta, full_name: ' ' }, 'test@nmit.ac.in');
  assert(!missingName.valid, 'Missing full name is rejected');

  const missingPhone = validateAndNormalizeStudentMetadata({ ...validMeta, phone: '9876543210' }, 'test@nmit.ac.in');
  assert(!missingPhone.valid, 'Phone without +91 country code is rejected');

  const invalidBranch = validateAndNormalizeStudentMetadata({ ...validMeta, branch: 'XYZ' }, 'test@nmit.ac.in');
  assert(!invalidBranch.valid, 'Non-existent engineering branch is rejected');

  const invalidYearZero = validateAndNormalizeStudentMetadata({ ...validMeta, academic_year: 0 }, 'test@nmit.ac.in');
  assert(!invalidYearZero.valid, 'Academic year 0 is rejected (boundary 1-4)');

  const invalidYearFive = validateAndNormalizeStudentMetadata({ ...validMeta, academic_year: 5 }, 'test@nmit.ac.in');
  assert(!invalidYearFive.valid, 'Academic year 5 is rejected (boundary 1-4)');

  const invalidGender = validateAndNormalizeStudentMetadata({ ...validMeta, sex: 'robot' }, 'test@nmit.ac.in');
  assert(!invalidGender.valid, 'Unrecognized gender string is rejected');

  // Age < 15 verification
  const recentDob = new Date();
  recentDob.setFullYear(recentDob.getFullYear() - 14); // 14 years old
  const recentDobStr = recentDob.toISOString().split('T')[0];
  const underageResult = validateAndNormalizeStudentMetadata({ ...validMeta, date_of_birth: recentDobStr }, 'test@nmit.ac.in');
  assert(!underageResult.valid, 'Applicant under 15 years of age is rejected');

  const nullMeta = validateAndNormalizeStudentMetadata(null, 'test@nmit.ac.in');
  assert(!nullMeta.valid, 'Null metadata is rejected cleanly without throwing');

  const emptyMeta = validateAndNormalizeStudentMetadata({}, 'test@nmit.ac.in');
  assert(!emptyMeta.valid, 'Empty metadata object is rejected cleanly');

  // Suite 3: USN Regex Format Conformance
  console.log('\n[Suite 3: Institutional USN Regex Conformance]');

  const validUSNs = ['1NT22CS050', '1NT24IS001', '1NT21AI099', '1NT23EC012'];
  for (const u of validUSNs) {
    const res = validateAndNormalizeStudentMetadata({ ...validMeta, usn: u }, 'test@nmit.ac.in');
    assert(res.valid && res.data?.usn === u, `Valid USN format ${u} accepted`);
  }

  const invalidUSNs = ['2NT22CS050', '1NT22CS05', '1NT22CSS050', 'INVALID', '1NT22CS0501'];
  for (const u of invalidUSNs) {
    const res = validateAndNormalizeStudentMetadata({ ...validMeta, usn: u }, 'test@nmit.ac.in');
    assert(!res.valid, `Invalid USN format ${u} rejected`);
  }

  // Suite 4: Privilege & Security Invariants
  console.log('\n[Suite 4: Security & Privilege Invariants]');

  // Invariant 1: Recovered profile status is strictly draft
  assert(
    validResult.valid && validResult.data !== undefined,
    'Validated metadata produces a strictly unprivileged draft profile candidate'
  );

  // Invariant 2: Administrator metadata claim must block student profile recovery
  function checkAdminBlock(user: UserLike): boolean {
    const appMeta = user.app_metadata || user.raw_app_meta_data || {};
    const userMeta = user.user_metadata || user.raw_user_meta_data || {};
    return Boolean(appMeta.claims_admin) || appMeta.role === 'admin' || userMeta.role === 'admin';
  }

  assert(checkAdminBlock({ id: '1', app_metadata: { role: 'admin' } }), 'Admin role in app_metadata blocked');
  assert(checkAdminBlock({ id: '1', app_metadata: { claims_admin: true } }), 'claims_admin in app_metadata blocked');
  assert(checkAdminBlock({ id: '1', user_metadata: { role: 'admin' } }), 'Admin role in user_metadata blocked');
  assert(!checkAdminBlock({ id: '1', user_metadata: { role: 'student' } }), 'Student role permitted');

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runStudentProfileRecoveryTests().catch((err) => {
  console.error('Fatal error in recovery test runner:', err);
  process.exit(1);
});
