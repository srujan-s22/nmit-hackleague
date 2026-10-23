'use server';

import { requireSuperAdmin } from '@/lib/auth/guards';

export interface DiagnosticEmailResult {
  success: boolean;
  message: string;
  emailId?: string;
  error?: string;
}

/**
 * Temporary development-only diagnostic action to test Resend email delivery.
 * Restricted strictly to local development and authenticated Super Admin.
 * Hardcoded to send exclusively to ssrujan246@gmail.com from onboarding@resend.dev.
 * Performs zero database writes and does not modify any accounts.
 */
export async function sendResendDiagnosticEmailAction(): Promise<DiagnosticEmailResult> {
  // 1. Environment Guard: Strictly forbidden in production
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      message: 'Diagnostic email dispatch is disabled in production.',
      error: 'Forbidden: Diagnostic utility is development-only.',
    };
  }

  // 2. Authorization Guard: Strictly restricted to active Super Admin
  try {
    await requireSuperAdmin();
  } catch {
    return {
      success: false,
      message: 'Unauthorized: Super Admin authority required.',
      error: 'Unauthorized',
    };
  }

  // 3. Fixed Parameters (no client input accepted)
  const targetRecipient = 'ssrujan246@gmail.com';
  const apiKey = process.env.RESEND_API_KEY;
  const fromSender = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  if (!apiKey || !apiKey.startsWith('re_')) {
    return {
      success: false,
      message: 'Resend API key is missing or invalid in local environment.',
      error: 'RESEND_API_KEY is not configured or does not start with re_',
    };
  }

  // 4. Safe Diagnostic Dispatch via Resend REST API
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromSender,
        to: [targetRecipient],
        subject: 'NMIT HackLeague — Email Delivery Test',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
            <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
              <h2 style="margin: 0; color: #1e293b; font-size: 20px;">NMIT HackLeague</h2>
              <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Email Integration Diagnostic</span>
            </div>
            <h3 style="color: #0f172a; margin-top: 0;">Resend Integration Test</h3>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              This diagnostic email confirms that the NMIT HackLeague transactional email pipeline using Resend is successfully configured and active.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 20px 0; font-size: 13px; color: #475569;">
              <div><strong>Recipient:</strong> ${targetRecipient}</div>
              <div style="margin-top: 6px;"><strong>Sender:</strong> ${fromSender}</div>
              <div style="margin-top: 6px;"><strong>Timestamp:</strong> ${new Date().toISOString()}</div>
              <div style="margin-top: 6px;"><strong>Environment:</strong> Local Development</div>
            </div>
            <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 12px; color: #94a3b8;">
              Nitte Meenakshi Institute of Technology &bull; Institutional Hackathon Management Portal
            </div>
          </div>
        `,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const resData = await response.json();

    if (response.ok && resData.id) {
      return {
        success: true,
        message: `Diagnostic test email accepted by Resend! Email ID: ${resData.id}. Please check inbox at ${targetRecipient}.`,
        emailId: resData.id,
      };
    } else {
      const errorDetail = resData.message || `Resend returned HTTP ${response.status}`;
      return {
        success: false,
        message: 'Resend API rejected the email request.',
        error: errorDetail,
      };
    }
  } catch (err: unknown) {
    return {
      success: false,
      message: 'Network or fetch failure during diagnostic dispatch.',
      error: err instanceof Error ? err.message : 'Unknown network failure',
    };
  }
}
