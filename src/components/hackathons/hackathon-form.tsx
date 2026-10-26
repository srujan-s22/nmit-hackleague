'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createHackathonDraftAction,
  updateHackathonMetadataAction,
  setHackathonAcademicPeriodAction,
} from '@/actions/hackathon-management-actions';
import {
  hackathonFormSchema,
  hackathonCreateSchema,
  hackathonUpdateSchema,
  type HackathonFormData,
} from '@/lib/validation/hackathon-schemas';

interface HackathonFormProps {
  initialData?: Partial<HackathonFormData> & {
    id?: string;
    registrationEndAt?: string;
    academicYear?: string | null;
    academicTerm?: 'odd_sem' | 'even_sem' | 'summer_term' | 'unassigned' | null;
  };
  isEdit?: boolean;
}

function toLocalDatetimeString(dateString?: string): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function HackathonForm({ initialData, isEdit = false }: HackathonFormProps) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title || '');
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [isSlugManual, setIsSlugManual] = useState(Boolean(initialData?.slug));
  const [tagline, setTagline] = useState(initialData?.tagline || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [organizer, setOrganizer] = useState(initialData?.organizer || 'NMIT Department of CSE');
  const [mode, setMode] = useState<'offline' | 'online' | 'hybrid'>(initialData?.mode || 'hybrid');
  const [venue, setVenue] = useState(initialData?.venue || '');
  const [academicYear, setAcademicYear] = useState(initialData?.academicYear || '');
  const [academicTerm, setAcademicTerm] = useState<'odd_sem' | 'even_sem' | 'summer_term' | 'unassigned'>(
    initialData?.academicTerm || 'unassigned'
  );

  const [registrationStartAt, setRegistrationStartAt] = useState(
    toLocalDatetimeString(initialData?.registrationStartAt)
  );
  const [registrationEndAt, setRegistrationEndAt] = useState(
    toLocalDatetimeString(initialData?.registrationEndAt)
  );
  const [eventStartAt, setEventStartAt] = useState(
    toLocalDatetimeString(initialData?.eventStartAt)
  );
  const [eventEndAt, setEventEndAt] = useState(
    toLocalDatetimeString(initialData?.eventEndAt)
  );

  const [minTeamSize, setMinTeamSize] = useState<number>(initialData?.minTeamSize ?? 2);
  const [maxTeamSize, setMaxTeamSize] = useState<number>(initialData?.maxTeamSize ?? 4);
  const [isSoloAllowed, setIsSoloAllowed] = useState<boolean>(initialData?.isSoloAllowed ?? false);

  const [eligibility, setEligibility] = useState(
    initialData?.eligibility || 'Open to all verified NMIT undergraduate students.'
  );
  const [prizesSummary, setPrizesSummary] = useState(initialData?.prizesSummary || '');
  const [prizesDetail, setPrizesDetail] = useState<Array<{ placement: string; reward: string; description?: string }>>(
    // Start with empty tiers (placeholders only) so sample amounts are never published by accident.
    initialData?.prizesDetail || [
      { placement: '1st Place', reward: '', description: '' },
      { placement: '2nd Place', reward: '', description: '' },
    ]
  );

  const [externalRegistrationUrl, setExternalRegistrationUrl] = useState(
    initialData?.externalRegistrationUrl || ''
  );
  const [communityUrl, setCommunityUrl] = useState(initialData?.communityUrl || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isSlugManual && !isEdit) {
      setSlug(slugify(val));
    }
  };

  const handleSoloToggle = (checked: boolean) => {
    setIsSoloAllowed(checked);
    if (checked) {
      setMinTeamSize(1);
    }
  };

  const addPrizeTier = () => {
    setPrizesDetail((prev) => [...prev, { placement: '', reward: '', description: '' }]);
  };

  const removePrizeTier = (index: number) => {
    setPrizesDetail((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updatePrizeTier = (index: number, key: 'placement' | 'reward' | 'description', value: string) => {
    setPrizesDetail((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: value };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      tagline: tagline.trim() || undefined,
      description: description.trim(),
      organizer: organizer.trim(),
      mode,
      venue: venue.trim() || undefined,
      registrationStartAt: registrationStartAt ? new Date(registrationStartAt).toISOString() : '',
      registrationEndAt: registrationEndAt ? new Date(registrationEndAt).toISOString() : '',
      eventStartAt: eventStartAt ? new Date(eventStartAt).toISOString() : '',
      eventEndAt: eventEndAt ? new Date(eventEndAt).toISOString() : '',
      timezone: 'Asia/Kolkata',
      minTeamSize: Number(minTeamSize),
      maxTeamSize: Number(maxTeamSize),
      isSoloAllowed,
      eligibility: eligibility.trim(),
      prizesSummary: prizesSummary.trim() || undefined,
      prizesDetail: prizesDetail.filter((p) => p.placement.trim() && p.reward.trim()),
      externalRegistrationUrl: externalRegistrationUrl.trim() || (isEdit ? undefined : ''),
      communityUrl: communityUrl.trim() || undefined,
    };

    // Client-side schema validation (mandatory external registration URL for new events)
    const activeSchema = isEdit ? hackathonUpdateSchema : hackathonCreateSchema;
    const clientValidation = activeSchema.safeParse(payload);
    if (!clientValidation.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of clientValidation.error.issues) {
        const path = issue.path.join('.');
        errors[path] = errors[path] || [];
        errors[path].push(issue.message);
      }
      setFieldErrors(errors);
      setFormError('Please resolve the errors highlighted below.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEdit && initialData?.id) {
        const res = await updateHackathonMetadataAction(initialData.id, payload);
        if (!res.success) {
          setFormError(res.error || 'Failed to update hackathon.');
          if (res.fieldErrors) setFieldErrors(res.fieldErrors);
          return;
        }

        const periodRes = await setHackathonAcademicPeriodAction(
          initialData.id,
          academicYear.trim() || 'unassigned',
          academicTerm
        );
        if (!periodRes.success) {
          setFormError(periodRes.error || 'Failed to update academic period.');
          return;
        }

        router.push('/admin/hackathons');
      } else {
        const res = await createHackathonDraftAction(payload);
        if (!res.success) {
          setFormError(res.error || 'Failed to create hackathon draft.');
          if (res.fieldErrors) setFieldErrors(res.fieldErrors);
          return;
        }
        if (res.data?.id) {
          if (academicYear.trim() || academicTerm !== 'unassigned') {
            await setHackathonAcademicPeriodAction(
              res.data.id,
              academicYear.trim() || 'unassigned',
              academicTerm
            );
          }
          // Direct admin to configure rounds next
          router.push(`/admin/hackathons/${res.data.id}/rounds`);
        } else {
          router.push('/admin/hackathons');
        }
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {formError && (
        <Alert variant="error" title="Form Submission Error">
          {formError}
        </Alert>
      )}

      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Event Title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. NMIT HackLeague 2026"
              error={fieldErrors['title']?.[0]}
              required
            />
            <Input
              label="URL Slug"
              value={slug}
              onChange={(e) => {
                setIsSlugManual(true);
                setSlug(e.target.value);
              }}
              placeholder="e.g. nmit-hackleague-2026"
              helperText="Unique URL identifier for student discovery."
              error={fieldErrors['slug']?.[0]}
              required
            />
          </div>

          <Input
            label="Tagline (Optional)"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="A short punchy summary for event cards (max 160 chars)"
            error={fieldErrors['tagline']?.[0]}
          />

          <div>
            <label className="text-sm font-medium text-text-primary block mb-1.5">
              Full Event Description <span className="text-status-error-text">*</span>
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed overview of competition themes, challenges, guidelines, and expectations..."
              rows={5}
              required
            />
            {fieldErrors['description']?.[0] && (
              <p className="text-xs text-status-error-text mt-1">{fieldErrors['description'][0]}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Organizer"
              value={organizer}
              onChange={(e) => setOrganizer(e.target.value)}
              placeholder="e.g. Department of CSE"
              error={fieldErrors['organizer']?.[0]}
              required
            />
            <Select
              label="Participation Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'offline' | 'online' | 'hybrid')}
              options={[
                { label: 'Hybrid (Online + Physical)', value: 'hybrid' },
                { label: 'In-Person / Offline', value: 'offline' },
                { label: 'Online / Virtual', value: 'online' },
              ]}
              required
            />
            <Input
              label={mode === 'online' ? 'Physical Venue (Optional for Online)' : 'Physical Venue'}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. Auditorium / LAB-3"
              error={fieldErrors['venue']?.[0]}
              required={mode !== 'online'}
            />
          </div>
        </div>
      </Card>

      {/* Institutional Academic Period (Phase 9 Points & Leaderboard) */}
      <Card>
        <CardHeader>
          <CardTitle>Institutional Academic Period</CardTitle>
          <p className="text-xs text-text-muted mt-1">
            Used to filter the leaderboard by academic year and semester.
          </p>
        </CardHeader>
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Academic Year"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="e.g. 2026-2027"
              helperText="Format: YYYY-YYYY (e.g. 2026-2027)"
            />
            <Select
              label="Academic Term / Semester"
              value={academicTerm}
              onChange={(e) =>
                setAcademicTerm(e.target.value as 'odd_sem' | 'even_sem' | 'summer_term' | 'unassigned')
              }
              options={[
                { label: 'Unassigned (Historical / General)', value: 'unassigned' },
                { label: 'Odd Semester (Autumn / Monsoon)', value: 'odd_sem' },
                { label: 'Even Semester (Spring)', value: 'even_sem' },
                { label: 'Summer Term', value: 'summer_term' },
              ]}
              helperText="Determines semester-specific leaderboard aggregates."
            />
          </div>
        </div>
      </Card>

      {/* Timeline & Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Schedule & Registration Timeline</CardTitle>
        </CardHeader>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="datetime-local"
              label="Registration Opens"
              value={registrationStartAt}
              onChange={(e) => setRegistrationStartAt(e.target.value)}
              error={fieldErrors['registrationStartAt']?.[0]}
              required
            />
            <div>
              <Input
                type="datetime-local"
                label={isEdit ? 'Registration Deadline (Audited Override in Dashboard)' : 'Registration Deadline'}
                value={registrationEndAt}
                onChange={(e) => setRegistrationEndAt(e.target.value)}
                disabled={isEdit}
                helperText={isEdit ? 'To change deadline on existing events, use "Override Deadline" from the dashboard.' : undefined}
                error={fieldErrors['registrationEndAt']?.[0]}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="datetime-local"
              label="Event Start"
              value={eventStartAt}
              onChange={(e) => setEventStartAt(e.target.value)}
              error={fieldErrors['eventStartAt']?.[0]}
              required
            />
            <Input
              type="datetime-local"
              label="Event Conclusion"
              value={eventEndAt}
              onChange={(e) => setEventEndAt(e.target.value)}
              error={fieldErrors['eventEndAt']?.[0]}
              required
            />
          </div>
        </div>
      </Card>

      {/* Team Formation & Eligibility */}
      <Card>
        <CardHeader>
          <CardTitle>Team Formation & Eligibility</CardTitle>
        </CardHeader>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              id="solo-allowed"
              checked={isSoloAllowed}
              onChange={(e) => handleSoloToggle(e.target.checked)}
            />
            <label htmlFor="solo-allowed" className="text-sm font-medium text-text-primary select-none cursor-pointer">
              Allow Solo Participation (enforces min team size = 1)
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="number"
              min={1}
              max={10}
              label="Minimum Team Size"
              value={minTeamSize}
              onChange={(e) => setMinTeamSize(Number(e.target.value))}
              disabled={isSoloAllowed}
              helperText={isSoloAllowed ? 'Locked to 1 when solo participation is permitted.' : undefined}
              error={fieldErrors['minTeamSize']?.[0]}
              required
            />
            <Input
              type="number"
              min={1}
              max={10}
              label="Maximum Team Size"
              value={maxTeamSize}
              onChange={(e) => setMaxTeamSize(Number(e.target.value))}
              error={fieldErrors['maxTeamSize']?.[0]}
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-text-primary block mb-1.5">
              Eligibility Criteria <span className="text-status-error-text">*</span>
            </label>
            <Textarea
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
              placeholder="e.g. Open to 2nd, 3rd, and 4th year CSE / ISE students..."
              rows={2}
              required
            />
            {fieldErrors['eligibility']?.[0] && (
              <p className="text-xs text-status-error-text mt-1">{fieldErrors['eligibility'][0]}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Prizes & External Links */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Prizes & Rewards</CardTitle>
            <Button type="button" variant="secondary" size="sm" onClick={addPrizeTier}>
              + Add Prize Tier
            </Button>
          </div>
        </CardHeader>
        <div className="p-5 space-y-4">
          <Input
            label="Prizes Summary (Header)"
            value={prizesSummary}
            onChange={(e) => setPrizesSummary(e.target.value)}
            placeholder="e.g. ₹50,000 Total Prize Pool + Internship Opportunities"
          />

          <div className="space-y-3">
            {prizesDetail.map((tier, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-surface-subtle p-3 rounded-sm border border-border-subtle">
                <div className="w-1/3">
                  <Input
                    placeholder="Placement (e.g. 1st Place)"
                    value={tier.placement}
                    onChange={(e) => updatePrizeTier(idx, 'placement', e.target.value)}
                    required
                  />
                </div>
                <div className="w-1/3">
                  <Input
                    placeholder="Reward (e.g. ₹25,000)"
                    value={tier.reward}
                    onChange={(e) => updatePrizeTier(idx, 'reward', e.target.value)}
                    required
                  />
                </div>
                <div className="w-1/3 flex items-center gap-2">
                  <Input
                    placeholder="Notes (optional)"
                    value={tier.description || ''}
                    onChange={(e) => updatePrizeTier(idx, 'description', e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    onClick={() => removePrizeTier(idx)}
                    className="text-status-error-text hover:bg-status-error-bg shrink-0"
                    title="Remove Tier"
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <Input
              type="url"
              label="External Registration URL"
              value={externalRegistrationUrl}
              onChange={(e) => setExternalRegistrationUrl(e.target.value)}
              placeholder="https://..."
              error={fieldErrors['externalRegistrationUrl']?.[0]}
              required={!isEdit}
            />
            <Input
              type="url"
              label="Community / Discord / WhatsApp URL (Optional)"
              value={communityUrl}
              onChange={(e) => setCommunityUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              error={fieldErrors['communityUrl']?.[0]}
            />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3 pt-4">
        <Button
          type="button"
          variant="tertiary"
          onClick={() => router.push('/admin/hackathons')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {isEdit ? 'Save Changes' : 'Create Draft & Continue to Rounds'}
        </Button>
      </div>
    </form>
  );
}
