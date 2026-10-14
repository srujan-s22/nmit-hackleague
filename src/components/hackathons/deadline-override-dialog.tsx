'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { overrideDeadlineAction } from '@/actions/hackathon-management-actions';

interface HackathonDeadlineInfo {
  id: string;
  title: string;
  registration_start_at: string;
  registration_end_at: string;
  event_end_at: string;
  status: string;
}

interface DeadlineOverrideDialogProps {
  isOpen: boolean;
  onClose: () => void;
  hackathon: HackathonDeadlineInfo | null;
  onSuccess: () => void;
}

function formatToLocalDatetime(dateString: string): string {
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface DeadlineOverrideFormProps {
  hackathon: HackathonDeadlineInfo;
  onClose: () => void;
  onSuccess: () => void;
}

function DeadlineOverrideForm({
  hackathon,
  onClose,
  onSuccess,
}: DeadlineOverrideFormProps) {
  const [newDeadline, setNewDeadline] = useState(() =>
    formatToLocalDatetime(hackathon.registration_end_at)
  );
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentDeadlineMs = new Date(hackathon.registration_end_at).getTime();
  const selectedDeadlineMs = newDeadline ? new Date(newDeadline).getTime() : NaN;

  let changeType: 'extension' | 'shortening' | 'identical' | 'invalid' = 'invalid';
  if (!isNaN(selectedDeadlineMs)) {
    if (Math.abs(selectedDeadlineMs - currentDeadlineMs) < 1000) {
      changeType = 'identical';
    } else if (selectedDeadlineMs > currentDeadlineMs) {
      changeType = 'extension';
    } else {
      changeType = 'shortening';
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (changeType === 'identical') {
      setErrorMessage(
        'New deadline is identical to the current deadline. Unchanged deadlines are rejected as no-ops.'
      );
      return;
    }

    if (!newDeadline) {
      setErrorMessage('Please select a valid new registration deadline.');
      return;
    }

    const newDate = new Date(newDeadline);
    const now = new Date();
    const eventEnd = new Date(hackathon.event_end_at);
    const regStart = new Date(hackathon.registration_start_at);

    if (newDate <= now) {
      setErrorMessage('New deadline must be strictly in the future.');
      return;
    }

    if (newDate > eventEnd) {
      setErrorMessage(
        `New deadline cannot exceed event conclusion (${eventEnd.toLocaleString()}).`
      );
      return;
    }

    if (newDate <= regStart) {
      setErrorMessage(
        `New deadline must be after registration opening (${regStart.toLocaleString()}).`
      );
      return;
    }

    if (reason.trim().length < 5) {
      setErrorMessage('A meaningful justification of at least 5 characters is mandatory.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await overrideDeadlineAction({
        hackathonId: hackathon.id,
        newDeadline: newDate.toISOString(),
        reason: reason.trim(),
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to override deadline.');
        return;
      }

      onClose();
      onSuccess();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      {errorMessage && (
        <Alert variant="error" title="Override Rejected">
          {errorMessage}
        </Alert>
      )}

      <div className="bg-surface-subtle p-3 rounded-sm border border-border-subtle text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-text-secondary">Current Deadline:</span>
          <span className="font-semibold text-text-primary">
            {new Date(hackathon.registration_end_at).toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">Event Conclusion:</span>
          <span className="text-text-primary">
            {new Date(hackathon.event_end_at).toLocaleString()}
          </span>
        </div>
        {hackathon.status === 'registration_closed' && (
          <div className="pt-1 text-status-warning-text font-medium">
            Notice: Reopening a closed registration will automatically transition status to Published.
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="new-deadline" className="text-xs font-semibold text-text-primary">
            New Registration Deadline <span className="text-status-error-text">*</span>
          </label>
          {changeType === 'extension' && (
            <Badge variant="success" size="sm">Extension (+)</Badge>
          )}
          {changeType === 'shortening' && (
            <Badge variant="warning" size="sm">Shortening (-)</Badge>
          )}
          {changeType === 'identical' && (
            <Badge variant="error" size="sm">Unchanged (No-op)</Badge>
          )}
        </div>
        <Input
          id="new-deadline"
          type="datetime-local"
          value={newDeadline}
          onChange={(e) => setNewDeadline(e.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="override-reason" className="block text-xs font-semibold text-text-primary mb-1.5">
          Administrative Justification <span className="text-status-error-text">*</span>
        </label>
        <Textarea
          id="override-reason"
          placeholder="Document the institutional reason for adjusting this registration deadline..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
        />
        <p className="text-[11px] text-text-secondary mt-1">
          Minimum 5 characters. Mandatory for institutional accountability and audit logging.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
        <Button variant="tertiary" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          isLoading={isSubmitting}
          disabled={changeType === 'identical' || reason.trim().length < 5}
        >
          Apply Deadline Override
        </Button>
      </div>
    </form>
  );
}

export function DeadlineOverrideDialog({
  isOpen,
  onClose,
  hackathon,
  onSuccess,
}: DeadlineOverrideDialogProps) {
  if (!hackathon) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Override Registration Deadline"
      description={`Adjust registration deadline for "${hackathon.title}". This action is permanently audited.`}
      maxWidth="md"
    >
      <DeadlineOverrideForm
        key={`${hackathon.id}-${hackathon.registration_end_at}`}
        hackathon={hackathon}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </Dialog>
  );
}
