'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  createTeamSchema,
  joinTeamSchema,
  leaveTeamSchema,
  removeTeamMemberSchema,
  regenerateInvitationCodeSchema,
  lockTeamRosterSchema,
  transferLeadershipSchema,
  MANDATORY_CDC_DECLARATION_TEXT,
} from '@/lib/validation/team-schemas';
import {
  uploadRegistrationProofScreenshot,
  type UploadRegistrationProofResult,
} from '@/lib/storage/registration-proof-service';
import {
  getStudentTeams,
  getTeamDetails,
  getRegistrationProofPreviewUrl,
  type StudentTeamSummary,
  type TeamDetails,
} from '@/lib/teams/queries';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Creates a new team for a hackathon.
 * The authenticated student automatically becomes the team leader.
 */
export async function createTeamAction(
  hackathonId: string,
  teamName: string
): Promise<ActionResult<{ teamId: string }>> {
  try {
    const parsed = createTeamSchema.safeParse({ hackathonId, name: teamName });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid team creation parameters.',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required to create a team.' };
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_team', {
      p_hackathon_id: parsed.data.hackathonId,
      p_team_name: parsed.data.name,
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
        code: rpcErr.code,
      };
    }

    const teamId =
      typeof rpcData === 'string'
        ? rpcData
        : (rpcData as { team_id?: string } | null)?.team_id || '';

    revalidatePath('/student/teams');
    revalidatePath('/student/hackathons');

    return {
      success: true,
      data: { teamId },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create team.',
    };
  }
}

/**
 * Joins an existing forming team using a team invitation code.
 */
export async function joinTeamWithCodeAction(
  invitationCode: string
): Promise<ActionResult<{ teamId: string }>> {
  try {
    const parsed = joinTeamSchema.safeParse({ invitationCode });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid invitation code format.',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required to join a team.' };
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('join_team_with_code', {
      p_invitation_code: parsed.data.invitationCode,
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
        code: rpcErr.code,
      };
    }

    const teamId =
      typeof rpcData === 'string'
        ? rpcData
        : (rpcData as { team_id?: string } | null)?.team_id || '';

    revalidatePath('/student/teams');
    revalidatePath('/student/hackathons');

    return {
      success: true,
      data: { teamId },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to join team.',
    };
  }
}

/**
 * Leaves a team or disbands it if the caller is the last member or solo leader.
 */
export async function leaveTeamAction(
  teamId: string
): Promise<ActionResult<{ disbanded: boolean; message: string }>> {
  try {
    const parsed = leaveTeamSchema.safeParse({ teamId });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid team ID format.',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required to leave team.' };
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc('leave_team', {
      p_team_id: parsed.data.teamId,
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
        code: rpcErr.code,
      };
    }

    const result = rpcData as { disbanded?: boolean } | null;
    const disbanded = Boolean(result?.disbanded);

    revalidatePath('/student/teams');
    revalidatePath('/student/hackathons');

    return {
      success: true,
      data: {
        disbanded,
        message: disbanded
          ? 'Team was successfully disbanded.'
          : 'You have left the team.',
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to leave team.',
    };
  }
}

/**
 * Removes a team member. Only the team leader can remove unconfirmed members
 * during the forming phase before registration proof is submitted.
 */
export async function removeTeamMemberAction(
  teamId: string,
  studentId: string
): Promise<ActionResult<{ message: string }>> {
  try {
    const parsed = removeTeamMemberSchema.safeParse({ teamId, studentId });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid team or student ID format.',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required to remove member.' };
    }

    const { error: rpcErr } = await supabase.rpc('remove_team_member', {
      p_team_id: parsed.data.teamId,
      p_student_id: parsed.data.studentId,
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
        code: rpcErr.code,
      };
    }

    revalidatePath('/student/teams');
    revalidatePath(`/student/teams/${parsed.data.teamId}`);

    return {
      success: true,
      data: { message: 'Team member removed successfully.' },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove member.',
    };
  }
}

/**
 * Regenerates the team invitation code (6 characters).
 * Strictly limited to the team leader during the forming phase.
 */
export async function regenerateInvitationCodeAction(
  teamId: string
): Promise<ActionResult<{ invitationCode: string }>> {
  try {
    const parsed = regenerateInvitationCodeSchema.safeParse({ teamId });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid team ID format.',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { data: rpcData, error: rpcErr } = await supabase.rpc(
      'regenerate_team_invitation_code',
      {
        p_team_id: parsed.data.teamId,
      }
    );

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
        code: rpcErr.code,
      };
    }

    const result = rpcData as { invitation_code?: string } | string | null;
    const newCode =
      typeof result === 'string'
        ? result
        : result?.invitation_code || '';

    revalidatePath('/student/teams');
    revalidatePath(`/student/teams/${parsed.data.teamId}`);

    return {
      success: true,
      data: { invitationCode: newCode },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to regenerate invitation code.',
    };
  }
}

