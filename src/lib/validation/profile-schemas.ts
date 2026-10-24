import { z } from 'zod';
import { BRANCHES } from './auth-schemas';

/**
 * Validates and normalizes direct phone updates.
 * Accepts either 10-digit Indian mobile (e.g. 9876543210) or E.164 (+919876543210).
 */
export const updatePhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((val) => {
      if (/^[6-9]\d{9}$/.test(val)) {
        return `+91${val}`;
      }
      return val;
    })
    .pipe(
      z
        .string()
        .regex(
          /^\+91[6-9]\d{9}$/,
          'Phone number must be a valid 10-digit Indian mobile number (+91XXXXXXXXXX).'
        )
    ),
});

export type UpdatePhoneInput = z.infer<typeof updatePhoneSchema>;

export const EDITABLE_INSTITUTIONAL_FIELDS = [
  'full_name',
  'usn',
  'branch',
  'academic_year',
] as const;

export type EditableInstitutionalField =
  (typeof EDITABLE_INSTITUTIONAL_FIELDS)[number];

/**
 * Validates profile correction submissions.
 */
export const profileChangeRequestSchema = z
  .object({
    field_name: z.enum(EDITABLE_INSTITUTIONAL_FIELDS, {
      message: 'Invalid field selection.',
    }),
    new_value: z.string().trim().min(1, 'New value is required.'),
    reason: z
      .string()
      .trim()
      .min(10, 'Reason must be at least 10 characters long.')
      .max(500, 'Reason cannot exceed 500 characters.'),
  })
  .superRefine((data, ctx) => {
    if (data.field_name === 'full_name') {
      if (data.new_value.length < 2 || data.new_value.length > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['new_value'],
          message: 'Full name must be between 2 and 100 characters.',
        });
      }
    } else if (data.field_name === 'usn') {
      const normalizedUsn = data.new_value.toUpperCase();
      if (!/^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/.test(normalizedUsn)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['new_value'],
          message: 'USN must follow standard NMIT format (e.g., 1NT22CS001).',
        });
      }
    } else if (data.field_name === 'branch') {
      if (!BRANCHES.includes(data.new_value as (typeof BRANCHES)[number])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['new_value'],
          message: `Branch must be one of: ${BRANCHES.join(', ')}.`,
        });
      }
    } else if (data.field_name === 'academic_year') {
      const parsed = Number(data.new_value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['new_value'],
          message: 'Academic year must be an integer between 1 and 4.',
        });
      }
    }
  });

export type ProfileChangeRequestInput = z.infer<
  typeof profileChangeRequestSchema
>;

/**
 * Validates administrative decision on a change request.
 */
export const reviewProfileChangeRequestSchema = z
  .object({
    request_id: z.string().uuid('Invalid request ID format.'),
    decision: z.enum(['approved', 'rejected'], {
      message: 'Decision must be either approved or rejected.',
    }),
    rejection_reason: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === 'rejected') {
      if (!data.rejection_reason || data.rejection_reason.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rejection_reason'],
          message: 'Rejection reason must be at least 10 characters long.',
        });
      } else if (data.rejection_reason.length > 500) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['rejection_reason'],
          message: 'Rejection reason cannot exceed 500 characters.',
        });
      }
    }
  });

export type ReviewProfileChangeRequestInput = z.infer<
  typeof reviewProfileChangeRequestSchema
>;

/**
 * Strict validator for optional LinkedIn profile / company URLs.
 */
