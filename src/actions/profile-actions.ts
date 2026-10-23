'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/actions/auth-actions';
import {
  updatePhoneSchema,
  profileChangeRequestSchema,
  reviewProfileChangeRequestSchema,
  type ProfileChangeRequestInput,
  type ReviewProfileChangeRequestInput,
} from '@/lib/validation/profile-schemas';
import {
  validateStorageFileBinary,
  generateProfilePhotoStoragePath,
  MAX_PROFILE_PHOTO_SIZE,
} from '@/lib/storage/paths';

/**
 * Three-tier post-commit deletion helper for old or failed avatar files
 */
async function cleanupAvatarStorage(
  adminClient: ReturnType<typeof createAdminClient>,
  studentId: string,
  objectPath: string
): Promise<{ success: boolean; enqueued: boolean }> {
  try {
    const { error: removeErr } = await adminClient.storage
      .from('profile-photos')
      .remove([objectPath]);

    if (!removeErr) {
      return { success: true, enqueued: false };
    }
  } catch (err) {
    console.warn('[AvatarCleanup] Tier 1 removal threw exception:', err);
  }

  // Tier 2: Durable fallback queue
  try {
    const { error: queueErr } = await adminClient
      .from('storage_deletion_queue')
      .insert({
        bucket_id: 'profile-photos',
        object_path: objectPath,
        target_type: 'profile_photo',
        target_id: studentId,
        status: 'pending',
      });

    if (!queueErr) {
      return { success: false, enqueued: true };
    }
  } catch (err) {
    console.error('[AvatarCleanup] Tier 2 queue insert threw exception:', err);
  }

  return { success: false, enqueued: false };
}

/**
 * Updates authenticated student's phone number directly with validation.
 */
export async function updatePhoneNumberAction(
  rawPhone: string
): Promise<ActionResult<{ phone: string }>> {
  const parsed = updatePhoneSchema.safeParse({ phone: rawPhone });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid phone number format.',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { success: false, error: 'Authentication required.' };
  }

  const normalizedPhone = parsed.data.phone;

  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      phone: normalizedPhone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (updateErr) {
    return {
      success: false,
      error: `Failed to update phone number: ${updateErr.message}`,
    };
  }

  revalidatePath('/student/profile');
  return {
    success: true,
    data: { phone: normalizedPhone },
    message: 'Phone number updated successfully.',
  };
}

/**
 * Multi-phase profile photo upload with atomic failure recovery.
 */
