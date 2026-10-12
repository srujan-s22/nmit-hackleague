import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Preview Workspace — NMIT HackLeague',
  description: 'Internal design system and shell preview environment.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-surface-canvas text-text-primary">
      {/* Required Phase 2 Global Preview Alert Banner */}
      <aside
        aria-label="Preview Environment Notice"
        className="bg-surface-subtle text-text-primary px-4 py-2 text-xs border-b border-border-subtle flex items-center justify-between select-none sticky top-0 z-50 shadow-xs"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-brand-nmit-blue" aria-hidden="true" />
          <span className="font-semibold tracking-wide">
            [PREVIEW WORKSPACE]
          </span>
          <span className="text-text-secondary hidden sm:inline">
            — Internal UI verification only. All data is demonstration-only. Not a production feature.
          </span>
        </div>
        <span className="text-[11px] font-mono text-text-helper bg-surface-muted px-2 py-0.5 rounded-xs border border-border-subtle">
          PHASE 02 SPEC
        </span>
      </aside>

      <div className="flex-1">
        {children}
      </div>
    </div>
  );
}
