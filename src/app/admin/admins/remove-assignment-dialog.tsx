'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { removeAdminFromHackathonAction } from '@/actions/admin-assignment-actions';

interface RemoveAssignmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: {
    id: string;
    hackathon_id: string;
    admin_id: string;
    admin_name: string;
    admin_email: string;
    role: string;
    hackathon_title: string;
    is_in_charge?: boolean;
  } | null;
  onSuccess: () => void;
}

export function RemoveAssignmentDialog({
  isOpen,
  onClose,
  assignment,
  onSuccess,
}: RemoveAssignmentDialogProps) {
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidJustification = justification.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignment) return;

    if (assignment.is_in_charge) {
      setError(
        'Cannot remove assignment: this administrator is designated as the primary In-Charge administrator. You must reassign the in-charge administrator first via Reassign In-Charge.'
      );
      return;
    }

    if (!isValidJustification) {
      setError('A meaningful justification of at least 10 characters is required for audit compliance.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await removeAdminFromHackathonAction({
        hackathonId: assignment.hackathon_id,
        targetAdminId: assignment.admin_id,
        justification: justification.trim(),
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to remove assignment.');
      }

      setJustification('');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setJustification('');
    setError(null);
    onClose();
  };

  if (!assignment) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Remove Administrator Assignment"
      description={`Unassign ${assignment.admin_name} from ${assignment.hackathon_title}.`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !isValidJustification || assignment.is_in_charge}
          >
            {isSubmitting ? 'Removing...' : 'Confirm Removal'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {error && (
          <Alert variant="error" title="Removal Error">
            {error}
          </Alert>
        )}

        {assignment.is_in_charge && (
          <Alert variant="warning" title="Primary In-Charge Administrator">
            This administrator is currently the designated primary In-Charge administrator for this
            hackathon. The database requires reassigning the in-charge administrator before their
            assignment can be removed.
          </Alert>
        )}

        <div className="p-3 bg-surface-subtle rounded-xs border border-border-subtle text-xs space-y-1">
          <div>
            <span className="text-text-secondary">Administrator: </span>
            <span className="font-semibold text-text-primary">{assignment.admin_name}</span>{' '}
            <span className="text-text-muted">({assignment.admin_email})</span>
          </div>
          <div>
            <span className="text-text-secondary">Current Role: </span>
            <span className="font-semibold capitalize text-text-primary">{assignment.role}</span>
          </div>
          <div>
            <span className="text-text-secondary">Hackathon: </span>
            <span className="font-medium text-text-primary">{assignment.hackathon_title}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">
            Mandatory Justification (Audit Log)
          </label>
          <Textarea
            placeholder="Explain why this administrator is being unassigned (minimum 10 characters)..."
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            className="text-xs"
            rows={3}
            disabled={isSubmitting || assignment.is_in_charge}
          />
          <div className="flex justify-between items-center mt-1 text-[11px]">
            <span
              className={
                justification.trim().length >= 10
                  ? 'text-status-success-text'
                  : 'text-status-error-text'
              }
            >
              {justification.trim().length}/10 characters minimum
            </span>
            <span className="text-text-muted">Recorded in immutable audit trail</span>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
