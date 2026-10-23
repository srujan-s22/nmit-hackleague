import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { BRANCHES, GENDERS } from '@/lib/validation/auth-schemas';
import type { Database } from '@/types/database';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface UserLike {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  raw_user_meta_data?: Record<string, unknown> | null;
  app_metadata?: Record<string, unknown> | null;
  raw_app_meta_data?: Record<string, unknown> | null;
}

export interface ProfileRecoveryResult {
  success: boolean;
  profile?: ProfileRow;
  recovered?: boolean;
  error?: string;
  code?: 'ALREADY_EXISTS' | 'INVALID_METADATA' | 'DUPLICATE_USN' | 'ADMIN_COLLISION' | 'DATABASE_ERROR';
}

/**
 * Validates demographic fields from raw user metadata using rules
 * consistent with database constraints and handle_new_auth_user().
 */
export function validateAndNormalizeStudentMetadata(
  meta: Record<string, unknown> | null | undefined,
  userEmail: string
): {
  valid: boolean;
  error?: string;
  data?: {
    email: string;
    full_name: string;
    usn: string;
    phone: string;
    branch: (typeof BRANCHES)[number];
    academic_year: number;
    sex: (typeof GENDERS)[number];
    date_of_birth: string;
  };
} {
  if (!meta || typeof meta !== 'object') {
    return { valid: false, error: 'Account metadata is missing.' };
  }

  // 1. Email
  const normalizedEmail = (
    typeof meta.email === 'string' ? meta.email : userEmail || ''
  ).trim().toLowerCase();

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { valid: false, error: 'A valid email address is required.' };
  }

  // 2. Full Name (2-100 characters)
  const fullName = (typeof meta.full_name === 'string' ? meta.full_name : '').trim();
  if (fullName.length < 2 || fullName.length > 100) {
    return { valid: false, error: 'Full name must be between 2 and 100 characters.' };
  }

  // 3. USN (upper, trimmed, matches standard 1NT format)
  const usn = (typeof meta.usn === 'string' ? meta.usn : '').trim().toUpperCase();
  if (!/^1NT[0-9]{2}[A-Z]{2}[0-9]{3}$/.test(usn)) {
    return { valid: false, error: 'University Seat Number (USN) must follow institutional format (e.g., 1NT22CS001).' };
  }

  // 4. Phone (+91 followed by 10 digits starting with 6-9)
  const phone = (typeof meta.phone === 'string' ? meta.phone : '').trim();
  if (!/^\+91[6-9][0-9]{9}$/.test(phone)) {
    return { valid: false, error: 'Phone number must follow +91XXXXXXXXXX format.' };
  }

  // 5. Branch
  const rawBranch = (typeof meta.branch === 'string' ? meta.branch : '').trim().toUpperCase();
  if (!(BRANCHES as readonly string[]).includes(rawBranch)) {
    return { valid: false, error: 'A valid institutional engineering branch must be selected.' };
  }
  const branch = rawBranch as (typeof BRANCHES)[number];

  // 6. Academic Year (1 to 4)
  const academicYear = Number(meta.academic_year);
  if (!Number.isInteger(academicYear) || academicYear < 1 || academicYear > 4) {
    return { valid: false, error: 'Academic year must be between 1 and 4.' };
  }

  // 7. Sex (case-insensitive mapping to enum 'Male' | 'Female' | 'Other')
  const rawSex = (typeof meta.sex === 'string' ? meta.sex : '').trim().toLowerCase();
  let sex: (typeof GENDERS)[number] | null = null;
  if (rawSex === 'male') sex = 'Male';
  else if (rawSex === 'female') sex = 'Female';
  else if (rawSex === 'other') sex = 'Other';

  if (!sex) {
    return { valid: false, error: 'A valid gender must be specified (Male, Female, or Other).' };
  }

  // 8. Date of birth (YYYY-MM-DD, minimum age 15)
  const dobStr = (typeof meta.date_of_birth === 'string' ? meta.date_of_birth : '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dobStr)) {
    return { valid: false, error: 'Date of birth must be in YYYY-MM-DD format.' };
  }

  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) {
    return { valid: false, error: 'Invalid date of birth.' };
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 15);
  if (dob > cutoff) {
    return { valid: false, error: 'Student must be at least 15 years of age to register.' };
  }

  return {
    valid: true,
    data: {
      email: normalizedEmail,
      full_name: fullName,
      usn,
      phone,
      branch,
      academic_year: academicYear,
      sex,
      date_of_birth: dobStr,
    },
  };
}

