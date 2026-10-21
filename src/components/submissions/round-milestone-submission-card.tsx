'use client';

import React, { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  submitRoundMilestoneAction,
  resubmitRoundMilestoneAction,
} from '@/actions/round-submission-actions';
import { EvidencePreviewModal } from './evidence-preview-modal';
import type { SubmissionVersionItem } from './submission-version-history-card';

export interface RoundInfo {
  id: string;
  round_number: number;
  name: string;
  status: 'scheduled' | 'open' | 'evaluation' | 'completed' | 'paused';
  start_at: string;
  end_at: string;
}

export interface RoundMilestoneSubmissionCardProps {
  hackathonId: string;
  teamId: string;
  isLeader: boolean;
  round: RoundInfo;
  isQualified: boolean;
  isRegistrationSubmitted: boolean;
  currentSubmission: SubmissionVersionItem | null;
  onSubmissionSuccess?: () => void;
}

export function RoundMilestoneSubmissionCard({
  hackathonId,
  teamId,
  isLeader,
  round,
  isQualified,
  isRegistrationSubmitted,
  currentSubmission,
  onSubmissionSuccess,
}: RoundMilestoneSubmissionCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Form fields
  const [title, setTitle] = useState(currentSubmission?.title || '');
  const [description, setDescription] = useState(currentSubmission?.description || '');
  const [githubUrl, setGithubUrl] = useState(currentSubmission?.github_url || '');
  const [liveDemoUrl, setLiveDemoUrl] = useState(currentSubmission?.live_demo_url || '');
  const [currentTimestamp] = useState(() => Date.now());
  const [reuseEvidence, setReuseEvidence] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPaused = round.status === 'paused';
  const isCompleted = round.status === 'completed';
  const isScheduled = round.status === 'scheduled';
  const isEvaluation = round.status === 'evaluation';
  const isExpired = new Date(round.end_at).getTime() <= currentTimestamp;
  const isOpen = round.status === 'open' && !isExpired && !isPaused;

  const isRevisionRequested = currentSubmission?.status === 'revision_requested';
  const isRejected = currentSubmission?.status === 'rejected';
  const isAccepted = currentSubmission?.status === 'accepted';
  const isUnderReview = currentSubmission?.status === 'under_review' || currentSubmission?.status === 'submitted';

  // Can the team edit / submit right now?
  const canSubmitInitial = !currentSubmission && isOpen && isQualified && isRegistrationSubmitted && isLeader;
  const canResubmitRevision = isRevisionRequested && isOpen && isLeader;
  const canSubmitForm = canSubmitInitial || canResubmitRevision;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitForm || isSubmitting) return;

    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('hackathonId', hackathonId);
    formData.append('roundId', round.id);
    formData.append('teamId', teamId);
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    if (githubUrl.trim()) formData.append('githubUrl', githubUrl.trim());
    if (liveDemoUrl.trim()) formData.append('liveDemoUrl', liveDemoUrl.trim());

    const selectedFile = fileInputRef.current?.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 1024 * 1024) {
        setIsSubmitting(false);
        setError('Selected evidence file exceeds 1 MiB limit. Please choose a smaller JPEG, PNG, or WebP screenshot.');
        return;
      }
      formData.append('evidenceFile', selectedFile);
    }

    let result;
    if (canResubmitRevision && currentSubmission) {
      formData.append('parentSubmissionId', currentSubmission.id);
      if (reuseEvidence && !selectedFile && currentSubmission.evidence_path) {
        formData.append('reusedEvidencePath', currentSubmission.evidence_path);
      }
      result = await resubmitRoundMilestoneAction(formData);
    } else {
      result = await submitRoundMilestoneAction(formData);
    }

    setIsSubmitting(false);

    if (result.success) {
      setSuccessMsg(
        canResubmitRevision
          ? `Revision v${result.version} submitted successfully!`
          : 'Milestone submitted successfully for evaluation!'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onSubmissionSuccess) onSubmissionSuccess();
    } else {
      setError(result.error || 'Submission failed. Please check inputs and try again.');
    }
  };

  return (
    <>
      <Card id="round-milestone-submission-card">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border-subtle">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">
                Round {round.round_number}: {round.name}
              </CardTitle>
              {round.status === 'open' && !isExpired && <Badge variant="success">Open</Badge>}
              {isPaused && <Badge variant="warning">Paused</Badge>}
              {isExpired && !isCompleted && <Badge variant="error">Deadline Expired</Badge>}
              {isCompleted && <Badge variant="neutral">Completed</Badge>}
              {isScheduled && <Badge variant="neutral">Scheduled</Badge>}
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Deadline: {new Date(round.end_at).toLocaleString()}
            </p>
          </div>

          {currentSubmission && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted font-medium">v{currentSubmission.version}</span>
              {isAccepted && <Badge variant="success">Accepted</Badge>}
              {isRejected && <Badge variant="error">Rejected</Badge>}
              {isRevisionRequested && <Badge variant="warning">Revision Requested</Badge>}
              {isUnderReview && <Badge variant="info">Under Review</Badge>}
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Status Banners */}
          {error && (
            <div className="p-3 bg-status-danger-bg text-status-danger-text rounded text-xs" id="milestone-error-banner">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-status-success-bg text-status-success-text rounded text-xs" id="milestone-success-banner">
              {successMsg}
            </div>
          )}

          {!isRegistrationSubmitted && (
            <div className="p-3 bg-status-warning-bg text-status-warning-text rounded text-xs" id="reg-required-notice">
              ⚠ Initial registration proof must be submitted and confirmed before round milestone submissions can be made.
            </div>
          )}

          {!isQualified && round.round_number > 1 && (
            <div className="p-3 bg-status-danger-bg text-status-danger-text rounded text-xs" id="qualification-required-notice">
              ✕ Qualification from Round {round.round_number - 1} is strictly required before submitting to this round.
            </div>
          )}

          {isPaused && (
            <div className="p-3 bg-status-warning-bg text-status-warning-text rounded text-xs" id="round-paused-notice">
              ⏸ This round is currently paused by organizers. Submissions are temporarily held.
            </div>
          )}

          {isExpired && !currentSubmission && (
            <div className="p-3 bg-status-danger-bg text-status-danger-text rounded text-xs" id="deadline-passed-notice">
              ⌛ The milestone submission deadline for Round {round.round_number} has passed.
            </div>
          )}

          {isCompleted && (
            <div className="p-3 bg-background-elevated border border-border-subtle text-text-secondary rounded text-xs" id="round-completed-notice">
              🔒 This round is finalized and locked. Submissions are strictly view-only.
            </div>
          )}

          {/* Current Submission Summary */}
          {currentSubmission && (
            <div className="p-3.5 bg-background-elevated rounded-lg border border-border-subtle space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-primary">
                  {currentSubmission.title}
                </span>
                <span className="text-[11px] text-text-muted">
                  Submitted {new Date(currentSubmission.submitted_at).toLocaleString()}
                </span>
              </div>

              {currentSubmission.description && (
                <p className="text-xs text-text-secondary">{currentSubmission.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
                {currentSubmission.github_url && (
                  <a
                    href={currentSubmission.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary hover:underline"
                    id="link-current-github"
                  >
                    GitHub Repo &rarr;
                  </a>
                )}
                {currentSubmission.live_demo_url && (
                  <a
                    href={currentSubmission.live_demo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary hover:underline"
                    id="link-current-demo"
                  >
                    Live Demo &rarr;
                  </a>
                )}
                {currentSubmission.evidence_path && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => setIsPreviewOpen(true)}
                    id="btn-preview-current-evidence"
                  >
                    View Attached Evidence
                  </Button>
                )}
              </div>

              {/* Revision feedback banner */}
              {isRevisionRequested && currentSubmission.reviews?.[0]?.feedback && (
                <div className="mt-2 p-2.5 bg-status-warning-bg/60 border border-status-warning-border rounded text-xs text-status-warning-text" id="revision-feedback-display">
                  <div className="font-semibold mb-0.5">Reviewer Feedback:</div>
                  <div>{currentSubmission.reviews[0].feedback}</div>
                </div>
              )}

              {/* Rejection notice */}
              {isRejected && (
                <div className="mt-2 p-2.5 bg-status-danger-bg/60 border border-status-danger-border rounded text-xs text-status-danger-text" id="rejection-feedback-display">
                  <div className="font-semibold mb-0.5">Submission Rejected:</div>
                  <div>{currentSubmission.reviews?.[0]?.feedback || 'Milestone does not satisfy qualification standards.'}</div>
                  <div className="text-[11px] mt-1 text-text-muted">
                    This decision is terminal unless an event admin explicitly reopens the submission upon review.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Submission / Revision Form */}
          {canSubmitForm && (
            <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-border-subtle" id="form-milestone-submission">
              <div className="text-xs font-semibold text-text-primary">
                {canResubmitRevision ? `Submit Revision for Round ${round.round_number}` : `Submit Milestone for Round ${round.round_number}`}
              </div>

              <div className="space-y-1">
                <label htmlFor="input-milestone-title" className="block text-xs font-medium text-text-primary">
                  Milestone Title <span className="text-status-danger-text">*</span>
                </label>
                <Input
                  id="input-milestone-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Core Engine Implementation & API Integration"
                  maxLength={120}
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="input-milestone-desc" className="block text-xs font-medium text-text-primary">
                  Description / Progress Summary <span className="text-text-muted">(Optional)</span>
                </label>
                <Textarea
                  id="input-milestone-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Summary of completed features, architecture, and milestones achieved..."
                  rows={3}
                  maxLength={2000}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="input-milestone-github" className="block text-xs font-medium text-text-primary">
                    GitHub Repository URL
                  </label>
                  <Input
                    id="input-milestone-github"
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/organization/repository"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="input-milestone-demo" className="block text-xs font-medium text-text-primary">
                    Live Demo URL (HTTPS)
                  </label>
                  <Input
                    id="input-milestone-demo"
                    type="url"
                    value={liveDemoUrl}
                    onChange={(e) => setLiveDemoUrl(e.target.value)}
                    placeholder="https://demo.myapp.com"
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Evidence Upload */}
              <div className="space-y-1.5 p-3 rounded bg-background-elevated/60 border border-border-subtle">
                <label htmlFor="input-milestone-file" className="block text-xs font-medium text-text-primary">
                  Primary Evidence Image Screenshot <span className="text-text-muted">(Optional)</span>
                </label>
                <p className="text-[11px] text-text-secondary">
                  Accepted formats: <strong>JPEG, PNG, WebP</strong>. Strict maximum size: <strong>1 MiB</strong> (1,048,576 bytes).
                </p>

                {canResubmitRevision && currentSubmission?.evidence_path && (
                  <div className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      id="checkbox-reuse-evidence"
                      checked={reuseEvidence}
                      onChange={(e) => setReuseEvidence(e.target.checked)}
                      className="accent-brand-primary"
                    />
                    <label htmlFor="checkbox-reuse-evidence" className="text-xs text-text-secondary cursor-pointer">
                      Reuse prior evidence screenshot if no new screenshot is selected
                    </label>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  id="input-milestone-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-brand-primary/10 file:text-brand-primary hover:file:bg-brand-primary/20 cursor-pointer"
                />
              </div>

              {!isLeader && (
                <p className="text-xs text-text-muted italic">
                  Only the designated team leader can submit milestone entries.
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!isLeader || isSubmitting}
                isLoading={isSubmitting}
                id="btn-submit-milestone"
              >
                {canResubmitRevision ? 'Submit Updated Revision' : 'Submit Milestone for Review'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {currentSubmission && isPreviewOpen && (
        <EvidencePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          submissionId={currentSubmission.id}
          title={`Evidence — ${currentSubmission.title}`}
        />
      )}
    </>
  );
}
