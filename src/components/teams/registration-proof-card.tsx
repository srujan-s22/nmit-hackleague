'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import {
  uploadRegistrationProofAction,
  getRegistrationProofPreviewUrlAction,
} from '@/actions/team-actions';
import { MANDATORY_CDC_DECLARATION_TEXT } from '@/lib/validation/team-schemas';

export interface RegistrationProofCardProps {
  teamId: string;
  isLeader: boolean;
  canViewProof: boolean;
  hasRegistrationProof: boolean;
  externalStatus: string;
  externalProofSubmittedAt: string | null;
  internalStatus: string;
  memberCount: number;
  minTeamSize: number;
  externalRegistrationUrl?: string | null;
}

export function RegistrationProofCard({
  teamId,
  isLeader,
  canViewProof,
  hasRegistrationProof,
  externalStatus,
  externalProofSubmittedAt,
  internalStatus,
  memberCount,
  minTeamSize,
  externalRegistrationUrl,
}: RegistrationProofCardProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cdcAccepted, setCdcAccepted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Preview Modal States
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const isRosterLocked = internalStatus === 'complete';
  const hasMinMembers = memberCount >= minTeamSize;
  const canSubmit = isLeader && (!hasRegistrationProof || externalStatus === 'rejected') && isRosterLocked && hasMinMembers;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // 1 MiB limit check on client (1,048,576 bytes)
    if (file.size > 1024 * 1024) {
      setErrorMessage('The selected file exceeds the 1 MiB limit. Please compress or resize the screenshot.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // MIME type check
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('Only PNG, JPEG, or WebP screenshot files are accepted.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !cdcAccepted) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('cdcAccepted', 'true');
    formData.append('cdcDeclarationText', MANDATORY_CDC_DECLARATION_TEXT);

    try {
      const result = await uploadRegistrationProofAction(teamId, formData);

      if (!result.success) {
        if (result.cleanup_state === 'unresolved_leak') {
          setErrorMessage(
            `Upload error: ${result.error || 'Failed to submit proof.'} Note: A storage cleanup failure was logged for operator review.`
          );
        } else {
          setErrorMessage(result.error || 'Failed to upload registration proof.');
        }
        setIsUploading(false);
        return;
      }

      setSuccessMessage('Registration proof screenshot uploaded and submitted successfully!');
      setSelectedFile(null);
      setCdcAccepted(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      router.refresh();
    } catch {
      setErrorMessage('A network error occurred while uploading registration proof.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewProof = async () => {
    setIsLoadingPreview(true);
    setErrorMessage(null);

    try {
      const res = await getRegistrationProofPreviewUrlAction(teamId);
      if (!res.success || !res.data?.url) {
        setErrorMessage(res.error || 'Unable to load registration proof preview.');
        setIsLoadingPreview(false);
        return;
      }

      setPreviewUrl(res.data.url);
      setIsPreviewOpen(true);
    } catch {
      setErrorMessage('A network error occurred while fetching proof preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const getStatusBadge = () => {
    switch (externalStatus) {
      case 'verified':
        return <Badge variant="success" dot>Registration Verified</Badge>;
      case 'submitted':
        return <Badge variant="info" dot>Under Review</Badge>;
      case 'rejected':
        return <Badge variant="error" dot>Proof Rejected</Badge>;
      default:
        return <Badge variant="neutral" dot>Not Submitted</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Registration Verification</CardTitle>
              <CardDescription>
                External portal registration verification and proof screenshot.
              </CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="error" onClose={() => setErrorMessage(null)}>
              {errorMessage}
            </Alert>
          )}

          {successMessage && (
            <Alert variant="success" onClose={() => setSuccessMessage(null)}>
              {successMessage}
            </Alert>
          )}

          {/* External Registration Link Banner */}
          {externalRegistrationUrl && (
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-semibold text-text-primary block">Official Portal Link:</span>
                <span className="text-text-secondary">Complete your team entry on the external platform first.</span>
              </div>
              <a
                href={externalRegistrationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-sm bg-surface-inverse text-text-inverse hover:bg-neutral-800 text-xs font-medium inline-flex items-center gap-1 shrink-0 transition-colors"
              >
                Open External Portal ↗
              </a>
            </div>
          )}

          {/* Already Submitted State */}
          {hasRegistrationProof ? (
            <div className="p-4 bg-surface-subtle border border-border-subtle rounded-md space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-text-primary block">Proof Screenshot on File</span>
                  <span className="text-text-muted">
                    Submitted on:{' '}
                    {externalProofSubmittedAt
                      ? new Date(externalProofSubmittedAt).toLocaleString()
                      : 'Recently'}
                  </span>
                </div>

                {canViewProof && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewProof}
                    isLoading={isLoadingPreview}
                  >
                    View Submitted Proof
                  </Button>
                )}
              </div>

              {externalStatus === 'verified' && (
                <p className="text-status-success-text font-medium">
                  ✓ Your team registration has been officially approved by the organizing committee.
                </p>
              )}

              {externalStatus === 'submitted' && (
                <p className="text-text-secondary">
                  Your verification screenshot has been submitted and is currently awaiting review by institutional coordinators.
                </p>
              )}

              {externalStatus === 'rejected' && (
                <div className="text-status-error-text space-y-1">
                  <p className="font-semibold">Your previous screenshot was rejected by reviewers.</p>
                  <p className="text-text-secondary">
                    Please upload a clearer screenshot showing the full team roster and confirmation on the external portal.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {/* Upload Form (when not submitted or rejected) */}
          {(!hasRegistrationProof || externalStatus === 'rejected') && (
            <>
              {!isRosterLocked ? (
                <div className="p-4 bg-surface-subtle border border-border-subtle rounded-md text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary block mb-1">Roster Must Be Finalized</span>
                  You must lock your team roster before submitting registration proof.
                  Ensure your team has at least {minTeamSize} {minTeamSize === 1 ? 'member' : 'members'} and click &quot;Lock Roster&quot; above.
                </div>
              ) : !isLeader ? (
                <div className="p-4 bg-surface-subtle border border-border-subtle rounded-md text-xs text-text-secondary">
                  <span className="font-semibold text-text-primary block mb-1">Leader Action Required</span>
                  Only the team leader can submit the registration proof screenshot.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-primary block">
                      Upload Confirmation Screenshot
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleFileChange}
                      disabled={isUploading || !canSubmit}
                      className="block w-full text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:text-xs file:font-semibold file:bg-surface-inverse file:text-text-inverse hover:file:bg-neutral-800 cursor-pointer"
                    />
                    <p className="text-[11px] text-text-helper">
                      Accepts PNG, JPEG, or WebP. Maximum file size: 1 MiB.
                    </p>
                  </div>

                  {selectedFile && (
                    <div className="p-3 bg-surface-subtle border border-border-subtle rounded-sm text-xs flex justify-between items-center">
                      <span className="font-medium text-text-primary truncate max-w-xs">
                        {selectedFile.name}
                      </span>
                      <span className="text-text-muted font-mono">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  )}

                  {/* Mandatory CDC Declaration Checkbox */}
                  <div className="pt-2 border-t border-border-subtle">
                    <Checkbox
                      id="cdc-declaration"
                      checked={cdcAccepted}
                      onChange={(e) => setCdcAccepted(e.target.checked)}
                      disabled={isUploading || !selectedFile}
                      label={
                        <span className="text-xs text-text-primary leading-tight">
                          {MANDATORY_CDC_DECLARATION_TEXT}
                        </span>
                      }
                      helperText="This declaration is legally binding for institutional competition eligibility."
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    isLoading={isUploading}
                    disabled={isUploading || !selectedFile || !cdcAccepted}
                    fullWidth
                  >
                    Submit Registration Proof
                  </Button>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Secure Proof Preview Dialog */}
      <Dialog
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewUrl(null);
        }}
        title="Submitted Registration Proof"
        description="Authorized preview generated securely (valid for 60 seconds)."
        maxWidth="lg"
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setIsPreviewOpen(false);
              setPreviewUrl(null);
            }}
          >
            Close Preview
          </Button>
        }
      >
        <div className="flex flex-col items-center justify-center p-2">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Registration Proof Screenshot"
              className="max-h-[60vh] max-w-full rounded-sm object-contain border border-border-subtle shadow-xs"
            />
          ) : (
            <p className="text-xs text-text-secondary">Loading preview...</p>
          )}
        </div>
      </Dialog>
    </>
  );
}
