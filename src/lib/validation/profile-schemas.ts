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
