import React from 'react';
import type { Metadata } from 'next';
import { AdminShell } from '@/components/shells/admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Admin Workspace Preview — NMIT HackLeague',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminShellPreviewPage() {
  return (
    <AdminShell currentPath="/preview/shells/admin">
      <div className="space-y-6">
        <Alert variant="info" title="Administrator Workspace Preview">
          Demonstration of the Club Administrator shell. Features event operations overview, metric indicators, and tabular registration review.
        </Alert>

        <PageHeader
          title="Event Management & Operations"
          description="Manage departmental hackathons, review participant credentials, and monitor judging progress."
          breadcrumbs={[
            { label: 'Portal Hub', href: '/' },
            { label: 'Admin Workspace', href: '/preview/shells/admin' },
            { label: 'Event Operations' },
          ]}
          actions={
            <>
              <Button variant="outline" size="sm">
                Export Attendance Roster
              </Button>
              <Button variant="primary" size="sm">
                Create New Event
              </Button>
            </>
          }
        />

        {/* Operational Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-text-helper font-medium">Registered Teams</span>
              <div className="text-2xl font-bold text-text-primary mt-1">48</div>
              <span className="text-[11px] text-status-success-text font-medium mt-1 inline-block">
                ↑ 12 from yesterday
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-text-helper font-medium">Pending Verifications</span>
              <div className="text-2xl font-bold text-status-warning-text mt-1">14</div>
              <span className="text-[11px] text-text-secondary mt-1 inline-block">
                Requires ID card sign-off
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-text-helper font-medium">Round 1 Submissions</span>
              <div className="text-2xl font-bold text-text-primary mt-1">32</div>
              <span className="text-[11px] text-text-secondary mt-1 inline-block">
                66% completion rate
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-text-helper font-medium">Evaluations Completed</span>
              <div className="text-2xl font-bold text-text-primary mt-1">18 / 32</div>
              <span className="text-[11px] text-status-info-text font-medium mt-1 inline-block">
                Jury panel active
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Data Table: Registration & Evaluation Review */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle>Team Registration & Judging Queue [Demo Workspace]</CardTitle>
                <CardDescription>Live status of participant teams for HackSphere 2026</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">Filter by Track</Button>
                <Button variant="outline" size="sm">Bulk Approve</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team Name</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead>Leader</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Verification</TableHead>
                  <TableHead>Judging Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Team CodeCraft</TableCell>
                  <TableCell>AI & Autonomous Systems</TableCell>
                  <TableCell className="text-xs font-mono">1NT22CS045</TableCell>
                  <TableCell>4 / 4 Verified</TableCell>
                  <TableCell>
                    <Badge variant="success" dot>Approved</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="info">Scored (88/100)</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Review</Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Binary Brigade</TableCell>
                  <TableCell>Cybersecurity & Forensics</TableCell>
                  <TableCell className="text-xs font-mono">1NT22IS012</TableCell>
                  <TableCell>3 / 4 Verified</TableCell>
                  <TableCell>
                    <Badge variant="warning" dot>Pending ID</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">Not Submitted</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Verify</Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Quantum Solvers</TableCell>
                  <TableCell>Smart City IoT</TableCell>
                  <TableCell className="text-xs font-mono">1NT22EC088</TableCell>
                  <TableCell>4 / 4 Verified</TableCell>
                  <TableCell>
                    <Badge variant="success" dot>Approved</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="warning">In Evaluation</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Review</Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">Neural Nexus</TableCell>
                  <TableCell>Healthcare & BioTech</TableCell>
                  <TableCell className="text-xs font-mono">1NT22AI034</TableCell>
                  <TableCell>4 / 4 Verified</TableCell>
                  <TableCell>
                    <Badge variant="success" dot>Approved</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="info">Scored (92/100)</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Review</Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="font-medium">HyperLoopers</TableCell>
                  <TableCell>CleanTech & Energy</TableCell>
                  <TableCell className="text-xs font-mono">1NT22ME009</TableCell>
                  <TableCell>2 / 4 Verified</TableCell>
                  <TableCell>
                    <Badge variant="error" dot>Discrepancy</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="neutral">Hold</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="destructive" size="sm">Resolve</Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
