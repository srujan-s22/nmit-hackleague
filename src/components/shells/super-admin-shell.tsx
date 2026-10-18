'use client';

import React, { useState } from 'react';
import { AppHeader } from '../layout/app-header';
import { SidebarNav, NavSection } from '../layout/sidebar-nav';
import { Badge } from '../ui/badge';
import { WebPushGateModal } from './web-push-gate-modal';
import type { AdminProfile } from '@/types/auth';

export interface SuperAdminShellProps {
  children: React.ReactNode;
  currentPath?: string;
  adminProfile?: AdminProfile;
  permissions?: string[];
}

export function SuperAdminShell({
  children,
  currentPath = '/admin/admins',
  adminProfile,
}: SuperAdminShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const sections: NavSection[] = [
    {
      title: 'Institutional Governance',
      items: [
        {
          label: 'Hackathons',
          href: '/admin/hackathons',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          ),
        },
        {
          label: 'Administrator Accounts',
          href: '/admin/admins',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
        },
        {
          label: 'Student Verifications',
          href: '/admin/verifications',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <polyline points="16 11 18 13 22 9" />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-text-primary">
      {/* Institutional Governance Banner */}
      <div className="bg-surface-inverse text-text-inverse text-[11px] font-semibold tracking-wide px-4 py-1.5 flex items-center justify-between border-b border-border-interactive select-none">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-status-warning-border" aria-hidden="true" />
          <span>SUPER ADMIN GOVERNANCE WORKSPACE — NMIT INSTITUTIONAL CONTROLS</span>
        </div>
        <span className="text-neutral-400 font-mono text-[10px]">
          {adminProfile ? 'LIVE SESSION' : 'RESTRICTED PREVIEW'}
        </span>
      </div>

      <AppHeader
        roleTitle="Super Admin"
        roleBadge={<Badge variant="warning">Super Admin</Badge>}
        userName={adminProfile?.full_name || 'Dr. H. C. Nagaraj'}
        userRole={adminProfile?.email ? `${adminProfile.email} (Super Admin)` : 'Principal / System Authority'}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
      />

      <div className="flex-1 flex">
        <SidebarNav
          sections={sections}
          currentPath={currentPath}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      <WebPushGateModal currentPath={currentPath} />
    </div>
  );
}
