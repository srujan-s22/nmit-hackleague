import { NextResponse } from 'next/server';
import { validateVapidConfiguration } from '@/lib/notifications/vapid-config';

export async function GET() {
  const vapidCheck = validateVapidConfiguration();
  const publicKey = vapidCheck.config?.publicKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

  return NextResponse.json({
    publicKey,
    valid: Boolean(publicKey),
  });
}
