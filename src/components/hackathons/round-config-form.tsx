'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { configureRoundsAction } from '@/actions/hackathon-management-actions';
import type { HackathonRound } from '@/types/hackathon';

interface RoundConfigFormProps {
  hackathonId: string;
  hackathonTitle: string;
  eventStartAt: string;
  eventEndAt: string;
  initialRounds: HackathonRound[];
}

interface EditableRound {
  id?: string;
  roundNumber: number;
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  isFinalRound: boolean;
}

function toLocalDatetimeString(dateString?: string): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RoundConfigForm({
  hackathonId,
  hackathonTitle,
  eventStartAt,
  eventEndAt,
  initialRounds,
}: RoundConfigFormProps) {
  const router = useRouter();

  const [rounds, setRounds] = useState<EditableRound[]>(() => {
    if (initialRounds && initialRounds.length > 0) {
      return [...initialRounds]
        .sort((a, b) => a.round_number - b.round_number)
        .map((r, idx) => ({
          id: r.id,
          roundNumber: idx + 1,
          name: r.name,
          description: r.description || '',
          startAt: toLocalDatetimeString(r.start_at),
          endAt: toLocalDatetimeString(r.end_at),
          isFinalRound: r.is_final_round,
        }));
    }

    // Default template: Round 1 (Ideation) and Round 2 (Grand Finale)
    const startDate = new Date(eventStartAt);
    const endDate = new Date(eventEndAt);
    const midDate = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);

    return [
      {
        roundNumber: 1,
        name: 'Round 1: Ideation & Architecture',
        description: 'Submission of project pitch deck, problem statement alignment, and architecture diagrams.',
        startAt: toLocalDatetimeString(startDate.toISOString()),
        endAt: toLocalDatetimeString(midDate.toISOString()),
        isFinalRound: false,
      },
      {
        roundNumber: 2,
        name: 'Round 2: Prototype & Grand Finale',
        description: 'Live evaluation of working prototypes and final presentations.',
        startAt: toLocalDatetimeString(midDate.toISOString()),
        endAt: toLocalDatetimeString(endDate.toISOString()),
        isFinalRound: true,
      },
    ];
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const addRound = () => {
    const nextNumber = rounds.length + 1;
    const lastRound = rounds[rounds.length - 1];
    const newStart = lastRound?.endAt || toLocalDatetimeString(eventStartAt);
    const newEnd = toLocalDatetimeString(eventEndAt);

    setRounds((prev) => [
      ...prev,
      {
        roundNumber: nextNumber,
        name: `Round ${nextNumber}: Evaluation`,
        description: '',
        startAt: newStart,
        endAt: newEnd,
        isFinalRound: false,
      },
    ]);
  };

  const removeRound = (index: number) => {
    if (rounds.length <= 1) {
      setErrorMessage('At least one round is mandatory for any hackathon.');
      return;
    }
    setRounds((prev) => {
      const filtered = prev.filter((_, idx) => idx !== index);
      // Re-sequence 1..N
      return filtered.map((r, idx) => ({ ...r, roundNumber: idx + 1 }));
    });
  };

  const moveRound = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rounds.length) return;

    setRounds((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      // Re-sequence numbers 1..N
      return copy.map((r, idx) => ({ ...r, roundNumber: idx + 1 }));
    });
  };

  const updateRound = <K extends keyof EditableRound>(
    index: number,
    field: K,
    value: EditableRound[K]
  ) => {
    setRounds((prev) => {
      const copy = [...prev];
      if (field === 'isFinalRound' && value === true) {
        // Enforce single final round: uncheck all other rounds
        return copy.map((r, idx) => ({
          ...r,
          isFinalRound: idx === index,
        }));
      }
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (rounds.length === 0) {
      setErrorMessage('At least one round is required.');
      return;
    }

    // Validation
    for (const r of rounds) {
      if (!r.name.trim() || r.name.trim().length < 2) {
        setErrorMessage(`Round ${r.roundNumber} must have a name of at least 2 characters.`);
        return;
      }
      if (!r.startAt || !r.endAt) {
        setErrorMessage(`Round ${r.roundNumber} must have valid start and end dates.`);
        return;
      }
      if (new Date(r.endAt) < new Date(r.startAt)) {
        setErrorMessage(`Round ${r.roundNumber} end date cannot be earlier than start date.`);
        return;
      }
    }

    const finalCount = rounds.filter((r) => r.isFinalRound).length;
    if (finalCount > 1) {
      setErrorMessage('At most one round can be marked as the Final Round.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = rounds.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        name: r.name.trim(),
        description: r.description.trim() || undefined,
        startAt: new Date(r.startAt).toISOString(),
        endAt: new Date(r.endAt).toISOString(),
        isFinalRound: r.isFinalRound,
      }));

      const res = await configureRoundsAction(hackathonId, payload);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to configure rounds.');
        return;
      }

      setSuccessMessage(`Successfully configured ${res.data?.configured_rounds || rounds.length} rounds.`);
      setTimeout(() => {
        router.push('/admin/hackathons');
      }, 1200);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">
            Configure Rounds: {hackathonTitle}
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Define evaluation stages and chronological rounds. At least 1 round is required to publish.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={addRound}>
          + Add New Round
        </Button>
      </div>

      {errorMessage && (
        <Alert variant="error" title="Configuration Error">
          {errorMessage}
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success" title="Success">
          {successMessage}
        </Alert>
      )}

      <div className="space-y-4">
        {rounds.map((round, idx) => (
          <Card key={round.id || `new-round-${idx}`} className="relative border-l-4 border-l-brand-primary">
            <CardHeader className="bg-surface-subtle/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" size="sm">
                    Round {round.roundNumber}
                  </Badge>
                  {round.isFinalRound && (
                    <Badge variant="warning" size="sm">
                      🏆 Final Round
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    disabled={idx === 0}
                    onClick={() => moveRound(idx, 'up')}
                    title="Move Round Earlier"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    disabled={idx === rounds.length - 1}
                    onClick={() => moveRound(idx, 'down')}
                    title="Move Round Later"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className="text-status-error-text hover:bg-status-error-bg ml-2"
                    onClick={() => removeRound(idx)}
                    title="Delete Round"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            </CardHeader>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Input
                    label="Round Name"
                    value={round.name}
                    onChange={(e) => updateRound(idx, 'name', e.target.value)}
                    placeholder="e.g. Round 1: Ideation & Submission"
                    required
                  />
                </div>
                <div className="flex items-end pb-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`final-round-${idx}`}
                      checked={round.isFinalRound}
                      onChange={(e) => updateRound(idx, 'isFinalRound', e.target.checked)}
                    />
                    <label
                      htmlFor={`final-round-${idx}`}
                      className="text-xs font-medium text-text-primary select-none cursor-pointer"
                    >
                      Designate as Final Round
                    </label>
                  </div>
                </div>
              </div>

              <Input
                label="Description & Deliverables (Optional)"
                value={round.description}
                onChange={(e) => updateRound(idx, 'description', e.target.value)}
                placeholder="What participants are expected to deliver or present in this round..."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  type="datetime-local"
                  label="Round Start Date & Time"
                  value={round.startAt}
                  onChange={(e) => updateRound(idx, 'startAt', e.target.value)}
                  required
                />
                <Input
                  type="datetime-local"
                  label="Round Conclusion Date & Time"
                  value={round.endAt}
                  onChange={(e) => updateRound(idx, 'endAt', e.target.value)}
                  required
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
        <Button
          type="button"
          variant="tertiary"
          onClick={() => router.push('/admin/hackathons')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          Save Round Configuration
        </Button>
      </div>
    </form>
  );
}
