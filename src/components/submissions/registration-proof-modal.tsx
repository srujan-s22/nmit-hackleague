'use client';

import React, { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getRegistrationProofPreviewUrlAction } from '@/actions/registration-proof-actions';

export interface RegistrationProofModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
  teamName: string;
  cdcDeclarationAccepted?: boolean;
}

export function RegistrationProofModal({
  isOpen,
  onClose,
  teamId,
  teamName,
  cdcDeclarationAccepted = true,
}: RegistrationProofModalProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !teamId) return;

    let isMounted = true;

    getRegistrationProofPreviewUrlAction(teamId).then((res) => {
      if (!isMounted) return;
      if (res.success && res.data?.url) {
        setSignedUrl(res.data.url);
      } else {
        setError(res.error || 'Failed to retrieve registration proof preview URL.');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, teamId]);

  const handleClose = () => {
    setSignedUrl(null);
    setError(null);
    onClose();
  };

  const isLoading = Boolean(isOpen && teamId && !signedUrl && !error);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={`Registration Proof — ${teamName}`}
      description="Private, short-lived signed preview of the official portal registration screenshot for audit tracking."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">
              URL expires automatically in 60s
            </span>
            {cdcDeclarationAccepted && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-status-success-bg text-status-success-text border border-status-success-border/30">
                CDC Declaration Accepted
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {signedUrl && (
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center text-xs font-medium px-3 py-1.5 rounded bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-colors"
                id="btn-proof-open-tab"
              >
                Open Full Size ↗
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClose}
              id="btn-close-proof-preview"
            >
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="min-h-[250px] flex items-center justify-center p-4 bg-background-elevated rounded-md border border-border-subtle">
        {isLoading && (
          <div className="flex flex-col items-center gap-2 text-text-secondary" id="proof-preview-loading">
            <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium">Generating secure temporary preview link...</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="p-4 bg-status-danger-bg text-status-danger-text rounded text-xs text-center" id="proof-preview-error">
            <p className="font-semibold mb-1">Preview Unavailable</p>
            <p>{error}</p>
          </div>
        )}

        {signedUrl && !isLoading && (
          <div className="flex flex-col items-center max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signedUrl}
              alt={`Registration proof for ${teamName}`}
              className="max-h-[500px] w-auto max-w-full rounded object-contain border border-border-subtle shadow-sm"
              id="proof-preview-image"
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
