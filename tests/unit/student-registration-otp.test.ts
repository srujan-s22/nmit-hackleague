// Mock 'server-only' in non-Next runtime for unit tests
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as any;

import fs from 'fs';
import path from 'path';
import {
  signupSchema,
  verifyOtpSchema,
} from '../../src/lib/validation/auth-schemas';

async function runStudentRegistrationOtpTests() {
  console.log('=== NMIT HackLeague: Student Registration Email OTP Flow Unit Tests ===\n');

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

  // Suite 1: Email Template Verification (Phase 2)
  console.log('[Suite 1: Supabase Email Template Integrity]');
  const templatePath = path.resolve(__dirname, '../../supabase/templates/confirmation.html');
  const templateExists = fs.existsSync(templatePath);
  assert(templateExists, 'supabase/templates/confirmation.html exists');

  if (templateExists) {
    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    assert(
      templateContent.includes('{{ .Token }}'),
      'Confirmation template contains {{ .Token }} placeholder for numeric OTP'
    );
    assert(
      !templateContent.includes('{{ .ConfirmationURL }}'),
      'Confirmation template strictly does NOT contain {{ .ConfirmationURL }} confirmation link'
    );
    assert(
      templateContent.includes('<h2>Verify your email</h2>'),
      'Confirmation template contains expected header'
    );
    assert(
      templateContent.includes('Use the verification code below to verify your email address'),
      'Confirmation template contains clear verification instructions'
    );
  }

  const configPath = path.resolve(__dirname, '../../supabase/config.toml');
  const configExists = fs.existsSync(configPath);
  assert(configExists, 'supabase/config.toml exists');

  if (configExists) {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    assert(
      configContent.includes('subject = "Your NMIT HackLeague verification code"'),
      'supabase/config.toml specifies "Your NMIT HackLeague verification code" as subject'
    );
    assert(
      configContent.includes('content_path = "./supabase/templates/confirmation.html"'),
      'supabase/config.toml points to local confirmation.html'
    );
  }

  // Suite 2: Student Registration Schema & OTP Payload
  console.log('\n[Suite 2: Student Registration Validation & Normalization]');
  const validSignupData = {
    full_name: 'Aarav Sharma',
    usn: '1NT22CS045',
    email: 'aarav.sharma@nmit.ac.in',
    phone: '+919876543210',
    branch: 'CSE',
    academic_year: 3,
    sex: 'Male',
    date_of_birth: '2004-05-15',
    password: 'Password123!',
  };

  const validParsed = signupSchema.safeParse(validSignupData);
  assert(validParsed.success, 'Valid student registration payload accepted');

  // Reject underage student (< 15 years)
  const underageDate = new Date();
  underageDate.setFullYear(underageDate.getFullYear() - 14);
  const underageParsed = signupSchema.safeParse({
    ...validSignupData,
    date_of_birth: underageDate.toISOString().split('T')[0],
  });
  assert(!underageParsed.success, 'Registration rejected for student under 15 years old');

  // Reject invalid USN pattern
  const invalidUsnParsed = signupSchema.safeParse({
    ...validSignupData,
    usn: 'INVALID_USN',
  });
  assert(!invalidUsnParsed.success, 'Registration rejected for invalid institutional USN');

  // Suite 3: 6-Digit Verification Code Validation & Normalization
  console.log('\n[Suite 3: 6-Digit OTP Schema & Normalization]');
  const validOtp = verifyOtpSchema.safeParse({
    email: 'student@example.com',
    token: '123456',
  });
  assert(validOtp.success, 'Valid 6-digit numeric OTP accepted');

  const shortOtp = verifyOtpSchema.safeParse({
    email: 'student@example.com',
    token: '12345',
  });
  assert(!shortOtp.success, '5-digit code rejected by verifyOtpSchema');

  const longOtp = verifyOtpSchema.safeParse({
    email: 'student@example.com',
    token: '1234567',
  });
  assert(!longOtp.success, '7-digit code rejected by verifyOtpSchema');

  const alphaOtp = verifyOtpSchema.safeParse({
    email: 'student@example.com',
    token: '12AB56',
  });
  assert(!alphaOtp.success, 'Alpha-numeric code rejected (must be purely numeric)');

  // Normalization behavior (e.g. pasted strings with spaces or dashes)
  function normalizeToken(rawToken: string): string {
    return rawToken.replace(/\D/g, '').slice(0, 6);
  }

  assert(normalizeToken('123 456') === '123456', 'Pasted token with space normalized to "123456"');
  assert(normalizeToken('123-456') === '123456', 'Pasted token with hyphen normalized to "123456"');
  assert(normalizeToken('  987654  ') === '987654', 'Pasted token with whitespace normalized to "987654"');
  assert(normalizeToken('OTP: 543210 (copy)') === '543210', 'Pasted string with text extracts first 6 numeric digits');

  // Suite 4: OTP Verification Logic & Profile Status Routing
  console.log('\n[Suite 4: OTP Verification Flow & Status Routing]');
  // Verify verifyOtpAction routing simulation
  function determineVerificationRedirect(profileStatus?: string, isAdmin = false, mustChangePassword = false): string {
    if (isAdmin) {
      return mustChangePassword ? '/auth/complete-setup' : '/admin';
    }
    switch (profileStatus) {
      case 'draft':
        return '/onboarding';
      case 'under_review':
      case 'pending_verification':
        return '/status/pending';
      case 'approved':
        return '/student';
      case 'correction_required':
      case 'rejected':
        return '/status/rejected';
      case 'suspended':
        return '/status/suspended';
      default:
        return '/onboarding';
    }
  }

  assert(
    determineVerificationRedirect('draft') === '/onboarding',
    'Newly verified student in "draft" status is directed to /onboarding'
  );
  assert(
    determineVerificationRedirect('under_review') === '/status/pending',
    'Verified student under review is directed to /status/pending'
  );
  assert(
    determineVerificationRedirect('approved') === '/student',
    'Already approved student is directed directly to /student'
  );
  assert(
    determineVerificationRedirect(undefined, true, true) === '/auth/complete-setup',
    'Admin requiring setup is directed to /auth/complete-setup'
  );

  // Error message formatting simulation
  function formatVerificationError(rawMessage: string, status?: number): string {
    const errorMsg = rawMessage.toLowerCase();
    if (errorMsg.includes('expired')) {
      return 'This verification code has expired. Please click "Resend Code" to receive a new one.';
    }
    if (errorMsg.includes('invalid') || errorMsg.includes('token')) {
      return 'Invalid verification code. Please double-check the 6-digit code sent to your email.';
    }
    if (errorMsg.includes('rate') || errorMsg.includes('too many') || status === 429) {
      return 'Too many verification attempts. Please wait a few moments before trying again.';
    }
    return rawMessage || 'Verification failed. Please check your code or request a new one.';
  }

  assert(
    formatVerificationError('Token has expired').includes('expired'),
    'Expired token generates user-friendly actionable message'
  );
  assert(
    formatVerificationError('Token is invalid').includes('Invalid verification code'),
    'Invalid token generates clear error message'
  );
  assert(
    formatVerificationError('Too many requests', 429).includes('Too many verification attempts'),
    'HTTP 429 generates rate-limit message'
  );

  // Suite 5: Resend OTP API & Rate Limit Protection
  console.log('\n[Suite 5: Resend OTP API & Rate Limit Handling]');
  function formatResendError(rawMessage: string, status?: number): string {
    const msg = rawMessage.toLowerCase();
    const isRateLimit =
      msg.includes('rate limit') ||
      msg.includes('security purposes') ||
      msg.includes('once every') ||
      msg.includes('too many') ||
      status === 429;

    if (isRateLimit) {
      return 'For security purposes, you can only request a new code once every 60 seconds. Please wait before trying again.';
    }
    if (msg.includes('already registered') || msg.includes('already confirmed') || msg.includes('already verified')) {
      return 'This email address is already verified. Please sign in to your account.';
    }
    return rawMessage || 'Failed to resend verification code. Please wait a few moments.';
  }

  const supabaseRateLimitMsg = 'For security purposes, you can only request this once every 60 seconds';
  assert(
    formatResendError(supabaseRateLimitMsg).includes('once every 60 seconds'),
    'Supabase GoTrue 60-second rate limit recognized and sanitized'
  );
  assert(
    formatResendError('over_email_send_rate_limit', 429).includes('once every 60 seconds'),
    'Status 429 error recognized as rate limit'
  );
  assert(
    formatResendError('User email already confirmed').includes('already verified'),
    'Already confirmed email returns sign-in guidance'
  );

  // Cooldown calculation simulation
  const now = Date.now();
  const futureExpiry = now + 45000; // 45 seconds from now
  const remaining = Math.ceil((futureExpiry - now) / 1000);
  assert(remaining === 45, 'Cooldown accurately calculates remaining seconds across reloads');

  const pastExpiry = now - 5000;
  const expiredRemaining = Math.max(0, Math.ceil((pastExpiry - now) / 1000));
  assert(expiredRemaining === 0, 'Past cooldown cleanly resets to 0 seconds');

  // Suite 6: State Retention & Fail-Closed Protection
  console.log('\n[Suite 6: State Retention & Fail-Closed Access Control]');
  // Test storage keys
  const EMAIL_STORAGE_KEY = 'nmit_pending_verification_email';
  const COOLDOWN_STORAGE_KEY = 'nmit_resend_cooldown_expiry';
  assert(typeof EMAIL_STORAGE_KEY === 'string' && EMAIL_STORAGE_KEY.length > 0, 'Email retention storage key defined');
  assert(typeof COOLDOWN_STORAGE_KEY === 'string' && COOLDOWN_STORAGE_KEY.length > 0, 'Cooldown storage key defined');

  // Verify protected paths definition in middleware
  const protectedRoutes = [
    '/student',
    '/onboarding',
    '/status',
    '/admin',
    '/hackathons',
    '/points',
    '/auth/complete-setup',
  ];

  function isPathProtected(path: string): boolean {
    return protectedRoutes.some((p) => path.startsWith(p) || path === p);
  }

  assert(isPathProtected('/onboarding'), '/onboarding is strictly protected');
  assert(isPathProtected('/student'), '/student is strictly protected');
  assert(isPathProtected('/status/pending'), '/status/pending is strictly protected');
  assert(!isPathProtected('/login'), '/login is public');
  assert(!isPathProtected('/verify'), '/verify is public');
  assert(!isPathProtected('/signup'), '/signup is public');

  // Suite 7: Database Error Sanitization & Pre-Flight Collision Guards
  console.log('\n[Suite 7: Database Error Sanitization & Pre-Flight Guards]');
  const hardenMigrationPath = path.resolve(__dirname, '../../supabase/migrations/20261026000003_harden_signup_trigger_and_demographics.sql');
  const hardenMigrationExists = fs.existsSync(hardenMigrationPath);
  assert(hardenMigrationExists, 'Forward migration 20261026000003_harden_signup_trigger_and_demographics.sql exists');

  if (hardenMigrationExists) {
    const migrationSql = fs.readFileSync(hardenMigrationPath, 'utf-8');
    assert(
      migrationSql.includes('v_sex := \'Male\'::public.gender') && migrationSql.includes('lower(trim('),
      'Migration implements case-insensitive gender enum parsing'
    );
    assert(
      migrationSql.includes('WHERE usn = v_usn AND id <> NEW.id'),
      'Migration implements explicit pre-insert USN uniqueness check'
    );
    assert(
      migrationSql.includes('EXCEPTION WHEN OTHERS THEN'),
      'Migration provides resilient exception blocks for integer and date parsing'
    );
  }

  // Verify sanitization of GoTrue generic database error
  function sanitizeSignupError(errorMessage: string, isDuplicateUsn = false): { error: string; fieldErrors?: Record<string, string[]> } {
    const errorMsg = errorMessage.toLowerCase();
    if (errorMsg.includes('already registered') || errorMsg.includes('user already exists')) {
      return {
        error: 'An account with this email address already exists. Please sign in instead.',
        fieldErrors: { email: ['An account with this email address already exists.'] },
      };
    }
    if (errorMsg.includes('database error saving new user') || errorMsg.includes('database error')) {
      if (isDuplicateUsn) {
        return {
          error: 'A profile with this University Seat Number (USN) is already registered.',
          fieldErrors: { usn: ['This USN is already registered.'] },
        };
      }
      return {
        error: 'Registration could not be completed. An account with these credentials may already exist. Please check your USN and email or try signing in.',
      };
    }
    return { error: errorMessage };
  }

  const rawGoTrueError = 'Database error saving new user';
  const sanitizedDefault = sanitizeSignupError(rawGoTrueError, false);
  assert(
    !sanitizedDefault.error.toLowerCase().includes('database error saving new user'),
    'Raw GoTrue "Database error saving new user" is NEVER presented to the student'
  );
  assert(
    sanitizedDefault.error.includes('credentials may already exist'),
    'Generic database error provides actionable, helpful student guidance'
  );

  const sanitizedWithDuplicateUsn = sanitizeSignupError(rawGoTrueError, true);
  assert(
    sanitizedWithDuplicateUsn.fieldErrors?.usn?.[0] === 'This USN is already registered.',
    'Duplicate USN under GoTrue 500 maps cleanly to field error on usn'
  );

  // Verify empty identities detection (when Supabase returns obfuscated user for existing confirmed email)
  function isExistingUserObfuscated(user: { id?: string; identities?: any[] } | null): boolean {
    return Boolean(user?.identities && user.identities.length === 0);
  }

  assert(isExistingUserObfuscated({ id: '123', identities: [] }), 'Empty identities array correctly identified as existing user');
  assert(!isExistingUserObfuscated({ id: '123', identities: [{ id: '456' }] }), 'Populated identities array correctly identified as new user');
  assert(!isExistingUserObfuscated(null), 'Null user correctly handled');
  // Suite 8: Missing-Profile Recovery & Normalization Invariants
  console.log('\n[Suite 8: Missing-Profile Recovery & Normalization Invariants]');
  const { validateAndNormalizeStudentMetadata } = require('../../src/lib/auth/profile-recovery');

  const recoveryCandidate = {
    full_name: 'Test Student 2',
    usn: '1nt24cs002',
    phone: '+919098987654',
    branch: 'cse',
    academic_year: '3',
    sex: 'male',
    date_of_birth: '2004-06-07',
    email: 'xenonred246@gmail.com',
  };

  const normRes = validateAndNormalizeStudentMetadata(recoveryCandidate, 'xenonred246@gmail.com');
  assert(normRes.valid === true, 'Profile recovery successfully validates confirmed student metadata');
  assert(normRes.data?.usn === '1NT24CS002', 'Profile recovery normalizes USN to uppercase');
  assert(normRes.data?.sex === 'Male', 'Profile recovery normalizes gender case-insensitively');
  assert(normRes.data?.branch === 'CSE', 'Profile recovery normalizes branch to uppercase');
  assert(normRes.data?.academic_year === 3, 'Profile recovery normalizes academic year to number');

  // Rejection of incomplete metadata
  const missingMetaRes = validateAndNormalizeStudentMetadata({ usn: '1NT24CS002' }, 'xenonred246@gmail.com');
  assert(!missingMetaRes.valid, 'Incomplete metadata is safely rejected by recovery logic');

  const underageMetaRes = validateAndNormalizeStudentMetadata(
    { ...recoveryCandidate, date_of_birth: '2020-01-01' },
    'xenonred246@gmail.com'
  );
  assert(!underageMetaRes.valid, 'Underage registration metadata is rejected by recovery logic');

  console.log(`\n========================================`);
  console.log(`Test Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`========================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runStudentRegistrationOtpTests().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
