import 'server-only';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  inspectBinaryMagicBytes,
  MAX_EVIDENCE_IMAGE_SIZE,
} from '@/lib/storage/paths';

export interface RoundEvidenceUploadResult {
  success: boolean;
  path?: string;
  fileHash?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}

/**
 * Validates round evidence image buffer:
 * - Strict maximum size 1 MiB (1,048,576 bytes)
 * - Permitted MIME types: image/jpeg, image/png, image/webp
 * - Rejects PDFs, ZIPs, executables, scripts, and unsupported formats
 */
export function validateRoundEvidenceBinary(
  buffer: Buffer,
  filename?: string
): {
  valid: boolean;
  detectedMime?: 'image/jpeg' | 'image/png' | 'image/webp';
  extension?: 'jpg' | 'png' | 'webp';
  error?: string;
} {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Evidence file buffer is empty.' };
  }

  if (buffer.length > MAX_EVIDENCE_IMAGE_SIZE) {
    return {
      valid: false,
      error: `File size (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds the maximum allowed limit of 1 MiB (1,048,576 bytes).`,
    };
  }

  const inspection = inspectBinaryMagicBytes(buffer);

  if (inspection.isExecutable) {
    return {
      valid: false,
      error: `Security violation: File contains dangerous executable or script signatures (${inspection.threatDescription || 'unknown threat'}).`,
    };
  }

  if (!inspection.detectedMime) {
    return {
      valid: false,
      error: 'Unsupported file format. Only genuine JPEG, PNG, and WebP images are accepted for round evidence.',
    };
  }

  if (inspection.detectedMime === 'application/pdf') {
    return {
      valid: false,
      error: 'PDF files are not permitted for round milestone evidence. Please submit a JPEG, PNG, or WebP screenshot.',
    };
  }

  if (inspection.detectedMime === 'application/zip' || (inspection.detectedMime as string) === 'application/x-zip-compressed') {
    return {
      valid: false,
      error: 'ZIP archives are not permitted for round milestone evidence. Please submit a JPEG, PNG, or WebP screenshot.',
    };
  }

  if (
    inspection.detectedMime !== 'image/jpeg' &&
    inspection.detectedMime !== 'image/png' &&
    inspection.detectedMime !== 'image/webp'
  ) {
    return {
      valid: false,
      error: `MIME type '${inspection.detectedMime}' is not permitted. Only JPEG, PNG, and WebP images are supported.`,
    };
  }

  // Extension & declared filename consistency verification (disguised file defense)
  if (filename) {
    const lowerName = filename.toLowerCase();
    if (inspection.detectedMime === 'image/png' && !lowerName.endsWith('.png')) {
      return {
        valid: false,
        error: 'File extension mismatch: PNG binary content must have a .png extension.',
      };
    }
    if (
      inspection.detectedMime === 'image/jpeg' &&
      !lowerName.endsWith('.jpg') &&
      !lowerName.endsWith('.jpeg')
    ) {
      return {
        valid: false,
        error: 'File extension mismatch: JPEG binary content must have a .jpg or .jpeg extension.',
      };
    }
    if (inspection.detectedMime === 'image/webp' && !lowerName.endsWith('.webp')) {
      return {
        valid: false,
        error: 'File extension mismatch: WebP binary content must have a .webp extension.',
      };
    }
  }

  const extMap = {
    'image/jpeg': 'jpg' as const,
    'image/png': 'png' as const,
    'image/webp': 'webp' as const,
  };

  return {
    valid: true,
    detectedMime: inspection.detectedMime,
    extension: extMap[inspection.detectedMime],
  };
}

/**
 * Uploads round evidence image through the authoritative server validation pipeline:
 * 1. Inspects raw magic bytes and enforces 1 MiB limit.
 * 2. Computes SHA-256 digest from validated bytes.
 * 3. Generates server-side unpredictable UUID object path: teams/{team_id}/rounds/{round_id}/{uuid}.{ext}
 * 4. Uploads to 'submission-evidence' with upsert: false.
 * 5. Re-downloads object and cryptographically verifies exact byte length and SHA-256 match.
 * 6. Records trusted upload provenance in public.evidence_validation_intents with 10-minute expiry.
 * 7. If verification or intent recording fails, immediately purges uploaded object.
 */
