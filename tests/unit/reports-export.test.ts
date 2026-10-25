// Reports & Exports Hub: catalog, pagination completeness, generators, formula
// protection, personal-data columns, and the export endpoint's authorization /
// audit / delivery behavior.
//
// Database-level authorization (assignment vs in_charge_admin_id, advanced-dataset
// permissions, personal-data omission in the RPC, 1,501-row keyset paging, audit
// forgery protection) is proven against real Postgres in
// supabase/tests/28_ts_reports_export_hub.sql. This file exercises the TypeScript side
// against an in-memory RPC fake that models the same rules, so the handler's own
// checks, streaming, pagination loop and audit sequencing run for real.
export {};

import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import {
  ADVANCED_DATASET_IDS,
  ADVANCED_DATASETS,
  ALL_DATASET_IDS,
  CORE_DATASETS,
  CORE_DATASET_IDS,
  getDatasetColumns,
  type ExportCapabilities,
} from '../../src/lib/reports/dataset-catalog';
import { exportRequestSchema } from '../../src/lib/validation/export-schemas';
import {
  EXPORT_PAGE_SIZE,
  ExportError,
  createExportPackage,
  iterateDatasetRows,
  type ExportRpcClient,
  type RpcResult,
} from '../../src/lib/reports/export-service';
import { handleExportRequest, type ExportRouteClient } from '../../src/lib/reports/export-handler';

type Row = Record<string, unknown>;

const H1 = '11111111-1111-4111-8111-111111111111';
const H2 = '22222222-2222-4222-8222-222222222222';

const SUPER: ExportCapabilities = {
  is_super_admin: true,
  can_export: true,
  can_view_personal_data: true,
  can_export_audit_logs: true,
  can_export_profile_changes: true,
  can_export_storage_queue: true,
  can_export_global: true,
};
const REGULAR: ExportCapabilities = {
  is_super_admin: false,
  can_export: true,
  can_view_personal_data: false,
  can_export_audit_logs: false,
  can_export_profile_changes: false,
  can_export_storage_queue: false,
  can_export_global: false,
};

interface FakeOptions {
  user?: { id: string } | null;
  caps?: ExportCapabilities | { error: { message: string; code: string } };
  /** hackathons the caller is assigned to (regular admin) */
  assigned?: string[];
  hackathons?: { id: string; title: string; slug: string; status: string }[];
  data?: Record<string, Row[]>;
  pageCap?: number;
  failPagesAfter?: number;
  failAudit?: boolean;
}

