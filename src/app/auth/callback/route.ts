import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Validates that a redirect target is a safe, internal relative pathname.
 * Prevents open-redirect attacks via protocol-relative URLs (//evil.com),
 * backslashes (/\\evil.com), or external schemes (https://evil.com).
 */
function getSafeNextPath(rawNext: string | null, fallback = '/onboarding'): string {
  if (!rawNext) return fallback;
  const trimmed = rawNext.trim();

  // Reject empty or non-relative paths
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback;
  }

  // Ensure origin is strictly local when parsed with dummy origin
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (parsed.origin !== 'http://localhost') {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextParam = requestUrl.searchParams.get('next');
  const safeNext = getSafeNextPath(nextParam, '/onboarding');

  // 1. Check for explicit error parameters passed by Supabase Auth (e.g. otp_expired)
  const errorParam = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');
  if (errorParam) {
    const errorMsg = errorDescription || 'Invalid or expired authentication link';
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorMsg)}`, request.url)
    );
  }

  // 2. PKCE Authorization Code Flow
  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(new URL(safeNext, request.url));
    }

    // Code exchange failed (expired or invalid PKCE code)
    return NextResponse.redirect(
      new URL('/login?error=Invalid+or+expired+authentication+link', request.url)
    );
  }

  // 3. Implicit Flow / Hash Fragment Forwarding:
  // When Supabase generates recovery or invite links without PKCE, tokens arrive in the
  // URL hash fragment (#access_token=...). Since browsers strip the fragment from HTTP requests,
  // the server sees code = null. If a valid specific internal destination was requested
  // (e.g. /reset-password), forward the browser to safeNext so the client-side hash fragment
  // is preserved and processed by the destination page.
  if (nextParam && safeNext !== '/onboarding') {
    return NextResponse.redirect(new URL(safeNext, request.url));
  }

  // 4. Default fallback: missing code and no specific destination
  return NextResponse.redirect(
    new URL('/login?error=Invalid+or+expired+authentication+link', request.url)
  );
}
