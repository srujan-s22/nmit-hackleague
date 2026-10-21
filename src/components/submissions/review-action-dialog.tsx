'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { reviewRoundSubmissionAction } from '@/actions/round-review-actions';

export interface ReviewActionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string;
  submissionTitle: string;
  teamName: string;
  initialDecision: 'accepted' | 'rejected' | 'revision_requested';
  onSuccess: () => void;
}

export function ReviewActionDialog({
  isOpen,
  onClose,
  submissionId,
  submissionTitle,
  teamName,
  initialDecision,
  onSuccess,
}: ReviewActionDialogProps) {
  const [decision, setDecision] = useState<'accepted' | 'rejected' | 'revision_requested'>(initialDecision);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setFeedback('');
    setError(null);
    onClose();
  };

  const trimmedFeedback = feedback.trim();
  const isFeedbackRequired = decision === 'rejected' || decision === 'revision_requested';
  const isFeedbackValid = !isFeedbackRequired || trimmedFeedback.length >= 10;
  const isTooLong = trimmedFeedback.length > 1000;
  const canSubmit = isFeedbackValid && !isTooLong && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    const res = await reviewRoundSubmissionAction(
      submissionId,
      decision,
      trimmedFeedback || undefined
    );

    setIsSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || 'Review submission failed.');
    }
  };

  const titles = {
    accepted: 'Accept Milestone Submission',
    rejected: 'Reject Milestone Submission',
    revision_requested: 'Request Revision from Team',
  };

  const descriptions = {
    accepted: 'Approve this milestone and award sequential round qualification.',
    rejected: 'Reject this milestone. The submission will become terminal unless explicitly reopened by an authorized organizer.',
    revision_requested: 'Request modifications. The team will be permitted to submit a new version addressing your feedback.',
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={titles[decision]}
      description={`Reviewing milestone "${submissionTitle}" submitted by ${teamName}.`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
            id="btn-cancel-review"
          >
            Cancel
          </Button>
          <Button
            variant={decision === 'rejected' ? 'destructive' : 'primary'}
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            isLoading={isSubmitting}
            id="btn-submit-review-confirm"
          >
            Confirm {decision === 'accepted' ? 'Acceptance' : decision === 'rejected' ? 'Rejection' : 'Revision Request'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-status-danger-bg text-status-danger-text rounded text-xs" id="review-error-banner">
            {error}
          </div>
        )}

        <div className="flex gap-2 p-1 bg-background-elevated rounded border border-border-subtle" role="radiogroup" aria-label="Review Decision">
          <button
            type="button"
            role="radio"
            aria-checked={decision === 'accepted'}
            onClick={() => setDecision('accepted')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
              decision === 'accepted'
                ? 'bg-status-success-bg text-status-success-text shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            id="radio-decision-accept"
          >
            ✓ Accept
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={decision === 'revision_requested'}
            onClick={() => setDecision('revision_requested')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
              decision === 'revision_requested'
                ? 'bg-status-warning-bg text-status-warning-text shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            id="radio-decision-revision"
          >
            ↻ Request Revision
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={decision === 'rejected'}
            onClick={() => setDecision('rejected')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded transition-colors ${
              decision === 'rejected'
                ? 'bg-status-danger-bg text-status-danger-text shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
            id="radio-decision-reject"
          >
            ✕ Reject
          </button>
        </div>

        <p className="text-xs text-text-secondary italic">
          {descriptions[decision]}
        </p>

        <div className="space-y-1">
          <label htmlFor="review-feedback" className="block text-xs font-medium text-text-primary">
            Reviewer Feedback {isFeedbackRequired ? <span className="text-status-danger-text">*</span> : <span className="text-text-muted">(Optional)</span>}
          </label>
          <Textarea
            id="review-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            placeholder={
              isFeedbackRequired
                ? 'Explain clearly what needs to be improved or the reason for rejection (at least 10 characters)...'
                : 'Optional commendations or guidance for the team (max 1000 characters)...'
            }
            className="w-full text-xs"
          />
          <div className="flex justify-between items-center text-[11px] text-text-muted">
            <span>
              {isFeedbackRequired && trimmedFeedback.length < 10 && (
                <span className="text-status-danger-text font-medium">
                  {10 - trimmedFeedback.length} more character{10 - trimmedFeedback.length === 1 ? '' : 's'} required
                </span>
              )}
            </span>
            <span className={trimmedFeedback.length > 1000 ? 'text-status-danger-text font-bold' : ''}>
              {trimmedFeedback.length} / 1000
            </span>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
