import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  let supabaseResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Do NOT use supabase.auth.getSession(). It is insecure on the server.
  // Using supabase.auth.getUser() validates the token against the Supabase Auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Unauthenticated user trying to access protected routes
  const isProtectedPath =
    path.startsWith('/student') ||
    path.startsWith('/onboarding') ||
    path.startsWith('/status') ||
    path.startsWith('/admin') ||
    path === '/hackathons' ||
    path === '/points' ||
    path === '/auth/complete-setup';

  if (isProtectedPath && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', path);
    return NextResponse.redirect(url);
  }

  // Enforce server-side must_change_password for authenticated users
  if (user) {
    const appMeta = user.app_metadata || {};
    const mustChangePassword = Boolean(appMeta.must_change_password);

    if (mustChangePassword) {
      const isAllowedSetupPath =
        path === '/auth/complete-setup' ||
        path.startsWith('/auth/signout') ||
        path === '/login';

      if (!isAllowedSetupPath) {
        const url = request.nextUrl.clone();
        url.pathname = '/auth/complete-setup';
        url.search = '';
        return NextResponse.redirect(url);
      }
    } else if (path === '/auth/complete-setup') {
      // Completed users attempting to visit complete-setup route are redirected to admin/home
      const url = request.nextUrl.clone();
      url.pathname = appMeta.role === 'admin' ? '/admin' : '/student';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
