'use client';

import React, { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getSignedEvidenceUrlAction } from '@/actions/round-submission-actions';

export interface EvidencePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string;
  title?: string;
}

export function EvidencePreviewModal({
  isOpen,
  onClose,
  submissionId,
  title = 'Milestone Evidence Screenshot',
}: EvidencePreviewModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !submissionId) return;

    let isMounted = true;

    getSignedEvidenceUrlAction(submissionId).then((res) => {
      if (!isMounted) return;
      if (res.success && res.signedUrl) {
        setSignedUrl(res.signedUrl);
      } else {
        setError(res.error || 'Failed to retrieve secure evidence preview URL.');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, submissionId]);

  const handleClose = () => {
    setSignedUrl(null);
    setError(null);
    onClose();
  };

  const isLoading = Boolean(isOpen && submissionId && !signedUrl && !error);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description="Private, short-lived signed preview of milestone verification evidence."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-text-muted">
            URL expires automatically in 5 minutes
          </span>
          <div className="flex items-center gap-2">
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center text-xs font-medium px-3 py-1.5 rounded bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors"
                id="btn-evidence-open-tab"
              >
                Open Full Size ↗
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              id="btn-close-evidence-preview"
            >
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="min-h-[250px] flex items-center justify-center p-4 bg-background-elevated rounded-md border border-border-subtle">
        {isLoading && (
          <div className="flex flex-col items-center gap-2 text-text-secondary" id="evidence-preview-loading">
            <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Generating secure temporary preview link...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="p-4 bg-status-danger-bg text-status-danger-text rounded text-xs text-center" id="evidence-preview-error">
            <p className="font-semibold mb-1">Preview Unavailable</p>
            <p>{error}</p>
          </div>
        )}

        {signedUrl && !isLoading && (
          <div className="flex flex-col items-center max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt="Milestone Evidence Verification"
              className="max-h-[500px] w-auto max-w-full rounded object-contain border border-border-subtle shadow-sm"
              id="evidence-preview-image"
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
