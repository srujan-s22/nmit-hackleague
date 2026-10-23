'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  PERMISSIONS_BY_CATEGORY,
  CANONICAL_PERMISSIONS,
  type AdminPermissionKey,
  type PermissionCategory,
} from '@/lib/auth/permissions';
import { createAdminAction } from '@/actions/admin-management-actions';

interface CreateAdminDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message?: string) => void;
}

export function CreateAdminDialog({ isOpen, onClose, onSuccess }: CreateAdminDialogProps) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<AdminPermissionKey>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; fullName?: string }>({});

  const totalPermissionsCount = CANONICAL_PERMISSIONS.length;

  const resetForm = () => {
    setEmail('');
    setFullName('');
    setSelectedPermissions(new Set());
    setError(null);
    setFieldErrors({});
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

  const validateFields = () => {
    const errors: { email?: string; fullName?: string } = {};
    if (!fullName.trim()) {
      errors.fullName = 'Full Name is required.';
    } else if (fullName.trim().length < 2) {
      errors.fullName = 'Full Name must be at least 2 characters.';
    }

    if (!email.trim()) {
      errors.email = 'Email Address is required.';
    } else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateFields()) {
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
        // Keep form inputs and selected permissions intact so user doesn't lose context
        setError(result.error || 'Failed to provision administrator.');
        setIsLoading(false);
        return;
      }

      const successMsg = result.message || 'Administrator provisioned successfully.';
      resetForm();
      onSuccess(successMsg);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred during provisioning.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Provision New Administrator"
      description="Create an administrator profile. A high-entropy temporary password will be generated and dispatched securely via institutional email. Dashboard access is blocked until the password is changed."
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="text-xs text-text-secondary flex items-center gap-1.5">
            <span className="font-medium">Selected Grants:</span>
            <span className="font-semibold text-text-primary">
              {selectedPermissions.size} of {totalPermissionsCount}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              form="create-admin-form"
              type="submit"
              variant="primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Provisioning...</span>
                </span>
              ) : (
                'Provision Administrator'
              )}
            </Button>
          </div>
        </div>
      }
    >
      <form id="create-admin-form" onSubmit={handleSubmit} className="space-y-5 pb-2">
        {error && (
          <Alert variant="error" title="Provisioning Failed" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="admin-fullName"
            label="Full Name"
            placeholder="e.g. Dr. Jane Doe"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (fieldErrors.fullName) {
                setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
              }
            }}
            disabled={isLoading}
            required
            error={fieldErrors.fullName}
          />

          <Input
            id="admin-email"
            type="email"
            label="Institutional Email Address"
            placeholder="e.g. jane.doe@nmit.ac.in"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErrors.email) {
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            disabled={isLoading}
            required
            error={fieldErrors.email}
          />
        </div>

        <div className="border-t border-border-subtle pt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Explicit Functional Permissions
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Default-deny model: select specific capabilities to grant upon account activation.
              </p>
            </div>
            <Badge variant={selectedPermissions.size > 0 ? 'info' : 'neutral'}>
              {selectedPermissions.size} selected
            </Badge>
          </div>

          <div className="space-y-3.5">
            {(Object.entries(PERMISSIONS_BY_CATEGORY) as [PermissionCategory, typeof PERMISSIONS_BY_CATEGORY[PermissionCategory]][]).map(
              ([category, perms]) => (
                <div
                  key={category}
                  className="rounded-md border border-border-subtle p-3.5 bg-surface-canvas hover:border-border-default transition-colors"
                >
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border-subtle/60">
                    <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      {category}
                    </h4>
                    <span className="text-[11px] text-text-secondary font-mono">
                      {perms.filter((p) => selectedPermissions.has(p.key)).length} / {perms.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {perms.map((perm) => {
                      const isChecked = selectedPermissions.has(perm.key);
                      return (
                        <div
                          key={perm.key}
                          className={`p-2 rounded-sm border transition-colors ${
                            isChecked
                              ? 'bg-status-info-bg/30 border-status-info-border/60'
                              : 'bg-surface-canvas border-transparent hover:bg-surface-subtle/50'
                          }`}
                        >
                          <Checkbox
                            id={`perm-${perm.key}`}
                            label={
                              <div className="cursor-pointer">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-xs text-text-primary">
                                    {perm.label}
                                  </span>
                                  <span className="text-[10px] text-text-secondary font-mono">
                                    ({perm.key})
                                  </span>
                                </div>
                                <p className="text-[11px] text-text-secondary font-normal mt-0.5 leading-relaxed">
                                  {perm.description}
                                </p>
                              </div>
                            }
                            checked={isChecked}
                            onChange={() => togglePermission(perm.key)}
                            disabled={isLoading}
                          />
                        </div>
                      );
                    })}
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
