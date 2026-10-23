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
          label: 'Overview & Analytics',
          href: '/admin',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
          ),
        },
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
        {
          label: 'Broadcasts & Alerts',
          href: '/admin/notifications',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          ),
        },
        {
          label: 'Points & Awards',
          href: '/admin/points',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="7" />
              <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
            </svg>
          ),
        },
        {
          label: 'Leaderboard',
          href: '/leaderboard',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.45 1-1 1H7v2h10v-2h-2c-.55 0-1-.45-1-1v-2.34" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
            </svg>
          ),
        },
        {
          label: 'Reports & Exports',
          href: '/admin/reports',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
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
