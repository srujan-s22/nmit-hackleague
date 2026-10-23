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

  const response = NextResponse.json({
    success: true,
    message: 'In-app notification mode acknowledged for this mobile device.',
  });

  // Set persistent cookie allowing mobile clients lacking Web Push to access dashboard
  response.cookies.set('hl_in_app_acknowledged', 'true', {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
