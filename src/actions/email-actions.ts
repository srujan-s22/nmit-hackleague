'use server';

import { sendTransactionalEmail, type EmailDeliveryResult } from '@/lib/email/resend-service';
import { requireAdmin } from '@/lib/auth/guards';

/**
 * Dispatches a profile change request decision notification to a student.
 */
export async function sendProfileDecisionEmailAction(
  recipientEmail: string,
  studentName: string,
  fieldName: string,
  status: 'approved' | 'rejected',
  reviewerNotes?: string
): Promise<EmailDeliveryResult> {
  try {
    await requireAdmin('manage_students');

    const idempotencyKey = `profile_decision_${recipientEmail}_${fieldName}_${status}_${Date.now()}`;

    return await sendTransactionalEmail({
      to: recipientEmail,
      subject: `NMIT HackLeague: Profile Change Request ${status === 'approved' ? 'Approved' : 'Declined'}`,
      template: 'profile_change_decision',
      variables: {
        name: studentName,
        fieldName,
        status,
        reviewerNotes: reviewerNotes || '',
      },
      idempotencyKey,
    });
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to dispatch decision email.',
    };
  }
}

/**
 * Dispatches a team invitation notification email to a student.
 */
export async function sendTeamInvitationEmailAction(
  recipientEmail: string,
  inviterName: string,
  teamName: string,
  hackathonTitle: string,
  inviteCode: string
): Promise<EmailDeliveryResult> {
  try {
    const idempotencyKey = `team_invite_${teamName}_${recipientEmail}_${inviteCode}`;

    return await sendTransactionalEmail({
      to: recipientEmail,
      subject: `You have been invited to join team "${teamName}" for ${hackathonTitle}`,
      template: 'team_invitation',
      variables: {
        inviterName,
        teamName,
        hackathonTitle,
        inviteCode,
      },
      idempotencyKey,
    });
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to dispatch invitation email.',
    };
  }
}
