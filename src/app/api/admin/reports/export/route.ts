import { createClient } from '@/lib/supabase/server';
import { handleExportRequest, type ExportRouteClient } from '@/lib/reports/export-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Large exports are generated while streaming; give them room on hosted runtimes.
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  // User-session client only: authorization is enforced by the export RPCs under the caller's JWT.
  return handleExportRequest(request, supabase as unknown as ExportRouteClient);
}
