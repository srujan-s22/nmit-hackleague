'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';
import {
  submitMilestoneSchema,
  resubmitMilestoneSchema,
} from '@/lib/validation/submission-schemas';
import {
  uploadAndRegisterRoundEvidence,
  purgeOrphanedRoundEvidence,
  createSignedEvidencePreviewUrl,
} from '@/lib/storage/round-evidence-service';

export interface SubmitMilestoneActionResult {
  success: boolean;
  submissionId?: string;
  version?: number;
  error?: string;
}

export interface GetSignedUrlActionResult {
  success: boolean;
  signedUrl?: string;
  error?: string;
}

/**
 * Submits initial round milestone submission (Version 1).
 * Strictly requires authorized team leader.
 */
export async function submitRoundMilestoneAction(
  formData: FormData
): Promise<SubmitMilestoneActionResult> {
  const adminClient = createAdminClient();
  let newlyUploadedPath: string | null = null;

  try {
    const { user } = await requireApprovedStudent();
    const supabase = await createClient();

    const hackathonId = formData.get('hackathonId')?.toString() || '';
    const roundId = formData.get('roundId')?.toString() || '';
    const teamId = formData.get('teamId')?.toString() || '';
    const title = formData.get('title')?.toString() || '';
    const description = formData.get('description')?.toString() || '';
    const githubUrl = formData.get('githubUrl')?.toString() || '';
    const liveDemoUrl = formData.get('liveDemoUrl')?.toString() || '';
    const evidenceFile = formData.get('evidenceFile') as File | null;

    // Verify caller is team leader
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, leader_id, hackathon_id')
      .eq('id', teamId)
      .single();

    if (teamErr || !team) {
      return { success: false, error: 'Team not found.' };
    }

    if (team.leader_id !== user.id) {
      return {
        success: false,
        error: 'Access denied: only the team leader can submit round milestones.',
      };
    }

    // Process file upload if provided
    let evidencePath: string | null = null;
    if (evidenceFile && evidenceFile.size > 0) {
      const arrayBuffer = await evidenceFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uploadResult = await uploadAndRegisterRoundEvidence(
        hackathonId,
        teamId,
        roundId,
        user.id,
        buffer,
        evidenceFile.name
      );
      if (!uploadResult.success || !uploadResult.path) {
        return {
          success: false,
          error: uploadResult.error || 'Failed to process evidence image upload.',
        };
      }
      evidencePath = uploadResult.path;
      newlyUploadedPath = uploadResult.path;
    }

    // Validate schema
    const validationResult = submitMilestoneSchema.safeParse({
      hackathonId,
      roundId,
      teamId,
      title,
      description,
      githubUrl: githubUrl || undefined,
      liveDemoUrl: liveDemoUrl || undefined,
      evidencePath: evidencePath || undefined,
    });

    if (!validationResult.success) {
      if (newlyUploadedPath) {
        await purgeOrphanedRoundEvidence(adminClient, newlyUploadedPath);
      }
      const firstIssue = validationResult.error.issues[0];
      return {
        success: false,
        error: firstIssue ? firstIssue.message : 'Validation failed.',
      };
    }

    const validData = validationResult.data;

    // Call transactional RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('submit_round_milestone', {
      p_round_id: validData.roundId,
      p_team_id: validData.teamId,
      p_title: validData.title,
      p_description: validData.description || undefined,
      p_repo_url: validData.githubUrl || undefined,
      p_demo_url: validData.liveDemoUrl || undefined,
      p_evidence_path: validData.evidencePath || undefined,
    });

    if (rpcErr) {
      if (newlyUploadedPath) {
        await purgeOrphanedRoundEvidence(adminClient, newlyUploadedPath);
      }
      return {
        success: false,
        error: rpcErr.message,
      };
    }

    const result = rpcData as {
      success?: boolean;
      submission_id?: string;
      version?: number;
    } | null;

    revalidatePath(`/student/teams/${teamId}`);
    revalidatePath(`/student/hackathons/${hackathonId}`);

    return {
      success: true,
      submissionId: result?.submission_id,
      version: result?.version || 1,
    };
  } catch (err: unknown) {
    if (newlyUploadedPath) {
      await purgeOrphanedRoundEvidence(adminClient, newlyUploadedPath);
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected submission error.',
    };
  }
}

/**
 * Resubmits a milestone revision after reviewer requested revisions.
 * Creates immutable new version.
 */
