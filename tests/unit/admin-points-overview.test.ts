// Pins the definitions behind the Points & Awards summary cards
// (getPointsOverviewAction) so they can't drift silently:
//   students_with_points = distinct students with NET ledger total > 0
//   total_awarded        = sum of positive, non-reversal entries
//   total_reversed       = sum of 'reversal' entries (stored negative), reversal_count = their number
//   recent_adjustments   = manual_adjustment entries in the last 30 days
// and that >1000 ledger rows are paged (PostgREST caps a response at 1000 rows).
export {};

const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

type Row = { student_id: string; milestone_type: string; points: number; created_at: string };

async function run() {
  console.log('=== NMIT HackLeague: Points Overview Aggregation Tests ===\n');
  let passed = 0;
  let total = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    total++;
    if (cond) { console.log(`  ✓ [PASS] ${name}`); passed++; }
    else console.error(`  ✗ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
  }

  const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

  // s1: +20 participation, +10 adjustment (recent), -15 adjustment(old)  => net 15
  // s2: +30 round_qualification, -30 reversal                             => net 0 (not "with points")
  // s3: -5 adjustment                                                      => net -5 (not "with points")
  const base: Row[] = [
    { student_id: 's1', milestone_type: 'participation', points: 20, created_at: daysAgo(40) },
    { student_id: 's1', milestone_type: 'manual_adjustment', points: 10, created_at: daysAgo(2) },
    { student_id: 's1', milestone_type: 'manual_adjustment', points: -15, created_at: daysAgo(45) },
    { student_id: 's2', milestone_type: 'round_qualification', points: 30, created_at: daysAgo(50) },
    { student_id: 's2', milestone_type: 'reversal', points: -30, created_at: daysAgo(10) },
    { student_id: 's3', milestone_type: 'manual_adjustment', points: -5, created_at: daysAgo(1) },
  ];

  // Padding to force paging: 1500 extra +1 'participation' rows for distinct students p0..p1499
  const padding: Row[] = Array.from({ length: 1500 }, (_, i) => ({
    student_id: `p${i}`, milestone_type: 'participation', points: 1, created_at: daysAgo(60),
  }));

  let rangeCalls: [number, number][] = [];
  function install(rows: Row[]) {
    rangeCalls = [];
    const serverClient = {
      auth: { getUser: async () => ({ data: { user: { id: 'a-super', email: 'a@example.com', app_metadata: {} } }, error: null }) },
      from: (table: string) => {
        if (table === 'admin_profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'a-super', is_active: true, is_super_admin: true }, error: null }) }) }) };
        }
        if (table === 'admin_permissions') {
          return { select: () => ({ eq: async () => ({ data: [], error: null }) }) };
        }
        if (table === 'points_ledger') {
          const chain: Record<string, unknown> = {
            select: () => chain,
            order: () => chain,
            range: async (a: number, b: number) => { rangeCalls.push([a, b]); return { data: rows.slice(a, b + 1), error: null }; },
          };
          return chain;
        }
        throw new Error(`unexpected table ${table}`);
      },
      rpc: async () => ({ data: true, error: null }),
    };
    const adminClient = {
      from: (table: string) => {
        if (table !== 'profiles') throw new Error(`service-role client must only read profiles, got ${table}`);
        const chain: Record<string, unknown> = { select: () => chain, eq: () => chain, then: (r: (v: unknown) => unknown) => r({ count: 312, error: null }) };
        return chain;
      },
    };
    const sPath = require.resolve('../../src/lib/supabase/server');
    require.cache[sPath] = { id: sPath, filename: sPath, loaded: true, exports: { createClient: async () => serverClient } } as unknown as NodeModule;
    const aPath = require.resolve('../../src/lib/supabase/admin');
    require.cache[aPath] = { id: aPath, filename: aPath, loaded: true, exports: { createAdminClient: () => adminClient } } as unknown as NodeModule;
    delete require.cache[require.resolve('../../src/lib/auth/guards')];
    delete require.cache[require.resolve('../../src/actions/points-admin-view-actions')];
    return require('../../src/actions/points-admin-view-actions').getPointsOverviewAction as () => Promise<{
      success: boolean;
      overview?: Record<string, number>;
      error?: string;
    }>;
  }

  console.log('[Definitions on a small ledger]');
  let res = await install(base)();
  assert(res.success === true, 'overview loads');
  const o = res.overview!;
  assert(o.approved_students === 312, 'approved_students comes from the profiles count');
  assert(o.students_with_points === 1, 'students_with_points counts only students with NET total > 0 (s1 only; s2 nets 0, s3 negative)', String(o.students_with_points));
  assert(o.total_awarded === 60, 'total_awarded = positive non-reversal entries (20 + 10 + 30)', String(o.total_awarded));
  assert(o.total_reversed === -30, 'total_reversed = sum of reversal entries', String(o.total_reversed));
  assert(o.reversal_count === 1, 'reversal_count = number of reversal entries');
  assert(o.recent_adjustments === 2, 'recent_adjustments counts manual adjustments in the last 30 days only (the -15 from 45d ago excluded)', String(o.recent_adjustments));
  assert(o.recent_days === 30, 'recent window is 30 days');

  console.log('\n[Paging beyond PostgREST\'s 1000-row response cap]');
  res = await install([...base, ...padding])();
  const o2 = res.overview!;
  assert(rangeCalls.length === 2 && rangeCalls[0][0] === 0 && rangeCalls[1][0] === 1000, 'ledger is fetched in 1000-row pages (2 pages for 1506 rows)', JSON.stringify(rangeCalls));
  assert(o2.students_with_points === 1501, 'all 1500 padded students + s1 are counted (nothing truncated at row 1000)', String(o2.students_with_points));
  assert(o2.total_awarded === 60 + 1500, 'total_awarded includes rows beyond the first page', String(o2.total_awarded));

  console.log('\n[Empty ledger]');
  res = await install([])();
  assert(res.success && res.overview!.students_with_points === 0 && res.overview!.total_awarded === 0 && res.overview!.total_reversed === 0, 'empty ledger yields zeros, no errors');

  console.log(`\n=== Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%) ===`);
  if (passed !== total) process.exit(1);
}

run().catch((e) => { console.error('Fatal test error:', e); process.exit(1); });
