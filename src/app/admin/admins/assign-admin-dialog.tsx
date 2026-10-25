'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { assignAdminToHackathonAction } from '@/actions/admin-assignment-actions';

interface AssignAdminDialogProps {
  isOpen: boolean;
  onClose: () => void;
  hackathon: {
    id: string;
    title: string;
    in_charge_admin_id: string | null;
  } | null;
  activeAdmins: Array<{
    id: string;
    full_name: string;
    email: string;
    is_active: boolean;
    is_super_admin: boolean;
  }>;
  existingAssignedAdminIds: string[];
  onSuccess: () => void;
}

export function AssignAdminDialog({
  isOpen,
  onClose,
  hackathon,
  activeAdmins,
  existingAssignedAdminIds,
  onSuccess,
}: AssignAdminDialogProps) {
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const assignedSet = new Set(existingAssignedAdminIds);
  if (hackathon?.in_charge_admin_id) {
    assignedSet.add(hackathon.in_charge_admin_id);
  }

  // Filter only active administrators (inactive are strictly excluded)
  const eligibleAdmins = activeAdmins.filter(
    (a) => a.is_active && !assignedSet.has(a.id)
  );

  const filteredAdmins = eligibleAdmins.filter((a) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return (
      a.full_name.toLowerCase().includes(query) ||
      a.email.toLowerCase().includes(query)
    );
  });

  const handleToggleAdmin = (adminId: string) => {
    setSelectedAdminIds((prev) =>
      prev.includes(adminId) ? prev.filter((id) => id !== adminId) : [...prev, adminId]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredAdmins.map((a) => a.id);
    const allSelected = filteredIds.every((id) => selectedAdminIds.includes(id));
    if (allSelected) {
      setSelectedAdminIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedAdminIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hackathon) return;
    if (selectedAdminIds.length === 0) {
      setError('Please select at least one active administrator to assign.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Assign each selected administrator with safe default 'reviewer' role.
    // Dispatched concurrently and independently (Promise.allSettled) rather
    // than a sequential loop that threw on first failure: a loop would leave
    // earlier successful assignments silently in place while reporting the
    // whole operation as failed. Partial outcomes are now surfaced by name,
    // and only administrators that actually succeeded are deselected.
    const results = await Promise.allSettled(
      selectedAdminIds.map((adminId) =>
        assignAdminToHackathonAction({
          hackathonId: hackathon.id,
          targetAdminId: adminId,
          role: 'reviewer',
          notes: notes.trim() || undefined,
        }).then((res) => ({ adminId, res }))
      )
    );

    const succeededIds: string[] = [];
    const failures: string[] = [];
    for (const outcome of results) {
      if (outcome.status === 'fulfilled' && outcome.value.res.success) {
        succeededIds.push(outcome.value.adminId);
      } else {
        const adminId = outcome.status === 'fulfilled' ? outcome.value.adminId : undefined;
        const admin = adminId ? activeAdmins.find((a) => a.id === adminId) : undefined;
        const reason =
          outcome.status === 'fulfilled'
            ? outcome.value.res.error || 'Failed to assign administrator.'
            : outcome.reason instanceof Error
            ? outcome.reason.message
            : 'Failed to assign administrator.';
        failures.push(`${admin?.full_name || adminId || 'Unknown administrator'}: ${reason}`);
      }
    }

    setSelectedAdminIds((prev) => prev.filter((id) => !succeededIds.includes(id)));

    if (failures.length === 0) {
      setNotes('');
      setSearch('');
      onSuccess();
      onClose();
    } else if (succeededIds.length === 0) {
      setError(`Assignment failed for all selected administrators:\n${failures.join('\n')}`);
      onSuccess();
    } else {
      setError(
        `${succeededIds.length} administrator(s) assigned successfully. ${failures.length} failed:\n${failures.join('\n')}`
      );
      onSuccess();
    }

    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setSelectedAdminIds([]);
    setNotes('');
    setError(null);
    setSearch('');
    onClose();
  };

  if (!hackathon) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={`Assign Administrators — ${hackathon.title}`}
      description="Select active administrators to assign to this hackathon."
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
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || selectedAdminIds.length === 0}
          >
            {isSubmitting
              ? 'Assigning...'
              : `Assign ${selectedAdminIds.length} Administrator${
                  selectedAdminIds.length === 1 ? '' : 's'
                }`}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-1">
        {error && (
          <Alert variant="error" title="Assignment Error">
            {error}
          </Alert>
        )}

        {/* Administrator Selection */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider">
              Available Active Administrators ({eligibleAdmins.length})
            </label>
            {filteredAdmins.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-xs text-brand-primary hover:underline font-medium"
              >
                {filteredAdmins.every((a) => selectedAdminIds.includes(a.id))
                  ? 'Deselect All'
                  : 'Select All Filtered'}
              </button>
            )}
          </div>

          <Input
            placeholder="Search active admins by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs mb-2"
          />

          <div className="max-h-52 overflow-y-auto border border-border-subtle rounded-xs divide-y divide-border-subtle bg-surface-canvas">
            {filteredAdmins.length === 0 ? (
              <div className="p-4 text-center text-xs text-text-muted">
                {search.trim()
                  ? 'No active administrators matched your search.'
                  : eligibleAdmins.length === 0
                  ? 'All active administrators are already assigned to this hackathon.'
                  : 'No eligible active administrators.'}
              </div>
            ) : (
              filteredAdmins.map((admin) => {
                const isSelected = selectedAdminIds.includes(admin.id);
                return (
                  <label
                    key={admin.id}
                    className={`flex items-center gap-3 p-2.5 cursor-pointer text-xs transition-colors hover:bg-surface-subtle ${
                      isSelected ? 'bg-surface-subtle' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleAdmin(admin.id)}
                      className="rounded border-border-strong text-brand-primary focus:ring-brand-primary h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary truncate">
                          {admin.full_name}
                        </span>
                        {admin.is_super_admin && (
                          <Badge variant="neutral" size="sm" className="text-[10px] py-0 px-1">
                            Super Admin
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-text-secondary truncate block">
                        {admin.email}
                      </span>
                    </div>
                  </label>
                );
              })
            )}
          </div>
          <span className="text-[11px] text-text-muted mt-1 block">
            Note: Inactive administrators are automatically excluded from assignment selection.
          </span>
        </div>

        {/* Optional Notes */}
        <div>
          <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">
            Assignment Notes (Optional)
          </label>
          <Input
            placeholder="e.g., Assigned to review Track 1 Web & Cloud milestones"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="text-xs"
            maxLength={500}
          />
        </div>
      </form>
    </Dialog>
  );
}
