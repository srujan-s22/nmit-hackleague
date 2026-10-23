'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/auth/rate-limiter';
import {
  generateSecureTemporaryPassword,
  getInitialAdminProvisioningPassword,
} from '@/lib/auth/password-generator';
import { sendTransactionalEmail } from '@/lib/email/resend-service';
import { headers } from 'next/headers';
import {
  adminCreationSchema,
  adminPermissionsUpdateSchema,
  adminStatusSchema,
  adminReassignSchema,
} from '@/lib/auth/permissions';
import type {
  AdminCreationInput,
  AdminUpdateInput,
  AdminWithPermissions,
  ActionResult,
} from '@/types/auth';

async function getAppUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  try {
    const headerList = await headers();
    const host = headerList.get('host') || 'localhost:3000';
    const protocol = headerList.get('x-forwarded-proto') || 'http';
    return `${protocol}://${host}`;
  } catch {
    return 'http://localhost:3000';
  }
}

/**
 * Fetch all administrator accounts with their explicit permissions and assigned active hackathons.
 * Restricted strictly to active Super Admin.
 */
export async function fetchAdminsAction(): Promise<ActionResult<AdminWithPermissions[]>> {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();
    const adminClient = createAdminClient();

    const { data: admins, error: adminsError } = await supabase
      .from('admin_profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (adminsError) {
      return { success: false, error: adminsError.message };
    }

    const { data: permissionsData, error: permError } = await supabase
      .from('admin_permissions')
      .select('admin_id, permission');

    if (permError) {
      return { success: false, error: permError.message };
    }

    const { data: activeHackathonsData } = await supabase
      .from('hackathons')
      .select('id, title, slug, status, in_charge_admin_id')
      .in('status', ['published', 'registration_closed', 'ongoing']);

    const permMap = new Map<string, string[]>();
    for (const p of permissionsData || []) {
      const existing = permMap.get(p.admin_id) || [];
      existing.push(p.permission);
      permMap.set(p.admin_id, existing);
    }

    const hackathonMap = new Map<string, { id: string; title: string; slug: string; status: string }[]>();
    for (const h of activeHackathonsData || []) {
      if (h.in_charge_admin_id) {
        const existing = hackathonMap.get(h.in_charge_admin_id) || [];
        existing.push({
          id: h.id,
          title: h.title,
          slug: h.slug,
          status: h.status,
        });
        hackathonMap.set(h.in_charge_admin_id, existing);
      }
    }

    // Query GoTrue user metadata to ensure onboarding state is accurate even if forward-only DB migration is unapplied
    const { data: userListData } = await adminClient.auth.admin.listUsers();
    const userMetaMap = new Map<string, Record<string, unknown>>();
    for (const u of userListData?.users || []) {
      userMetaMap.set(u.id, u.app_metadata || {});
    }

    const nowMs = Date.now();

    const result: AdminWithPermissions[] = (admins || []).map((admin) => {
      const activeEvents = hackathonMap.get(admin.id) || [];
      const appMeta = userMetaMap.get(admin.id) || {};
      const mustChange = !admin.is_super_admin && Boolean(
        admin.must_change_password || appMeta.must_change_password
      );
      const expiresAt =
        admin.onboarding_expires_at ||
        (typeof appMeta.onboarding_expires_at === 'string' ? appMeta.onboarding_expires_at : null);
      const status =
        admin.onboarding_status && admin.onboarding_status !== 'completed'
          ? admin.onboarding_status
          : typeof appMeta.onboarding_status === 'string' && appMeta.onboarding_status !== 'completed'
          ? appMeta.onboarding_status
          : mustChange
          ? 'pending'
          : 'completed';
      const isExpired = Boolean(
        mustChange && expiresAt && new Date(expiresAt).getTime() < nowMs
      );

      return {
        ...admin,
        must_change_password: mustChange,
        onboarding_expires_at: expiresAt,
        onboarding_status: status,
        isOnboardingExpired: isExpired,
        permissions: (permMap.get(admin.id) || []) as AdminWithPermissions['permissions'],
        activeHackathons: activeEvents,
        activeHackathonsCount: activeEvents.length,
      };
    });

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch administrator accounts.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return { success: false, error: message };
  }
}

