'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Dialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { reviewProfileChangeRequestAction } from '@/actions/admin-verification-actions';
import { formatDate } from '@/lib/utils/date-format';
import type { PendingProfileChangeReviewItem } from '@/lib/student/queries';

export interface ProfileChangesClientProps {
  initialRequests: PendingProfileChangeReviewItem[];
}

export function ProfileChangesClient({ initialRequests }: ProfileChangesClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<PendingProfileChangeReviewItem[]>(initialRequests);
  const [selectedRequest, setSelectedRequest] = useState<PendingProfileChangeReviewItem | null>(null);

  // Decision Modal State
  const [modalMode, setModalMode] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleOpenApprove = (req: PendingProfileChangeReviewItem) => {
    setSelectedRequest(req);
    setModalMode('approve');
    setModalError(null);
  };

  const handleOpenReject = (req: PendingProfileChangeReviewItem) => {
    setSelectedRequest(req);
    setModalMode('reject');
    setRejectionReason('');
    setModalError(null);
  };

  const handleConfirmDecision = () => {
    if (!selectedRequest || !modalMode) return;

    if (modalMode === 'reject' && rejectionReason.trim().length < 10) {
      setModalError('A rejection reason of at least 10 characters is mandatory.');
      return;
    }

    setModalError(null);
    startTransition(async () => {
      const res = await reviewProfileChangeRequestAction(
        selectedRequest.id,
        modalMode === 'approve' ? 'approved' : 'rejected',
        modalMode === 'reject' ? rejectionReason.trim() : undefined
      );

      if (res.success) {
        setRequests((prev) => prev.filter((r) => r.id !== selectedRequest.id));
        setFeedback({
          type: 'success',
          message: `Profile correction request for ${selectedRequest.student.full_name} (${selectedRequest.student.usn}) was successfully ${modalMode === 'approve' ? 'approved' : 'rejected'}.`,
        });
        setModalMode(null);
        setSelectedRequest(null);
        router.refresh();
      } else {
        setModalError(res.error || 'Failed to process request decision.');
      }
    });
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <Alert
          variant={feedback.type === 'success' ? 'success' : 'error'}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pending Profile Correction Requests ({requests.length})</CardTitle>
              <CardDescription>
                Review proposed modifications to locked institutional identity fields (Name, USN, Branch, Academic Year).
              </CardDescription>
            </div>
            <Badge variant={requests.length > 0 ? 'warning' : 'neutral'} size="sm">
              {requests.length} Pending
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {requests.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-secondary border border-dashed border-border-subtle rounded-lg bg-surface-subtle/40">
              <p className="font-semibold text-text-primary mb-1">Queue is clear</p>
              <p>No student profile correction requests are currently pending review.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-border-subtle rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead>Proposed New Value</TableHead>
                    <TableHead>Justification Reason</TableHead>
                    <TableHead>Submitted On</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="text-xs">
                        <div className="flex flex-col">
                          <span className="font-semibold text-text-primary">
                            {req.student.full_name}
                          </span>
                          <span className="font-mono text-[11px] text-text-secondary">
                            {req.student.usn} • {req.student.branch}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold capitalize whitespace-nowrap text-text-primary">
                        {req.field_name.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-text-secondary">
                        {req.old_value}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-bold text-brand-primary">
                        {req.new_value}
                      </TableCell>
                      <TableCell className="text-xs text-text-secondary max-w-xs">
                        <span className="line-clamp-2" title={req.reason}>
                          {req.reason}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                        {formatDate(req.created_at)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleOpenApprove(req)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleOpenReject(req)}
                          >
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Decision Modal */}
      <Dialog
        isOpen={modalMode !== null}
        onClose={() => {
          if (!isPending) setModalMode(null);
        }}
        title={
          modalMode === 'approve'
            ? 'Confirm Profile Correction Approval'
            : 'Reject Profile Correction Request'
        }
        description={
          modalMode === 'approve'
            ? `Are you sure you want to approve updating ${selectedRequest?.field_name.replace('_', ' ')} from "${selectedRequest?.old_value}" to "${selectedRequest?.new_value}" for ${selectedRequest?.student.full_name}?`
            : `Provide a mandatory justification reason (min 10 characters) explaining why this correction request is being rejected.`
        }
      >
        <div className="space-y-4 py-2">
          {modalError && (
            <Alert variant="error" onClose={() => setModalError(null)}>
              {modalError}
            </Alert>
          )}

          {modalMode === 'approve' ? (
            <div className="p-3 rounded-lg bg-surface-subtle border border-border-subtle text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-text-secondary">Student USN:</span>
                <span className="font-mono font-semibold text-text-primary">
                  {selectedRequest?.student.usn}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Field:</span>
                <span className="font-semibold text-text-primary capitalize">
                  {selectedRequest?.field_name.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Update:</span>
                <span className="font-mono text-text-primary">
                  {selectedRequest?.old_value} &rarr;{' '}
                  <strong className="text-brand-primary">{selectedRequest?.new_value}</strong>
                </span>
              </div>
              <div className="pt-2 border-t border-border-subtle/70">
                <span className="text-text-secondary block font-semibold mb-0.5">
                  Student Reason:
                </span>
                <p className="text-text-primary italic">&ldquo;{selectedRequest?.reason}&rdquo;</p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-semibold text-text-secondary">
                  Rejection Reason (Mandatory)
                </label>
                <span
                  className={`text-[10px] ${
                    rejectionReason.trim().length >= 10
                      ? 'text-status-success'
                      : 'text-text-helper'
                  }`}
                >
                  {rejectionReason.trim().length} / 500 (min 10 chars)
                </span>
              </div>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this request is rejected (e.g., USN does not match official admission list, mismatch with university register)..."
                rows={3}
                maxLength={500}
                disabled={isPending}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalMode(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant={modalMode === 'approve' ? 'primary' : 'destructive'}
              size="sm"
              onClick={handleConfirmDecision}
              disabled={
                isPending ||
                (modalMode === 'reject' && rejectionReason.trim().length < 10)
              }
            >
              {isPending
                ? 'Processing...'
                : modalMode === 'approve'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
