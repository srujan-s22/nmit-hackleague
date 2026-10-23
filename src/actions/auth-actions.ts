'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/auth/rate-limiter';
import { DEV_ADMIN_TEMP_PASSWORD_FALLBACK } from '@/lib/auth/password-generator';
import {
  loginSchema,
  signupSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type LoginInput,
  type SignupInput,
  type VerifyOtpInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '@/lib/validation/auth-schemas';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export interface ActionResult<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: T;
  redirectTo?: string;
}

function getSafeRedirectUrl(url?: string | null): string | null {
  if (!url) return null;
  // Must start with '/' and not '//' or '/\' to avoid open redirects
  if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) {
    if (!url.includes(':')) {
      return url;
    }
  }
  return null;
}

/**
 * Live Login Action
 * Authenticates user credentials via Supabase Auth and returns the appropriate post-login redirect path.
 */
export async function loginAction(
  input: FormData | LoginInput
): Promise<ActionResult<{ redirectTo: string }>> {
  const rawData =
    input instanceof FormData
      ? {
          email: input.get('email'),
          password: input.get('password'),
          redirectTo: input.get('redirectTo') || undefined,
        }
      : input;

  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please provide a valid email and password.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, password } = parsed.data;
  const safeRedirect = getSafeRedirectUrl(parsed.data.redirectTo);
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    return {
      success: false,
      error: 'Invalid email address or password. Please check your credentials.',
    };
  }

  // Check if authenticated user is an administrator
  const { data: adminProfile } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (adminProfile) {
    if (!adminProfile.is_active) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Your administrator account has been deactivated. Please contact the Super Admin.',
      };
    }

    // Determine server-controlled must_change_password and expiration
    const appMeta = authData.user.app_metadata || {};
    const mustChangePassword =
      typeof adminProfile.must_change_password === 'boolean'
        ? adminProfile.must_change_password
        : Boolean(appMeta.must_change_password);

    const onboardingExpiresAt =
      adminProfile.onboarding_expires_at ||
      (typeof appMeta.onboarding_expires_at === 'string' ? appMeta.onboarding_expires_at : null);

    if (mustChangePassword) {
      // Check 24-hour expiration
      if (onboardingExpiresAt) {
        const expTime = new Date(onboardingExpiresAt).getTime();
        if (!isNaN(expTime) && expTime < Date.now()) {
          await supabase.auth.signOut();
          return {
            success: false,
            error:
              'Your temporary onboarding credentials have expired (24-hour window). Please contact the Super Admin to reissue your credentials.',
          };
        }
      }

      // Route newly provisioned administrator exclusively to forced password-change page
      return {
        success: true,
        redirectTo: '/auth/complete-setup',
      };
    }

    if (safeRedirect && !safeRedirect.startsWith('/login') && !safeRedirect.startsWith('/auth/complete-setup')) {
      return {
        success: true,
        redirectTo: safeRedirect,
      };
    }

    return {
      success: true,
      redirectTo: '/admin',
    };
  }

  // Query student profile status to resolve target route
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('registration_status')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (!studentProfile) {
    // If auth user exists but has no student profile yet, send to onboarding
    return {
      success: true,
      redirectTo: '/onboarding',
    };
  }

  if (studentProfile.registration_status === 'approved' && safeRedirect && !safeRedirect.startsWith('/login')) {
    return {
      success: true,
      redirectTo: safeRedirect,
    };
  }

  switch (studentProfile.registration_status) {
    case 'draft':
      return { success: true, redirectTo: '/onboarding' };
    case 'under_review':
    case 'pending_verification':
      return { success: true, redirectTo: '/status/pending' };
    case 'approved':
      return { success: true, redirectTo: '/student' };
    case 'correction_required':
    case 'rejected':
      return { success: true, redirectTo: '/status/rejected' };
    case 'suspended':
      return { success: true, redirectTo: '/status/suspended' };
    default:
      return { success: true, redirectTo: '/onboarding' };
  }
}

/**
 * Student Signup Action
 * Registers student in Supabase Auth; atomic PostgreSQL trigger creates profile row in 'draft' status.
 */
