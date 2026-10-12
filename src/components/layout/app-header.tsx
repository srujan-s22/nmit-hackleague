'use client';

import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '../ui/brand-logo';
import { IconButton } from '../ui/icon-button';

export interface AppHeaderProps {
  roleTitle: string;
  roleBadge?: React.ReactNode;
  userName?: string;
  userRole?: string;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export function AppHeader({
  roleTitle,
  roleBadge,
  userName = 'Demo User',
  userRole = 'Preview Account',
  onToggleSidebar,
  isSidebarOpen = false,
}: AppHeaderProps) {
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

        {/* User profile capsule (Demo Presentation) */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-surface-muted border border-border-subtle flex items-center justify-center font-semibold text-xs text-text-primary select-none">
            {userName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-medium text-text-primary leading-tight">
              {userName}
            </span>
            <span className="text-[11px] text-text-helper leading-tight">
              {userRole}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
