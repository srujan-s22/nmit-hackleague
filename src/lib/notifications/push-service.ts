import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePushEndpoint } from './endpoint-validator';
import { validateVapidConfiguration, isMockSubscription } from './vapid-config';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushDeliveryResult {
  success: boolean;
  statusCode?: number;
  unregistered?: boolean;
  error?: string;
  retried?: boolean;
}

export interface SendPushOptions {
  announcementId?: string;
  userId?: string;
  maxRetries?: number;
}

/**
 * Sends a Web Push notification to an authenticated subscriber endpoint.
 * Enforces pre-connect SSRF checks, domain allowlists, and VAPID key verification before network dispatch.
 * Automatically deactivates 404 / 410 Gone stale subscriptions and logs all outcomes to push_delivery_logs.
 */
export async function sendWebPushNotification(
  subscription: {
    id?: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    deviceFingerprint?: string;
    userId?: string;
  },
  payload: PushPayload,
  options?: SendPushOptions
): Promise<PushDeliveryResult> {
  const adminClient = createAdminClient();
  const announcementId = options?.announcementId;
  const targetUserId = options?.userId || subscription.userId;
  const maxRetries = options?.maxRetries ?? 1;

  // 1. Pre-connect SSRF defense & domain allowlist validation
  const validation = await validatePushEndpoint(subscription.endpoint);
  if (!validation.valid) {
    const errorMsg = validation.error || 'Blocked by push endpoint security policy.';
    try {
      if (targetUserId) {
        await adminClient.rpc('log_push_delivery_outcome', {
          p_announcement_id: announcementId || undefined,
          p_subscription_id: subscription.id || undefined,
          p_user_id: targetUserId,
          p_endpoint: subscription.endpoint,
          p_status: 'failed',
          p_status_code: 400,
          p_error_message: errorMsg,
          p_attempt_count: 1,
        });
      }
    } catch {
      // Non-blocking logging
    }

    return {
      success: false,
      error: errorMsg,
    };
  }

  // 2. Production VAPID & Mock-Credential Verification
  const vapidCheck = validateVapidConfiguration();
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!vapidCheck.valid) {
      return {
        success: false,
        error: vapidCheck.error || 'Production Web Push requires valid VAPID configuration.',
      };
    }

    if (vapidCheck.isMock || isMockSubscription(subscription)) {
      return {
        success: false,
        error: 'Web Push dispatch rejected: mock credentials cannot be used in production.',
      };
    }
  }

  // 3. Dispatch with retry loop on transient errors
  let attempt = 0;
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          TTL: '86400', // 24 hours retention on push gateway
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10 second timeout
        redirect: 'error',
      });

      lastStatus = response.status;

      if (response.ok || response.status === 201) {
        try {
          if (targetUserId) {
            await adminClient.rpc('log_push_delivery_outcome', {
              p_announcement_id: announcementId || undefined,
              p_subscription_id: subscription.id || undefined,
              p_user_id: targetUserId,
              p_endpoint: subscription.endpoint,
              p_status: 'delivered',
              p_status_code: response.status,
              p_error_message: undefined,
              p_attempt_count: attempt,
            });
          }
        } catch {
          // Non-blocking logging
        }

        return {
          success: true,
          statusCode: response.status,
          retried: attempt > 1,
        };
      }

      // 404 or 410 Gone indicates device unsubscribed or subscription expired at gateway
      if (response.status === 404 || response.status === 410) {
        try {
          if (targetUserId) {
            await adminClient.rpc('log_push_delivery_outcome', {
              p_announcement_id: announcementId || undefined,
              p_subscription_id: subscription.id || undefined,
              p_user_id: targetUserId,
              p_endpoint: subscription.endpoint,
              p_status: 'expired',
              p_status_code: response.status,
              p_error_message: 'Subscription expired or unregistered at push gateway.',
              p_attempt_count: attempt,
            });
          } else if (subscription.id) {
            await adminClient
              .from('user_push_subscriptions')
              .update({ active: false, updated_at: new Date().toISOString() })
              .eq('id', subscription.id);
          }
        } catch {
          // Non-blocking
        }

        return {
          success: false,
          statusCode: response.status,
          unregistered: true,
          error: 'Subscription expired or unregistered at push gateway.',
        };
      }

      // If server error (5xx), allow retry
      if (response.status >= 500 && attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      lastError = `Push service rejected notification with HTTP ${response.status}`;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown network failure during push dispatch';
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
    }
  }

  // Record failed outcome
  try {
    if (targetUserId) {
      await adminClient.rpc('log_push_delivery_outcome', {
        p_announcement_id: announcementId || undefined,
        p_subscription_id: subscription.id || undefined,
        p_user_id: targetUserId,
        p_endpoint: subscription.endpoint,
        p_status: 'failed',
        p_status_code: lastStatus || 500,
        p_error_message: lastError || 'Delivery attempt exhausted',
        p_attempt_count: attempt,
      });
    }
  } catch {
    // Non-blocking
  }

  return {
    success: false,
    statusCode: lastStatus,
    error: lastError,
    retried: attempt > 1,
  };
}

/**
 * Checks whether an authenticated user possesses at least one active, valid push subscription.
 */
export async function hasActivePushSubscription(userId: string): Promise<boolean> {
  if (!userId) return false;
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.rpc('is_push_registered' as never, {
    p_user_id: userId,
  } as never);

  if (error || typeof data !== 'boolean') {
    return false;
  }

  return data;
}

/**
 * Dispatches an announcement to all active push subscriptions for a target user.
 */
export async function dispatchNotificationToUser(
  userId: string,
  payload: PushPayload,
  announcementId?: string
): Promise<{ dispatched: number; failed: number }> {
  const adminClient = createAdminClient();

  const { data: subs, error } = await adminClient
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth, user_id')
    .eq('user_id', userId)
    .eq('active', true);

  if (error || !subs || subs.length === 0) {
    return { dispatched: 0, failed: 0 };
  }

  let dispatched = 0;
  let failed = 0;

  for (const sub of subs) {
    const res = await sendWebPushNotification(
      { ...sub, userId: sub.user_id },
      payload,
      { announcementId, userId }
    );
    if (res.success) {
      dispatched++;
    } else {
      failed++;
    }
  }

  return { dispatched, failed };
}
