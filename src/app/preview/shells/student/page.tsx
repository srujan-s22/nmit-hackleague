import React from 'react';
import type { Metadata } from 'next';
import { StudentShell } from '@/components/shells/student-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Student Workspace Preview — NMIT HackLeague',
  robots: {
    index: false,
    follow: false,
  },
};

export default function StudentShellPreviewPage() {
  return (
    <StudentShell currentPath="/preview/shells/student">
      <div className="space-y-6">
        <Alert variant="info" title="Student Workspace Preview">
          Demonstration of the student participant layout shell. Navigation items, responsive drawer, and card grids represent the Phase 2 UI baseline.
        </Alert>

        <PageHeader
          title="My Hackathons"
          description="View registered events, track milestone deadlines, and collaborate with your team."
          breadcrumbs={[
            { label: 'Portal Hub', href: '/' },
            { label: 'Student Workspace', href: '/preview/shells/student' },
            { label: 'My Hackathons' },
          ]}
          actions={
            <Button variant="primary" size="sm">
              Register for New Event
            </Button>
          }
        />

        {/* Active Events Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between mb-1">
                <Badge variant="success" dot>Live Round Active</Badge>
                <span className="text-[11px] font-mono text-text-helper">CODE: NMIT-2026-H1</span>
              </div>
              <CardTitle>NMIT Inter-Collegiate HackSphere 2026</CardTitle>
              <CardDescription>Department of Computer Science & Engineering</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-text-secondary space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-helper">Registered Team:</span>
                  <span className="font-medium text-text-primary">Team CodeCraft</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-helper">Current Milestone:</span>
                  <span className="font-medium text-text-primary">Round 1 Architecture</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-helper">Deadline:</span>
                  <span className="font-medium text-text-primary">Tomorrow, 18:00 IST</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="pt-2">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-text-helper">Progress</span>
                  <span className="font-semibold text-text-primary">60%</span>
                </div>
                <div className="h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                  <div className="h-full bg-surface-inverse rounded-full w-3/5" />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" fullWidth>
                Submit Milestone
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between mb-1">
                <Badge variant="warning" dot>Verification Pending</Badge>
                <span className="text-[11px] font-mono text-text-helper">CODE: AI-INNOV-04</span>
              </div>
              <CardTitle>AI Innovation Summit Hackathon</CardTitle>
              <CardDescription>Department of Information Science & Engineering</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-text-secondary space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-helper">Registered Team:</span>
                  <span className="font-medium text-text-primary">Binary Brigade</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-helper">Status:</span>
                  <span className="font-medium text-status-warning-text">Awaiting ID Approval</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-helper">Starts:</span>
                  <span className="font-medium text-text-primary">Next Saturday, 09:00 IST</span>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-text-helper">Progress</span>
                  <span className="font-semibold text-text-primary">15%</span>
                </div>
                <div className="h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                  <div className="h-full bg-status-warning-text rounded-full w-[15%]" />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" fullWidth>
                View Registration Details
              </Button>
            </CardFooter>
          </Card>

          <Card variant="subtle">
            <CardHeader>
              <div className="flex items-center justify-between mb-1">
                <Badge variant="neutral">Upcoming</Badge>
                <span className="text-[11px] font-mono text-text-helper">CODE: IOT-SPRINT-02</span>
              </div>
              <CardTitle>Smart Campus IoT Sprint</CardTitle>
              <CardDescription>Department of Electronics & Communication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                Registration opens soon for 2nd and 3rd year students. Build smart campus automation devices.
              </p>
              <div className="text-xs text-text-secondary space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-helper">Registration Window:</span>
                  <span className="font-medium text-text-primary">Opens in 5 days</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="secondary" size="sm" fullWidth>
                Notify Me When Open
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Milestone Progression Table Demo */}
        <div className="pt-4">
          <h2 className="text-base font-semibold text-text-primary mb-3">
            Milestone Progression [Demonstration Overview]
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border-subtle text-xs">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-status-success-bg text-status-success-text font-bold flex items-center justify-center">
                      ✓
                    </span>
                    <div>
                      <div className="font-semibold text-text-primary text-sm">Milestone 0: Team Formation & Registration</div>
                      <div className="text-text-secondary">4 of 4 members verified via institutional portal</div>
                    </div>
                  </div>
                  <Badge variant="success">Completed</Badge>
                </div>

                <div className="p-4 flex items-center justify-between bg-surface-subtle/40">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-surface-inverse text-text-inverse font-bold flex items-center justify-center">
                      1
                    </span>
                    <div>
                      <div className="font-semibold text-text-primary text-sm">Milestone 1: Architecture & GitHub Submission</div>
                      <div className="text-text-secondary">Upload diagram and public repository URL</div>
                    </div>
                  </div>
                  <Badge variant="info" dot>Active Now</Badge>
                </div>

                <div className="p-4 flex items-center justify-between opacity-60">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-surface-muted text-text-disabled font-bold flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <div className="font-semibold text-text-primary text-sm">Milestone 2: Final Working Prototype & Jury Evaluation</div>
                      <div className="text-text-secondary">Live presentation in CSE Auditorium</div>
                    </div>
                  </div>
                  <Badge variant="neutral">Upcoming</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </StudentShell>
  );
}
