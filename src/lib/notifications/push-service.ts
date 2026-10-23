import 'server-only';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { validatePushEndpoint } from './endpoint-validator';
import { validateVapidConfiguration, isMockSubscription, type VapidConfig } from './vapid-config';

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
 * Encrypts an arbitrary JSON payload according to RFC 8291 (Message Encryption for Web Push).
 * Uses AES-128-GCM with ECDH over prime256v1 (P-256) and HKDF.
 */
export function encryptWebPushPayload(
  payload: PushPayload,
  clientP256dhB64: string,
  clientAuthB64: string
): Buffer {
  const normalizeB64 = (s: string) => s.replace(/-/g, '+').replace(/_/g, '/');
  const clientPubBuf = Buffer.from(normalizeB64(clientP256dhB64), 'base64');
  const clientAuthBuf = Buffer.from(normalizeB64(clientAuthB64), 'base64');

  if (clientPubBuf.length !== 65 || clientPubBuf[0] !== 0x04) {
    throw new Error('Invalid subscriber public key: must be 65-byte uncompressed P-256 point.');
  }

  if (clientAuthBuf.length < 16) {
    throw new Error('Invalid subscriber auth secret: must be at least 16 bytes.');
  }

  // Server generates ephemeral P-256 key pair
  const serverEcdh = crypto.createECDH('prime256v1');
  serverEcdh.generateKeys();
  const serverPubBuf = serverEcdh.getPublicKey(); // 65 bytes uncompressed

  // Derive shared ECDH secret
  const sharedSecret = serverEcdh.computeSecret(clientPubBuf);

  // Derive pseudo-random key (ikm) using subscriber auth secret
  const infoBuf = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    clientPubBuf,
    serverPubBuf,
  ]);
  const ikmRaw = crypto.hkdfSync('sha256', sharedSecret, clientAuthBuf, infoBuf, 32);
  const ikm = Buffer.from(ikmRaw);

  // 16-byte random salt
  const salt = crypto.randomBytes(16);

  // Derive Content-Encryption-Key (CEK) and Nonce
  const cekRaw = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonceRaw = crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
  const cek = Buffer.from(cekRaw);
  const nonce = Buffer.from(nonceRaw);

  // Encrypt payload with padding delimiter (0x02 indicates final record)
  const plaintext = Buffer.concat([
    Buffer.from(JSON.stringify(payload), 'utf8'),
    Buffer.from([0x02]),
  ]);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // Construct 86-byte RFC 8291 header:
  // salt (16 bytes) || rs (4 bytes uint32 = 4096) || idlen (1 byte = 65) || keyid (serverPubBuf 65 bytes)
  const header = Buffer.alloc(86);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(65, 20);
  serverPubBuf.copy(header, 21);

  return Buffer.concat([header, encrypted]);
}

/**
 * Creates an RFC 8292 VAPID Authorization header token.
 */
export function createVapidAuthHeader(endpointUrl: string, config: VapidConfig): string {
  const origin = new URL(endpointUrl).origin;
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12 hours

  const payloadB64 = Buffer.from(
    JSON.stringify({
      aud: origin,
      exp,
      sub: config.subject,
    })
  ).toString('base64url');

  const dataToSign = `${headerB64}.${payloadB64}`;

  // Build private key from P-256 scalar
  const pubBuf = Buffer.from(config.publicKey, 'base64url');
  const x = pubBuf.subarray(1, 33).toString('base64url');
  const y = pubBuf.subarray(33, 65).toString('base64url');

  const privKeyObj = crypto.createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d: config.privateKey,
    },
    format: 'jwk',
  });

  const sign = crypto.createSign('SHA256');
  sign.update(dataToSign);
  const sigB64 = sign.sign({ key: privKeyObj, dsaEncoding: 'ieee-p1363' }, 'base64url');

  const jwt = `${dataToSign}.${sigB64}`;
  return `vapid t=${jwt}, k=${config.publicKey}`;
}

