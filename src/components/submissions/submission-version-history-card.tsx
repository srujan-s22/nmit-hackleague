'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EvidencePreviewModal } from './evidence-preview-modal';

export interface SubmissionVersionItem {
  id: string;
  version: number;
  is_current: boolean;
  status: string;
  title: string;
  description: string | null;
  github_url: string | null;
  live_demo_url: string | null;
  evidence_path: string | null;
  evidence_deleted_at?: string | null;
  submitted_at: string;
  reviews?: {
    id: string;
    decision: string;
    feedback: string | null;
    reviewed_at: string;
    reviewer?: {
      full_name: string;
    } | null;
  }[];
}

export interface SubmissionVersionHistoryCardProps {
  versions: SubmissionVersionItem[];
  teamName?: string;
  roundName?: string;
}

export function SubmissionVersionHistoryCard({
  versions,
  teamName,
  roundName,
}: SubmissionVersionHistoryCardProps) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  if (!versions || versions.length === 0) {
    return null;
  }

  const getStatusBadge = (status: string, isCurrent: boolean) => {
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
        return isCurrent ? <Badge variant="info">Current Submission</Badge> : <Badge variant="neutral">Superseded (v{versions.find((v) => v.status === status)?.version})</Badge>;
    }
  };

  return (
    <>
      <Card id="submission-version-history-card">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border-subtle">
          <div>
            <CardTitle className="text-sm font-semibold">
              Submission History {roundName ? `— ${roundName}` : ''}
            </CardTitle>
            <p className="text-[11px] text-text-muted mt-0.5">
              Immutable version trail for {teamName || 'this team'} ({versions.length} version{versions.length === 1 ? '' : 's'})
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border-subtle">
            {versions.map((ver) => {
              const latestReview = ver.reviews && ver.reviews.length > 0 ? ver.reviews[0] : null;

              return (
                <div
                  key={ver.id}
                  className={`relative p-3 rounded-lg border transition-all ${
                    ver.is_current
                      ? 'border-brand-primary/40 bg-brand-primary/5 shadow-xs'
                      : 'border-border-subtle bg-background-elevated/40'
                  }`}
                  id={`version-card-${ver.version}`}
                >
                  {/* Timeline bullet marker */}
                  <div
                    className={`absolute -left-[27px] top-4 w-3 h-3 rounded-full border-2 ${
                      ver.is_current
                        ? 'bg-brand-primary border-background'
                        : 'bg-text-muted/40 border-background'
                    }`}
                  />

                  {/* Version header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-text-primary">
                        Version {ver.version}
                      </span>
                      {ver.is_current && (
                        <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-brand-primary/20 text-brand-primary">
                          Active
                        </span>
                      )}
                      {getStatusBadge(ver.status, ver.is_current)}
                    </div>
                    <span className="text-[11px] text-text-muted">
                      {new Date(ver.submitted_at).toLocaleString()}
                    </span>
                  </div>

                  {/* Title and Description */}
                  <div className="text-xs font-medium text-text-primary mb-1">
                    {ver.title}
                  </div>
                  {ver.description && (
                    <p className="text-[11px] text-text-secondary mb-2 whitespace-pre-wrap">
                      {ver.description}
                    </p>
                  )}

                  {/* Artifacts links */}
                  <div className="flex flex-wrap items-center gap-3 pt-2 text-xs border-t border-border-subtle/50">
                    {ver.github_url && (
                      <a
                        href={ver.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                        id={`link-github-v${ver.version}`}
                      >
                        <span>GitHub Repository &rarr;</span>
                      </a>
                    )}

                    {ver.live_demo_url && (
                      <a
                        href={ver.live_demo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-brand-primary hover:underline"
                        id={`link-demo-v${ver.version}`}
                      >
                        <span>Live Demo &rarr;</span>
                      </a>
                    )}

                    {ver.evidence_path && (
                      <div className="inline-flex items-center gap-1.5">
                        {ver.evidence_deleted_at ? (
                          <span className="text-[11px] text-text-muted italic">
                            Evidence screenshot purged per retention policy
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[11px] px-2"
                            onClick={() => setSelectedSubmissionId(ver.id)}
                            id={`btn-view-evidence-v${ver.version}`}
                          >
                            View Evidence Screenshot
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Review feedback if present */}
                  {latestReview && (
                    <div
                      className={`mt-3 p-2.5 rounded text-xs ${
                        latestReview.decision === 'accepted'
                          ? 'bg-status-success-bg/60 text-status-success-text border border-status-success-border/40'
                          : latestReview.decision === 'rejected'
                          ? 'bg-status-danger-bg/60 text-status-danger-text border border-status-danger-border/40'
                          : 'bg-status-warning-bg/60 text-status-warning-text border border-status-warning-border/40'
                      }`}
                      id={`feedback-box-v${ver.version}`}
                    >
                      <div className="flex items-center justify-between mb-1 font-semibold text-[11px]">
                        <span>Reviewer Evaluation: {latestReview.decision.replace('_', ' ').toUpperCase()}</span>
                        <span className="text-[10px] opacity-75">
                          {new Date(latestReview.reviewed_at).toLocaleDateString()}
                        </span>
                      </div>
                      {latestReview.feedback ? (
                        <p className="whitespace-pre-wrap">{latestReview.feedback}</p>
                      ) : (
                        <p className="italic text-[11px] opacity-80">No written commentary provided.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {selectedSubmissionId && (
        <EvidencePreviewModal
          isOpen={Boolean(selectedSubmissionId)}
          onClose={() => setSelectedSubmissionId(null)}
          submissionId={selectedSubmissionId}
        />
      )}
    </>
  );
}
