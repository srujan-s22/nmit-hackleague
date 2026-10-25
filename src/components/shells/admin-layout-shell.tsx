'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AdminShellFrame } from './admin-shell';
import { AdminLayoutContext } from './admin-layout-context';
import type { AdminProfile } from '@/types/auth';

interface AdminLayoutShellProps {
  children: React.ReactNode;
  adminProfile: AdminProfile;
  permissions: string[];
  hasAssignments: boolean;
}

/**
 * The single admin shell for every /admin route (mounted by app/admin/layout.tsx).
 * It persists across client navigations, so the sidebar, header and menu state are
 * not rebuilt or re-fetched on each click. The active item follows the real URL.
 *
 * Props come from the layout's own server-side requireAdmin() and only drive what
 * is drawn. Every page still runs its own requireAdmin()/permission check.
 */
export function AdminLayoutShell({ children, adminProfile, permissions, hasAssignments }: AdminLayoutShellProps) {
  const pathname = usePathname();
  return (
    <AdminLayoutContext.Provider value={true}>
      <AdminShellFrame
        currentPath={pathname}
        adminProfile={adminProfile}
        permissions={permissions}
        assignedHackathonsCount={hasAssignments ? 1 : 0}
      >
        {children}
      </AdminShellFrame>
    </AdminLayoutContext.Provider>
  );
}
