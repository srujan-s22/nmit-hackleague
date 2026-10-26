'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { setAdminActiveStatusAction } from '@/actions/admin-management-actions';
import type { AdminWithPermissions } from '@/types/auth';

interface DeactivateDialogProps {
  isOpen: boolean;
  admin: AdminWithPermissions | null;
  mode: 'deactivate' | 'reactivate';
  onClose: () => void;
  onSuccess: () => void;
  onReassignClick?: () => void;
}

export function DeactivateDialog({
  isOpen,
  admin,
  mode,
  onClose,
  onSuccess,
  onReassignClick,
}: DeactivateDialogProps) {
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!admin) return null;

  const isDeactivating = mode === 'deactivate';
  const hasActiveEvents = isDeactivating && (admin.activeHackathonsCount || 0) > 0;

  const handleClose = () => {
    if (isLoading) return;
    setReason('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasActiveEvents) {
      setError('Cannot deactivate administrator: active hackathons must be reassigned first.');
      return;
    }

    if (reason.trim().length < 3) {
      setError('A mandatory reason of at least 3 characters is required.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await setAdminActiveStatusAction({
        adminId: admin.id,
        isActive: !isDeactivating,
        reason: reason.trim(),
      });

      if (!result.success) {
        setError(result.error || 'Failed to update administrator status.');
        setIsLoading(false);
        return;
      }

      setReason('');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={isDeactivating ? 'Deactivate Administrator' : 'Reactivate Administrator'}
      description={
        isDeactivating
          ? `Revoke platform operational access for ${admin.full_name} (${admin.email}).`
          : `Restore platform operational access for ${admin.full_name} (${admin.email}).`
      }
      maxWidth="md"
      footer={
        <div className="flex items-center gap-3 w-full justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant={isDeactivating ? 'destructive' : 'primary'}
            onClick={handleSubmit}
            disabled={isLoading || hasActiveEvents || reason.trim().length < 3}
          >
            {isLoading
              ? 'Processing...'
              : isDeactivating
              ? 'Confirm Deactivation'
              : 'Confirm Reactivation'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error" title="Status Change Failed">
            {error}
          </Alert>
        )}

        {/* Active Hackathon Warning & Reassignment CTA */}
        {hasActiveEvents && (
          <div className="space-y-3">
            <Alert
              variant="error"
              title="Deactivation Blocked: Active Hackathons Assigned"
            >
              <div className="space-y-2 text-xs">
                <p>
                  This administrator is currently assigned as the in-charge administrator for{' '}
                  <strong>{admin.activeHackathonsCount}</strong> active hackathon(s). Database safety
                  triggers and authorization rules block deactivation until all active events are reassigned:
                </p>
                <ul className="list-disc list-inside space-y-1 font-medium">
                  {admin.activeHackathons?.map((h) => (
                    <li key={h.id}>
                      {h.title} <span className="opacity-75 font-mono">({h.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Alert>
            {onReassignClick && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="w-full"
                onClick={() => {
                  onClose();
                  onReassignClick();
                }}
              >
                Reassign In-Charge Hackathons Now
              </Button>
            )}
          </div>
        )}

        <Alert
          variant={isDeactivating ? 'warning' : 'info'}
          title={isDeactivating ? 'What happens' : 'Restoring access'}
        >
          {isDeactivating ? (
            <p className="text-xs">
              The administrator is signed out and loses access immediately. Their permissions are kept, so
              reactivating the account restores them.
            </p>
          ) : (
            <p className="text-xs">
              The administrator regains access with their previous {admin.permissions.length} permission
              {admin.permissions.length === 1 ? '' : 's'}.
            </p>
          )}
        </Alert>

        <div className="rounded-md border border-border-subtle p-3 bg-surface-subtle/30 text-xs">
          <span className="font-semibold text-text-primary">{admin.full_name}</span>
          <span className="text-text-secondary ml-2 font-mono text-[11px]">{admin.email}</span>
        </div>

        <Textarea
          id="status-reason"
          label="Mandatory Reason"
          placeholder={
            isDeactivating
              ? 'Explain why this administrator account is being deactivated...'
              : 'Explain why this administrator account is being reactivated...'
          }
          helperText="This reason will be recorded immutably in the platform audit log."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          required
          disabled={isLoading}
        />
      </form>
    </Dialog>
  );
}
