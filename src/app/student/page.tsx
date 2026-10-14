import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { StudentShell } from '@/components/shells/student-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EventCard } from '@/components/hackathons/event-card';
import type { HackathonPublicView } from '@/types/hackathon';

export const metadata: Metadata = {
  title: 'Student Workspace — NMIT HackLeague',
};

export default async function StudentPortalPage() {
  const { profile } = await requireApprovedStudent();
  const supabase = await createClient();

  // Query up to 3 upcoming/open hackathons via safe public projection view
  const { data: upcomingEvents } = await supabase
    .from('hackathons_public_view')
    .select('*')
    .order('event_start_at', { ascending: true })
    .limit(3);

  const events = (upcomingEvents as HackathonPublicView[]) || [];

  return (
    <StudentShell currentPath="/student">
      <div className="space-y-6">
        <PageHeader
          title={`Welcome back, ${profile.full_name}`}
          description={`USN: ${profile.usn} • ${profile.branch} Department • Year ${profile.academic_year}`}
          breadcrumbs={[
            { label: 'Portal Hub', href: '/' },
            { label: 'Student Workspace' },
          ]}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between mb-1">
                <Badge variant="success" dot>Institutional Verified</Badge>
              </div>
              <CardTitle>Account Status</CardTitle>
              <CardDescription>Verified Student Profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Official USN:</span>
                <span className="font-mono font-medium text-text-primary">{profile.usn}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Branch:</span>
                <span className="font-medium text-text-primary">{profile.branch}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border-subtle">
                <span className="text-text-secondary">Academic Year:</span>
                <span className="font-medium text-text-primary">Year {profile.academic_year}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-text-secondary">Verified Email:</span>
                <span className="font-medium text-text-primary">{profile.email}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Upcoming Competitions</CardTitle>
                  <CardDescription>
                    Explore active hackathons and start forming your team.
                  </CardDescription>
                </div>
                <Link
                  href="/student/hackathons"
                  className="text-xs font-semibold text-brand-primary hover:underline"
                >
                  View All &rarr;
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <div className="bg-surface-subtle border border-border-subtle rounded-md p-6 text-center text-xs text-text-secondary">
                  <p className="font-medium text-text-primary mb-1">
                    No active competitions yet
                  </p>
                  <p>
                    New departmental and college-wide hackathons will appear here once published.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {events.slice(0, 2).map((event) => (
                    <EventCard key={event.id} hackathon={event} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentShell>
  );
}
