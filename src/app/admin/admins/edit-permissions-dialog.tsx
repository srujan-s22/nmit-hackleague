'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  PERMISSIONS_BY_CATEGORY,
  type AdminPermissionKey,
  type PermissionCategory,
} from '@/lib/auth/permissions';
import { updateAdminPermissionsAction } from '@/actions/admin-management-actions';
import type { AdminWithPermissions } from '@/types/auth';

interface EditPermissionsDialogProps {
  isOpen: boolean;
  admin: AdminWithPermissions | null;
  onClose: () => void;
  onSuccess: () => void;
}

function EditPermissionsForm({
  admin,
  onClose,
  onSuccess,
}: {
  admin: AdminWithPermissions;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<AdminPermissionKey>>(
    () => new Set(admin.permissions)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const initialSet = new Set(admin.permissions);
  const isDirty =
    selectedPermissions.size !== initialSet.size ||
    Array.from(selectedPermissions).some((p) => !initialSet.has(p));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirty) {
      onClose();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await updateAdminPermissionsAction({
        adminId: admin.id,
        permissions: Array.from(selectedPermissions),
      });

      if (!result.success) {
        setError(result.error || 'Failed to update permissions.');
        setIsLoading(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="error" title="Update Error">
          {error}
        </Alert>
      )}

      <div className="rounded-md border border-border-subtle p-3 bg-surface-subtle/30 flex items-center justify-between text-xs">
        <div>
          <span className="font-semibold text-text-primary">{admin.full_name}</span>
          <span className="text-text-secondary ml-2 font-mono text-[11px]">{admin.email}</span>
        </div>
        <span className="text-text-secondary font-mono text-[10px]">
          ID: {admin.id.slice(0, 8)}...
        </span>
      </div>

      <div className="space-y-4 pt-1">
        {(
          Object.entries(PERMISSIONS_BY_CATEGORY) as [
            PermissionCategory,
            (typeof PERMISSIONS_BY_CATEGORY)[PermissionCategory]
          ][]
        ).map(([category, perms]) => (
          <div
            key={category}
            className="rounded-md border border-border-subtle p-3.5 bg-surface-subtle/20"
          >
            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2.5">
              {category}
            </h4>
            <div className="grid grid-cols-1 gap-2.5">
              {perms.map((perm) => (
                <Checkbox
                  key={perm.key}
                  id={`edit-perm-${perm.key}`}
                  label={
                    <div>
                      <span className="font-medium text-xs text-text-primary">
                        {perm.label}
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
        ))}
      </div>

      <div className="pt-4 border-t border-border-subtle flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          {isDirty ? 'Unsaved permission changes pending.' : 'No changes made.'}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isLoading || !isDirty}
          >
            {isLoading ? 'Saving Changes...' : 'Save Permissions'}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function EditPermissionsDialog({
  isOpen,
  admin,
  onClose,
  onSuccess,
}: EditPermissionsDialogProps) {
  if (!admin) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Administrator Permissions"
      description={`Update assigned platform permissions for ${admin.full_name} (${admin.email}).`}
      maxWidth="lg"
    >
      <EditPermissionsForm
        key={`${admin.id}-${admin.permissions.join(',')}`}
        admin={admin}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </Dialog>
  );
}