/**
 * Provision a new administrator account.
 * Executes cross-system saga:
 * 1. Verify caller is active Super Admin
 * 2. Pre-check email uniqueness across profiles and admin_profiles
 * 3. GoTrue Admin inviteUserByEmail
 * 4. Transactional provision_admin_profile RPC
 * 5. Compensating deleteUser if DB transaction fails
 */
export async function createAdminAction(
  input: AdminCreationInput
): Promise<ActionResult<{ adminId: string }>> {
  let callerSuperAdmin: { admin: { id: string }; user: { id: string } };
  try {
    callerSuperAdmin = await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  // 1. Validate input payload against Zod schema
  const parsed = adminCreationSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
    return { success: false, error: errorMsg };
  }

  const { email, fullName, permissions } = parsed.data;

  // 2. Consume rate limit quota
  try {
    const allowed = await checkRateLimit('admin_management');
    if (!allowed) {
      return { success: false, error: 'Rate limit exceeded: maximum 10 administrative operations per minute.' };
    }
  } catch {
    // If rate limiter fails, proceed cautiously in development
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 3. Pre-check email exclusivity in public.profiles (Student)
  const { data: existingStudent, error: studentCheckError } = await adminClient
    .from('profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle();

  if (studentCheckError) {
    console.error('[ADMIN_PROVISION_ERROR] [STUDENT_PRECHECK_FAILED]', {
      email,
      error: studentCheckError.message,
    });
    return {
      success: false,
      error: 'Unable to verify email availability. Please verify server connectivity and try again.',
    };
  }

  if (existingStudent) {
    return {
      success: false,
      error: 'Cannot provision administrator: this email belongs to an existing student',
    };
  }

  // 4. Pre-check email exclusivity in public.admin_profiles
  const { data: existingAdmin, error: adminCheckError } = await adminClient
    .from('admin_profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle();

  if (adminCheckError) {
    console.error('[ADMIN_PROVISION_ERROR] [ADMIN_PRECHECK_FAILED]', {
      email,
      error: adminCheckError.message,
    });
    return {
      success: false,
      error: 'Unable to verify administrator directory. Please verify server connectivity and try again.',
    };
  }

  if (existingAdmin) {
    return {
      success: false,
      error: 'An account with this email already exists.',
    };
  }

  // 5. Generate unique, cryptographically secure temporary password (24 characters, >146 bits entropy)
  const { password: tempPassword } = getInitialAdminProvisioningPassword();
  const onboardingExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // 6. Check if user already exists in GoTrue (e.g. from an interrupted prior attempt)
  let targetAuthUid: string | null = null;
  let isNewlyCreatedAuthUser = false;

  const { data: userListData, error: listUsersError } = await adminClient.auth.admin.listUsers();
  if (listUsersError) {
    console.error('[ADMIN_PROVISION_ERROR] [AUTH_LIST_USERS_FAILED]', {
      email,
      error: listUsersError.message,
    });
    return {
      success: false,
      error: 'Authentication store unreachable or misconfigured. Please verify server credentials.',
    };
  }

  const existingAuthUser = (userListData?.users || []).find(
    (u) => u.email?.toLowerCase().trim() === email.toLowerCase().trim()
  );

  if (existingAuthUser) {
    // If existing account is already completed or is a super admin, fail closed
    const currentMeta = existingAuthUser.app_metadata || {};
    if (currentMeta.role === 'super_admin' || currentMeta.must_change_password === false) {
      return {
        success: false,
        error: 'An existing administrator account with this email already exists and cannot be modified.',
      };
    }

    // User exists in GoTrue: update credentials and server-controlled app_metadata
    targetAuthUid = existingAuthUser.id;
    const { error: updateExistingError } = await adminClient.auth.admin.updateUserById(targetAuthUid, {
      password: tempPassword,
      user_metadata: {
        role: 'admin',
        full_name: fullName,
      },
      app_metadata: {
        role: 'admin',
        must_change_password: true,
        onboarding_expires_at: onboardingExpiresAt,
        onboarding_status: 'pending',
      },
    });

    if (updateExistingError) {
      console.error('[ADMIN_PROVISION_ERROR] [AUTH_UPDATE_EXISTING_FAILED]', {
        email,
        error: updateExistingError.message,
      });
      return {
        success: false,
        error: 'Failed to update credentials for existing authentication account.',
      };
    }
  } else {
    // 7. GoTrue Account Creation with verified email and secure temporary password
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        role: 'admin',
        full_name: fullName,
      },
      app_metadata: {
        role: 'admin',
        must_change_password: true,
        onboarding_expires_at: onboardingExpiresAt,
        onboarding_status: 'pending',
      },
    });

    if (createError || !createData?.user) {
      const rawMsg = (createError?.message || '').toLowerCase();
      console.error('[ADMIN_PROVISION_ERROR] [AUTH_CREATE_USER_FAILED]', {
        email,
        error: createError?.message,
      });

      if (rawMsg.includes('already') || rawMsg.includes('exists') || rawMsg.includes('duplicate')) {
        return { success: false, error: 'An account with this email already exists in the authentication system.' };
      }
      if (rawMsg.includes('api key') || rawMsg.includes('jwt') || rawMsg.includes('unauthorized') || rawMsg.includes('forbidden')) {
        return {
          success: false,
          error: 'Authentication store configuration error (invalid credentials). Please check server configuration.',
        };
      }
      return { success: false, error: 'Failed to establish administrator authentication identity.' };
    }

    targetAuthUid = createData.user.id;
    isNewlyCreatedAuthUser = true;
  }

  // 8. Atomic Database Provisioning via provision_admin_profile RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc('provision_admin_profile', {
    p_auth_uid: targetAuthUid,
    p_email: email,
    p_full_name: fullName,
    p_permissions: permissions,
  });

  if (rpcError) {
    // Compensating Cleanup if newly created in this saga
    if (isNewlyCreatedAuthUser && targetAuthUid) {
      try {
        await adminClient.auth.admin.deleteUser(targetAuthUid);
      } catch (compError) {
        console.error('[PROVISION_COMPENSATION_FAILED] [CRITICAL_AUTH_ORPHAN]', {
          adminId: targetAuthUid,
          email,
          error: compError,
        });
        return {
          success: false,
          error: 'Partial failure: database provisioning failed and identity could not be automatically deleted. Account quarantined with zero permissions. Safe to retry.',
        };
      }
    }

    return {
      success: false,
      error: rpcError.message || 'Database provisioning failed.',
    };
  }

  // 9. Update admin_profiles table onboarding columns
  try {
    const { error: dbUpdateErr } = await adminClient
      .from('admin_profiles')
      .update({
        must_change_password: true,
        onboarding_expires_at: onboardingExpiresAt,
        onboarding_status: 'pending',
      })
      .eq('id', targetAuthUid);

    if (dbUpdateErr) {
      console.warn('[ADMIN_PROVISION_WARNING] Failed to update admin_profiles onboarding state:', dbUpdateErr.message);
    }
  } catch (err) {
    console.warn('[ADMIN_PROVISION_WARNING]', err);
  }

  // 10. Dispatch Transactional Onboarding Email via Resend
  const appUrl = await getAppUrl();
  const emailResult = await sendTransactionalEmail({
    to: email,
    subject: 'NMIT HackLeague — Administrator Account Setup & Credentials',
    template: 'admin_onboarding',
    variables: {
      name: fullName,
      email,
      temporaryPassword: tempPassword,
      loginUrl: `${appUrl}/login`,
    },
    userId: targetAuthUid,
    idempotencyKey: `onboarding-${targetAuthUid}-${Date.now()}`,
  });

  const finalStatus = emailResult.success ? 'sent' : 'email_failed';

  await adminClient.auth.admin.updateUserById(targetAuthUid, {
    app_metadata: {
      role: 'admin',
      must_change_password: true,
      onboarding_expires_at: onboardingExpiresAt,
      onboarding_status: finalStatus,
    },
  });

  try {
    await adminClient
      .from('admin_profiles')
      .update({ onboarding_status: finalStatus })
      .eq('id', targetAuthUid);
  } catch {
    // Ignore if column not present
  }

  // Record email delivery outcome in audit log (without secrets)
  try {
    await supabase.from('audit_logs').insert({
      actor_id: callerSuperAdmin.user.id,
      actor_role: 'super_admin',
      action: emailResult.success ? 'admin.onboarding_dispatched' : 'admin.onboarding_email_failed',
      target_type: 'admin_profile',
      target_id: targetAuthUid,
      details: {
        email,
        email_delivery_status: finalStatus,
        dispatched_at: new Date().toISOString(),
        ...(emailResult.error ? { error: emailResult.error } : {}),
      },
    });
  } catch {
    // Non-blocking
  }

  if (!emailResult.success) {
    console.warn('[ADMIN_ONBOARDING_EMAIL_FAILED]', {
      email,
      error: emailResult.error,
    });
    const failureDetail = emailResult.error ? ` (${emailResult.error})` : '';
    const failureExplanation = `Administrator account identity was provisioned, but email delivery of temporary credentials failed${failureDetail}. Please use "Resend Credentials" from the Administrator list once email delivery is restored.`;

    return {
      success: false,
      error: failureExplanation,
      message: failureExplanation,
      data: { adminId: targetAuthUid },
    };
  }

  const successMessage = emailResult.isSimulated
    ? `Administrator ${fullName} provisioned successfully (email delivery simulated in test environment).`
    : `Administrator ${fullName} provisioned successfully and temporary credentials sent to ${email}.`;

  return {
    success: true,
    message: successMessage,
    data: { adminId: targetAuthUid },
  };
}

