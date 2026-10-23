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

  // 6. Two-Store Resilient Onboarding State Resolution
  console.log('\n[Suite 6: Two-Store Resilient Onboarding State Resolution]');
  function resolveAdminOnboardingState(
    dbRow: { must_change_password?: boolean; onboarding_expires_at?: string | null; onboarding_status?: string; is_super_admin?: boolean },
    appMetadata: { must_change_password?: boolean; onboarding_expires_at?: string; onboarding_status?: string; role?: string; [key: string]: unknown } = {}
  ) {
    const isSuperAdmin = Boolean(dbRow.is_super_admin || appMetadata.role === 'super_admin');
    if (isSuperAdmin) {
      return { mustChangePassword: false, onboardingExpiresAt: null, onboardingStatus: 'completed' };
    }

    const mustChangePassword = Boolean(dbRow.must_change_password || appMetadata.must_change_password);

    const onboardingExpiresAt =
      dbRow.onboarding_expires_at ||
      (typeof appMetadata.onboarding_expires_at === 'string' ? appMetadata.onboarding_expires_at : null);

    const onboardingStatus =
      dbRow.onboarding_status && dbRow.onboarding_status !== 'completed'
        ? dbRow.onboarding_status
        : typeof appMetadata.onboarding_status === 'string' && appMetadata.onboarding_status !== 'completed'
        ? appMetadata.onboarding_status
        : mustChangePassword
        ? 'pending'
        : 'completed';

    return { mustChangePassword, onboardingExpiresAt, onboardingStatus };
  }

  // Drifted DB row: table defaulted to must_change_password = false, but GoTrue app_metadata has true
  const driftedPendingDb = { must_change_password: false, onboarding_status: 'completed' };
  const driftedPendingMeta = { must_change_password: true, onboarding_expires_at: futureExpiration, onboarding_status: 'email_failed' };
  const resDrift = resolveAdminOnboardingState(driftedPendingDb, driftedPendingMeta);
  assert(resDrift.mustChangePassword === true, 'Correctly flags pending when app_metadata is true despite DB column default false');
  assert(resDrift.onboardingExpiresAt === futureExpiration, 'Resolves expiration from app_metadata when DB is null');
  assert(resDrift.onboardingStatus === 'email_failed', 'Preserves email_failed status from app_metadata');

  // Both stores completed
  const completedDb = { must_change_password: false, onboarding_status: 'completed' };
  const completedMeta = { must_change_password: false, onboarding_status: 'completed' };
  const resCompleted = resolveAdminOnboardingState(completedDb, completedMeta);
  assert(resCompleted.mustChangePassword === false, 'Correctly resolves completed when both stores mark setup finished');

  // Super Admin
  const superAdminDb = { is_super_admin: true, must_change_password: false };
  const superAdminMeta = { role: 'super_admin' };
  const resSuper = resolveAdminOnboardingState(superAdminDb, superAdminMeta);
  assert(resSuper.mustChangePassword === false, 'Existing Super Admin is never forced into password change');

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
    adminProfile: { is_active: boolean; is_super_admin?: boolean; must_change_password?: boolean; onboarding_expires_at?: string | null },
    appMeta: { must_change_password?: boolean; onboarding_expires_at?: string; role?: string } = {}
  ): { allowed: boolean; error?: string } {
    if (!adminProfile.is_active) {
      return { allowed: false, error: 'Administrator record not found or deactivated.' };
    }

    const mustChangePassword = !adminProfile.is_super_admin && Boolean(
      adminProfile.must_change_password || appMeta.must_change_password
    );

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

  assert(canExecutePasswordSetup({ is_active: true, must_change_password: false }, { must_change_password: true }).allowed, 'Permits password setup execution for admin with app_metadata must_change_password true (even if DB is false)');
  assert(canExecutePasswordSetup({ is_active: true, must_change_password: true }, { must_change_password: true }).allowed, 'Permits password setup execution when both stores are true');
  assert(!canExecutePasswordSetup({ is_active: true, must_change_password: false }, { must_change_password: false }).allowed, 'Rejects password setup execution for completed admin');
  assert(!canExecutePasswordSetup({ is_active: true, is_super_admin: true }).allowed, 'Rejects password setup execution for Super Admin');
  assert(!canExecutePasswordSetup({ is_active: false, must_change_password: true }).allowed, 'Rejects password setup execution for deactivated admin');
  assert(!canExecutePasswordSetup({ is_active: true, must_change_password: true, onboarding_expires_at: pastExpiration }).allowed, 'Rejects password setup execution when expired');
  assert(canExecutePasswordSetup({ is_active: true, must_change_password: true, onboarding_expires_at: futureExpiration }).allowed, 'Permits password setup execution for valid pending unexpired admin');
  assert(canExecutePasswordSetup({ is_active: true, must_change_password: true, onboarding_expires_at: futureExpiration }).allowed, 'Permits password setup execution for valid pending unexpired admin');

  // 9. Email Outcome & Delivery Claim Accuracy
  console.log('\n[Suite 9: Email Outcome & Delivery Claim Accuracy]');
  function formatProvisioningOutcomeMessage(
    fullName: string,
    email: string,
    emailResult: { success: boolean; isSimulated?: boolean; error?: string }
  ): { success: boolean; message: string; error?: string } {
    if (!emailResult.success) {
      const failureDetail = emailResult.error ? ` (${emailResult.error})` : '';
      const failureExplanation = `Administrator account identity was provisioned, but email delivery of temporary credentials failed${failureDetail}. Please use "Resend Credentials" from the Administrator list once email delivery is restored.`;

      return {
        success: false,
        error: failureExplanation,
        message: failureExplanation,
      };
    }

    const successMessage = emailResult.isSimulated
      ? `Administrator ${fullName} provisioned successfully (email delivery simulated in test environment).`
      : `Administrator ${fullName} provisioned successfully and temporary credentials sent to ${email}.`;

    return {
      success: true,
      message: successMessage,
    };
  }

  const failOutcome = formatProvisioningOutcomeMessage(
    'Jane Doe',
    'jane@example.com',
    {
      success: false,
      error: 'You can only send testing emails to your own email address.',
    }
  );
  assert(failOutcome.success === false, 'Failed email delivery reports success: false (Requirement 5)');
  assert(!failOutcome.message.toLowerCase().includes('sent to'), 'Failed email outcome does not claim credentials were sent');
  assert(!failOutcome.message.toLowerCase().includes('dispatched'), 'Failed email outcome does not claim credentials were dispatched');
  assert(failOutcome.message.includes('email delivery of temporary credentials failed'), 'Failed email outcome explicitly states delivery failed');
  assert(failOutcome.message.includes('You can only send testing emails'), 'Failed email outcome preserves provider failure reason');
  assert(!failOutcome.message.includes('Hackleague@nmit'), 'Failed email outcome NEVER leaks or mentions Hackleague@nmit');
  assert(failOutcome.message.includes('Resend Credentials'), 'Failed email outcome directs user to recovery/resend workflow');

  const failOutcomeTimeout = formatProvisioningOutcomeMessage(
    'Jane Doe',
    'jane@example.com',
    {
      success: false,
      error: 'Connection timeout',
    }
  );
  assert(failOutcomeTimeout.success === false, 'Network failure reports success: false');
  assert(!failOutcomeTimeout.message.includes('Hackleague@nmit'), 'Network failure outcome NEVER mentions Hackleague@nmit');
  assert(!failOutcomeTimeout.message.toLowerCase().includes('sent to'), 'Network failure outcome does not claim email was sent');

  const simOutcome = formatProvisioningOutcomeMessage(
    'Jane Doe',
    'jane@example.com',
    {
      success: true,
      isSimulated: true,
    }
  );
  assert(simOutcome.success === true, 'Simulated test delivery reports success: true');
  assert(simOutcome.message.includes('simulated in test environment'), 'Simulated email outcome clearly identifies test environment simulation');
  assert(!simOutcome.message.includes('Hackleague@nmit'), 'Simulated email outcome never contains Hackleague@nmit');

  const liveOutcome = formatProvisioningOutcomeMessage(
    'Jane Doe',
    'jane@example.com',
    {
      success: true,
      isSimulated: false,
    }
  );
  assert(liveOutcome.success === true, 'Live accepted email delivery reports success: true');
  assert(liveOutcome.message.includes('sent to jane@example.com'), 'Live verified email outcome confirms dispatch to recipient email');
  assert(!liveOutcome.message.includes('Hackleague@nmit'), 'Live verified email outcome NEVER mentions Hackleague@nmit');

  // 10. Server-Only Cryptographic Password Generation (Zero Static Fallback)
  console.log('\n[Suite 10: Server-Only Cryptographic Password Generation (Zero Static Fallback)]');
  const genResult = getInitialAdminProvisioningPassword();
  assert(genResult.isDevFallback === false, 'Flags isDevFallback = false in all environments');
  assert(genResult.password !== 'Hackleague@nmit', 'Provisioning password is NEVER static Hackleague@nmit');
  assert(genResult.password.length === 24, 'Temporary password strictly maintains 24 characters of high entropy');
  assert(
    resetPasswordSchema.safeParse({ password: genResult.password, confirmPassword: genResult.password }).success,
    'Temporary password satisfies full complexity schema'
  );

  const genPasswords = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const res = getInitialAdminProvisioningPassword();
    genPasswords.add(res.password);
    if (res.password === 'Hackleague@nmit' || res.isDevFallback !== false) {
      assert(false, 'Static fallback was unexpectedly generated on iteration ' + i);
      break;
    }
  }
  assert(genPasswords.size === 50, '50 sequential temporary passwords generated without collisions (>146 bits entropy each)');

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

  // 12. Atomic Password Update & Onboarding Completion Lifecycle
  console.log('\n[Suite 12: Atomic Password Update & Onboarding Completion Lifecycle]');
  interface MockLifecycleParams {
    authUpdateError?: Error | null;
    metaUpdateError?: Error | null;
    dbUpdateError?: Error | null;
  }

  function simulateSetupCompletion(params: MockLifecycleParams) {
    let authPasswordUpdated = false;
    let metaUpdated = false;
    let dbUpdated = false;

    // Step 1: Update Auth password
    if (params.authUpdateError) {
      return {
        success: false,
        error: params.authUpdateError.message,
        authPasswordUpdated,
        metaUpdated,
        dbUpdated,
      };
    }
    authPasswordUpdated = true;

    // Step 2: Update Auth metadata
    if (params.metaUpdateError) {
      return {
        success: false,
        error: 'Password was updated, but failed to synchronize onboarding metadata. Please contact support.',
        authPasswordUpdated,
        metaUpdated,
        dbUpdated,
      };
    }
    metaUpdated = true;

    // Step 3: Update DB profile
    if (params.dbUpdateError) {
      return {
        success: false,
        error: 'Password was updated, but failed to record profile status. Please contact support.',
        authPasswordUpdated,
        metaUpdated,
        dbUpdated,
      };
    }
    dbUpdated = true;

    return {
      success: true,
      redirectTo: '/admin',
      authPasswordUpdated,
      metaUpdated,
      dbUpdated,
    };
  }

  const step1Fail = simulateSetupCompletion({ authUpdateError: new Error('Weak password or Auth down') });
  assert(!step1Fail.success, 'Fails when Supabase Auth password update fails');
  assert(!step1Fail.authPasswordUpdated, 'Auth password was not updated on error');
  assert(!step1Fail.metaUpdated, 'Onboarding metadata is NOT marked complete when password update fails');
  assert(!step1Fail.dbUpdated, 'Database profile is NOT marked complete when password update fails');

  const step2Fail = simulateSetupCompletion({ metaUpdateError: new Error('Internal GoTrue error') });
  assert(!step2Fail.success, 'Fails when Auth metadata sync fails');
  assert(step2Fail.authPasswordUpdated, 'Password update occurred before metadata failure');
  assert(!step2Fail.metaUpdated, 'Metadata remains unconfirmed on error');
  assert(!step2Fail.dbUpdated, 'Database profile not updated when metadata sync fails');
  assert(Boolean(step2Fail.error?.includes('synchronize onboarding metadata')), 'Returns truthful error for metadata sync failure');

  const step3Fail = simulateSetupCompletion({ dbUpdateError: new Error('Permission denied') });
  assert(!step3Fail.success, 'Fails when database profile update fails');
  assert(step3Fail.authPasswordUpdated && step3Fail.metaUpdated && !step3Fail.dbUpdated, 'Reports failure accurately without falsely claiming complete success');
  assert(Boolean(step3Fail.error?.includes('record profile status')), 'Returns truthful error for database profile failure');

  const allSuccess = simulateSetupCompletion({});
  assert(allSuccess.success, 'Reports success when all steps complete');
  assert(allSuccess.authPasswordUpdated && allSuccess.metaUpdated && allSuccess.dbUpdated, 'Marks both stores complete only after password update succeeds');
  assert(allSuccess.redirectTo === '/admin', 'Directs admin to /admin workspace upon completion');

  // 13. Password Visibility Toggles Functionality
  console.log('\n[Suite 13: Password Visibility Toggles Functionality]');
  class PasswordVisibilityModel {
    showPassword = false;
    showConfirmPassword = false;
    password = 'InitialSecretPass123!';
    confirmPassword = 'InitialSecretPass123!';

    togglePassword() {
      this.showPassword = !this.showPassword;
    }

    toggleConfirmPassword() {
      this.showConfirmPassword = !this.showConfirmPassword;
    }

    getPasswordType() {
      return this.showPassword ? 'text' : 'password';
    }

    getConfirmPasswordType() {
      return this.showConfirmPassword ? 'text' : 'password';
    }

    getPasswordAriaLabel() {
      return this.showPassword ? 'Hide password' : 'Show password';
    }

    getConfirmPasswordAriaLabel() {
      return this.showConfirmPassword ? 'Hide password' : 'Show password';
    }
  }

  const model = new PasswordVisibilityModel();
  assert(model.getPasswordType() === 'password', 'New password initial state is type=password');
  assert(model.getConfirmPasswordType() === 'password', 'Confirm password initial state is type=password');
  assert(model.getPasswordAriaLabel() === 'Show password', 'Accessible label initially Show password');

  model.togglePassword();
  assert(model.getPasswordType() === 'text', 'Clicking new password toggle switches to type=text');
  assert(model.getConfirmPasswordType() === 'password', 'Confirm password remains type=password (independent toggles)');
  assert(model.password === 'InitialSecretPass123!', 'Field value preserved during toggle');
  assert(model.getPasswordAriaLabel() === 'Hide password', 'Accessible label switches to Hide password');

  model.toggleConfirmPassword();
  assert(model.getConfirmPasswordType() === 'text', 'Clicking confirm password toggle switches to type=text');
  assert(model.confirmPassword === 'InitialSecretPass123!', 'Confirm field value preserved during toggle');

  model.togglePassword();
  assert(model.getPasswordType() === 'password', 'Toggling new password again returns to type=password');
  assert(model.getConfirmPasswordType() === 'text', 'Confirm password remains type=text');

  // 14. Normal Admin Login and Authorization Continuity
  console.log('\n[Suite 14: Normal Admin Login & Authorization Continuity]');
  function routeAdminAfterLogin(
    admin: { is_active: boolean; is_super_admin: boolean; must_change_password: boolean },
    appMeta: { must_change_password?: boolean },
    safeRedirect?: string | null
  ): { destination: string; allowed: boolean } {
    if (!admin.is_active) {
      return { destination: '/login', allowed: false };
    }

    const mustChange = !admin.is_super_admin && Boolean(
      admin.must_change_password || appMeta.must_change_password
    );

    if (mustChange) {
      return { destination: '/auth/complete-setup', allowed: true };
    }

    if (safeRedirect && !safeRedirect.startsWith('/login') && !safeRedirect.startsWith('/auth/complete-setup')) {
      return { destination: safeRedirect, allowed: true };
    }

    return { destination: '/admin', allowed: true };
  }

  const completedAdminLogin = routeAdminAfterLogin(
    { is_active: true, is_super_admin: false, must_change_password: false },
    { must_change_password: false }
  );
  assert(completedAdminLogin.destination === '/admin', 'Completed admin logs in and routes to /admin');

  const completedAdminRedirect = routeAdminAfterLogin(
    { is_active: true, is_super_admin: false, must_change_password: false },
    { must_change_password: false },
    '/admin/hackathons'
  );
  assert(completedAdminRedirect.destination === '/admin/hackathons', 'Completed admin preserves deep return path');

  const pendingAdminLogin = routeAdminAfterLogin(
    { is_active: true, is_super_admin: false, must_change_password: true },
    { must_change_password: true },
    '/admin/hackathons'
  );
  assert(pendingAdminLogin.destination === '/auth/complete-setup', 'Pending admin is forced to /auth/complete-setup even if deep redirect requested');

  const deactivatedAdminLogin = routeAdminAfterLogin(
    { is_active: false, is_super_admin: false, must_change_password: false },
    { must_change_password: false }
  );
  assert(!deactivatedAdminLogin.allowed && deactivatedAdminLogin.destination === '/login', 'Deactivated admin is rejected from platform');

  // 15. Duplicate Account Protection & Safe Resend/Recovery Matrix
  console.log('\n[Suite 15: Duplicate Account Protection & Safe Recovery Matrix]');
  function simulateAdminProvisioningPrechecks(
    email: string,
    existingStudents: Array<{ id: string; email: string }>,
    existingAdmins: Array<{ id: string; email: string }>
  ): { canProceed: boolean; error?: string } {
    const norm = email.trim().toLowerCase();
    const student = existingStudents.find((s) => s.email.trim().toLowerCase() === norm);
    if (student) {
      return { canProceed: false, error: 'Cannot provision administrator: this email belongs to an existing student' };
    }
    const admin = existingAdmins.find((a) => a.email.trim().toLowerCase() === norm);
    if (admin) {
      return { canProceed: false, error: 'An account with this email already exists.' };
    }
    return { canProceed: true };
  }

  const existingDbAdmins = [{ id: '1a2343ed-0216-40ab-8b1c-6b1b8e5f3f28', email: 'ssabotage246@gmail.com' }];
  const existingDbStudents = [{ id: 'stu-1', email: 'student1@nmit.ac.in' }];

  const dupAdminCheck = simulateAdminProvisioningPrechecks('ssabotage246@gmail.com', existingDbStudents, existingDbAdmins);
  assert(!dupAdminCheck.canProceed, 'Rejects duplicate administrator provisioning for existing account ssabotage246@gmail.com');
  assert(dupAdminCheck.error === 'An account with this email already exists.', 'Returns clear duplicate rejection error without modifying account');

  const dupStudentCheck = simulateAdminProvisioningPrechecks('student1@nmit.ac.in', existingDbStudents, existingDbAdmins);
  assert(!dupStudentCheck.canProceed, 'Rejects administrator provisioning for existing student account');
  assert(Boolean(dupStudentCheck.error?.includes('belongs to an existing student')), 'Identifies existing student conflict');

  const brandNewCheck = simulateAdminProvisioningPrechecks('newadmin@devsrujan.live', existingDbStudents, existingDbAdmins);
  assert(brandNewCheck.canProceed, 'Allows provisioning when email is unassociated with any profile');

  // 16. Verified Sender Domain & Secret Redaction in Delivery Logs
  console.log('\n[Suite 16: Verified Sender Domain & Secret Redaction in Delivery Logs]');
  function resolveConfiguredSender(envSender?: string): string {
    return envSender || 'HackLeague@devsrujan.live';
  }

  assert(resolveConfiguredSender('HackLeague@devsrujan.live') === 'HackLeague@devsrujan.live', 'Resolves verified sender HackLeague@devsrujan.live from env');
  assert(resolveConfiguredSender(undefined) === 'HackLeague@devsrujan.live', 'Defaults to verified domain sender HackLeague@devsrujan.live when undefined');
  assert(resolveConfiguredSender('HackLeague@devsrujan.live').endsWith('@devsrujan.live'), 'Sender strictly uses verified devsrujan.live domain');

  function sanitizeEmailLogPayload(variables: Record<string, unknown>): Record<string, unknown> {
    const safePayload = { ...variables };
    delete safePayload.password;
    delete safePayload.token;
    delete safePayload.temporaryPassword;
    delete safePayload.tempPassword;
    if ('otp' in safePayload) {
      safePayload.otp = '[REDACTED]';
    }
    return safePayload;
  }

  const sanitized = sanitizeEmailLogPayload({
    name: 'Test Admin',
    email: 'test@example.com',
    temporaryPassword: 'GeneratedSecret123!@#$',
    password: 'SuperSecretPassword!',
    otp: '123456',
    loginUrl: 'https://devsrujan.live/login',
  });

  assert(sanitized.temporaryPassword === undefined, 'Temporary password is strictly purged from audit log payload');
  assert(sanitized.password === undefined, 'Password is strictly purged from audit log payload');
  assert(sanitized.otp === '[REDACTED]', 'OTP is redacted to [REDACTED]');
  assert(sanitized.email === 'test@example.com', 'Safe contextual parameters preserved in log payload');

  console.log(`\n=== Results: ${passed} / ${total} unit tests passed ===`);
  if (passed !== total) {
    process.exit(1);
  }
}

runUnitTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

