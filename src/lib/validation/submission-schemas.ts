import { z } from 'zod';

export const GITHUB_REPO_REGEX =
  /^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\/)?$/;

export const CANONICAL_ROUND_EVIDENCE_REGEX =
  /^teams\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/rounds\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/;

export const MAX_EVIDENCE_IMAGE_SIZE = 1 * 1024 * 1024; // 1 MiB (1,048,576 bytes)
export const ALLOWED_EVIDENCE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const ALLOWED_EVIDENCE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Validates milestone submission title (3 to 120 characters, non-blank).
 */
export const milestoneTitleSchema = z
  .string()
  .trim()
  .min(3, 'Milestone title must be at least 3 characters.')
  .max(120, 'Milestone title cannot exceed 120 characters.');

/**
 * Validates milestone description (optional, max 2000 characters).
 */
export const milestoneDescriptionSchema = z
  .string()
  .trim()
  .max(2000, 'Description cannot exceed 2000 characters.')
  .optional()
  .or(z.literal(''));

/**
 * Validates GitHub repository URL (must match official GitHub repo format).
 */
export const githubUrlSchema = z
  .string()
  .trim()
  .regex(GITHUB_REPO_REGEX, 'Must be a valid GitHub repository URL (e.g., https://github.com/org/repo).')
  .max(500, 'GitHub URL cannot exceed 500 characters.')
  .optional()
  .or(z.literal(''));

/**
 * Validates live demo URL (must be https://).
 */
export const liveDemoUrlSchema = z
  .string()
  .trim()
  .url('Must be a valid URL.')
  .refine(
    (url) => !url || url.startsWith('https://'),
    'Live demo URL must use secure HTTPS protocol.'
  )
  .max(500, 'Live demo URL cannot exceed 500 characters.')
  .optional()
  .or(z.literal(''));

/**
 * Validates canonical round evidence path.
 */
export const canonicalEvidencePathSchema = z
  .string()
  .trim()
  .regex(CANONICAL_ROUND_EVIDENCE_REGEX, 'Invalid round evidence path format.')
  .optional()
  .or(z.literal(''));

/**
 * Validates initial milestone submission payload.
 */
export const submitMilestoneSchema = z
  .object({
    hackathonId: z.string().uuid('Invalid hackathon UUID format.'),
    roundId: z.string().uuid('Invalid round UUID format.'),
    teamId: z.string().uuid('Invalid team UUID format.'),
    title: milestoneTitleSchema,
    description: milestoneDescriptionSchema,
    githubUrl: githubUrlSchema,
    liveDemoUrl: liveDemoUrlSchema,
    evidencePath: canonicalEvidencePathSchema,
  })
  .refine(
    (data) => Boolean(data.githubUrl || data.liveDemoUrl || data.evidencePath),
    'At least one submission artifact (GitHub URL, Live Demo URL, or Image Evidence) must be provided.'
  );

export type SubmitMilestoneInput = z.infer<typeof submitMilestoneSchema>;

/**
 * Validates revision resubmission payload.
 */
export const resubmitMilestoneSchema = z
  .object({
    parentSubmissionId: z.string().uuid('Invalid parent submission UUID format.'),
    hackathonId: z.string().uuid('Invalid hackathon UUID format.'),
    roundId: z.string().uuid('Invalid round UUID format.'),
    teamId: z.string().uuid('Invalid team UUID format.'),
    title: milestoneTitleSchema,
    description: milestoneDescriptionSchema,
    githubUrl: githubUrlSchema,
    liveDemoUrl: liveDemoUrlSchema,
    evidencePath: canonicalEvidencePathSchema,
  })
  .refine(
    (data) => Boolean(data.githubUrl || data.liveDemoUrl || data.evidencePath),
    'At least one submission artifact (GitHub URL, Live Demo URL, or Image Evidence) must be provided.'
  );

export type ResubmitMilestoneInput = z.infer<typeof resubmitMilestoneSchema>;

/**
 * Validates round reviewer decision and feedback rules.
 * Matches DB check constraint: chk_submission_reviews_feedback_rules
 */
export const reviewDecisionSchema = z.enum(['accepted', 'rejected', 'revision_requested']);

export const reviewRoundSubmissionSchema = z
  .object({
    submissionId: z.string().uuid('Invalid submission UUID format.'),
    decision: reviewDecisionSchema,
    feedback: z.string().trim().max(1000, 'Feedback cannot exceed 1000 characters.').optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const trimmed = data.feedback ? data.feedback.trim() : '';
    if (data.decision === 'revision_requested' || data.decision === 'rejected') {
      if (trimmed.length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['feedback'],
          message: `Decision '${data.decision}' strictly requires non-blank explanation of at least 10 characters.`,
        });
      }
    }
  });

export type ReviewRoundSubmissionInput = z.infer<typeof reviewRoundSubmissionSchema>;

/**
 * Validates reopen of rejected submission.
 */
export const reopenSubmissionSchema = z.object({
  submissionId: z.string().uuid('Invalid submission UUID format.'),
  reason: z
    .string()
    .trim()
    .min(10, 'Reopen reason must contain at least 10 non-whitespace characters.')
    .max(1000, 'Reopen reason cannot exceed 1000 characters.'),
});

export type ReopenSubmissionInput = z.infer<typeof reopenSubmissionSchema>;

/**
 * Validates winner placement recording.
 */
export const recordWinnerPlacementSchema = z.object({
  submissionId: z.string().uuid('Invalid submission UUID format.'),
  placement: z.union([z.literal(1), z.literal(2), z.literal(3)], {
    error: 'Placement must be 1 (1st place), 2 (2nd place), or 3 (3rd place).',
  }),
});

export type RecordWinnerPlacementInput = z.infer<typeof recordWinnerPlacementSchema>;