/**
 * Safe retry action for administrator onboarding.
 * Generates a fresh temporary password, updates GoTrue Auth user, resets 24h expiration,
 * dispatches email, and audits the action.
 * Plaintext temporary password is NEVER logged or returned to client.
 */
export async function retryAdminOnboardingAction(
  adminId: string
): Promise<ActionResult> {
  let callerSuperAdmin: { admin: { id: string }; user: { id: string } };
  try {
    callerSuperAdmin = await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  if (!adminId || typeof adminId !== 'string') {
    return { success: false, error: 'Invalid administrator ID.' };
  }

  // Prevent retrying Super Admin
  if (adminId === callerSuperAdmin.admin.id || adminId === callerSuperAdmin.user.id) {
    return { success: false, error: 'Cannot re-onboard the active Super Admin account.' };
  }

  // Rate limiting check
  try {
    const allowed = await checkRateLimit('admin_management');
    if (!allowed) {
      return { success: false, error: 'Rate limit exceeded: please wait a moment before retrying.' };
    }
  } catch {
    // Proceed cautiously if rate limiter table is unavailable
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Verify target administrator exists and is active
  const { data: targetAdmin, error: adminErr } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', adminId)
    .single();

  if (adminErr || !targetAdmin) {
    return { success: false, error: 'Administrator account not found.' };
  }

  if (targetAdmin.is_super_admin) {
    return { success: false, error: 'Protected system role cannot be re-onboarded.' };
  }

  // Verify target user in GoTrue
  const { data: authUser, error: authUserErr } = await adminClient.auth.admin.getUserById(adminId);
  if (authUserErr || !authUser.user) {
    console.error('[ADMIN_RETRY_ERROR] [AUTH_GET_USER_FAILED]', {
      adminId,
      error: authUserErr?.message,
    });
    return { success: false, error: 'Authentication identity for administrator was not found or is inaccessible.' };
  }

  // Check if onboarding is already completed or if state is ambiguous (fail closed)
  const currentAppMeta = authUser.user.app_metadata || {};
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
      success: false,
      error: 'Administrator has already completed setup and verified their permanent password.',
    };
  }

  // Generate fresh temporary password and 24-hour expiration window
  const newTempPassword = generateSecureTemporaryPassword(24);
  const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Update password in Supabase Auth GoTrue
  const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(adminId, {
    password: newTempPassword,
    app_metadata: {
      ...currentAppMeta,
      role: 'admin',
      must_change_password: true,
      onboarding_expires_at: newExpiresAt,
      onboarding_status: 'pending',
    },
  });

  if (updateAuthErr) {
    console.error('[ADMIN_RETRY_ERROR] [AUTH_UPDATE_PASSWORD_FAILED]', {
      adminId,
      error: updateAuthErr.message,
    });
    const rawMsg = (updateAuthErr.message || '').toLowerCase();
    if (rawMsg.includes('api key') || rawMsg.includes('jwt') || rawMsg.includes('unauthorized')) {
      return {
        success: false,
        error: 'Authentication store configuration error (invalid credentials). Please check server configuration.',
      };
    }
    return {
      success: false,
      error: 'Failed to update temporary credential in authentication store.',
    };
  }

  try {
    await adminClient
      .from('admin_profiles')
      .update({
        must_change_password: true,
        onboarding_expires_at: newExpiresAt,
        onboarding_status: 'pending',
      })
      .eq('id', adminId);
  } catch {
    // Ignore if column not present
  }

  // Dispatch new onboarding email
  const appUrl = await getAppUrl();
  const emailResult = await sendTransactionalEmail({
    to: targetAdmin.email,
    subject: 'NMIT HackLeague — Reissued Administrator Credentials',
    template: 'admin_onboarding',
    variables: {
      name: targetAdmin.full_name,
      email: targetAdmin.email,
      temporaryPassword: newTempPassword,
      loginUrl: `${appUrl}/login`,
    },
    userId: adminId,
    idempotencyKey: `onboarding-retry-${adminId}-${Date.now()}`,
  });

  const finalStatus = emailResult.success ? 'sent' : 'email_failed';

  await adminClient.auth.admin.updateUserById(adminId, {
    app_metadata: {
      ...currentAppMeta,
      must_change_password: true,
      onboarding_expires_at: newExpiresAt,
      onboarding_status: finalStatus,
    },
  });

  try {
    await adminClient
      .from('admin_profiles')
      .update({ onboarding_status: finalStatus })
      .eq('id', adminId);
  } catch {
    // Ignore
  }

  // Insert structured audit log without secrets
  try {
    await supabase.from('audit_logs').insert({
      actor_id: callerSuperAdmin.user.id,
      actor_role: 'super_admin',
      action: 'admin.onboarding_reissued',
      target_type: 'admin_profile',
      target_id: adminId,
      details: {
        email: targetAdmin.email,
        email_delivery_status: finalStatus,
        reissued_at: new Date().toISOString(),
      },
    });
  } catch {
    // Non-blocking
  }

  if (!emailResult.success) {
    console.warn('[ADMIN_ONBOARDING_RETRY_EMAIL_FAILED]', {
      email: targetAdmin.email,
      error: emailResult.error,
    });
    return {
      success: false,
      error: emailResult.error
        ? `New credentials generated, but email delivery failed: ${emailResult.error}`
        : 'New credentials generated, but email delivery failed. Please verify email configuration.',
    };
  }

  return {
    success: true,
    message: emailResult.isSimulated
      ? `Fresh temporary credentials generated (email delivery simulated in development). Valid for 24 hours.`
      : `Fresh temporary credentials dispatched to ${targetAdmin.email}. Valid for 24 hours.`,
  };
}

