'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { ButtonLink } from '@/components/ui/button-link';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';

export default function ShowcasePage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [hasInputError, setHasInputError] = useState(false);
  const [checkboxChecked, setCheckboxChecked] = useState(true);
  const [alertDismissed, setAlertDismissed] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border-subtle gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/"
              className="text-xs font-medium text-text-secondary hover:text-text-primary transition-colors focus:outline-none focus:ring-1 focus:ring-border-focus rounded-xs"
            >
              ← Hub Home
            </Link>
            <span className="text-xs text-text-helper">/</span>
            <span className="text-xs font-semibold text-text-primary">Component Showcase</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            NMIT HackLeague Design System
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Institutional UI tokens, WCAG 2.1 AA accessible primitives, and branding components.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ButtonLink href="/preview/shells/student" variant="outline" size="sm">
            Student Shell Preview
          </ButtonLink>
          <ButtonLink href="/preview/shells/admin" variant="outline" size="sm">
            Admin Shell Preview
          </ButtonLink>
          <ButtonLink href="/preview/shells/super-admin" variant="outline" size="sm">
            Super Admin Shell Preview
          </ButtonLink>
        </div>
      </div>

      {/* 1. Official Branding Assets */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="text-lg font-bold text-text-primary">1. Official Branding Integration</h2>
          <span className="text-xs font-mono text-text-helper">public/nmit-logo.svg & public/Group 3.svg</span>
        </div>
        <p className="text-xs text-text-secondary leading-relaxed">
          Exclusively two official vector assets are rendered with precise native aspect ratios and accessible labels.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>NMIT Wordmark (Horizontal Banner)</CardTitle>
              <CardDescription>Native viewBox 0 0 669 63 (Aspect Ratio 10.62:1)</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 items-start">
              <div className="p-3 bg-surface-canvas border border-border-subtle rounded-sm w-full">
                <span className="text-[11px] text-text-helper block mb-1">Size LG (40px):</span>
                <BrandLogo asset="nmit" size="lg" />
              </div>
              <div className="p-3 bg-surface-canvas border border-border-subtle rounded-sm w-full">
                <span className="text-[11px] text-text-helper block mb-1">Size MD (32px):</span>
                <BrandLogo asset="nmit" size="md" />
              </div>
              <div className="p-3 bg-surface-canvas border border-border-subtle rounded-sm w-full">
                <span className="text-[11px] text-text-helper block mb-1">Size SM (24px):</span>
                <BrandLogo asset="nmit" size="sm" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>HackLeague Emblem</CardTitle>
              <CardDescription>Native viewBox 0 0 585 641 (Aspect Ratio 0.91:1)</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 items-start">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-[11px] text-text-helper block mb-1">Size LG (48px):</span>
                  <BrandLogo asset="hackleague" size="lg" />
                </div>
                <div>
                  <span className="text-[11px] text-text-helper block mb-1">Size MD (36px):</span>
                  <BrandLogo asset="hackleague" size="md" />
                </div>
                <div>
                  <span className="text-[11px] text-text-helper block mb-1">Size SM (28px):</span>
                  <BrandLogo asset="hackleague" size="sm" />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary mt-2">
                Framed in a subtle 1px container on white backgrounds to ensure crisp visual definition for neon mint.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dual Brand Lockup</CardTitle>
              <CardDescription>Combined emblem and institutional typography</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 items-start">
              <div className="p-4 bg-surface-canvas border border-border-subtle rounded-sm w-full">
                <span className="text-[11px] text-text-helper block mb-2">Light Surface:</span>
                <BrandLogo asset="combined" size="md" />
              </div>
              <div className="p-4 bg-surface-inverse rounded-sm w-full">
                <span className="text-[11px] text-neutral-400 block mb-2">Inverse Surface:</span>
                <BrandLogo asset="combined" size="md" variant="dark" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 2. Color Palette & Verified WCAG Contrast Ratios */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="text-lg font-bold text-text-primary">2. Institutional Design Tokens & WCAG Ratios</h2>
          <span className="text-xs font-mono text-text-helper">Tailwind v4 @theme tokens</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 rounded-md border border-border-subtle bg-surface-canvas shadow-xs">
            <div className="h-8 rounded-xs bg-surface-inverse mb-2" />
            <div className="text-xs font-bold text-text-primary">Primary Text</div>
            <div className="text-[11px] font-mono text-text-secondary">#252825 on #FFFFFF</div>
            <div className="text-[11px] font-semibold text-status-success-text mt-1">14.91 : 1 (AAA)</div>
          </div>

          <div className="p-3 rounded-md border border-border-subtle bg-surface-canvas shadow-xs">
            <div className="h-8 rounded-xs bg-text-secondary mb-2" />
            <div className="text-xs font-bold text-text-primary">Secondary Text</div>
            <div className="text-[11px] font-mono text-text-secondary">#575B56 on #FFFFFF</div>
            <div className="text-[11px] font-semibold text-status-success-text mt-1">6.92 : 1 (AA)</div>
          </div>

          <div className="p-3 rounded-md border border-border-subtle bg-surface-canvas shadow-xs">
            <div className="h-8 rounded-xs bg-text-helper mb-2" />
            <div className="text-xs font-bold text-text-primary">Helper / Placeholder</div>
            <div className="text-[11px] font-mono text-text-secondary">#5C635B on #FFFFFF</div>
            <div className="text-[11px] font-semibold text-status-success-text mt-1">6.19 : 1 (AA)</div>
          </div>

          <div className="p-3 rounded-md border border-border-subtle bg-surface-canvas shadow-xs">
            <div className="h-8 rounded-xs bg-border-interactive mb-2" />
            <div className="text-xs font-bold text-text-primary">Interactive Border</div>
            <div className="text-[11px] font-mono text-text-secondary">#858C82 on #FFFFFF</div>
            <div className="text-[11px] font-semibold text-status-success-text mt-1">3.46 : 1 (SC 1.4.11)</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 rounded-md border border-status-success-border bg-status-success-bg shadow-xs">
            <div className="text-xs font-bold text-status-success-text">Success Status</div>
            <div className="text-[11px] font-mono text-status-success-text">#1B5E20 on #E3F1E6</div>
            <div className="text-[11px] font-semibold text-status-success-text mt-1">6.74 : 1 (AA)</div>
          </div>

          <div className="p-3 rounded-md border border-status-error-border bg-status-error-bg shadow-xs">
            <div className="text-xs font-bold text-status-error-text">Error Status</div>
            <div className="text-[11px] font-mono text-status-error-text">#B71C1C on #F8E8E6</div>
            <div className="text-[11px] font-semibold text-status-error-text mt-1">5.53 : 1 (AA)</div>
          </div>

          <div className="p-3 rounded-md border border-status-warning-border bg-status-warning-bg shadow-xs">
            <div className="text-xs font-bold text-status-warning-text">Warning Status</div>
            <div className="text-[11px] font-mono text-status-warning-text">#7A5E00 on #FFF8E1</div>
            <div className="text-[11px] font-semibold text-status-warning-text mt-1">5.77 : 1 (AA)</div>
          </div>

          <div className="p-3 rounded-md border border-status-info-border bg-status-info-bg shadow-xs">
            <div className="text-xs font-bold text-status-info-text">Info Status</div>
            <div className="text-[11px] font-mono text-status-info-text">#1A56A2 on #E8F0FE</div>
            <div className="text-[11px] font-semibold text-status-info-text mt-1">6.33 : 1 (AA)</div>
          </div>
        </div>
      </section>

      {/* 3. Action Components: Buttons, ButtonLink, IconButton */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="text-lg font-bold text-text-primary">3. Action Primitives (Button vs. ButtonLink)</h2>
          <span className="text-xs font-mono text-text-helper">Semantic separation strictly enforced</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Button Variants & Sizes</CardTitle>
              <CardDescription>Strictly renders semantic button tag with 2px visible focus ring</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primary Action</Button>
                <Button variant="secondary">Secondary Action</Button>
                <Button variant="outline">Outline Action</Button>
                <Button variant="tertiary">Tertiary Action</Button>
                <Button variant="destructive">Destructive</Button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-subtle/50">
                <Button size="sm">Small (32px)</Button>
                <Button size="md">Medium (40px)</Button>
                <Button size="lg">Large (48px)</Button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border-subtle/50">
                <Button
                  isLoading={isButtonLoading}
                  onClick={() => {
                    setIsButtonLoading(true);
                    setTimeout(() => setIsButtonLoading(false), 1200);
                  }}
                >
                  {isButtonLoading ? 'Saving...' : 'Click to test loading'}
                </Button>
                <Button disabled>Disabled Action</Button>
                <IconButton
                  icon={
                    <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  }
                  aria-label="Add item"
                  variant="outline"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Semantic ButtonLink (Server Component)</CardTitle>
              <CardDescription>Strictly renders anchor tag wrapping Next.js Link</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-text-secondary leading-relaxed">
                Navigation triggers must use <code className="bg-surface-muted px-1 py-0.5 rounded-xs font-mono text-xs">ButtonLink</code> to ensure valid accessibility tree semantics (Link role vs Button role).
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href="/login" variant="primary">
                  Go to Login Page
                </ButtonLink>
                <ButtonLink href="/preview/shells/student" variant="outline">
                  Preview Student Shell
                </ButtonLink>
                <ButtonLink href="/" variant="tertiary">
                  Return Home
                </ButtonLink>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 4. Form Controls */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="text-lg font-bold text-text-primary">4. Form Control Primitives</h2>
          <span className="text-xs font-mono text-text-helper">aria-describedby and 3.46:1 borders</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Accessible Form Inputs</CardTitle>
            <CardDescription>Explicit htmlFor / id binding, helper text, and validation states</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <Input
                label="Full Student Name"
                placeholder="e.g. Aarav Sharma"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                helperText="Must match college admission records"
                required
              />

              <Input
                label="University Seat Number (USN)"
                placeholder="e.g. 1NT22CS001"
                error={hasInputError ? 'Invalid USN pattern. Expected 1NT[YY][BRANCH][XXX]' : undefined}
                helperText={!hasInputError ? 'Enter your official 10-character USN' : undefined}
                defaultValue="INVALID_USN"
              />

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setHasInputError((prev) => !prev)}
                  className="text-xs font-medium text-text-primary underline cursor-pointer"
                >
                  {hasInputError ? 'Clear input error demo' : 'Trigger input error demo'}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <Select
                label="Academic Branch"
                options={[
                  { label: 'Computer Science and Engineering', value: 'CSE' },
                  { label: 'Information Science and Engineering', value: 'ISE' },
                  { label: 'Electronics and Communication', value: 'ECE' },
                  { label: 'Artificial Intelligence & Data Science', value: 'AIDS' },
                ]}
                helperText="Select your primary enrolling department"
              />

              <Textarea
                label="Project Abstract"
                placeholder="Briefly describe your team solution..."
                helperText="Maximum 300 words"
                rows={3}
              />

              <Checkbox
                label="I confirm all submitted team members are current NMIT students"
                checked={checkboxChecked}
                onChange={(e) => setCheckboxChecked(e.target.checked)}
                helperText="False declarations will result in team disqualification"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 5. Status Badges & Alerts */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="text-lg font-bold text-text-primary">5. Feedback & Status Primitives</h2>
          <span className="text-xs font-mono text-text-helper">5 Badges & 4 Alert Banners</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Badge Status Indicators</CardTitle>
              <CardDescription>Server Component with optional dot indicator</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">Draft</Badge>
                <Badge variant="info">In Review</Badge>
                <Badge variant="warning">Action Needed</Badge>
                <Badge variant="success">Approved</Badge>
                <Badge variant="error">Rejected</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border-subtle/50">
                <Badge variant="neutral" dot>Neutral (Dot)</Badge>
                <Badge variant="info" dot>Live Round</Badge>
                <Badge variant="warning" dot>Pending Evaluation</Badge>
                <Badge variant="success" dot>Verified Team</Badge>
                <Badge variant="error" dot>Flagged</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inline Alerts</CardTitle>
              <CardDescription>Semantic banners with WCAG compliant colors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!alertDismissed ? (
                <Alert
                  variant="info"
                  title="Milestone Notice"
                  onClose={() => setAlertDismissed(true)}
                >
                  Round 1 submission window closes at 18:00 IST. Ensure GitHub links are public.
                </Alert>
              ) : (
                <button
                  type="button"
                  onClick={() => setAlertDismissed(false)}
                  className="text-xs text-text-primary underline cursor-pointer"
                >
                  Reset dismissed alert
                </button>
              )}

              <Alert variant="success" title="Verification Passed">
                Student USN 1NT22CS001 has been confirmed by institutional records.
              </Alert>

              <Alert variant="warning" title="Submission Review Required">
                3 team members have not confirmed attendance.
              </Alert>

              <Alert variant="error" title="Critical Policy Violation">
                Multiple active teams detected for the same participant.
              </Alert>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 6. Data Table & Skeletons */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="text-lg font-bold text-text-primary">6. Tabular Data & Loading Skeletons</h2>
          <span className="text-xs font-mono text-text-helper">Horizontal scroll wrapper with subtle row styling</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Hackathon Teams [Demo Presentation]</CardTitle>
            <CardDescription>Responsive table with horizontal scroll encapsulation</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Identifier</TableHead>
                  <TableHead>Track / Domain</TableHead>
                  <TableHead>Leader USN</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Team CodeCraft</TableCell>
                  <TableCell>AI & Autonomous Systems</TableCell>
                  <TableCell className="font-mono text-xs">1NT22CS045</TableCell>
                  <TableCell>
                    <Badge variant="success" dot>Verified</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Inspect</Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Binary Brigade</TableCell>
                  <TableCell>Cybersecurity & Forensics</TableCell>
                  <TableCell className="font-mono text-xs">1NT22IS012</TableCell>
                  <TableCell>
                    <Badge variant="warning" dot>Pending ID</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Inspect</Button>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Quantum Solvers</TableCell>
                  <TableCell>Smart City IoT</TableCell>
                  <TableCell className="font-mono text-xs">1NT22EC088</TableCell>
                  <TableCell>
                    <Badge variant="info" dot>In Review</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Inspect</Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Empty State Pattern</CardTitle>
              <CardDescription>Clean feedback when data queries return zero records</CardDescription>
            </CardHeader>
            <CardContent>
              <EmptyState
                title="No Active Submissions Found"
                description="Your team has not uploaded any project artifacts for the current milestone yet."
                action={
                  <Button variant="primary" size="sm">
                    Upload Milestone Artifacts
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Skeleton Placeholders</CardTitle>
              <CardDescription>Pulsing loading placeholders for asynchronous data fetching</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton variant="circular" className="w-10 h-10" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton variant="text" className="w-3/4" />
                  <Skeleton variant="text" className="w-1/2" />
                </div>
              </div>
              <Skeleton variant="rectangular" className="h-20 w-full" />
              <div className="space-y-1.5">
                <Skeleton variant="text" className="w-full" />
                <Skeleton variant="text" className="w-5/6" />
                <Skeleton variant="text" className="w-2/3" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 7. Native Modal Dialog */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-border-subtle pb-2">
          <h2 className="text-lg font-bold text-text-primary">7. Accessible Native HTML Dialog Primitive</h2>
          <span className="text-xs font-mono text-text-helper">showModal(), Escape handling, focus trapping</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Interactive Native Modal</CardTitle>
            <CardDescription>
              Built using the standard HTML5 dialog element. Handles focus trapping, Escape key dismissal, and backdrop blurring natively.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <Button
              variant="primary"
              onClick={() => setIsDialogOpen(true)}
            >
              Open Native Dialog Demo
            </Button>
            <p className="text-xs text-text-secondary">
              Notice: Pressing <kbd className="px-1 py-0.5 rounded-xs bg-surface-muted border border-border-subtle font-mono text-[11px]">Escape</kbd> or clicking outside the modal will dismiss it and restore keyboard focus to the trigger button.
            </p>
          </CardContent>
        </Card>

        <Dialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          title="Confirm Team Milestone Submission"
          description="NMIT HackLeague Institutional Evaluation Gate — Round 01"
          footer={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsDialogOpen(false)}
              >
                Confirm Submission
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-text-primary">
              Are you sure you want to finalize your team submission for <span className="font-semibold">Round 1: Architecture Review</span>?
            </p>
            <div className="p-3 bg-surface-subtle border border-border-subtle rounded-sm text-xs text-text-secondary space-y-1">
              <div><span className="font-medium text-text-primary">Team:</span> CodeCraft (CSE)</div>
              <div><span className="font-medium text-text-primary">Artifact:</span> GitHub Repository + Architecture Diagram</div>
              <div><span className="font-medium text-text-primary">Timestamp:</span> Recorded via institutional ledger</div>
            </div>
            <p className="text-xs text-text-helper">
              Once submitted, you will not be able to modify file uploads until the evaluation panel concludes scoring.
            </p>
          </div>
        </Dialog>
      </section>
    </div>
  );
}
