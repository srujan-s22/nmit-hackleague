'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { transitionLifecycleAction } from '@/actions/hackathon-management-actions';
import type { PersistedHackathonStatus } from '@/types/hackathon';

interface LifecycleConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  hackathon: {
    id: string;
    title: string;
    status: PersistedHackathonStatus | string;
    event_end_at?: string | null;
  } | null;
  targetStatus: PersistedHackathonStatus | null;
  onSuccess: () => void;
}

export function LifecycleConfirmDialog({
  isOpen,
  onClose,
  hackathon,
  targetStatus,
  onSuccess,
}: LifecycleConfirmDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!hackathon || !targetStatus) return null;

  const isPrematureArchival =
    targetStatus === 'archived' &&
    Boolean(hackathon.event_end_at && new Date(hackathon.event_end_at) > new Date());

  const getDialogConfig = () => {
    switch (targetStatus) {
      case 'published':
        return {
          title: `Publish "${hackathon.title}"`,
          description:
            'Publishing makes this hackathon visible in the student discovery catalog. At least one round must be configured.',
          confirmText: 'Publish Event',
          variant: 'primary' as const,
        };
      case 'registration_closed':
        return {
          title: `Close Registration for "${hackathon.title}"`,
          description:
            'Closing registration prevents any further team formations or new student registrations. Existing teams remain intact.',
          confirmText: 'Close Registration',
          variant: 'warning' as const,
        };
      case 'archived':
        return {
          title: `Archive "${hackathon.title}"`,
          description: isPrematureArchival
            ? 'This event has not yet reached its scheduled conclusion. A formal institutional reason is required to archive prematurely.'
            : 'Archiving moves this competition to historical records. It will be hidden from active admin workflows.',
          confirmText: 'Archive Hackathon',
          variant: 'danger' as const,
        };
      default:
        return {
          title: `Update Status to "${targetStatus}"`,
          description: `Are you sure you want to transition "${hackathon.title}" to ${targetStatus}?`,
          confirmText: 'Confirm Transition',
          variant: 'primary' as const,
        };
    }
  };

  const config = getDialogConfig();

  const handleConfirm = async () => {
    setErrorMessage(null);

    if (isPrematureArchival && reason.trim().length < 5) {
      setErrorMessage('A meaningful justification of at least 5 characters is mandatory for premature archival.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await transitionLifecycleAction({
        hackathonId: hackathon.id,
        targetStatus,
        reason: reason.trim() || undefined,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to update lifecycle status.');
        return;
      }

      setReason('');
      onClose();
      onSuccess();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={config.title}
      description={config.description}
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="tertiary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant={config.variant === 'danger' ? 'destructive' : config.variant === 'warning' ? 'secondary' : 'primary'}
            onClick={handleConfirm}
            isLoading={isSubmitting}
            disabled={isPrematureArchival && reason.trim().length < 5}
          >
            {config.confirmText}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        {errorMessage && (
          <Alert variant="error" title="Action Failed">
            {errorMessage}
          </Alert>
        )}

        {isPrematureArchival ? (
          <div>
            <label htmlFor="archival-reason" className="block text-xs font-semibold text-text-primary mb-1.5">
              Premature Archival Reason <span className="text-status-error-text">*</span>
            </label>
            <Textarea
              id="archival-reason"
              placeholder="Provide institutional rationale for closing and archiving this event ahead of schedule..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
            />
            <p className="text-[11px] text-text-secondary mt-1">
              Minimum 5 characters. This justification is permanently logged to the audit trail.
            </p>
          </div>
        ) : (
          <p className="text-xs text-text-secondary">
            Current status: <strong className="text-text-primary capitalize">{hackathon.status}</strong>
          </p>
        )}
      </div>
    </Dialog>
  );
}