/**
 * Update an administrator's assigned permissions.
 * Restricted to active Super Admin.
 */
export async function updateAdminPermissionsAction(
  input: { adminId: string; permissions: import('@/lib/auth/permissions').AdminPermissionKey[] }
): Promise<ActionResult> {
  let callerSuperAdmin: { admin: { id: string }; user: { id: string } };
  try {
    callerSuperAdmin = await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  const parsed = adminPermissionsUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { adminId, permissions } = parsed.data;

  if (adminId === callerSuperAdmin.admin.id) {
    return { success: false, error: 'Self-management prohibited: Super Admin cannot modify their own permissions.' };
  }

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc('manage_admin_permissions', {
    p_target_admin_id: adminId,
    p_permissions: permissions,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return {
    success: true,
    message: 'Administrator permissions updated successfully.',
  };
}

/**
 * Activate or deactivate an administrator account.
 * Restricted to active Super Admin.
 */
export async function setAdminActiveStatusAction(
  input: { adminId: string; isActive: boolean; reason: string }
): Promise<ActionResult> {
  let callerSuperAdmin: { admin: { id: string }; user: { id: string } };
  try {
    callerSuperAdmin = await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  const parsed = adminStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { adminId, isActive, reason } = parsed.data;

  if (adminId === callerSuperAdmin.admin.id) {
    return { success: false, error: 'Self-deactivation prohibited: Super Admin cannot deactivate their own account.' };
  }

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc('set_admin_active_status', {
    p_target_admin_id: adminId,
    p_is_active: isActive,
    p_reason: reason,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return {
    success: true,
    message: isActive ? 'Administrator account reactivated.' : 'Administrator account deactivated.',
  };
}

/**
 * Atomically reassign the in-charge administrator of a hackathon.
 * Restricted strictly to active Super Admin.
 */
export async function reassignHackathonInChargeAdminAction(input: {
  hackathonId: string;
  newAdminId: string;
  justification: string;
}): Promise<ActionResult<{ hackathonId: string; inChargeAdminId: string }>> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  const parsed = adminReassignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { hackathonId, newAdminId, justification } = parsed.data;

  try {
    const allowed = await checkRateLimit('admin_management');
    if (!allowed) {
      return { success: false, error: 'Rate limit exceeded: maximum 10 administrative operations per minute.' };
    }
  } catch {
    // Proceed if rate limiter throws in non-standard context
  }

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc('reassign_hackathon_in_charge_admin', {
    p_hackathon_id: hackathonId,
    p_new_admin_id: newAdminId,
    p_justification: justification,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return {
    success: true,
    message: 'Hackathon in-charge administrator reassigned successfully.',
    data: {
      hackathonId,
      inChargeAdminId: newAdminId,
    },
  };
}

/**
 * Fetch eligible administrators for in-charge assignment.
 * Target must be active and either Super Admin or hold 'manage_hackathons'.
 */
export async function fetchEligibleAdminsForReassignmentAction(): Promise<
  ActionResult<Array<{ id: string; full_name: string; email: string; is_super_admin: boolean }>>
> {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    // Query active admins
    const { data: admins, error: adminsError } = await supabase
      .from('admin_profiles')
      .select('id, full_name, email, is_super_admin')
      .eq('is_active', true);

    if (adminsError) {
      return { success: false, error: adminsError.message };
    }

    // Query who has manage_hackathons
    const { data: permData, error: permError } = await supabase
      .from('admin_permissions')
      .select('admin_id')
      .eq('permission', 'manage_hackathons');

    if (permError) {
      return { success: false, error: permError.message };
    }

    const permittedSet = new Set((permData || []).map((p) => p.admin_id));
    const eligible = (admins || []).filter(
      (a) => a.is_super_admin || permittedSet.has(a.id)
    );

    return { success: true, data: eligible };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch eligible administrators.';
    return { success: false, error: message };
  }
}