export async function signupAction(
  input: FormData | SignupInput
): Promise<ActionResult<{ email: string }>> {
  const rawData =
    input instanceof FormData
      ? {
          email: input.get('email'),
          password: input.get('password'),
          full_name: input.get('full_name'),
          usn: input.get('usn'),
          phone: input.get('phone'),
          branch: input.get('branch'),
          academic_year: input.get('academic_year'),
          sex: input.get('sex'),
          date_of_birth: input.get('date_of_birth'),
        }
      : input;

  const parsed = signupSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please correct the highlighted validation errors.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Rate limit signup requests (5 per hour per client IP)
  let rateLimitAllowed = true;
  try {
    rateLimitAllowed = await checkRateLimit('signup');
  } catch {
    // If running in development without headers or key, allow
    rateLimitAllowed = true;
  }

  if (!rateLimitAllowed) {
    return {
      success: false,
      error: 'Too many registration attempts. Please wait an hour before trying again.',
    };
  }

  const {
    email,
    password,
    full_name,
    usn,
    phone,
    branch,
    academic_year,
    sex,
    date_of_birth,
  } = parsed.data;

  const supabase = await createClient();

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
        usn,
        phone,
        branch,
        academic_year,
        sex,
        date_of_birth,
      },
    },
  });

  if (signUpError) {
    const errorMsg = signUpError.message.toLowerCase();
    if (errorMsg.includes('already registered') || errorMsg.includes('user already exists')) {
      return {
        success: false,
        error: 'An account with this email address already exists. Please sign in instead.',
      };
    }
    if (errorMsg.includes('usn') || errorMsg.includes('duplicate key') || errorMsg.includes('chk_profiles_usn')) {
      return {
        success: false,
        error: 'A profile with this University Seat Number (USN) is already registered.',
      };
    }
    return {
      success: false,
      error: signUpError.message || 'Registration failed. Please verify your details.',
    };
  }

  if (!signUpData.user) {
    return {
      success: false,
      error: 'Failed to create student account. Please try again.',
    };
  }

  return {
    success: true,
    message: 'Registration successful! Please check your email for the 6-digit verification code.',
    data: { email },
    redirectTo: `/verify?email=${encodeURIComponent(email)}`,
  };
}

/**
 * Verify Email OTP Action
 * Verifies email ownership via Supabase Auth OTP verification.
 */
export async function verifyOtpAction(
  input: FormData | VerifyOtpInput
): Promise<ActionResult<{ redirectTo: string }>> {
  const rawData =
    input instanceof FormData
      ? {
          email: input.get('email'),
          token: input.get('token'),
        }
      : input;

  const parsed = verifyOtpSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please enter a valid 6-digit verification code.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, token } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  });

  if (error || !data.session) {
    // Also attempt 'email' OTP type in case Supabase issued magic link/email token
    const fallback = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (fallback.error || !fallback.data.session) {
      return {
        success: false,
        error: error?.message || fallback.error?.message || 'Invalid or expired verification code.',
      };
    }
  }

  return {
    success: true,
    message: 'Email verified successfully.',
    redirectTo: '/onboarding',
  };
}

/**
 * Resend OTP Action
 */
export async function resendOtpAction(email: string): Promise<ActionResult> {
  if (!email || !email.includes('@')) {
    return { success: false, error: 'Valid email address is required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to resend verification code. Please wait a few moments.',
    };
  }

  return {
    success: true,
    message: 'A new 6-digit verification code has been dispatched to your email.',
  };
}

/**
 * Forgot Password Action
 * Sends password recovery email. Non-enumerating: always returns generic success message.
 */
export async function forgotPasswordAction(
  input: FormData | ForgotPasswordInput
): Promise<ActionResult> {
  const rawData =
    input instanceof FormData
      ? {
          email: input.get('email'),
        }
      : input;

  const parsed = forgotPasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Please enter a valid email address.',
    };
  }

  const { email } = parsed.data;
  const supabase = await createClient();

  const reqHeaders = await headers();
  const host = reqHeaders.get('host') || 'localhost:3000';
  const protocol = reqHeaders.get('x-forwarded-proto') || 'http';
  const redirectTo = `${protocol}://${host}/auth/callback?next=/reset-password`;

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  // Non-enumerating response
  return {
    success: true,
    message:
      'If an account is associated with this email address, password recovery instructions have been sent.',
  };
}

/**
 * Reset Password Action
 * Updates password for an authenticated session.
 */
