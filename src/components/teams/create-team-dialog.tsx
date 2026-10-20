'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { createTeamAction } from '@/actions/team-actions';
import { createTeamSchema } from '@/lib/validation/team-schemas';

export interface HackathonOption {
  id: string;
  title: string;
  min_team_size: number;
  max_team_size: number;
  is_solo_allowed: boolean;
  registration_state?: string;
}

export interface CreateTeamDialogProps {
  isOpen: boolean;
  onClose: () => void;
  hackathons: HackathonOption[];
  preselectedHackathonId?: string;
  onSuccess?: (teamId: string) => void;
}

export function CreateTeamDialog({
  isOpen,
  onClose,
  hackathons,
  preselectedHackathonId,
  onSuccess,
}: CreateTeamDialogProps) {
  const router = useRouter();
  const [hackathonId, setHackathonId] = useState<string>(
    preselectedHackathonId || (hackathons[0]?.id ?? '')
  );
  const [teamName, setTeamName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ hackathonId?: string; name?: string }>({});

  const selectedHackathon = hackathons.find((h) => h.id === hackathonId);

  const resetForm = () => {
    setTeamName('');
    setErrorMessage(null);
    setFieldErrors({});
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm();
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    // Client-side schema validation
    const clientValidation = createTeamSchema.safeParse({
      hackathonId,
      name: teamName,
    });

    if (!clientValidation.success) {
      const formattedErrors: { hackathonId?: string; name?: string } = {};
      for (const issue of clientValidation.error.issues) {
        if (issue.path[0] === 'name') formattedErrors.name = issue.message;
        if (issue.path[0] === 'hackathonId') formattedErrors.hackathonId = issue.message;
      }
      setFieldErrors(formattedErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createTeamAction(hackathonId, teamName.trim());

      if (!result.success || !result.data?.teamId) {
        setErrorMessage(result.error || 'Failed to create team. Please try again.');
        setIsSubmitting(false);
        return;
      }

      const newTeamId = result.data.teamId;
      resetForm();
      onClose();

      if (onSuccess) {
        onSuccess(newTeamId);
      } else {
        router.push(`/student/teams/${newTeamId}`);
        router.refresh();
      }
    } catch {
      setErrorMessage('A network error occurred while creating the team.');
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Team"
      description="Form a new team for an active hackathon. You will automatically become the team leader."
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
            disabled={isSubmitting || !hackathonId || !teamName.trim()}
          >
            Create Team
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

        {/* Hackathon Selection */}
        {hackathons.length > 1 && !preselectedHackathonId ? (
          <div>
            <Select
              label="Select Hackathon"
              required
              value={hackathonId}
              onChange={(e) => setHackathonId(e.target.value)}
              disabled={isSubmitting}
              error={fieldErrors.hackathonId}
              options={hackathons.map((h) => ({
                label: h.title,
                value: h.id,
              }))}
            />
          </div>
        ) : (
          <div>
            <span className="text-xs text-text-secondary block font-medium mb-1">
              Selected Hackathon
            </span>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-sm text-sm font-semibold text-text-primary">
              {selectedHackathon?.title || 'Selected Hackathon'}
            </div>
          </div>
        )}

        {/* Team Guidelines */}
        {selectedHackathon && (
          <div className="bg-surface-subtle/80 border border-border-subtle rounded-sm p-3 text-xs space-y-1 text-text-secondary">
            <div className="flex justify-between">
              <span>Required Team Size:</span>
              <strong className="text-text-primary">
                {selectedHackathon.min_team_size === selectedHackathon.max_team_size
                  ? `${selectedHackathon.min_team_size} members`
                  : `${selectedHackathon.min_team_size} to ${selectedHackathon.max_team_size} members`}
              </strong>
            </div>
            <div className="flex justify-between">
              <span>Solo Participation:</span>
              <strong className="text-text-primary">
                {selectedHackathon.is_solo_allowed ? 'Allowed' : 'Team Required (2+)'}
              </strong>
            </div>
          </div>
        )}

        {/* Team Name Input */}
        <div>
          <Input
            label="Team Name"
            placeholder="e.g., Syntax Squad, CyberNavigators"
            required
            value={teamName}
            onChange={(e) => {
              setTeamName(e.target.value);
              if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
            }}
            disabled={isSubmitting}
            error={fieldErrors.name}
            helperText="Between 2 and 50 characters. Pick a unique, appropriate name."
            maxLength={50}
          />
          <div className="text-right text-[11px] text-text-helper mt-1">
            {teamName.length} / 50 characters
          </div>
        </div>
      </form>
    </Dialog>
  );
}
