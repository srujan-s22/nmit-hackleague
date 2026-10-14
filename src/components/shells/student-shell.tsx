'use client';

import React, { useState } from 'react';
import { AppHeader } from '../layout/app-header';
import { SidebarNav, NavSection } from '../layout/sidebar-nav';
import { Badge } from '../ui/badge';

export interface StudentShellProps {
  children: React.ReactNode;
  currentPath?: string;
}

export function StudentShell({
  children,
  currentPath = '/preview/shells/student',
}: StudentShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const sections: NavSection[] = [
    {
      title: 'Workspace',
      items: [
        {
          label: 'My Hackathons',
          href: '/preview/shells/student',
          badge: '2 Active',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          ),
        },
        {
          label: 'Browse Events',
          href: '/student/hackathons',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          ),
        },
        {
          label: 'My Teams',
          href: '/preview/shells/student#teams',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Progression',
      items: [
        {
          label: 'Milestones & Submissions',
          href: '/preview/shells/student#milestones',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          ),
        },
        {
          label: 'Points & Badges',
          href: '/preview/shells/student#points',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-text-primary">
      <AppHeader
        roleTitle="Student Portal"
        roleBadge={<Badge variant="info">Student Portal</Badge>}
        userName="Aarav Sharma"
        userRole="Student (1NT22CS001)"
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
