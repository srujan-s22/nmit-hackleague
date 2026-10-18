'use client';

import React, { useState } from 'react';
import { AppHeader } from '../layout/app-header';
import { SidebarNav, NavSection } from '../layout/sidebar-nav';
import { Badge } from '../ui/badge';
import { WebPushGateModal } from './web-push-gate-modal';
import type { AdminProfile } from '@/types/auth';

export interface AdminShellProps {
  children: React.ReactNode;
  currentPath?: string;
  adminProfile?: AdminProfile;
  permissions?: string[];
}

export function AdminShell({
  children,
  currentPath = '/admin/verifications',
  adminProfile,
  permissions = [],
}: AdminShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const hasVerifyStudents =
    adminProfile?.is_super_admin || permissions.includes('verify_students');
  const hasManageHackathons =
    adminProfile?.is_super_admin || permissions.includes('manage_hackathons');
  const isSuperAdmin = adminProfile?.is_super_admin;

  const eventOpItems = [];
  if (hasManageHackathons) {
    eventOpItems.push({
      label: 'Hackathons',
      href: '/admin/hackathons',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      ),
    });
  }
  if (hasVerifyStudents) {
    eventOpItems.push({
      label: 'Student Verifications',
      href: '/admin/verifications',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <polyline points="16 11 18 13 22 9" />
        </svg>
      ),
    });
  }

  const governanceItems = [];
  if (isSuperAdmin) {
    governanceItems.push({
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
    });
  }

  const sections: NavSection[] = [];
  if (eventOpItems.length > 0) {
    sections.push({
      title: 'Operations',
      items: eventOpItems,
    });
  }
  if (governanceItems.length > 0) {
    sections.push({
      title: 'Governance',
      items: governanceItems,
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-text-primary">
      <AppHeader
        roleTitle={isSuperAdmin ? 'Super Admin' : 'Club Administrator'}
        roleBadge={
          isSuperAdmin ? (
            <Badge variant="warning">Super Admin</Badge>
          ) : (
            <Badge variant="neutral">Club Administrator</Badge>
          )
        }
        userName={adminProfile?.full_name || 'Prof. Divya K.'}
        userRole={adminProfile?.email ? `${adminProfile.email}` : 'Organizer (ISE Dept)'}
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
