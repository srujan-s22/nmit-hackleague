'use client';

import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { EventCard } from '@/components/hackathons/event-card';
import { computeRegistrationState } from '@/lib/hackathons/registration-state';
import type { HackathonPublicView } from '@/types/hackathon';

interface StudentHackathonsClientProps {
  initialHackathons: HackathonPublicView[];
}

type StudentFilterTab = 'all' | 'open' | 'upcoming' | 'past';

export function StudentHackathonsClient({ initialHackathons }: StudentHackathonsClientProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<StudentFilterTab>('all');

  const hackathonsWithState = useMemo(() => {
    return initialHackathons.map((h) => ({
      ...h,
      regState: computeRegistrationState(
        h.status,
        h.registration_start_at || new Date().toISOString(),
        h.registration_end_at || new Date().toISOString()
      ),
    }));
  }, [initialHackathons]);

  const filteredHackathons = useMemo(() => {
    return hackathonsWithState.filter((h) => {
      // Tab filter
      if (activeTab === 'open' && h.regState !== 'OPEN') {
        return false;
      }
      if (activeTab === 'upcoming' && h.regState !== 'UPCOMING') {
        return false;
      }
      if (
        activeTab === 'past' &&
        h.regState !== 'DEADLINE_PASSED' &&
        h.regState !== 'CLOSED' &&
        h.regState !== 'ARCHIVED'
      ) {
        return false;
      }

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesTitle = (h.title || '').toLowerCase().includes(query);
        const matchesTagline = (h.tagline || '').toLowerCase().includes(query);
        const matchesOrganizer = (h.organizer || '').toLowerCase().includes(query);
        const matchesVenue = (h.venue || '').toLowerCase().includes(query);
        return matchesTitle || matchesTagline || matchesOrganizer || matchesVenue;
      }

      return true;
    });
  }, [hackathonsWithState, activeTab, search]);

  const counts = useMemo(() => {
    return {
      all: hackathonsWithState.length,
      open: hackathonsWithState.filter((h) => h.regState === 'OPEN').length,
      upcoming: hackathonsWithState.filter((h) => h.regState === 'UPCOMING').length,
      past: hackathonsWithState.filter(
        (h) =>
          h.regState === 'DEADLINE_PASSED' ||
          h.regState === 'CLOSED' ||
          h.regState === 'ARCHIVED'
      ).length,
    };
  }, [hackathonsWithState]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Institutional Hackathons
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Discover upcoming hackathons, form interdisciplinary teams, and showcase your engineering capabilities.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
            {(
              [
                { key: 'all', label: `All Events (${counts.all})` },
                { key: 'open', label: `Registration Open (${counts.open})` },
                { key: 'upcoming', label: `Upcoming (${counts.upcoming})` },
                { key: 'past', label: `Past Competitions (${counts.past})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-xs transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-surface-inverse text-text-inverse font-semibold'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-subtle'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="w-full md:w-72">
            <Input
              placeholder="Search by title, domain, venue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>
      </Card>

      {/* Events Grid */}
      {filteredHackathons.length === 0 ? (
        <Card className="p-10">
          <EmptyState
            title="No hackathons found"
            description={
              search.trim()
                ? 'No hackathons matched your search keywords. Try different keywords or clear filters.'
                : 'There are currently no hackathons matching this filter category.'
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredHackathons.map((hackathon) => (
            <EventCard key={hackathon.id || hackathon.slug} hackathon={hackathon} />
          ))}
        </div>
      )}
    </div>
  );
}
