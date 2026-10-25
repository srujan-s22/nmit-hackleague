// Canonical export dataset catalog: the single definition shared by the reports
// UI, the export request validation, the generators (sheet / file names, column
// order) and the tests. Row keys match the jsonb keys returned by the
// export_dataset_page RPC (supabase/migrations/20261031000001_reports_export_hub.sql).
//
// This file is imported by client components: keep it free of server-only code.

export type DatasetGroup = 'people' | 'events' | 'results' | 'submissions' | 'advanced';

export interface DatasetColumn {
  key: string;
  label: string;
  /** Personal data: only present for callers allowed to view student data. */
  restricted?: boolean;
}

/** Capability flag (from get_export_capabilities) required for an advanced dataset. */
export type AdvancedCapability =
  | 'can_export_audit_logs'
  | 'can_export_profile_changes'
  | 'can_export_storage_queue';

export interface DatasetDefinition {
  id: string;
  label: string;
  /** Worksheet name (Excel limit: 31 chars, no \ / ? * : [ ]). */
  sheetName: string;
  /** Base name of the CSV file inside a ZIP and of single-CSV downloads. */
  fileName: string;
  group: DatasetGroup;
  description: string;
  requires?: AdvancedCapability;
  columns: DatasetColumn[];
}

export const CORE_DATASETS = [
  {
    id: 'students',
    label: 'Students',
    sheetName: 'Students',
    fileName: 'students',
    group: 'people',
    description: 'Student roster with USN, branch, year and verification status.',
    columns: [
      { key: 'full_name', label: 'Full Name' },
      { key: 'usn', label: 'USN' },
      { key: 'email', label: 'Email', restricted: true },
      { key: 'phone', label: 'Phone', restricted: true },
      { key: 'branch', label: 'Branch' },
      { key: 'academic_year', label: 'Academic Year' },
      { key: 'registration_status', label: 'Verification Status' },
      { key: 'created_at', label: 'Registered At' },
      { key: 'id', label: 'Student ID' },
    ],
  },
  {
    id: 'team_members',
    label: 'Team Members',
    sheetName: 'Team Members',
    fileName: 'team_members',
    group: 'people',
    description: 'Who belongs to which team, with role and join time.',
    columns: [
      { key: 'student_name', label: 'Student' },
      { key: 'usn', label: 'USN' },
      { key: 'branch', label: 'Branch' },
      { key: 'team_name', label: 'Team' },
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'role', label: 'Role' },
      { key: 'joined_at', label: 'Joined At' },
      { key: 'member_id', label: 'Member ID' },
      { key: 'student_id', label: 'Student ID' },
      { key: 'team_id', label: 'Team ID' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
    ],
  },
  {
    id: 'hackathons',
    label: 'Hackathons',
    sheetName: 'Hackathons',
    fileName: 'hackathons',
    group: 'events',
    description: 'Event configuration, schedule, deadlines and team size limits.',
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'status', label: 'Status' },
      { key: 'mode', label: 'Mode' },
      { key: 'organizer', label: 'Organizer' },
      { key: 'registration_start_at', label: 'Registration Opens' },
      { key: 'registration_end_at', label: 'Registration Closes' },
      { key: 'event_start_at', label: 'Event Starts' },
      { key: 'event_end_at', label: 'Event Ends' },
      { key: 'min_team_size', label: 'Min Team Size' },
      { key: 'max_team_size', label: 'Max Team Size' },
      { key: 'is_solo_allowed', label: 'Solo Allowed' },
      { key: 'slug', label: 'Slug' },
      { key: 'created_at', label: 'Created At' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
    ],
  },
  {
    id: 'teams',
    label: 'Teams',
    sheetName: 'Teams',
    fileName: 'teams',
    group: 'events',
    description: 'Teams with leader, size and internal / external status.',
    columns: [
      { key: 'team_name', label: 'Team' },
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'leader_name', label: 'Leader' },
      { key: 'leader_usn', label: 'Leader USN' },
      { key: 'member_count', label: 'Members' },
      { key: 'internal_status', label: 'Internal Status' },
      { key: 'external_status', label: 'Registration Status' },
      { key: 'created_at', label: 'Created At' },
      { key: 'team_id', label: 'Team ID' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
      { key: 'leader_id', label: 'Leader ID' },
    ],
  },
  {
    id: 'registrations',
    label: 'Registrations',
    sheetName: 'Registrations',
    fileName: 'registrations',
    group: 'events',
    description: 'External registration claims, review outcome and CDC declaration.',
    columns: [
      { key: 'team_name', label: 'Team' },
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'leader_name', label: 'Leader' },
      { key: 'leader_usn', label: 'Leader USN' },
      { key: 'registration_status', label: 'Registration Status' },
      { key: 'proof_on_file', label: 'Proof On File' },
      { key: 'proof_submitted_at', label: 'Proof Submitted At' },
      { key: 'proof_reviewed_by', label: 'Proof Reviewed By' },
      { key: 'proof_reviewed_at', label: 'Proof Reviewed At' },
      { key: 'cdc_declaration_accepted', label: 'CDC Declaration Accepted' },
      { key: 'cdc_declaration_accepted_at', label: 'CDC Accepted At' },
      { key: 'cdc_declaration_version', label: 'CDC Version' },
      { key: 'created_at', label: 'Team Created At' },
      { key: 'team_id', label: 'Team ID' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
    ],
  },
  {
    id: 'round_results',
    label: 'Round Results',
    sheetName: 'Round Results',
    fileName: 'round_results',
    group: 'results',
    description: 'Round qualification and placement results per team.',
    columns: [
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'round_number', label: 'Round No.' },
      { key: 'round_name', label: 'Round' },
      { key: 'team_name', label: 'Team' },
      { key: 'leader_name', label: 'Leader' },
      { key: 'leader_usn', label: 'Leader USN' },
      { key: 'milestone_type', label: 'Milestone' },
      { key: 'placement', label: 'Placement' },
      { key: 'is_published', label: 'Published' },
      { key: 'notes', label: 'Notes' },
      { key: 'verified_by', label: 'Verified By' },
      { key: 'verified_at', label: 'Verified At' },
      { key: 'created_at', label: 'Created At' },
      { key: 'result_id', label: 'Result ID' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
      { key: 'round_id', label: 'Round ID' },
      { key: 'team_id', label: 'Team ID' },
    ],
  },
  {
    id: 'winners',
    label: 'Winners',
    sheetName: 'Winners',
    fileName: 'winners',
    group: 'results',
    description: 'Final podium placements and winning teams.',
    columns: [
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'placement', label: 'Placement' },
      { key: 'team_name', label: 'Team' },
      { key: 'leader_name', label: 'Leader' },
      { key: 'leader_usn', label: 'Leader USN' },
      { key: 'round_name', label: 'Round' },
      { key: 'is_published', label: 'Published' },
      { key: 'notes', label: 'Citation / Notes' },
      { key: 'verified_by', label: 'Verified By' },
      { key: 'verified_at', label: 'Verified At' },
      { key: 'created_at', label: 'Awarded At' },
      { key: 'result_id', label: 'Result ID' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
      { key: 'team_id', label: 'Team ID' },
    ],
  },
  {
    id: 'points',
    label: 'Points Ledger',
    sheetName: 'Points Ledger',
    fileName: 'points_ledger',
    group: 'results',
    description: 'Every points transaction: awards, adjustments and reversals.',
    columns: [
      { key: 'student_name', label: 'Student' },
      { key: 'usn', label: 'USN' },
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'team_name', label: 'Team' },
      { key: 'round_name', label: 'Round' },
      { key: 'milestone_type', label: 'Transaction Type' },
      { key: 'role_at_award', label: 'Role at Award' },
      { key: 'points', label: 'Points' },
      { key: 'reason', label: 'Reason' },
      { key: 'awarded_by', label: 'Awarded By' },
      { key: 'created_at', label: 'Awarded At' },
      { key: 'transaction_id', label: 'Transaction ID' },
      { key: 'student_id', label: 'Student ID' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
      { key: 'team_id', label: 'Team ID' },
      { key: 'round_id', label: 'Round ID' },
      { key: 'reversal_of_id', label: 'Reverses Transaction ID' },
    ],
  },
  {
    id: 'hackathon_summary',
    label: 'Hackathon Summary',
    sheetName: 'Hackathon Summary',
    fileName: 'hackathon_summary',
    group: 'results',
    description: 'One row per event: teams, participants, submissions, winners, points.',
    columns: [
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'status', label: 'Status' },
      { key: 'organizer', label: 'Organizer' },
      { key: 'event_start_at', label: 'Event Starts' },
      { key: 'event_end_at', label: 'Event Ends' },
      { key: 'total_teams', label: 'Teams' },
      { key: 'verified_registrations', label: 'Verified Registrations' },
      { key: 'total_participants', label: 'Participants' },
      { key: 'total_submissions', label: 'Submissions' },
      { key: 'total_reviews', label: 'Reviews' },
      { key: 'total_winners', label: 'Winners' },
      { key: 'net_points_awarded', label: 'Net Points Awarded' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
    ],
  },
  {
    id: 'submissions',
    label: 'Submissions',
    sheetName: 'Submissions',
    fileName: 'submissions',
    group: 'submissions',
    description: 'Round submissions with links, review status and evidence integrity hash.',
    columns: [
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'round_number', label: 'Round No.' },
      { key: 'round_name', label: 'Round' },
      { key: 'team_name', label: 'Team' },
      { key: 'submitted_by', label: 'Submitted By' },
      { key: 'submitted_by_usn', label: 'Submitter USN' },
      { key: 'title', label: 'Title' },
      { key: 'description', label: 'Description' },
      { key: 'repo_url', label: 'Repository URL' },
      { key: 'demo_url', label: 'Demo URL' },
      { key: 'review_status', label: 'Review Status' },
      { key: 'version', label: 'Version' },
      { key: 'is_current', label: 'Current Version' },
      { key: 'evidence_on_file', label: 'Evidence On File' },
      { key: 'evidence_sha256', label: 'Evidence SHA-256' },
      { key: 'created_at', label: 'Submitted At' },
      { key: 'updated_at', label: 'Updated At' },
      { key: 'submission_id', label: 'Submission ID' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
      { key: 'round_id', label: 'Round ID' },
      { key: 'team_id', label: 'Team ID' },
    ],
  },
  {
    id: 'reviews',
    label: 'Reviews',
    sheetName: 'Reviews',
    fileName: 'reviews',
    group: 'submissions',
    description: 'Reviewer decisions, scores and feedback on submissions.',
    columns: [
      { key: 'hackathon_title', label: 'Hackathon' },
      { key: 'round_number', label: 'Round No.' },
      { key: 'round_name', label: 'Round' },
      { key: 'team_name', label: 'Team' },
      { key: 'submission_title', label: 'Submission' },
      { key: 'reviewer_name', label: 'Reviewer' },
      { key: 'decision', label: 'Decision' },
      { key: 'score', label: 'Score' },
      { key: 'feedback', label: 'Feedback' },
      { key: 'reviewed_at', label: 'Reviewed At' },
      { key: 'review_id', label: 'Review ID' },
      { key: 'submission_id', label: 'Submission ID' },
      { key: 'hackathon_id', label: 'Hackathon ID' },
      { key: 'team_id', label: 'Team ID' },
    ],
  },
] as const satisfies readonly DatasetDefinition[];

