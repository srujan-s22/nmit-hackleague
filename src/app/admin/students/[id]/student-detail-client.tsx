'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StudentDetailView } from '@/actions/student-directory-actions';
import {
  StudentAvatar,
  StudentSocialLinks,
  StudentCompetitionHistory,
  StudentPhoneRow,
  StudentEmailRow,
} from '@/components/students/student-detail-shared';

interface StudentDetailStandaloneClientProps {
  initialData: StudentDetailView;
}

export function StudentDetailStandaloneClient({ initialData }: StudentDetailStandaloneClientProps) {
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
            <StudentAvatar
              avatarUrl={initialData.avatar_url}
              fullName={initialData.full_name}
              sizeClassName="w-20 h-20"
              initialsClassName="text-xl"
            />

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
            <StudentPhoneRow phone={initialData.phone} />
            <StudentEmailRow email={initialData.email} />
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
          <CardContent>
            <StudentSocialLinks linkedinUrl={initialData.linkedin_url} githubUrl={initialData.github_url} size="md" />
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
          <StudentCompetitionHistory competitions={initialData.competitions} />
        </CardContent>
      </Card>
    </div>
  );
}
