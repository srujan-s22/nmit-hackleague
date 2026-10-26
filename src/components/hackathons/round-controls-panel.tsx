'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import {
  overrideRoundScheduleAction,
  pauseRoundAction,
  resumeRoundAction,
} from '@/actions/hackathon-management-actions';
import { formatDateTime } from '@/lib/utils/date-format';

export interface RoundControlInfo {
  id: string;
  round_number: number;
  name: string;
  status: string;
  start_at: string;
  end_at: string;
}

type Mode = 'pause' | 'resume' | 'reschedule';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'info'> = {
  open: 'success',
  paused: 'warning',
  scheduled: 'neutral',
  evaluation: 'info',
  completed: 'neutral',
};

const MIN_REASON = 10;

/** `datetime-local` value in the viewer's local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function roundLabel(r: RoundControlInfo): string {
  return /^round\s*\d+/i.test(r.name.trim()) ? r.name : `Round ${r.round_number}: ${r.name}`;
}

/**
 * Pause / resume / reschedule individual rounds of a live event. Every action needs a
 * reason and is audited by the database. Shown only to admins with configuration
 * authority for the hackathon; the server re-checks that authority on every call.
 */
export function RoundControlsPanel({ hackathonId, rounds }: { hackathonId: string; rounds: RoundControlInfo[] }) {
  const router = useRouter();
  const [active, setActive] = useState<{ round: RoundControlInfo; mode: Mode } | null>(null);
  const [reason, setReason] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const open = (round: RoundControlInfo, mode: Mode) => {
    setActive({ round, mode });
    setReason('');
    setStartAt(toLocalInput(round.start_at));
    setEndAt(toLocalInput(round.end_at));
    setError(null);
  };

  const close = () => {
    if (!isSaving) setActive(null);
  };

  const submit = async () => {
    if (!active) return;
    if (reason.trim().length < MIN_REASON) {
      setError(`Give a reason of at least ${MIN_REASON} characters.`);
      return;
    }
    setIsSaving(true);
    setError(null);
    const { round, mode } = active;
    const result =
      mode === 'pause'
        ? await pauseRoundAction(hackathonId, round.id, reason.trim())
        : mode === 'resume'
          ? await resumeRoundAction(hackathonId, round.id, reason.trim(), endAt ? new Date(endAt).toISOString() : undefined)
          : await overrideRoundScheduleAction({
              hackathonId,
              roundId: round.id,
              newStartAt: new Date(startAt).toISOString(),
              newEndAt: new Date(endAt).toISOString(),
              reason: reason.trim(),
            });
    setIsSaving(false);
    if (!result.success) {
      setError(result.error || 'The change could not be saved.');
      return;
    }
    setActive(null);
    setNotice(
      mode === 'pause'
        ? `${roundLabel(round)} paused.`
        : mode === 'resume'
          ? `${roundLabel(round)} resumed.`
          : `${roundLabel(round)} dates updated.`
    );
    router.refresh();
  };

  if (rounds.length === 0) return null;

  const title =
    active?.mode === 'pause' ? 'Pause round' : active?.mode === 'resume' ? 'Resume round' : 'Change round dates';

  return (
    <Card id="round-controls-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Round schedule</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {notice && (
          <Alert variant="success" onClose={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {rounds.map((r) => {
            const locked = r.status === 'completed';
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">{roundLabel(r)}</span>
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'neutral'} size="sm" className="capitalize">
                      {r.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {formatDateTime(r.start_at)} – {formatDateTime(r.end_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.status === 'open' && (
                    <Button size="sm" variant="secondary" onClick={() => open(r, 'pause')}>
                      Pause
                    </Button>
                  )}
                  {r.status === 'paused' && (
                    <Button size="sm" variant="secondary" onClick={() => open(r, 'resume')}>
                      Resume
                    </Button>
                  )}
                  <Button size="sm" variant="tertiary" disabled={locked} onClick={() => open(r, 'reschedule')}>
                    Change dates
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>

      <Dialog
        isOpen={Boolean(active)}
        onClose={close}
        title={title}
        description={active ? roundLabel(active.round) : undefined}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="tertiary" onClick={close} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={submit} isLoading={isSaving} disabled={reason.trim().length < MIN_REASON}>
              {active?.mode === 'pause' ? 'Pause round' : active?.mode === 'resume' ? 'Resume round' : 'Save dates'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-1">
          {error && <Alert variant="error">{error}</Alert>}
          {active?.mode === 'pause' && (
            <p className="text-sm text-text-secondary">Teams cannot submit to this round until it is resumed.</p>
          )}
          {active?.mode === 'reschedule' && (
            <label className="block text-xs font-medium text-text-secondary">
              Starts
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 py-2 text-sm text-text-primary"
              />
            </label>
          )}
          {(active?.mode === 'reschedule' || active?.mode === 'resume') && (
            <label className="block text-xs font-medium text-text-secondary">
              {active?.mode === 'resume' ? 'New end (must be in the future)' : 'Ends'}
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 py-2 text-sm text-text-primary"
              />
            </label>
          )}
          <label className="block text-xs font-medium text-text-secondary">
            Reason
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Recorded in the audit log"
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface-canvas px-3 py-2 text-sm text-text-primary"
            />
          </label>
        </div>
      </Dialog>
    </Card>
  );
}
