import 'server-only';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';
import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_EVIDENCE_TYPES,
  MAX_COLLEGE_ID_SIZE,
  MAX_COLLEGE_ID_IMAGE_SIZE,
  MAX_PROFILE_PHOTO_SIZE,
  MAX_EVIDENCE_IMAGE_SIZE,
  MAX_SUBMISSION_EVIDENCE_SIZE,
  validateStorageFile,
  validateStorageFileBinary,
  validateStorageObjectBinaryWithClient,
  getSignedPreviewUrlWithClient,
  inspectBinaryMagicBytes,
  type BinaryValidationResult,
  generateEvidenceStoragePath,
  generateCollegeIdStoragePath,
  generateProfilePhotoStoragePath,
} from './paths';

export {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_EVIDENCE_TYPES,
  MAX_COLLEGE_ID_SIZE,
  MAX_COLLEGE_ID_IMAGE_SIZE,
  MAX_PROFILE_PHOTO_SIZE,
  MAX_EVIDENCE_IMAGE_SIZE,
  MAX_SUBMISSION_EVIDENCE_SIZE,
  validateStorageFile,
  validateStorageFileBinary,
  validateStorageObjectBinaryWithClient,
  getSignedPreviewUrlWithClient,
  inspectBinaryMagicBytes,
  type BinaryValidationResult,
  generateEvidenceStoragePath,
  generateCollegeIdStoragePath,
  generateProfilePhotoStoragePath,
};

export interface StorageUploadResult {
  success: boolean;
  path?: string;
  sha256?: string;
  error?: string;
}

export interface SignedUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Validates and uploads a College ID card to the private 'college-ids' bucket.
 * Enforces genuine binary signature check (PNG, JPEG, PDF) before uploading.
 */
export async function uploadCollegeIdDocument(
  userId: string,
  file: File
): Promise<StorageUploadResult> {
  const validation = validateStorageFile(file, 'college-id');
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Authoritative binary signature check: inspect raw bytes for genuine PNG/JPEG/PDF magic bytes
  const binaryValidation = validateStorageFileBinary(buffer, 'college-id', file.name, file.type);
  if (!binaryValidation.valid) {
    return { success: false, error: binaryValidation.error };
  }

  // Derive authoritative extension from detected binary signature, preventing spoofing
  let ext = 'png';
  if (binaryValidation.detectedMime === 'image/jpeg') ext = 'jpg';
  else if (binaryValidation.detectedMime === 'application/pdf') ext = 'pdf';

  const filePath = generateCollegeIdStoragePath(userId, ext);

  const supabase = await createClient();

  const { error } = await supabase.storage
    .from('college-ids')
    .upload(filePath, buffer, {
      contentType: binaryValidation.detectedMime || file.type,
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
 * Validates and uploads a profile photo to the private 'profile-photos' bucket.
 * Enforces genuine binary signature check (PNG, JPEG) before uploading.
 */
export async function uploadProfilePhoto(
  userId: string,
  file: File
): Promise<StorageUploadResult> {
  const validation = validateStorageFile(file, 'profile-photo');
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Authoritative binary signature check: inspect raw bytes for genuine PNG/JPEG magic bytes
  const binaryValidation = validateStorageFileBinary(buffer, 'profile-photo', file.name, file.type);
  if (!binaryValidation.valid) {
    return { success: false, error: binaryValidation.error };
  }

  const ext = binaryValidation.detectedMime === 'image/jpeg' ? 'jpg' : 'png';
  const filePath = generateProfilePhotoStoragePath(userId, ext);

  const supabase = await createClient();

  const { error } = await supabase.storage
    .from('profile-photos')
    .upload(filePath, buffer, {
      contentType: binaryValidation.detectedMime || file.type,
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
 * Validates, hashes, uploads, and finalizes a Submission Evidence document.
 * Enforces authoritative 20MB bucket cap and 1MB per image cap.
 * Enforces genuine binary signature check (PDF, ZIP, PNG, JPEG) before uploading.
 * Uses immutable versioned path and invokes finalize_submission_upload atomic RPC.
 */
export async function uploadSubmissionEvidence(
  hackathonId: string,
  submissionId: string,
  file: File
): Promise<StorageUploadResult> {
  const validation = validateStorageFile(file, 'submission-evidence');
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Authoritative binary signature check: inspect raw bytes for genuine PDF/ZIP/PNG/JPEG magic bytes
  const binaryValidation = validateStorageFileBinary(buffer, 'submission-evidence', file.name, file.type);
  if (!binaryValidation.valid) {
    return { success: false, error: binaryValidation.error };
  }

  const filePath = generateEvidenceStoragePath(hackathonId, submissionId, file.name || 'document.pdf');
  const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from('submission-evidence')
    .upload(filePath, buffer, {
      contentType: binaryValidation.detectedMime || file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    return {
      success: false,
      error: `Storage upload failed: ${uploadError.message}`,
    };
  }

  // Atomically finalize upload metadata and enqueue previous version for deletion
  const { data: finalizationResult, error: finalizeError } = await supabase.rpc(
    'finalize_submission_upload' as never,
    {
      p_submission_id: submissionId,
      p_new_path: filePath,
      p_new_sha256: sha256Hash,
    } as never
  );

  if (finalizeError) {
    return {
      success: false,
      path: filePath,
      sha256: sha256Hash,
      error: `Upload stored but finalization failed: ${finalizeError.message}`,
    };
  }

  return {
    success: true,
    path: filePath,
    sha256: sha256Hash,
  };
}

/**
 * Validates the binary content of a file already stored in Supabase Storage.
 * Used to verify storage objects (including any direct Supabase Storage uploads),
 * ensuring they cannot be linked or submitted without passing binary signature verification.
 */
/**
 * Validates the binary content of a file already stored in Supabase Storage.
 * Used to verify storage objects (including any direct Supabase Storage uploads),
 * ensuring they cannot be linked or submitted without passing binary signature verification.
 */
export async function validateStorageObjectBinary(
  bucket: 'college-ids' | 'profile-photos' | 'submission-evidence',
  path: string,
  category: 'college-id' | 'profile-photo' | 'submission-evidence',
  client?: any
): Promise<BinaryValidationResult> {
  const supabase = client || (await createClient());
  return validateStorageObjectBinaryWithClient(supabase, bucket, path, category);
}

/**
 * Generates a short-lived signed URL for previewing or downloading a private storage object.
 * Enforces trusted server-side binary signature validation before issuing signed URLs,
 * ensuring malicious/executable or invalid files can never be served to users or reviewers.
 */
export async function getSignedPreviewUrl(
  bucket: 'college-ids' | 'profile-photos' | 'submission-evidence',
  path: string,
  expiresInSeconds = 60,
  client?: any
): Promise<SignedUrlResult> {
  const supabase = client || (await createClient());
  return getSignedPreviewUrlWithClient(supabase, bucket, path, expiresInSeconds);
}
