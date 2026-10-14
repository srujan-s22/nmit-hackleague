import 'server-only';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { RateLimitAction } from '@/types/auth';

export async function getClientIpKey(): Promise<string> {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OPERATIONAL_ERROR: RATE_LIMIT_HMAC_SECRET is missing or below 32 characters.');
  }

  const headerList = await headers();
  const forwardedFor = headerList.get('x-forwarded-for') || headerList.get('x-real-ip');

  if (!forwardedFor) {
    throw new Error('SECURITY_ERROR: Missing required client identification header.');
  }

  // Extract the first IP address if multiple are present in x-forwarded-for
  const clientIp = forwardedFor.split(',')[0].trim();
  if (!clientIp) {
    throw new Error('SECURITY_ERROR: Empty client IP address extracted.');
  }

  return crypto.createHmac('sha256', secret).update(clientIp).digest('hex');
}

const adminManagementBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkAdminManagementQuota(key: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const bucket = adminManagementBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    adminManagementBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export async function checkRateLimit(
  action: RateLimitAction,
  providedKey?: string
): Promise<boolean> {
  if (action === 'admin_management') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    let key = providedKey || user?.id;
    if (!key) {
      try {
        key = await getClientIpKey();
      } catch {
        key = 'anonymous_admin';
      }
    }
    return checkAdminManagementQuota(key, 10, 60000);
  }

  if (action === 'signup') {
    // Unauthenticated signup action requires service_role authority and client IP HMAC
    const key = providedKey || (await getClientIpKey());
    const admin = createAdminClient();
    const { data: allowed, error } = await admin.rpc('consume_rate_limit' as never, {
      p_action: 'signup',
      p_custom_key: key,
    } as never);

    if (error) {
      throw new Error(`Rate limit evaluation failed: ${error.message}`);
    }

    return Boolean(allowed);
  }

  // Authenticated actions use the caller's server session
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc('consume_rate_limit' as never, {
    p_action: action,
    p_custom_key: null,
  } as never);

  if (error) {
    throw new Error(`Rate limit evaluation failed: ${error.message}`);
  }

  return Boolean(allowed);
}
