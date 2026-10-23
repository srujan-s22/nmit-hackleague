'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EvidencePreviewModal } from '@/components/submissions/evidence-preview-modal';
import { ReviewActionDialog } from '@/components/submissions/review-action-dialog';
import { ReopenActionDialog } from '@/components/submissions/reopen-action-dialog';
import { WinnerPlacementDialog } from '@/components/submissions/winner-placement-dialog';

export interface HackathonRoundInfo {
  id: string;
  round_number: number;
  name: string;
  status: string;
  start_at: string;
  end_at: string;
}

export interface ReviewInfo {
  id: string;
  reviewer_id: string;
  decision: string;
  feedback: string | null;
  reviewed_at: string;
}

export interface SubmissionRow {
  id: string;
  hackathon_id: string;
  round_id: string;
  team_id: string;
  submitted_by: string;
  parent_submission_id: string | null;
  version: number;
  is_current: boolean;
  status: string;
  title: string;
  description: string | null;
  github_url: string | null;
  live_demo_url: string | null;
  evidence_path: string | null;
  evidence_deleted_at: string | null;
  evidence_lifecycle_state: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  team: {
    id: string;
    name: string;
    leader_id: string;
    external_status: string;
  };
  reviews: ReviewInfo[];
}

export interface ResultRow {
  id: string;
  round_id: string;
  team_id: string;
  milestone_type: string;
  rank: number | null;
}

export interface SubmissionsClientProps {
  hackathon: {
    id: string;
    title: string;
    slug: string;
    status: string;
  };
  rounds: HackathonRoundInfo[];
  initialSubmissions: SubmissionRow[];
  results: ResultRow[];
  isSuperAdmin: boolean;
}

