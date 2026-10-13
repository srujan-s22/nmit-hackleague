'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  uploadCollegeIdAction,
  uploadProfilePhotoAction,
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
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(profile.profile_photo_path);

  const [idFile, setIdFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [isUploadingId, setIsUploadingId] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSubmitting, startSubmission] = useTransition();

  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleUploadId = async () => {
    if (!idFile) return;
    setIsUploadingId(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    const formData = new FormData();
    formData.append('collegeId', idFile);

    try {
      const result = await uploadCollegeIdAction(formData);
      if (result.success && result.data?.path) {
        setCollegeIdPath(result.data.path);
        setFeedbackMessage('College ID uploaded successfully.');
      } else {
        setErrorMessage(result.error || 'Failed to upload College ID.');
      }
    } finally {
      setIsUploadingId(false);
    }
  };

  const handleUploadPhoto = async () => {
    if (!photoFile) return;
    setIsUploadingPhoto(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    const formData = new FormData();
    formData.append('profilePhoto', photoFile);

    try {
      const result = await uploadProfilePhotoAction(formData);
      if (result.success && result.data?.path) {
        setProfilePhotoPath(result.data.path);
        setFeedbackMessage('Profile photo uploaded successfully.');
      } else {
        setErrorMessage(result.error || 'Failed to upload profile photo.');
      }
    } finally {
      setIsUploadingPhoto(false);
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

      {/* Document Uploads Box */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* College ID Card */}
        <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-text-primary">
                2. College ID Card <span className="text-brand-error">*</span>
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
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full mt-4"
            onClick={handleUploadId}
            disabled={!idFile || isUploadingId || isSubmitting}
            isLoading={isUploadingId}
          >
            {collegeIdPath ? 'Re-upload College ID' : 'Upload College ID Document'}
          </Button>
        </div>

        {/* Profile Photo */}
        <div className="bg-surface-canvas rounded-md border border-border-subtle p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-text-primary">
                3. Profile Photo <span className="text-text-muted text-xs font-normal">(Optional)</span>
              </h2>
              {profilePhotoPath ? (
                <span className="text-[11px] font-medium text-brand-success bg-brand-success/10 px-2 py-0.5 rounded-xs">
                  ✓ Uploaded
                </span>
              ) : (
                <span className="text-[11px] font-medium text-text-secondary bg-surface-subtle px-2 py-0.5 rounded-xs">
                  Optional
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary mb-4">
              A clear passport-style headshot for hackathon badge printing (Max 2MB, PNG/JPEG).
            </p>

            <input
              type="file"
              accept=".png,.jpg,.jpeg"
              id="profile-photo-input"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              disabled={isUploadingPhoto || isSubmitting}
              className="text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border file:border-border-subtle file:text-xs file:font-medium file:bg-surface-subtle hover:file:bg-surface-canvas file:cursor-pointer"
            />
            {photoFile && (
              <p className="text-[11px] text-text-secondary mt-1 font-mono">
                Selected: {photoFile.name} ({(photoFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full mt-4"
            onClick={handleUploadPhoto}
            disabled={!photoFile || isUploadingPhoto || isSubmitting}
            isLoading={isUploadingPhoto}
          >
            {profilePhotoPath ? 'Re-upload Profile Photo' : 'Upload Profile Photo'}
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
