'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { getSignedPreviewUrl } from '@/lib/storage/upload-service';
import type { ActionResult } from '@/actions/auth-actions';
import type { Database } from '@/types/database';
import { revalidatePath } from 'next/cache';

type StudentProfile = Database['public']['Tables']['profiles']['Row'];

/**
 * Fetch list of students pending administrative verification
 */
export async function fetchPendingVerificationsAction(): Promise<
  ActionResult<StudentProfile[]>
> {
  await requireAdmin('verify_students');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('registration_status', ['under_review', 'pending_verification'])
    .order('created_at', { ascending: true });

  if (error) {
    return {
      success: false,
      error: `Failed to load verification queue: ${error.message}`,
    };
  }

  return {
    success: true,
    data: data || [],
  };
}

/**
 * Generate short-lived signed preview URL (60s) for an administrator reviewing a student ID
 */
export async function getAdminCollegeIdPreviewUrlAction(
  studentId: string
): Promise<ActionResult<{ url: string }>> {
  await requireAdmin('verify_students');
  const supabase = await createClient();

  // Rate limit admin view actions
  const { data: allowedRateLimit, error: rateError } = await supabase.rpc(
    'consume_rate_limit' as never,
    { p_action: 'view_college_id', p_custom_key: null } as never
  );

  if (rateError || !allowedRateLimit) {
    return {
      success: false,
      error: 'Rate limit exceeded: too many preview requests. Please wait.',
    };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('college_id_path')
    .eq('id', studentId)
    .single();

  if (error || !profile?.college_id_path) {
    return {
      success: false,
      error: 'Student College ID document path not found.',
    };
  }

  const signedResult = await getSignedPreviewUrl('college-ids', profile.college_id_path, 60);
  if (!signedResult.success || !signedResult.url) {
    return {
      success: false,
      error: signedResult.error || 'Failed to generate signed preview URL.',
    };
  }

  return {
    success: true,
    data: { url: signedResult.url },
  };
}

/**
 * Submit Administrative Review Decision
 * Calls PostgreSQL public.review_student_registration RPC atomically
 */
export async function reviewStudentAction(
  studentId: string,
  decision: 'approved' | 'rejected' | 'correction_required',
  rejectionReason?: string
): Promise<ActionResult> {
  await requireAdmin('verify_students');
  const supabase = await createClient();

  if ((decision === 'rejected' || decision === 'correction_required') && !rejectionReason?.trim()) {
    return {
      success: false,
      error: 'A non-empty reason is required when rejecting or requesting correction.',
    };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'review_student_registration' as never,
    {
      p_student_id: studentId,
      p_decision: decision,
      p_rejection_reason: rejectionReason?.trim() || null,
    } as never
  );

  if (rpcError) {
    return {
      success: false,
      error: `Review operation failed: ${rpcError.message}`,
    };
  }

  const result = rpcData as { success?: boolean; error?: string } | null;
  if (result && !result.success) {
    return {
      success: false,
      error: result.error || 'Failed to execute review decision.',
    };
  }

  revalidatePath('/admin/verifications');

  return {
    success: true,
    message: `Student registration successfully updated to ${decision}.`,
  };
}