function uuidFor(i: number): string {
  return `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
}

function makeFake(options: FakeOptions = {}) {
  const caps = options.caps ?? SUPER;
  const isCaps = (c: unknown): c is ExportCapabilities => !!c && typeof c === 'object' && 'can_export' in c;
  const hackathons = options.hackathons ?? [
    { id: H1, title: 'Hackathon One', slug: 'hackathon-one', status: 'published' },
    { id: H2, title: 'Hackathon Two', slug: 'hackathon-two', status: 'published' },
  ];
  const audits: Record<string, unknown>[] = [];
  const calls: string[] = [];
  let pageCalls = 0;

  const deny = (message: string): RpcResult => ({ data: null, error: { message, code: '42501' } });

  function authorize(scope: string | null): RpcResult | null {
    if (!isCaps(caps)) return { data: null, error: caps.error };
    if (!caps.can_export) return deny('Access denied: export_data permission required.');
    if (caps.is_super_admin) return null;
    if (scope === null) return deny('Access denied: platform-wide global exports require Super Admin privilege.');
    if (!(options.assigned ?? []).includes(scope)) return deny('Access denied: not authorized to export data for this hackathon.');
    return null;
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === undefined ? { id: 'u1' } : options.user } }) },
    rpc: async (fn: string, args: Record<string, unknown> = {}): Promise<RpcResult> => {
      calls.push(fn);
      switch (fn) {
        case 'get_export_capabilities':
          return isCaps(caps) ? { data: caps, error: null } : { data: null, error: caps.error };
        case 'get_exportable_hackathons': {
          const list = isCaps(caps) && caps.is_super_admin ? hackathons : hackathons.filter((h) => (options.assigned ?? []).includes(h.id));
          return { data: list, error: null };
        }
        case 'get_export_dataset_counts': {
          const denied = authorize((args.p_hackathon_id as string | null) ?? null);
          if (denied) return denied;
          const out: Record<string, number> = {};
          for (const id of args.p_datasets as string[]) out[id] = (options.data?.[id] ?? []).length;
          return { data: out, error: null };
        }
        case 'export_dataset_page': {
          const denied = authorize((args.p_hackathon_id as string | null) ?? null);
          if (denied) return denied;
          pageCalls += 1;
          if (options.failPagesAfter !== undefined && pageCalls > options.failPagesAfter) {
            return { data: null, error: { message: 'boom: secret details', code: 'XX000' } };
          }
          const rows = options.data?.[args.p_dataset as string] ?? [];
          const after = args.p_after as string | null;
          const limit = Math.min(args.p_limit as number, options.pageCap ?? 1000);
          const page = rows
            .map((data, i) => ({ row_id: uuidFor(i + 1), data }))
            .filter((r) => after === null || r.row_id > after)
            .slice(0, limit);
          return { data: page, error: null };
        }
        case 'record_data_export':
          if (options.failAudit) return { data: null, error: { message: 'audit table unavailable', code: 'XX000' } };
          audits.push(args);
          return { data: null, error: null };
        default:
          return { data: null, error: { message: `unexpected rpc ${fn}`, code: 'XX000' } };
      }
    },
  };
  return { client: client as unknown as ExportRouteClient, audits, calls };
}

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/admin/reports/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: 'localhost:3000', ...headers },
    body: JSON.stringify(body),
  });
}

async function readAll(res: Response): Promise<Buffer> {
  return Buffer.from(await res.arrayBuffer());
}

function studentRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: uuidFor(i + 1),
    full_name: `Student ${i + 1}`,
    usn: `1NT22CS${String(i + 1).padStart(4, '0')}`,
    email: `s${i + 1}@example.com`,
    phone: `+9198000${String(i + 1).padStart(5, '0')}`,
    branch: 'CSE',
    academic_year: 3,
    registration_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
  }));
}

async function run() {
  console.log('=== NMIT HackLeague: Reports & Exports Hub Tests ===\n');
  let passed = 0;
  let total = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    total++;
    if (cond) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
    }
  }

  // ------------------------------------------------------------------ catalog
  console.log('[Dataset catalog]');
  const coreIds = CORE_DATASETS.map((d) => d.id);
  assert(
    JSON.stringify(coreIds) ===
      JSON.stringify([
        'students', 'team_members', 'hackathons', 'teams', 'registrations',
        'round_results', 'winners', 'points', 'hackathon_summary', 'submissions', 'reviews',
      ]),
    'core catalog is exactly the 11 canonical datasets, in order', coreIds.join(',')
  );
  assert(CORE_DATASET_IDS.length === 11, 'Select All Core Datasets yields exactly 11 ids');
  assert(
    ADVANCED_DATASET_IDS.join(',') === 'audit_logs,profile_change_requests,storage_objects' &&
      ADVANCED_DATASET_IDS.every((id) => !CORE_DATASET_IDS.includes(id as never)),
    'advanced datasets are separate and never part of the core set'
  );
  assert(ALL_DATASET_IDS.length === 14, 'catalog has 14 datasets in total');
  const sheetNames = [...CORE_DATASETS, ...ADVANCED_DATASETS].map((d) => d.sheetName);
  assert(
    new Set(sheetNames).size === sheetNames.length && sheetNames.every((n) => n.length <= 31 && !/[\\/?*:[\]]/.test(n)),
    'sheet names are unique, <= 31 chars and Excel-safe'
  );
  assert(
    [...CORE_DATASETS, ...ADVANCED_DATASETS].every((d) => new Set(d.columns.map((c) => c.key)).size === d.columns.length),
    'every dataset has unique column keys'
  );
  const restricted = [...CORE_DATASETS, ...ADVANCED_DATASETS].flatMap((d) =>
    (d.columns as readonly { key: string; restricted?: boolean }[]).filter((c) => c.restricted).map((c) => `${d.id}.${c.key}`)
  );
  assert(restricted.join(',') === 'students.email,students.phone', 'only student email/phone are marked personal data', restricted.join(','));
  assert(
    !getDatasetColumns('students', false).some((c) => c.key === 'email' || c.key === 'phone') &&
      getDatasetColumns('students', true).some((c) => c.key === 'email'),
    'personal-data columns are removed unless permitted'
  );
  assert(
    ['all', 'results', 'points_ledger'].every((alias) => !exportRequestSchema.safeParse({ datasets: [alias], format: 'xlsx' }).success) &&
      ALL_DATASET_IDS.every((id) => exportRequestSchema.safeParse({ datasets: [id], format: 'xlsx' }).success),
    'server validation accepts exactly the catalog ids and rejects the old aliases'
  );
  assert(
    !exportRequestSchema.safeParse({ datasets: ['students', 'students'], format: 'xlsx' }).success &&
      !exportRequestSchema.safeParse({ datasets: [], format: 'xlsx' }).success &&
      !exportRequestSchema.safeParse({ datasets: ['students'], format: 'pdf' }).success &&
      !exportRequestSchema.safeParse({ datasets: ['students'], format: 'csv', hackathonId: 'nope' }).success,
    'validation rejects duplicates, empty selection, unknown formats and malformed hackathon ids'
  );

  // --------------------------------------------------------------- pagination
  console.log('\n[Pagination completeness]');
  const N = 1500;
  {
    const fake = makeFake({ data: { students: studentRows(N) } });
    const tally: Record<string, number> = {};
    const ids: string[] = [];
    for await (const row of iterateDatasetRows(fake.client, 'students', H1, tally)) ids.push(row.id as string);
    assert(ids.length === N && new Set(ids).size === N, `${N} rows are returned exactly once`, `${ids.length} / ${new Set(ids).size}`);
    assert(tally.students === N, 'tally matches the number of rows read');
    assert(fake.calls.filter((c) => c === 'export_dataset_page').length === Math.ceil(N / EXPORT_PAGE_SIZE) + 1, 'pages until an empty page (2 full/partial pages + 1 terminating page)');
  }
  {
    const fake = makeFake({ data: { students: studentRows(N) }, pageCap: 500 });
    const tally: Record<string, number> = {};
    let count = 0;
    for await (const _ of iterateDatasetRows(fake.client, 'students', H1, tally)) count++;
    assert(count === N, 'a server-side page cap below the requested size does not truncate the export', String(count));
  }
  {
    // Cursor that never advances must abort, not loop or duplicate.
    const stuck = {
      rpc: async () => ({ data: [{ row_id: uuidFor(1), data: {} }, { row_id: uuidFor(1), data: {} }], error: null }),
    } as unknown as ExportRpcClient;
    let category = '';
    try {
      for await (const _ of iterateDatasetRows(stuck, 'students', H1, {})) void _;
    } catch (e) {
      category = e instanceof ExportError ? e.category : 'other';
    }
    assert(category === 'query_failed', 'out-of-order / duplicate cursor aborts the export');
  }

  // --------------------------------------------------------------- generators
  console.log('\n[Generators: csv / xlsx / zip]');
  {
    const fake = makeFake({ data: { students: studentRows(N) } });
    const pkg = createExportPackage({ client: fake.client, datasets: ['students'], format: 'csv', hackathonId: H1, canViewPersonalData: true });
    const csv = Buffer.concat(await collect(pkg.stream)).toString('utf-8').trimEnd().split('\r\n');
    assert(csv.length === N + 1 && csv[0].startsWith('Full Name,USN,Email,Phone'), `CSV has a header + ${N} rows`, String(csv.length));
    assert(new Set(csv.slice(1)).size === N, 'CSV rows are all distinct (no duplicates)');
  }
  {
    const fake = makeFake({ data: { students: studentRows(3) } });
    const pkg = createExportPackage({ client: fake.client, datasets: ['students'], format: 'csv', hackathonId: H1, canViewPersonalData: false });
    const csv = Buffer.concat(await collect(pkg.stream)).toString('utf-8');
    assert(!/Email|Phone|@example\.com|\+9198000/.test(csv), 'restricted columns and values never reach the file when not permitted, even if rows contain them');
  }
  {
    const fake = makeFake({ data: {} });
    const pkg = createExportPackage({ client: fake.client, datasets: ['students'], format: 'csv', hackathonId: H1, canViewPersonalData: true });
    const csv = Buffer.concat(await collect(pkg.stream)).toString('utf-8').trimEnd().split('\r\n');
    assert(csv.length === 1 && csv[0].startsWith('Full Name'), 'an empty dataset yields a header-only CSV');
  }
  {
    const data: Record<string, Row[]> = {};
    data.students = studentRows(1200);
    const fake = makeFake({ data });
    const pkg = createExportPackage({ client: fake.client, datasets: [...CORE_DATASET_IDS], format: 'xlsx', hackathonId: H1, canViewPersonalData: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.concat(await collect(pkg.stream)) as unknown as ArrayBuffer);
    assert(
      wb.worksheets.map((w) => w.name).join('|') === CORE_DATASETS.map((d) => d.sheetName).join('|'),
      'workbook has the 11 canonical sheets in catalog order, including empty ones', wb.worksheets.map((w) => w.name).join('|')
    );
    assert(wb.getWorksheet('Students')!.rowCount === 1201, 'Students sheet has header + 1,200 rows', String(wb.getWorksheet('Students')!.rowCount));
    assert(wb.getWorksheet('Reviews')!.rowCount === 1 && wb.getWorksheet('Reviews')!.getRow(1).getCell(1).value === 'Hackathon', 'empty sheets keep their header row');
  }
  {
    const fake = makeFake({ data: { students: studentRows(5) } });
    const pkg = createExportPackage({ client: fake.client, datasets: [...CORE_DATASET_IDS], format: 'zip', hackathonId: H1, canViewPersonalData: true });
    const zip = await JSZip.loadAsync(Buffer.concat(await collect(pkg.stream)));
    const names = Object.keys(zip.files).sort();
    assert(
      names.join(',') === CORE_DATASETS.map((d) => `${d.fileName}.csv`).sort().join(','),
      'ZIP holds one CSV per core dataset, including empty ones', names.join(',')
    );
    const students = (await zip.file('students.csv')!.async('string')).trimEnd().split('\r\n');
    assert(students.length === 6, 'ZIP students.csv has header + 5 rows');
  }

  console.log('\n[Formula injection]');
  {
    const evil = [{
      id: uuidFor(1), full_name: '=HYPERLINK("http://evil","x")', usn: '+SUM(1)', branch: '-2+3', academic_year: 3,
      registration_status: '@cmd', created_at: ' =sneaky', email: 'a@b.c', phone: '1',
    }];
    const f1 = makeFake({ data: { students: evil } });
    const csv = Buffer.concat(await collect(createExportPackage({ client: f1.client, datasets: ['students'], format: 'csv', hackathonId: H1, canViewPersonalData: true }).stream)).toString('utf-8');
    assert(!/(^|,)"?[=+\-@]/m.test(csv.split('\r\n')[1]), 'CSV cells never start with a formula trigger', csv.split('\r\n')[1]);
    const f2 = makeFake({ data: { students: evil } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.concat(await collect(createExportPackage({ client: f2.client, datasets: ['students'], format: 'xlsx', hackathonId: H1, canViewPersonalData: true }).stream)) as unknown as ArrayBuffer);
    const cells = [1, 2, 5, 7, 8].map((c) => String(wb.getWorksheet('Students')!.getRow(2).getCell(c).value));
    assert(cells.every((v) => !/^[=+\-@]/.test(v.trimStart())), 'xlsx cells never start with a formula trigger', cells.join(' | '));
    const f3 = makeFake({ data: { points: [{ transaction_id: uuidFor(1), student_name: 'Normal', points: -5, reason: 'Fine' }] } });
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(Buffer.concat(await collect(createExportPackage({ client: f3.client, datasets: ['points'], format: 'xlsx', hackathonId: H1, canViewPersonalData: true }).stream)) as unknown as ArrayBuffer);
    assert(wb2.getWorksheet('Points Ledger')!.getRow(2).getCell(8).value === -5, 'ordinary numeric data (negative points) is preserved as a number');
  }

  // ------------------------------------------------------------------ handler
  console.log('\n[Export endpoint: authorization]');
  const fullBody = { datasets: [...CORE_DATASET_IDS], format: 'xlsx' as const };
  {
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: null }), makeFake().client);
    assert(r.status === 200, 'Super Admin can export Global Platform scope');
    await readAll(r);
  }
  {
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: H1 }), makeFake().client);
    assert(r.status === 200 && /hackleague_hackathon-one_11-datasets_\d{4}-\d{2}-\d{2}\.xlsx/.test(r.headers.get('content-disposition') ?? ''), 'Super Admin can export one hackathon; filename carries scope, selection and date', r.headers.get('content-disposition') ?? '');
    await readAll(r);
  }
  {
    const fake = makeFake({ caps: REGULAR, assigned: [H1] });
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: H1 }), fake.client);
    assert(r.status === 200, 'admin with export_data and assignment can export that hackathon');
    await readAll(r);
  }
  {
    const fake = makeFake({ caps: REGULAR, assigned: [H1] });
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: H2 }), fake.client);
    const body = await r.json();
    assert(r.status === 403 && body.category === 'permission_denied', 'admin cannot export a hackathon they are not assigned to', JSON.stringify(body));
    assert(fake.audits.length === 1 && fake.audits[0].p_outcome === 'failed' && fake.audits[0].p_failure_category === 'permission_denied', 'a denied attempt is audited as failed (permission_denied)');
    assert(!fake.calls.includes('export_dataset_page'), 'no data is read for a denied scope');
  }
  {
    const fake = makeFake({ caps: { ...REGULAR, can_export: false }, assigned: [H1] });
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: H1 }), fake.client);
    assert(r.status === 403, 'an admin without export authorization (e.g. only in_charge_admin_id) is denied');
  }
  {
    const fake = makeFake({ caps: REGULAR, assigned: [H1] });
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: null }), fake.client);
    assert(r.status === 403, 'a regular admin cannot use Global Platform scope');
  }
  {
    const fake = makeFake({ caps: { error: { message: 'Access denied: caller is not an active administrator.', code: '42501' } } });
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: H1 }), fake.client);
    assert(r.status === 403 && !fake.calls.includes('export_dataset_page'), 'a non-admin is denied and reads nothing');
  }
  {
    const fake = makeFake({ user: null });
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: H1 }), fake.client);
    assert(r.status === 401, 'an unauthenticated caller gets 401');
  }
  for (const id of ADVANCED_DATASET_IDS) {
    const fake = makeFake({ caps: REGULAR, assigned: [H1] });
    const r = await handleExportRequest(req({ datasets: [id], format: 'xlsx', hackathonId: H1 }), fake.client);
    assert(r.status === 403 && !fake.calls.includes('export_dataset_page'), `advanced dataset ${id} is refused server-side without its permission`);
  }
  {
    const fake = makeFake({ caps: { ...REGULAR, can_export_audit_logs: true }, assigned: [H1] });
    const r = await handleExportRequest(req({ datasets: ['audit_logs'], format: 'csv', hackathonId: H1 }), fake.client);
    assert(r.status === 200, 'advanced dataset is allowed once its specific permission is held');
    await readAll(r);
  }
  {
    const r = await handleExportRequest(req({ datasets: ['bogus'], format: 'xlsx', hackathonId: H1 }), makeFake().client);
    assert(r.status === 400, 'invalid dataset id rejected');
  }
  {
    const r = await handleExportRequest(req({ datasets: ['students', 'teams'], format: 'csv', hackathonId: H1 }), makeFake().client);
    const body = await r.json();
    assert(r.status === 400 && /exactly one dataset/.test(body.error), 'CSV with several datasets is refused with an explanation (no silent pick)');
  }
  {
    const r = await handleExportRequest(req({ ...fullBody, hackathonId: H1 }, { origin: 'https://evil.example' }), makeFake().client);
    assert(r.status === 403, 'cross-site requests are rejected');
  }

  console.log('\n[Export endpoint: personal data]');
  {
    const fake = makeFake({ caps: REGULAR, assigned: [H1], data: { students: studentRows(3) } });
    const r = await handleExportRequest(req({ datasets: ['students'], format: 'csv', hackathonId: H1 }), fake.client);
    const csv = (await readAll(r)).toString('utf-8');
    assert(r.status === 200 && !/Email|Phone|@example\.com/.test(csv), 'admin without view_student_data gets no email/phone');
  }
  {
    const fake = makeFake({ caps: { ...REGULAR, can_view_personal_data: true }, assigned: [H1], data: { students: studentRows(3) } });
    const r = await handleExportRequest(req({ datasets: ['students'], format: 'csv', hackathonId: H1 }), fake.client);
    const csv = (await readAll(r)).toString('utf-8');
    assert(/Email/.test(csv) && /s1@example\.com/.test(csv), 'admin with view_student_data receives email/phone');
  }

  console.log('\n[Export endpoint: audit lifecycle & delivery]');
  {
    const fake = makeFake({ data: { students: studentRows(1200) } });
    const r = await handleExportRequest(req({ datasets: ['students', 'teams'], format: 'zip', hackathonId: H1 }), fake.client);
    assert(fake.audits.length === 0, 'nothing is audited before the data has been generated');
    const bytes = await readAll(r);
    assert(bytes.length > 0 && r.headers.get('content-type') === 'application/zip', 'ZIP delivered with the correct content type');
    assert(
      fake.audits.length === 1 && fake.audits[0].p_outcome === 'success' &&
        JSON.stringify(fake.audits[0].p_row_counts) === JSON.stringify({ students: 1200, teams: 0 }) &&
        JSON.stringify(fake.audits[0].p_datasets) === JSON.stringify(['students', 'teams']),
      'success is audited once, with datasets and the actual row counts', JSON.stringify(fake.audits)
    );
    const header = JSON.parse(r.headers.get('x-export-row-counts') ?? '{}');
    assert(header.students === 1200 && header.teams === 0, 'response carries the row counts for the UI');
    assert(!/[^\x20-\x7e]|\.\./.test(r.headers.get('content-disposition') ?? ''), 'content-disposition filename is plain ascii');
  }
  {
    const fake = makeFake({ data: { students: studentRows(1200) }, failPagesAfter: 1 });
    const r = await handleExportRequest(req({ datasets: ['students'], format: 'csv', hackathonId: H1 }), fake.client);
    let threw = false;
    try {
      await readAll(r);
    } catch {
      threw = true;
    }
    assert(threw, 'a query failure mid-export fails the download instead of returning a partial file as complete');
    assert(
      fake.audits.length === 1 && fake.audits[0].p_outcome === 'failed' && fake.audits[0].p_failure_category === 'query_failed',
      'failed generation is audited as failed and never as success', JSON.stringify(fake.audits)
    );
    assert(!JSON.stringify(fake.audits).includes('secret details'), 'audit failure category carries no error payload');
  }
  {
    const fake = makeFake({ data: { students: studentRows(5) }, failAudit: true });
    const r = await handleExportRequest(req({ datasets: ['students'], format: 'xlsx', hackathonId: H1 }), fake.client);
    let threw = false;
    try {
      await readAll(r);
    } catch {
      threw = true;
    }
    assert(threw && fake.audits.length === 0, 'if the success audit cannot be written the download fails and no success is recorded');
  }
  {
    const fake = makeFake({ data: { students: studentRows(20000) } });
    const r = await handleExportRequest(req({ datasets: ['students'], format: 'csv', hackathonId: H1 }), fake.client);
    const reader = r.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(
      fake.audits.length === 1 && fake.audits[0].p_outcome === 'failed' && fake.audits[0].p_failure_category === 'delivery_interrupted',
      'a client that disconnects mid-stream is audited as delivery_interrupted, not success', JSON.stringify(fake.audits)
    );
  }

  console.log(`\n=== Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%) ===`);
  if (passed !== total) process.exit(1);
}

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for await (const chunk of stream) out.push(Buffer.from(chunk));
  return out;
}

run().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
