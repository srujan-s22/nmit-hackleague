export type MilestoneType =
  | 'participation'
  | 'round_qualification'
  | 'win_placement'
  | 'manual_adjustment'
  | 'reversal';

export interface LeaderboardEntry {
  student_id: string;
  full_name: string;
  branch: string;
  academic_year: number;
  total_points: number;
  verified_qualifications_count: number;
  rank: number;
}

export interface LedgerEntry {
  id: string;
  milestone_type: MilestoneType;
  points: number;
  reason: string;
  created_at: string;
  hackathon_id: string;
  hackathon_title: string | null;
  reversal_of_id: string | null;
  adjusted_entry_id: string | null;
}

export interface StudentPointsSummary {
  student_id: string;
  total_points: number;
  rank: number | null;
  verified_qualifications_count: number;
  submitted_claims_count: number;
  ledger_history: LedgerEntry[];
}

export interface PointConfiguration {
  id: string;
  milestone_type: string;
  regular_member_points: number;
  team_leader_points: number;
  is_active: boolean;
  updated_by?: string | null;
  updated_at?: string;
}

export interface LeaderboardFilters {
  academicYear?: number; // 1..4 (student study year)
  eventAcademicYear?: string; // e.g. "2025-2026"
  eventTerm?: 'odd_sem' | 'even_sem' | 'summer_term';
  limit?: number;
  offset?: number;
}

export interface AdjustPointsActionResult {
  success: boolean;
  ledgerId?: string;
  points?: number;
  idempotentReplay?: boolean;
  error?: string;
}

export interface ReversePointsActionResult {
  success: boolean;
  reversalLedgerId?: string;
  reversedPoints?: number;
  error?: string;
}

export interface UpdatePointConfigActionResult {
  success: boolean;
  config?: PointConfiguration;
  error?: string;
}

export interface SetAcademicPeriodActionResult {
  success: boolean;
  hackathonId?: string;
  academicYear?: string;
  academicTerm?: string;
  error?: string;
}