export function SubmissionsClient({
  hackathon,
  rounds,
  initialSubmissions,
  results,
  isSuperAdmin,
}: SubmissionsClientProps) {
  const router = useRouter();
  const [currentTimestamp] = useState(() => Date.now());
  const [selectedRoundId, setSelectedRoundId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTeamHistories, setExpandedTeamHistories] = useState<Record<string, boolean>>({});

  // Dialog states
  const [previewSubmissionId, setPreviewSubmissionId] = useState<string | null>(null);
  const [reviewDialog, setReviewDialog] = useState<{
    isOpen: boolean;
    submissionId: string;
    title: string;
    teamName: string;
    decision: 'accepted' | 'rejected' | 'revision_requested';
  } | null>(null);

  const [reopenDialog, setReopenDialog] = useState<{
    isOpen: boolean;
    submissionId: string;
    title: string;
    teamName: string;
  } | null>(null);

  const [winnerDialog, setWinnerDialog] = useState<{
    isOpen: boolean;
    submissionId: string;
    title: string;
    teamName: string;
  } | null>(null);

  // Group submissions by round & team
  const currentSubmissions = initialSubmissions.filter((s) => s.is_current);

  const filteredSubmissions = currentSubmissions.filter((sub) => {
    if (selectedRoundId !== 'all' && sub.round_id !== selectedRoundId) {
      return false;
    }
    if (statusFilter !== 'all' && sub.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTeam = sub.team?.name?.toLowerCase().includes(q);
      const matchTitle = sub.title?.toLowerCase().includes(q);
      if (!matchTeam && !matchTitle) return false;
    }
    return true;
  });

  const getRoundInfo = (roundId: string) => rounds.find((r) => r.id === roundId);

  const getWinnerPlacement = (roundId: string, teamId: string) => {
    const res = results.find(
      (r) => r.round_id === roundId && r.team_id === teamId && r.milestone_type === 'round_winner'
    );
    return res?.rank;
  };

  const getHistoricalVersions = (roundId: string, teamId: string) => {
    return initialSubmissions
      .filter((s) => s.round_id === roundId && s.team_id === teamId && !s.is_current)
      .sort((a, b) => b.version - a.version);
  };

  const toggleHistory = (teamRoundKey: string) => {
    setExpandedTeamHistories((prev) => ({
      ...prev,
      [teamRoundKey]: !prev[teamRoundKey],
    }));
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return <Badge variant="success">Accepted</Badge>;
      case 'rejected':
        return <Badge variant="error">Rejected</Badge>;
      case 'revision_requested':
        return <Badge variant="warning">Revision Requested</Badge>;
      case 'under_review':
        return <Badge variant="neutral">Under Review</Badge>;
      case 'submitted':
      default:
        return <Badge variant="info">Pending Review</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Submissions Review: ${hackathon.title}`}
        description="Verify submitted milestone artifacts, evaluate evidence provenance, and award sequential round advancement."
        breadcrumbs={[
          { label: 'Admin Workspace', href: '/admin' },
          { label: 'Hackathons', href: '/admin/hackathons' },
          { label: hackathon.title, href: `/admin/hackathons/${hackathon.id}` },
          { label: 'Round Submissions' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/hackathons/${hackathon.id}/rounds`}
              className="text-xs text-brand-primary hover:underline"
            >
              Configure Rounds &rarr;
            </Link>
          </div>
        }
      />

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-4 justify-between">
            {/* Round Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Round filter">
              <button
                type="button"
                onClick={() => setSelectedRoundId('all')}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  selectedRoundId === 'all'
                    ? 'bg-surface-inverse text-text-inverse shadow-xs'
                    : 'bg-surface-subtle text-text-secondary hover:text-text-primary'
                }`}
                id="filter-round-all"
              >
                All Rounds ({currentSubmissions.length})
              </button>
              {rounds.map((r) => {
                const count = currentSubmissions.filter((s) => s.round_id === r.id).length;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoundId(r.id)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                      selectedRoundId === r.id
                        ? 'bg-surface-inverse text-text-inverse shadow-xs'
                        : 'bg-surface-subtle text-text-secondary hover:text-text-primary'
                    }`}
                    id={`filter-round-${r.round_number}`}
                  >
                    Round {r.round_number} ({count})
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="w-full sm:w-64">
              <Input
                placeholder="Search team or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs h-8"
                id="search-submissions-input"
              />
            </div>
          </div>

          {/* Status Filter Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle text-xs">
            <span className="text-text-muted font-medium">Status:</span>
            {(['all', 'submitted', 'under_review', 'revision_requested', 'accepted', 'rejected'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  statusFilter === st
                    ? 'bg-surface-inverse text-text-inverse font-bold'
                    : 'bg-surface-subtle text-text-secondary hover:text-text-primary'
                }`}
                id={`filter-status-${st}`}
              >
                {st === 'all' ? 'All Statuses' : st.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Submissions List */}
      <div className="space-y-4">
        {filteredSubmissions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-text-muted">
              <p className="text-sm font-semibold">No milestone submissions found</p>
              <p className="text-xs mt-1">
                {searchQuery || statusFilter !== 'all' || selectedRoundId !== 'all'
                  ? 'Try broadening your search or filter criteria.'
                  : 'Teams have not submitted milestones for the active rounds yet.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredSubmissions.map((sub) => {
            const round = getRoundInfo(sub.round_id);
            const teamRoundKey = `${sub.round_id}-${sub.team_id}`;
            const history = getHistoricalVersions(sub.round_id, sub.team_id);
            const isHistoryExpanded = Boolean(expandedTeamHistories[teamRoundKey]);
            const winnerPlacement = getWinnerPlacement(sub.round_id, sub.team_id);
            const latestReview = sub.reviews && sub.reviews.length > 0 ? sub.reviews[0] : null;

            const isRoundCompleted = round?.status === 'completed';
            const isRoundPaused = round?.status === 'paused';
            const isRoundExpired = round ? new Date(round.end_at).getTime() <= currentTimestamp : false;
            const canReview = !isRoundCompleted && !isRoundPaused && (!isRoundExpired || round?.status === 'evaluation');

            return (
              <Card key={sub.id} className="overflow-hidden border border-border-subtle" id={`submission-row-${sub.id}`}>
                <CardHeader className="bg-background-elevated/40 pb-3 flex flex-row items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-text-primary">
                      {sub.team?.name || 'Unnamed Team'}
                    </span>
                    <Badge variant="neutral">
                      Round {round?.round_number || '?'}: {round?.name || 'Round'}
                    </Badge>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-primary/10 text-brand-primary">
                      v{sub.version}
                    </span>
                    {renderStatusBadge(sub.status)}
                    {winnerPlacement && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {winnerPlacement === 1 ? '🥇 1st Place' : winnerPlacement === 2 ? '🥈 2nd Place' : '🥉 3rd Place'}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text-muted">
                    Submitted {new Date(sub.submitted_at).toLocaleString()}
                  </span>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  {/* Title & Description */}
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-1">{sub.title}</h3>
                    {sub.description && (
                      <p className="text-xs text-text-secondary whitespace-pre-wrap">{sub.description}</p>
                    )}
                  </div>

                  {/* Submission Artifacts */}
                  <div className="flex flex-wrap items-center gap-3 p-2.5 rounded bg-background-elevated border border-border-subtle text-xs">
                    <span className="text-text-muted font-medium">Artifacts:</span>

                    {sub.github_url && (
                      <a
                        href={sub.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-primary hover:underline font-medium"
                        id={`admin-link-github-${sub.id}`}
                      >
                        GitHub Repo &rarr;
                      </a>
                    )}

                    {sub.live_demo_url && (
                      <a
                        href={sub.live_demo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-primary hover:underline font-medium"
                        id={`admin-link-demo-${sub.id}`}
                      >
                        Live Demo &rarr;
                      </a>
                    )}

                    {sub.evidence_path ? (
                      sub.evidence_deleted_at ? (
                        <span className="text-[11px] text-text-muted italic">
                          Evidence purged per retention policy
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2.5"
                          onClick={() => setPreviewSubmissionId(sub.id)}
                          id={`admin-btn-preview-evidence-${sub.id}`}
                        >
                          Preview Evidence Screenshot
                        </Button>
                      )
                    ) : (
                      <span className="text-[11px] text-text-muted italic">No screenshot attached</span>
                    )}
                  </div>

                  {/* Review Feedback Banner */}
                  {latestReview && (
                    <div
                      className={`p-3 rounded text-xs ${
                        latestReview.decision === 'accepted'
                          ? 'bg-status-success-bg/40 text-status-success-text border border-status-success-border/30'
                          : latestReview.decision === 'rejected'
                          ? 'bg-status-danger-bg/40 text-status-danger-text border border-status-danger-border/30'
                          : 'bg-status-warning-bg/40 text-status-warning-text border border-status-warning-border/30'
                      }`}
                      id={`admin-review-feedback-${sub.id}`}
                    >
                      <div className="flex items-center justify-between font-semibold mb-1 text-[11px]">
                        <span>Evaluation: {latestReview.decision.replace('_', ' ').toUpperCase()}</span>
                        <span className="text-[10px] opacity-75">
                          {new Date(latestReview.reviewed_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{latestReview.feedback || 'No written feedback.'}</p>
                    </div>
                  )}

                  {/* Actions Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border-subtle">
                    <div className="flex items-center gap-2">
                      {history.length > 0 && (
                        <Button
                          variant="tertiary"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => toggleHistory(teamRoundKey)}
                          id={`btn-toggle-history-${sub.id}`}
                        >
                          {isHistoryExpanded ? 'Hide' : 'View'} Prior Versions ({history.length})
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Review Buttons */}
                      {canReview && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 border-status-success-border text-status-success-text hover:bg-status-success-bg"
                            onClick={() =>
                              setReviewDialog({
                                isOpen: true,
                                submissionId: sub.id,
                                title: sub.title,
                                teamName: sub.team?.name || 'Team',
                                decision: 'accepted',
                              })
                            }
                            id={`btn-accept-${sub.id}`}
                          >
                            Accept
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 border-status-warning-border text-status-warning-text hover:bg-status-warning-bg"
                            onClick={() =>
                              setReviewDialog({
                                isOpen: true,
                                submissionId: sub.id,
                                title: sub.title,
                                teamName: sub.team?.name || 'Team',
                                decision: 'revision_requested',
                              })
                            }
                            id={`btn-request-revision-${sub.id}`}
                          >
                            Request Revision
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 border-status-danger-border text-status-danger-text hover:bg-status-danger-bg"
                            onClick={() =>
                              setReviewDialog({
                                isOpen: true,
                                submissionId: sub.id,
                                title: sub.title,
                                teamName: sub.team?.name || 'Team',
                                decision: 'rejected',
                              })
                            }
                            id={`btn-reject-${sub.id}`}
                          >
                            Reject
                          </Button>
                        </>
                      )}

                      {/* Reopen Button for Rejected Submissions */}
                      {sub.status === 'rejected' && (
                        <Button
                          variant="primary"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() =>
                            setReopenDialog({
                              isOpen: true,
                              submissionId: sub.id,
                              title: sub.title,
                              teamName: sub.team?.name || 'Team',
                            })
                          }
                          id={`btn-reopen-${sub.id}`}
                        >
                          Reopen Submission
                        </Button>
                      )}

                      {/* Winner Placement Button */}
                      {sub.status === 'accepted' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                          onClick={() =>
                            setWinnerDialog({
                              isOpen: true,
                              submissionId: sub.id,
                              title: sub.title,
                              teamName: sub.team?.name || 'Team',
                            })
                          }
                          id={`btn-award-winner-${sub.id}`}
                        >
                          {winnerPlacement ? 'Update Placement' : 'Award Placement'}
                        </Button>
                      )}

                      {!canReview && isRoundCompleted && (
                        <span className="text-[11px] text-text-muted italic">Round completed (locked)</span>
                      )}
                      {!canReview && isRoundPaused && (
                        <span className="text-[11px] text-status-warning-text font-medium">Round paused</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Version History Trail */}
                  {isHistoryExpanded && history.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-border-subtle/80 space-y-3 bg-background/50 p-3 rounded">
                      <div className="text-xs font-bold text-text-primary">
                        Previous Versions for {sub.team?.name}
                      </div>
                      <div className="space-y-2">
                        {history.map((hist) => {
                          const histReview = hist.reviews && hist.reviews.length > 0 ? hist.reviews[0] : null;
                          return (
                            <div
                              key={hist.id}
                              className="p-2.5 rounded border border-border-subtle bg-background-elevated text-xs flex flex-col gap-1.5"
                              id={`hist-version-${hist.version}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-text-primary">
                                    Version {hist.version}
                                  </span>
                                  {renderStatusBadge(hist.status)}
                                </div>
                                <span className="text-[11px] text-text-muted">
                                  {new Date(hist.submitted_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="font-medium text-text-secondary">{hist.title}</p>
                              {hist.description && (
                                <p className="text-[11px] text-text-muted">{hist.description}</p>
                              )}
                              {histReview?.feedback && (
                                <div className="p-1.5 rounded bg-background text-[11px] text-text-secondary border border-border-subtle">
                                  <strong>Feedback:</strong> {histReview.feedback}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Dialogs */}
      {previewSubmissionId && (
        <EvidencePreviewModal
          isOpen={Boolean(previewSubmissionId)}
          onClose={() => setPreviewSubmissionId(null)}
          submissionId={previewSubmissionId}
        />
      )}

      {reviewDialog && (
        <ReviewActionDialog
          isOpen={reviewDialog.isOpen}
          onClose={() => setReviewDialog(null)}
          submissionId={reviewDialog.submissionId}
          submissionTitle={reviewDialog.title}
          teamName={reviewDialog.teamName}
          initialDecision={reviewDialog.decision}
          onSuccess={() => router.refresh()}
        />
      )}

      {reopenDialog && (
        <ReopenActionDialog
          isOpen={reopenDialog.isOpen}
          onClose={() => setReopenDialog(null)}
          submissionId={reopenDialog.submissionId}
          submissionTitle={reopenDialog.title}
          teamName={reopenDialog.teamName}
          onSuccess={() => router.refresh()}
        />
      )}

      {winnerDialog && (
        <WinnerPlacementDialog
          isOpen={winnerDialog.isOpen}
          onClose={() => setWinnerDialog(null)}
          submissionId={winnerDialog.submissionId}
          submissionTitle={winnerDialog.title}
          teamName={winnerDialog.teamName}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}
