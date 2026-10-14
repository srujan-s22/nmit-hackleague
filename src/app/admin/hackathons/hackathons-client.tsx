'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { RegistrationStateBadge } from '@/components/hackathons/registration-state-badge';
import { LifecycleConfirmDialog } from '@/components/hackathons/lifecycle-confirm-dialog';
import { DeadlineOverrideDialog } from '@/components/hackathons/deadline-override-dialog';
import { computeRegistrationState } from '@/lib/hackathons/registration-state';
import type { Hackathon, PersistedHackathonStatus, HackathonStatusFilter } from '@/types/hackathon';

interface HackathonsClientProps {
  initialHackathons: Hackathon[];
}

export function HackathonsClient({ initialHackathons }: HackathonsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<HackathonStatusFilter>('all');

  // Dialog states
  const [lifecycleDialogState, setLifecycleDialogState] = useState<{
    isOpen: boolean;
    hackathon: Hackathon | null;
    targetStatus: PersistedHackathonStatus | null;
  }>({
    isOpen: false,
    hackathon: null,
    targetStatus: null,
  });

  const [deadlineDialogState, setDeadlineDialogState] = useState<{
    isOpen: boolean;
    hackathon: Hackathon | null;
  }>({
    isOpen: false,
    hackathon: null,
  });

  const filteredHackathons = useMemo(() => {
    return initialHackathons.filter((h) => {
      // Tab filter
      if (activeTab !== 'all' && h.status !== activeTab) {
        return false;
      }
      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = h.title.toLowerCase().includes(query);
        const matchesOrganizer = h.organizer.toLowerCase().includes(query);
        const matchesVenue = (h.venue || '').toLowerCase().includes(query);
        const matchesSlug = h.slug.toLowerCase().includes(query);
        return matchesTitle || matchesOrganizer || matchesVenue || matchesSlug;
      }
      return true;
    });
  }, [initialHackathons, activeTab, search]);

  // Metrics
  const metrics = useMemo(() => {
    const total = initialHackathons.length;
    const published = initialHackathons.filter((h) => h.status === 'published').length;
    const drafts = initialHackathons.filter((h) => h.status === 'draft').length;
    const closed = initialHackathons.filter((h) => h.status === 'registration_closed').length;
    const archived = initialHackathons.filter((h) => h.status === 'archived').length;
    return { total, published, drafts, closed, archived };
  }, [initialHackathons]);

  const openLifecycle = (hackathon: Hackathon, targetStatus: PersistedHackathonStatus) => {
    setLifecycleDialogState({
      isOpen: true,
      hackathon,
      targetStatus,
    });
  };

  const openDeadlineOverride = (hackathon: Hackathon) => {
    setDeadlineDialogState({
      isOpen: true,
      hackathon,
    });
  };

  const handleActionSuccess = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Header and Call to Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Hackathon Management
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Author, configure, publish, and oversee institutional hackathons and round structures.
          </p>
        </div>
        <ButtonLink href="/admin/hackathons/new" variant="primary">
          + New Hackathon
        </ButtonLink>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Total Competitions</span>
          <span className="text-2xl font-bold text-text-primary mt-2">{metrics.total}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Published & Open</span>
          <span className="text-2xl font-bold text-status-success-text mt-2">{metrics.published}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Drafts in Prep</span>
          <span className="text-2xl font-bold text-brand-primary mt-2">{metrics.drafts}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Registration Closed</span>
          <span className="text-2xl font-bold text-text-secondary mt-2">{metrics.closed}</span>
        </Card>
      </div>

      {/* Filter Tabs & Search */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {(
              [
                { key: 'all', label: `All (${metrics.total})` },
                { key: 'published', label: `Published (${metrics.published})` },
                { key: 'draft', label: `Drafts (${metrics.drafts})` },
                { key: 'registration_closed', label: `Closed (${metrics.closed})` },
                { key: 'archived', label: `Archived (${metrics.archived})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-brand-primary text-text-inverse font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full md:w-64">
            <Input
              placeholder="Search by title, venue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>
      </Card>

      {/* Hackathons Table */}
      {filteredHackathons.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            title="No hackathons found"
            description={
              search.trim()
                ? 'No hackathons match your search filter.'
                : 'No hackathons in this category yet. Click "+ New Hackathon" to create a draft.'
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-subtle/80 border-b border-border-subtle text-text-secondary font-medium uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Event & Organizer</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Mode & Venue</th>
                  <th className="py-3 px-3">Reg. Deadline</th>
                  <th className="py-3 px-3">Event Schedule</th>
                  <th className="py-3 px-3">Team Size</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {filteredHackathons.map((h) => {
                  const regState = computeRegistrationState(
                    h.status,
                    h.registration_start_at,
                    h.registration_end_at
                  );

                  return (
                    <tr key={h.id} className="hover:bg-surface-subtle/40 transition-colors">
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-semibold text-text-primary line-clamp-1">{h.title}</div>
                        <div className="text-[11px] text-text-secondary line-clamp-1 mt-0.5">
                          {h.organizer} &bull; <span className="font-mono text-text-muted">/{h.slug}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          <RegistrationStateBadge state={regState} />
                          <Badge
                            variant={h.status === 'draft' ? 'neutral' : h.status === 'published' ? 'success' : 'neutral'}
                            size="sm"
                            className="capitalize text-[10px]"
                          >
                            {h.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="capitalize font-medium text-text-primary">{h.mode}</div>
                        {h.venue ? (
                          <div className="text-[11px] text-text-secondary truncate max-w-[120px]" title={h.venue}>
                            {h.venue}
                          </div>
                        ) : (
                          <div className="text-[11px] text-text-muted">&mdash;</div>
                        )}
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="font-medium text-text-primary">
                          {new Date(h.registration_end_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        <div className="text-[11px] text-text-secondary">
                          {new Date(h.registration_end_at).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <div className="text-text-primary">
                          {new Date(h.event_start_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          &ndash;{' '}
                          {new Date(h.event_end_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="font-mono text-text-primary">
                          {h.min_team_size}&ndash;{h.max_team_size}
                        </span>
                        {h.is_solo_allowed && (
                          <span className="text-[10px] text-brand-primary block">Solo ok</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <Link
                            href={`/admin/hackathons/${h.id}/edit`}
                            className="px-2 py-1 text-xs rounded-xs font-medium text-brand-primary hover:bg-brand-primary/10 transition-colors"
                          >
                            Edit
                          </Link>

                          <Link
                            href={`/admin/hackathons/${h.id}/rounds`}
                            className="px-2 py-1 text-xs rounded-xs font-medium text-text-primary hover:bg-surface-subtle transition-colors"
                          >
                            Rounds
                          </Link>

                          {/* Override deadline button (only for published or closed) */}
                          {(h.status === 'published' || h.status === 'registration_closed') && (
                            <button
                              type="button"
                              onClick={() => openDeadlineOverride(h)}
                              className="px-2 py-1 text-xs rounded-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors"
                              title="Extend or modify registration deadline"
                            >
                              Deadline
                            </button>
                          )}

                          {/* Lifecycle action triggers */}
                          {h.status === 'draft' && (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => openLifecycle(h, 'published')}
                            >
                              Publish
                            </Button>
                          )}

                          {h.status === 'published' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openLifecycle(h, 'registration_closed')}
                            >
                              Close Reg.
                            </Button>
                          )}

                          {h.status === 'registration_closed' && (
                            <Button
                              size="sm"
                              variant="tertiary"
                              onClick={() => openDeadlineOverride(h)}
                              title="Reopen registration by extending deadline"
                            >
                              Reopen
                            </Button>
                          )}

                          {h.status !== 'archived' && (
                            <Button
                              size="sm"
                              variant="tertiary"
                              onClick={() => openLifecycle(h, 'archived')}
                              className="text-status-error-text hover:bg-status-error-bg"
                            >
                              Archive
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modals */}
      <LifecycleConfirmDialog
        isOpen={lifecycleDialogState.isOpen}
        onClose={() => setLifecycleDialogState((prev) => ({ ...prev, isOpen: false }))}
        hackathon={lifecycleDialogState.hackathon}
        targetStatus={lifecycleDialogState.targetStatus}
        onSuccess={handleActionSuccess}
      />

      <DeadlineOverrideDialog
        isOpen={deadlineDialogState.isOpen}
        onClose={() => setDeadlineDialogState((prev) => ({ ...prev, isOpen: false }))}
        hackathon={deadlineDialogState.hackathon}
        onSuccess={handleActionSuccess}
      />
    </div>
  );
}
