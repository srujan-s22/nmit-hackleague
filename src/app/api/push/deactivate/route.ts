import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized: login required.' }, { status: 401 });
  }

  let body: { deviceFingerprint?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const fingerprint = body.deviceFingerprint || 'device-' + user.id.slice(0, 8);

  const { data, error } = await supabase.rpc('deactivate_push_subscription' as never, {
    p_device_fingerprint: fingerprint,
  } as never);

  if (error) {
    return NextResponse.json(
      { error: `Failed to deactivate subscription: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data,
  });
}
