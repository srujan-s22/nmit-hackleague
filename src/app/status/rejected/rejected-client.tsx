'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import {
  replaceCollegeIdAction,
  submitProfileForReviewAction,
} from '@/actions/onboarding-actions';
import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface RejectedClientProps {
  profile: Profile;
}

export function RejectedClient({ profile }: RejectedClientProps) {
  const router = useRouter();
  const isCorrection = profile.registration_status === 'correction_required';

  const [idFile, setIdFile] = useState<File | null>(null);
  const [hasReplacedId, setHasReplacedId] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, startSubmission] = useTransition();

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleReplaceId = async () => {
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
          ? `Replacement image size exceeds maximum limit of 1.5MB (${(idFile.size / 1024 / 1024).toFixed(2)} MB).`
          : `Replacement document size exceeds maximum limit of 5MB (${(idFile.size / 1024 / 1024).toFixed(2)} MB).`
      );
      return;
    }

    setIsUploading(true);
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

      // 3. Register replacement metadata and verify binary integrity via Server Action
      const result = await replaceCollegeIdAction({ storagePath });
      if (result.success) {
        setHasReplacedId(true);
        setFeedbackMessage(
          'Replacement College ID uploaded successfully. Click "Resubmit for Review" below to notify the administrator.'
        );
      } else {
        setErrorMessage(result.error || 'Failed to replace College ID.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected upload error occurred.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleResubmit = () => {
    setErrorMessage(null);
    startSubmission(async () => {
      const result = await submitProfileForReviewAction();
      if (result.success && result.redirectTo) {
        router.push(result.redirectTo);
      } else {
        setErrorMessage(result.error || 'Failed to resubmit profile.');
      }
    });
  };

  if (!isCorrection) {
    // Definitive Rejection View
    return (
      <div className="w-full max-w-lg bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card text-center">
        <div className="w-12 h-12 rounded-full bg-brand-error/10 text-brand-error mx-auto flex items-center justify-center mb-4">
          <span className="text-xl">✕</span>
        </div>

        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-error bg-brand-error/10 px-2.5 py-1 rounded-xs inline-block mb-3">
          Registration Rejected
        </span>

        <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight mb-2">
          Institutional Registration Declined
        </h1>

        <p className="text-xs sm:text-sm text-text-secondary mb-6 leading-relaxed">
          Your registration has been reviewed and declined by an authorized institutional administrator.
        </p>

        {profile.rejection_reason && (
          <div className="bg-surface-subtle rounded-sm border border-border-subtle p-4 text-left text-xs mb-6">
            <h2 className="font-semibold text-text-primary mb-1">Reason Stated by Reviewer:</h2>
            <p className="text-brand-error font-medium">{profile.rejection_reason}</p>
          </div>
        )}

        <p className="text-[11px] text-text-muted leading-relaxed">
          If you believe this decision was made in error, please visit the Dean of Student Affairs or the Hackathon Coordination Office in person with your physical College ID card.
        </p>
      </div>
    );
  }

  // Correction Required View
  return (
    <div className="w-full max-w-xl bg-surface-canvas rounded-md border border-border-subtle p-6 sm:p-8 shadow-card">
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-brand-warning/10 text-brand-warning mx-auto flex items-center justify-center mb-3">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
        </div>

        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-warning bg-brand-warning/10 px-2.5 py-1 rounded-xs inline-block mb-2">
          Correction Required
        </span>

        <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
          ID Card Document Correction Requested
        </h1>
        <p className="text-xs sm:text-sm text-text-secondary mt-1">
          An administrator reviewed your registration and requested an updated College ID document.
        </p>
      </div>

      {feedbackMessage && (
        <div className="mb-5">
          <Alert variant="success" onClose={() => setFeedbackMessage(null)}>
            {feedbackMessage}
          </Alert>
        </div>
      )}

      {errorMessage && (
        <div className="mb-5">
          <Alert
            variant="error"
            title="Update Error"
            onClose={() => setErrorMessage(null)}
          >
            {errorMessage}
          </Alert>
        </div>
      )}

      {/* Reviewer Note */}
      <div className="bg-surface-subtle rounded-sm border border-border-subtle p-4 text-xs mb-6">
        <h2 className="font-semibold text-text-primary mb-1">Feedback from Reviewer:</h2>
        <p className="text-text-primary font-medium bg-surface-canvas p-2.5 rounded-xs border border-border-subtle mt-1.5">
          &quot;{profile.rejection_reason || 'Please upload a clearer image of your College ID.'}&quot;
        </p>
      </div>

      {/* Replacement Upload Form */}
      <div className="flex flex-col gap-4 border-t border-border-subtle pt-6">
        <div>
          <label htmlFor="replace-id-input" className="block text-xs font-semibold text-text-primary mb-1">
            Upload Replacement College ID Document
          </label>
          <p className="text-[11px] text-text-secondary mb-3">
            PNG, JPEG, or PDF format (Max 5MB). Ensure all text, your photo, and your USN are completely legible.
          </p>

          <input
            type="file"
            accept=".png,.jpg,.jpeg,.pdf"
            id="replace-id-input"
            onChange={(e) => setIdFile(e.target.files?.[0] || null)}
            disabled={isUploading || isSubmitting}
            className="text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border file:border-border-subtle file:text-xs file:font-medium file:bg-surface-subtle hover:file:bg-surface-canvas file:cursor-pointer"
          />
          {idFile && (
            <p className="text-[11px] text-text-secondary mt-1 font-mono">
              Selected: {idFile.name} ({(idFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full mt-1"
          onClick={handleReplaceId}
          disabled={!idFile || isUploading || isSubmitting}
          isLoading={isUploading}
        >
          {hasReplacedId ? 'Upload Another Replacement' : 'Upload Replacement Document'}
        </Button>

        {/* Resubmit Button */}
        <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
          <p className="text-[11px] text-text-secondary">
            {hasReplacedId
              ? 'Ready to send updated document to reviewer.'
              : 'You can resubmit with existing or updated document.'}
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={handleResubmit}
            disabled={isSubmitting || isUploading}
            isLoading={isSubmitting}
          >
            Resubmit for Review →
          </Button>
        </div>
      </div>
    </div>
  );
}
