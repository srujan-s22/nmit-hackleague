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
