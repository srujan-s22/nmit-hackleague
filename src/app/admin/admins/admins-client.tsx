'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/alert';
import { CreateAdminDialog } from './create-admin-dialog';
import { EditPermissionsDialog } from './edit-permissions-dialog';
import { DeactivateDialog } from './deactivate-dialog';
import { ReassignHackathonDialog } from './reassign-hackathon-dialog';
import { PERMISSION_DEFINITIONS } from '@/lib/auth/permissions';
import { fetchAdminsAction, retryAdminOnboardingAction } from '@/actions/admin-management-actions';
import { sendResendDiagnosticEmailAction } from '@/actions/diagnostic-actions';
import { formatDate } from '@/lib/utils/date-format';
import type { AdminWithPermissions } from '@/types/auth';

interface AdminsClientProps {
  initialAdmins: AdminWithPermissions[];
  currentSuperAdminId: string;
}

export function AdminsClient({ initialAdmins, currentSuperAdminId }: AdminsClientProps) {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminWithPermissions[]>(initialAdmins);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);
  const [retryingAdminId, setRetryingAdminId] = useState<string | null>(null);
  const [isTestingResend, setIsTestingResend] = useState(false);

  const handleTestResendEmail = async () => {
    if (isTestingResend) return;
    setIsTestingResend(true);
    setFeedback(null);
    try {
      const res = await sendResendDiagnosticEmailAction();
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message,
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.error ? `Resend diagnostic failed: ${res.error}` : res.message,
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Diagnostic request failed.',
      });
    } finally {
      setIsTestingResend(false);
    }
  };

  const handleRetryOnboarding = async (targetAdmin: AdminWithPermissions) => {
    if (retryingAdminId) return;
    setRetryingAdminId(targetAdmin.id);
    setFeedback(null);
    try {
      const res = await retryAdminOnboardingAction(targetAdmin.id);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || `Credentials successfully reissued to ${targetAdmin.email}.`,
        });
        await refreshAdmins();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to reissue credentials.',
        });
      }
    } catch (err: unknown) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'An unexpected error occurred.',
      });
    } finally {
      setRetryingAdminId(null);
    }
  };

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminWithPermissions | null>(null);
  const [deactivatingAdmin, setDeactivatingAdmin] = useState<{
    admin: AdminWithPermissions;
    mode: 'deactivate' | 'reactivate';
  } | null>(null);
  const [reassigningAdmin, setReassigningAdmin] = useState<AdminWithPermissions | null>(null);

  const refreshAdmins = async () => {
    try {
      const res = await fetchAdminsAction();
      if (res.success && res.data) {
        setAdmins(res.data);
      }
    } catch {
      router.refresh();
    }
  };

  const filteredAdmins = admins.filter((admin) => {
    const matchesSearch =
      admin.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && admin.is_active) ||
      (statusFilter === 'deactivated' && !admin.is_active);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {feedback && (
        <Alert
          variant={feedback.type}
          title={
            feedback.type === 'success'
              ? 'Operation Completed'
              : feedback.type === 'warning'
              ? 'Administrator Provisioned (Notice)'
              : 'Error Encountered'
          }
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface-canvas p-4 rounded-md border border-border-subtle shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-lg">
          <Input
            id="admin-search"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs"
          />

          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <Button
              type="button"
              variant={statusFilter === 'all' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setStatusFilter('all')}
            >
              All
            </Button>
            <Button
              type="button"
              variant={statusFilter === 'active' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setStatusFilter('active')}
            >
              Active
            </Button>
            <Button
              type="button"
              variant={statusFilter === 'deactivated' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setStatusFilter('deactivated')}
            >
              Deactivated
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {process.env.NODE_ENV !== 'production' && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleTestResendEmail}
              disabled={isTestingResend}
              className="text-xs border-blue-200 bg-blue-50/50 hover:bg-blue-100/50 text-blue-700 font-medium"
            >
              {isTestingResend ? 'Sending Test...' : 'Test Resend Email (Dev)'}
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
            className="shrink-0"
          >
            <svg
              className="w-4 h-4 mr-1.5 stroke-current"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Provision Administrator
          </Button>
        </div>
      </div>

      {/* Administrators Table */}
      {filteredAdmins.length === 0 ? (
        <EmptyState
          title="No Administrators Found"
          description={
            searchQuery || statusFilter !== 'all'
              ? 'No administrator accounts match your active search and filter criteria.'
              : 'No administrator accounts have been provisioned yet.'
          }
          action={
            searchQuery || statusFilter !== 'all' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
              >
                Clear Filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-md border border-border-subtle bg-surface-canvas overflow-hidden shadow-xs">
          <Table>
            <thead>
              <tr className="border-b border-border-subtle bg-surface-subtle/50 text-[11px] font-semibold text-text-secondary uppercase tracking-wider text-left">
                <th className="py-3 px-4">Administrator</th>
                <th className="py-3 px-4">Role & Status</th>
                <th className="py-3 px-4">In-Charge Events</th>
                <th className="py-3 px-4">Assigned Permissions</th>
                <th className="py-3 px-4">Established</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-xs text-text-primary">
              {filteredAdmins.map((admin) => {
                const isSuper = admin.is_super_admin;
                const isSelf = admin.id === currentSuperAdminId;

                return (
                  <tr key={admin.id} className="hover:bg-surface-subtle/30 transition-colors">
                    {/* Administrator Name & Email */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-primary flex items-center gap-1.5">
                          {admin.full_name}
                          {isSelf && (
                            <span className="text-[10px] font-medium text-text-secondary bg-surface-subtle px-1.5 py-0.5 rounded-xs">
                              You
                            </span>
                          )}
                        </span>
                        <span className="text-text-secondary text-[11px] font-mono mt-0.5">
                          {admin.email}
                        </span>
                      </div>
                    </td>

                    {/* Role & Status */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isSuper ? (
                          <Badge variant="warning">Super Admin</Badge>
                        ) : (
                          <Badge variant="neutral">Club Admin</Badge>
                        )}

                        {admin.is_active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="error">Deactivated</Badge>
                        )}

                        {!isSuper && admin.must_change_password && (
                          admin.isOnboardingExpired ? (
                            <Badge variant="error">Onboarding Expired</Badge>
                          ) : admin.onboarding_status === 'email_failed' ? (
                            <Badge variant="warning">Email Failed</Badge>
                          ) : (
                            <Badge variant="info">Setup Pending</Badge>
                          )
                        )}
                      </div>
                    </td>

                    {/* In-Charge Events */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {(admin.activeHackathonsCount || 0) > 0 ? (
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                            title={admin.activeHackathons?.map((h) => `${h.title} (${h.status})`).join('\n')}
                          >
                            {admin.activeHackathonsCount} active event{admin.activeHackathonsCount === 1 ? '' : 's'}
                          </span>
                          {!isSuper && (
                            <button
                              type="button"
                              onClick={() => setReassigningAdmin(admin)}
                              className="text-[11px] text-interactive-accent hover:underline font-semibold"
                            >
                              Reassign
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-text-secondary">0 active events</span>
                      )}
                    </td>

                    {/* Permissions */}
                    <td className="py-3.5 px-4 max-w-xs">
                      {isSuper ? (
                        <span className="text-[11px] font-medium text-text-secondary italic">
                          Implicit full platform authority (0 DB rows)
                        </span>
                      ) : admin.permissions.length === 0 ? (
                        <span className="text-[11px] font-medium text-status-warning-text bg-status-warning-bg px-2 py-0.5 rounded-xs border border-status-warning-border">
                          0 Permissions (Default-Deny)
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {admin.permissions.map((p) => {
                            const def = PERMISSION_DEFINITIONS[p];
                            return (
                              <span
                                key={p}
                                className="text-[10px] font-medium bg-surface-subtle text-text-primary px-1.5 py-0.5 rounded-xs border border-border-subtle"
                                title={def?.description}
                              >
                                {def?.label || p}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    {/* Created Date */}
                    <td className="py-3.5 px-4 text-text-secondary whitespace-nowrap text-[11px] font-mono">
                      {formatDate(admin.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {isSuper ? (
                        <span className="text-[11px] font-medium text-text-secondary italic">
                          Protected System Role
                        </span>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          {admin.must_change_password && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRetryOnboarding(admin)}
                              disabled={retryingAdminId === admin.id}
                            >
                              {retryingAdminId === admin.id ? 'Reissuing...' : 'Resend Credentials'}
                            </Button>
                          )}

                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingAdmin(admin)}
                          >
                            Permissions
                          </Button>

                          {admin.is_active ? (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() =>
                                setDeactivatingAdmin({ admin, mode: 'deactivate' })
                              }
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setDeactivatingAdmin({ admin, mode: 'reactivate' })
                              }
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {/* Provisioning Dialog */}
      <CreateAdminDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={(msg) => {
          const isWarning = msg ? msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('failure') : false;
          setFeedback({
            type: isWarning ? 'warning' : 'success',
            message: msg || 'New administrator provisioned successfully.',
          });
          refreshAdmins();
        }}
      />

      {/* Permissions Dialog */}
      <EditPermissionsDialog
        isOpen={Boolean(editingAdmin)}
        admin={editingAdmin}
        onClose={() => setEditingAdmin(null)}
        onSuccess={() => {
          setFeedback({
            type: 'success',
            message: 'Administrator permissions updated successfully.',
          });
          refreshAdmins();
        }}
      />

      {/* Deactivate/Reactivate Dialog */}
      <DeactivateDialog
        isOpen={Boolean(deactivatingAdmin)}
        admin={deactivatingAdmin?.admin || null}
        mode={deactivatingAdmin?.mode || 'deactivate'}
        onClose={() => setDeactivatingAdmin(null)}
        onReassignClick={() => {
          if (deactivatingAdmin?.admin) {
            setReassigningAdmin(deactivatingAdmin.admin);
          }
        }}
        onSuccess={() => {
          setFeedback({
            type: 'success',
            message:
              deactivatingAdmin?.mode === 'deactivate'
                ? 'Administrator account deactivated.'
                : 'Administrator account reactivated.',
          });
          refreshAdmins();
        }}
      />

      {/* Reassign In-Charge Hackathon Dialog */}
      <ReassignHackathonDialog
        isOpen={Boolean(reassigningAdmin)}
        incumbentAdmin={reassigningAdmin}
        onClose={() => setReassigningAdmin(null)}
        onSuccess={() => {
          setFeedback({
            type: 'success',
            message: 'In-charge hackathon reassigned successfully. Authorization shifted immediately.',
          });
          refreshAdmins();
        }}
      />
    </div>
  );
}
