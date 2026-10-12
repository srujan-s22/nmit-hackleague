'use client';

import React, { useState } from 'react';
import { AppHeader } from '../layout/app-header';
import { SidebarNav, NavSection } from '../layout/sidebar-nav';
import { Badge } from '../ui/badge';

export interface SuperAdminShellProps {
  children: React.ReactNode;
  currentPath?: string;
}

export function SuperAdminShell({
  children,
  currentPath = '/preview/shells/super-admin',
}: SuperAdminShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const sections: NavSection[] = [
    {
      title: 'Institutional Governance',
      items: [
        {
          label: 'Institution Overview',
          href: '/preview/shells/super-admin',
          badge: 'NMIT System',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          ),
        },
        {
          label: 'User & Role Governance',
          href: '/preview/shells/super-admin#governance',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Auditing & Security',
      items: [
        {
          label: 'Audit Logs & Retention',
          href: '/preview/shells/super-admin#logs',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <circle cx="10" cy="13" r="2" />
              <line x1="12" y1="15" x2="16" y2="19" />
            </svg>
          ),
        },
        {
          label: 'Policy & System Settings',
          href: '/preview/shells/super-admin#policy',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
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
        <span className="text-neutral-400 font-mono text-[10px]">ENVIRONMENT: RESTRICTED PREVIEW</span>
      </div>

      <AppHeader
        roleTitle="Super Admin"
        roleBadge={<Badge variant="warning">Super Admin</Badge>}
        userName="Dr. H. C. Nagaraj"
        userRole="Principal / System Authority"
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
    </div>
  );
}
