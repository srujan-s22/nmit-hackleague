'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getExportPreviewAction } from '@/actions/report-actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  ADVANCED_DATASETS,
  CORE_DATASETS,
  CORE_DATASET_IDS,
  DATASET_GROUP_LABELS,
  EXPORT_FORMAT_OPTIONS,
  datasetAllowed,
  type DatasetDefinition,
  type ExportCapabilities,
  type ExportFormat,
} from '@/lib/reports/dataset-catalog';

interface ReportsClientProps {
  hackathons: { id: string; title: string }[];
  capabilities: ExportCapabilities;
}

type Counts = Record<string, number>;

const GROUP_ORDER = ['people', 'events', 'results', 'submissions'] as const;
const GLOBAL_SCOPE = '';

const numberFormat = new Intl.NumberFormat('en-IN');

export function ReportsClient({ hackathons, capabilities }: ReportsClientProps) {
  const canGlobal = capabilities.can_export_global;
  const [scope, setScope] = useState<string>(canGlobal ? GLOBAL_SCOPE : hackathons[0]?.id ?? '');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(CORE_DATASET_IDS));
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  // Counts are stored with the scope they were loaded for, so a scope change reads
  // as "loading" without resetting state inside the effect.
  const [countsState, setCountsState] = useState<{ scope: string; counts?: Counts; error?: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; title: string; text: string } | null>(null);
  const exportingRef = useRef(false);

  const advancedDatasets = useMemo(
    () => ADVANCED_DATASETS.filter((d) => datasetAllowed(d.id, capabilities)),
    [capabilities]
  );
  const visibleIds = useMemo(
    () => [...CORE_DATASET_IDS, ...advancedDatasets.map((d) => d.id)],
    [advancedDatasets]
  );

  const hasScope = canGlobal || scope !== '';
  const noExportableHackathons = !canGlobal && hackathons.length === 0;

  // Exact counts for the chosen scope (one request covers every visible dataset).
  useEffect(() => {
    if (!hasScope) return;
    let cancelled = false;
    getExportPreviewAction({ hackathonId: scope === GLOBAL_SCOPE ? null : scope, datasets: visibleIds }).then((res) => {
      if (cancelled) return;
      setCountsState(
        res.success && res.counts
          ? { scope, counts: res.counts }
          : { scope, error: res.error ?? 'Row counts are unavailable.' }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [scope, hasScope, visibleIds]);

  const current = countsState?.scope === scope ? countsState : null;
  const counts = current?.counts ?? null;
  const countsError = current?.error ?? null;

  const selectedIds = visibleIds.filter((id) => selected.has(id));
  const totalRows = counts ? selectedIds.reduce((sum, id) => sum + (counts[id] ?? 0), 0) : null;
  const allCoreSelected = CORE_DATASET_IDS.every((id) => selected.has(id));
  const csvInvalid = format === 'csv' && selectedIds.length !== 1;
  const canGenerate = hasScope && selectedIds.length > 0 && !csvInvalid && !isExporting;
  const scopeLabel =
    scope === GLOBAL_SCOPE ? 'Global Platform' : hackathons.find((h) => h.id === scope)?.title ?? 'Selected hackathon';

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleExport = async () => {
    if (exportingRef.current || !canGenerate) return;
    exportingRef.current = true;
    setIsExporting(true);
    setResult(null);

    try {
      const response = await fetch('/api/admin/reports/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasets: selectedIds,
          format,
          hackathonId: scope === GLOBAL_SCOPE ? null : scope,
        }),
      });

      if (!response.ok) {
        let message = 'The export could not be generated.';
        try {
          const body = (await response.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          if (response.status === 401 || response.redirected) message = 'Your session has expired. Please sign in again.';
        }
        setResult({ type: 'error', title: 'Export failed', text: message });
        return;
      }

      // Reading the body to the end is what proves delivery; a truncated or
      // interrupted stream throws here and is reported as a failure.
      const blob = await response.blob();
      const filename = response.headers.get('X-Export-Filename') ?? 'hackleague_export';
      let startCounts: Counts = {};
      try {
        startCounts = JSON.parse(response.headers.get('X-Export-Row-Counts') ?? '{}') as Counts;
      } catch {
        // counts are informational only
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);

      const rows = Object.values(startCounts).reduce((a, b) => a + b, 0);
      setResult({
        type: 'success',
        title: 'Export downloaded',
        text:
          rows === 0
            ? `${filename} — the selected datasets contain no rows for this scope (headers only).`
            : `${filename} — ${numberFormat.format(rows)} rows across ${Object.keys(startCounts).length} dataset${
                Object.keys(startCounts).length === 1 ? '' : 's'
              }, counted when the export started.`,
      });
    } catch {
      setResult({
        type: 'error',
        title: 'Export failed',
        text: 'The download was interrupted before it finished. No complete file was saved; please try again.',
      });
    } finally {
      exportingRef.current = false;
      setIsExporting(false);
    }
  };

  if (noExportableHackathons) {
    return (
      <div className="max-w-xl rounded-xl border border-border-subtle bg-surface-canvas p-8 text-center">
        <h2 className="text-base font-semibold text-text-primary">No hackathons available to export</h2>
        <p className="mt-2 text-sm text-text-secondary">
          You can export data only for hackathons you are assigned to. Ask a Super Administrator to assign you to a
          hackathon.
        </p>
      </div>
    );
  }

  const renderDataset = (ds: DatasetDefinition) => {
    const checked = selected.has(ds.id);
    const count = counts?.[ds.id];
    return (
      <label
        key={ds.id}
        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
          checked ? 'border-border-interactive bg-surface-subtle' : 'border-border-subtle hover:bg-surface-subtle/60'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(ds.id)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-surface-inverse,#111)]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-text-primary">{ds.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-text-helper" aria-label="row count">
              {count !== undefined ? `${numberFormat.format(count)} rows` : countsError ? '—' : '…'}
            </span>
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-text-helper">{ds.description}</span>
        </span>
      </label>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        {result && (
          <Alert variant={result.type === 'error' ? 'error' : 'success'} title={result.title}>
            {result.text}
          </Alert>
        )}

        <section className="rounded-xl border border-border-subtle bg-surface-canvas p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-text-primary">Event scope</h2>
          <p className="mt-1 text-xs text-text-secondary">
            {canGlobal
              ? 'Export across the whole platform or limit the export to one hackathon.'
              : 'You can export the hackathons you are assigned to.'}
          </p>
          <div className="mt-3 max-w-md">
            <label htmlFor="hackathon-scope" className="mb-1.5 block text-xs font-medium text-text-secondary">
              Target
            </label>
            <select
              id="hackathon-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              disabled={isExporting}
              className="w-full rounded-lg border border-border-subtle bg-surface-subtle px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-border-focus"
            >
              {canGlobal && <option value={GLOBAL_SCOPE}>Global Platform (all events)</option>}
              {hackathons.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="rounded-xl border border-border-subtle bg-surface-canvas p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Datasets</h2>
              <p className="mt-1 text-xs text-text-secondary">
                {selectedIds.length} of {visibleIds.length} selected
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={isExporting}
                onClick={() => setSelected(new Set(CORE_DATASET_IDS))}
              >
                Select all core datasets
              </Button>
              <Button variant="tertiary" size="sm" disabled={isExporting || selected.size === 0} onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          </div>
          {!allCoreSelected && selectedIds.length === 0 && (
            <p className="mt-3 text-xs text-text-helper">Select at least one dataset to export.</p>
          )}

          <div className="mt-4 space-y-5">
            {GROUP_ORDER.map((group) => (
              <div key={group}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-helper">
                  {DATASET_GROUP_LABELS[group]}
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {CORE_DATASETS.filter((d) => d.group === group).map((d) => renderDataset(d))}
                </div>
              </div>
            ))}

            {advancedDatasets.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-helper">
                  Advanced / System Data
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {advancedDatasets.map((d) => renderDataset(d))}
                </div>
                <p className="mt-2 text-xs text-text-helper">Not included in “Select all core datasets”.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <section className="space-y-4 rounded-xl border border-border-subtle bg-surface-canvas p-5 shadow-xs">
          <h2 className="text-sm font-semibold text-text-primary">Export summary</h2>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-text-secondary">Format</legend>
            <div className="space-y-2">
              {EXPORT_FORMAT_OPTIONS.map((opt) => {
                const disabled = isExporting || (opt.id === 'csv' && selectedIds.length !== 1);
                return (
                  <label
                    key={opt.id}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-sm ${
                      format === opt.id ? 'border-border-interactive bg-surface-subtle' : 'border-border-subtle'
                    } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  >
                    <input
                      type="radio"
                      name="export-format"
                      value={opt.id}
                      checked={format === opt.id}
                      disabled={disabled && format !== opt.id}
                      onChange={() => setFormat(opt.id)}
                      className="mt-0.5 accent-[var(--color-surface-inverse,#111)]"
                    />
                    <span>
                      <span className="block font-medium text-text-primary">{opt.label}</span>
                      <span className="block text-xs text-text-helper">{opt.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {selectedIds.length !== 1 && (
              <p className="mt-2 text-xs text-text-helper">Single CSV needs exactly one dataset selected.</p>
            )}
          </fieldset>

          <dl className="space-y-1.5 border-t border-border-subtle pt-4 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Scope</dt>
              <dd className="truncate text-right font-medium text-text-primary">{scopeLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Datasets</dt>
              <dd className="font-medium text-text-primary">{selectedIds.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Total rows</dt>
              <dd className="font-medium tabular-nums text-text-primary">
                {totalRows !== null ? numberFormat.format(totalRows) : countsError ? '—' : 'Counting…'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Student email / phone</dt>
              <dd className="font-medium text-text-primary">
                {capabilities.can_view_personal_data ? 'Included' : 'Not included'}
              </dd>
            </div>
          </dl>
          <p className="text-[11px] leading-snug text-text-helper">
            Row counts are exact when loaded and may change if records are added while you work. Cells starting with
            = + - @ are escaped against spreadsheet formula injection.
          </p>

          {countsError && (
            <Alert variant="warning" title="Counts unavailable">
              {countsError}
            </Alert>
          )}
          {csvInvalid && (
            <Alert variant="warning" title="Choose a different format">
              Single CSV can export only one dataset. Pick Excel or ZIP, or select one dataset.
            </Alert>
          )}

          <Button fullWidth isLoading={isExporting} disabled={!canGenerate} onClick={handleExport}>
            {isExporting ? 'Generating export…' : 'Generate Export'}
          </Button>
          {isExporting && (
            <p className="text-center text-xs text-text-helper">Large exports can take a minute. Keep this page open.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
