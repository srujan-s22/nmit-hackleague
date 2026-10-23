'use client';
/* eslint-disable @next/next/no-img-element */

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  updatePhoneNumberAction,
  submitProfileCorrectionAction,
} from '@/actions/profile-actions';
import { BRANCHES, ACADEMIC_YEARS } from '@/lib/validation/auth-schemas';
import { ParticipationHistoryCard } from './participation-history-card';
import type {
  StudentProfileData,
  ProfileChangeRequestRow,
  CompetitionParticipationItem,
} from '@/lib/student/queries';

export interface ProfileClientProps {
  initialData: StudentProfileData;
  initialRequests: ProfileChangeRequestRow[];
  activeCompetitions: CompetitionParticipationItem[];
  completedCompetitions: CompetitionParticipationItem[];
}

export function ProfileClient({
  initialData,
  initialRequests,
  activeCompetitions,
  completedCompetitions,
}: ProfileClientProps) {
  const router = useRouter();

  // Profile and Avatar State
  const [profile, setProfile] = useState(initialData.profile);
  const [avatarUrl] = useState<string | null>(initialData.avatarUrl);

  // Direct Phone State
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState(profile.phone || '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isPhonePending, startPhoneTransition] = useTransition();

  // Change Requests State
  const [requests, setRequests] = useState<ProfileChangeRequestRow[]>(initialRequests);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<'full_name' | 'usn' | 'branch' | 'academic_year'>('full_name');
  const [newValueInput, setNewValueInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitPending, startSubmitTransition] = useTransition();

  // Global Alert
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 1. Phone Update Handler
  const handleSavePhone = () => {
    setPhoneError(null);
    setFeedback(null);

    const trimmed = phoneInput.trim();
    if (!trimmed) {
      setPhoneError('Phone number is required.');
      return;
    }

    startPhoneTransition(async () => {
      const res = await updatePhoneNumberAction(trimmed);
      if (res.success && res.data) {
        setProfile((prev) => ({ ...prev, phone: res.data!.phone }));
        setPhoneInput(res.data!.phone);
        setIsEditingPhone(false);
        setFeedback({ type: 'success', message: 'Phone number updated successfully.' });
        router.refresh();
      } else {
        setPhoneError(res.error || 'Failed to update phone number.');
      }
    });
  };

  // 2. Change Request Submission Handler
  const handleSubmitCorrection = () => {
    setFormError(null);
    setFeedback(null);

    const trimmedValue = newValueInput.trim();
    const trimmedReason = reasonInput.trim();

    if (!trimmedValue) {
      setFormError('New value is required.');
      return;
    }

    if (trimmedReason.length < 10) {
      setFormError('Reason must be at least 10 characters long explaining the correction.');
      return;
    }

    startSubmitTransition(async () => {
      const res = await submitProfileCorrectionAction({
        field_name: selectedField,
        new_value: trimmedValue,
        reason: trimmedReason,
      });

      if (res.success && res.data) {
        setFeedback({
          type: 'success',
          message: 'Correction request submitted for administrative review.',
        });
        setIsModalOpen(false);
        setNewValueInput('');
        setReasonInput('');

        // Optimistically add to requests list
        const newReq: ProfileChangeRequestRow = {
          id: res.data.requestId,
          student_id: profile.id,
          field_name: selectedField,
          old_value: String((profile as any)[selectedField] || ''),
          new_value: trimmedValue,
          reason: trimmedReason,
          status: 'pending',
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setRequests((prev) => [newReq, ...prev]);
        router.refresh();
      } else {
        setFormError(res.error || 'Failed to submit correction request.');
      }
    });
  };

  const getOldFieldValue = () => {
    switch (selectedField) {
      case 'full_name':
        return profile.full_name;
      case 'usn':
        return profile.usn;
      case 'branch':
        return profile.branch;
      case 'academic_year':
        return `Year ${profile.academic_year}`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-8">
      {/* Feedback Alert */}
      {feedback && (
        <Alert
          variant={feedback.type === 'success' ? 'success' : 'error'}
          onClose={() => setFeedback(null)}
        >
          {feedback.message}
        </Alert>
      )}

      {/* 1. Header Profile Identity Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Avatar Capsule (Display Only) */}
            <div className="shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profile.full_name}
                  className="w-24 h-24 rounded-full object-cover border-2 border-border-subtle shadow-sm"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-surface-muted border-2 border-border-subtle flex items-center justify-center font-bold text-2xl text-text-primary select-none">
                  {profile.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
              )}
            </div>

            {/* Profile Overview */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-text-primary">{profile.full_name}</h1>
                <Badge variant="success" dot>Institutional Verified</Badge>
              </div>

              <p className="text-xs font-mono text-text-secondary">
                Official USN: <span className="font-semibold text-text-primary">{profile.usn}</span>
              </p>

              <p className="text-xs text-text-secondary">
                {profile.branch} Department • Year {profile.academic_year} • {profile.email}
              </p>
            </div>

            {/* Quick Metrics Capsule */}
            <div className="flex md:flex-col gap-4 md:gap-2 border-t md:border-t-0 md:border-l border-border-subtle pt-4 md:pt-0 md:pl-6 w-full md:w-auto">
              <div>
                <span className="text-[11px] text-text-secondary uppercase tracking-wider font-semibold">
                  Total Points
                </span>
                <p className="text-lg font-bold text-brand-primary">
                  {initialData.totalPoints.toLocaleString()} pts
                </p>
              </div>
              <div>
                <span className="text-[11px] text-text-secondary uppercase tracking-wider font-semibold">
                  Platform Rank
                </span>
                <p className="text-lg font-bold text-text-primary">
                  {initialData.rank !== null ? `#${initialData.rank}` : 'Unranked'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Direct Editable Contact Info & Institutional Details Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Contact Information (Direct Edit) */}
        <Card>
          <CardHeader>
            <CardTitle>Direct Contact Information</CardTitle>
            <CardDescription>
              Your verified mobile number is used for urgent hackathon SMS and team alerts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-lg bg-surface-subtle border border-border-subtle">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-secondary">Mobile Phone Number</span>
                {!isEditingPhone && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPhoneInput(profile.phone || '');
                      setPhoneError(null);
                      setIsEditingPhone(true);
                    }}
                  >
                    Edit Phone
                  </Button>
                )}
              </div>

              {isEditingPhone ? (
                <div className="space-y-3">
                  <Input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+919876543210 or 9876543210"
                    disabled={isPhonePending}
                    error={phoneError || undefined}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSavePhone}
                      disabled={isPhonePending}
                    >
                      {isPhonePending ? 'Saving...' : 'Save Phone'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingPhone(false)}
                      disabled={isPhonePending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm font-mono font-medium text-text-primary">
                  {profile.phone || 'No phone number linked'}
                </p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-surface-subtle/50 border border-border-subtle">
              <span className="text-xs font-semibold text-text-secondary">Verified Institutional Email</span>
              <p className="text-sm font-medium text-text-primary mt-1">
                {profile.email}
              </p>
              <p className="text-[11px] text-text-helper mt-1">
                Managed strictly by Supabase Auth and institutional SSO.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Institutional Identity (Approval Gated) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Institutional Identity</CardTitle>
                <CardDescription>
                  Official student records verified during onboarding.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFormError(null);
                  setNewValueInput('');
                  setReasonInput('');
                  setIsModalOpen(true);
                }}
              >
                Request Correction
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between py-2 border-b border-border-subtle">
              <span className="text-text-secondary">Official Full Name:</span>
              <span className="font-semibold text-text-primary">{profile.full_name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border-subtle">
              <span className="text-text-secondary">University Seat Number (USN):</span>
              <span className="font-mono font-semibold text-text-primary">{profile.usn}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border-subtle">
              <span className="text-text-secondary">Department / Branch:</span>
              <span className="font-semibold text-text-primary">{profile.branch}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border-subtle">
              <span className="text-text-secondary">Study Year:</span>
              <span className="font-semibold text-text-primary">Year {profile.academic_year}</span>
            </div>

            <p className="text-[11px] text-text-helper pt-2">
              Note: To prevent fraudulent score manipulation, institutional identity details require administrative approval to change.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 3. Profile Change Request History Table */}
      <Card>
        <CardHeader>
          <CardTitle>Correction Request History</CardTitle>
          <CardDescription>
            Audit log of student profile correction requests submitted for administrative review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-secondary border border-dashed border-border-subtle rounded-lg">
              No profile change requests submitted.
            </div>
          ) : (
            <div className="overflow-x-auto border border-border-subtle rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted On</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Old Value</TableHead>
                    <TableHead>Proposed Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reviewer Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="text-xs text-text-secondary whitespace-nowrap">
                        {new Date(req.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-text-primary capitalize whitespace-nowrap">
                        {req.field_name.replace('_', ' ')}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-text-secondary">
                        {req.old_value}
                      </TableCell>
                      <TableCell className="text-xs font-mono font-semibold text-brand-primary">
                        {req.new_value}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {req.status === 'pending' ? (
                          <Badge variant="warning" size="sm">Pending Review</Badge>
                        ) : req.status === 'approved' ? (
                          <Badge variant="success" size="sm">Approved</Badge>
                        ) : (
                          <Badge variant="error" size="sm">Rejected</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-text-secondary max-w-xs">
                        {req.status === 'rejected' && req.rejection_reason ? (
                          <span className="text-status-error font-medium">{req.rejection_reason}</span>
                        ) : req.reason ? (
                          <span className="truncate block" title={req.reason}>{req.reason}</span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Comprehensive Participation Timeline */}
      <ParticipationHistoryCard
        activeCompetitions={activeCompetitions}
        completedCompetitions={completedCompetitions}
      />

      {/* 5. Request Correction Modal */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => {
          if (!isSubmitPending) setIsModalOpen(false);
        }}
        title="Request Profile Identity Correction"
        description="Official institutional records are locked. Provide your corrected details and mandatory justification for administrative review."
      >
        <div className="space-y-4 py-2">
          {formError && (
            <Alert variant="error" onClose={() => setFormError(null)}>
              {formError}
            </Alert>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Field to Correct
            </label>
            <Select
              value={selectedField}
              onChange={(e) => {
                setSelectedField(e.target.value as any);
                setNewValueInput('');
                setFormError(null);
              }}
              options={[
                { value: 'full_name', label: 'Full Name' },
                { value: 'usn', label: 'University Seat Number (USN)' },
                { value: 'branch', label: 'Department / Branch' },
                { value: 'academic_year', label: 'Academic Year' },
              ]}
              disabled={isSubmitPending}
            />
          </div>

          <div className="p-2.5 rounded bg-surface-subtle text-xs border border-border-subtle">
            <span className="text-text-secondary">Current Value: </span>
            <span className="font-semibold text-text-primary">{getOldFieldValue()}</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">
              Proposed New Value
            </label>
            {selectedField === 'branch' ? (
              <Select
                value={newValueInput}
                onChange={(e) => setNewValueInput(e.target.value)}
                options={BRANCHES.map((b) => ({ value: b, label: b }))}
                disabled={isSubmitPending}
              />
            ) : selectedField === 'academic_year' ? (
              <Select
                value={newValueInput}
                onChange={(e) => setNewValueInput(e.target.value)}
                options={ACADEMIC_YEARS.map((y) => ({ value: String(y), label: `Year ${y}` }))}
                disabled={isSubmitPending}
              />
            ) : (
              <Input
                type="text"
                value={newValueInput}
                onChange={(e) => setNewValueInput(e.target.value)}
                placeholder={selectedField === 'usn' ? 'e.g., 1NT22CS001' : 'Enter corrected full name'}
                disabled={isSubmitPending}
              />
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs font-semibold text-text-secondary">
                Reason / Justification
              </label>
              <span className={`text-[10px] ${reasonInput.trim().length >= 10 ? 'text-status-success' : 'text-text-helper'}`}>
                {reasonInput.trim().length} / 500 (min 10 chars)
              </span>
            </div>
            <Textarea
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="Explain why this correction is necessary (e.g. spelling error in matriculation records, branch transfer order #1234)..."
              rows={3}
              maxLength={500}
              disabled={isSubmitPending}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
              disabled={isSubmitPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmitCorrection}
              disabled={isSubmitPending || reasonInput.trim().length < 10 || !newValueInput.trim()}
            >
              {isSubmitPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
