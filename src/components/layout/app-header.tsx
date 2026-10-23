'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '../ui/brand-logo';
import { IconButton } from '../ui/icon-button';
import { NotificationCenter } from './notification-center';
import { createClient } from '@/lib/supabase/client';

export interface AppHeaderProps {
  roleTitle: string;
  roleBadge?: React.ReactNode;
  userName?: string;
  userRole?: string;
  avatarUrl?: string | null;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export function AppHeader({
  roleTitle,
  roleBadge,
  userName = 'Demo User',
  userRole = 'Preview Account',
  avatarUrl = null,
  onToggleSidebar,
  isSidebarOpen = false,
}: AppHeaderProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      await fetch('/auth/signout', { method: 'POST' });
    } catch {
      // Continue to redirect even on network/client error
    } finally {
      router.push('/login');
      router.refresh();
    }
  };
  return (
    <header className="h-16 sticky top-0 z-30 w-full border-b border-border-subtle bg-surface-canvas/95 backdrop-blur-xs px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile hamburger + Brand */}
      <div className="flex items-center gap-3 sm:gap-4">
        {onToggleSidebar && (
          <div className="lg:hidden">
            <IconButton
              icon={
                isSidebarOpen ? (
                  <svg
                    className="w-5 h-5 stroke-current"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 stroke-current"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                )
              }
              aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              variant="ghost"
              size="sm"
              onClick={onToggleSidebar}
            />
          </div>
        )}

        <Link href="/" className="flex items-center focus:outline-none focus:ring-2 focus:ring-border-focus rounded-sm">
          <BrandLogo asset="combined" size="sm" />
        </Link>

        {roleBadge && <div className="hidden sm:inline-flex">{roleBadge}</div>}
      </div>

      {/* Right: Institutional NMIT logo & User Profile Preview */}
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="hidden md:flex items-center border-r border-border-subtle pr-6">
          <BrandLogo asset="nmit" size="sm" />
        </div>

        {/* In-App Notification Center */}
        <NotificationCenter />

        {/* User profile capsule */}
        <div className="flex items-center gap-2.5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userName}
              className="w-8 h-8 rounded-full object-cover border border-border-subtle"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-surface-muted border border-border-subtle flex items-center justify-center font-semibold text-xs text-text-primary select-none">
              {userName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
          )}
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-medium text-text-primary leading-tight">
              {userName}
            </span>
            <span className="text-[11px] text-text-helper leading-tight">
              {userRole}
            </span>
          </div>
        </div>

        {/* Accessible Sign Out action */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          aria-label="Sign out of account"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border-subtle bg-surface-subtle hover:bg-surface-muted text-text-secondary hover:text-status-error-text text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-2xs"
        >
          {isSigningOut ? (
            <svg
              className="animate-spin w-3.5 h-3.5 text-current"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5 stroke-current shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          )}
          <span className="hidden sm:inline">
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </span>
        </button>
      </div>
    </header>
  );
}
