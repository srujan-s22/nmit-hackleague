import { NextResponse, type NextRequest } from 'next/server';
import { checkSystemHealth } from '@/lib/reliability/health-service';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const report = await checkSystemHealth();
    const httpStatus = report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503;

    // Check authorization for detailed internal metrics
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    let isAuthorized = Boolean(
      cronSecret &&
      cronSecret.length > 8 &&
      authHeader === `Bearer ${cronSecret}`
    );

    if (!isAuthorized) {
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: adminProfile } = await supabase
            .from('admin_profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
          if (adminProfile) {
            isAuthorized = true;
          }
        }
      } catch {
        // Fallback to unauthenticated
      }
    }

    if (isAuthorized) {
      return NextResponse.json(report, {
        status: httpStatus,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    // Public / unauthenticated response: minimal, safe, no secrets or internal counts
    return NextResponse.json(
      {
        status: report.status,
        latencyMs: report.latencyMs,
        timestamp: report.timestamp,
        reliabilityNotice: report.reliabilityNotice,
      },
      {
        status: httpStatus,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch {
    // Return generic error without exposing stack traces or database connection details
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: 'Service temporarily unavailable',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
