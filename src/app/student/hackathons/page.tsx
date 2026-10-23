import React from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { StudentShell } from '@/components/shells/student-shell';
import { StudentHackathonsClient } from './student-hackathons-client';
import type { HackathonPublicView } from '@/types/hackathon';

export const metadata: Metadata = {
  title: 'Browse Hackathons | NMIT HackLeague',
  description: 'Explore upcoming institutional hackathons, find your next challenge, and form competitive teams.',
};

export default async function StudentHackathonsPage() {
  const { profile } = await requireApprovedStudent();
  const supabase = await createClient();

  // Queries public projection view hackathons_public_view
  // Drafts are filtered out at the SQL view level; private columns (created_by) are omitted
  const { data: hackathons, error } = await supabase
    .from('hackathons_public_view')
    .select('*')
    .order('event_start_at', { ascending: true });

  if (error) {
    console.error('Error fetching student hackathons from public view:', error);
  }

  return (
    <StudentShell currentPath="/student/hackathons" studentProfile={profile}>
      <div className="space-y-6">
        <StudentHackathonsClient initialHackathons={(hackathons as HackathonPublicView[]) || []} />
      </div>
    </StudentShell>
  );
}
