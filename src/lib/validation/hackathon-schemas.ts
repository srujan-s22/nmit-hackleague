import { z } from 'zod';

export const hackathonModeSchema = z.enum(['offline', 'online', 'hybrid']);

export const prizeTierSchema = z.object({
  placement: z.string().trim().min(1, 'Placement title is required (e.g. 1st Place).'),
  reward: z.string().trim().min(1, 'Reward amount or prize is required.'),
  description: z.string().trim().optional(),
});

/**
 * Strict HTTP(S) URL regex with bounded IPv4 (0-255 octets), RFC-compliant hostname,
 * valid port range (1-65535), and zero whitespace allowed in host/path/query/fragment.
 * Matches PostgreSQL check constraints chk_hackathons_external_url and chk_hackathons_community_url.
 */
export const HTTP_URL_REGEX =
  /^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;%=]*)?$/i;

export const optionalHttpUrlSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .or(z.literal(''))
  .refine(
    (val) => !val || HTTP_URL_REGEX.test(val),
    { message: 'Must be a valid HTTP(S) URL without whitespace (e.g. https://nmit.ac.in).' }
  );

export const mandatoryHttpUrlSchema = z
  .string({ message: 'External registration URL is required.' })
  .trim()
  .min(1, 'External registration URL is required.')
  .regex(HTTP_URL_REGEX, 'Must be a valid HTTP(S) URL without whitespace (e.g. https://devpost.com/hackathons/nmit).');

export const hackathonBaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Event title must be at least 3 characters.')
    .max(120, 'Event title cannot exceed 120 characters.'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug must be URL-safe lowercase alphanumeric with hyphens (e.g. nmit-hacks-2026).'),
  tagline: z
    .string()
    .trim()
    .max(160, 'Tagline cannot exceed 160 characters.')
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .trim()
    .min(10, 'Full description must be at least 10 characters.'),
  organizer: z
    .string()
    .trim()
    .min(2, 'Organizer name is required.'),
  mode: hackathonModeSchema,
  venue: z.string().trim().optional().or(z.literal('')),
  registrationStartAt: z.string().datetime({ message: 'Invalid registration opening date.' }),
  registrationEndAt: z.string().datetime({ message: 'Invalid registration deadline date.' }),
  eventStartAt: z.string().datetime({ message: 'Invalid event start date.' }),
  eventEndAt: z.string().datetime({ message: 'Invalid event end date.' }),
  timezone: z.string().default('Asia/Kolkata'),
  minTeamSize: z.coerce.number().int().min(1, 'Minimum team size must be at least 1.').max(10),
  maxTeamSize: z.coerce.number().int().min(1).max(10),
  isSoloAllowed: z.boolean().default(false),
  eligibility: z
    .string()
    .trim()
    .min(3, 'Eligibility criteria must be at least 3 characters.'),
  prizesSummary: z.string().trim().optional().or(z.literal('')),
  prizesDetail: z.array(prizeTierSchema).default([]),
  externalRegistrationUrl: mandatoryHttpUrlSchema,
  communityUrl: optionalHttpUrlSchema,
  inChargeAdminId: z
    .string()
    .uuid('Invalid admin UUID format.')
    .optional()
    .nullable()
    .or(z.literal('')),
});

export type HackathonCoreFields = {
  registrationStartAt: string;
  registrationEndAt: string;
  eventStartAt: string;
  eventEndAt: string;
  minTeamSize: number;
  maxTeamSize: number;
  isSoloAllowed: boolean;
  mode: 'offline' | 'online' | 'hybrid';
  venue?: string | null;
};

/**
 * Common cross-field chronology and constraint refinements.
 */
function applyHackathonRefinements<T extends z.ZodObject<any>>(schema: T) {
  return schema
    .refine(
      (data: any) => new Date(data.registrationEndAt) > new Date(data.registrationStartAt),
      {
        message: 'Registration deadline must be after registration opening date.',
        path: ['registrationEndAt'],
      }
    )
    .refine(
      (data: any) => new Date(data.eventEndAt) >= new Date(data.eventStartAt),
      {
        message: 'Event end date must be on or after event start date.',
        path: ['eventEndAt'],
      }
    )
    .refine(
      (data: any) => new Date(data.registrationEndAt) <= new Date(data.eventEndAt),
      {
        message: 'Registration deadline cannot extend beyond event conclusion.',
        path: ['registrationEndAt'],
      }
    )
    .refine(
      (data: any) => data.maxTeamSize >= data.minTeamSize,
      {
        message: 'Maximum team size must be greater than or equal to minimum team size.',
        path: ['maxTeamSize'],
      }
    )
    .refine(
      (data: any) => !data.isSoloAllowed || data.minTeamSize === 1,
      {
        message: 'When solo participation is enabled, minimum team size must be 1.',
        path: ['minTeamSize'],
      }
    )
    .refine(
      (data: any) => data.mode === 'online' || (Boolean(data.venue) && (data.venue?.trim().length ?? 0) > 0),
      {
        message: 'Venue details are mandatory for offline and hybrid events.',
        path: ['venue'],
      }
    );
}

