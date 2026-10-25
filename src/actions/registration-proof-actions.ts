'use server';

import { createClient } from '@/lib/supabase/server';
import { requireHackathonReviewScope } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';
import { MANDATORY_CDC_DECLARATION_TEXT } from '@/lib/validation/team-schemas';
import { getRegistrationProofPreviewUrlAction as getRegistrationProofPreviewUrlActionImpl } from './team-actions';

export interface SubmitRegistrationProofResult {
  success: boolean;
  external_status?: string;
  points_awarded?: boolean;
  error?: string;
}

/**
 * Submits external hackathon registration screenshot with mandatory CDC declaration.
 * Automatically awards initial registration participation points (+15 leader, +10 members)
 * and sets team status to 'submitted' without requiring manual admin approval.
 */
export async function submitRegistrationProofAction(
  teamId: string,
  proofPath: string,
  cdcAccepted: boolean,
  cdcText: string = MANDATORY_CDC_DECLARATION_TEXT
): Promise<SubmitRegistrationProofResult> {
  try {
    const supabase = await createClient();

    if (!teamId) {
      return { success: false, error: 'Team ID is required.' };
    }

    if (!proofPath || !proofPath.trim()) {
      return { success: false, error: 'Registration proof screenshot path is required.' };
    }

    if (!cdcAccepted) {
      return {
        success: false,
        error: 'Mandatory CDC declaration acceptance is required to submit registration proof.',
      };
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('submit_registration_proof', {
      p_team_id: teamId,
      p_proof_path: proofPath.trim(),
      p_cdc_declaration_accepted: cdcAccepted,
      p_cdc_declaration_text: cdcText,
    });

    if (rpcError) {
      return {
        success: false,
        error: rpcError.message,
      };
    }

    const result = rpcData as {
      success?: boolean;
      external_status?: string;
      points_awarded?: boolean;
    } | null;

    revalidatePath('/student/teams');
    revalidatePath('/student/hackathons');

    return {
      success: true,
      external_status: result?.external_status || 'submitted',
      points_awarded: result?.points_awarded ?? true,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to submit registration proof.',
    };
  }
}

/**
 * Evaluates round advancement claims (Round 2 and later).
 * Strictly requires authorized in-charge Admin, assigned reviewer, or Super Admin review.
 * Updates verified results, rank, and advancement points upon approval.
 */
export async function reviewRoundAdvancementAction(
  submissionId: string,
  decision: 'accepted' | 'rejected' | 'revision_requested',
  feedback?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    if (!submissionId) {
      return { success: false, error: 'Submission ID is required.' };
    }

    if (!['accepted', 'rejected', 'revision_requested'].includes(decision)) {
      return { success: false, error: `Invalid decision '${decision}'.` };
    }

    const supabase = await createClient();

    // Verify submission existence and find hackathon_id for scoped review check
    const { data: sub, error: subErr } = await supabase
      .from('submissions')
      .select('id, hackathon_id')
      .eq('id', submissionId)
      .single();

    if (subErr || !sub) {
      return { success: false, error: 'Submission not found.' };
    }

    await requireHackathonReviewScope(sub.hackathon_id);

    const { data: rpcData, error: rpcError } = await supabase.rpc('review_round_advancement', {
      p_submission_id: submissionId,
      p_decision: decision,
      ...(feedback?.trim() ? { p_feedback: feedback.trim() } : {}),
    });

    if (rpcError) {
      return {
        success: false,
        error: rpcError.message,
      };
    }

    revalidatePath(`/admin/hackathons/${sub.hackathon_id}/submissions`);
    revalidatePath('/admin/hackathons');

    return {
      success: true,
      message: `Round advancement claim successfully marked as ${decision}.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to review round advancement claim.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return {
      success: false,
      error: message,
    };
  }
}

// getRegistrationProofPreviewUrlAction used to be duplicated here and in
// team-actions.ts with identical logic. team-actions.ts is now the single
// implementation. A bare `export { ... } from './team-actions'` is not
// usable here: Next.js's server-action build step requires each exported
// action to be a function physically defined in a 'use server' module, so
// this thin wrapper delegates instead of re-exporting, keeping
// registration-proof-modal.tsx's existing import path unchanged with no
// duplicated logic.
export async function getRegistrationProofPreviewUrlAction(
  teamId: string
): Promise<Awaited<ReturnType<typeof getRegistrationProofPreviewUrlActionImpl>>> {
  return getRegistrationProofPreviewUrlActionImpl(teamId);
}
