import crypto from 'crypto';

export const ALLOWED_DOCUMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const;
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Authoritative allowed MIME types for submission-evidence matching storage.buckets configuration:
 * ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/zip']
 */
export const ALLOWED_EVIDENCE_TYPES = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

/**
 * Authoritative File Size Limits:
 * - Profile photo: 1 MB (rules_updated.md line 168)
 * - College ID image: 1.5 MB (rules_updated.md line 169)
 * - College ID PDF document: 5 MB (storage.buckets limit 5242880 bytes)
 * - Evidence image (screenshots, round evidence, winner evidence): 1 MB per image (rules_updated.md lines 170-171)
 * - Submission evidence archive/document (PDF/ZIP): 20 MB (storage.buckets limit 20971520 bytes)
 */
export const MAX_PROFILE_PHOTO_SIZE = 1 * 1024 * 1024; // 1 MB
export const MAX_COLLEGE_ID_IMAGE_SIZE = Math.floor(1.5 * 1024 * 1024); // 1.5 MB (1,572,864 bytes)
export const MAX_COLLEGE_ID_SIZE = 5 * 1024 * 1024; // 5 MB for PDF
export const MAX_EVIDENCE_IMAGE_SIZE = 1 * 1024 * 1024; // 1 MB
export const MAX_SUBMISSION_EVIDENCE_SIZE = 20 * 1024 * 1024; // 20 MB (20,971,520 bytes)

export interface BinarySignatureInspection {
  detectedMime: string | null;
  isExecutable: boolean;
  threatDescription?: string;
}

export interface BinaryValidationResult {
  valid: boolean;
  error?: string;
  detectedMime?: string;
  isExecutable?: boolean;
}

/**
 * Inspects raw buffer bytes against authoritative binary magic signatures.
 * Detects genuine PNG, JPEG, PDF, and ZIP formats, and explicitly detects
 * dangerous executable, script, and disguised formats.
 */
export function inspectBinaryMagicBytes(buffer: Buffer): BinarySignatureInspection {
  if (!buffer || buffer.length < 2) {
    return {
      detectedMime: null,
      isExecutable: false,
      threatDescription: 'File buffer is empty or too small to contain a valid file header.',
    };
  }

  // 1. Proactive detection of dangerous executable signatures
  // Windows DOS/PE executable: 'MZ' (0x4D, 0x5A)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return {
      detectedMime: null,
      isExecutable: true,
      threatDescription: 'Windows PE/DOS executable (MZ signature detected)',
    };
  }

  // Linux/Unix ELF executable: 0x7F, 'E', 'L', 'F' (0x7F, 0x45, 0x4C, 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    return {
      detectedMime: null,
      isExecutable: true,
      threatDescription: 'Linux ELF binary executable (\\x7fELF signature detected)',
    };
  }

  // macOS Mach-O binaries & Java bytecode
  if (buffer.length >= 4) {
    const b0 = buffer[0];
    const b1 = buffer[1];
    const b2 = buffer[2];
    const b3 = buffer[3];
    if (
      (b0 === 0xfe && b1 === 0xed && b2 === 0xfa && (b3 === 0xce || b3 === 0xcf)) || // Mach-O 32/64 bit big endian
      (b0 === 0xce && b1 === 0xfa && b2 === 0xed && b3 === 0xfe) || // Mach-O 32-bit little endian
      (b0 === 0xcf && b1 === 0xfa && b2 === 0xed && b3 === 0xfe) || // Mach-O 64-bit little endian
      (b0 === 0xca && b1 === 0xfe && b2 === 0xba && b3 === 0xbe)    // Mach-O universal / Java class
    ) {
      return {
        detectedMime: null,
        isExecutable: true,
        threatDescription: 'Mach-O / Java bytecode binary executable signature detected',
      };
    }
  }

  // Shell script shebang: '#!' (0x23, 0x21)
  if (buffer.length >= 2 && buffer[0] === 0x23 && buffer[1] === 0x21) {
    return {
      detectedMime: null,
      isExecutable: true,
      threatDescription: 'Shell script or interpreted script (shebang #! signature detected)',
    };
  }

  // Web script injection / HTML / XML disguised files: '<'
  // PNG, JPEG, PDF, and ZIP binary formats never begin with '<'
  if (buffer[0] === 0x3c) {
    const headText = buffer.subarray(0, 100).toString('utf8').toLowerCase();
    if (
      headText.startsWith('<!doctype') ||
      headText.startsWith('<html') ||
      headText.startsWith('<script') ||
      headText.startsWith('<?xml') ||
      headText.startsWith('<svg')
    ) {
      return {
        detectedMime: null,
        isExecutable: true,
        threatDescription: 'HTML/XML/SVG script or document disguised as binary file',
      };
    }
  }

  // 2. Authoritative allowed file signatures

  // PNG: 89 50 4E 47 0D 0A 1A 0A (\x89PNG\r\n\x1a\n)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      detectedMime: 'image/png',
      isExecutable: false,
    };
  }

  // JPEG: FF D8 FF (Start of Image marker)
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return {
      detectedMime: 'image/jpeg',
      isExecutable: false,
    };
  }

  // PDF: 25 50 44 46 (%PDF)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return {
      detectedMime: 'application/pdf',
      isExecutable: false,
    };
  }

  // WebP: RIFF....WEBP (52 49 46 46 .. .. .. .. 57 45 42 50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return {
      detectedMime: 'image/webp',
      isExecutable: false,
    };
  }

  // ZIP / Office Open XML: 50 4B 03 04, 50 4B 05 06, 50 4B 07 08 (PK..)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (
      (buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[2] === 0x05 && buffer[3] === 0x06) ||
      (buffer[2] === 0x07 && buffer[3] === 0x08)
    )
  ) {
    return {
      detectedMime: 'application/zip',
      isExecutable: false,
    };
  }

  return {
    detectedMime: null,
    isExecutable: false,
    threatDescription: 'File binary header does not match any approved format signature (PNG, JPEG, WebP, PDF, ZIP).',
  };
}

