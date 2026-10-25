'use client';
/* eslint-disable @next/next/no-img-element */

// Shared building blocks for the student-detail view, previously duplicated
// almost line-for-line between src/app/admin/students/[id]/student-detail-client.tsx
// (standalone page) and the inline detail dialog in
// src/app/admin/students/student-directory-client.tsx (directory list).
// Each consumer keeps its own surrounding layout (Card-grid page vs. compact
// Dialog) and visual sizing exactly as before — only the repeated icon SVGs,
// phone-copy logic, and competition-history list logic are centralized here.

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StudentDetailView } from '@/actions/student-directory-actions';

export function useCopyToClipboard(resetAfterMs = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), resetAfterMs);
  };
  return { copied, copy };
}

export function StudentAvatar({
  avatarUrl,
  fullName,
  sizeClassName = 'w-16 h-16',
  initialsClassName = 'text-lg',
}: {
  avatarUrl: string | null;
  fullName: string;
  sizeClassName?: string;
  initialsClassName?: string;
}) {
  return (
    <div
      className={`${sizeClassName} rounded-full bg-surface-muted shrink-0 flex items-center justify-center border-2 border-border-subtle overflow-hidden`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={fullName} className="w-full h-full object-cover" />
      ) : (
        <span className={`font-bold text-text-primary ${initialsClassName}`}>
          {fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

const LinkedInIcon = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.62 1.62 0 0 0-1.62 1.62 1.62 1.62 0 0 0 1.62 1.62 1.62 1.62 0 0 0 1.62-1.62c0-.9-.73-1.62-1.62-1.62Z" />
  </svg>
);

const GitHubIcon = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

const ExternalLinkIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

export function StudentSocialLinks({
  linkedinUrl,
  githubUrl,
  size = 'md',
}: {
  linkedinUrl: string | null;
  githubUrl: string | null;
  // 'md' = standalone page's original layout: icon beside a label-above-link
  // stacked block. 'sm' = directory dialog's original layout: icon+label on
  // the left, link/value right-aligned via justify-between. Each preserves
  // its page's exact prior visual arrangement, not just font-size scaling.
  size?: 'sm' | 'md';
}) {
  if (size === 'sm') {
    const rowClass = 'p-3 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-between';
    const linkClass = 'text-xs font-medium text-brand-primary hover:underline flex items-center gap-1 truncate max-w-[200px]';
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={rowClass}>
          <div className="flex items-center gap-2">
            <LinkedInIcon className="w-4 h-4 text-[#0A66C2]" />
            <span className="text-xs font-semibold text-text-secondary">LinkedIn:</span>
          </div>
          {linkedinUrl ? (
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {linkedinUrl.replace(/^https?:\/\/(www\.)?/, '')}
              <ExternalLinkIcon className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <span className="text-xs text-text-helper italic">Not linked</span>
          )}
        </div>

        <div className={rowClass}>
          <div className="flex items-center gap-2">
            <GitHubIcon className="w-4 h-4 text-text-primary" />
            <span className="text-xs font-semibold text-text-secondary">GitHub:</span>
          </div>
          {githubUrl ? (
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {githubUrl.replace(/^https?:\/\/(www\.)?/, '')}
              <ExternalLinkIcon className="w-3 h-3 shrink-0" />
            </a>
          ) : (
            <span className="text-xs text-text-helper italic">Not linked</span>
          )}
        </div>
      </div>
    );
  }

  const rowClass = 'p-4 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-between';
  const linkClass = 'text-xs font-medium text-brand-primary hover:underline flex items-center gap-1';

  return (
    <div className="space-y-4">
      <div className={rowClass}>
        <div className="flex items-center gap-3">
          <LinkedInIcon className="w-5 h-5 text-[#0A66C2] shrink-0" />
          <div>
            <span className="text-xs font-semibold text-text-secondary block">LinkedIn</span>
            {linkedinUrl ? (
              <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {linkedinUrl.replace(/^https?:\/\/(www\.)?/, '')}
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-xs text-text-helper italic">Not linked by student</span>
            )}
          </div>
        </div>
      </div>

      <div className={rowClass}>
        <div className="flex items-center gap-3">
          <GitHubIcon className="w-5 h-5 text-text-primary shrink-0" />
          <div>
            <span className="text-xs font-semibold text-text-secondary block">GitHub</span>
            {githubUrl ? (
              <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {githubUrl.replace(/^https?:\/\/(www\.)?/, '')}
                <ExternalLinkIcon className="w-3 h-3" />
              </a>
            ) : (
              <span className="text-xs text-text-helper italic">Not linked by student</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudentCompetitionHistory({
  competitions,
  emptyMessage = 'This student has not yet registered for any hackathons on NMIT HackLeague.',
  variant = 'standalone',
}: {
  competitions: StudentDetailView['competitions'];
  emptyMessage?: string;
  // Each page's original text format/sizing is preserved exactly (no visual
  // change on either consumer) — 'standalone' matches the full-page layout,
  // 'compact' matches the detail-dialog layout.
  variant?: 'standalone' | 'compact';
}) {
  if (competitions.length === 0) {
    return variant === 'compact' ? (
      <div className="p-4 rounded-lg bg-surface-subtle text-center text-xs text-text-helper">
        No hackathon team registrations on record.
      </div>
    ) : (
      <p className="text-xs text-text-helper italic py-4 text-center">{emptyMessage}</p>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {competitions.map((comp) => (
          <div
            key={comp.team_id}
            className="p-3 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-between text-xs"
          >
            <div>
              <span className="font-semibold text-text-primary block">{comp.hackathon_title}</span>
              <span className="text-text-secondary">
                Team: <span className="font-medium text-text-primary">{comp.team_name}</span> ({comp.role === 'leader' ? 'Leader' : 'Member'})
              </span>
            </div>
            <Badge
              variant={comp.team_status === 'verified' || comp.team_status === 'active' ? 'success' : 'neutral'}
              size="sm"
            >
              {comp.team_status}
            </Badge>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {competitions.map((comp) => (
        <div
          key={comp.team_id}
          className="p-4 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-between"
        >
          <div>
            <h4 className="text-sm font-semibold text-text-primary">{comp.hackathon_title}</h4>
            <p className="text-xs text-text-secondary mt-0.5">
              Team: <span className="font-medium text-text-primary">{comp.team_name}</span> • Role:{' '}
              <span className="capitalize font-medium text-text-primary">{comp.role}</span>
            </p>
          </div>
          <Badge variant={comp.team_status === 'verified' || comp.team_status === 'active' ? 'success' : 'neutral'}>
            {comp.team_status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function StudentPhoneRow({
  phone,
  compact = false,
}: {
  phone: string | null;
  compact?: boolean;
}) {
  const { copied, copy } = useCopyToClipboard();
  const boxClass = compact
    ? 'p-3 rounded bg-surface-primary border border-border-subtle'
    : 'p-4 rounded-lg bg-surface-primary border border-border-subtle';
  const btnClass = compact ? 'h-7 text-xs px-2' : '';
  const actionClass = compact
    ? 'inline-flex items-center justify-center h-7 px-2 text-xs rounded border border-border-subtle bg-surface-subtle hover:bg-surface-muted transition-colors text-text-primary'
    : 'inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md border border-border-subtle bg-surface-subtle hover:bg-surface-muted transition-colors text-text-primary';

  return (
    <div className={boxClass}>
      <span className="text-[11px] text-text-secondary font-semibold block">Verified Mobile Phone</span>
      <div className="flex items-center justify-between mt-1">
        <span className="font-mono text-sm font-bold text-text-primary">{phone || 'None linked'}</span>
        {phone && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => copy(phone)} className={btnClass}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <a href={`tel:${phone}`} className={actionClass}>
              Call
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function StudentEmailRow({
  email,
  compact = false,
}: {
  email: string;
  compact?: boolean;
}) {
  const boxClass = compact
    ? 'p-3 rounded bg-surface-primary border border-border-subtle'
    : 'p-4 rounded-lg bg-surface-primary border border-border-subtle';
  const actionClass = compact
    ? 'inline-flex items-center justify-center h-7 px-2 text-xs rounded border border-border-subtle bg-surface-subtle hover:bg-surface-muted transition-colors text-text-primary'
    : 'inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md border border-border-subtle bg-surface-subtle hover:bg-surface-muted transition-colors text-text-primary';
  const emailTextClass = compact
    ? 'text-sm font-medium text-text-primary truncate max-w-[200px]'
    : 'text-sm font-medium text-text-primary truncate max-w-[240px]';

  return (
    <div className={boxClass}>
      <span className="text-[11px] text-text-secondary font-semibold block">Institutional Email</span>
      <div className="flex items-center justify-between mt-1">
        <span className={emailTextClass} title={email}>
          {email}
        </span>
        <a href={`mailto:${email}`} className={actionClass}>
          {compact ? 'Email' : 'Send Email'}
        </a>
      </div>
    </div>
  );
}