export async function uploadProfilePhotoAction(
  formData: FormData
): Promise<ActionResult<{ path: string; avatarUrl: string | null }>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { success: false, error: 'Authentication required.' };
  }

  const file = formData.get('photo') as File | null;
  if (!file || typeof file === 'string') {
    return { success: false, error: 'No photo provided for upload.' };
  }

  if (file.size > MAX_PROFILE_PHOTO_SIZE) {
    return {
      success: false,
      error: `File size exceeds the 1MB limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const binaryValidation = validateStorageFileBinary(
    buffer,
    'profile-photo',
    file.name,
    file.type
  );

  if (!binaryValidation.valid) {
    return {
      success: false,
      error: binaryValidation.error || 'Invalid image format. Allowed: PNG, JPEG, WebP.',
    };
  }

  const ext =
    binaryValidation.detectedMime === 'image/jpeg'
      ? 'jpg'
      : binaryValidation.detectedMime === 'image/webp'
      ? 'webp'
      : 'png';

  const newPath = generateProfilePhotoStoragePath(user.id, ext);

  // Fetch current profile to record old_photo_path before upload
  const { data: currentProfile, error: fetchErr } = await supabase
    .from('profiles')
    .select('profile_photo_path')
    .eq('id', user.id)
    .single();

  if (fetchErr) {
    return { success: false, error: 'Failed to retrieve current profile.' };
  }

  const oldPhotoPath = currentProfile?.profile_photo_path;

  // Step 1: Upload new photo to profile-photos bucket
  const adminClient = createAdminClient();
  const { error: uploadErr } = await adminClient.storage
    .from('profile-photos')
    .upload(newPath, buffer, {
      contentType: binaryValidation.detectedMime || file.type,
      upsert: false,
    });

  if (uploadErr) {
    return {
      success: false,
      error: `Failed to upload avatar: ${uploadErr.message}`,
    };
  }

  // Step 2: Commit new path to database
  const { error: dbErr } = await supabase
    .from('profiles')
    .update({
      profile_photo_path: newPath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (dbErr) {
    // Compensating rollback: Delete newly uploaded file because DB commit failed
    await cleanupAvatarStorage(adminClient, user.id, newPath);
    return {
      success: false,
      error: `Profile update failed: ${dbErr.message}. Avatar was rolled back.`,
    };
  }

  // Step 3: Post-commit cleanup of old avatar (if existed)
  if (oldPhotoPath && oldPhotoPath !== newPath) {
    await cleanupAvatarStorage(adminClient, user.id, oldPhotoPath);
  }

  revalidatePath('/student/profile');
  revalidatePath('/student');

  const { data: signedData } = await supabase.storage
    .from('profile-photos')
    .createSignedUrl(newPath, 900);

  return {
    success: true,
    data: { path: newPath, avatarUrl: signedData?.signedUrl || null },
    message: 'Profile photo updated successfully.',
  };
}

/**
 * Removes student profile photo and enqueues old avatar for storage cleanup.
 */
export async function removeProfilePhotoAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { success: false, error: 'Authentication required.' };
  }

  const { data: currentProfile, error: fetchErr } = await supabase
    .from('profiles')
    .select('profile_photo_path')
    .eq('id', user.id)
    .single();

  if (fetchErr) {
    return { success: false, error: 'Failed to retrieve current profile.' };
  }

  const oldPhotoPath = currentProfile?.profile_photo_path;
  if (!oldPhotoPath) {
    return { success: true, message: 'No photo to remove.' };
  }

  // Step 1: Set profile_photo_path to NULL in database
  const { error: dbErr } = await supabase
    .from('profiles')
    .update({
      profile_photo_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (dbErr) {
    return {
      success: false,
      error: `Failed to remove profile photo: ${dbErr.message}`,
    };
  }

  // Step 2: Post-commit cleanup of old avatar
  const adminClient = createAdminClient();
  await cleanupAvatarStorage(adminClient, user.id, oldPhotoPath);

  revalidatePath('/student/profile');
  revalidatePath('/student');

  return {
    success: true,
    message: 'Profile photo removed successfully.',
  };
}

/**
 * Submits an institutional profile correction request for administrative review.
 */
export async function submitProfileCorrectionAction(
  input: ProfileChangeRequestInput
): Promise<ActionResult<{ requestId: string }>> {
  const parsed = profileChangeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Validation error.',
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { success: false, error: 'Authentication required.' };
  }

  const { data, error } = await supabase.rpc(
    'submit_profile_change_request' as never,
    {
      p_field_name: parsed.data.field_name,
      p_new_value: parsed.data.new_value,
      p_reason: parsed.data.reason,
    } as never
  );

  if (error) {
    return {
      success: false,
      error: error.message || 'Failed to submit profile correction request.',
    };
  }

  revalidatePath('/student/profile');
  return {
    success: true,
    data: { requestId: data as unknown as string },
    message: 'Correction request submitted for administrative review.',
  };
}

/**
 * Approves or rejects a student profile correction request (Admin only).
 */
export async function reviewProfileCorrectionAction(
  input: ReviewProfileChangeRequestInput
): Promise<ActionResult> {
  const parsed = reviewProfileChangeRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Validation error.',
    };
  }

  await requireAdmin('manage_students');
  const supabase = await createClient();

  if (parsed.data.decision === 'approved') {
    const { error } = await supabase.rpc(
      'approve_profile_change_request' as never,
      {
        p_request_id: parsed.data.request_id,
      } as never
    );

    if (error) {
      return {
        success: false,
        error: `Approval failed: ${error.message}`,
      };
    }
  } else {
    const { error } = await supabase.rpc(
      'reject_profile_change_request' as never,
      {
        p_request_id: parsed.data.request_id,
        p_rejection_reason: parsed.data.rejection_reason!,
      } as never
    );

    if (error) {
      return {
        success: false,
        error: `Rejection failed: ${error.message}`,
      };
    }
  }

  revalidatePath('/admin/verifications');
  return {
    success: true,
    message: `Profile change request successfully ${parsed.data.decision}.`,
  };
}

/**
 * Creates a signed preview URL for an avatar image from the private profile-photos bucket.
 */
export async function getProfilePhotoSignedUrlAction(
  photoPath: string | null
): Promise<ActionResult<{ url: string | null }>> {
  if (!photoPath) {
    return { success: true, data: { url: null } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('profile-photos')
    .createSignedUrl(photoPath, 3600);

  if (error || !data?.signedUrl) {
    return {
      success: false,
      error: error?.message || 'Could not generate signed avatar URL.',
    };
  }

  return {
    success: true,
    data: { url: data.signedUrl },
  };
}

/**
 * Fetches profile change request history for the currently authenticated student.
 */
export async function getStudentProfileHistoryAction(): Promise<
  ActionResult<Array<{
    id: string;
    field_name: string;
    old_value: string;
    new_value: string;
    reason: string;
    status: string;
    rejection_reason: string | null;
    created_at: string;
    reviewed_at: string | null;
  }>>
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { success: false, error: 'Authentication required.' };
  }

  const { data, error } = await supabase
    .from('profile_change_requests')
    .select('id, field_name, old_value, new_value, reason, status, rejection_reason, created_at, reviewed_at')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return {
      success: false,
      error: `Failed to load profile change history: ${error.message}`,
    };
  }

  return {
    success: true,
    data: data || [],
  };
}

// Aliases matching plan conventions
export const updateStudentPhoneAction = updatePhoneNumberAction;
export const submitProfileChangeRequestAction = submitProfileCorrectionAction;
export const reviewProfileChangeRequestAction = reviewProfileCorrectionAction;
export const getStudentProfileChangeRequestsAction = getStudentProfileHistoryAction;

/**
 * Action to fetch categorized participation history for the authenticated student.
 */
export async function getStudentParticipationHistoryAction(): Promise<
  ActionResult<Awaited<ReturnType<typeof import('@/lib/student/queries').getStudentParticipationTimeline>>>
> {
  try {
    const { getStudentParticipationTimeline } = await import('@/lib/student/queries');
    const data = await getStudentParticipationTimeline();
    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to fetch participation history.',
    };
  }
}
