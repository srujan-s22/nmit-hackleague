'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StudentDetailView } from '@/actions/student-directory-actions';

interface StudentDetailStandaloneClientProps {
  initialData: StudentDetailView;
}

export function StudentDetailStandaloneClient({ initialData }: StudentDetailStandaloneClientProps) {
  const [copiedPhone, setCopiedPhone] = useState(false);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link href="/admin/students">
          <Button variant="outline" size="sm" className="gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Student Directory
          </Button>
        </Link>
      </div>

      {/* 1. Header Identity Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-surface-muted shrink-0 flex items-center justify-center border-2 border-border-subtle overflow-hidden">
              {initialData.avatar_url ? (
                <img
                  src={initialData.avatar_url}
                  alt={initialData.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xl font-bold text-text-primary">
                  {initialData.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-text-primary">{initialData.full_name}</h1>
                <Badge variant="success" dot>
                  Approved & Verified
                </Badge>
              </div>
              <p className="text-sm font-mono font-medium text-text-secondary">
                Official USN: <span className="text-text-primary font-semibold">{initialData.usn}</span>
              </p>
              <p className="text-xs text-text-secondary">
                {initialData.branch} Department • Year {initialData.academic_year} • {initialData.sex || 'Not Specified'}
              </p>
            </div>

            <div className="text-right border-t sm:border-t-0 sm:border-l border-border-subtle pt-4 sm:pt-0 sm:pl-6 w-full sm:w-auto">
              <span className="text-[11px] text-text-secondary uppercase tracking-wider block font-semibold">
                Total Points
              </span>
              <span className="text-2xl font-bold text-brand-primary">
                {initialData.total_points.toLocaleString()} pts
              </span>
              {initialData.rank !== null && (
                <span className="text-xs text-text-secondary block font-medium">
                  Platform Rank #{initialData.rank}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Confidential Verified Contact Information (Phone strictly in this view) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-brand-primary/20 bg-brand-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-brand-primary flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Verified Contact Details
              </CardTitle>
              <Badge variant="neutral" size="sm">
                Restricted Access
              </Badge>
            </div>
            <CardDescription>
              Emergency contact channels verified during institutional onboarding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-surface-primary border border-border-subtle">
              <span className="text-xs font-semibold text-text-secondary block">
                Verified Mobile Phone
              </span>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-base font-bold text-text-primary">
                  {initialData.phone || 'None linked'}
                </span>
                {initialData.phone && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyPhone(initialData.phone)}
                    >
                      {copiedPhone ? 'Copied' : 'Copy'}
                    </Button>
                    <a
                      href={`tel:${initialData.phone}`}
                      className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md border border-border-subtle bg-surface-subtle hover:bg-surface-muted transition-colors text-text-primary"
                    >
                      Call
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-surface-primary border border-border-subtle">
              <span className="text-xs font-semibold text-text-secondary block">
                Institutional Email
              </span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-medium text-text-primary truncate max-w-[240px]">
                  {initialData.email}
                </span>
                <a
                  href={`mailto:${initialData.email}`}
                  className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-medium rounded-md border border-border-subtle bg-surface-subtle hover:bg-surface-muted transition-colors text-text-primary"
                >
                  Send Email
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Professional Profiles Card */}
        <Card>
          <CardHeader>
            <CardTitle>Professional Online Presence</CardTitle>
            <CardDescription>
              Public profiles provided by the student to demonstrate technical work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-[#0A66C2] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.45a1.62 1.62 0 0 0-1.62 1.62 1.62 1.62 0 0 0 1.62 1.62 1.62 1.62 0 0 0 1.62-1.62c0-.9-.73-1.62-1.62-1.62Z" />
                </svg>
                <div>
                  <span className="text-xs font-semibold text-text-secondary block">LinkedIn</span>
                  {initialData.linkedin_url ? (
                    <a
                      href={initialData.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brand-primary hover:underline flex items-center gap-1"
                    >
                      {initialData.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-xs text-text-helper italic">Not linked by student</span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-text-primary shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <div>
                  <span className="text-xs font-semibold text-text-secondary block">GitHub</span>
                  {initialData.github_url ? (
                    <a
                      href={initialData.github_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-brand-primary hover:underline flex items-center gap-1"
                    >
                      {initialData.github_url.replace(/^https?:\/\/(www\.)?/, '')}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <span className="text-xs text-text-helper italic">Not linked by student</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 4. Competition History Card */}
      <Card>
        <CardHeader>
          <CardTitle>Hackathon Participation History</CardTitle>
          <CardDescription>
            Record of competitions, registered team names, and leadership roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialData.competitions.length === 0 ? (
            <p className="text-xs text-text-helper italic py-4 text-center">
              This student has not yet registered for any hackathons on NMIT HackLeague.
            </p>
          ) : (
            <div className="space-y-3">
              {initialData.competitions.map((comp) => (
                <div
                  key={comp.team_id}
                  className="p-4 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-text-primary">
                      {comp.hackathon_title}
                    </h4>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Team: <span className="font-medium text-text-primary">{comp.team_name}</span> • Role:{' '}
                      <span className="capitalize font-medium text-text-primary">{comp.role}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={comp.team_status === 'verified' || comp.team_status === 'active' ? 'success' : 'neutral'}>
                      {comp.team_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
