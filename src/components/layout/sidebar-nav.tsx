'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';

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

export function SidebarNav({
  sections,
  currentPath = '',
  isOpen = false,
  onClose,
}: SidebarNavProps) {
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
      {sections.map((section, secIdx) => (
        <div key={secIdx} className="mb-6 last:mb-0">
          {section.title && (
            <h5 className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-text-helper uppercase select-none">
              {section.title}
            </h5>
          )}
          <nav className="flex flex-col gap-0.5">
            {section.items.map((item, itemIdx) => {
              const isActive = currentPath === item.href;
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
