import React from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RegistrationStateBadge } from './registration-state-badge';
import { computeRegistrationState } from '@/lib/hackathons/registration-state';
import { formatDate, formatDateTime } from '@/lib/utils/date-format';
import type { HackathonPublicView } from '@/types/hackathon';

interface EventCardProps {
  hackathon: HackathonPublicView;
  href?: string;
}

export function EventCard({ hackathon, href }: EventCardProps) {
  const regState = computeRegistrationState(
    hackathon.status,
    hackathon.registration_start_at || new Date().toISOString(),
    hackathon.registration_end_at || new Date().toISOString()
  );

  const detailUrl = href || `/student/hackathons/${hackathon.slug}`;

  const modeBadgeVariant: 'neutral' | 'info' | 'success' =
    hackathon.mode === 'online' ? 'info' : hackathon.mode === 'hybrid' ? 'neutral' : 'success';

  return (
    <Card className="flex flex-col justify-between hover:border-brand-primary/40 transition-all hover:shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={modeBadgeVariant} size="sm" className="capitalize">
              {hackathon.mode}
            </Badge>
            {hackathon.venue && hackathon.mode !== 'online' && (
              <span className="text-[11px] text-text-secondary truncate max-w-[140px]" title={hackathon.venue}>
                {hackathon.venue}
              </span>
            )}
          </div>
          <RegistrationStateBadge state={regState} />
        </div>

        <Link href={detailUrl} className="group">
          <CardTitle className="group-hover:text-brand-primary transition-colors line-clamp-1">
            {hackathon.title}
          </CardTitle>
        </Link>

        {hackathon.tagline ? (
          <CardDescription className="line-clamp-2 mt-0.5">
            {hackathon.tagline}
          </CardDescription>
        ) : (
          <CardDescription className="line-clamp-2 mt-0.5">
            Organized by {hackathon.organizer}
          </CardDescription>
        )}
      </CardHeader>

      <div className="p-5 pt-3 flex flex-col gap-3 text-xs border-t border-border-subtle/50 mt-auto">
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-text-secondary block">Deadline:</span>
            <span className="font-medium text-text-primary">
              {formatDateTime(hackathon.registration_end_at)}
            </span>
          </div>
          <div>
            <span className="text-text-secondary block">Event Date:</span>
            <span className="font-medium text-text-primary">
              {formatDate(hackathon.event_start_at)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-text-secondary">
            <span>
              {hackathon.min_team_size === hackathon.max_team_size
                ? `${hackathon.min_team_size} per team`
                : `${hackathon.min_team_size}–${hackathon.max_team_size} members`}
              {hackathon.is_solo_allowed && ' (Solo ok)'}
            </span>
          </div>

          <Link
            href={detailUrl}
            className="text-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
          >
            Details &rarr;
          </Link>
        </div>
      </div>
    </Card>
  );
}