export function validateLinkedInUrl(
  rawUrl: string | null | undefined
): { isValid: boolean; error?: string; normalized: string | null } {
  if (rawUrl === null || rawUrl === undefined) {
    return { isValid: true, normalized: null };
  }
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    return { isValid: true, normalized: null };
  }
  if (trimmed.length > 255) {
    return { isValid: false, error: 'LinkedIn URL must not exceed 255 characters.', normalized: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Invalid URL format.', normalized: null };
  }

  if (parsed.protocol !== 'https:') {
    return { isValid: false, error: 'LinkedIn URL must use HTTPS.', normalized: null };
  }
  if (parsed.username || parsed.password) {
    return { isValid: false, error: 'Credentials in URL are not permitted.', normalized: null };
  }
  if (parsed.port) {
    return { isValid: false, error: 'Explicit port numbers are not permitted.', normalized: null };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLinkedInHost =
    hostname === 'linkedin.com' ||
    hostname === 'www.linkedin.com' ||
    /^[a-z]{2}\.linkedin\.com$/.test(hostname);

  if (!isLinkedInHost) {
    return { isValid: false, error: 'URL must belong to linkedin.com.', normalized: null };
  }

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) {
    return { isValid: false, error: 'LinkedIn URL must point to a profile (/in/username) or organization (/company/name).', normalized: null };
  }

  const section = pathParts[0].toLowerCase();
  if (section !== 'in' && section !== 'company' && section !== 'school') {
    return { isValid: false, error: 'LinkedIn URL must point to a profile (/in/username) or organization.', normalized: null };
  }

  const identifier = pathParts[1];
  if (!/^[a-zA-Z0-9_\-%]+$/.test(identifier)) {
    return { isValid: false, error: 'LinkedIn profile contains invalid characters.', normalized: null };
  }

  const normalized = `https://${hostname}/${section}/${identifier}`;
  return { isValid: true, normalized };
}

/**
 * Strict validator for optional GitHub profile URLs.
 */
export function validateGitHubUrl(
  rawUrl: string | null | undefined
): { isValid: boolean; error?: string; normalized: string | null } {
  if (rawUrl === null || rawUrl === undefined) {
    return { isValid: true, normalized: null };
  }
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    return { isValid: true, normalized: null };
  }
  if (trimmed.length > 255) {
    return { isValid: false, error: 'GitHub URL must not exceed 255 characters.', normalized: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: 'Invalid URL format.', normalized: null };
  }

  if (parsed.protocol !== 'https:') {
    return { isValid: false, error: 'GitHub URL must use HTTPS.', normalized: null };
  }
  if (parsed.username || parsed.password) {
    return { isValid: false, error: 'Credentials in URL are not permitted.', normalized: null };
  }
  if (parsed.port) {
    return { isValid: false, error: 'Explicit port numbers are not permitted.', normalized: null };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== 'github.com' && hostname !== 'www.github.com') {
    return { isValid: false, error: 'URL must belong to github.com.', normalized: null };
  }

  const pathParts = parsed.pathname.split('/').filter(Boolean);
  if (pathParts.length !== 1) {
    return { isValid: false, error: 'GitHub URL must point directly to a user profile (e.g. https://github.com/username).', normalized: null };
  }

  const username = pathParts[0];
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(username)) {
    return { isValid: false, error: 'Invalid GitHub username format.', normalized: null };
  }

  const reservedPaths = new Set([
    'about', 'pricing', 'features', 'enterprise', 'security', 'login', 'join',
    'explore', 'marketplace', 'trending', 'settings', 'notifications', 'orgs',
    'contact', 'site', 'blog', 'help', 'search', 'pulls', 'issues'
  ]);
  if (reservedPaths.has(username.toLowerCase())) {
    return { isValid: false, error: 'URL points to a reserved GitHub path, not a user profile.', normalized: null };
  }

  const normalized = `https://github.com/${username}`;
  return { isValid: true, normalized };
}

/**
 * Validates student social link updates (LinkedIn, GitHub).
 * Supports independent updates or clearing of either field.
 */
export const updateSocialLinksSchema = z
  .object({
    linkedin_url: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val === '' ? null : val)),
    github_url: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (val === undefined ? undefined : val === '' ? null : val)),
  })
  .superRefine((data, ctx) => {
    if (data.linkedin_url !== undefined && data.linkedin_url !== null) {
      const res = validateLinkedInUrl(data.linkedin_url);
      if (!res.isValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['linkedin_url'],
          message: res.error || 'Invalid LinkedIn URL.',
        });
      }
    }

    if (data.github_url !== undefined && data.github_url !== null) {
      const res = validateGitHubUrl(data.github_url);
      if (!res.isValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['github_url'],
          message: res.error || 'Invalid GitHub URL.',
        });
      }
    }
  });

export type UpdateSocialLinksInput = z.infer<typeof updateSocialLinksSchema>;

