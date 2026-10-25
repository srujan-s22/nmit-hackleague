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
  const [role, setRole] = useState<'reviewer' | 'coordinator'>('reviewer');
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

    try {
      // Assign each selected administrator
      for (const adminId of selectedAdminIds) {
        const res = await assignAdminToHackathonAction({
          hackathonId: hackathon.id,
          targetAdminId: adminId,
          role,
          notes: notes.trim() || undefined,
        });

        if (!res.success) {
          throw new Error(res.error || 'Failed to assign administrator.');
        }
      }

      setSelectedAdminIds([]);
      setNotes('');
      setSearch('');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during assignment.');
    } finally {
      setIsSubmitting(false);
    }
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
      title={`Assign Reviewers — ${hackathon.title}`}
      description="Select active administrators and assign them as reviewers or coordinators for this hackathon."
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

        {/* Assignment Role Selection */}
        <div>
          <label className="block text-xs font-semibold text-text-primary uppercase tracking-wider mb-1.5">
            Assignment Role
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole('reviewer')}
              className={`p-3 rounded-xs border text-left transition-all ${
                role === 'reviewer'
                  ? 'border-brand-primary bg-brand-primary/5 text-text-primary ring-1 ring-brand-primary'
                  : 'border-border-subtle bg-surface-canvas text-text-secondary hover:border-border-strong'
              }`}
            >
              <div className="font-semibold text-xs text-text-primary flex items-center justify-between">
                <span>Reviewer</span>
                {role === 'reviewer' && <Badge variant="success" size="sm">Selected</Badge>}
              </div>
              <p className="text-[11px] text-text-secondary mt-1">
                Evaluates sequential round milestone submissions, inspects proofs, and records placements.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setRole('coordinator')}
              className={`p-3 rounded-xs border text-left transition-all ${
                role === 'coordinator'
                  ? 'border-brand-primary bg-brand-primary/5 text-text-primary ring-1 ring-brand-primary'
                  : 'border-border-subtle bg-surface-canvas text-text-secondary hover:border-border-strong'
              }`}
            >
              <div className="font-semibold text-xs text-text-primary flex items-center justify-between">
                <span>Coordinator</span>
                {role === 'coordinator' && <Badge variant="success" size="sm">Selected</Badge>}
              </div>
              <p className="text-[11px] text-text-secondary mt-1">
                Operational assistance, event coordination, and reviewer collaboration.
              </p>
            </button>
          </div>
        </div>

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
