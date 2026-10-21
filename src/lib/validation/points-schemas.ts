import { z } from 'zod';

export const adjustPointsSchema = z.object({
  studentId: z.string().uuid('Invalid student ID format.'),
  hackathonId: z.string().uuid('Invalid hackathon ID format.'),
  teamId: z.string().uuid('Invalid team ID format.').optional().nullable(),
  points: z
    .number()
    .int('Points must be an integer.')
    .refine((val) => val !== 0, {
      message: 'Point adjustment amount cannot be zero.',
    }),
  reason: z
    .string()
    .trim()
    .min(10, 'Adjustment reason must be at least 10 non-whitespace characters.')
    .max(500, 'Adjustment reason cannot exceed 500 characters.'),
  idempotencyKey: z
    .string()
    .trim()
    .max(200, 'Idempotency key cannot exceed 200 characters.')
    .optional(),
  adjustedEntryId: z.string().uuid('Invalid adjusted entry ID.').optional().nullable(),
  overrideNegativeFloor: z.boolean().optional().default(false),
});

export const reversePointsSchema = z.object({
  ledgerId: z.string().uuid('Invalid ledger entry ID format.'),
  reason: z
    .string()
    .trim()
    .min(10, 'Reversal reason must be at least 10 non-whitespace characters.')
    .max(500, 'Reversal reason cannot exceed 500 characters.'),
});

export const updatePointConfigurationSchema = z.object({
  milestoneType: z
    .enum(['participation', 'round_qualification'], {
      message: 'Only participation and round_qualification can be configured. Winner bonuses are disabled.',
    }),
  regularMemberPoints: z
    .number()
    .int('Points must be an integer.')
    .min(0, 'Point values cannot be negative.')
    .max(1000, 'Point value exceeds maximum allowable limit of 1000.'),
  teamLeaderPoints: z
    .number()
    .int('Points must be an integer.')
    .min(0, 'Point values cannot be negative.')
    .max(1000, 'Point value exceeds maximum allowable limit of 1000.'),
});

export const leaderboardFilterSchema = z.object({
  academicYear: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional(),
  eventAcademicYear: z
    .string()
    .trim()
    .optional(),
  eventTerm: z
    .enum(['odd_sem', 'even_sem', 'summer_term'])
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0),
});

export const setHackathonAcademicPeriodSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon ID format.'),
  academicYear: z.string().trim().optional(),
  academicTerm: z.enum(['odd_sem', 'even_sem', 'summer_term', 'unassigned'], {
    message: 'Term must be odd_sem, even_sem, summer_term, or unassigned.',
  }),
});
