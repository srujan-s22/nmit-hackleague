import { exportRequestSchema } from '@/lib/validation/export-schemas';
import { datasetAllowed, getDatasetDefinition } from '@/lib/reports/dataset-catalog';
import {
  ExportError,
  buildExportFilename,
  createExportPackage,
  fetchDatasetCounts,
  fetchExportCapabilities,
  fetchExportableHackathons,
  type ExportFailureCategory,
  type ExportRpcClient,
} from '@/lib/reports/export-service';

/** The slice of a Supabase client the handler needs (user session client, never service-role). */
export interface ExportRouteClient extends ExportRpcClient {
  auth: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> };
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function statusFor(category: ExportFailureCategory): number {
  switch (category) {
    case 'permission_denied':
      return 403;
    case 'invalid_request':
      return 400;
    case 'too_large':
      return 413;
    default:
      return 500;
  }
}

/** Same-origin guard for this cookie-authenticated POST endpoint. */
function isCrossSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Terminal audit entry. A failure to write it is logged (without data) and, on the
 * success path, fails the export, so a download is never delivered unaudited.
 */
async function recordExport(
  client: ExportRpcClient,
  args: {
    datasets: string[];
    format: string;
    hackathonId: string | null;
    outcome: 'success' | 'failed';
    rowCounts: Record<string, number>;
    failureCategory?: ExportFailureCategory;
  }
): Promise<void> {
  const { error } = await client.rpc('record_data_export', {
    p_datasets: args.datasets,
    p_format: args.format,
    p_hackathon_id: args.hackathonId,
    p_outcome: args.outcome,
    p_row_counts: args.rowCounts,
    p_failure_category: args.failureCategory ?? null,
  });
  if (error) {
    console.error('[reports] failed to write export audit entry', { outcome: args.outcome, code: error.code });
    throw new ExportError('audit_failed', 'The export could not be audited, so it was not delivered.');
  }
}

/**
 * Holds back the final chunk until `beforeLast` succeeds. The last chunk of a
 * workbook / ZIP / CSV carries the file's closing structure, so withholding it
 * means a failed audit write yields an unusable file and a failed download.
 */
async function* gateFinalChunk(
  source: AsyncIterable<Uint8Array>,
  beforeLast: () => Promise<void>
): AsyncGenerator<Uint8Array> {
  let held: Uint8Array | undefined;
  for await (const chunk of source) {
    if (held) yield held;
    held = chunk;
  }
  await beforeLast();
  if (held) yield held;
}

/**
 * Authenticates, authorizes (database-authoritative), validates and streams an export.
 *
 * Audit lifecycle: exactly one terminal entry per attempt, written after the outcome
 * is known. Success is recorded only once every row has been generated and just
 * before the final bytes are released; failures and client disconnects are recorded
 * as failed with a category.
 */
export async function handleExportRequest(request: Request, client: ExportRouteClient): Promise<Response> {
  if (isCrossSite(request)) return json(403, { error: 'Cross-site export requests are not allowed.' });

  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return json(401, { error: 'Authentication required.' });

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json(400, { error: 'Invalid request body.' });
  }
  const parsed = exportRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json(400, { error: parsed.error.issues[0]?.message || 'Invalid export request.' });
  }

  const { datasets, format } = parsed.data;
  const hackathonId = parsed.data.hackathonId ?? null;

  let failureRecorded = false;
  const recordFailure = async (category: ExportFailureCategory, rowCounts: Record<string, number> = {}) => {
    if (failureRecorded) return;
    failureRecorded = true;
    try {
      await recordExport(client, { datasets, format, hackathonId, outcome: 'failed', rowCounts, failureCategory: category });
    } catch {
      // already logged; the original failure is what the caller sees
    }
  };

  try {
    const caps = await fetchExportCapabilities(client);
    if (!caps.can_export) {
      throw new ExportError('permission_denied', 'Access denied: export_data permission required.');
    }

    for (const id of datasets) {
      if (!datasetAllowed(id, caps)) {
        throw new ExportError(
          'permission_denied',
          `You do not have permission to export ${getDatasetDefinition(id)?.label ?? id}.`
        );
      }
    }
    if (format === 'csv' && datasets.length !== 1) {
      throw new ExportError('invalid_request', 'CSV export requires exactly one dataset. Use Excel or ZIP for several.');
    }
    if (!hackathonId && !caps.can_export_global) {
      throw new ExportError('permission_denied', 'Select a hackathon: global exports require Super Admin privilege.');
    }

    // The database re-authorizes the scope and every dataset here and raises on any denial.
    const counts = await fetchDatasetCounts(client, hackathonId, datasets);

    let scopeSlug: string | null = null;
    if (hackathonId) {
      const hackathons = await fetchExportableHackathons(client);
      scopeSlug = hackathons.find((h) => h.id === hackathonId)?.slug ?? null;
      if (!scopeSlug) {
        throw new ExportError('invalid_request', 'The selected hackathon is no longer available for export.');
      }
    }

    const pkg = createExportPackage({
      client,
      datasets,
      format,
      hackathonId,
      canViewPersonalData: caps.can_view_personal_data,
    });
    const filename = buildExportFilename({ scopeSlug, datasets, extension: pkg.extension });

    const gated = gateFinalChunk(pkg.stream, () =>
      recordExport(client, { datasets, format, hackathonId, outcome: 'success', rowCounts: pkg.tally })
    );
    const iterator = gated[Symbol.asyncIterator]();
    let finished = false;

    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { value, done } = await iterator.next();
          if (done) {
            finished = true;
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (err) {
          finished = true;
          const category: ExportFailureCategory =
            err instanceof ExportError && err.category !== 'audit_failed' ? err.category : 'generation_failed';
          if (!(err instanceof ExportError && err.category === 'audit_failed')) {
            await recordFailure(category, pkg.tally);
          }
          controller.error(err);
        }
      },
      async cancel() {
        // Client went away (or aborted) before the stream completed.
        if (!finished) {
          finished = true;
          await recordFailure('delivery_interrupted', pkg.tally);
          await iterator.return?.(undefined);
        }
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': pkg.mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Export-Filename': filename,
        // Row counts at export start, for the UI summary. Final counts go to the audit entry.
        'X-Export-Row-Counts': JSON.stringify(counts),
      },
    });
  } catch (err) {
    if (err instanceof ExportError) {
      if (err.category !== 'audit_failed') await recordFailure(err.category);
      return json(statusFor(err.category), { error: err.message, category: err.category });
    }
    console.error('[reports] unexpected export failure');
    await recordFailure('generation_failed');
    return json(500, { error: 'An unexpected error occurred during data export.', category: 'generation_failed' });
  }
}