/**
 * Sends a Web Push notification to an authenticated subscriber endpoint.
 * Enforces pre-connect SSRF checks, domain allowlists, and VAPID key verification before network dispatch.
 * Uses RFC 8291 aes128gcm payload encryption and RFC 8292 VAPID authorization.
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

  // 3. Prepare Encrypted Body & VAPID Authorization
  let encryptedBody: Buffer | null = null;
  let vapidAuthHeader = '';

  const hasValidKeys =
    subscription.p256dh &&
    subscription.auth &&
    !isMockSubscription(subscription) &&
    vapidCheck.config?.publicKey &&
    vapidCheck.config?.privateKey;

  if (hasValidKeys && vapidCheck.config) {
    try {
      encryptedBody = encryptWebPushPayload(payload, subscription.p256dh, subscription.auth);
      vapidAuthHeader = createVapidAuthHeader(subscription.endpoint, vapidCheck.config);
    } catch (err) {
      const encError = err instanceof Error ? err.message : 'Encryption failed';
      if (isProduction) {
        return { success: false, error: `Payload encryption failed: ${encError}` };
      }
    }
  }

  // If in development/test with mock subscription and no real VAPID, handle simulated delivery safely
  if (!isProduction && isMockSubscription(subscription)) {
    try {
      if (targetUserId) {
        await adminClient.rpc('log_push_delivery_outcome', {
          p_announcement_id: announcementId || undefined,
          p_subscription_id: subscription.id || undefined,
          p_user_id: targetUserId,
          p_endpoint: subscription.endpoint,
          p_status: 'delivered',
          p_status_code: 201,
          p_error_message: undefined,
          p_attempt_count: 1,
        });
      }
    } catch {
      // Non-blocking
    }
    return {
      success: true,
      statusCode: 201,
      retried: false,
    };
  }

  // 4. Dispatch with bounded retry loop on transient errors
  let attempt = 0;
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  const requestHeaders: Record<string, string> = {
    TTL: '86400',
  };

  if (encryptedBody && vapidAuthHeader) {
    requestHeaders['Content-Type'] = 'application/octet-stream';
    requestHeaders['Content-Encoding'] = 'aes128gcm';
    requestHeaders['Authorization'] = vapidAuthHeader;
  } else {
    requestHeaders['Content-Type'] = 'application/json';
  }

  const requestBody: BodyInit = encryptedBody ? new Uint8Array(encryptedBody) : JSON.stringify(payload);

  while (attempt <= maxRetries) {
    attempt++;
    try {
      const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: requestBody,
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

      // Read response body for precise diagnostic logging
      let responseBody = '';
      try {
        responseBody = await response.text();
      } catch {
        // ignore
      }

      // 404 or 410 Gone indicates device unsubscribed or subscription expired at gateway
      // 403 with mismatched VAPID credentials indicates stale/orphaned subscription
      const isMismatchedVapid = response.status === 403 && responseBody.toLowerCase().includes('vapid');
      if (response.status === 404 || response.status === 410 || isMismatchedVapid) {
        const expiredReason = isMismatchedVapid
          ? 'Subscription invalid: VAPID credentials do not correspond to the subscription.'
          : 'Subscription expired or unregistered at push gateway.';

        try {
          if (targetUserId) {
            await adminClient.rpc('log_push_delivery_outcome', {
              p_announcement_id: announcementId || undefined,
              p_subscription_id: subscription.id || undefined,
              p_user_id: targetUserId,
              p_endpoint: subscription.endpoint,
              p_status: 'expired',
              p_status_code: response.status,
              p_error_message: expiredReason,
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
          error: expiredReason,
        };
      }

      // If server error (5xx) or 429 rate limit, allow retry with exponential backoff
      if ((response.status >= 500 || response.status === 429) && attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, Math.min(500 * Math.pow(2, attempt - 1), 2000)));
        continue;
      }

      lastError = responseBody
        ? `Push gateway rejected (${response.status}): ${responseBody.trim().slice(0, 150)}`
        : `Push service rejected notification with HTTP ${response.status}`;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Unknown network failure during push dispatch';
      if (attempt <= maxRetries) {
        await new Promise((r) => setTimeout(r, Math.min(500 * Math.pow(2, attempt - 1), 2000)));
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
