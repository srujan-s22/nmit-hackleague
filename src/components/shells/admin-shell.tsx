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
  assignedHackathonsCount?: number;
}

export function AdminShell({
  children,
  currentPath = '/admin/verifications',
  adminProfile,
  permissions = [],
  assignedHackathonsCount,
}: AdminShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [fetchedHasAssignments, setFetchedHasAssignments] = useState(false);
  const hasAssignedHackathons =
    typeof assignedHackathonsCount === 'number'
      ? assignedHackathonsCount > 0
      : fetchedHasAssignments;

  React.useEffect(() => {
    if (typeof assignedHackathonsCount === 'number') {
      return;
    }
    let isMounted = true;
    if (adminProfile?.is_active) {
      import('@/actions/admin-assignment-actions')
        .then(({ fetchMyAssignedHackathonsAction }) => {
          fetchMyAssignedHackathonsAction().then((res) => {
            if (isMounted && res.success && res.data && res.data.length > 0) {
              setFetchedHasAssignments(true);
            }
          }).catch(() => {});
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [assignedHackathonsCount, adminProfile?.is_active]);

  const hasVerifyStudents =
    adminProfile?.is_super_admin || permissions.includes('verify_students');
  const hasViewStudentData =
    adminProfile?.is_super_admin || permissions.includes('view_student_data');
  const hasManageHackathons =
    adminProfile?.is_super_admin || permissions.includes('manage_hackathons');
  const hasAssignHackathons =
    adminProfile?.is_super_admin || permissions.includes('assign_hackathons');
  const hasManagePoints =
    adminProfile?.is_super_admin || permissions.includes('manage_points');
  const hasExportData =
    adminProfile?.is_super_admin || permissions.includes('export_data');
  const hasManageNotifications =
    adminProfile?.is_super_admin || permissions.includes('manage_notifications');
  const isSuperAdmin = adminProfile?.is_super_admin;

  const eventOpItems = [
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
  ];
  // Accessible to all active administrators (hackathon managers, assignment managers, and reviewers)
  if (adminProfile?.is_active) {
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

    if (hasAssignedHackathons || isSuperAdmin) {
      eventOpItems.push({
        label: 'My Assigned Hackathons',
        href: '/admin/assigned-hackathons',
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
      });
    }
  }
  if (hasManagePoints) {
    eventOpItems.push({
      label: 'Points & Awards',
      href: '/admin/points',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="7" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
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
  if (hasViewStudentData) {
    eventOpItems.push({
      label: 'Student Directory',
      href: '/admin/students',
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
  eventOpItems.push({
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
  });
  if (hasManageNotifications) {
    eventOpItems.push({
      label: 'Broadcasts & Alerts',
      href: '/admin/notifications',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
    });
  }
  if (hasExportData) {
    eventOpItems.push({
      label: 'Reports & Exports',
      href: '/admin/reports',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      ),
    });
  }

  const governanceItems = [];
  if (isSuperAdmin || hasAssignHackathons) {
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

  const hasViewAuditLogs = isSuperAdmin || permissions.includes('view_audit_logs');
  if (hasViewAuditLogs) {
    governanceItems.push({
      label: 'Audit Trail',
      href: '/admin/audit-logs',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
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
