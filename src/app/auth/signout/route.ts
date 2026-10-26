import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Relative Location keeps the user on the host they signed out from (request.url can
// report the server's bind host instead, e.g. behind a proxy). 303 turns a form POST
// into a GET of the login page.
function toLogin() {
  return new NextResponse(null, { status: 303, headers: { Location: '/login' } });
}

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return toLogin();
}

export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return toLogin();
}
