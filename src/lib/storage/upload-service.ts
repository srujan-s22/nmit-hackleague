import 'server-only';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export const ALLOWED_DOCUMENT_TYPES = ['image/png', 'image/jpeg', 'application/pdf'] as const;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const;

export const MAX_COLLEGE_ID_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024; // 2 MB

export interface StorageUploadResult {
  success: boolean;
  path?: string;
  error?: string;
}

export interface SignedUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Validates and uploads a College ID card to the private 'college-ids' bucket
 */
export async function uploadCollegeIdDocument(
  userId: string,
  file: File
): Promise<StorageUploadResult> {
  if (!file || file.size === 0) {
    return { success: false, error: 'Please select a file to upload.' };
  }

  if (file.size > MAX_COLLEGE_ID_SIZE) {
    return {
      success: false,
      error: 'College ID file size cannot exceed 5MB.',
    };
  }

  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type as (typeof ALLOWED_DOCUMENT_TYPES)[number])) {
    return {
      success: false,
      error: 'Invalid file format. Only PNG, JPEG, and PDF files are permitted.',
    };
  }

  // Derive file extension
  let ext = 'png';
  if (file.type === 'image/jpeg') ext = 'jpg';
  else if (file.type === 'application/pdf') ext = 'pdf';

  const randomSuffix = crypto.randomUUID();
  const filePath = `${userId}/${randomSuffix}.${ext}`;

  const supabase = await createClient();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error } = await supabase.storage
    .from('college-ids')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return {
      success: false,
      error: `Storage upload failed: ${error.message}`,
    };
  }

  return {
    success: true,
    path: filePath,
  };
}

/**
 * Validates and uploads a profile photo to the private 'profile-photos' bucket
 */
export async function uploadProfilePhoto(
  userId: string,
  file: File
): Promise<StorageUploadResult> {
  if (!file || file.size === 0) {
    return { success: false, error: 'Please select a photo to upload.' };
  }

  if (file.size > MAX_PROFILE_PHOTO_SIZE) {
    return {
      success: false,
      error: 'Profile photo size cannot exceed 2MB.',
    };
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return {
      success: false,
      error: 'Invalid image format. Only PNG and JPEG images are permitted.',
    };
  }

  const ext = file.type === 'image/jpeg' ? 'jpg' : 'png';
  const randomSuffix = crypto.randomUUID();
  const filePath = `${userId}/${randomSuffix}.${ext}`;

  const supabase = await createClient();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error } = await supabase.storage
    .from('profile-photos')
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return {
      success: false,
      error: `Photo upload failed: ${error.message}`,
    };
  }

  return {
    success: true,
    path: filePath,
  };
}

/**
 * Generates a short-lived signed URL (60 seconds) for previewing a private storage object
 */
export async function getSignedPreviewUrl(
  bucket: 'college-ids' | 'profile-photos',
  path: string,
  expiresInSeconds = 60
): Promise<SignedUrlResult> {
  if (!path) {
    return { success: false, error: 'Storage object path is required.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return {
      success: false,
      error: error?.message || 'Failed to generate secure preview URL.',
    };
  }

  return {
    success: true,
    url: data.signedUrl,
  };
}
