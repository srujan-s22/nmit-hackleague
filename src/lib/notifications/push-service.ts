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
}

/**
 * Sends a Web Push notification to an authenticated subscriber endpoint.
 * Enforces pre-connect SSRF checks, domain allowlists, and VAPID key verification before network dispatch.
 * Automatically deactivates 404 / 410 Gone stale subscriptions.
 */
export async function sendWebPushNotification(
  subscription: {
    id?: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    deviceFingerprint?: string;
  },
  payload: PushPayload
): Promise<PushDeliveryResult> {
  // Pre-connect SSRF defense & domain allowlist validation
  const validation = await validatePushEndpoint(subscription.endpoint);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error || 'Blocked by push endpoint security policy.',
    };
  }

  // Production VAPID & Mock-Credential Verification
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

  const adminClient = createAdminClient();

  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        TTL: '86400', // 24 hours retention on push gateway
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (response.ok || response.status === 201) {
      return {
        success: true,
        statusCode: response.status,
      };
    }

    // 404 or 410 Gone indicates device unsubscribed or subscription expired at gateway
    if (response.status === 404 || response.status === 410) {
      if (subscription.id) {
        await adminClient
          .from('user_push_subscriptions')
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq('id', subscription.id);
      }
      return {
        success: false,
        statusCode: response.status,
        unregistered: true,
        error: 'Subscription expired or unregistered at push gateway.',
      };
    }

    return {
      success: false,
      statusCode: response.status,
      error: `Push service rejected notification with HTTP ${response.status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown network failure during push dispatch';
    return {
      success: false,
      error: msg,
    };
  }
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
  payload: PushPayload
): Promise<{ dispatched: number; failed: number }> {
  const adminClient = createAdminClient();

  const { data: subs, error } = await adminClient
    .from('user_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('active', true);

  if (error || !subs || subs.length === 0) {
    return { dispatched: 0, failed: 0 };
  }

  let dispatched = 0;
  let failed = 0;

  for (const sub of subs) {
    const res = await sendWebPushNotification(sub, payload);
    if (res.success) {
      dispatched++;
    } else {
      failed++;
    }
  }

  return { dispatched, failed };
}