// Creation schema: externalRegistrationUrl is strictly mandatory
export const hackathonCreateSchema = applyHackathonRefinements(hackathonBaseSchema);
export const hackathonFormSchema = hackathonCreateSchema;

// Update schema: externalRegistrationUrl permits historical NULL/empty string
export const hackathonUpdateBaseSchema = hackathonBaseSchema.extend({
  externalRegistrationUrl: optionalHttpUrlSchema,
});
export const hackathonUpdateSchema = applyHackathonRefinements(hackathonUpdateBaseSchema);

export type HackathonCreateData = z.infer<typeof hackathonCreateSchema>;
export type HackathonUpdateData = z.infer<typeof hackathonUpdateSchema>;
export type HackathonFormData = HackathonCreateData;

export const deadlineOverrideSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon UUID format.'),
  newDeadline: z.string().datetime({ message: 'Invalid deadline date format.' }),
  reason: z
    .string()
    .trim()
    .min(5, 'A meaningful justification of at least 5 characters is mandatory.')
    .max(500, 'Reason cannot exceed 500 characters.'),
});

export type DeadlineOverrideData = z.infer<typeof deadlineOverrideSchema>;

export const roundItemSchema = z.object({
  id: z.string().uuid().optional(),
  roundNumber: z.coerce.number().int().min(1),
  name: z.string().trim().min(2, 'Round name must be at least 2 characters.'),
  description: z.string().trim().optional().or(z.literal('')),
  startAt: z.string().datetime({ message: 'Invalid round start time.' }),
  endAt: z.string().datetime({ message: 'Invalid round end time.' }),
  isFinalRound: z.boolean().default(false),
}).refine(
  (data) => new Date(data.endAt) >= new Date(data.startAt),
  {
    message: 'Round end date must be on or after round start date.',
    path: ['endAt'],
  }
);

export type RoundItemData = z.infer<typeof roundItemSchema>;

export const roundConfigArraySchema = z
  .array(roundItemSchema)
  .refine(
    (rounds) => {
      const ids = rounds.map((r) => r.id).filter((id): id is string => Boolean(id));
      return new Set(ids).size === ids.length;
    },
    { message: 'Payload cannot contain duplicate round IDs.' }
  )
  .refine(
    (rounds) => {
      const finalCount = rounds.filter((r) => r.isFinalRound).length;
      return finalCount <= 1;
    },
    { message: 'At most one round can be designated as the final round.' }
  )
  .refine(
    (rounds) => {
      return rounds.every((r, idx) => r.roundNumber === idx + 1);
    },
    { message: 'Round numbers must be strictly sequential (1, 2, ..., N).' }
  );

export type RoundConfigArrayData = z.infer<typeof roundConfigArraySchema>;

export const lifecycleTransitionSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon UUID format.'),
  targetStatus: z.enum(['draft', 'published', 'registration_closed', 'archived']),
  reason: z.string().trim().max(500).optional(),
});

export type LifecycleTransitionData = z.infer<typeof lifecycleTransitionSchema>;

export const roundScheduleOverrideSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon UUID format.'),
  roundId: z.string().uuid('Invalid round UUID format.'),
  newStartAt: z.string().datetime({ message: 'Invalid start time.' }),
  newEndAt: z.string().datetime({ message: 'Invalid end time.' }),
  reason: z
    .string()
    .trim()
    .min(5, 'A meaningful justification of at least 5 characters is mandatory.')
    .max(500, 'Reason cannot exceed 500 characters.'),
}).refine(
  (data) => new Date(data.newEndAt) > new Date(data.newStartAt),
  {
    message: 'Round end time must be after round start time.',
    path: ['newEndAt'],
  }
);

export type RoundScheduleOverrideData = z.infer<typeof roundScheduleOverrideSchema>;

export const roundPauseResumeSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon UUID format.'),
  roundId: z.string().uuid('Invalid round UUID format.'),
  action: z.enum(['pause', 'resume']),
  newEndAt: z.string().datetime({ message: 'Invalid end time.' }).optional(),
  reason: z
    .string()
    .trim()
    .min(5, 'A meaningful justification of at least 5 characters is mandatory.')
    .max(500, 'Reason cannot exceed 500 characters.'),
});

export type RoundPauseResumeData = z.infer<typeof roundPauseResumeSchema>;
