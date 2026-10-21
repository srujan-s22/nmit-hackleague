'use client';

import React, { useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  reviewStudentAction,
  getAdminCollegeIdPreviewUrlAction,
} from '@/actions/admin-verification-actions';
import type { Database } from '@/types/database';
import { ProfileChangesClient } from './profile-changes-client';
import type { PendingProfileChangeReviewItem } from '@/lib/student/queries';

type StudentProfile = Database['public']['Tables']['profiles']['Row'];

export interface VerificationsClientProps {
  initialStudents: StudentProfile[];
  initialProfileChanges?: PendingProfileChangeReviewItem[];
  canVerifyStudents?: boolean;
  canManageStudents?: boolean;
}

export function VerificationsClient({
  initialStudents,
  initialProfileChanges = [],
  canVerifyStudents = true,
  canManageStudents = true,
}: VerificationsClientProps) {
  const [activeTab, setActiveTab] = useState<'registrations' | 'profile_changes'>(
    canVerifyStudents ? 'registrations' : 'profile_changes'
  );
  const [students, setStudents] = useState<StudentProfile[]>(initialStudents);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Decision Modal state
  const [decisionType, setDecisionType] = useState<'approved' | 'rejected' | 'correction_required' | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [isPendingAction, startAction] = useTransition();

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenPreview = async (student: StudentProfile) => {
    setSelectedStudent(student);
    setPreviewUrl(null);
    setIsLoadingPreview(true);
    setErrorMessage(null);

    try {
      const result = await getAdminCollegeIdPreviewUrlAction(student.id);
      if (result.success && result.data?.url) {
        setPreviewUrl(result.data.url);
      } else {
        setErrorMessage(result.error || 'Failed to fetch ID card preview.');
      }
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleOpenDecisionModal = (
    student: StudentProfile,
    type: 'approved' | 'rejected' | 'correction_required'
  ) => {
    setSelectedStudent(student);
    setDecisionType(type);
    setReasonInput('');
    setErrorMessage(null);
  };

  const handleConfirmDecision = () => {
    if (!selectedStudent || !decisionType) return;

    if (
      (decisionType === 'rejected' || decisionType === 'correction_required') &&
      !reasonInput.trim()
    ) {
      setErrorMessage('A non-empty reason is required for rejection or correction.');
      return;
    }

    setErrorMessage(null);
    startAction(async () => {
      const result = await reviewStudentAction(
        selectedStudent.id,
        decisionType,
        reasonInput.trim() || undefined
      );

      if (result.success) {
        setStudents((prev) => prev.filter((s) => s.id !== selectedStudent.id));
        setFeedbackMessage(
          `Student ${selectedStudent.full_name} (${selectedStudent.usn}) was marked as ${decisionType}.`
        );
        setDecisionType(null);
        setSelectedStudent(null);
        setPreviewUrl(null);
      } else {
        setErrorMessage(result.error || 'Review operation failed.');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Tab Switcher */}
      {canVerifyStudents && canManageStudents && (
        <div className="flex items-center gap-2 p-1.5 bg-surface-subtle border border-border-subtle rounded-xl self-start">
          <button
            type="button"
            onClick={() => setActiveTab('registrations')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'registrations'
                ? 'bg-surface-canvas text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>Student Registrations</span>
            <Badge variant={students.length > 0 ? 'warning' : 'neutral'} size="sm">
              {students.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile_changes')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeTab === 'profile_changes'
                ? 'bg-surface-canvas text-text-primary shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <span>Profile Change Requests</span>
            <Badge
              variant={initialProfileChanges.length > 0 ? 'warning' : 'neutral'}
              size="sm"
            >
              {initialProfileChanges.length}
            </Badge>
          </button>
        </div>
      )}

      {activeTab === 'profile_changes' ? (
        <ProfileChangesClient initialRequests={initialProfileChanges} />
      ) : (
        <>
          {feedbackMessage && (
            <Alert variant="success" onClose={() => setFeedbackMessage(null)}>
              {feedbackMessage}
            </Alert>
          )}

          {errorMessage && (
            <Alert
              variant="error"
              title="Review Action Error"
              onClose={() => setErrorMessage(null)}
            >
              {errorMessage}
            </Alert>
          )}

          {/* Main Review Queue Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pending Queue ({students.length})</CardTitle>
              <CardDescription>
                Students who have submitted their registration and uploaded a College ID document.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {students.length === 0 ? (
            <div className="py-12 text-center text-xs text-text-secondary">
              <span className="text-2xl block mb-2">🎉</span>
              No pending student registrations in the verification queue. All caught up!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>USN</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Year / Demographics</TableHead>
                    <TableHead>College ID</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>
                        <div className="font-medium text-text-primary">{student.full_name}</div>
                        <div className="text-[11px] text-text-muted">{student.email}</div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-text-primary">
                          {student.usn}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">{student.branch}</span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">Year {student.academic_year}</div>
                        <div className="text-[11px] text-text-muted">
                          {student.sex} • DOB: {student.date_of_birth}
                        </div>
                      </TableCell>
                      <TableCell>
                        {student.college_id_path ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenPreview(student)}
                          >
                            Inspect ID 🔍
                          </Button>
                        ) : (
                          <Badge variant="neutral">Missing ID</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="primary"
                            size="sm"
                            className="bg-brand-success hover:bg-brand-success/90 text-white"
                            onClick={() => handleOpenDecisionModal(student, 'approved')}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenDecisionModal(student, 'correction_required')}
                          >
                            Correction
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleOpenDecisionModal(student, 'rejected')}
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

      {/* ID Document Preview Modal */}
      {selectedStudent && previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-4 border-b border-border-subtle mb-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  College ID Document Preview — {selectedStudent.full_name} ({selectedStudent.usn})
                </h3>
                <p className="text-[11px] text-text-muted">
                  Ephemeral signed URL expires in 60 seconds. Download controls omitted for identity privacy.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewUrl(null)}
                className="text-text-secondary hover:text-text-primary font-bold px-2 py-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center bg-surface-subtle rounded-sm p-4 min-h-[300px]">
              {previewUrl.toLowerCase().includes('.pdf') ? (
                <iframe
                  src={previewUrl}
                  title="College ID PDF"
                  className="w-full h-[400px] border-0"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl}
                  alt={`College ID for ${selectedStudent.full_name}`}
                  className="max-h-[450px] max-w-full object-contain rounded-xs shadow-sm"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border-subtle mt-4">
              <span className="text-xs text-text-secondary">
                Ensure name, photo, and USN match institutional registration records.
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPreviewUrl(null)}>
                Close Preview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Decision Confirmation Modal */}
      {decisionType && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-xl">
            <h3 className="text-base font-bold text-text-primary mb-1">
              {decisionType === 'approved' && 'Confirm Student Approval'}
              {decisionType === 'correction_required' && 'Request ID Document Correction'}
              {decisionType === 'rejected' && 'Confirm Student Rejection'}
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              Student: <strong className="text-text-primary">{selectedStudent.full_name}</strong> ({selectedStudent.usn})
            </p>

            {decisionType === 'approved' ? (
              <p className="text-xs text-text-secondary leading-relaxed mb-4">
                Approving this registration will grant full student participant privileges. The physical College ID image will be enqueued for secure background deletion per data retention policy.
              </p>
            ) : (
              <div className="mb-4">
                <label htmlFor="reason-input" className="block text-xs font-semibold text-text-primary mb-1">
                  Reason / Feedback Note <span className="text-brand-error">*</span>
                </label>
                <textarea
                  id="reason-input"
                  rows={3}
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  placeholder={
                    decisionType === 'correction_required'
                      ? 'e.g., Image is blurred, please upload a clear scan showing your USN.'
                      : 'e.g., USN does not belong to an enrolled student.'
                  }
                  className="w-full p-2.5 text-xs bg-surface-canvas border border-border-subtle rounded-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
                  required
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDecisionType(null)}
                disabled={isPendingAction}
              >
                Cancel
              </Button>
              <Button
                variant={decisionType === 'approved' ? 'primary' : 'destructive'}
                size="sm"
                onClick={handleConfirmDecision}
                disabled={isPendingAction}
                isLoading={isPendingAction}
              >
                Confirm {decisionType === 'approved' ? 'Approval' : decisionType === 'correction_required' ? 'Request' : 'Rejection'}
              </Button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
