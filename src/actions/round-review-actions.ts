'use server';

import { createClient } from '@/lib/supabase/server';
import { requireHackathonReviewScope } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';
import {
  reviewRoundSubmissionSchema,
  reopenSubmissionSchema,
  recordWinnerPlacementSchema,
} from '@/lib/validation/submission-schemas';

export interface ReviewRoundActionResult {
  success: boolean;
  decision?: string;
  feedback?: string;
  error?: string;
}

export interface ReopenActionResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface WinnerPlacementActionResult {
  success: boolean;
  placement?: number;
  error?: string;
}

/**
 * Reviews a round milestone submission.
 * Strictly checks reviewer assignment to hackathon via requireHackathonReviewScope.
 * Enforces feedback rules (>=10 chars for rejected/revision_requested).
 */
export async function reviewRoundSubmissionAction(
  submissionId: string,
  decision: 'accepted' | 'rejected' | 'revision_requested',
  feedback?: string
): Promise<ReviewRoundActionResult> {
  try {
    const supabase = await createClient();

    // Verify submission existence and find hackathon_id
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('id, hackathon_id, round_id, status, is_current')
      .eq('id', submissionId)
      .single();

    if (subErr || !sub) {
      return { success: false, error: 'Submission not found.' };
    }

    // Require hackathon-scoped reviewer permission
    await requireHackathonReviewScope(sub.hackathon_id);

    // Validate schema
    const validation = reviewRoundSubmissionSchema.safeParse({
      submissionId,
      decision,
      feedback: feedback ? feedback.trim() : undefined,
    });

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return {
        success: false,
        error: firstIssue ? firstIssue.message : 'Validation failed.',
      };
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('review_round_submission', {
      p_submission_id: submissionId,
      p_decision: decision,
      p_feedback: feedback ? feedback.trim() : undefined,
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
      };
    }

    revalidatePath(`/admin/hackathons/${sub.hackathon_id}/submissions`);
    revalidatePath(`/admin/hackathons/${sub.hackathon_id}`);

    return {
      success: true,
      decision,
      feedback: feedback?.trim(),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record review.',
    };
  }
}

/**
 * Explicitly reopens a terminal rejected submission with required audit justification.
 * Sets status to 'revision_requested' allowing the team to submit a new version.
 */
export async function reopenRejectedSubmissionAction(
  submissionId: string,
  reason: string
): Promise<ReopenActionResult> {
  try {
    const supabase = await createClient();

    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('id, hackathon_id, status')
      .eq('id', submissionId)
      .single();

    if (subErr || !sub) {
      return { success: false, error: 'Submission not found.' };
    }

    // Require hackathon-scoped reviewer permission
    await requireHackathonReviewScope(sub.hackathon_id);

    const validation = reopenSubmissionSchema.safeParse({
      submissionId,
      reason,
    });

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return {
        success: false,
        error: firstIssue ? firstIssue.message : 'Validation failed.',
      };
    }

    const { error: rpcErr } = await supabase.rpc('reopen_rejected_submission', {
      p_submission_id: submissionId,
      p_reason: reason.trim(),
      p_target_status: 'revision_requested',
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
      };
    }

    revalidatePath(`/admin/hackathons/${sub.hackathon_id}/submissions`);

    return {
      success: true,
      message: 'Submission reopened successfully. Team can now submit a revision.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to reopen submission.',
    };
  }
}

/**
 * Records verified round winner placement (1st, 2nd, 3rd) in public.results.
 */
export async function recordRoundWinnerPlacementAction(
  submissionId: string,
  placement: 1 | 2 | 3
): Promise<WinnerPlacementActionResult> {
  try {
    const supabase = await createClient();

    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('id, hackathon_id')
      .eq('id', submissionId)
      .single();

    if (subErr || !sub) {
      return { success: false, error: 'Submission not found.' };
    }

    await requireHackathonReviewScope(sub.hackathon_id);

    const validation = recordWinnerPlacementSchema.safeParse({
      submissionId,
      placement,
    });

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      return {
        success: false,
        error: firstIssue ? firstIssue.message : 'Validation failed.',
      };
    }

    const { error: rpcErr } = await supabase.rpc('record_round_winner_placement', {
      p_submission_id: submissionId,
      p_placement: String(placement),
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
      };
    }

    revalidatePath(`/admin/hackathons/${sub.hackathon_id}/submissions`);
    revalidatePath(`/admin/hackathons/${sub.hackathon_id}/results`);

    return {
      success: true,
      placement,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to record winner placement.',
    };
  }
}