export const ADVANCED_DATASETS = [
  {
    id: 'audit_logs',
    label: 'Audit Logs',
    sheetName: 'Audit Logs',
    fileName: 'audit_logs',
    group: 'advanced',
    description: 'Security and administrative audit trail.',
    requires: 'can_export_audit_logs',
    columns: [
      { key: 'created_at', label: 'Timestamp' },
      { key: 'actor_name', label: 'Actor' },
      { key: 'actor_role', label: 'Role' },
      { key: 'action', label: 'Action' },
      { key: 'target_type', label: 'Target Type' },
      { key: 'target_id', label: 'Target ID' },
      { key: 'details', label: 'Details' },
      { key: 'log_id', label: 'Log ID' },
      { key: 'actor_id', label: 'Actor ID' },
    ],
  },
  {
    id: 'profile_change_requests',
    label: 'Profile Changes',
    sheetName: 'Profile Changes',
    fileName: 'profile_changes',
    group: 'advanced',
    description: 'Student profile correction requests and their decisions.',
    requires: 'can_export_profile_changes',
    columns: [
      { key: 'student_name', label: 'Student' },
      { key: 'usn', label: 'USN' },
      { key: 'field_name', label: 'Field' },
      { key: 'old_value', label: 'Old Value' },
      { key: 'new_value', label: 'New Value' },
      { key: 'reason', label: 'Student Reason' },
      { key: 'status', label: 'Status' },
      { key: 'reviewed_by', label: 'Reviewed By' },
      { key: 'reviewed_at', label: 'Reviewed At' },
      { key: 'rejection_reason', label: 'Rejection Reason' },
      { key: 'created_at', label: 'Submitted At' },
      { key: 'request_id', label: 'Request ID' },
      { key: 'student_id', label: 'Student ID' },
    ],
  },
  {
    id: 'storage_objects',
    label: 'Storage Retention Queue',
    sheetName: 'Storage Retention',
    fileName: 'storage_retention_queue',
    group: 'advanced',
    description: 'Scheduled deletions and retention outcomes (Super Admin only).',
    requires: 'can_export_storage_queue',
    columns: [
      { key: 'bucket_id', label: 'Bucket' },
      { key: 'target_type', label: 'Target Type' },
      { key: 'target_id', label: 'Target ID' },
      { key: 'event_id', label: 'Event ID' },
      { key: 'status', label: 'Status' },
      { key: 'deletion_outcome', label: 'Outcome' },
      { key: 'retention_deadline_at', label: 'Retention Deadline' },
      { key: 'created_at', label: 'Queued At' },
      { key: 'completed_at', label: 'Processed At' },
      { key: 'job_id', label: 'Job ID' },
    ],
  },
] as const satisfies readonly DatasetDefinition[];

