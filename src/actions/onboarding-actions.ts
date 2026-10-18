'use server';

import { createClient } from '@/lib/supabase/server';
import {
  uploadCollegeIdDocument,
  uploadProfilePhoto,
  getSignedPreviewUrl,
  validateStorageObjectBinary,
} from '@/lib/storage/upload-service';
import type { ActionResult } from '@/actions/auth-actions';

/**
 * Upload College ID Card (Draft mode)
 */
export async function uploadCollegeIdAction(
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  const file = formData.get('collegeId') as File | null;
  if (!file) {
    return { success: false, error: 'Please select a College ID document to upload.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Unauthorized. Please sign in.' };
  }

  // Upload to storage
  const uploadResult = await uploadCollegeIdDocument(user.id, file);
  if (!uploadResult.success || !uploadResult.path) {
    return { success: false, error: uploadResult.error || 'Upload failed.' };
  }

  // Update profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ college_id_path: uploadResult.path })
    .eq('id', user.id);

  if (profileError) {
    return {
      success: false,
      error: `Failed to link College ID to profile: ${profileError.message}`,
    };
  }

  return {
    success: true,
    message: 'College ID document uploaded successfully.',
    data: { path: uploadResult.path },
  };
}

/**
 * Upload Profile Photo (Draft mode)
 */
export async function uploadProfilePhotoAction(
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  const file = formData.get('profilePhoto') as File | null;
  if (!file) {
    return { success: false, error: 'Please select a profile photo to upload.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Unauthorized. Please sign in.' };
  }

  const uploadResult = await uploadProfilePhoto(user.id, file);
  if (!uploadResult.success || !uploadResult.path) {
    return { success: false, error: uploadResult.error || 'Upload failed.' };
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ profile_photo_path: uploadResult.path })
    .eq('id', user.id);

  if (profileError) {
    return {
      success: false,
      error: `Failed to link profile photo: ${profileError.message}`,
    };
  }

  return {
    success: true,
    message: 'Profile photo uploaded successfully.',
    data: { path: uploadResult.path },
  };
}

/**
 * Replace College ID Card (Correction Required mode)
 * Executes atomic replace_college_id RPC: enqueues old ID for deletion and sets new ID with transaction token.
 */
export async function replaceCollegeIdAction(
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  const file = formData.get('collegeId') as File | null;
  if (!file) {
    return { success: false, error: 'Please select a replacement College ID document.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Unauthorized. Please sign in.' };
  }

  // Upload new document to user folder in college-ids bucket
  const uploadResult = await uploadCollegeIdDocument(user.id, file);
  if (!uploadResult.success || !uploadResult.path) {
    return { success: false, error: uploadResult.error || 'Upload failed.' };
  }

  // Call PostgreSQL replace_college_id RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'replace_college_id' as never,
    {
      p_new_storage_path: uploadResult.path,
    } as never
  );

  if (rpcError) {
    return {
      success: false,
      error: `ID replacement failed: ${rpcError.message}`,
    };
  }

  const result = rpcData as { success?: boolean; error?: string } | null;
  if (result && !result.success) {
    return {
      success: false,
      error: result.error || 'Failed to replace ID document.',
    };
  }

  return {
    success: true,
    message: 'College ID document updated successfully.',
    data: { path: uploadResult.path },
  };
}

/**
 * Submit Profile for Administrative Review
 * Executes submit_profile_for_review RPC: transitions profile from 'draft' or 'correction_required' to 'under_review'.
 */
export async function submitProfileForReviewAction(): Promise<
  ActionResult<{ redirectTo: string }>
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Unauthorized. Please sign in.' };
  }

  // Trusted Server-Side Binary Content Verification:
  // Inspect the actual binary bytes of the stored College ID document and profile photo before transitioning to review.
  // This unconditionally closes the direct Supabase Storage upload bypass where an attacker uploads an
  // invalid or executable file directly to Supabase Storage and attempts to submit it.
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('college_id_path, profile_photo_path')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile?.college_id_path) {
    return { success: false, error: 'Please upload a valid College ID document before submitting.' };
  }

  const binaryValidation = await validateStorageObjectBinary(
    'college-ids',
    profile.college_id_path,
    'college-id'
  );

  if (!binaryValidation.valid) {
    return {
      success: false,
      error: binaryValidation.error || 'College ID document failed binary content validation.',
    };
  }

  // Authoritative binary signature check for optional profile photo
  if (profile.profile_photo_path) {
    const photoValidation = await validateStorageObjectBinary(
      'profile-photos',
      profile.profile_photo_path,
      'profile-photo'
    );
    if (!photoValidation.valid) {
      return {
        success: false,
        error: photoValidation.error || 'Profile photo failed binary content validation.',
      };
    }
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'submit_profile_for_review' as never
  );

  if (rpcError) {
    return {
      success: false,
      error: `Submission failed: ${rpcError.message}`,
    };
  }

  const result = rpcData as { success?: boolean; error?: string } | null;
  if (result && !result.success) {
    return {
      success: false,
      error: result.error || 'Failed to submit profile for review.',
    };
  }

  return {
    success: true,
    message: 'Profile submitted successfully for verification.',
    redirectTo: '/status/pending',
  };
}

/**
 * Get Secure Preview URL for Student's College ID
 */
export async function getCollegeIdPreviewUrlAction(): Promise<
  ActionResult<{ url: string }>
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Unauthorized.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('college_id_path')
    .eq('id', user.id)
    .single();

  if (!profile?.college_id_path) {
    return { success: false, error: 'No College ID document uploaded yet.' };
  }

  const signedResult = await getSignedPreviewUrl('college-ids', profile.college_id_path, 60);
  if (!signedResult.success || !signedResult.url) {
    return { success: false, error: signedResult.error || 'Failed to generate preview URL.' };
  }

  return {
    success: true,
    data: { url: signedResult.url },
  };
}
