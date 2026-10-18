'use client';

import React, { useState, useEffect } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import {
  reassignHackathonInChargeAdminAction,
  fetchEligibleAdminsForReassignmentAction,
} from '@/actions/admin-management-actions';
import type { AdminWithPermissions, ActiveHackathonSummary } from '@/types/auth';

interface EligibleAdmin {
  id: string;
  full_name: string;
  email: string;
  is_super_admin: boolean;
}

interface ReassignHackathonDialogProps {
  isOpen: boolean;
  incumbentAdmin: AdminWithPermissions | null;
  initialHackathon?: ActiveHackathonSummary | null;
  onClose: () => void;
  onSuccess: () => void;
}

function ReassignHackathonForm({
  isOpen,
  incumbentAdmin,
  initialHackathon,
  onClose,
  onSuccess,
}: ReassignHackathonDialogProps & { incumbentAdmin: AdminWithPermissions }) {
  const activeHackathons = incumbentAdmin.activeHackathons || [];

  const [selectedHackathonId, setSelectedHackathonId] = useState<string>(
    initialHackathon?.id || activeHackathons[0]?.id || ''
  );
  const [selectedTargetAdminId, setSelectedTargetAdminId] = useState<string>('');
  const [justification, setJustification] = useState<string>('');
  const [eligibleAdmins, setEligibleAdmins] = useState<EligibleAdmin[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchEligibleAdminsForReassignmentAction()
      .then((res) => {
        if (!isMounted) return;
        if (res.success && res.data) {
          const candidates = res.data.filter((a) => a.id !== incumbentAdmin.id);
          setEligibleAdmins(candidates);
          if (candidates.length > 0) {
            setSelectedTargetAdminId((prev) => prev || candidates[0].id);
          }
        } else {
          setError(res.error || 'Failed to load eligible candidate administrators.');
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load candidates.');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingAdmins(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [incumbentAdmin.id]);

  const handleClose = () => {
    if (isSubmitting) return;
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHackathonId) {
      setError('Please select a hackathon to reassign.');
      return;
    }
    if (!selectedTargetAdminId) {
      setError('Please select an eligible target administrator.');
      return;
    }
    if (justification.trim().length < 10) {
      setError('A meaningful justification of at least 10 characters is mandatory.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await reassignHackathonInChargeAdminAction({
        hackathonId: selectedHackathonId,
        newAdminId: selectedTargetAdminId,
        justification: justification.trim(),
      });

      if (!res.success) {
        setError(res.error || 'Failed to reassign in-charge administrator.');
        setIsSubmitting(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Reassign In-Charge Administrator"
      description={`Transfer event management responsibility away from ${incumbentAdmin.full_name} to another eligible administrator.`}
      maxWidth="md"
      footer={
        <div className="flex items-center gap-3 w-full justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              isLoadingAdmins ||
              !selectedHackathonId ||
              !selectedTargetAdminId ||
              justification.trim().length < 10
            }
          >
            {isSubmitting ? 'Reassigning...' : 'Confirm Reassignment'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert variant="error" title="Reassignment Error">
            {error}
          </Alert>
        )}

        <Alert
          variant="info"
          title="Two-Tier Concurrency Invariant"
        >
          <p className="text-xs">
            Reassignment acquires a Tier 1 lock on the hackathon and Tier 2 locks on both administrators
            in ascending order. Operational authority and scoped permissions transfer immediately upon commit.
          </p>
        </Alert>

        {/* Hackathon Selection */}
        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1.5">
            Active Hackathon to Reassign
          </label>
          {activeHackathons.length === 0 ? (
            <div className="p-2.5 rounded-md border border-border-subtle bg-surface-subtle text-xs text-text-secondary">
              No active hackathons currently assigned to this administrator.
            </div>
          ) : (
            <select
              value={selectedHackathonId}
              onChange={(e) => setSelectedHackathonId(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-xs rounded-md border border-border-subtle bg-surface-canvas text-text-primary px-3 py-2 focus:outline-hidden focus:ring-1 focus:ring-interactive-accent"
            >
              {activeHackathons.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title} ({h.status})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Target Administrator Selection */}
        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1.5">
            Target In-Charge Administrator (Eligible Candidates)
          </label>
          {isLoadingAdmins ? (
            <div className="p-2.5 rounded-md border border-border-subtle bg-surface-subtle text-xs text-text-secondary">
              Loading eligible administrators...
            </div>
          ) : eligibleAdmins.length === 0 ? (
            <div className="p-2.5 rounded-md border border-status-warning-border bg-status-warning-bg text-xs text-status-warning-text">
              No other active administrators with manage_hackathons permission found. Provision or grant permissions to a candidate first.
            </div>
          ) : (
            <select
              value={selectedTargetAdminId}
              onChange={(e) => setSelectedTargetAdminId(e.target.value)}
              disabled={isSubmitting}
              className="w-full text-xs rounded-md border border-border-subtle bg-surface-canvas text-text-primary px-3 py-2 focus:outline-hidden focus:ring-1 focus:ring-interactive-accent"
            >
              {eligibleAdmins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name} ({a.email}){a.is_super_admin ? ' — Super Admin' : ' — Admin'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Mandatory Justification */}
        <Textarea
          id="reassign-justification"
          label="Mandatory Audit Justification"
          placeholder="Explain why the in-charge administrator is being reassigned (minimum 10 characters)..."
          helperText="Recorded permanently in public.audit_logs for governance compliance."
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={3}
          required
          disabled={isSubmitting}
        />
      </form>
    </Dialog>
  );
}

export function ReassignHackathonDialog(props: ReassignHackathonDialogProps) {
  if (!props.isOpen || !props.incumbentAdmin) return null;
  return <ReassignHackathonForm {...props} incumbentAdmin={props.incumbentAdmin} />;
}