export async function resubmitRoundMilestoneAction(
  formData: FormData
): Promise<SubmitMilestoneActionResult> {
  const adminClient = createAdminClient();
  let newlyUploadedPath: string | null = null;

  try {
    const { user } = await requireApprovedStudent();
    const supabase = await createClient();

    const parentSubmissionId = formData.get('parentSubmissionId')?.toString() || '';
    const hackathonId = formData.get('hackathonId')?.toString() || '';
    const roundId = formData.get('roundId')?.toString() || '';
    const teamId = formData.get('teamId')?.toString() || '';
    const title = formData.get('title')?.toString() || '';
    const description = formData.get('description')?.toString() || '';
    const githubUrl = formData.get('githubUrl')?.toString() || '';
    const liveDemoUrl = formData.get('liveDemoUrl')?.toString() || '';
    const reusedEvidencePath = formData.get('reusedEvidencePath')?.toString() || '';
    const evidenceFile = formData.get('evidenceFile') as File | null;

    // Verify caller is team leader
    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .select('id, leader_id')
      .eq('id', teamId)
      .single();

    if (teamErr || !team) {
      return { success: false, error: 'Team not found.' };
    }

    if (team.leader_id !== user.id) {
      return {
        success: false,
        error: 'Access denied: only the team leader can submit round milestones.',
      };
    }

    let evidencePath: string | null = reusedEvidencePath || null;

    // If new file provided, upload and register
    if (evidenceFile && evidenceFile.size > 0) {
      const arrayBuffer = await evidenceFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const uploadResult = await uploadAndRegisterRoundEvidence(
        hackathonId,
        teamId,
        roundId,
        user.id,
        buffer,
        evidenceFile.name
      );
      if (!uploadResult.success || !uploadResult.path) {
        return {
          success: false,
          error: uploadResult.error || 'Failed to process evidence image upload.',
        };
      }
      evidencePath = uploadResult.path;
      newlyUploadedPath = uploadResult.path;
    }

    // Validate schema
    const validationResult = resubmitMilestoneSchema.safeParse({
      parentSubmissionId,
      hackathonId,
      roundId,
      teamId,
      title,
      description,
      githubUrl: githubUrl || undefined,
      liveDemoUrl: liveDemoUrl || undefined,
      evidencePath: evidencePath || undefined,
    });

    if (!validationResult.success) {
      if (newlyUploadedPath) {
        await purgeOrphanedRoundEvidence(adminClient, newlyUploadedPath);
      }
      const firstIssue = validationResult.error.issues[0];
      return {
        success: false,
        error: firstIssue ? firstIssue.message : 'Validation failed.',
      };
    }

    const validData = validationResult.data;

    // Call transactional RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('resubmit_round_milestone', {
      p_prior_submission_id: validData.parentSubmissionId,
      p_title: validData.title,
      p_description: validData.description || undefined,
      p_repo_url: validData.githubUrl || undefined,
      p_demo_url: validData.liveDemoUrl || undefined,
      p_evidence_path: validData.evidencePath || undefined,
    });

    if (rpcErr) {
      if (newlyUploadedPath) {
        await purgeOrphanedRoundEvidence(adminClient, newlyUploadedPath);
      }
      return {
        success: false,
        error: rpcErr.message,
      };
    }

    const result = rpcData as {
      success?: boolean;
      submission_id?: string;
      version?: number;
    } | null;

    revalidatePath(`/student/teams/${teamId}`);
    revalidatePath(`/student/hackathons/${hackathonId}`);

    return {
      success: true,
      submissionId: result?.submission_id,
      version: result?.version,
    };
  } catch (err: unknown) {
    if (newlyUploadedPath) {
      await purgeOrphanedRoundEvidence(adminClient, newlyUploadedPath);
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected resubmission error.',
    };
  }
}

/**
 * Generates short-lived private signed URL for evidence preview (300s = 5min).
 * Verifies caller has permission (team member of the submission or assigned admin).
 */
export async function getSignedEvidenceUrlAction(
  submissionId: string
): Promise<GetSignedUrlActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Authentication required.' };
    }

    // Look up submission
    const { data: submission, error: subErr } = await supabase
      .from('submissions')
      .select('id, team_id, hackathon_id, evidence_path')
      .eq('id', submissionId)
      .single();

    if (subErr || !submission || !submission.evidence_path) {
      return { success: false, error: 'Submission evidence not found.' };
    }

    // Check if user is a member of the team
    const { data: membership } = await supabase
      .from('team_members')
      .select('id')
      .eq('team_id', submission.team_id)
      .eq('student_id', user.id)
      .single();

    let hasAccess = Boolean(membership);

    // If not a team member, check if user is an authorized admin for the hackathon
    if (!hasAccess) {
      const { data: canManage } = await supabase.rpc('can_admin_manage_hackathon', {
        p_hackathon_id: submission.hackathon_id,
        p_permission_key: 'manage_hackathons',
      });
      if (canManage) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return { success: false, error: 'Access denied: not authorized to view evidence.' };
    }

    const signedUrl = await createSignedEvidencePreviewUrl(submission.evidence_path, 300);
    if (!signedUrl) {
      return { success: false, error: 'Failed to generate signed preview URL.' };
    }

    return { success: true, signedUrl };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to retrieve evidence URL.',
    };
  }
}