/**
 * Validates a file Buffer against authoritative binary magic signatures,
 * category format constraints, size limits, and filename consistency.
 */
export function validateStorageFileBinary(
  buffer: Buffer,
  category: 'profile-photo' | 'college-id' | 'submission-evidence',
  filename?: string,
  declaredMime?: string
): BinaryValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'File content is empty.' };
  }

  // 1. Inspect binary magic bytes
  const inspection = inspectBinaryMagicBytes(buffer);

  if (inspection.isExecutable) {
    return {
      valid: false,
      isExecutable: true,
      error: `Binary validation failed: ${inspection.threatDescription || 'Executable or malicious content detected'}. Disguised executable files are strictly prohibited.`,
    };
  }

  if (!inspection.detectedMime) {
    return {
      valid: false,
      error: `Binary validation failed: ${inspection.threatDescription || 'File content does not match any allowed binary signature (PNG, JPEG, WebP, PDF, or ZIP)'}.`,
    };
  }

  const detected = inspection.detectedMime;

  // 2. Category-specific format & size enforcement based on actual binary content
  if (category === 'profile-photo') {
    if (detected !== 'image/png' && detected !== 'image/jpeg' && detected !== 'image/webp') {
      return {
        valid: false,
        error: `Binary validation failed: Profile photo must be a genuine PNG, JPEG, or WebP image (detected: ${detected}).`,
      };
    }
    if (buffer.length > MAX_PROFILE_PHOTO_SIZE) {
      return {
        valid: false,
        error: `Profile photo size exceeds maximum limit of 1MB (${buffer.length} bytes).`,
      };
    }
  } else if (category === 'college-id') {
    if (detected !== 'image/png' && detected !== 'image/jpeg' && detected !== 'image/webp' && detected !== 'application/pdf') {
      return {
        valid: false,
        error: `Binary validation failed: College ID must be a genuine PNG, JPEG, WebP, or PDF file (detected: ${detected}).`,
      };
    }
    const isImage = detected === 'image/jpeg' || detected === 'image/png' || detected === 'image/webp';
    const limit = isImage ? MAX_COLLEGE_ID_IMAGE_SIZE : MAX_COLLEGE_ID_SIZE;
    if (buffer.length > limit) {
      return {
        valid: false,
        error: isImage
          ? `College ID image size exceeds maximum limit of 1.5MB (${buffer.length} bytes).`
          : `College ID document size exceeds maximum limit of 5MB (${buffer.length} bytes).`,
      };
    }
  } else if (category === 'submission-evidence') {
    const allowed = ['application/pdf', 'application/zip', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(detected)) {
      return {
        valid: false,
        error: `Binary validation failed: Submission evidence must be a genuine PDF, ZIP, PNG, JPEG, or WebP file (detected: ${detected}).`,
      };
    }
    const isImage = detected === 'image/jpeg' || detected === 'image/png' || detected === 'image/webp';
    const limit = isImage ? MAX_EVIDENCE_IMAGE_SIZE : MAX_SUBMISSION_EVIDENCE_SIZE;
    if (buffer.length > limit) {
      return {
        valid: false,
        error: isImage
          ? `Evidence image size exceeds maximum limit of 1MB (${buffer.length} bytes).`
          : `Evidence file size exceeds maximum limit of 20MB (${buffer.length} bytes).`,
      };
    }
  }

  // 3. Extension & declared MIME consistency verification (Disguise defense)
  if (filename) {
    const lowerName = filename.toLowerCase();
    if (detected === 'image/png' && !lowerName.endsWith('.png')) {
      return {
        valid: false,
        error: 'File extension mismatch: PNG binary content must have a .png extension.',
      };
    }
    if (detected === 'image/jpeg' && !lowerName.endsWith('.jpg') && !lowerName.endsWith('.jpeg')) {
      return {
        valid: false,
        error: 'File extension mismatch: JPEG binary content must have a .jpg or .jpeg extension.',
      };
    }
    if (detected === 'image/webp' && !lowerName.endsWith('.webp')) {
      return {
        valid: false,
        error: 'File extension mismatch: WebP binary content must have a .webp extension.',
      };
    }
    if (detected === 'application/pdf' && !lowerName.endsWith('.pdf')) {
      return {
        valid: false,
        error: 'File extension mismatch: PDF binary content must have a .pdf extension.',
      };
    }
    if (detected === 'application/zip' && !lowerName.endsWith('.zip')) {
      return {
        valid: false,
        error: 'File extension mismatch: ZIP binary content must have a .zip extension.',
      };
    }
  }

  // Declared MIME consistency check
  if (declaredMime) {
    const lowerDeclared = declaredMime.toLowerCase();
    if (detected === 'image/png' && lowerDeclared !== 'image/png') {
      return {
        valid: false,
        error: `Declared MIME type '${declaredMime}' contradicts detected PNG binary signature.`,
      };
    }
    if (detected === 'image/jpeg' && lowerDeclared !== 'image/jpeg' && lowerDeclared !== 'image/jpg') {
      return {
        valid: false,
        error: `Declared MIME type '${declaredMime}' contradicts detected JPEG binary signature.`,
      };
    }
    if (detected === 'image/webp' && lowerDeclared !== 'image/webp') {
      return {
        valid: false,
        error: `Declared MIME type '${declaredMime}' contradicts detected WebP binary signature.`,
      };
    }
    if (detected === 'application/pdf' && lowerDeclared !== 'application/pdf') {
      return {
        valid: false,
        error: `Declared MIME type '${declaredMime}' contradicts detected PDF binary signature.`,
      };
    }
    if (
      detected === 'application/zip' &&
      lowerDeclared !== 'application/zip' &&
      lowerDeclared !== 'application/x-zip-compressed'
    ) {
      return {
        valid: false,
        error: `Declared MIME type '${declaredMime}' contradicts detected ZIP binary signature.`,
      };
    }
  }

  return {
    valid: true,
    detectedMime: detected,
  };
}