export type CoreDatasetId = (typeof CORE_DATASETS)[number]['id'];
export type AdvancedDatasetId = (typeof ADVANCED_DATASETS)[number]['id'];
export type DatasetId = CoreDatasetId | AdvancedDatasetId;

export const CORE_DATASET_IDS: readonly CoreDatasetId[] = CORE_DATASETS.map((d) => d.id);
export const ADVANCED_DATASET_IDS: readonly AdvancedDatasetId[] = ADVANCED_DATASETS.map((d) => d.id);
export const ALL_DATASET_IDS: readonly DatasetId[] = [...CORE_DATASET_IDS, ...ADVANCED_DATASET_IDS];

const BY_ID = new Map<string, DatasetDefinition>(
  [...CORE_DATASETS, ...ADVANCED_DATASETS].map((d) => [d.id, d as DatasetDefinition])
);

export function getDatasetDefinition(id: string): DatasetDefinition | undefined {
  return BY_ID.get(id);
}

/** Column list for a dataset, with personal-data columns removed unless permitted. */
export function getDatasetColumns(id: string, canViewPersonalData: boolean): DatasetColumn[] {
  const def = BY_ID.get(id);
  if (!def) return [];
  return def.columns.filter((c) => canViewPersonalData || !c.restricted);
}

export const DATASET_GROUP_LABELS: Record<Exclude<DatasetGroup, 'advanced'>, string> = {
  people: 'People',
  events: 'Events & Teams',
  results: 'Results & Points',
  submissions: 'Submissions & Reviews',
};

export type ExportFormat = 'xlsx' | 'zip' | 'csv';

export const EXPORT_FORMAT_OPTIONS: { id: ExportFormat; label: string; description: string }[] = [
  { id: 'xlsx', label: 'Excel workbook', description: 'One sheet per dataset (.xlsx)' },
  { id: 'zip', label: 'ZIP of CSV files', description: 'One CSV file per dataset (.zip)' },
  { id: 'csv', label: 'Single CSV', description: 'One dataset only (.csv)' },
];

/** Capability flags returned by get_export_capabilities. */
export interface ExportCapabilities {
  is_super_admin: boolean;
  can_export: boolean;
  can_view_personal_data: boolean;
  can_export_audit_logs: boolean;
  can_export_profile_changes: boolean;
  can_export_storage_queue: boolean;
  can_export_global: boolean;
}

export function datasetAllowed(id: string, caps: ExportCapabilities): boolean {
  const def = BY_ID.get(id);
  if (!def) return false;
  return !def.requires || caps[def.requires] === true;
}
