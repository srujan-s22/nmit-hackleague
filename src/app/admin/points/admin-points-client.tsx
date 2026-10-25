'use client';

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { PointConfiguration } from '@/types/points';
import type { AdminProfile } from '@/types/auth';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Dialog } from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { adjustPointsAction } from '@/actions/points-adjustment-actions';
import { updatePointConfigurationAction } from '@/actions/point-config-actions';
import {
  getPointsOverviewAction,
  getPointsActivityAction,
  searchStudentsByEmailAction,
  getStudentPointsContextAction,
  type PointsOverview,
  type PointsActivityPage,
  type StudentCandidate,
  type StudentPointsContext,
} from '@/actions/points-admin-view-actions';
import { formatDateTime } from '@/lib/utils/date-format';

interface AdminPointsClientProps {
  admin: AdminProfile;
  configs: PointConfiguration[];
  hackathons: Array<{ id: string; title: string; status: string }>;
  configError?: string;
  initialOverview: PointsOverview | null;
  initialActivity: PointsActivityPage | null;
  initialLoadError: string | null;
}

const REASON_MIN = 10;
const REASON_MAX = 500;
const PAGE_SIZE = 10;

const ACTION_OPTIONS = [
  { label: 'All Actions', value: 'all' },
  { label: 'Manual Adjustments', value: 'manual_adjustment' },
  { label: 'Reversals', value: 'reversal' },
  { label: 'Participation', value: 'participation' },
  { label: 'Round Qualification', value: 'round_qualification' },
  { label: 'Win Placement', value: 'win_placement' },
];

const RANGE_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'All time', value: '0' },
];

const TYPE_BADGES: Record<string, { label: string; variant: 'success' | 'error' | 'neutral' | 'info' | 'warning' }> = {
  manual_adjustment: { label: 'Manual Adjustment', variant: 'success' },
  reversal: { label: 'Reversal', variant: 'error' },
  participation: { label: 'Participation', variant: 'neutral' },
  round_qualification: { label: 'Round Qualification', variant: 'info' },
  win_placement: { label: 'Win Placement', variant: 'warning' },
};

const formatNumber = (n: number) => n.toLocaleString('en-IN');

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function StepBadge({ n }: { n: number }) {
  return (
    <div
      className="w-9 h-9 rounded-full bg-status-success-bg text-status-success-text flex items-center justify-center text-sm font-bold shrink-0"
      aria-hidden="true"
    >
      {n}
    </div>
  );
}

function IconTile({
  tone,
  children,
}: {
  tone: 'green' | 'amber' | 'red' | 'gray';
  children: React.ReactNode;
}) {
  const tones = {
    green: 'bg-status-success-bg text-status-success-text',
    amber: 'bg-status-warning-bg text-status-warning-text',
    red: 'bg-status-error-bg text-status-error-text',
    gray: 'bg-surface-muted text-text-secondary',
  };
  return (
    <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}>
      {children}
    </div>
  );
}

const svgProps = {
  className: 'w-5 h-5',
  fill: 'none',
  stroke: 'currentColor',
  viewBox: '0 0 24 24',
  strokeWidth: 1.75,
  'aria-hidden': true,
} as const;

