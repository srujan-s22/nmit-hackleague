import React from 'react';
import { requireAdmin } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { adminHasAssignments, type NavStateClient } from '@/lib/admin/nav-state';
import { AdminLayoutShell } from '@/components/shells/admin-layout-shell';

/**
 * Shared shell for all /admin routes. A layout is not re-rendered when moving
 * between sibling pages, which is what keeps the sidebar from flickering.
 *
 * SECURITY: this layout is NOT the access control. Next.js does not re-run layouts
 * on client-side navigation, so every page below still calls requireAdmin(<permission>)
 * itself and every action / RPC / RLS policy re-authorizes on the server. This
 * layout only blocks signed-out / non-admin visitors from seeing the shell on a
 * full page load and supplies the sidebar's display data.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin, permissions } = await requireAdmin();
  const supabase = await createClient();
  const hasAssignments = await adminHasAssignments(supabase as unknown as NavStateClient, admin.id);

  return (
    <AdminLayoutShell adminProfile={admin} permissions={permissions} hasAssignments={hasAssignments}>
      {children}
    </AdminLayoutShell>
  );
}
