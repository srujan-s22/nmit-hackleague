import type { Database } from './database';

export type RegistrationStatus =
  | 'draft'
  | 'pending_verification'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'correction_required'
  | 'suspended';

export type Gender = 'Male' | 'Female' | 'Other';

export type StudentProfile = Database['public']['Tables']['profiles']['Row'];
export type AdminProfile = Database['public']['Tables']['admin_profiles']['Row'];

export type RateLimitAction =
  | 'signup'
  | 'submit_review'
  | 'replace_id'
  | 'review_action'
  | 'view_college_id';

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  usn: string;
  phone: string;
  branch: string;
  academicYear: number;
  sex: Gender;
  dateOfBirth: string; // ISO date string YYYY-MM-DD
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface VerifyOtpInput {
  email: string;
  token: string;
  type?: 'signup' | 'email' | 'recovery';
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  password: string;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}
