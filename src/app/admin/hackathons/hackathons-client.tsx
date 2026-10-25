'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ButtonLink } from '@/components/ui/button-link';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { RegistrationStateBadge } from '@/components/hackathons/registration-state-badge';
import { LifecycleConfirmDialog } from '@/components/hackathons/lifecycle-confirm-dialog';
import { DeadlineOverrideDialog } from '@/components/hackathons/deadline-override-dialog';
import { computeRegistrationState } from '@/lib/hackathons/registration-state';
import { formatDate, formatTime, formatDateTime, formatDateRange } from '@/lib/utils/date-format';
import type { Hackathon, PersistedHackathonStatus, HackathonStatusFilter } from '@/types/hackathon';

interface HackathonsClientProps {
  initialHackathons: Hackathon[];
  canManageHackathons?: boolean;
  canAssignHackathons?: boolean;
  isSuperAdmin?: boolean;
  assignedHackathonIds?: string[];
}

interface PortalActionsMenuProps {
  hackathon: Hackathon;
  canConfigureThis: boolean;
  canAssignThis: boolean;
  canReviewThis?: boolean;
  openLifecycle: (h: Hackathon, targetStatus: PersistedHackathonStatus) => void;
  openDeadlineOverride: (h: Hackathon) => void;
}

function PortalActionsMenu({
  hackathon: h,
  canConfigureThis,
  canAssignThis,
  canReviewThis,
  openLifecycle,
  openDeadlineOverride,
}: PortalActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top: number; left: number; openUpwards: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
    } else if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuHeight = 240; // Estimated max dropdown height
      const menuWidth = 192; // 12rem / w-48
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpwards = spaceBelow < menuHeight && rect.top > menuHeight;

      const top = openUpwards ? rect.top - 4 : rect.bottom + 4;
      const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));

      setMenuCoords({ top, left, openUpwards });
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleScrollOrResize() {
      setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        aria-label={`More actions for ${h.title}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={`p-2 rounded-xs text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors focus:outline-none focus:ring-1 focus:ring-brand-primary ${
          isOpen ? 'bg-surface-subtle text-text-primary' : ''
        }`}
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>

      {isOpen &&
        menuCoords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            style={{
              position: 'fixed',
              top: `${menuCoords.top}px`,
              left: `${menuCoords.left}px`,
              transform: menuCoords.openUpwards ? 'translateY(-100%)' : undefined,
              zIndex: 9999,
            }}
            className="w-48 rounded-xs bg-surface-canvas border border-border-subtle shadow-lg py-1 focus:outline-none animate-in fade-in duration-100"
          >
            {canReviewThis && (
              <Link
                href={`/admin/hackathons/${h.id}/submissions`}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex items-center w-full px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle transition-colors"
              >
                Submissions Queue
              </Link>
            )}

            {canConfigureThis && (
              <>
                <Link
                  href={`/admin/hackathons/${h.id}/edit`}
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center w-full px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle transition-colors"
                >
                  Edit Details
                </Link>
                <Link
                  href={`/admin/hackathons/${h.id}/rounds`}
                  role="menuitem"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center w-full px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle transition-colors"
                >
                  Configure Rounds
                </Link>
                {(h.status === 'published' || h.status === 'registration_closed') && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOpen(false);
                      openDeadlineOverride(h);
                    }}
                    className="flex items-center w-full px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle transition-colors text-left"
                  >
                    Override Deadline
                  </button>
                )}
                {h.status === 'draft' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOpen(false);
                      openLifecycle(h, 'published');
                    }}
                    className="flex items-center w-full px-3 py-1.5 text-xs text-status-success-text hover:bg-status-success-bg/20 transition-colors text-left font-medium"
                  >
                    Publish Hackathon
                  </button>
                )}
                {h.status === 'published' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOpen(false);
                      openLifecycle(h, 'registration_closed');
                    }}
                    className="flex items-center w-full px-3 py-1.5 text-xs text-status-warning-text hover:bg-status-warning-bg/20 transition-colors text-left"
                  >
                    Close Registration
                  </button>
                )}
                {h.status === 'registration_closed' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOpen(false);
                      openDeadlineOverride(h);
                    }}
                    className="flex items-center w-full px-3 py-1.5 text-xs text-brand-primary hover:bg-brand-primary/10 transition-colors text-left font-medium"
                  >
                    Reopen Registration
                  </button>
                )}
              </>
            )}

            {canAssignThis && (
              <Link
                href="/admin/admins"
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className="flex items-center w-full px-3 py-1.5 text-xs text-text-primary hover:bg-surface-subtle transition-colors border-t border-border-subtle"
              >
                Manage Reviewers
              </Link>
            )}

            {canConfigureThis && h.status !== 'archived' && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  openLifecycle(h, 'archived');
                }}
                className="flex items-center w-full px-3 py-1.5 text-xs text-status-error-text hover:bg-status-error-bg transition-colors text-left border-t border-border-subtle"
              >
                Archive Event
              </button>
            )}

            <Link
              href={`/hackathons/${h.slug}`}
              target="_blank"
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-subtle transition-colors border-t border-border-subtle"
            >
              <span>Public Details</span>
              <span className="text-[10px] text-text-muted">&nearr;</span>
            </Link>
          </div>,
          document.body
        )}
    </>
  );
}

interface AdminHackathonCatalogCardProps {
  hackathon: Hackathon;
  isAssigned: boolean;
}

function AdminHackathonCatalogCard({ hackathon: h, isAssigned }: AdminHackathonCatalogCardProps) {
  const regState = computeRegistrationState(
    h.status,
    h.registration_start_at || new Date().toISOString(),
    h.registration_end_at || new Date().toISOString()
  );

  const modeBadgeVariant: 'neutral' | 'info' | 'success' =
    h.mode === 'online' ? 'info' : h.mode === 'hybrid' ? 'neutral' : 'success';

  return (
    <Card className="flex flex-col justify-between hover:border-brand-primary/40 transition-all hover:shadow-xs bg-surface-canvas">
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={modeBadgeVariant} size="sm" className="capitalize text-[11px]">
              {h.mode}
            </Badge>
            {h.venue && h.mode !== 'online' && (
              <span className="text-[11px] text-text-secondary truncate max-w-[140px]" title={h.venue}>
                📍 {h.venue}
              </span>
            )}
            {isAssigned && (
              <Badge variant="neutral" size="sm" className="text-[10px] py-0 px-1.5 font-mono uppercase bg-brand-primary/10 text-brand-primary border-none">
                Assigned
              </Badge>
            )}
          </div>
          <RegistrationStateBadge state={regState} />
        </div>

        <Link href={`/hackathons/${h.slug}`} className="group block">
          <h3 className="font-bold text-text-primary text-base group-hover:text-brand-primary transition-colors line-clamp-1">
            {h.title}
          </h3>
        </Link>

        <p className="text-xs text-text-secondary line-clamp-2 mt-1">
          {h.tagline || `Organized by ${h.organizer}`}
        </p>
      </div>

      <div className="p-5 pt-3 flex flex-col gap-3 text-xs border-t border-border-subtle/50 mt-auto bg-surface-canvas">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-text-muted text-[10px] uppercase font-semibold block">Deadline</span>
            <span className="font-medium text-text-primary block truncate">
              {formatDateTime(h.registration_end_at)}
            </span>
          </div>
          <div>
            <span className="text-text-muted text-[10px] uppercase font-semibold block">Event Dates</span>
            <span className="font-medium text-text-primary block truncate">
              {formatDateRange(h.event_start_at, h.event_end_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border-subtle/40">
          <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            <span>👥</span>
            <span>
              {h.min_team_size === h.max_team_size
                ? `${h.min_team_size} per team`
                : `${h.min_team_size}–${h.max_team_size} members`}
              {h.is_solo_allowed ? ' (Solo ok)' : ''}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {h.external_registration_url && (
              <a
                href={h.external_registration_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-0.5"
                title="External Registration Portal"
              >
                <span>External Portal</span>
                <span className="text-[10px]">&nearr;</span>
              </a>
            )}
            <Link
              href={`/hackathons/${h.slug}`}
              className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
            >
              Details &rarr;
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function HackathonsClient({
  initialHackathons,
  canManageHackathons = true,
  canAssignHackathons = false,
  isSuperAdmin = false,
  assignedHackathonIds = [],
}: HackathonsClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'management' | 'catalog'>(isSuperAdmin ? 'management' : 'catalog');
  const [managementTab, setManagementTab] = useState<HackathonStatusFilter>('all');
  const [catalogTab, setCatalogTab] = useState<'all' | 'open' | 'upcoming' | 'past'>('all');

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

  // Catalog Metrics
  const catalogMetrics = useMemo(() => {
    let open = 0;
    let upcoming = 0;
    let past = 0;
    for (const h of initialHackathons) {
      const regState = computeRegistrationState(
        h.status,
        h.registration_start_at || new Date().toISOString(),
        h.registration_end_at || new Date().toISOString()
      );
      if (regState === 'OPEN') open++;
      else if (regState === 'UPCOMING') upcoming++;
      else if (
        regState === 'DEADLINE_PASSED' ||
        regState === 'CLOSED' ||
        regState === 'ARCHIVED'
      ) {
        past++;
      }
    }
    return {
      all: initialHackathons.length,
      open,
      upcoming,
      past,
    };
  }, [initialHackathons]);

  // Management Metrics
  const metrics = useMemo(() => {
    const total = initialHackathons.length;
    const published = initialHackathons.filter((h) => h.status === 'published').length;
    const drafts = initialHackathons.filter((h) => h.status === 'draft').length;
    const closed = initialHackathons.filter((h) => h.status === 'registration_closed').length;
    const archived = initialHackathons.filter((h) => h.status === 'archived').length;
    return { total, published, drafts, closed, archived };
  }, [initialHackathons]);

  const filteredHackathons = useMemo(() => {
    return initialHackathons.filter((h) => {
      // Tab filter
      if (isSuperAdmin && viewMode === 'management') {
        if (managementTab !== 'all' && h.status !== managementTab) {
          return false;
        }
      } else {
        const regState = computeRegistrationState(
          h.status,
          h.registration_start_at || new Date().toISOString(),
          h.registration_end_at || new Date().toISOString()
        );
        if (catalogTab === 'open' && regState !== 'OPEN') return false;
        if (catalogTab === 'upcoming' && regState !== 'UPCOMING') return false;
        if (
          catalogTab === 'past' &&
          regState !== 'DEADLINE_PASSED' &&
          regState !== 'CLOSED' &&
          regState !== 'ARCHIVED'
        ) {
          return false;
        }
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
  }, [initialHackathons, isSuperAdmin, viewMode, managementTab, catalogTab, search]);

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

  const isManagementView = isSuperAdmin && viewMode === 'management';

  return (
    <div className="space-y-6">
      {/* Header and Call to Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            {isSuperAdmin ? 'Hackathon Management' : 'Institutional Hackathons'}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {isSuperAdmin
              ? 'Author, configure, publish, and oversee institutional hackathons and round structures.'
              : 'Explore upcoming institutional hackathons, view event schedules, mode, venue, and external registration details.'}
          </p>
        </div>
        {isSuperAdmin && (
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-surface-subtle p-0.5 rounded border border-border-subtle text-xs">
              <button
                type="button"
                onClick={() => setViewMode('management')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  viewMode === 'management'
                    ? 'bg-surface-canvas text-text-primary shadow-xs font-semibold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Table View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('catalog')}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  viewMode === 'catalog'
                    ? 'bg-surface-canvas text-text-primary shadow-xs font-semibold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Catalog View
              </button>
            </div>
            <ButtonLink href="/admin/hackathons/new" variant="primary">
              + New Hackathon
            </ButtonLink>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isManagementView ? (
          <>
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
          </>
        ) : (
          <>
            <Card className="p-4 flex flex-col justify-between">
              <span className="text-xs font-medium text-text-secondary">Total Competitions</span>
              <span className="text-2xl font-bold text-text-primary mt-2">{catalogMetrics.all}</span>
            </Card>
            <Card className="p-4 flex flex-col justify-between">
              <span className="text-xs font-medium text-text-secondary">Registration Open</span>
              <span className="text-2xl font-bold text-status-success-text mt-2">{catalogMetrics.open}</span>
            </Card>
            <Card className="p-4 flex flex-col justify-between">
              <span className="text-xs font-medium text-text-secondary">Upcoming Events</span>
              <span className="text-2xl font-bold text-brand-primary mt-2">{catalogMetrics.upcoming}</span>
            </Card>
            <Card className="p-4 flex flex-col justify-between">
              <span className="text-xs font-medium text-text-secondary">Past Competitions</span>
              <span className="text-2xl font-bold text-text-secondary mt-2">{catalogMetrics.past}</span>
            </Card>
          </>
        )}
      </div>

      {/* Filter Tabs & Search */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {isManagementView
              ? (
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
                    onClick={() => setManagementTab(tab.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                      managementTab === tab.key
                        ? 'bg-surface-inverse text-text-inverse font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))
              : (
                  [
                    { key: 'all', label: `All Events (${catalogMetrics.all})` },
                    { key: 'open', label: `Registration Open (${catalogMetrics.open})` },
                    { key: 'upcoming', label: `Upcoming (${catalogMetrics.upcoming})` },
                    { key: 'past', label: `Past Competitions (${catalogMetrics.past})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setCatalogTab(tab.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                      catalogTab === tab.key
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
              placeholder="Search by title, venue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>
      </Card>

      {/* Hackathons Rendering */}
      {filteredHackathons.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            title="No hackathons found"
            description={
              search.trim()
                ? 'No hackathons match your search filter.'
                : isManagementView
                ? 'No hackathons in this category yet. Click "+ New Hackathon" to create a draft.'
                : 'No hackathons found in this category.'
            }
          />
        </Card>
      ) : !isManagementView ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredHackathons.map((h) => (
            <AdminHackathonCatalogCard
              key={h.id}
              hackathon={h}
              isAssigned={isSuperAdmin || assignedHackathonIds.includes(h.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHackathons.map((h) => {
            const regState = computeRegistrationState(
              h.status,
              h.registration_start_at,
              h.registration_end_at
            );
            const isAssigned = isSuperAdmin || assignedHackathonIds.includes(h.id);
            const canReviewThis = isAssigned;
            const canConfigureThis = isSuperAdmin && canManageHackathons;
            const canAssignThis = isSuperAdmin;
            const hasSecondaryActions = isSuperAdmin;

            return (
              <Card
                key={h.id}
                className="p-5 hover:border-border-strong transition-all bg-surface-canvas shadow-xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left: Hackathon Identity & Status */}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={
                          canReviewThis
                            ? `/admin/hackathons/${h.id}/submissions`
                            : canConfigureThis
                            ? `/admin/hackathons/${h.id}/edit`
                            : `/hackathons/${h.slug}`
                        }
                        className="font-bold text-text-primary text-base sm:text-lg hover:text-brand-primary transition-colors line-clamp-1"
                      >
                        {h.title}
                      </Link>

                      {isAssigned && !isSuperAdmin && (
                        <Badge
                          variant="neutral"
                          size="sm"
                          className="text-[10px] py-0 px-1.5 font-mono uppercase bg-brand-primary/10 text-brand-primary border-none"
                        >
                          Assigned
                        </Badge>
                      )}

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

                    {/* Organizer, Slug & Venue Details */}
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-text-secondary">
                      <span className="font-medium text-text-primary">{h.organizer}</span>
                      <span className="text-text-muted">&bull;</span>
                      <span className="font-mono text-text-muted">/{h.slug}</span>
                      <span className="text-text-muted">&bull;</span>
                      <span className="capitalize font-medium text-text-primary">{h.mode}</span>
                      {h.venue && (
                        <>
                          <span className="text-text-muted">&bull;</span>
                          <span className="text-text-secondary flex items-center gap-1" title={h.venue}>
                            <svg className="w-3.5 h-3.5 text-text-muted shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                              <circle cx="12" cy="10" r="3" />
                            </svg>
                            <span>{h.venue}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions Cluster */}
                  <div className="flex items-center gap-2 shrink-0 self-start">
                    {canReviewThis ? (
                      <ButtonLink
                        href={`/admin/hackathons/${h.id}/submissions`}
                        variant="primary"
                        size="sm"
                      >
                        Submissions
                      </ButtonLink>
                    ) : canConfigureThis ? (
                      <ButtonLink
                        href={`/admin/hackathons/${h.id}/edit`}
                        variant="secondary"
                        size="sm"
                      >
                        Edit Details
                      </ButtonLink>
                    ) : canAssignThis ? (
                      <ButtonLink
                        href="/admin/admins"
                        variant="secondary"
                        size="sm"
                      >
                        Assignments
                      </ButtonLink>
                    ) : (
                      <ButtonLink
                        href={`/hackathons/${h.slug}`}
                        variant="outline"
                        size="sm"
                        target="_blank"
                      >
                        View Event
                      </ButtonLink>
                    )}

                    {canConfigureThis && (
                      <ButtonLink
                        href={`/admin/hackathons/${h.id}/rounds`}
                        variant="outline"
                        size="sm"
                        className="hidden sm:inline-flex"
                      >
                        Configure Rounds
                      </ButtonLink>
                    )}

                    {hasSecondaryActions && (
                      <PortalActionsMenu
                        hackathon={h}
                        canConfigureThis={canConfigureThis}
                        canAssignThis={canAssignThis}
                        canReviewThis={canReviewThis}
                        openLifecycle={openLifecycle}
                        openDeadlineOverride={openDeadlineOverride}
                      />
                    )}
                  </div>
                </div>

                {/* Bottom: Aligned Metadata Columns */}
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
                      Team Structure
                    </span>
                    <span className="font-mono font-medium text-text-primary mt-0.5 block">
                      {h.min_team_size}&ndash;{h.max_team_size} members
                    </span>
                    <span className="text-[11px] text-text-secondary block">
                      {h.is_solo_allowed ? 'Solo registration allowed' : 'Team participation only'}
                    </span>
                  </div>

                  <div className="hidden lg:block">
                    <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block">
                      Location & Mode
                    </span>
                    <span className="font-medium text-text-primary mt-0.5 block capitalize truncate">
                      {h.mode} &bull; {h.venue || 'No venue specified'}
                    </span>
                    <span className="text-[11px] text-text-secondary block truncate">
                      Managed by {h.organizer}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
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
