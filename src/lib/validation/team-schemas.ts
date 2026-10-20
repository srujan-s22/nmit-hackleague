import { z } from 'zod';

export const MANDATORY_CDC_DECLARATION_TEXT =
  "By submitting this screenshot, you confirm that it is genuine, unaltered, and represents your team's actual registration on the official hackathon platform. Submitting fake, manipulated, or misleading registration proof may result in strict disciplinary action by the Career Development Centre (CDC), including disqualification from the hackathon and other action under applicable college rules. Your submission may be reviewed, and providing proof does not guarantee acceptance.";

/**
 * Validates a team name: 3 to 50 characters, safe alphanumeric, spaces, dots, underscores, and hyphens.
 */
export const teamNameSchema = z
  .string()
  .trim()
  .min(3, 'Team name must be at least 3 characters.')
  .max(50, 'Team name cannot exceed 50 characters.')
  .regex(
    /^[a-zA-Z0-9\s._-]+$/,
    'Team name can only contain alphanumeric characters, spaces, dots, underscores, and hyphens.'
  );

/**
 * Validates team creation payload.
 */
export const createTeamSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon UUID format.'),
  name: teamNameSchema,
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

/**
 * Validates 12-character Crockford Base32 invitation code (case-insensitive, no 0, 1, I, O).
 */
export const invitationCodeSchema = z
  .string()
  .trim()
  .length(12, 'Invitation code must be exactly 12 characters.')
  .regex(
    /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/i,
    'Invitation code must contain 12 valid alphanumeric characters.'
  )
  .transform((val) => val.toUpperCase());

/**
 * Validates payload to join a team with code.
 */
export const joinTeamSchema = z.object({
  invitationCode: invitationCodeSchema,
});

export type JoinTeamInput = z.infer<typeof joinTeamSchema>;

/**
 * Generic single-team payload schema.
 */
export const teamIdSchema = z.object({
  teamId: z.string().uuid('Invalid team UUID format.'),
});

export type TeamIdInput = z.infer<typeof teamIdSchema>;

/**
 * Validates leaving or disbanding a team.
 */
export const leaveTeamSchema = z.object({
  teamId: z.string().uuid('Invalid team UUID format.'),
});

export type LeaveTeamInput = z.infer<typeof leaveTeamSchema>;

/**
 * Validates removing a team member.
 */
export const removeTeamMemberSchema = z.object({
  teamId: z.string().uuid('Invalid team UUID format.'),
  studentId: z.string().uuid('Invalid student UUID format.'),
});

export type RemoveTeamMemberInput = z.infer<typeof removeTeamMemberSchema>;

/**
 * Validates leadership transfer.
 */
export const transferLeadershipSchema = z.object({
  teamId: z.string().uuid('Invalid team UUID format.'),
  newLeaderId: z.string().uuid('Invalid student UUID format for new leader.'),
});

export type TransferLeadershipInput = z.infer<typeof transferLeadershipSchema>;

/**
 * Validates regenerating an invitation code.
 */
export const regenerateInvitationCodeSchema = z.object({
  teamId: z.string().uuid('Invalid team UUID format.'),
});

export type RegenerateInvitationCodeInput = z.infer<typeof regenerateInvitationCodeSchema>;

/**
 * Validates locking a team roster.
 */
export const lockTeamRosterSchema = z.object({
  teamId: z.string().uuid('Invalid team UUID format.'),
});

export type LockTeamRosterInput = z.infer<typeof lockTeamRosterSchema>;

/**
 * Validates registration proof submission and CDC declaration acceptance.
 */
export const submitRegistrationProofSchema = z.object({
  teamId: z.string().uuid('Invalid team UUID format.'),
  proofPath: z.string().trim().min(1, 'Registration proof screenshot path is required.'),
  cdcAccepted: z.literal(true, {
    message: 'Mandatory CDC declaration acceptance is required to submit registration proof.',
  }),
  cdcDeclarationText: z
    .string()
    .trim()
    .refine(
      (text) =>
        text.includes('Career Development Centre (CDC)') &&
        text.includes('genuine, unaltered'),
      {
        message: 'Invalid or forged CDC declaration text.',
      }
    )
    .default(MANDATORY_CDC_DECLARATION_TEXT),
});

export type SubmitRegistrationProofInput = z.infer<typeof submitRegistrationProofSchema>;

/**
 * Validates registration proof screenshot file metadata (1 MB max, PNG/JPEG/WebP only).
 */
export const registrationProofFileSchema = z.object({
  size: z
    .number()
    .int()
    .positive('File content cannot be empty.')
    .max(1048576, 'File size exceeds maximum limit of 1 MB (1,048,576 bytes).'),
  type: z.enum(['image/png', 'image/jpeg', 'image/webp'], {
    message: 'Invalid file format. Only PNG, JPEG, and WebP images are permitted.',
  }),
  name: z.string().optional(),
});

export type RegistrationProofFileInput = z.infer<typeof registrationProofFileSchema>;