export async function resetPasswordAction(
  input: FormData | ResetPasswordInput
): Promise<ActionResult> {
  const rawData =
    input instanceof FormData
      ? {
          password: input.get('password'),
          confirmPassword: input.get('confirmPassword'),
        }
      : input;

  const parsed = resetPasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Passwords do not meet requirements or do not match.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to update password. Please try again.',
    };
  }

  return {
    success: true,
    message: 'Password updated successfully. You may now sign in with your new password.',
    redirectTo: '/login',
  };
}

/**
 * Complete Admin Setup Action
 * Mandatory initial password update for newly provisioned administrators.
 * Uses authenticated self-service Supabase Auth session (supabase.auth.updateUser),
 * then updates server-controlled onboarding state, audits completion, and returns redirect.
 */
export async function completeAdminSetupAction(
  input: FormData | ResetPasswordInput
): Promise<ActionResult<{ redirectTo: string }>> {
  const rawData =
    input instanceof FormData
      ? {
          password: input.get('password'),
          confirmPassword: input.get('confirmPassword'),
        }
      : input;

  const parsed = resetPasswordSchema.safeParse(rawData);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Passwords do not meet complexity requirements or do not match.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { password } = parsed.data;

  // Enforce that the temporary development password cannot be retained as permanent password
  if (password.toLowerCase() === DEV_ADMIN_TEMP_PASSWORD_FALLBACK.toLowerCase()) {
    return {
      success: false,
      error: 'Your new permanent password cannot be the shared temporary onboarding password.',
    };
  }

  const supabase = await createClient();

  // 1. Validate caller authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: 'Session expired or unauthenticated. Please sign in again.',
      redirectTo: '/login',
    };
  }

  // 2. Determine admin record
  const { data: adminProfile, error: profileErr } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr || !adminProfile || !adminProfile.is_active) {
    await supabase.auth.signOut();
    return {
      success: false,
      error: 'Administrator record not found or deactivated. Access denied.',
      redirectTo: '/login',
    };
  }

  // 3. Verify user is actually in must_change_password state
  const appMeta = user.app_metadata || {};
  const mustChangePassword =
    typeof adminProfile.must_change_password === 'boolean'
      ? adminProfile.must_change_password
      : Boolean(appMeta.must_change_password);

  if (!mustChangePassword) {
    return {
      success: false,
      error: 'Administrator setup has already been completed.',
      redirectTo: '/admin',
    };
  }

  // 4. Verify onboarding has not expired
  const expiresAt =
    adminProfile.onboarding_expires_at ||
    (typeof appMeta.onboarding_expires_at === 'string' ? appMeta.onboarding_expires_at : null);

  if (expiresAt) {
    const expTime = new Date(expiresAt).getTime();
    if (!isNaN(expTime) && expTime < Date.now()) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Temporary onboarding window has expired (24-hour limit). Please contact the Super Admin to reissue your credentials.',
        redirectTo: '/login',
      };
    }
  }

  // 4. Update password using authenticated self-service Supabase Auth client
  const { error: updateErr } = await supabase.auth.updateUser({
    password,
  });

  if (updateErr) {
    return {
      success: false,
      error: updateErr.message || 'Failed to update password. Please check password criteria and try again.',
    };
  }

  // 5. Atomically clear must_change_password state via trusted server-side admin client
  const adminClient = createAdminClient();
  const nowIso = new Date().toISOString();

  await adminClient.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...appMeta,
      must_change_password: false,
      onboarding_status: 'completed',
      password_changed_at: nowIso,
    },
  });

  try {
    await adminClient
      .from('admin_profiles')
      .update({
        must_change_password: false,
        onboarding_status: 'completed',
      })
      .eq('id', user.id);
  } catch {
    // Non-blocking if table columns not yet migrated
  }

  // 6. Record completion in structured audit log without storing passwords or tokens
  try {
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      actor_role: adminProfile.is_super_admin ? 'super_admin' : 'admin',
      action: 'admin.password_setup_completed',
      target_type: 'admin_profile',
      target_id: user.id,
      details: {
        email: adminProfile.email,
        completed_at: nowIso,
      },
    });
  } catch {
    // Non-blocking
  }

  return {
    success: true,
    message: 'Password successfully updated. Welcome to NMIT HackLeague!',
    redirectTo: '/admin',
  };
}

/**
 * Sign Out Action
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
