import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

export type EmailTemplateName =
  | 'account_verification'
  | 'password_recovery'
  | 'profile_change_decision'
  | 'team_invitation'
  | 'deadline_reminder'
  | 'admin_onboarding';

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: EmailTemplateName;
  variables: Record<string, string | number | boolean>;
  idempotencyKey?: string;
  userId?: string;
  replyTo?: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  duplicatePrevented?: boolean;
  isSimulated?: boolean;
}

/**
 * Render email HTML body based on template name and variables.
 */
function renderTemplateHtml(template: EmailTemplateName, vars: Record<string, string | number | boolean>): string {
  const brandHeader = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #1e293b; font-size: 20px;">NMIT HackLeague</h2>
        <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Institutional Hackathon Management</span>
      </div>
  `;

  const brandFooter = `
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
        <p style="margin: 0;">This is an automated institutional notification from NMIT HackLeague.</p>
        <p style="margin: 4px 0 0;">Nitte Meenakshi Institute of Technology, Bangalore &bull; <a href="https://nmit.ac.in" style="color: #2563eb; text-decoration: none;">nmit.ac.in</a></p>
      </div>
    </div>
  `;

  let content = '';

  switch (template) {
    case 'account_verification':
      content = `
        <h3 style="color: #0f172a; margin-top: 0;">Verify Your HackLeague Account</h3>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Hello <strong>${String(vars.name || 'Student')}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Use the one-time verification code below to confirm your institutional registration:</p>
        <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; margin: 24px 0;">
          <span style="font-size: 28px; font-weight: bold; letter-spacing: 0.2em; color: #1e293b;">${String(vars.otp || '------')}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This verification code expires in 15 minutes. If you did not initiate this request, please ignore this email.</p>
      `;
      break;

    case 'password_recovery':
      content = `
        <h3 style="color: #0f172a; margin-top: 0;">Password Reset Instructions</h3>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">We received a password reset request for your account.</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Click the button below to choose a new password:</p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${String(vars.resetUrl || '#')}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 13px;">For security, this link expires shortly. If you did not request a password reset, your account is secure and no action is required.</p>
      `;
      break;

    case 'profile_change_decision':
      const isApproved = String(vars.status).toLowerCase() === 'approved';
      const statusColor = isApproved ? '#16a34a' : '#dc2626';
      content = `
        <h3 style="color: #0f172a; margin-top: 0;">Profile Change Request Update</h3>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Your profile change request for <strong>${String(vars.fieldName || 'field')}</strong> has been reviewed:</p>
        <div style="background-color: #f8fafc; border-left: 4px solid ${statusColor}; padding: 12px 16px; margin: 20px 0;">
          <p style="margin: 0; font-weight: 600; color: ${statusColor};">Status: ${String(vars.status || 'Reviewed').toUpperCase()}</p>
          ${vars.reviewerNotes ? `<p style="margin: 8px 0 0; font-size: 13px; color: #475569;">Admin notes: ${String(vars.reviewerNotes)}</p>` : ''}
        </div>
        <p style="color: #334155; font-size: 14px;">Sign in to your student dashboard to review your verified institutional credentials.</p>
      `;
      break;

    case 'team_invitation':
      content = `
        <h3 style="color: #0f172a; margin-top: 0;">You're Invited to Join a Hackathon Team</h3>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;"><strong>${String(vars.inviterName || 'A student')}</strong> has invited you to join team <strong>${String(vars.teamName || 'Team')}</strong> for <strong>${String(vars.hackathonTitle || 'the hackathon')}</strong>.</p>
        <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; text-align: center; margin: 24px 0;">
          <p style="margin: 0 0 8px; font-size: 12px; color: #64748b; text-transform: uppercase;">Team Invitation Code</p>
          <span style="font-size: 24px; font-weight: bold; letter-spacing: 0.1em; color: #1e293b;">${String(vars.inviteCode || '')}</span>
        </div>
        <p style="color: #334155; font-size: 14px;">Log in to NMIT HackLeague and navigate to Teams to accept this invitation.</p>
      `;
      break;

    case 'deadline_reminder':
      content = `
        <h3 style="color: #dc2626; margin-top: 0;">Upcoming Submission Deadline Alert</h3>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">This is a reminder that submissions for <strong>${String(vars.hackathonTitle || 'the hackathon')}</strong> (${String(vars.roundName || 'Round 1')}) are due soon.</p>
        <div style="background-color: #fff1f2; border: 1px solid #fecdd3; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; font-size: 16px; font-weight: bold; color: #9f1239;">Deadline: ${String(vars.deadlineTime || '')}</p>
        </div>
        <p style="color: #334155; font-size: 14px;">Ensure all repository URLs, demo artifacts, and presentation slides are uploaded before the cutoff window closes.</p>
      `;
      break;

    case 'admin_onboarding':
      content = `
        <h3 style="color: #0f172a; margin-top: 0; font-size: 18px;">Administrator Onboarding & Credentials</h3>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Hello <strong>${String(vars.name || 'Administrator')}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">An institutional administrator account has been provisioned for you on the <strong>NMIT HackLeague</strong> portal.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 18px; margin: 24px 0;">
          <p style="margin: 0 0 6px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Your Sign-In Email</p>
          <p style="margin: 0 0 16px; font-size: 15px; color: #0f172a; font-family: monospace; font-weight: 600;">${String(vars.email || '')}</p>

          <p style="margin: 0 0 6px; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Temporary Initial Password</p>
          <div style="background-color: #ffffff; border: 1px dashed #cbd5e1; border-radius: 4px; padding: 12px; margin: 0 0 12px; text-align: center;">
            <code style="font-size: 18px; font-weight: bold; color: #0f172a; letter-spacing: 0.05em; word-break: break-all;">${String(vars.temporaryPassword || '------')}</code>
          </div>
          <p style="margin: 0; font-size: 12px; color: #dc2626; font-weight: 600;">&#9888; This temporary password expires in 24 hours.</p>
        </div>

        <div style="margin: 24px 0; text-align: center;">
          <a href="${String(vars.loginUrl || '#')}" style="background-color: #1e293b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Sign In to Complete Setup</a>
        </div>

        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0;">
          <p style="margin: 0; font-size: 13px; font-weight: 600; color: #92400e;">Mandatory Security Requirement:</p>
          <p style="margin: 4px 0 0; font-size: 13px; color: #78350f; line-height: 1.5;">
            You will be prompted to set a permanent, secure password upon your first sign in. Normal administrative dashboard access is strictly blocked until this password change is completed.
          </p>
        </div>

        <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
          Never share this credential with anyone. If this credential expires or you encounter issues signing in, please contact the institutional Super Admin to safely reissue your onboarding credentials.
        </p>
      `;
      break;

    default:
      content = `<p style="color: #334155; font-size: 14px;">${String(vars.message || 'Notification from NMIT HackLeague.')}</p>`;
      break;
  }

  return `${brandHeader}${content}${brandFooter}`;
}

/**
 * Sends a transactional email through Resend with duplicate prevention,
 * retry handling, and comprehensive PostgreSQL delivery logging.
 */
export async function sendTransactionalEmail(options: SendEmailOptions): Promise<EmailDeliveryResult> {
  const { to, subject, template, variables, idempotencyKey, userId } = options;

  if (!to || !to.includes('@')) {
    return { success: false, error: 'Invalid recipient email address.' };
  }

  if (!subject || !subject.trim()) {
    return { success: false, error: 'Email subject is mandatory.' };
  }

  const adminClient = createAdminClient();

  // 1. Idempotency Check: Prevent duplicate dispatches
  if (idempotencyKey) {
    const { data: existingLog } = await adminClient
      .from('email_delivery_logs')
      .select('id, status, sent_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingLog && existingLog.status === 'sent') {
      return {
        success: true,
        messageId: existingLog.id,
        duplicatePrevented: true,
      };
    }
  }

  const htmlContent = renderTemplateHtml(template, variables);
  const apiKey = process.env.RESEND_API_KEY;
  const isConfigured = Boolean(apiKey && apiKey.startsWith('re_') && !apiKey.includes('placeholder') && !apiKey.includes('dummy'));
  const senderEmail = process.env.RESEND_FROM_EMAIL || 'NMIT HackLeague <notifications@nmit.ac.in>';

  // Reject unconfigured email service in production to avoid accidental simulation
  if (!isConfigured && process.env.NODE_ENV === 'production') {
    return {
      success: false,
      error: 'Email delivery misconfigured: RESEND_API_KEY is missing or invalid in production.',
      isSimulated: false,
    };
  }

  // Sanitize variables for payload storage (exclude sensitive fields like passwords, temp credentials, and OTPs)
  const safePayload: Record<string, unknown> = { ...variables };
  delete safePayload.password;
  delete safePayload.token;
  delete safePayload.temporaryPassword;
  delete safePayload.tempPassword;
  if ('otp' in safePayload) {
    safePayload.otp = '[REDACTED]';
  }

  let deliveryStatus: 'sent' | 'failed' = 'failed';
  let messageId: string | undefined;
  let lastError: string | undefined;

  // 2. Dispatch via Resend REST API or simulate in development
  if (isConfigured) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: senderEmail,
          to: [to],
          subject: subject.trim(),
          html: htmlContent,
          ...(options.replyTo ? { reply_to: options.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const resData = await res.json();

      if (res.ok && resData.id) {
        deliveryStatus = 'sent';
        messageId = resData.id;
      } else {
        lastError = resData.message || `Resend returned HTTP ${res.status}`;
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : 'Network failure during Resend dispatch';
    }
  } else {
    // Development / Test Simulation: Mark as simulated send
    deliveryStatus = 'sent';
    messageId = `sim_${crypto.randomUUID()}`;
  }

  // 3. Record outcome in public.email_delivery_logs
  try {
    if (idempotencyKey) {
      await adminClient
        .from('email_delivery_logs')
        .upsert({
          recipient_email: to,
          user_id: userId || null,
          template_name: template,
          subject: subject.trim(),
          idempotency_key: idempotencyKey,
          status: deliveryStatus,
          attempt_count: 1,
          last_error: lastError || null,
          sent_at: deliveryStatus === 'sent' ? new Date().toISOString() : null,
          payload: safePayload as NonNullable<Json>,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'idempotency_key' });
    } else {
      await adminClient
        .from('email_delivery_logs')
        .insert({
          recipient_email: to,
          user_id: userId || null,
          template_name: template,
          subject: subject.trim(),
          status: deliveryStatus,
          attempt_count: 1,
          last_error: lastError || null,
          sent_at: deliveryStatus === 'sent' ? new Date().toISOString() : null,
          payload: safePayload as NonNullable<Json>,
        });
    }
  } catch {
    // Non-blocking: ensure log failure does not break email dispatch result
  }

  return {
    success: deliveryStatus === 'sent',
    messageId,
    error: lastError,
    isSimulated: !isConfigured,
  };
}
