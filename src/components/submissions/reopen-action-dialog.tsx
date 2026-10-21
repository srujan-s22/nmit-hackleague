'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { reopenRejectedSubmissionAction } from '@/actions/round-review-actions';

export interface ReopenActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string;
  submissionTitle: string;
  teamName: string;
  onSuccess: () => void;
}

export function ReopenActionDialog({
  isOpen,
  onClose,
  submissionId,
  submissionTitle,
  teamName,
  onSuccess,
}: ReopenActionDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setReason('');
    setError(null);
    onClose();
  };

  const trimmedReason = reason.trim();
  const isValid = trimmedReason.length >= 10 && trimmedReason.length <= 1000;
  const canSubmit = isValid && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    const res = await reopenRejectedSubmissionAction(submissionId, trimmedReason);
    setIsSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || 'Failed to reopen submission.');
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Reopen Rejected Submission"
      description={`Reopening milestone "${submissionTitle}" for ${teamName}.`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
            id="btn-cancel-reopen"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            isLoading={isSubmitting}
            id="btn-confirm-reopen"
          >
            Confirm Reopen & Unlock Revision
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-danger-bg text-status-danger-text rounded text-xs" id="reopen-error-banner">
            {error}
          </div>
        )}

        <div className="p-3 bg-status-warning-bg text-status-warning-text rounded text-xs">
          <strong>Important:</strong> Reopening a rejected submission transitions it to <em>revision_requested</em> status, permitting the team to submit an updated version. An immutable audit record will log your justification.
        </div>

        <div className="space-y-1">
          <label htmlFor="reopen-reason" className="block text-xs font-medium text-text-primary">
            Official Reopen Justification <span className="text-status-danger-text">*</span>
          </label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Document why this rejected submission is being reopened (e.g., student appeal granted, technical dispute resolved; minimum 10 characters)..."
            className="w-full text-xs"
          />
          <div className="flex justify-between items-center text-[11px] text-text-muted">
            <span>
              {trimmedReason.length < 10 && (
                <span className="text-status-danger-text font-medium">
                  {10 - trimmedReason.length} more character{10 - trimmedReason.length === 1 ? '' : 's'} required
                </span>
              )}
            </span>
            <span className={trimmedReason.length > 1000 ? 'text-status-danger-text font-bold' : ''}>
              {trimmedReason.length} / 1000
            </span>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