/**
 * Validates the binary content of a file already stored in Supabase Storage using a provided Supabase client.
 * Used to verify storage objects (including any direct Supabase Storage uploads),
 * ensuring they cannot be linked or submitted without passing binary signature verification.
 */
export async function validateStorageObjectBinaryWithClient(
  client: { storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data: any; error: any }> } } },
  bucket: 'college-ids' | 'profile-photos' | 'submission-evidence',
  path: string,
  category: 'college-id' | 'profile-photo' | 'submission-evidence'
): Promise<BinaryValidationResult> {
  if (!path) {
    return { valid: false, error: 'Storage object path is required.' };
  }

  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) {
    return {
      valid: false,
      error: `Failed to retrieve storage object for validation: ${error?.message || 'Object not found'}`,
    };
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return validateStorageFileBinary(buffer, category, path);
}

/**
 * Validates binary signatures and generates a short-lived signed URL for a storage object.
 * Refuses to generate signed preview URLs for files that fail binary signature validation.
 */
export async function getSignedPreviewUrlWithClient(
  client: { storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data: any; error: any }>; createSignedUrl: (path: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: any }> } } },
  bucket: 'college-ids' | 'profile-photos' | 'submission-evidence',
  path: string,
  expiresInSeconds = 60
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!path) {
    return { success: false, error: 'Storage object path is required.' };
  }

  const category = bucket === 'college-ids'
    ? 'college-id'
    : bucket === 'profile-photos'
      ? 'profile-photo'
      : 'submission-evidence';

  const binaryValidation = await validateStorageObjectBinaryWithClient(client, bucket, path, category);
  if (!binaryValidation.valid) {
    return {
      success: false,
      error: `Cannot generate preview URL: ${binaryValidation.error || 'Document failed binary signature validation.'}`,
    };
  }

  const { data, error } = await client.storage
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

