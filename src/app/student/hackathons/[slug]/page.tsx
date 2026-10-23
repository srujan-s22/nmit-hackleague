import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireApprovedStudent } from '@/lib/auth/guards';
import { StudentShell } from '@/components/shells/student-shell';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RegistrationStateBadge } from '@/components/hackathons/registration-state-badge';
import {
  computeRegistrationState,
  computeEventTimingState,
} from '@/lib/hackathons/registration-state';
import type {
  HackathonPublicView,
  HackathonRoundPublicView,
  PrizeTier,
} from '@/types/hackathon';
import { getStudentTeams } from '@/lib/teams/queries';

interface StudentEventDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: StudentEventDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('hackathons_public_view')
    .select('title, tagline')
    .eq('slug', slug)
    .single();

  if (!data) {
    return { title: 'Hackathon Not Found | NMIT HackLeague' };
  }

  return {
    title: `${data.title} | NMIT HackLeague`,
    description: data.tagline || `Details and registration for ${data.title}.`,
  };
}

export default async function StudentEventDetailPage({ params }: StudentEventDetailPageProps) {
  const { profile } = await requireApprovedStudent();
  const { slug } = await params;
  const supabase = await createClient();

  // Queries public view only (drafts are excluded; private fields omitted)
  const { data: hackathon, error: hError } = await supabase
    .from('hackathons_public_view')
    .select('*')
    .eq('slug', slug)
    .single();

  if (hError || !hackathon || !hackathon.id) {
    notFound();
  }

  const { data: rounds } = await supabase
    .from('hackathon_rounds_public_view')
    .select('*')
    .eq('hackathon_id', hackathon.id)
    .order('round_number', { ascending: true });

  const h = hackathon as HackathonPublicView;
  const roundList = (rounds as HackathonRoundPublicView[]) || [];
  const prizesDetail = (Array.isArray(h.prizes_detail) ? h.prizes_detail : []) as unknown as PrizeTier[];

  const regState = computeRegistrationState(
    h.status,
    h.registration_start_at || new Date().toISOString(),
    h.registration_end_at || new Date().toISOString()
  );

  const timingState = computeEventTimingState(
    h.event_start_at || new Date().toISOString(),
    h.event_end_at || new Date().toISOString()
  );

  const isOpenForRegistration = regState === 'OPEN';

  // Check if current student already belongs to a team for this hackathon
  const studentTeams = await getStudentTeams(h.id || undefined);
  const existingTeam = studentTeams[0] || null;

  return (
    <StudentShell currentPath="/student/hackathons" studentProfile={profile}>
      <div className="max-w-5xl space-y-6">
        <Link
          href="/student/hackathons"
          className="text-xs text-brand-primary hover:underline flex items-center gap-1 mb-4"
        >
          &larr; Back to All Hackathons
        </Link>

      {/* Hero Header */}
      <div className="bg-surface-canvas rounded-lg border border-border-subtle p-6 md:p-8 mb-8 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge
            variant={h.mode === 'online' ? 'info' : h.mode === 'hybrid' ? 'neutral' : 'success'}
            size="md"
            className="capitalize"
          >
            {h.mode} Mode
          </Badge>
          <RegistrationStateBadge state={regState} />
          {timingState === 'TIMING_IN_PROGRESS' && (
            <Badge variant="warning" size="md">
              ⚡ Event In Progress
            </Badge>
          )}
          {timingState === 'TIMING_CONCLUDED' && (
            <Badge variant="neutral" size="md">
              🏁 Concluded
            </Badge>
          )}
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">
          {h.title}
        </h1>

        {h.tagline && (
          <p className="text-base text-text-secondary mt-2 max-w-3xl leading-relaxed">
            {h.tagline}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 text-xs text-text-secondary pt-3 border-t border-border-subtle/60">
          <div>
            <span className="text-text-muted">Organized by:</span>{' '}
            <strong className="text-text-primary">{h.organizer}</strong>
          </div>
          {h.venue && (
            <div>
              <span className="text-text-muted">Venue:</span>{' '}
              <strong className="text-text-primary">📍 {h.venue}</strong>
            </div>
          )}
          <div>
            <span className="text-text-muted">Timezone:</span>{' '}
            <span className="text-text-primary font-mono">{h.timezone}</span>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-border-subtle/60">
          {existingTeam ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/student/teams/${existingTeam.id}`}
                className="px-5 py-2.5 rounded-sm text-sm font-semibold bg-surface-inverse text-text-inverse hover:bg-neutral-800 transition-colors inline-flex items-center gap-2 shadow-xs"
              >
                <span>Manage Team ({existingTeam.name})</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>

              {existingTeam.is_leader ? (
                <Badge variant="info" size="md">Team Leader</Badge>
              ) : (
                <Badge variant="neutral" size="md">Team Member</Badge>
              )}

              {existingTeam.external_status === 'verified' && (
                <Badge variant="success" dot size="md">Registration Approved</Badge>
              )}
              {existingTeam.external_status === 'submitted' && (
                <Badge variant="info" dot size="md">Proof Under Review</Badge>
              )}
              {existingTeam.external_status === 'rejected' && (
                <Badge variant="error" dot size="md">Proof Rejected</Badge>
              )}
              {existingTeam.external_status === 'not_submitted' && (
                <Badge variant="warning" dot size="md">Proof Required</Badge>
              )}
            </div>
          ) : isOpenForRegistration ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/student/teams?action=create&hackathon=${h.id}`}
                className="px-5 py-2.5 rounded-sm text-sm font-semibold bg-surface-inverse text-text-inverse hover:bg-neutral-800 transition-colors inline-flex items-center gap-1.5 shadow-xs"
              >
                <span>Create Team</span>
              </Link>
              <Link
                href="/student/teams?action=join"
                className="px-4 py-2.5 rounded-sm text-sm font-semibold bg-surface-subtle hover:bg-surface-muted text-text-primary border border-border-subtle transition-colors inline-flex items-center gap-1.5"
              >
                <span>Join with Code</span>
              </Link>
            </div>
          ) : (
            <span className="px-5 py-2.5 rounded-sm text-sm font-semibold bg-surface-subtle text-text-muted cursor-not-allowed">
              Registration Closed
            </span>
          )}

          {h.external_registration_url && (
            <a
              href={h.external_registration_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-sm text-sm font-medium border border-border-subtle bg-surface-subtle hover:bg-surface-canvas text-text-primary transition-colors flex items-center gap-1.5"
            >
              External Portal ↗
            </a>
          )}

          {h.community_url && (
            <a
              href={h.community_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-sm text-sm font-medium border border-border-subtle bg-surface-subtle hover:bg-surface-canvas text-text-primary transition-colors flex items-center gap-1.5"
            >
              💬 Community Group ↗
            </a>
          )}
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Event details, rounds, eligibility */}
        <div className="lg:col-span-2 space-y-8">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle>About the Competition</CardTitle>
            </CardHeader>
            <div className="p-6 text-sm text-text-primary leading-relaxed whitespace-pre-line">
              {h.description}
            </div>
          </Card>

          {/* Sequential Rounds Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Evaluation Rounds & Stages</CardTitle>
            </CardHeader>
            <div className="p-6">
              {roundList.length === 0 ? (
                <p className="text-xs text-text-secondary">Rounds are being finalized by event organizers.</p>
              ) : (
                <div className="space-y-6 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-border-subtle">
                  {roundList.map((round) => (
                    <div key={round.id} className="relative flex items-start gap-4 pl-8">
                      <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-surface-canvas border-2 border-brand-primary flex items-center justify-center text-[10px] font-bold text-brand-primary">
                        {round.round_number}
                      </div>

                      <div className="flex-1 bg-surface-subtle/60 rounded-md p-4 border border-border-subtle">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <h4 className="text-sm font-bold text-text-primary">
                            {round.name}
                          </h4>
                          {round.is_final_round && (
                            <Badge variant="warning" size="sm">
                              🏆 Grand Finale Round
                            </Badge>
                          )}
                        </div>

                        {round.description && (
                          <p className="text-xs text-text-secondary leading-relaxed mb-3">
                            {round.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-text-muted">
                          <span>
                            Starts: {new Date(round.start_at || '').toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span>&bull;</span>
                          <span>
                            Ends: {new Date(round.end_at || '').toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Eligibility Criteria */}
          {h.eligibility && (
            <Card>
              <CardHeader>
                <CardTitle>Eligibility Criteria</CardTitle>
              </CardHeader>
              <div className="p-6 text-sm text-text-primary leading-relaxed whitespace-pre-line">
                {h.eligibility}
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Key dates, team size, prizes */}
        <div className="space-y-6">
          {/* Key Dates Card */}
          <Card>
            <CardHeader>
              <CardTitle>Important Dates</CardTitle>
            </CardHeader>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <span className="text-text-secondary block">Registration Opens</span>
                <span className="font-semibold text-text-primary">
                  {new Date(h.registration_start_at || '').toLocaleString()}
                </span>
              </div>
              <div className="pt-2 border-t border-border-subtle/50">
                <span className="text-text-secondary block">Registration Deadline</span>
                <span className="font-semibold text-status-error-text">
                  {new Date(h.registration_end_at || '').toLocaleString()}
                </span>
              </div>
              <div className="pt-2 border-t border-border-subtle/50">
                <span className="text-text-secondary block">Event Starts</span>
                <span className="font-semibold text-text-primary">
                  {new Date(h.event_start_at || '').toLocaleString()}
                </span>
              </div>
              <div className="pt-2 border-t border-border-subtle/50">
                <span className="text-text-secondary block">Event Conclusion</span>
                <span className="font-semibold text-text-primary">
                  {new Date(h.event_end_at || '').toLocaleString()}
                </span>
              </div>
            </div>
          </Card>

          {/* Team Formation Card */}
          <Card>
            <CardHeader>
              <CardTitle>Team Formation</CardTitle>
            </CardHeader>
            <div className="p-5 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-text-secondary">Team Size:</span>
                <span className="font-semibold text-text-primary">
                  {h.min_team_size === h.max_team_size
                    ? `${h.min_team_size} members`
                    : `${h.min_team_size} to ${h.max_team_size} members`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Solo Entries:</span>
                <span className="font-medium text-text-primary">
                  {h.is_solo_allowed ? 'Allowed' : 'Team Required'}
                </span>
              </div>
            </div>
          </Card>

          {/* Prizes Breakdown Card */}
          {(prizesDetail.length > 0 || h.prizes_summary) && (
            <Card>
              <CardHeader>
                <CardTitle>Prizes & Recognition</CardTitle>
              </CardHeader>
              <div className="p-5 space-y-3">
                {h.prizes_summary && (
                  <p className="text-xs font-semibold text-text-primary">
                    {h.prizes_summary}
                  </p>
                )}

                {prizesDetail.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {prizesDetail.map((prize, idx) => (
                      <div
                        key={idx}
                        className="bg-surface-subtle p-3 rounded-sm border border-border-subtle text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-text-primary">{prize.placement}</span>
                          <span className="font-mono font-bold text-status-success-text">{prize.reward}</span>
                        </div>
                        {prize.description && (
                          <p className="text-[11px] text-text-secondary mt-1">
                            {prize.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  </StudentShell>
);
}
