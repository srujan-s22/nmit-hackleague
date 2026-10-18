import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validatePushEndpoint } from '@/lib/notifications/endpoint-validator';
import { validateVapidConfiguration, isMockSubscription } from '@/lib/notifications/vapid-config';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized: login required.' }, { status: 401 });
  }

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    deviceFingerprint?: string;
    userAgent?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const { endpoint, keys, deviceFingerprint, userAgent } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: 'Invalid push subscription: endpoint, p256dh, and auth keys are required.' },
      { status: 400 }
    );
  }

  // Mandatory SSRF and trusted push gateway domain validation
  const validation = await validatePushEndpoint(endpoint);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || 'Push gateway endpoint is not authorized.' },
      { status: 400 }
    );
  }

  // Production VAPID & Mock-Credential Verification
  if (process.env.NODE_ENV === 'production') {
    const vapidCheck = validateVapidConfiguration();
    if (!vapidCheck.valid) {
      return NextResponse.json(
        { error: vapidCheck.error || 'Production Web Push requires valid VAPID configuration.' },
        { status: 500 }
      );
    }
    if (
      vapidCheck.isMock ||
      isMockSubscription({
        endpoint,
        deviceFingerprint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
    ) {
      return NextResponse.json(
        { error: 'Production Web Push rejects mock credentials and fake subscriptions.' },
        { status: 400 }
      );
    }
  }

  const fingerprint = deviceFingerprint || 'device-' + user.id.slice(0, 8);
  const clientUa = userAgent || request.headers.get('user-agent') || 'Unknown';

  const { data, error } = await supabase.rpc('register_push_subscription' as never, {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_device_fingerprint: fingerprint,
    p_user_agent: clientUa,
  } as never);

  if (error) {
    return NextResponse.json(
      { error: `Failed to register push subscription: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    active: true,
    data,
  });
}
