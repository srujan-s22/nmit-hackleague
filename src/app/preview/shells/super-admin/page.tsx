import React from 'react';
import type { Metadata } from 'next';
import { SuperAdminShell } from '@/components/shells/super-admin-shell';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = {
  title: 'Super Admin Workspace Preview — NMIT HackLeague',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SuperAdminShellPreviewPage() {
  return (
    <SuperAdminShell currentPath="/preview/shells/super-admin">
      <div className="space-y-6">
        <Alert variant="warning" title="Institutional Super Admin Workspace Preview">
          Demonstration of college-level governance controls, system audit log presentation, and platform policies.
        </Alert>

        <PageHeader
          title="Institutional Governance & Overview"
          description="High-level authority controls across all NMIT academic departments, hackathon chapters, and security policies."
          breadcrumbs={[
            { label: 'Portal Hub', href: '/' },
            { label: 'Super Admin Workspace', href: '/preview/shells/super-admin' },
            { label: 'Governance Overview' },
          ]}
          actions={
            <>
              <Button variant="outline" size="sm">
                Download Audit Archive
              </Button>
              <Button variant="primary" size="sm">
                Manage System Policies
              </Button>
            </>
          }
        />

        {/* System-Wide Institutional Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-text-helper font-medium">Verified Students</span>
              <div className="text-2xl font-bold text-text-primary mt-1">1,420</div>
              <span className="text-[11px] text-text-secondary mt-1 inline-block">
                Across 8 Engineering Branches
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-text-helper font-medium">Active Club Chapters</span>
              <div className="text-2xl font-bold text-text-primary mt-1">8 / 8</div>
              <span className="text-[11px] text-status-success-text font-medium mt-1 inline-block">
                100% faculty supervised
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-text-helper font-medium">Audit Integrity Status</span>
              <div className="text-2xl font-bold text-status-success-text mt-1">Pass</div>
              <span className="text-[11px] text-text-secondary mt-1 inline-block">
                Zero security anomalies
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <span className="text-xs text-text-helper font-medium">Storage Quota</span>
              <div className="text-2xl font-bold text-text-primary mt-1">3.2 / 50 GB</div>
              <span className="text-[11px] text-text-secondary mt-1 inline-block">
                Artifacts & submission storage
              </span>
            </CardContent>
          </Card>
        </div>

        {/* System Audit Log Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle>System Audit Log & Authorization Trail [Demo Workspace]</CardTitle>
                <CardDescription>Immutable record of administrative actions and role mutations</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">Filter by Action</Button>
                <Button variant="outline" size="sm">Security Summary</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Initiator (Identity)</TableHead>
                  <TableHead>Action Category</TableHead>
                  <TableHead>Target Entity</TableHead>
                  <TableHead>Integrity Check</TableHead>
                  <TableHead className="text-right">Inspection</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-xs font-mono text-text-secondary">2026-10-12 07:15:02</TableCell>
                  <TableCell className="font-medium text-xs">Principal Office (Dr. H.C.N.)</TableCell>
                  <TableCell>
                    <Badge variant="info">Policy Update</Badge>
                  </TableCell>
                  <TableCell className="text-xs">Academic Eligibility Rules (CGPA &gt;= 6.0)</TableCell>
                  <TableCell>
                    <Badge variant="success" dot>Signed</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Details</Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="text-xs font-mono text-text-secondary">2026-10-12 06:44:19</TableCell>
                  <TableCell className="font-medium text-xs">Prof. Divya K. (ISE)</TableCell>
                  <TableCell>
                    <Badge variant="neutral">Batch Approval</Badge>
                  </TableCell>
                  <TableCell className="text-xs">12 Participant Registrations Verified</TableCell>
                  <TableCell>
                    <Badge variant="success" dot>Signed</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Details</Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="text-xs font-mono text-text-secondary">2026-10-11 19:30:45</TableCell>
                  <TableCell className="font-medium text-xs">System Governance Daemon</TableCell>
                  <TableCell>
                    <Badge variant="warning">Access Review</Badge>
                  </TableCell>
                  <TableCell className="text-xs">Automated session timeout enforcement</TableCell>
                  <TableCell>
                    <Badge variant="success" dot>Signed</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Details</Button>
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="text-xs font-mono text-text-secondary">2026-10-11 16:12:10</TableCell>
                  <TableCell className="font-medium text-xs">Prof. Ramesh M. (CSE)</TableCell>
                  <TableCell>
                    <Badge variant="info">Event Publish</Badge>
                  </TableCell>
                  <TableCell className="text-xs">HackSphere 2026 Round Schedule Activated</TableCell>
                  <TableCell>
                    <Badge variant="success" dot>Signed</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm">Details</Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </SuperAdminShell>
  );
}