export async function uploadAndRegisterRoundEvidence(
  hackathonId: string,
  teamId: string,
  roundId: string,
  studentId: string,
  buffer: Buffer,
  filename?: string
): Promise<RoundEvidenceUploadResult> {
  const validation = validateRoundEvidenceBinary(buffer, filename);
  if (!validation.valid || !validation.detectedMime || !validation.extension) {
    return { success: false, error: validation.error || 'Invalid file format.' };
  }

  const adminClient = createAdminClient();
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const uniqueId = crypto.randomUUID();
  const objectPath = `teams/${teamId}/rounds/${roundId}/${uniqueId}.${validation.extension}`;

  // Step 1: Upload to private storage with upsert: false
  try {
    const { error: uploadErr } = await adminClient.storage
      .from('submission-evidence')
      .upload(objectPath, buffer, {
        contentType: validation.detectedMime,
        upsert: false,
      });

    if (uploadErr) {
      return {
        success: false,
        error: `Storage upload failed: ${uploadErr.message}`,
      };
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected storage upload error.',
    };
  }

  // Step 2: Re-download and cryptographically verify
  try {
    const { data: downloadData, error: downloadErr } = await adminClient.storage
      .from('submission-evidence')
      .download(objectPath);

    if (downloadErr || !downloadData) {
      await purgeOrphanedRoundEvidence(adminClient, objectPath);
      return {
        success: false,
        error: 'Evidence verification failed: unable to re-read uploaded object from storage.',
      };
    }

    const downloadedBuffer = Buffer.from(await downloadData.arrayBuffer());

    if (downloadedBuffer.length !== buffer.length) {
      await purgeOrphanedRoundEvidence(adminClient, objectPath);
      return {
        success: false,
        error: 'Evidence verification failed: downloaded byte length mismatch.',
      };
    }

    const downloadedHash = crypto.createHash('sha256').update(downloadedBuffer).digest('hex');
    if (downloadedHash !== fileHash) {
      await purgeOrphanedRoundEvidence(adminClient, objectPath);
      return {
        success: false,
        error: 'Evidence verification failed: cryptographic SHA-256 digest mismatch.',
      };
    }
  } catch (err: unknown) {
    await purgeOrphanedRoundEvidence(adminClient, objectPath);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Cryptographic re-verification threw an unexpected error.',
    };
  }

  // Step 3: Record authoritative validation intent
  try {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    const { error: intentErr } = await adminClient.from('evidence_validation_intents').insert({
      object_path: objectPath,
      hackathon_id: hackathonId,
      team_id: teamId,
      round_id: roundId,
      created_by: studentId,
      sha256_hash: fileHash,
      file_size_bytes: buffer.length,
      mime_type: validation.detectedMime,
      expires_at: expiresAt,
    });

    if (intentErr) {
      await purgeOrphanedRoundEvidence(adminClient, objectPath);
      return {
        success: false,
        error: `Evidence provenance recording failed: ${intentErr.message}`,
      };
    }
  } catch (err: unknown) {
    await purgeOrphanedRoundEvidence(adminClient, objectPath);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Evidence validation intent recording threw an error.',
    };
  }

  return {
    success: true,
    path: objectPath,
    fileHash,
    fileSize: buffer.length,
    mimeType: validation.detectedMime,
  };
}

/**
 * Safely purges an orphaned round evidence object:
 * - Never deletes an object referenced by an existing submission
 */
export async function purgeOrphanedRoundEvidence(
  adminClient: ReturnType<typeof createAdminClient>,
  objectPath: string
): Promise<void> {
  try {
    // Check if referenced by any submission
    const { data: existingSub } = await adminClient
      .from('submissions')
      .select('id')
      .eq('evidence_path', objectPath)
      .limit(1);

    if (existingSub && existingSub.length > 0) {
      // Object is referenced by an active or historical submission; do not delete!
      return;
    }

    await adminClient.storage.from('submission-evidence').remove([objectPath]);
  } catch (err) {
    console.error('[PURGE_ROUND_EVIDENCE_ERROR]', err);
  }
}

/**
 * Creates short-lived private signed URL for evidence preview (default 5 minutes = 300 seconds).
 */
export async function createSignedEvidencePreviewUrl(
  objectPath: string,
  expiresInSeconds: number = 300
): Promise<string | null> {
  if (!objectPath || !objectPath.trim()) return null;

  try {
    const adminClient = createAdminClient();
    const { data, error } = await adminClient.storage
      .from('submission-evidence')
      .createSignedUrl(objectPath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}