/**
 * Safely recovers a missing student profile in public.profiles for an authenticated user.
 *
 * Rules:
 * 1. Checks if profile already exists; if so, returns it without modifying.
 * 2. Checks if user is an administrator; if so, refuses student profile creation.
 * 3. Validates and normalizes registration metadata strictly.
 * 4. Checks for duplicate USN collision across profiles.
 * 5. Atomically inserts profile in 'draft' status using service-role client.
 * 6. Handles race conditions (e.g. concurrent insert) gracefully.
 */
export async function recoverStudentProfile(user: UserLike): Promise<ProfileRecoveryResult> {
  if (!user || !user.id) {
    return {
      success: false,
      error: 'Cannot recover profile: invalid or missing user identifier.',
      code: 'INVALID_METADATA',
    };
  }

  const adminClient = createAdminClient();

  // 1. Check if student profile already exists (never overwrite)
  const { data: existingProfile } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existingProfile) {
    return {
      success: true,
      profile: existingProfile,
      recovered: false,
      code: 'ALREADY_EXISTS',
    };
  }

  // 2. Dual identity guard: ensure user is NOT an administrator
  const appMeta = user.app_metadata || user.raw_app_meta_data || {};
  const userMeta = user.user_metadata || user.raw_user_meta_data || {};

  const claimsAdmin =
    Boolean(appMeta.claims_admin) ||
    appMeta.role === 'admin' ||
    userMeta.role === 'admin';

  if (claimsAdmin) {
    return {
      success: false,
      error: 'This account is designated as an administrator and cannot be registered as a student.',
      code: 'ADMIN_COLLISION',
    };
  }

  const userEmail = (user.email || (typeof userMeta.email === 'string' ? userMeta.email : '')).trim().toLowerCase();

  const { data: adminById } = await adminClient
    .from('admin_profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (adminById) {
    return {
      success: false,
      error: 'This account is registered to an administrator.',
      code: 'ADMIN_COLLISION',
    };
  }

  if (userEmail) {
    const { data: adminByEmail } = await adminClient
      .from('admin_profiles')
      .select('id')
      .eq('email', userEmail)
      .maybeSingle();

    if (adminByEmail) {
      return {
        success: false,
        error: 'This email is registered to an administrator.',
        code: 'ADMIN_COLLISION',
      };
    }
  }

  // 3. Strict validation & normalization of registration metadata
  const validation = validateAndNormalizeStudentMetadata(userMeta, userEmail);
  if (!validation.valid || !validation.data) {
    return {
      success: false,
      error: validation.error || 'Cannot restore student profile: incomplete registration details in account metadata.',
      code: 'INVALID_METADATA',
    };
  }

  const normalized = validation.data;

  // 4. Guard against duplicate USN collision
  const { data: existingUsn } = await adminClient
    .from('profiles')
    .select('id, email')
    .eq('usn', normalized.usn)
    .maybeSingle();

  if (existingUsn && existingUsn.id !== user.id) {
    return {
      success: false,
      error: `University Seat Number (USN) ${normalized.usn} is already registered to another account.`,
      code: 'DUPLICATE_USN',
    };
  }

  // 5. Atomic insert with initial status strictly set to 'draft'
  const { data: insertedProfile, error: insertError } = await adminClient
    .from('profiles')
    .insert({
      id: user.id,
      email: normalized.email,
      full_name: normalized.full_name,
      usn: normalized.usn,
      phone: normalized.phone,
      branch: normalized.branch,
      academic_year: normalized.academic_year,
      sex: normalized.sex,
      date_of_birth: normalized.date_of_birth,
      registration_status: 'draft',
    })
    .select('*')
    .single();

  if (insertError) {
    // Handle concurrent insertion race condition
    if (insertError.code === '23505') {
      const { data: concurrentProfile } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (concurrentProfile) {
        return {
          success: true,
          profile: concurrentProfile,
          recovered: false,
          code: 'ALREADY_EXISTS',
        };
      }

      return {
        success: false,
        error: `University Seat Number (USN) ${normalized.usn} is already registered to another account.`,
        code: 'DUPLICATE_USN',
      };
    }

    return {
      success: false,
      error: insertError.message || 'Database error occurred while restoring student profile.',
      code: 'DATABASE_ERROR',
    };
  }

  return {
    success: true,
    profile: insertedProfile,
    recovered: true,
  };
}
