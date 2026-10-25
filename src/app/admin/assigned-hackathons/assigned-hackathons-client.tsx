'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ButtonLink } from '@/components/ui/button-link';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/alert';
import { RegistrationStateBadge } from '@/components/hackathons/registration-state-badge';
import { computeRegistrationState } from '@/lib/hackathons/registration-state';
import { formatDate, formatTime, formatDateRange } from '@/lib/utils/date-format';
import type { AssignedHackathonSummary } from '@/actions/admin-assignment-actions';

interface AssignedHackathonsClientProps {
  initialHackathons: AssignedHackathonSummary[];
  isSuperAdmin: boolean;
}

export function AssignedHackathonsClient({
  initialHackathons,
  isSuperAdmin,
}: AssignedHackathonsClientProps) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'in_charge' | 'coordinator' | 'reviewer'>('all');

  const filteredHackathons = useMemo(() => {
    return initialHackathons.filter((h) => {
      if (roleFilter !== 'all' && h.role !== roleFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = h.title.toLowerCase().includes(q);
        const matchesVenue = (h.venue || '').toLowerCase().includes(q);
        const matchesNotes = (h.notes || '').toLowerCase().includes(q);
        return matchesTitle || matchesVenue || matchesNotes;
      }
      return true;
    });
  }, [initialHackathons, roleFilter, search]);

  const counts = useMemo(() => {
    return {
      all: initialHackathons.length,
      in_charge: initialHackathons.filter((h) => h.role === 'in_charge').length,
      coordinator: initialHackathons.filter((h) => h.role === 'coordinator').length,
      reviewer: initialHackathons.filter((h) => h.role === 'reviewer').length,
    };
  }, [initialHackathons]);

  const renderRoleBadge = (role: 'in_charge' | 'coordinator' | 'reviewer') => {
    switch (role) {
      case 'in_charge':
        return (
          <Badge variant="warning" size="sm" className="font-semibold uppercase tracking-wider text-[10px]">
            In Charge
          </Badge>
        );
      case 'coordinator':
        return (
          <Badge variant="info" size="sm" className="font-semibold uppercase tracking-wider text-[10px]">
            Coordinator
          </Badge>
        );
      case 'reviewer':
      default:
        return (
          <Badge variant="neutral" size="sm" className="font-semibold uppercase tracking-wider text-[10px]">
            Reviewer
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            My Assigned Hackathons
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Review sequential round milestone submissions, evaluate team progress, and verify evidence for your assigned competitions.
          </p>
        </div>
      </div>

      {/* Super Admin Notice if zero explicit assignments */}
      {isSuperAdmin && initialHackathons.length === 0 && (
        <Alert variant="info" title="Super Admin Institutional Access">
          You currently hold global oversight across all hackathons. No event-specific assignment rows are currently designated to your administrator profile. You can inspect submissions across any event by browsing the catalog or managing assignments under Administrator Accounts.
        </Alert>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Assigned Hackathons</span>
          <span className="text-2xl font-bold text-text-primary mt-2">{counts.all}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">In-Charge Lead</span>
          <span className="text-2xl font-bold text-status-warning-text mt-2">{counts.in_charge}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Coordinator</span>
          <span className="text-2xl font-bold text-brand-primary mt-2">{counts.coordinator}</span>
        </Card>
        <Card className="p-4 flex flex-col justify-between">
          <span className="text-xs font-medium text-text-secondary">Reviewer</span>
          <span className="text-2xl font-bold text-text-primary mt-2">{counts.reviewer}</span>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {(
              [
                { key: 'all', label: `All (${counts.all})` },
                { key: 'in_charge', label: `In-Charge (${counts.in_charge})` },
                { key: 'coordinator', label: `Coordinators (${counts.coordinator})` },
                { key: 'reviewer', label: `Reviewers (${counts.reviewer})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRoleFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                  roleFilter === tab.key
                    ? 'bg-surface-inverse text-text-inverse font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full md:w-64">
            <Input
              placeholder="Search assigned events..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>
      </Card>

      {/* Assigned Hackathons List */}
      {filteredHackathons.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            title="No assigned hackathons"
            description={
              search.trim() || roleFilter !== 'all'
                ? 'No assigned hackathons match your filter criteria.'
                : 'You do not have any active hackathon assignments at this time.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredHackathons.map((h) => {
            const regState = computeRegistrationState(
              h.status,
              h.registration_start_at,
              h.registration_end_at
            );

            return (
              <Card
                key={h.id}
                className="p-5 hover:border-border-strong transition-all bg-surface-canvas shadow-xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left: Identity and Badges */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/hackathons/${h.id}/submissions`}
                        className="font-bold text-text-primary text-base sm:text-lg hover:text-brand-primary transition-colors line-clamp-1"
                      >
                        {h.title}
                      </Link>

                      {renderRoleBadge(h.role)}

                      <RegistrationStateBadge state={regState} />

                      <Badge
                        variant={
                          h.status === 'draft'
                            ? 'neutral'
                            : h.status === 'published'
                            ? 'success'
                            : 'neutral'
                        }
                        size="sm"
                        className="capitalize text-[11px]"
                      >
                        {h.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    {/* Venue & Assignment Metadata */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-text-secondary">
                      <span className="capitalize font-medium text-text-primary">{h.mode}</span>
                      {h.venue && (
                        <>
                          <span className="text-text-muted">&bull;</span>
                          <span className="text-text-secondary flex items-center gap-1">
                            📍 <span>{h.venue}</span>
                          </span>
                        </>
                      )}
                      <span className="text-text-muted">&bull;</span>
                      <span className="text-text-muted">
                        Assigned on {formatDate(h.assigned_at)}
                      </span>
                      {h.notes && (
                        <>
                          <span className="text-text-muted">&bull;</span>
                          <span className="text-text-secondary italic">
                            &ldquo;{h.notes}&rdquo;
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Direct Review Entry Point */}
                  <div className="flex items-center gap-2 shrink-0 self-start">
                    <ButtonLink
                      href={`/admin/hackathons/${h.id}/teams`}
                      variant="secondary"
                      size="sm"
                    >
                      Registered Teams
                    </ButtonLink>

                    <ButtonLink
                      href={`/admin/hackathons/${h.id}/submissions`}
                      variant="primary"
                      size="sm"
                    >
                      Review Submissions &rarr;
                    </ButtonLink>

                    {h.external_registration_url && (
                      <ButtonLink
                        href={h.external_registration_url}
                        variant="outline"
                        size="sm"
                        target="_blank"
                      >
                        External Portal &nearr;
                      </ButtonLink>
                    )}

                    <ButtonLink
                      href={`/hackathons/${h.slug}`}
                      variant="outline"
                      size="sm"
                      target="_blank"
                    >
                      View Event
                    </ButtonLink>
                  </div>
                </div>

                {/* Bottom Timeline Columns */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 pt-3.5 mt-3 border-t border-border-subtle/70 text-xs">
                  <div>
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
                      Registration Deadline
                    </span>
                    <span className="font-medium text-text-primary mt-0.5 block whitespace-nowrap">
                      {formatDate(h.registration_end_at)}
                    </span>
                    <span className="text-[11px] text-text-secondary block">
                      {formatTime(h.registration_end_at)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
                      Event Schedule
                    </span>
                    <span className="font-medium text-text-primary mt-0.5 block whitespace-nowrap">
                      {formatDateRange(h.event_start_at, h.event_end_at)}
                    </span>
                    <span className="text-[11px] text-text-secondary block capitalize">
                      {h.mode} schedule
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
                      Your Assignment Role
                    </span>
                    <span className="font-medium text-text-primary mt-0.5 block capitalize">
                      {h.role.replace('_', ' ')}
                    </span>
                    <span className="text-[11px] text-text-secondary block">
                      Authorized to evaluate submissions
                    </span>
                  </div>

                  <div className="hidden lg:block">
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
                      Review Scope
                    </span>
                    <span className="font-medium text-text-primary mt-0.5 block truncate">
                      Rounds & Milestone Evidence
                    </span>
                    <span className="text-[11px] text-text-secondary block truncate">
                      Direct queue access enabled
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
