'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { clearClientSessionCache } from '@/lib/session/client-session-cache';

export interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badge?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface SidebarNavProps {
  sections: NavSection[];
  currentPath?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

function isRouteActive(currentPath: string, itemHref: string): boolean {
  if (!currentPath || !itemHref) return false;
  if (currentPath === itemHref) return true;
  if (itemHref === '/admin' || itemHref === '/student' || itemHref === '/') {
    return false;
  }
  return currentPath.startsWith(itemHref + '/');
}

export function SidebarNav({
  sections,
  currentPath = '',
  isOpen = false,
  onClose,
}: SidebarNavProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    clearClientSessionCache();
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

  // Accessible Escape-key dismissal while mobile drawer is open
  useEffect(() => {
    if (!isOpen || !onClose) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const navContent = (
    <div className="flex flex-col h-full py-4 px-3 overflow-y-auto">
      <div className="flex-1">
        {sections.map((section, secIdx) => (
          <div key={secIdx} className="mb-6 last:mb-0">
            {section.title && (
              <h5 className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-text-helper uppercase select-none">
                {section.title}
              </h5>
            )}
            <nav className="flex flex-col gap-0.5">
              {section.items.map((item, itemIdx) => {
                const isActive = isRouteActive(currentPath, item.href);
                return (
                  <Link
                    key={itemIdx}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center justify-between px-3 py-2 rounded-sm text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus ${
                      isActive
                        ? 'bg-surface-subtle text-text-primary font-medium border-l-2 border-text-primary pl-2.5 shadow-xs'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      {item.icon && (
                        <span className="w-4 h-4 shrink-0 text-text-secondary" aria-hidden="true">
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[11px] font-medium px-1.5 py-0.2 rounded-xs bg-surface-muted text-text-secondary">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      {/* Accessible Sidebar Sign Out action */}
      <div className="mt-auto pt-4 border-t border-border-subtle">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          aria-label="Sign out of account"
          className="flex w-full items-center gap-2.5 px-3 py-2 rounded-sm text-sm text-text-secondary hover:text-status-error-text hover:bg-surface-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-border-focus disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="w-4 h-4 shrink-0 text-text-secondary" aria-hidden="true">
            {isSigningOut ? (
              <svg className="animate-spin w-4 h-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            )}
          </span>
          <span className="font-medium">{isSigningOut ? 'Signing out...' : 'Sign Out'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-border-subtle bg-surface-canvas min-h-[calc(100vh-64px)]">
        {navContent}
      </aside>

      {/* Mobile Drawer Backdrop & Container */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-surface-inverse/45 backdrop-blur-xs transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer Content */}
          <aside
            className="fixed inset-y-0 left-0 w-64 max-w-[80vw] bg-surface-canvas border-r border-border-subtle shadow-dialog z-50 flex flex-col"
            aria-label="Mobile Navigation"
          >
            <div className="p-4 border-b border-border-subtle flex items-center justify-between">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Menu Navigation
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="p-1 rounded-sm text-text-secondary hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
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
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
