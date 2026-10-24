'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/actions/auth-actions';
import {
  updatePhoneSchema,
  updateSocialLinksSchema,
  type UpdateSocialLinksInput,
  profileChangeRequestSchema,
  reviewProfileChangeRequestSchema,
  type ProfileChangeRequestInput,
  type ReviewProfileChangeRequestInput,
} from '@/lib/validation/profile-schemas';

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
 * Updates authenticated student's optional LinkedIn and GitHub profile links.
 * Strictly derives the user ID from the authenticated session (auth.uid()).
 * Supports independent updates and clearing either link without clobbering the other.
 */
export async function updateStudentSocialLinksAction(
  rawInput: UpdateSocialLinksInput
): Promise<ActionResult<{ linkedin_url: string | null; github_url: string | null }>> {
  const parsed = updateSocialLinksSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid social profile URL.',
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

  // Build the payload dynamically so undefined fields do not clobber existing database values
  const updatePayload: {
    updated_at: string;
    linkedin_url?: string | null;
    github_url?: string | null;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.linkedin_url !== undefined) {
    updatePayload.linkedin_url = parsed.data.linkedin_url;
  }
  if (parsed.data.github_url !== undefined) {
    updatePayload.github_url = parsed.data.github_url;
  }

  const { data: updatedProfile, error: updateErr } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', user.id)
    .select('linkedin_url, github_url')
    .single();

  if (updateErr) {
    return {
      success: false,
      error: `Failed to update social profiles: ${updateErr.message}`,
    };
  }

  revalidatePath('/student/profile');
  revalidatePath('/admin/students');

  return {
    success: true,
    data: {
      linkedin_url: updatedProfile?.linkedin_url ?? null,
      github_url: updatedProfile?.github_url ?? null,
    },
    message: 'Professional profiles updated successfully.',
  };
}

/**
 * Disabled: Student profile photo upload is removed from student workflows.
 */
export async function uploadProfilePhotoAction(
  _formData?: FormData
): Promise<ActionResult<{ path: string; avatarUrl: string | null }>> {
  return {
    success: false,
    error: 'Profile photo management has been removed.',
  };
}

/**
 * Disabled: Student profile photo removal is removed from student workflows.
 */
export async function removeProfilePhotoAction(): Promise<ActionResult> {
  return {
    success: false,
    error: 'Profile photo management has been removed.',
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
