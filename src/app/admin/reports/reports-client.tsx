'use client';

import React, { useState } from 'react';
import { exportReportAction, type ExportReportParams } from '@/actions/report-actions';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';

interface ReportsClientProps {
  hackathons: { id: string; title: string }[];
  isSuperAdmin: boolean;
  canViewAuditLogs?: boolean;
}

const ALL_DATASETS = [
  { id: 'all', label: 'All Datasets (Master Workbook & Complete Package)', description: 'Exports all 9 authoritative sheets across the event lifecycle.' },
  { id: 'students', label: 'Students', description: 'Student rosters, USNs, verification statuses, and contact information.' },
  { id: 'hackathons', label: 'Hackathons', description: 'Event configurations, rules, schedules, and team size boundaries.' },
  { id: 'teams', label: 'Teams', description: 'Team names, leader IDs, and internal/external statuses.' },
  { id: 'team_members', label: 'Team Members', description: 'Individual student team memberships and joined timestamps.' },
  { id: 'registrations', label: 'Registrations', description: 'Registration verification claims, proof paths, and CDC acceptance.' },
  { id: 'round_results', label: 'Round Results', description: 'Stage qualification determinations, rankings, and notes.' },
  { id: 'points', label: 'Points', description: 'Institutional leaderboard points, participation credits, and reasons.' },
  { id: 'winners', label: 'Winners', description: 'Final podium placements, ranks, and winning team awards.' },
  { id: 'hackathon_summary', label: 'Hackathon Summary', description: 'Executive event summary with team, registration, and point aggregates.' },
  { id: 'submissions', label: 'Submissions', description: 'Submitted artifacts, storage paths, and SHA256 integrity hashes.' },
  { id: 'reviews', label: 'Reviews', description: 'Admin evaluator decisions, rubrics, scores, and feedback notes.' },
  { id: 'audit_logs', label: 'Audit Logs', description: 'Security and administrative audit trail with actor IDs and timestamps.' },
  { id: 'storage_objects', label: 'Storage Retention Queue', description: 'Scheduled deletions, college ID purges, and artifact lifecycle jobs.' },
  { id: 'profile_change_requests', label: 'Profile Correction Requests', description: 'Student profile correction submissions, field changes, and administrative decisions.' },
] as const;

export function ReportsClient({ hackathons, isSuperAdmin, canViewAuditLogs = false }: ReportsClientProps) {
  const availableDatasets = ALL_DATASETS.filter(
    (ds) => ds.id !== 'audit_logs' || canViewAuditLogs
  );

  const [selectedHackathon, setSelectedHackathon] = useState<string>(
    hackathons.length > 0 ? hackathons[0].id : ''
  );
  const [selectedDataset, setSelectedDataset] = useState<string>('all');
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExport = async (format: 'csv' | 'xlsx' | 'zip') => {
    setIsExporting(format);
    setStatusMessage(null);

    try {
      const res = await exportReportAction({
        dataset: selectedDataset as ExportReportParams['dataset'],
        format,
        hackathonId: selectedHackathon || null,
      });

      if (!res.success || !res.base64 || !res.filename) {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to generate report export.',
        });
        setIsExporting(null);
        return;
      }

      // Trigger client-side file download
      const link = document.createElement('a');
      link.href = `data:${res.mimeType || 'application/octet-stream'};base64,${res.base64}`;
      link.download = res.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setStatusMessage({
        type: 'success',
        text: `Export downloaded successfully: ${res.filename}`,
      });
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'An error occurred during export.',
      });
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {statusMessage && (
        <Alert
          variant={statusMessage.type === 'error' ? 'error' : 'success'}
          title={statusMessage.type === 'error' ? 'Export Failed' : 'Export Ready'}
        >
          {statusMessage.text}
        </Alert>
      )}

      {/* Scope Configuration */}
      <div className="bg-surface-canvas border border-border-subtle rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-text-primary">1. Select Event Scope</h2>
        <p className="text-xs text-text-secondary">
          {isSuperAdmin
            ? 'Super Administrators have global export access or may scope exports to a specific hackathon.'
            : 'You are viewing hackathons assigned to your administrative portfolio. Exports are restricted to your scope.'}
        </p>

        <div className="max-w-md">
          <label htmlFor="hackathon-scope" className="block text-xs font-medium text-text-secondary mb-1.5">
            Target Hackathon
          </label>
          <select
            id="hackathon-scope"
            value={selectedHackathon}
            onChange={(e) => setSelectedHackathon(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-surface-muted/50 border border-border-subtle rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
          >
            {isSuperAdmin && <option value="">Global / All Hackathons</option>}
            {hackathons.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dataset Selection */}
      <div className="bg-surface-canvas border border-border-subtle rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-text-primary">2. Select Dataset</h2>
        <p className="text-xs text-text-secondary">
          Choose a specific operational dataset, or select All Datasets for comprehensive multi-sheet workbooks and archives.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {availableDatasets.map((ds) => (
            <label
              key={ds.id}
              className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                selectedDataset === ds.id
                  ? 'border-accent-primary bg-accent-primary/5 shadow-xs'
                  : 'border-border-subtle hover:bg-surface-muted/40'
              }`}
            >
              <input
                type="radio"
                name="dataset"
                value={ds.id}
                checked={selectedDataset === ds.id}
                onChange={() => setSelectedDataset(ds.id)}
                className="mt-1 text-accent-primary focus:ring-accent-primary"
              />
              <div>
                <span className="block text-xs font-semibold text-text-primary">{ds.label}</span>
                <span className="block text-[11px] text-text-helper leading-snug mt-0.5">{ds.description}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Format & Execution */}
      <div className="bg-surface-canvas border border-border-subtle rounded-xl p-6 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-text-primary">3. Choose Export Format</h2>
        <p className="text-xs text-text-secondary">
          All exports are automatically sanitized against Spreadsheet Formula Injection (cells starting with =, +, -, @ are escaped).
        </p>

        <div className="flex flex-wrap gap-4 pt-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => handleExport('xlsx')}
            disabled={Boolean(isExporting)}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            {isExporting === 'xlsx' ? 'Generating Excel...' : 'Excel Workbook (.xlsx)'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => handleExport('zip')}
            disabled={Boolean(isExporting)}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {isExporting === 'zip' ? 'Packaging ZIP...' : 'Complete CSV Package (.zip)'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={() => handleExport('csv')}
            disabled={Boolean(isExporting) || selectedDataset === 'all'}
            className="flex items-center gap-2"
          >
            <svg className="w-4 h-4 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            {isExporting === 'csv' ? 'Exporting CSV...' : 'Single CSV (.csv)'}
          </Button>
        </div>

        {selectedDataset === 'all' && (
          <p className="text-[11px] text-text-helper italic">
            * Note: Single CSV format requires selecting an individual dataset. Use Excel (.xlsx) or ZIP archive to export all datasets together.
          </p>
        )}
      </div>
    </div>
  );
}
