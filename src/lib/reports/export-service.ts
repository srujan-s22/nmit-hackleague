import {
  getDatasetColumns,
  getDatasetDefinition,
  type ExportCapabilities,
  type ExportFormat,
} from '@/lib/reports/dataset-catalog';
import {
  createXlsxStream,
  createZipStream,
  csvChunks,
  type StreamDataset,
} from '@/lib/reports/export-generators';

/** Rows requested per RPC page. 1000 is also PostgREST's default response cap. */
export const EXPORT_PAGE_SIZE = 1000;
/** Per-dataset safety ceiling. Exceeding it fails the export loudly, never truncates. */
export const EXPORT_MAX_ROWS_PER_DATASET = 250_000;

export type ExportFailureCategory =
  | 'permission_denied'
  | 'invalid_request'
  | 'query_failed'
  | 'too_large'
  | 'generation_failed'
  | 'delivery_interrupted'
  | 'audit_failed';

export class ExportError extends Error {
  constructor(
    public readonly category: ExportFailureCategory,
    message: string
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export interface RpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** The slice of a Supabase client the export path needs. */
export interface ExportRpcClient {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
}

/**
 * Maps a database error to an export failure. Authorization / validation messages
 * come from our own RPCs and are safe to show; anything else is reported generically.
 */
export function toExportError(error: { message: string; code?: string }): ExportError {
  if (error.code === '42501') return new ExportError('permission_denied', error.message);
  if (error.code === '22023' || error.code === 'P0002') {
    return new ExportError('invalid_request', error.message);
  }
  // Server log only (no row data): lets operators spot e.g. an unapplied migration (PGRST202).
  console.error('[reports] export RPC failed', { code: error.code, message: error.message });
  return new ExportError('query_failed', 'The export query failed. Please try again.');
}

export async function fetchExportCapabilities(client: ExportRpcClient): Promise<ExportCapabilities> {
  const { data, error } = await client.rpc('get_export_capabilities');
  if (error) throw toExportError(error);
  return data as ExportCapabilities;
}

export interface ExportableHackathon {
  id: string;
  title: string;
  slug: string;
  status: string;
}

export async function fetchExportableHackathons(client: ExportRpcClient): Promise<ExportableHackathon[]> {
  const { data, error } = await client.rpc('get_exportable_hackathons');
  if (error) throw toExportError(error);
  return (data as ExportableHackathon[] | null) ?? [];
}

export async function fetchDatasetCounts(
  client: ExportRpcClient,
  hackathonId: string | null,
  datasets: string[]
): Promise<Record<string, number>> {
  const { data, error } = await client.rpc('get_export_dataset_counts', {
    p_hackathon_id: hackathonId,
    p_datasets: datasets,
  });
  if (error) throw toExportError(error);
  return (data as Record<string, number>) ?? {};
}

/** Running tally of rows actually read per dataset (becomes the audit row_counts). */
export type RowTally = Record<string, number>;

/**
 * Streams every row of one dataset, page by page, using keyset pagination.
 *
 * - Pages continue strictly after the previous page's last row id, so rows can
 *   neither be skipped nor repeated even if data changes during the export.
 * - The loop ends only on an EMPTY page, not a short one: if the API ever caps a
 *   response below the requested page size, a short page must not be mistaken
 *   for the end (that would silently truncate the export).
 * - A cursor that fails to advance, or a dataset beyond the safety ceiling,
 *   aborts the export with an error.
 */
export async function* iterateDatasetRows(
  client: ExportRpcClient,
  datasetId: string,
  hackathonId: string | null,
  tally: RowTally
): AsyncGenerator<Record<string, unknown>> {
  tally[datasetId] = 0;
  let after: string | null = null;

  for (;;) {
    const { data, error } = await client.rpc('export_dataset_page', {
      p_dataset: datasetId,
      p_hackathon_id: hackathonId,
      p_after: after,
      p_limit: EXPORT_PAGE_SIZE,
    });
    if (error) throw toExportError(error);

    const page = (data as { row_id: string; data: Record<string, unknown> }[] | null) ?? [];
    if (page.length === 0) return;

    for (const item of page) {
      if (after !== null && item.row_id <= after) {
        throw new ExportError('query_failed', 'The export query returned rows out of order.');
      }
      after = item.row_id;
      tally[datasetId] += 1;
      if (tally[datasetId] > EXPORT_MAX_ROWS_PER_DATASET) {
        throw new ExportError(
          'too_large',
          `The ${datasetId} dataset exceeds the ${EXPORT_MAX_ROWS_PER_DATASET.toLocaleString('en-IN')} row export limit. Narrow the scope to a single hackathon.`
        );
      }
      yield item.data;
    }
  }
}

export interface ExportPackageOptions {
  client: ExportRpcClient;
  datasets: string[];
  format: ExportFormat;
  hackathonId: string | null;
  canViewPersonalData: boolean;
}

export interface ExportPackage {
  /** Binary output stream (Node Readable of Buffers). */
  stream: AsyncIterable<Uint8Array>;
  mimeType: string;
  extension: 'xlsx' | 'zip' | 'csv';
  /** Rows read so far per dataset; final once the stream has ended. */
  tally: RowTally;
}

export function createExportPackage(options: ExportPackageOptions): ExportPackage {
  const { client, datasets, format, hackathonId, canViewPersonalData } = options;
  const tally: RowTally = {};

  const sources: StreamDataset[] = datasets.map((id) => {
    const def = getDatasetDefinition(id);
    if (!def) throw new ExportError('invalid_request', `Invalid export dataset: ${id}.`);
    return {
      sheetName: def.sheetName,
      fileName: def.fileName,
      columns: getDatasetColumns(id, canViewPersonalData),
      rows: iterateDatasetRows(client, id, hackathonId, tally),
    };
  });

  if (format === 'xlsx') {
    return {
      stream: createXlsxStream(sources),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
      tally,
    };
  }

  if (format === 'zip') {
    return { stream: createZipStream(sources), mimeType: 'application/zip', extension: 'zip', tally };
  }

  if (sources.length !== 1) {
    throw new ExportError('invalid_request', 'CSV export requires exactly one dataset. Use Excel or ZIP for several.');
  }
  const [only] = sources;
  return {
    stream: (async function* () {
      for await (const chunk of csvChunks(only.columns, only.rows)) {
        yield Buffer.from(chunk, 'utf-8');
      }
    })(),
    mimeType: 'text/csv; charset=utf-8',
    extension: 'csv',
    tally,
  };
}

/** Lowercase ascii slug for filenames. */
export function slugifyForFilename(value: string, fallback = 'export'): string {
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export function buildExportFilename(params: {
  scopeSlug: string | null;
  datasets: string[];
  extension: string;
  now?: Date;
}): string {
  const date = (params.now ?? new Date()).toISOString().slice(0, 10);
  const scope = slugifyForFilename(params.scopeSlug ?? 'global', 'global');
  const what =
    params.datasets.length === 1
      ? slugifyForFilename(getDatasetDefinition(params.datasets[0])?.fileName ?? params.datasets[0], 'dataset')
      : `${params.datasets.length}-datasets`;
  return `hackleague_${scope}_${what}_${date}.${params.extension}`;
}