/**
 * Locks the team roster, finalizing membership and setting internal_status to 'complete'.
 * Strictly limited to the team leader before the registration deadline.
 */
export async function lockTeamRosterAction(
  teamId: string
): Promise<ActionResult<{ message: string }>> {
  try {
    const parsed = lockTeamRosterSchema.safeParse({ teamId });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid team ID format.',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { error: rpcErr } = await supabase.rpc('lock_team_roster', {
      p_team_id: parsed.data.teamId,
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
        code: rpcErr.code,
      };
    }

    revalidatePath('/student/teams');
    revalidatePath(`/student/teams/${parsed.data.teamId}`);

    return {
      success: true,
      data: { message: 'Team roster has been locked successfully.' },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to lock team roster.',
    };
  }
}

/**
 * Transfers team leadership to another active team member.
 * Strictly limited to current leader or authorized admin.
 */
export async function transferTeamLeadershipAction(
  teamId: string,
  newLeaderId: string
): Promise<ActionResult<{ message: string }>> {
  try {
    const parsed = transferLeadershipSchema.safeParse({ teamId, newLeaderId });
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid parameters for leadership transfer.',
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return { success: false, error: 'Authentication required.' };
    }

    const { error: rpcErr } = await supabase.rpc('transfer_team_leadership', {
      p_team_id: parsed.data.teamId,
      p_new_leader_id: parsed.data.newLeaderId,
    });

    if (rpcErr) {
      return {
        success: false,
        error: rpcErr.message,
        code: rpcErr.code,
      };
    }

    revalidatePath('/student/teams');
    revalidatePath(`/student/teams/${parsed.data.teamId}`);

    return {
      success: true,
      data: { message: 'Team leadership transferred successfully.' },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to transfer leadership.',
    };
  }
}

/**
 * Server Action for registration-proof screenshot upload and submission.
 * Enforces preflight authorization gate, binary validation, service storage write,
 * user-scoped database RPC, and three-tier orphan recovery.
 */
export async function uploadRegistrationProofAction(
  teamId: string,
  formData: FormData
): Promise<UploadRegistrationProofResult> {
  try {
    const file = formData.get('file');
    const cdcAcceptedRaw = formData.get('cdcAccepted');
    const cdcDeclarationText =
      (formData.get('cdcDeclarationText') as string) || MANDATORY_CDC_DECLARATION_TEXT;

    const cdcAccepted = cdcAcceptedRaw === 'true' || cdcAcceptedRaw === 'on' || cdcAcceptedRaw === '1';

    if (!file || !(file instanceof File || (typeof file === 'object' && 'arrayBuffer' in file))) {
      return {
        success: false,
        error: 'Please select a valid image file to upload.',
        cleanup_state: 'purged_immediately',
      };
    }

    const result = await uploadRegistrationProofScreenshot(
      teamId,
      file as File,
      cdcAccepted,
      cdcDeclarationText
    );

    if (result.success) {
      revalidatePath('/student/teams');
      revalidatePath(`/student/teams/${teamId}`);
      revalidatePath('/student/hackathons');
    }

    return result;
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to upload registration proof.',
      cleanup_state: 'purged_immediately',
    };
  }
}

/**
 * Fetches the signed-in student's teams.
 */
export async function getMyTeamsAction(
  hackathonId?: string
): Promise<ActionResult<StudentTeamSummary[]>> {
  try {
    const teams = await getStudentTeams(hackathonId);
    return { success: true, data: teams };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch teams.',
    };
  }
}

/**
 * Fetches full details for a team.
 */
export async function getTeamDetailsAction(
  teamId: string
): Promise<ActionResult<TeamDetails | null>> {
  try {
    const details = await getTeamDetails(teamId);
    return { success: true, data: details };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to fetch team details.',
    };
  }
}

/**
 * Generates a short-lived secure preview URL for registration proof screenshot.
 */
export async function getRegistrationProofPreviewUrlAction(
  teamId: string
): Promise<ActionResult<{ url: string }>> {
  try {
    const res = await getRegistrationProofPreviewUrl(teamId);
    if (!res.success || !res.url) {
      return { success: false, error: res.error || 'Failed to generate preview URL.' };
    }
    return { success: true, data: { url: res.url } };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to generate preview URL.',
    };
  }
}
