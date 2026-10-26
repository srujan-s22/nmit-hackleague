'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { createClient } from '@/lib/supabase/client';
import {
  uploadCollegeIdAction,
  uploadProfilePhotoAction,
  submitProfileForReviewAction,
} from '@/actions/onboarding-actions';
import { formatDate } from '@/lib/utils/date-format';
import type { Database } from '@/types/database';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface OnboardingClientProps {
  profile: Profile;
}

export function OnboardingClient({ profile }: OnboardingClientProps) {
  const router = useRouter();

  // College ID State
  const [collegeIdPath, setCollegeIdPath] = useState<string | null>(profile.college_id_path);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [isUploadingId, setIsUploadingId] = useState(false);

  // Profile Picture State (Optional)
  const [photoPath, setPhotoPath] = useState<string | null>(profile.profile_photo_path);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Submission State
  const [isSubmitting, startSubmission] = useTransition();

  // Feedback Messages
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Profile Photo Selection Handler
  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }

    // Client pre-flight format validation
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp'];
    if (!ext || !allowedExts.includes(ext)) {
      setErrorMessage('Invalid image format. Profile pictures must be PNG, JPEG, or WebP.');
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }

    // 1MB limit for profile photos
    if (file.size > 1024 * 1024) {
      setErrorMessage(
        `Profile photo size exceeds maximum limit of 1MB (${(file.size / 1024 / 1024).toFixed(2)} MB).`
      );
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }

    setPhotoFile(file);
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
  };

  // Profile Photo Upload Handler
  const handleUploadPhoto = async () => {
    if (!photoFile) return;

    setIsUploadingPhoto(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const uniqueId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).substring(2) + Date.now().toString(36);
      const storagePath = `${profile.id}/${uniqueId}.${ext}`;

      // 1. Direct authenticated browser upload to Supabase Storage
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(storagePath, photoFile, {
          contentType: photoFile.type || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        setErrorMessage(uploadError.message || 'Direct profile photo upload failed.');
        return;
      }

      // 2. Register metadata and verify server-side binary validation
      const result = await uploadProfilePhotoAction({ storagePath });
      if (result.success && result.data?.path) {
        setPhotoPath(result.data.path);
        setFeedbackMessage('Profile picture uploaded successfully.');
      } else {
        setErrorMessage(result.error || 'Failed to register uploaded profile picture.');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unexpected error during profile photo upload.'
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // College ID Upload Handler
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
      const uniqueId =
        typeof crypto !== 'undefined' && crypto.randomUUID
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

      // 3. Register metadata and verify binary integrity via Server Action
      const result = await uploadCollegeIdAction({ storagePath });
      if (result.success && result.data?.path) {
        setCollegeIdPath(result.data.path);
        setFeedbackMessage('College ID uploaded successfully.');
      } else {
        setErrorMessage(result.error || 'Failed to register uploaded College ID.');
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unexpected upload error occurred.'
      );
    } finally {
      setIsUploadingId(false);
    }
  };

  // Final Submission Handler
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

      {/* 1. Profile Details Review Box */}
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
            <span className="font-medium text-text-primary">{formatDate(profile.date_of_birth)}</span>
          </div>
        </div>
      </div>

      {/* 2. Profile Picture (Optional) */}
      <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary">
              2. Profile Picture
            </h2>
            <span className="text-[11px] font-medium text-text-secondary bg-surface-subtle px-2 py-0.5 rounded-xs">
              Optional
            </span>
          </div>
          {photoPath ? (
            <span className="text-[11px] font-medium text-brand-success bg-brand-success/10 px-2 py-0.5 rounded-xs">
              ✓ Uploaded
            </span>
          ) : (
            <span className="text-[11px] font-medium text-text-secondary bg-surface-subtle px-2 py-0.5 rounded-xs">
              Not Uploaded
            </span>
          )}
        </div>
        <p className="text-xs text-text-secondary mb-4">
          A clear headshot. JPG, PNG or WebP, up to 1 MB.
        </p>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Avatar Preview Capsule */}
          <div className="shrink-0">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Profile preview"
                className="w-16 h-16 rounded-full object-cover border-2 border-brand-primary shadow-xs"
              />
            ) : photoPath ? (
              <div className="w-16 h-16 rounded-full bg-brand-success/10 border-2 border-brand-success flex items-center justify-center text-brand-success font-semibold text-xs">
                ✓ Photo
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-surface-subtle border-2 border-border-subtle flex items-center justify-center text-text-secondary text-xs font-semibold">
                {profile.full_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2 w-full">
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              id="profile-photo-input"
              onChange={handlePhotoSelected}
              disabled={isUploadingPhoto || isSubmitting}
              className="text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border file:border-border-subtle file:text-xs file:font-medium file:bg-surface-subtle hover:file:bg-surface-canvas file:cursor-pointer"
            />
            {photoFile && (
              <p className="text-[11px] text-text-secondary font-mono">
                Selected: {photoFile.name} ({(photoFile.size / 1024).toFixed(1)} KB)
              </p>
            )}

            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleUploadPhoto}
                disabled={!photoFile || isUploadingPhoto || isSubmitting}
                isLoading={isUploadingPhoto}
              >
                {photoPath ? 'Re-upload Profile Picture' : 'Upload Profile Picture'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. College ID Document Verification (Required) */}
      <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-text-primary">
            3. College ID Document <span className="text-brand-error">*</span>
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

      {/* 4. Review & Final Submission */}
      <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Ready to Submit for Institutional Review?
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            An administrator will review your profile after you submit.
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
