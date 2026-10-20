'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { regenerateInvitationCodeAction } from '@/actions/team-actions';

export interface InvitationCodeCardProps {
  teamId: string;
  invitationCode: string | null;
  expiresAt: string | null;
  isLeader: boolean;
  internalStatus: string;
  onCodeRegenerated?: (newCode: string) => void;
}

export function InvitationCodeCard({
  teamId,
  invitationCode: initialCode,
  expiresAt: initialExpiresAt,
  isLeader,
  internalStatus,
  onCodeRegenerated,
}: InvitationCodeCardProps) {
  const [currentCode, setCurrentCode] = useState<string | null>(initialCode);
  const [currentExpiresAt, setCurrentExpiresAt] = useState<string | null>(initialExpiresAt);
  const [isCopied, setIsCopied] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Invitation code is only manageable by the leader while forming
  if (!isLeader || internalStatus !== 'forming') {
    return null;
  }

  const handleCopy = async () => {
    if (!currentCode) return;
    try {
      await navigator.clipboard.writeText(currentCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      setErrorMsg('Failed to copy code to clipboard.');
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await regenerateInvitationCodeAction(teamId);
      if (!res.success || !res.data?.invitationCode) {
        setErrorMsg(res.error || 'Failed to regenerate code.');
        setIsRegenerating(false);
        setIsConfirmOpen(false);
        return;
      }

      const newCode = res.data.invitationCode;
      setCurrentCode(newCode);
      // New code expires in 72h by default
      const newExpiry = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      setCurrentExpiresAt(newExpiry);
      setSuccessMsg('Invitation code regenerated successfully. The old code is now revoked.');
      setIsConfirmOpen(false);
      if (onCodeRegenerated) {
        onCodeRegenerated(newCode);
      }
    } catch {
      setErrorMsg('A network error occurred while regenerating code.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const formattedExpiry = currentExpiresAt
    ? new Date(currentExpiresAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '72 hours from generation';

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Invitation Code</CardTitle>
              <CardDescription>
                Share this code with eligible students you want to join your team.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMsg && (
            <Alert variant="error" onClose={() => setErrorMsg(null)}>
              {errorMsg}
            </Alert>
          )}

          {successMsg && (
            <Alert variant="success" onClose={() => setSuccessMsg(null)}>
              {successMsg}
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-surface-subtle border border-border-subtle rounded-md">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary block">
                Active Code
              </span>
              <span className="font-mono text-xl sm:text-2xl font-bold tracking-widest text-text-primary select-all">
                {currentCode || 'NO-ACTIVE-CODE'}
              </span>
              <p className="text-[11px] text-text-muted">
                Expires on: <span className="font-medium text-text-secondary">{formattedExpiry}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant={isCopied ? 'secondary' : 'primary'}
                size="sm"
                onClick={handleCopy}
                disabled={!currentCode}
                className="flex-1 sm:flex-initial"
                leftIcon={
                  isCopied ? (
                    <svg className="w-4 h-4 text-status-success-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )
                }
              >
                {isCopied ? 'Copied!' : 'Copy Code'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsConfirmOpen(true)}
                title="Regenerate invitation code"
              >
                Regenerate
              </Button>
            </div>
          </div>

          <p className="text-xs text-text-secondary leading-normal">
            Only share this code with trusted classmates. Regenerating the code immediately
            invalidates the current code, preventing anyone using the old code from joining.
          </p>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for Regeneration */}
      <Dialog
        isOpen={isConfirmOpen}
        onClose={() => !isRegenerating && setIsConfirmOpen(false)}
        title="Regenerate Invitation Code?"
        description="Are you sure you want to generate a new invitation code?"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRegenerate}
              isLoading={isRegenerating}
            >
              Yes, Regenerate Code
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs text-text-secondary">
          <p>
            When you regenerate the invitation code, the existing code{' '}
            <strong className="font-mono text-text-primary">{currentCode}</strong> will be
            immediately revoked and cannot be used by anyone to join.
          </p>
          <p>Existing team members will remain on the roster unaffected.</p>
        </div>
      </Dialog>
    </>
  );
}
