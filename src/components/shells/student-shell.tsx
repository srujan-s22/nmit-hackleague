'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AppHeader } from '../layout/app-header';
import { SidebarNav, NavSection } from '../layout/sidebar-nav';
import { Badge } from '../ui/badge';
import { WebPushGateModal } from './web-push-gate-modal';
import { getMyHeaderProfileAction, type HeaderProfile } from '@/actions/header-profile-actions';
import {
  avatarUrlToDataUrl,
  clearHeaderProfileCache,
  readHeaderProfileCache,
  subscribeHeaderProfileCache,
  writeHeaderProfileCache,
} from '@/lib/student/header-profile-cache';

export interface StudentShellProfile {
  full_name: string;
  usn: string;
  branch?: string;
  academic_year?: number;
  profile_photo_path?: string | null;
  avatarUrl?: string | null;
}

export interface StudentShellProps {
  children: React.ReactNode;
  currentPath?: string;
  studentProfile?: StudentShellProfile | null;
}

export function StudentShell({
  children,
  currentPath = '/student',
  studentProfile,
}: StudentShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Every student page renders its own shell, so the header photo is kept in a
  // per-tab store (sessionStorage, as a small data URL): fetched and downloaded
  // once when the student opens the site, then reused on every page with no
  // network. The server snapshot is null so SSR never touches the store.
  const cachedProfile = useSyncExternalStore(
    subscribeHeaderProfileCache,
    readHeaderProfileCache,
    () => null
  );
  const serverUsn = studentProfile?.usn;
  const serverAvatarUrl = studentProfile?.avatarUrl;
  const cacheUsn = cachedProfile?.usn;
  useEffect(() => {
    // A different student signed in on this tab: drop the previous one's photo.
    if (cachedProfile && serverUsn && cacheUsn && cacheUsn !== serverUsn) {
      clearHeaderProfileCache();
      return;
    }
    if (cachedProfile) return;
    let cancelled = false;
    (async () => {
      let profile: HeaderProfile | null = null;
      let sourceUrl: string | null = null;
      if (serverAvatarUrl && studentProfile) {
        // Page already has a signed URL: reuse it instead of another round trip.
        profile = { full_name: studentProfile.full_name, usn: studentProfile.usn ?? null, avatarUrl: null };
        sourceUrl = serverAvatarUrl;
      } else {
        const res = await getMyHeaderProfileAction();
        if (!res.success || !res.profile) return;
        profile = { ...res.profile, avatarUrl: null };
        sourceUrl = res.profile.avatarUrl;
      }
      const dataUrl = sourceUrl ? await avatarUrlToDataUrl(sourceUrl) : null;
      // Don't cache a failed photo download: a later page retries instead of
      // pinning initials for the whole session.
      if (cancelled || (sourceUrl && !dataUrl)) return;
      writeHeaderProfileCache({ ...profile, avatarUrl: dataUrl });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!cachedProfile, serverUsn, cacheUsn, serverAvatarUrl]);

  const fetchedProfile = cachedProfile;

  const displayName = studentProfile?.full_name || fetchedProfile?.full_name;
  const displayUsn = studentProfile?.usn || fetchedProfile?.usn;

  const sections: NavSection[] = [
    {
      title: 'Workspace',
      items: [
        {
          label: 'Dashboard',
          href: '/student',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
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
          href: '/student/teams',
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
      title: 'Progression & Profile',
      items: [
        {
          label: 'My Profile & History',
          href: '/student/profile',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ),
        },
        {
          label: 'Platform Leaderboard',
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
          label: 'Points & Ledger',
          href: '/student/points',
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
        userName={displayName || 'Student Portal'}
        userRole={displayUsn ? `Student (${displayUsn})` : 'Student Account'}
        avatarUrl={fetchedProfile?.avatarUrl}
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
