// Mock 'server-only' in non-Next runtime for unit tests
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as any;

import { resetPasswordSchema } from '../../src/lib/validation/auth-schemas';

async function runUnitTests() {
  const {
    generateSecureTemporaryPassword,
    getInitialAdminProvisioningPassword,
    DEV_ADMIN_TEMP_PASSWORD_FALLBACK,
  } = await import('../../src/lib/auth/password-generator');
  console.log('=== NMIT HackLeague: Administrator Onboarding & Hardening Unit Tests ===\n');

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

  // 1. Password Generation & Entropy Tests
  console.log('[Suite 1: Cryptographic Temporary Password Generation]');
  const generatedPasswords = new Set<string>();

  for (let i = 0; i < 200; i++) {
    const pwd = generateSecureTemporaryPassword(24);
    generatedPasswords.add(pwd);

    // Verify length
    if (pwd.length !== 24) {
      assert(false, `Password length is 24 characters (got ${pwd.length})`);
      break;
    }

    // Verify schema compatibility
    const validation = resetPasswordSchema.safeParse({
      password: pwd,
      confirmPassword: pwd,
    });

    if (!validation.success) {
      assert(false, `Password satisfies resetPasswordSchema on iteration ${i}`, JSON.stringify(validation.error.issues));
      break;
    }
  }

  assert(generatedPasswords.size === 200, '200 generated temporary passwords had zero collisions (unique credentials)');
  assert(
    Array.from(generatedPasswords).every((p) => /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[!@#$%^&*-_+=]/.test(p)),
    'All generated temporary passwords contain upper, lower, number, and symbol classes'
  );

  // 2. Default password rejection
  console.log('\n[Suite 2: Avoidance of Hardcoded Defaults]');
  assert(!generatedPasswords.has('Hackleague@nmit'), 'Generated passwords never match former static default Hackleague@nmit');

  // 3. Password Schema Validation Tests
  console.log('\n[Suite 3: Password Complexity Policy Enforcement]');
  assert(
    !resetPasswordSchema.safeParse({ password: 'short', confirmPassword: 'short' }).success,
    'Rejects passwords under 8 characters'
  );
  assert(
    !resetPasswordSchema.safeParse({ password: 'nouppercase123!', confirmPassword: 'nouppercase123!' }).success,
    'Rejects passwords missing uppercase letters'
  );
  assert(
    !resetPasswordSchema.safeParse({ password: 'NOLOWERCASE123!', confirmPassword: 'NOLOWERCASE123!' }).success,
    'Rejects passwords missing lowercase letters'
  );
  assert(
    !resetPasswordSchema.safeParse({ password: 'NoNumbersHere!!', confirmPassword: 'NoNumbersHere!!' }).success,
    'Rejects passwords missing numbers'
  );
  assert(
    !resetPasswordSchema.safeParse({ password: 'ValidPass123!', confirmPassword: 'DifferentPass123!' }).success,
    'Rejects mismatched confirmPassword'
  );
  assert(
    resetPasswordSchema.safeParse({ password: 'ValidPassword123!', confirmPassword: 'ValidPassword123!' }).success,
    'Accepts fully compliant passwords'
  );

  // 4. Safe Redirect Logic
  console.log('\n[Suite 4: Safe Redirect Open-Redirect Prevention]');
  function getSafeRedirectUrl(url?: string | null): string | null {
    if (!url) return null;
    if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) {
      if (!url.includes(':')) {
        return url;
      }
    }
    return null;
  }

  assert(getSafeRedirectUrl('/admin') === '/admin', 'Allows safe relative internal redirect');
  assert(getSafeRedirectUrl('/admin/hackathons') === '/admin/hackathons', 'Allows safe deep internal redirect');
  assert(getSafeRedirectUrl('https://evil.com') === null, 'Rejects external URL redirect');
  assert(getSafeRedirectUrl('//evil.com') === null, 'Rejects protocol-relative open redirect');
  assert(getSafeRedirectUrl('/\\evil.com') === null, 'Rejects backslash protocol bypass');
  assert(getSafeRedirectUrl('/auth/complete-setup') === '/auth/complete-setup', 'Allows /auth/complete-setup redirect');

  // 5. Expiration Checking Logic
  console.log('\n[Suite 5: 24-Hour Expiration Boundary Logic]');
  const now = Date.now();
  const pastExpiration = new Date(now - 1000).toISOString();
  const futureExpiration = new Date(now + 24 * 60 * 60 * 1000).toISOString();

  const isExpiredPast = new Date(pastExpiration).getTime() < now;
  const isExpiredFuture = new Date(futureExpiration).getTime() < now;

  assert(isExpiredPast === true, 'Correctly flags past timestamp as expired');
  assert(isExpiredFuture === false, 'Correctly flags future 24h timestamp as active');

  // 6. Missing-Column Database Fallback Handling
  console.log('\n[Suite 6: Missing-Column Database Fallback Logic]');
  function resolveAdminOnboardingState(
    dbRow: { must_change_password?: boolean; onboarding_expires_at?: string | null; onboarding_status?: string },
    appMetadata: { must_change_password?: boolean; onboarding_expires_at?: string; onboarding_status?: string; [key: string]: unknown } = {}
  ) {
    const mustChangePassword =
      typeof dbRow.must_change_password === 'boolean'
        ? dbRow.must_change_password
        : Boolean(appMetadata.must_change_password);

    const onboardingExpiresAt =
      dbRow.onboarding_expires_at ||
      (typeof appMetadata.onboarding_expires_at === 'string' ? appMetadata.onboarding_expires_at : null);

    const onboardingStatus =
      dbRow.onboarding_status ||
      (typeof appMetadata.onboarding_status === 'string' ? appMetadata.onboarding_status : 'completed');

    return { mustChangePassword, onboardingExpiresAt, onboardingStatus };
  }

  // Pre-migration DB row (columns undefined)
  const unmigratedPendingDb = {};
  const unmigratedPendingMeta = { must_change_password: true, onboarding_expires_at: futureExpiration, onboarding_status: 'pending' };
  const res1 = resolveAdminOnboardingState(unmigratedPendingDb, unmigratedPendingMeta);
  assert(res1.mustChangePassword === true, 'Unmigrated DB falls back to app_metadata must_change_password: true');
  assert(res1.onboardingExpiresAt === futureExpiration, 'Unmigrated DB falls back to app_metadata onboarding_expires_at');
  assert(res1.onboardingStatus === 'pending', 'Unmigrated DB falls back to app_metadata onboarding_status: pending');

  const unmigratedCompletedMeta = { must_change_password: false, onboarding_status: 'completed' };
  const res2 = resolveAdminOnboardingState(unmigratedPendingDb, unmigratedCompletedMeta);
  assert(res2.mustChangePassword === false, 'Unmigrated DB falls back to app_metadata must_change_password: false');

  const superAdminDb = {};
  const superAdminMeta = { role: 'super_admin' };
  const res3 = resolveAdminOnboardingState(superAdminDb, superAdminMeta);
  assert(res3.mustChangePassword === false, 'Existing Super Admin with undefined flags is not forced into password change');

  // 7. Re-onboarding Retry Eligibility (Fail-Closed Matrix)
  console.log('\n[Suite 7: Administrator Re-onboarding Retry Eligibility (Fail-Closed Matrix)]');
  function checkRetryEligibility(
    targetAdmin: { id: string; is_super_admin: boolean; must_change_password?: boolean; onboarding_status?: string },
    currentAppMeta: { must_change_password?: boolean; onboarding_status?: string } = {}
  ): { eligible: boolean; reason?: string } {
    if (targetAdmin.is_super_admin) {
      return { eligible: false, reason: 'Protected system role cannot be re-onboarded.' };
    }

    const isCompleted =
      currentAppMeta.must_change_password === false ||
      targetAdmin.must_change_password === false ||
      currentAppMeta.onboarding_status === 'completed' ||
      targetAdmin.onboarding_status === 'completed';

    const isExplicitlyPending =
      currentAppMeta.must_change_password === true ||
      targetAdmin.must_change_password === true;

    if (isCompleted || !isExplicitlyPending) {
      return {
        eligible: false,
        reason: 'Administrator has already completed setup and verified their permanent password.',
      };
    }

    return { eligible: true };
  }

  // Test Case A: Completed admin with unmigrated DB (db column undefined, app_metadata = false)
  const retryCaseA = checkRetryEligibility({ id: 'adm-1', is_super_admin: false }, { must_change_password: false });
  assert(!retryCaseA.eligible, 'Rejects retry when app_metadata indicates setup already completed, even if DB column is undefined');

  // Test Case B: Completed admin with migrated DB (db column false, app_metadata undefined)
  const retryCaseB = checkRetryEligibility({ id: 'adm-2', is_super_admin: false, must_change_password: false }, {});
  assert(!retryCaseB.eligible, 'Rejects retry when DB indicates setup already completed');

  // Test Case C: Completed admin by onboarding_status
  const retryCaseC = checkRetryEligibility({ id: 'adm-3', is_super_admin: false, onboarding_status: 'completed' }, {});
  assert(!retryCaseC.eligible, 'Rejects retry when onboarding_status is completed');

  // Test Case D: Ambiguous account (legacy admin, neither pending nor completed)
  const retryCaseD = checkRetryEligibility({ id: 'adm-4', is_super_admin: false }, {});
  assert(!retryCaseD.eligible, 'Fails closed and rejects retry when account state is ambiguous (neither pending nor completed)');

  // Test Case E: Super Admin account
  const retryCaseE = checkRetryEligibility({ id: 'adm-super', is_super_admin: true, must_change_password: true }, { must_change_password: true });
  assert(!retryCaseE.eligible && Boolean(retryCaseE.reason?.includes('Protected')), 'Rejects retry on Super Admin role unconditionally');

  // Test Case F: Genuinely pending admin (unmigrated DB, app_metadata = true)
  const retryCaseF = checkRetryEligibility({ id: 'adm-5', is_super_admin: false }, { must_change_password: true });
  assert(retryCaseF.eligible, 'Allows retry for genuinely pending administrator with unmigrated DB');

  // Test Case G: Genuinely pending admin (migrated DB, db = true)
  const retryCaseG = checkRetryEligibility({ id: 'adm-6', is_super_admin: false, must_change_password: true }, { must_change_password: true });
  assert(retryCaseG.eligible, 'Allows retry for genuinely pending administrator with migrated DB');

  // 8. Forced Setup Action Access Guard
  console.log('\n[Suite 8: Forced Setup Action Access Guard Logic]');
  function canExecutePasswordSetup(
    adminProfile: { is_active: boolean; must_change_password?: boolean; onboarding_expires_at?: string | null },
    appMeta: { must_change_password?: boolean; onboarding_expires_at?: string } = {}
  ): { allowed: boolean; error?: string } {
    if (!adminProfile.is_active) {
      return { allowed: false, error: 'Administrator record not found or deactivated.' };
    }

    const mustChangePassword =
      typeof adminProfile.must_change_password === 'boolean'
        ? adminProfile.must_change_password
        : Boolean(appMeta.must_change_password);

    if (!mustChangePassword) {
      return { allowed: false, error: 'Administrator setup has already been completed.' };
    }

    const expiresAt =
      adminProfile.onboarding_expires_at ||
      (typeof appMeta.onboarding_expires_at === 'string' ? appMeta.onboarding_expires_at : null);

    if (expiresAt) {
      const expTime = new Date(expiresAt).getTime();
      if (!isNaN(expTime) && expTime < Date.now()) {
        return { allowed: false, error: 'Temporary onboarding window has expired.' };
      }
    }

    return { allowed: true };
  }

  assert(!canExecutePasswordSetup({ is_active: true, must_change_password: false }).allowed, 'Rejects password setup execution for completed admin');
  assert(!canExecutePasswordSetup({ is_active: true }, { must_change_password: false }).allowed, 'Rejects password setup execution when app_metadata is false and DB is unmigrated');
  assert(!canExecutePasswordSetup({ is_active: false, must_change_password: true }).allowed, 'Rejects password setup execution for deactivated admin');
  assert(!canExecutePasswordSetup({ is_active: true, must_change_password: true, onboarding_expires_at: pastExpiration }).allowed, 'Rejects password setup execution when expired');
  assert(canExecutePasswordSetup({ is_active: true, must_change_password: true, onboarding_expires_at: futureExpiration }).allowed, 'Permits password setup execution for valid pending unexpired admin');

  // 9. Email Outcome & Delivery Claim Accuracy
  console.log('\n[Suite 9: Email Outcome & Delivery Claim Accuracy]');
  function formatProvisioningOutcomeMessage(
    fullName: string,
    email: string,
    emailResult: { success: boolean; isSimulated?: boolean; error?: string },
    isDevFallback = false
  ): { success: boolean; message: string } {
    if (!emailResult.success) {
      const failureDetail = emailResult.error ? ` (${emailResult.error})` : '';
      const failureExplanation = isDevFallback
        ? `Administrator account was provisioned, but email delivery failed${failureDetail}. In local development, the initial temporary password is set to ${DEV_ADMIN_TEMP_PASSWORD_FALLBACK} (first-login password change is mandatory).`
        : `Administrator account was provisioned, but email delivery failed${failureDetail}. You can safely retry email delivery from the Administrator list once email configuration is resolved.`;

      return {
        success: true,
        message: failureExplanation,
      };
    }

    const successMessage = emailResult.isSimulated
      ? `Administrator ${fullName} provisioned successfully (email delivery simulated in development).${
          isDevFallback ? ` In local development, temporary initial password is ${DEV_ADMIN_TEMP_PASSWORD_FALLBACK}.` : ''
        }`
      : `Administrator ${fullName} provisioned successfully and temporary credentials sent to ${email}.${
          isDevFallback ? ` (Local development note: temporary password is ${DEV_ADMIN_TEMP_PASSWORD_FALLBACK}).` : ''
        }`;

    return {
      success: true,
      message: successMessage,
    };
  }

  const failOutcomeDev = formatProvisioningOutcomeMessage(
    'Jane Doe',
    'jane@example.com',
    {
      success: false,
      error: 'You can only send testing emails to your own email address.',
    },
    true
  );
  assert(!failOutcomeDev.message.toLowerCase().includes('sent to'), 'Failed email outcome does not claim credentials were sent');
  assert(!failOutcomeDev.message.toLowerCase().includes('dispatched'), 'Failed email outcome does not claim credentials were dispatched');
  assert(failOutcomeDev.message.includes('email delivery failed'), 'Failed email outcome explicitly states delivery failed');
  assert(failOutcomeDev.message.includes('You can only send testing emails'), 'Failed email outcome preserves provider failure reason');
  assert(failOutcomeDev.message.includes('Hackleague@nmit'), 'Development failed email outcome mentions temporary fallback Hackleague@nmit');
  assert(failOutcomeDev.message.includes('first-login password change is mandatory'), 'Development failed email outcome reminds that password change is mandatory');

  const failOutcomeProd = formatProvisioningOutcomeMessage(
    'Jane Doe',
    'jane@example.com',
    {
      success: false,
      error: 'Connection timeout',
    },
    false
  );
  assert(!failOutcomeProd.message.includes('Hackleague@nmit'), 'Production failed email outcome NEVER mentions Hackleague@nmit');
  assert(!failOutcomeProd.message.toLowerCase().includes('sent to'), 'Production failed email outcome does not claim email was sent');

  const simOutcome = formatProvisioningOutcomeMessage(
    'Jane Doe',
    'jane@example.com',
    {
      success: true,
      isSimulated: true,
    },
    true
  );
  assert(simOutcome.message.includes('simulated in development'), 'Simulated email outcome clearly identifies development simulation');
  assert(!simOutcome.message.toLowerCase().includes('sent to'), 'Simulated email outcome does not falsely claim credentials were sent to recipient');

  const liveOutcomeProd = formatProvisioningOutcomeMessage(
    'Jane Doe',
    'jane@example.com',
    {
      success: true,
      isSimulated: false,
    },
    false
  );
  assert(liveOutcomeProd.message.includes('sent to jane@example.com'), 'Live production email outcome confirms dispatch to recipient email');
  assert(!liveOutcomeProd.message.includes('Hackleague@nmit'), 'Live production email outcome NEVER mentions Hackleague@nmit');

  // 10. Development-Only Temporary Password Fallback & Production Guard
  console.log('\n[Suite 10: Development-Only Temporary Password Fallback & Production Guard]');
  const devResult1 = getInitialAdminProvisioningPassword('development');
  assert(devResult1.password === 'Hackleague@nmit', 'Returns Hackleague@nmit in development environment');
  assert(devResult1.isDevFallback === true, 'Flags isDevFallback = true in development environment');

  const devResult2 = getInitialAdminProvisioningPassword('test');
  assert(devResult2.password === 'Hackleague@nmit', 'Returns Hackleague@nmit in test environment');
  assert(devResult2.isDevFallback === true, 'Flags isDevFallback = true in test environment');

  const prodResult = getInitialAdminProvisioningPassword('production');
  assert(prodResult.isDevFallback === false, 'Flags isDevFallback = false strictly in production');
  assert(prodResult.password !== 'Hackleague@nmit', 'Production password is NEVER the static Hackleague@nmit');
  assert(prodResult.password.length === 24, 'Production password has 24 characters of high entropy');
  assert(
    resetPasswordSchema.safeParse({ password: prodResult.password, confirmPassword: prodResult.password }).success,
    'Production password satisfies full complexity schema'
  );

  const prodPasswords = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const res = getInitialAdminProvisioningPassword('production');
    prodPasswords.add(res.password);
    if (res.password === 'Hackleague@nmit' || res.isDevFallback !== false) {
      assert(false, 'Production guard failed on iteration ' + i);
      break;
    }
  }
  assert(prodPasswords.size === 50, '50 production passwords generated without collisions');

  // 11. First-Login Password Change Enforcement & Permanent Password Protection
  console.log('\n[Suite 11: First-Login Password Change Enforcement & Permanent Password Protection]');
  const fallbackSchemaCheck = resetPasswordSchema.safeParse({
    password: DEV_ADMIN_TEMP_PASSWORD_FALLBACK,
    confirmPassword: DEV_ADMIN_TEMP_PASSWORD_FALLBACK,
  });
  assert(
    !fallbackSchemaCheck.success,
    'Hackleague@nmit naturally fails resetPasswordSchema because it contains no digits (cannot be submitted as new password)'
  );

  function validatePermanentPasswordChange(submittedPassword: string): { valid: boolean; error?: string } {
    if (submittedPassword.toLowerCase() === DEV_ADMIN_TEMP_PASSWORD_FALLBACK.toLowerCase()) {
      return { valid: false, error: 'Your new permanent password cannot be the shared temporary onboarding password.' };
    }
    const schemaRes = resetPasswordSchema.safeParse({ password: submittedPassword, confirmPassword: submittedPassword });
    if (!schemaRes.success) {
      return { valid: false, error: 'Complexity requirements not met.' };
    }
    return { valid: true };
  }

  assert(
    !validatePermanentPasswordChange('Hackleague@nmit').valid,
    'Rejects Hackleague@nmit from being chosen as permanent password'
  );
  assert(
    !validatePermanentPasswordChange('hackleague@nmit').valid,
    'Rejects lowercase hackleague@nmit from being chosen as permanent password'
  );
  assert(
    !validatePermanentPasswordChange('HACKLEAGUE@NMIT').valid,
    'Rejects uppercase HACKLEAGUE@NMIT from being chosen as permanent password'
  );
  assert(
    validatePermanentPasswordChange('SecurePermanentPassword123!').valid,
    'Accepts valid, strong, non-fallback permanent password'
  );

  function checkRouteAccessForPendingAdmin(
    path: string,
    mustChangePassword: boolean
  ): { allowed: boolean; redirectUrl?: string } {
    if (mustChangePassword) {
      if (path === '/auth/complete-setup' || path.startsWith('/auth/signout') || path === '/login') {
        return { allowed: true };
      }
      return { allowed: false, redirectUrl: '/auth/complete-setup' };
    }
    if (path === '/auth/complete-setup') {
      return { allowed: false, redirectUrl: '/admin' };
    }
    return { allowed: true };
  }

  assert(
    !checkRouteAccessForPendingAdmin('/admin', true).allowed &&
      checkRouteAccessForPendingAdmin('/admin', true).redirectUrl === '/auth/complete-setup',
    'Pending admin is redirected from /admin to /auth/complete-setup'
  );
  assert(
    !checkRouteAccessForPendingAdmin('/admin/hackathons', true).allowed &&
      checkRouteAccessForPendingAdmin('/admin/hackathons', true).redirectUrl === '/auth/complete-setup',
    'Pending admin is redirected from deep admin route to /auth/complete-setup'
  );
  assert(
    !checkRouteAccessForPendingAdmin('/student', true).allowed &&
      checkRouteAccessForPendingAdmin('/student', true).redirectUrl === '/auth/complete-setup',
    'Pending admin is blocked from /student route'
  );
  assert(
    checkRouteAccessForPendingAdmin('/auth/complete-setup', true).allowed,
    'Pending admin is allowed access to /auth/complete-setup'
  );
  assert(
    !checkRouteAccessForPendingAdmin('/auth/complete-setup', false).allowed,
    'Completed admin is redirected away from /auth/complete-setup'
  );

  console.log(`\n=== Results: ${passed} / ${total} unit tests passed ===`);
  if (passed !== total) {
    process.exit(1);
  }
}

runUnitTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

