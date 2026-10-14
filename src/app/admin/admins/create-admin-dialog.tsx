'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  PERMISSIONS_BY_CATEGORY,
  type AdminPermissionKey,
  type PermissionCategory,
} from '@/lib/auth/permissions';
import { createAdminAction } from '@/actions/admin-management-actions';

interface CreateAdminDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateAdminDialog({ isOpen, onClose, onSuccess }: CreateAdminDialogProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<AdminPermissionKey>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEmail('');
    setFullName('');
    setSelectedPermissions(new Set());
    setError(null);
  };

  const handleClose = () => {
    if (isLoading) return;
    resetForm();
    onClose();
  };

  const togglePermission = (key: AdminPermissionKey) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !fullName.trim()) {
      setError('Both email and full name are required.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await createAdminAction({
        email: email.trim(),
        fullName: fullName.trim(),
        permissions: Array.from(selectedPermissions),
      });

      if (!result.success) {
        setError(result.error || 'Failed to provision administrator.');
        setIsLoading(false);
        return;
      }

      resetForm();
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
      title="Provision New Administrator"
      description="Create a new administrator account and dispatch a secure GoTrue invitation. Plaintext passwords are never handled."
      maxWidth="lg"
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
            variant="primary"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? 'Provisioning...' : 'Provision Administrator'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <Alert variant="error" title="Provisioning Failed">
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="admin-fullName"
            label="Full Name"
            placeholder="e.g. Prof. Divya K."
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={isLoading}
            required
          />

          <Input
            id="admin-email"
            type="email"
            label="Email Address"
            placeholder="e.g. divya.k@nmit.ac.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>

        <div className="border-t border-border-subtle pt-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-text-primary">
              Initial Permission Grants
            </h3>
            <p className="text-xs text-text-secondary">
              Select explicit functional permissions to assign upon account establishment.
            </p>
          </div>

          <div className="space-y-4">
            {(Object.entries(PERMISSIONS_BY_CATEGORY) as [PermissionCategory, typeof PERMISSIONS_BY_CATEGORY[PermissionCategory]][]).map(
              ([category, perms]) => (
                <div key={category} className="rounded-md border border-border-subtle p-3.5 bg-surface-subtle/20">
                  <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2.5">
                    {category}
                  </h4>
                  <div className="grid grid-cols-1 gap-2.5">
                    {perms.map((perm) => (
                      <Checkbox
                        key={perm.key}
                        id={`perm-${perm.key}`}
                        label={
                          <div>
                            <span className="font-medium text-xs text-text-primary">
                              {perm.label}
                            </span>
                            <span className="text-[11px] text-text-secondary ml-2 font-mono">
                              ({perm.key})
                            </span>
                            <p className="text-[11px] text-text-secondary font-normal mt-0.5">
                              {perm.description}
                            </p>
                          </div>
                        }
                        checked={selectedPermissions.has(perm.key)}
                        onChange={() => togglePermission(perm.key)}
                        disabled={isLoading}
                      />
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
