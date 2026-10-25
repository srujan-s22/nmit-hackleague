import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/shells/admin-shell';
import { SuperAdminShell } from '@/components/shells/super-admin-shell';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RegistrationStateBadge } from '@/components/hackathons/registration-state-badge';
import {
  computeRegistrationState,
  computeEventTimingState,
} from '@/lib/hackathons/registration-state';
import { formatDateTime, formatDateRange } from '@/lib/utils/date-format';
import type { Hackathon, HackathonRound } from '@/types/hackathon';

interface HackathonDetailsPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: HackathonDetailsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const supabase = await createClient();

  const { data } = await supabase
    .from('hackathons')
    .select('title, tagline')
    .eq('slug', decodedSlug)
    .maybeSingle();

  if (!data) {
    return { title: 'Hackathon Not Found | NMIT HackLeague' };
  }

  return {
    title: `${data.title} — Details | NMIT HackLeague`,
    description: data.tagline || `Event details, schedule, and rounds for ${data.title}.`,
  };
}

export default async function HackathonDetailsPage({ params }: HackathonDetailsPageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const supabase = await createClient();

  // 1. Authenticate caller
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/hackathons/${encodeURIComponent(decodedSlug)}`);
  }

  // 2. Resolve admin profile & permissions
  const { data: admin } = await supabase
    .from('admin_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const isSuperAdmin = Boolean(admin?.is_super_admin && admin?.is_active);
  const isActiveAdmin = Boolean(admin?.is_active);

  // If user is a student, route to the dedicated student details page
  if (!isActiveAdmin) {
    const { data: student } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (student) {
      redirect(`/student/hackathons/${encodeURIComponent(decodedSlug)}`);
    } else {
      notFound();
    }
  }

  // Fetch admin permissions
  const { data: permissionsData } = await supabase
    .from('admin_permissions')
    .select('permission')
    .eq('admin_id', user.id);
  const permissions = (permissionsData || []).map((p) => p.permission);

  // 3. Query hackathon details by slug
  const { data: hackathon, error: hError } = await supabase
    .from('hackathons')
    .select('*')
    .eq('slug', decodedSlug)
    .maybeSingle();

  if (hError || !hackathon) {
    notFound();
  }

  const h = hackathon as Hackathon;

  // 4. Privacy & Authorization Check for Draft Hackathons
  // Draft hackathons are private and strictly hidden unless:
  // - Viewer is Super Admin
  // - Viewer is designated in_charge_admin
  // - Viewer is assigned in hackathon_admin_assignments
  let isAssigned = isSuperAdmin || h.in_charge_admin_id === admin?.id;

  if (!isAssigned && admin) {
    const { data: assignment } = await supabase
      .from('hackathon_admin_assignments')
      .select('id')
      .eq('hackathon_id', h.id)
      .eq('admin_id', admin.id)
      .maybeSingle();

    if (assignment) {
      isAssigned = true;
    }
  }

  if (h.status === 'draft' && !isSuperAdmin && !isAssigned) {
    // Unassigned ordinary admins cannot view unpublished draft hackathons
    notFound();
  }

  // 5. Query all configured rounds in sequential order
  const { data: rawRounds } = await supabase
    .from('hackathon_rounds')
    .select('*')
    .eq('hackathon_id', h.id)
    .order('round_number', { ascending: true });

  const rounds = (rawRounds as HackathonRound[]) || [];

  // 6. Compute lifecycle & timing states
  const regState = computeRegistrationState(
    h.status,
    h.registration_start_at || new Date().toISOString(),
    h.registration_end_at || new Date().toISOString()
  );

  const timingState = computeEventTimingState(
    h.event_start_at || new Date().toISOString(),
    h.event_end_at || new Date().toISOString()
  );

  const canReview = isSuperAdmin || isAssigned;

  const content = (
    <div className="max-w-5xl space-y-6">
      {/* Back navigation */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/admin/hackathons"
          className="text-xs text-brand-primary hover:underline flex items-center gap-1"
        >
          &larr; Back to Hackathons Catalog
        </Link>

        {/* Quick action buttons for authorized viewers */}
        <div className="flex items-center gap-2">
          {canReview && (
            <>
              <Link
                href={`/admin/hackathons/${h.id}/teams`}
                className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors"
                id="btn-nav-teams"
              >
                Registered Teams &rarr;
              </Link>
              <Link
                href={`/admin/hackathons/${h.id}/submissions`}
                className="text-xs font-semibold px-3 py-1.5 rounded bg-surface-subtle border border-border-subtle text-text-primary hover:bg-surface-canvas transition-colors"
                id="btn-nav-submissions"
              >
                Submissions Queue &rarr;
              </Link>
            </>
          )}

          {/* Super Admin management links */}
          {isSuperAdmin && (
            <>
              <Link
                href={`/admin/hackathons/${h.id}/edit`}
                className="text-xs font-semibold px-3 py-1.5 rounded bg-surface-subtle border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
                id="btn-nav-edit"
              >
                Edit
              </Link>
              <Link
                href={`/admin/hackathons/${h.id}/rounds`}
                className="text-xs font-semibold px-3 py-1.5 rounded bg-surface-subtle border border-border-subtle text-text-secondary hover:text-text-primary transition-colors"
                id="btn-nav-rounds"
              >
                Rounds
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Hero Header */}
      <div className="bg-surface-canvas rounded-lg border border-border-subtle p-6 md:p-8 shadow-xs">
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
          {h.status === 'draft' && (
            <Badge variant="neutral" size="md" className="bg-status-warning-bg text-status-warning-text border border-status-warning-border">
              Draft (Private)
            </Badge>
          )}
          {isAssigned && (
            <Badge variant="neutral" size="md" className="bg-brand-primary/10 text-brand-primary border-none">
              Assigned Reviewer
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
            <span className="text-text-primary font-mono">{h.timezone || 'Asia/Kolkata'}</span>
          </div>
          <div>
            <span className="text-text-muted">Identifier:</span>{' '}
            <span className="text-text-primary font-mono text-[11px]">/{h.slug}</span>
          </div>
        </div>

        {/* Action CTAs */}
        {h.external_registration_url && (
          <div className="mt-5 pt-4 border-t border-border-subtle flex items-center gap-3">
            <a
              href={h.external_registration_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded bg-brand-primary text-white hover:bg-brand-primary/90 transition-colors shadow-xs"
              id="btn-external-registration"
            >
              <span>External Registration Portal</span>
              <span className="text-[11px]">&nearr;</span>
            </a>
            <span className="text-xs text-text-muted">
              Official external registration website for participants.
            </span>
          </div>
        )}
      </div>

      {/* Grid: Overview & Rules */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Description & Eligibility */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6">
            <CardHeader className="p-0 pb-3">
              <CardTitle className="text-base font-semibold text-text-primary">
                About the Hackathon
              </CardTitle>
            </CardHeader>
            <div className="prose prose-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {h.description || 'No description provided.'}
            </div>
          </Card>

          {h.eligibility && (
            <Card className="p-6">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-base font-semibold text-text-primary">
                  Eligibility & Requirements
                </CardTitle>
              </CardHeader>
              <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
                {h.eligibility}
              </div>
            </Card>
          )}

          {/* Sequential Rounds Schedule */}
          <Card className="p-6">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold text-text-primary">
                    Competition Rounds & Milestones
                  </CardTitle>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Configured sequential evaluation stages for this hackathon.
                  </p>
                </div>
                <Badge variant="neutral" size="sm">
                  {rounds.length} {rounds.length === 1 ? 'Round' : 'Rounds'}
                </Badge>
              </div>
            </CardHeader>

            {rounds.length === 0 ? (
              <div className="p-6 text-center text-xs text-text-muted border border-dashed border-border-subtle rounded-md bg-surface-subtle">
                No evaluation rounds have been configured for this hackathon yet.
              </div>
            ) : (
              <div className="space-y-4">
                {rounds.map((round) => (
                  <div
                    key={round.id}
                    className="p-4 rounded-md border border-border-subtle bg-surface-canvas space-y-2 hover:border-border-strong transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand-primary/10 text-brand-primary text-xs font-bold font-mono">
                          {round.round_number}
                        </span>
                        <h4 className="font-semibold text-sm text-text-primary">
                          {round.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {round.is_final_round && (
                          <Badge variant="warning" size="sm">
                            🏆 Final Round
                          </Badge>
                        )}
                        <Badge
                          variant={round.status === 'in_progress' ? 'success' : 'neutral'}
                          size="sm"
                          className="capitalize text-[11px]"
                        >
                          {round.status ? round.status.replace('_', ' ') : 'Upcoming'}
                        </Badge>
                      </div>
                    </div>

                    {round.description && (
                      <p className="text-xs text-text-secondary leading-relaxed pl-8">
                        {round.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted pl-8 pt-1 border-t border-border-subtle/50">
                      <div>
                        <span>Starts: </span>
                        <strong className="text-text-primary font-medium">
                          {formatDateTime(round.start_at)}
                        </strong>
                      </div>
                      <div>
                        <span>Concludes: </span>
                        <strong className="text-text-primary font-medium">
                          {formatDateTime(round.end_at)}
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Col: Timeline & Team Rules */}
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary border-b border-border-subtle pb-2">
              Important Timelines
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-text-muted uppercase text-[10px] font-semibold block">
                  Registration Window
                </span>
                <span className="font-medium text-text-primary block mt-0.5">
                  {formatDateRange(h.registration_start_at, h.registration_end_at)}
                </span>
              </div>

              <div>
                <span className="text-text-muted uppercase text-[10px] font-semibold block">
                  Registration Deadline
                </span>
                <span className="font-medium text-status-warning-text block mt-0.5">
                  {formatDateTime(h.registration_end_at)}
                </span>
              </div>

              <div>
                <span className="text-text-muted uppercase text-[10px] font-semibold block">
                  Competition Dates
                </span>
                <span className="font-medium text-text-primary block mt-0.5">
                  {formatDateRange(h.event_start_at, h.event_end_at)}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-semibold text-text-primary border-b border-border-subtle pb-2">
              Participation Rules
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Team Size Limit</span>
                <span className="font-semibold text-text-primary">
                  {h.min_team_size === h.max_team_size
                    ? `${h.min_team_size} members`
                    : `${h.min_team_size} – ${h.max_team_size} members`}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-muted">Solo Participation</span>
                <span className="font-semibold text-text-primary">
                  {h.is_solo_allowed ? 'Allowed' : 'Team Only'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-text-muted">Event Format</span>
                <span className="font-semibold text-text-primary capitalize">
                  {h.mode}
                </span>
              </div>

              {h.academic_term && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Academic Term</span>
                  <span className="font-semibold text-text-primary">
                    {h.academic_term} ({h.academic_year})
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  if (isSuperAdmin) {
    return (
      <SuperAdminShell
        currentPath="/admin/hackathons"
        adminProfile={admin || undefined}
        permissions={permissions}
      >
        {content}
      </SuperAdminShell>
    );
  }

  return (
    <AdminShell
      currentPath="/admin/hackathons"
      adminProfile={admin || undefined}
      permissions={permissions}
    >
      {content}
    </AdminShell>
  );
}