const Icons = {
  users: (
    <svg {...svgProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-4.13a4 4 0 10-4-4 4 4 0 004 4zm6 1a4 4 0 10-4-4" />
    </svg>
  ),
  star: (
    <svg {...svgProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5a.56.56 0 011.04 0l2.13 5.11a.56.56 0 00.47.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 00-.18.56l1.28 5.39a.56.56 0 01-.84.61l-4.73-2.89a.56.56 0 00-.58 0l-4.73 2.89a.56.56 0 01-.84-.61l1.28-5.39a.56.56 0 00-.18-.56l-4.2-3.6a.56.56 0 01.32-.99l5.52-.44a.56.56 0 00.47-.35l2.13-5.11z" />
    </svg>
  ),
  reverse: (
    <svg {...svgProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  ),
  ledger: (
    <svg {...svgProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.63a3.375 3.375 0 00-3.38-3.37h-1.5A1.125 1.125 0 0113.5 7.13v-1.5a3.375 3.375 0 00-3.38-3.38H8.25m2.25 0H5.63c-.62 0-1.13.5-1.13 1.13v17.25c0 .62.5 1.12 1.13 1.12h12.75c.62 0 1.12-.5 1.12-1.12V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  search: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.75" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
    </svg>
  ),
  user: (
    <svg {...svgProps}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.1a7.5 7.5 0 0115 0" />
    </svg>
  ),
};

export function AdminPointsClient({
  admin,
  configs: initialConfigs,
  hackathons,
  configError,
  initialOverview,
  initialActivity,
  initialLoadError,
}: AdminPointsClientProps) {
  const isSuperAdmin = Boolean(admin.is_super_admin);

  // ----- Summary cards -----
  const [overview, setOverview] = useState<PointsOverview | null>(initialOverview);
  const [pageError, setPageError] = useState<string | null>(initialLoadError);

  // ----- Section 1: student search -----
  const [emailQuery, setEmailQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<StudentCandidate[]>([]);
  const [studentCtx, setStudentCtx] = useState<StudentPointsContext | null>(null);
  const [isLoadingCtx, setIsLoadingCtx] = useState(false);

  // ----- Section 2: adjustment form -----
  const [hackathonId, setHackathonId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [pointsInput, setPointsInput] = useState('');
  const [reason, setReason] = useState('');
  const [overrideFloor, setOverrideFloor] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  // ----- Section 3: recent activity -----
  const [activity, setActivity] = useState<PointsActivityPage | null>(initialActivity);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [rangeDays, setRangeDays] = useState('30');
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const firstActivityLoad = useRef(true);
  const latestActivityRequest = useRef(0);

  // ----- Section 4: milestone configuration (carried over unchanged) -----
  const [configs, setConfigs] = useState<PointConfiguration[]>(initialConfigs);
  const [editingConfig, setEditingConfig] = useState<PointConfiguration | null>(null);
  const [editRegularPts, setEditRegularPts] = useState<number>(0);
  const [editLeaderPts, setEditLeaderPts] = useState<number>(0);
  const [configFeedback, setConfigFeedback] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isConfigPending, startConfigTransition] = useTransition();

  // Debounce the free-text activity search so every keystroke isn't a request.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Load activity whenever a filter, the page, or a refresh tick changes. The
  // initial server-rendered page is reused for the very first render.
  useEffect(() => {
    if (
      firstActivityLoad.current &&
      refreshTick === 0 &&
      page === 1 &&
      debouncedSearch === '' &&
      actionFilter === 'all' &&
      rangeDays === '30'
    ) {
      firstActivityLoad.current = false;
      return;
    }
    firstActivityLoad.current = false;

    const requestId = ++latestActivityRequest.current;
    setIsLoadingActivity(true);
    setActivityError(null);
    getPointsActivityAction({
      search: debouncedSearch,
      action: actionFilter,
      days: Number(rangeDays) || null,
      page,
      pageSize: PAGE_SIZE,
    }).then((res) => {
      if (requestId !== latestActivityRequest.current) return; // a newer request superseded this one
      if (res.success && res.activity) {
        setActivity(res.activity);
      } else {
        setActivityError(res.error || 'Failed to load points activity.');
      }
      setIsLoadingActivity(false);
    });
  }, [debouncedSearch, actionFilter, rangeDays, page, refreshTick]);

  // ---------------------------------------------------------------------
  // Student search / selection
  // ---------------------------------------------------------------------
  const selectStudent = async (studentId: string) => {
    setIsLoadingCtx(true);
    setSearchError(null);
    const res = await getStudentPointsContextAction(studentId);
    setIsLoadingCtx(false);
    if (res.success && res.context) {
      setStudentCtx(res.context);
      setCandidates([]);
      setFeedback(null);
      setFormError(null);
      // Preselect the student's only hackathon/team if unambiguous.
      const memberships = res.context.memberships;
      if (memberships.length === 1) {
        setHackathonId(memberships[0].hackathon_id);
        setTeamId(memberships[0].team_id);
      } else {
        setHackathonId('');
        setTeamId('');
      }
    } else {
      setStudentCtx(null);
      setSearchError(res.error || 'Failed to load student details.');
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSearchError(null);
    setCandidates([]);
    setStudentCtx(null);
    setHackathonId('');
    setTeamId('');
    setIsSearching(true);
    const res = await searchStudentsByEmailAction(emailQuery);
    setIsSearching(false);
    if (!res.success) {
      setSearchError(res.error || 'Search failed.');
      return;
    }
    const found = res.candidates || [];
    if (found.length === 0) {
      setSearchError('No student found with that email.');
    } else if (found.length === 1) {
      await selectStudent(found[0].id);
    } else {
      setCandidates(found);
    }
  };

  // Team options valid for the selected student in the chosen hackathon.
  const teamOptions = useMemo(
    () => (studentCtx?.memberships || []).filter((m) => m.hackathon_id === hackathonId),
    [studentCtx, hackathonId]
  );

  const handleHackathonChange = (id: string) => {
    setHackathonId(id);
    const options = (studentCtx?.memberships || []).filter((m) => m.hackathon_id === id);
    setTeamId(options.length === 1 ? options[0].team_id : '');
  };

  // ---------------------------------------------------------------------
  // Adjustment submission
  // ---------------------------------------------------------------------
  const validateForm = (): string | null => {
    if (!studentCtx) return 'Search for and select a student first.';
    if (!hackathonId) return 'Select a hackathon event.';
    if (!teamId) return 'Select a team (the student must be a member of a team in this hackathon).';
    if (!/^-?\d+$/.test(pointsInput.trim())) return 'Adjustment points must be a whole number such as 20 or -15.';
    if (Number(pointsInput) === 0) return 'Adjustment points cannot be zero.';
    const trimmedLength = reason.trim().length;
    if (trimmedLength < REASON_MIN) return `Audit reason must be at least ${REASON_MIN} characters.`;
    if (trimmedLength > REASON_MAX) return `Audit reason cannot exceed ${REASON_MAX} characters.`;
    return null;
  };

  const handleApplyClick = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const problem = validateForm();
    setFormError(problem);
    if (problem) return;
    // One idempotency key per confirmation attempt: re-clicking Confirm on the
    // same attempt can never record the adjustment twice.
    idempotencyKeyRef.current = `manual_adj_${crypto.randomUUID()}`;
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (isSubmitting || !studentCtx || !idempotencyKeyRef.current) return;
    setIsSubmitting(true);
    const res = await adjustPointsAction({
      studentId: studentCtx.student.id,
      hackathonId,
      teamId,
      points: Number(pointsInput),
      reason: reason.trim(),
      idempotencyKey: idempotencyKeyRef.current,
      overrideNegativeFloor: overrideFloor,
    });
    setIsSubmitting(false);
    setConfirmOpen(false);

    if (res.success) {
      setFeedback({
        success: true,
        message: `Recorded an adjustment of ${res.points} points for ${studentCtx.student.full_name}.`,
      });
      idempotencyKeyRef.current = null;
      setPointsInput('');
      setReason('');
      setOverrideFloor(false);
      // Refresh everything that depends on the ledger.
      setPage(1);
      setRefreshTick((t) => t + 1);
      void getPointsOverviewAction().then((o) => o.success && o.overview && setOverview(o.overview));
      void getStudentPointsContextAction(studentCtx.student.id).then(
        (c) => c.success && c.context && setStudentCtx(c.context)
      );
    } else {
      setFeedback({ success: false, message: res.error || 'Failed to apply the points adjustment.' });
    }
  };

  // ---------------------------------------------------------------------
  // Milestone configuration (unchanged behaviour)
  // ---------------------------------------------------------------------
  const handleOpenConfigModal = (config: PointConfiguration) => {
    setEditingConfig(config);
    setEditRegularPts(config.regular_member_points);
    setEditLeaderPts(config.team_leader_points);
    setConfigFeedback(null);
  };

  const handleSaveConfig = () => {
    if (!editingConfig) return;
    setConfigFeedback(null);

    startConfigTransition(async () => {
      const res = await updatePointConfigurationAction({
        milestoneType: editingConfig.milestone_type,
        regularMemberPoints: Number(editRegularPts),
        teamLeaderPoints: Number(editLeaderPts),
      });

      if (res.success && res.config) {
        setConfigs((prev) =>
          prev.map((c) => (c.milestone_type === res.config?.milestone_type ? res.config : c))
        );
        setEditingConfig(null);
      } else {
        setConfigFeedback({
          success: false,
          message: res.error || 'Failed to update configuration.',
        });
      }
    });
  };

  const totalPages = activity ? Math.max(Math.ceil(activity.total / activity.page_size), 1) : 1;
  const selectedMembership = teamOptions.find((m) => m.team_id === teamId);
  const pointsPreview = /^-?\d+$/.test(pointsInput.trim()) ? Number(pointsInput) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Points & Awards Management"
        description="Manage student points, make manual adjustments, and maintain a transparent and auditable points ledger."
        breadcrumbs={[
          { label: 'Admin Workspace', href: '/admin' },
          { label: 'Points & Awards' },
        ]}
        badge={
          <Badge variant="neutral" size="sm">
            {isSuperAdmin ? 'Super Admin Console' : 'Admin Console'}
          </Badge>
        }
      />

      {(configError || pageError) && (
        <Alert variant="error" title="Some data could not be loaded">
          {configError || pageError}
        </Alert>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-start gap-4">
            <IconTile tone="green">{Icons.users}</IconTile>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Total Students With Points
              </div>
              <div className="text-3xl font-extrabold text-text-primary mt-1">
                {overview ? formatNumber(overview.students_with_points) : '—'}
              </div>
              <div className="text-xs text-text-secondary mt-1">
                {overview ? `out of ${formatNumber(overview.approved_students)} approved students` : 'Unavailable'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-start gap-4">
            <IconTile tone="amber">{Icons.star}</IconTile>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Total Points Awarded
              </div>
              <div className="text-3xl font-extrabold text-text-primary mt-1">
                {overview ? formatNumber(overview.total_awarded) : '—'}
              </div>
              <div className="text-xs text-text-secondary mt-1">Across all hackathons</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-start gap-4">
            <IconTile tone="red">{Icons.reverse}</IconTile>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Total Points Reversed
              </div>
              <div className="text-3xl font-extrabold text-text-primary mt-1">
                {overview ? formatNumber(overview.total_reversed) : '—'}
              </div>
              <div className="text-xs text-text-secondary mt-1">
                {overview
                  ? `Across ${formatNumber(overview.reversal_count)} reversal${overview.reversal_count === 1 ? '' : 's'}`
                  : 'Unavailable'}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-start gap-4">
            <IconTile tone="gray">{Icons.ledger}</IconTile>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                Recent Adjustments
              </div>
              <div className="text-3xl font-extrabold text-text-primary mt-1">
                {overview ? formatNumber(overview.recent_adjustments) : '—'}
              </div>
              <div className="text-xs text-text-secondary mt-1">
                {overview ? `in the last ${overview.recent_days} days` : 'Unavailable'}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 1: Find a Student */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex items-start gap-4">
              <StepBadge n={1} />
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-text-primary">Find a Student</h2>
                <p className="text-sm text-text-secondary mb-4">
                  Search by student email to view their details, current points balance and team information.
                </p>
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <Input
                      id="student-email"
                      label="Student Email *"
                      type="text"
                      inputMode="email"
                      placeholder="Enter student email (e.g. student@nmit.ac.in)"
                      leftAddon={Icons.search}
                      value={emailQuery}
                      onChange={(e) => setEmailQuery(e.target.value)}
                      disabled={isSearching}
                      autoComplete="off"
                    />
                  </div>
                  <Button type="submit" variant="primary" isLoading={isSearching} disabled={isSearching || emailQuery.trim().length < 3}>
                    Search
                  </Button>
                </form>
                {searchError && (
                  <p className="text-xs text-status-error-text mt-2" role="alert">{searchError}</p>
                )}
                {candidates.length > 1 && (
                  <div className="mt-3 border border-border-subtle rounded-lg divide-y divide-border-subtle">
                    <div className="px-3 py-2 text-xs text-text-secondary bg-surface-subtle rounded-t-lg">
                      {candidates.length} students match — choose one:
                    </div>
                    {candidates.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectStudent(c.id)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface-subtle transition-colors focus:outline-none focus:bg-surface-subtle"
                      >
                        <span className="font-medium text-text-primary">{c.full_name}</span>{' '}
                        <span className="text-text-secondary">· {c.email} · {c.usn}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Selected student panel */}
            <div className="rounded-xl bg-status-success-bg/40 border border-status-success-border/60 p-5 flex items-start gap-4">
              <IconTile tone="green">{Icons.user}</IconTile>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold text-text-primary">Selected Student</div>
                {isLoadingCtx ? (
                  <p className="text-sm text-text-secondary mt-1">Loading student details…</p>
                ) : studentCtx ? (
                  <div className="mt-1 space-y-2">
                    <div>
                      <div className="text-sm font-semibold text-text-primary truncate">{studentCtx.student.full_name}</div>
                      <div className="text-xs text-text-secondary truncate">
                        {studentCtx.student.email} · {studentCtx.student.usn}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="success" size="sm">{formatNumber(studentCtx.total_points)} pts balance</Badge>
                      {studentCtx.student.registration_status !== 'approved' && (
                        <Badge variant="warning" size="sm">{studentCtx.student.registration_status.replace('_', ' ')}</Badge>
                      )}
                    </div>
                    <div className="text-xs text-text-secondary">
                      {studentCtx.memberships.length === 0
                        ? 'Not on any team (visible to you).'
                        : studentCtx.memberships.map((m) => `${m.team_name} — ${m.hackathon_title}`).join(' · ')}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary mt-1">Search for a student to view their details</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Manual Points Adjustment */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <StepBadge n={2} />
            <div>
              <h2 className="text-base font-bold text-text-primary">Manual Points Adjustment</h2>
              <p className="text-sm text-text-secondary">
                Add or subtract points for the selected student with an audit reason.
              </p>
            </div>
          </div>

          <form onSubmit={handleApplyClick} className="space-y-4" noValidate>
            {feedback && (
              <Alert variant={feedback.success ? 'success' : 'error'}>{feedback.message}</Alert>
            )}
            {formError && <Alert variant="error">{formError}</Alert>}

            <Input
              id="selected-student"
              label="Selected Student *"
              value={studentCtx ? `${studentCtx.student.full_name} (${studentCtx.student.email})` : ''}
              placeholder="No student selected"
              readOnly
              className="bg-surface-subtle"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                id="adj-hackathon"
                label="Hackathon Event *"
                value={hackathonId}
                onChange={(e) => handleHackathonChange(e.target.value)}
                disabled={!studentCtx || isSubmitting}
              >
                <option value="">Select a hackathon</option>
                {hackathons.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.title} ({h.status})
                  </option>
                ))}
              </Select>

              <Select
                id="adj-team"
                label="Team *"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                disabled={!studentCtx || !hackathonId || isSubmitting}
                helperText={
                  studentCtx && hackathonId && teamOptions.length === 0
                    ? 'This student is not on a team in the selected hackathon.'
                    : undefined
                }
              >
                <option value="">Select team</option>
                {teamOptions.map((m) => (
                  <option key={m.team_id} value={m.team_id}>
                    {m.team_name} ({m.role})
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
              <Input
                id="adj-points"
                label="Adjustment Points *"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 20 or -15"
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                disabled={isSubmitting}
                autoComplete="off"
              />
              <div>
                <Textarea
                  id="adj-reason"
                  label="Audit Reason *"
                  rows={3}
                  maxLength={REASON_MAX}
                  placeholder="Provide detailed justification for this adjustment..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isSubmitting}
                />
                <div className={`text-right text-xs mt-1 ${reason.length > REASON_MAX ? 'text-status-error-text' : 'text-text-helper'}`}>
                  {reason.length}/{REASON_MAX}
                </div>
              </div>
            </div>

            <Checkbox
              id="adj-override"
              label="Override Negative Balance Floor"
              helperText={
                isSuperAdmin
                  ? 'Allow this adjustment even if it results in a negative balance.'
                  : 'Allow this adjustment even if it results in a negative balance. (Super Admin only.)'
              }
              checked={overrideFloor}
              onChange={(e) => setOverrideFloor(e.target.checked)}
              disabled={!isSuperAdmin || isSubmitting}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              Apply Points Adjustment
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Confirmation dialog for the points-changing operation */}
      <Dialog
        isOpen={confirmOpen}
        onClose={() => !isSubmitting && setConfirmOpen(false)}
        title="Confirm points adjustment"
        description="This writes a permanent, audited entry to the points ledger."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm} isLoading={isSubmitting} disabled={isSubmitting}>
              Confirm Adjustment
            </Button>
          </>
        }
      >
        {studentCtx && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-text-secondary">Student</dt>
            <dd className="font-medium text-text-primary">{studentCtx.student.full_name} ({studentCtx.student.email})</dd>
            <dt className="text-text-secondary">Team</dt>
            <dd className="text-text-primary">{selectedMembership ? `${selectedMembership.team_name} — ${selectedMembership.hackathon_title}` : '—'}</dd>
            <dt className="text-text-secondary">Points</dt>
            <dd className={`font-bold ${pointsPreview !== null && pointsPreview < 0 ? 'text-status-error-text' : 'text-status-success-text'}`}>
              {pointsPreview !== null && pointsPreview > 0 ? '+' : ''}{pointsPreview}
            </dd>
            <dt className="text-text-secondary">Reason</dt>
            <dd className="text-text-primary break-words">{reason.trim()}</dd>
            {overrideFloor && (
              <>
                <dt className="text-text-secondary">Override</dt>
                <dd className="text-status-warning-text font-medium">Negative balance floor override requested</dd>
              </>
            )}
          </dl>
        )}
      </Dialog>

      {/* Section 3: Recent Points Activity */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-5">
            <div className="flex items-start gap-4">
              <StepBadge n={3} />
              <div>
                <h2 className="text-base font-bold text-text-primary">Recent Points Activity</h2>
                <p className="text-sm text-text-secondary">
                  View the latest points adjustments and reversals across all students.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
              <div className="sm:w-72">
                <Input
                  id="activity-search"
                  aria-label="Search points activity"
                  placeholder="Search by student email, name or hackathon..."
                  leftAddon={Icons.search}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <Select
                id="activity-action"
                aria-label="Filter by action"
                value={actionFilter}
                onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
                options={ACTION_OPTIONS}
              />
              <Select
                id="activity-range"
                aria-label="Filter by date range"
                value={rangeDays}
                onChange={(e) => { setRangeDays(e.target.value); setPage(1); }}
                options={RANGE_OPTIONS}
              />
            </div>
          </div>

          {activityError && <Alert variant="error" className="mb-4">{activityError}</Alert>}

          <div className={isLoadingActivity ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={isLoadingActivity}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATE</TableHead>
                  <TableHead>STUDENT</TableHead>
                  <TableHead>HACKATHON</TableHead>
                  <TableHead>TEAM</TableHead>
                  <TableHead>POINTS</TableHead>
                  <TableHead>TYPE</TableHead>
                  <TableHead>REASON</TableHead>
                  <TableHead>BY</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!activity || activity.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-text-helper py-10">
                      {isLoadingActivity ? 'Loading activity…' : 'No points activity matches these filters.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  activity.rows.map((row) => {
                    const badge = TYPE_BADGES[row.milestone_type] || { label: row.milestone_type, variant: 'neutral' as const };
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs">{formatDateTime(row.created_at)}</TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium text-text-primary max-w-[180px] truncate" title={row.student_name}>{row.student_name}</div>
                          <div className="text-text-secondary max-w-[180px] truncate" title={row.student_email}>{row.student_email}</div>
                        </TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate" title={row.hackathon_title}>{row.hackathon_title}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate" title={row.team_name}>{row.team_name}</TableCell>
                        <TableCell className={`text-xs font-bold whitespace-nowrap ${row.points < 0 ? 'text-status-error-text' : 'text-status-success-text'}`}>
                          {row.points > 0 ? '+' : ''}{row.points}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} size="sm">{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-xs max-w-[240px] truncate" title={row.reason}>{row.reason}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate" title={row.awarded_by_email}>{row.awarded_by_email}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {activity && activity.total > 0 && (
            <div className="flex items-center justify-between gap-3 mt-4 text-xs text-text-secondary">
              <span>
                Showing {(activity.page - 1) * activity.page_size + 1}–
                {Math.min(activity.page * activity.page_size, activity.total)} of {formatNumber(activity.total)}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1 || isLoadingActivity}>
                  Previous
                </Button>
                <span>Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(p + 1, totalPages))} disabled={page >= totalPages || isLoadingActivity}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Milestone point values (existing capability, unchanged) */}
      <Card>
        <CardHeader className="border-b border-border-subtle flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Platform Milestone Point Values</CardTitle>
            <p className="text-xs text-text-secondary mt-0.5">
              Configured point values applied when registration proofs are submitted and rounds are approved.
            </p>
          </div>
          {isSuperAdmin ? (
            <Badge variant="success" size="sm">Super Admin Authorized</Badge>
          ) : (
            <Badge variant="neutral" size="sm">Read-Only (Super Admin Access Required to Edit)</Badge>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Milestone Type</TableHead>
                <TableHead className="w-36 text-center">Regular Member</TableHead>
                <TableHead className="w-36 text-center">Team Leader</TableHead>
                <TableHead className="w-32 text-center">Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => {
                const isWin = config.milestone_type === 'win_placement';
                return (
                  <TableRow key={config.id}>
                    <TableCell>
                      <div className="font-medium text-text-primary text-sm capitalize">
                        {config.milestone_type.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-text-muted">
                        {isWin
                          ? 'Winner and placement bonus awards'
                          : config.milestone_type === 'participation'
                          ? 'Submitted registration claims with CDC declaration'
                          : 'Evaluated and accepted round submissions'}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-bold text-sm">+{config.regular_member_points} pts</TableCell>
                    <TableCell className="text-center font-mono font-bold text-sm">+{config.team_leader_points} pts</TableCell>
                    <TableCell className="text-center">
                      {isWin ? (
                        <Badge variant="error" size="sm">Disabled (Locked)</Badge>
                      ) : config.is_active ? (
                        <Badge variant="success" size="sm">Active</Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isWin ? (
                        <span className="text-xs text-text-muted italic select-none">Blocked</span>
                      ) : isSuperAdmin ? (
                        <Button variant="outline" size="sm" onClick={() => handleOpenConfigModal(config)}>
                          Edit Values
                        </Button>
                      ) : (
                        <span className="text-xs text-text-muted select-none">Read-Only</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Configuration Dialog */}
      {editingConfig && (
        <Dialog
          isOpen={Boolean(editingConfig)}
          onClose={() => setEditingConfig(null)}
          title={`Edit ${editingConfig.milestone_type.replace('_', ' ')} Points`}
          description="Update point values for this milestone. Changes will apply to all future awards; existing ledger entries remain permanently unchanged."
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="md" onClick={() => setEditingConfig(null)} disabled={isConfigPending}>
                Cancel
              </Button>
              <Button variant="primary" size="md" onClick={handleSaveConfig} disabled={isConfigPending}>
                {isConfigPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2">
            {configFeedback && (
              <Alert variant={configFeedback.success ? 'success' : 'error'}>{configFeedback.message}</Alert>
            )}
            <div>
              <label htmlFor="edit-regular-pts" className="block text-xs font-medium text-text-secondary mb-1">
                Regular Member Points (0 - 1000)
              </label>
              <Input
                id="edit-regular-pts"
                type="number"
                min="0"
                max="1000"
                value={editRegularPts}
                onChange={(e) => setEditRegularPts(parseInt(e.target.value || '0', 10))}
                disabled={isConfigPending}
              />
            </div>
            <div>
              <label htmlFor="edit-leader-pts" className="block text-xs font-medium text-text-secondary mb-1">
                Team Leader Points (0 - 1000)
              </label>
              <Input
                id="edit-leader-pts"
                type="number"
                min="0"
                max="1000"
                value={editLeaderPts}
                onChange={(e) => setEditLeaderPts(parseInt(e.target.value || '0', 10))}
                disabled={isConfigPending}
              />
            </div>
            <p className="text-[11px] text-text-muted">
              Note: Updating point values creates an immutable record in audit_logs.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
