'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import {
  uploadCollegeIdAction,
  submitProfileForReviewAction,
} from '@/actions/onboarding-actions';
import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface OnboardingClientProps {
  profile: Profile;
}

export function OnboardingClient({ profile }: OnboardingClientProps) {
  const router = useRouter();
  const [collegeIdPath, setCollegeIdPath] = useState<string | null>(profile.college_id_path);

  const [idFile, setIdFile] = useState<File | null>(null);

  const [isUploadingId, setIsUploadingId] = useState(false);
  const [isSubmitting, startSubmission] = useTransition();

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUploadId = async () => {
    if (!idFile) return;

    // 1. Client-side pre-flight validation
    const ext = idFile.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp', 'pdf'];
    if (!ext || !allowedExts.includes(ext)) {
      setErrorMessage('Invalid file format. Please upload a PNG, JPEG, WebP, or PDF file.');
      return;
    }

    const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
    const maxSizeBytes = isImage ? 1.5 * 1024 * 1024 : 5 * 1024 * 1024;
    if (idFile.size > maxSizeBytes) {
      setErrorMessage(
        isImage
          ? `College ID image size exceeds maximum limit of 1.5MB (${(idFile.size / 1024 / 1024).toFixed(2)} MB).`
          : `College ID document size exceeds maximum limit of 5MB (${(idFile.size / 1024 / 1024).toFixed(2)} MB).`
      );
      return;
    }

    setIsUploadingId(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      // 2. Direct authenticated browser upload to Supabase Storage
      const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
      const storagePath = `${profile.id}/${uniqueId}.${ext}`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('college-ids')
        .upload(storagePath, idFile, {
          contentType: idFile.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
          upsert: false,
        });

      if (uploadError) {
        setErrorMessage(uploadError.message || 'Direct storage upload failed.');
        return;
      }

      // 3. Register metadata and verify binary integrity via lightweight Server Action
      const result = await uploadCollegeIdAction({ storagePath });
      if (result.success && result.data?.path) {
        setCollegeIdPath(result.data.path);
        setFeedbackMessage('College ID uploaded successfully.');
      } else {
        setErrorMessage(result.error || 'Failed to register uploaded College ID.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected upload error occurred.');
    } finally {
      setIsUploadingId(false);
    }
  };

  const handleSubmitForReview = () => {
    if (!collegeIdPath) {
      setErrorMessage('You must upload your College ID card before submitting for review.');
      return;
    }

    setErrorMessage(null);
    startSubmission(async () => {
      const result = await submitProfileForReviewAction();
      if (result.success && result.redirectTo) {
        router.push(result.redirectTo);
      } else {
        setErrorMessage(result.error || 'Failed to submit profile for review.');
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {feedbackMessage && (
        <Alert variant="success" onClose={() => setFeedbackMessage(null)}>
          {feedbackMessage}
        </Alert>
      )}

      {errorMessage && (
        <Alert
          variant="error"
          title="Onboarding Error"
          onClose={() => setErrorMessage(null)}
        >
          {errorMessage}
        </Alert>
      )}

      {/* Profile Details Review Box */}
      <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-sm">
        <h2 className="text-base font-semibold text-text-primary mb-4 pb-2 border-b border-border-subtle">
          1. Verified Registration Metadata
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-text-secondary block">Full Name</span>
            <span className="font-medium text-text-primary">{profile.full_name}</span>
          </div>
          <div>
            <span className="text-text-secondary block">USN</span>
            <span className="font-mono font-medium text-text-primary">{profile.usn}</span>
          </div>
          <div>
            <span className="text-text-secondary block">Email</span>
            <span className="font-medium text-text-primary">{profile.email}</span>
          </div>
          <div>
            <span className="text-text-secondary block">Phone</span>
            <span className="font-medium text-text-primary">{profile.phone}</span>
          </div>
          <div>
            <span className="text-text-secondary block">Branch</span>
            <span className="font-medium text-text-primary">{profile.branch}</span>
          </div>
          <div>
            <span className="text-text-secondary block">Academic Year</span>
            <span className="font-medium text-text-primary">Year {profile.academic_year}</span>
          </div>
          <div>
            <span className="text-text-secondary block">Sex</span>
            <span className="font-medium text-text-primary">{profile.sex}</span>
          </div>
          <div>
            <span className="text-text-secondary block">Date of Birth</span>
            <span className="font-medium text-text-primary">{profile.date_of_birth}</span>
          </div>
        </div>
      </div>

      {/* College ID Document Verification */}
      <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-text-primary">
            2. College ID Document <span className="text-brand-error">*</span>
          </h2>
          {collegeIdPath ? (
            <span className="text-[11px] font-medium text-brand-success bg-brand-success/10 px-2 py-0.5 rounded-xs">
              ✓ Uploaded
            </span>
          ) : (
            <span className="text-[11px] font-medium text-text-secondary bg-surface-subtle px-2 py-0.5 rounded-xs">
              Pending
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Clear front photo or PDF of your official NMIT Student ID card (Max 5MB).
        </p>

        <input
          type="file"
          accept=".png,.jpg,.jpeg,.pdf"
          id="college-id-input"
          onChange={(e) => setIdFile(e.target.files?.[0] || null)}
          disabled={isUploadingId || isSubmitting}
          className="text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border file:border-border-subtle file:text-xs file:font-medium file:bg-surface-subtle hover:file:bg-surface-canvas file:cursor-pointer"
        />
        {idFile && (
          <p className="text-[11px] text-text-secondary mt-1 font-mono">
            Selected: {idFile.name} ({(idFile.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}

        <div className="pt-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto mt-4"
            onClick={handleUploadId}
            disabled={!idFile || isUploadingId || isSubmitting}
            isLoading={isUploadingId}
          >
            {collegeIdPath ? 'Re-upload College ID' : 'Upload College ID Document'}
          </Button>
        </div>
      </div>

      {/* Review & Final Submission */}
      <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Ready to Submit for Institutional Review?
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Once submitted, your profile will be queued for manual review by an authorized administrator.
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={handleSubmitForReview}
          disabled={!collegeIdPath || isSubmitting}
          isLoading={isSubmitting}
          className="w-full sm:w-auto"
        >
          Submit Profile for Verification →
        </Button>
      </div>
    </div>
  );
}
