import { z } from 'zod';

export const CANONICAL_PERMISSIONS = [
  'verify_students',
  'manage_students',
  'manage_password_resets',
  'manage_hackathons',
  'assign_hackathons',
  'manage_teams',
  'manage_followups',
  'view_analytics',
  'export_data',
  'view_audit_logs',
  'manage_points',
  'manage_notifications',
  'view_student_data',
] as const;

export type AdminPermissionKey = (typeof CANONICAL_PERMISSIONS)[number];

export type PermissionCategory =
  | 'Verification & Onboarding'
  | 'Event Operations'
  | 'Reporting & Oversight'
  | 'Platform Communications';

export interface PermissionDefinition {
  key: AdminPermissionKey;
  label: string;
  category: PermissionCategory;
  description: string;
  phaseAvailability: string;
}

export const PERMISSION_DEFINITIONS: Record<AdminPermissionKey, PermissionDefinition> = {
  verify_students: {
    key: 'verify_students',
    label: 'Student Verification',
    category: 'Verification & Onboarding',
    description: 'Access /admin/verifications, inspect College IDs via signed preview, and review student registrations.',
    phaseAvailability: 'Active in Phase 4 & 5',
  },
  manage_students: {
    key: 'manage_students',
    label: 'Student Management',
    category: 'Verification & Onboarding',
    description: 'View full student rosters, process profile change requests, and review demographic details.',
    phaseAvailability: 'Defined in Phase 5',
  },
  view_student_data: {
    key: 'view_student_data',
    label: 'Student Directory',
    category: 'Verification & Onboarding',
    description: 'Access verified student directory, search approved participant rosters, and view individual student profiles.',
    phaseAvailability: 'Active in Phase 13',
  },
  manage_password_resets: {
    key: 'manage_password_resets',
    label: 'Password Reset Assistance',
    category: 'Verification & Onboarding',
    description: 'Trigger administrative password reset emails for locked accounts without viewing passwords.',
    phaseAvailability: 'Defined in Phase 5',
  },
  manage_hackathons: {
    key: 'manage_hackathons',
    label: 'Hackathon Management',
    category: 'Event Operations',
    description: 'Create, edit, draft, publish, close, archive hackathons; configure rounds and deadlines.',
    phaseAvailability: 'Active in Phase 6',
  },
  assign_hackathons: {
    key: 'assign_hackathons',
    label: 'Assign Hackathons',
    category: 'Event Operations',
    description: 'Assign and manage administrator and reviewer assignments for institutional hackathons.',
    phaseAvailability: 'Active in Phase 2B',
  },
  manage_teams: {
    key: 'manage_teams',
    label: 'Team Management',
    category: 'Event Operations',
    description: 'Inspect team rosters, handle team disputes, lock/unlock rosters.',
    phaseAvailability: 'Reserved for Phase 7',
  },
  manage_followups: {
    key: 'manage_followups',
    label: 'Follow-up Tasks',
    category: 'Event Operations',
    description: 'Access and manage student and team operational follow-ups and inquiries.',
    phaseAvailability: 'Reserved for Future Phase',
  },
  view_analytics: {
    key: 'view_analytics',
    label: 'Platform Analytics',
    category: 'Reporting & Oversight',
    description: 'Access institutional participation metrics, leaderboards, scores, and demographic analytics.',
    phaseAvailability: 'Reserved for Phase 10',
  },
  export_data: {
    key: 'export_data',
    label: 'Data Export',
    category: 'Reporting & Oversight',
    description: 'Export authorized participant rosters, team submissions, and event reports to CSV/JSON.',
    phaseAvailability: 'Reserved for Phase 10',
  },
  view_audit_logs: {
    key: 'view_audit_logs',
    label: 'Audit Log Viewer',
    category: 'Reporting & Oversight',
    description: 'View immutable platform audit records (public.audit_logs).',
    phaseAvailability: 'Reserved for Phase 8',
  },
  manage_points: {
    key: 'manage_points',
    label: 'Points Ledger Management',
    category: 'Reporting & Oversight',
    description: 'Configure point rules, manually award or reverse milestone points in the points ledger.',
    phaseAvailability: 'Reserved for Phase 9',
  },
  manage_notifications: {
    key: 'manage_notifications',
    label: 'Notification Administration',
    category: 'Platform Communications',
    description: 'Compose, preview, publish, and manage in-app announcements and Web Push broadcasts to registered users.',
    phaseAvailability: 'Defined in Phase 5',
  },
};

export const PERMISSIONS_LIST = Object.values(PERMISSION_DEFINITIONS);

export const PERMISSIONS_BY_CATEGORY = PERMISSIONS_LIST.reduce(
  (acc, def) => {
    if (!acc[def.category]) {
      acc[def.category] = [];
    }
    acc[def.category].push(def);
    return acc;
  },
  {} as Record<PermissionCategory, PermissionDefinition[]>
);

// Zod Validation Schemas
export const adminPermissionKeySchema = z.enum(CANONICAL_PERMISSIONS);

export const adminPermissionsArraySchema = z
  .array(adminPermissionKeySchema)
  .transform((keys) => Array.from(new Set(keys)).sort());

export const adminCreationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email address format.'),
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(100, 'Full name cannot exceed 100 characters.'),
  permissions: adminPermissionsArraySchema,
});

export const adminPermissionsUpdateSchema = z.object({
  adminId: z.string().uuid('Invalid administrator UUID format.'),
  permissions: adminPermissionsArraySchema,
});

export const adminStatusSchema = z.object({
  adminId: z.string().uuid('Invalid administrator UUID format.'),
  isActive: z.boolean(),
  reason: z
    .string()
    .trim()
    .min(3, 'A non-empty reason of at least 3 characters is mandatory.')
    .max(500, 'Reason cannot exceed 500 characters.'),
});

export const adminReassignSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon UUID format.'),
  newAdminId: z.string().uuid('Invalid target administrator UUID format.'),
  justification: z
    .string()
    .trim()
    .min(10, 'A meaningful justification of at least 10 characters is mandatory.')
    .max(500, 'Justification cannot exceed 500 characters.'),
});