/**
 * Validates file size and format against authoritative business rules and bucket constraints.
 */
export function validateStorageFile(
  file: { size: number; type: string; name?: string },
  category: 'profile-photo' | 'college-id' | 'submission-evidence'
): { valid: boolean; error?: string } {
  if (!file || file.size === 0) {
    return { valid: false, error: 'Please select a valid file to upload.' };
  }

  // Reject SVG files unconditionally (stored XSS vector, rules_updated.md line 176)
  const filename = (file.name || '').toLowerCase();
  const mimeType = (file.type || '').toLowerCase();
  if (mimeType.includes('svg') || filename.endsWith('.svg')) {
    return { valid: false, error: 'SVG images are strictly prohibited for security reasons.' };
  }

  // Reject executable extensions
  const dangerousExtensions = ['.exe', '.bat', '.sh', '.bin', '.cmd', '.msi', '.vbs', '.js', '.jar'];
  if (dangerousExtensions.some((ext) => filename.endsWith(ext))) {
    return { valid: false, error: 'Executable files are strictly prohibited.' };
  }

  if (category === 'profile-photo') {
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      return { valid: false, error: 'Invalid image format. Only PNG, JPEG, and WebP images are permitted.' };
    }
    if (file.size > MAX_PROFILE_PHOTO_SIZE) {
      return { valid: false, error: 'Profile photo size cannot exceed 1MB.' };
    }
  } else if (category === 'college-id') {
    if (!ALLOWED_DOCUMENT_TYPES.includes(mimeType as (typeof ALLOWED_DOCUMENT_TYPES)[number])) {
      return { valid: false, error: 'Invalid file format. Only PNG, JPEG, WebP, and PDF files are permitted.' };
    }
    const isImage = mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp';
    const limit = isImage ? MAX_COLLEGE_ID_IMAGE_SIZE : MAX_COLLEGE_ID_SIZE;
    if (file.size > limit) {
      return {
        valid: false,
        error: isImage
          ? 'College ID image size cannot exceed 1.5MB.'
          : 'College ID document size cannot exceed 5MB.',
      };
    }
  } else if (category === 'submission-evidence') {
    const isAllowed = ALLOWED_EVIDENCE_TYPES.includes(mimeType as (typeof ALLOWED_EVIDENCE_TYPES)[number]);
    if (!isAllowed) {
      return {
        valid: false,
        error: 'Invalid file format. Only PDF documents, ZIP archives, and PNG/JPEG/WebP images are permitted.',
      };
    }
    const isImage = mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp';
    if (isImage && file.size > MAX_EVIDENCE_IMAGE_SIZE) {
      return { valid: false, error: 'Evidence image size cannot exceed 1MB.' };
    }
    if (file.size > MAX_SUBMISSION_EVIDENCE_SIZE) {
      return { valid: false, error: 'Evidence file size cannot exceed 20MB.' };
    }
  }

  return { valid: true };
}

/**
 * Generates an immutable, UUID-prefixed versioned storage path for submission evidence.
 * Format: evidence/{hackathon_id}/{submission_id}/{uuid}_{sanitized_filename}
 */
export function generateEvidenceStoragePath(
  hackathonId: string,
  submissionId: string,
  originalFilename: string
): string {
  // Strip any leading directory paths (prevent path traversal like ../../)
  const baseName = originalFilename.split(/[/\\]/).pop() || 'document.pdf';
  // Neutralize multiple consecutive dots and unsafe characters
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.+/g, '.');
  const uniqueId = crypto.randomUUID();
  return `evidence/${hackathonId}/${submissionId}/${uniqueId}_${sanitized}`;
}

/**
 * Generates a storage path for college ID cards
 */
export function generateCollegeIdStoragePath(userId: string, ext: string): string {
  const randomSuffix = crypto.randomUUID();
  return `${userId}/${randomSuffix}.${ext}`;
}

/**
 * Generates a storage path for user profile photos
 */
export function generateProfilePhotoStoragePath(userId: string, ext: string): string {
  const randomSuffix = crypto.randomUUID();
  return `${userId}/${randomSuffix}.${ext}`;
}

/**
 * Generates an unpredictable, team-specific storage path for registration proof screenshots.
 * Format: teams/{team_id}/registration/{uuid}.{ext}
 * Enforced by Stage A migration check_registration_proof_storage_path.
 */
export function generateRegistrationProofStoragePath(
  teamId: string,
  ext: 'png' | 'jpg' | 'jpeg' | 'webp'
): string {
  const randomSuffix = crypto.randomUUID();
  return `teams/${teamId}/registration/${randomSuffix}.${ext}`;
}
