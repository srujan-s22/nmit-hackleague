'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { joinTeamWithCodeAction } from '@/actions/team-actions';
import { joinTeamSchema } from '@/lib/validation/team-schemas';

export interface JoinTeamDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (teamId: string) => void;
}

export function JoinTeamDialog({
  isOpen,
  onClose,
  onSuccess,
}: JoinTeamDialogProps) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const resetForm = () => {
    setCode('');
    setErrorMessage(null);
    setFieldError(null);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Automatically uppercase and clean input
    const cleaned = e.target.value.toUpperCase().replace(/\s+/g, '');
    setCode(cleaned);
    if (fieldError) setFieldError(null);
    if (errorMessage) setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldError(null);

    const validation = joinTeamSchema.safeParse({ invitationCode: code });
    if (!validation.success) {
      setFieldError(
        validation.error.issues[0]?.message ||
          'Please enter a valid 12-character invitation code.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await joinTeamWithCodeAction(code);

      if (!result.success || !result.data?.teamId) {
        setErrorMessage(
          result.error ||
            'Unable to join team with this invitation code. The code may be invalid, expired, or the team may be full.'
        );
        setIsSubmitting(false);
        return;
      }

      const teamId = result.data.teamId;
      resetForm();
      onClose();

      if (onSuccess) {
        onSuccess(teamId);
      } else {
        router.push(`/student/teams/${teamId}`);
        router.refresh();
      }
    } catch {
      setErrorMessage('A network error occurred while joining the team.');
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Join Team with Invitation Code"
      description="Enter the 12-character code provided by your team leader to join their roster."
      maxWidth="md"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            isLoading={isSubmitting}
            disabled={isSubmitting || code.trim().length === 0}
          >
            Join Team
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <Alert variant="error" onClose={() => setErrorMessage(null)}>
            {errorMessage}
          </Alert>
        )}

        <div>
          <Input
            label="12-Character Invitation Code"
            placeholder="e.g., 7KV9N2P4WR5X"
            required
            value={code}
            onChange={handleCodeChange}
            disabled={isSubmitting}
            error={fieldError || undefined}
            helperText="Invitation codes are 12 alphanumeric characters (Crockford Base32)."
            maxLength={12}
            className="font-mono tracking-widest text-base uppercase text-center"
          />
        </div>

        <div className="bg-surface-subtle p-3 rounded-sm border border-border-subtle text-xs text-text-secondary space-y-1">
          <p className="font-semibold text-text-primary">Important Rules:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>You can only belong to one team per hackathon.</li>
            <li>If you are already in a team for this hackathon, you must leave it first.</li>
            <li>Teams that have already locked their roster cannot accept new members.</li>
          </ul>
        </div>
      </form>
    </Dialog>
  );
}
