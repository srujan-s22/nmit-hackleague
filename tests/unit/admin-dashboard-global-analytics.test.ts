// Contract test for getAdminParticipationAnalyticsAction.
//
// The chart math (distinct students, reconciliation, draft exclusion) is
// verified against real Postgres in supabase/tests/27_ts_admin_homepage_analytics_global.sql.
// This test pins the TypeScript side of the regression:
//   - every active admin (Super Admin, admin with permissions, admin with none)
//     gets the SAME RPC payload — no role/permission/assignment branching;
//   - the action never reads tables directly (no RLS-silent-empty rows, no
//     service-role client, which has no table grants on hosted);
//   - the selected hackathon is forwarded to the RPC;
//   - a non-admin caller is denied; RPC errors surface as success:false.

// `export {}` makes this file a module so its top-level consts don't collide
// with script-scoped declarations in other test files under tsc.
export {};

const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

type AdminRow = { id: string; is_active: boolean; is_super_admin: boolean };

async function runAdminDashboardGlobalAnalyticsTests() {
  console.log('=== NMIT HackLeague: Admin Dashboard Global Analytics Tests ===\n');

  let passed = 0;
  let total = 0;
  function assert(condition: boolean, name: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
    }
  }

  const PAYLOAD = {
    participation: { participating: 3, not_participating: 1, total_students: 4 },
    activity: [
      { hackathon_id: 'hack-1', title: 'Alpha', participants: 2 },
      { hackathon_id: 'hack-2', title: 'Beta', participants: 2 },
    ],
    hackathons: [
      { id: 'hack-1', title: 'Alpha' },
      { id: 'hack-2', title: 'Beta' },
    ],
  };

  let rpcCalls: { name: string; args: unknown }[] = [];
  let tablesRead: string[] = [];
  let rpcResult: { data: unknown; error: { message: string } | null } = { data: PAYLOAD, error: null };

  function makeServerClient(adminRow: AdminRow | null, permissions: string[]) {
    return {
      auth: {
        getUser: async () => ({
          data: adminRow ? { user: { id: adminRow.id, email: 'caller@example.com', app_metadata: {} } } : { user: null },
          error: null,
        }),
      },
      from: (table: string) => {
        tablesRead.push(table);
        if (table === 'admin_profiles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: adminRow, error: adminRow ? null : new Error('not found') }),
              }),
            }),
          };
        }
        if (table === 'admin_permissions') {
          return {
            select: () => ({
              eq: async () => ({ data: permissions.map((p) => ({ permission: p })), error: null }),
            }),
          };
        }
        throw new Error(`Action must not read table directly: ${table}`);
      },
      rpc: async (name: string, args: unknown) => {
        rpcCalls.push({ name, args });
        if (name === 'is_push_registered') return { data: true, error: null };
        return rpcResult;
      },
    };
  }

  function load(adminRow: AdminRow | null, permissions: string[]) {
    rpcCalls = [];
    tablesRead = [];
    const serverClientPath = require.resolve('../../src/lib/supabase/server');
    require.cache[serverClientPath] = {
      id: serverClientPath,
      filename: serverClientPath,
      loaded: true,
      exports: { createClient: async () => makeServerClient(adminRow, permissions) },
    } as unknown as NodeModule;
    // The service-role client must never be needed: make any use blow up loudly.
    const adminClientPath = require.resolve('../../src/lib/supabase/admin');
    require.cache[adminClientPath] = {
      id: adminClientPath,
      filename: adminClientPath,
      loaded: true,
      exports: {
        createAdminClient: () => {
          throw new Error('Service-role client must not be used for homepage analytics');
        },
      },
    } as unknown as NodeModule;
    delete require.cache[require.resolve('../../src/lib/auth/guards')];
    delete require.cache[require.resolve('../../src/actions/report-actions')];
    return require('../../src/actions/report-actions').getAdminParticipationAnalyticsAction as (
      id?: string | null
    ) => Promise<{ success: boolean; analytics?: typeof PAYLOAD; error?: string }>;
  }

  const roles: { label: string; row: AdminRow; perms: string[] }[] = [
    { label: 'Super Admin', row: { id: 'a-super', is_active: true, is_super_admin: true }, perms: [] },
    { label: 'Admin with permissions', row: { id: 'a-perms', is_active: true, is_super_admin: false }, perms: ['manage_teams', 'export_data', 'verify_students'] },
    { label: 'Admin with NO permissions', row: { id: 'a-none', is_active: true, is_super_admin: false }, perms: [] },
  ];

  const results: string[] = [];
  for (const role of roles) {
    console.log(`[${role.label}]`);
    const action = load(role.row, role.perms);
    const res = await action(null);
    const analyticsCalls = rpcCalls.filter((c) => c.name === 'get_admin_participation_analytics');
    assert(res.success === true, `${role.label}: request succeeds`);
    assert(JSON.stringify(res.analytics) === JSON.stringify(PAYLOAD), `${role.label}: receives the RPC payload unchanged`);
    assert(analyticsCalls.length === 1, `${role.label}: exactly one analytics RPC call`);
    assert(
      JSON.stringify(analyticsCalls[0]?.args) === JSON.stringify({ p_hackathon_id: null }),
      `${role.label}: default scope is platform-wide (p_hackathon_id = null), not narrowed by role/assignment`
    );
    assert(
      tablesRead.every((t) => t === 'admin_profiles' || t === 'admin_permissions'),
      `${role.label}: no direct reads of team_members/profiles/hackathons (only the auth gate's own lookups)`,
      tablesRead.join(',')
    );
    results.push(JSON.stringify({ res, args: analyticsCalls[0]?.args }));
  }
  assert(
    new Set(results).size === 1,
    'All three admin roles get byte-identical responses and identical RPC arguments'
  );

  console.log('\n[Scope selection]');
  const scoped = load(roles[2].row, []);
  await scoped('hack-1');
  assert(
    JSON.stringify(rpcCalls.find((c) => c.name === 'get_admin_participation_analytics')?.args) ===
      JSON.stringify({ p_hackathon_id: 'hack-1' }),
    'Selecting a hackathon forwards its id to the RPC (any admin can narrow scope)'
  );

  console.log('\n[Denial]');
  const denied = load(null, []);
  let threw = false;
  let message = '';
  try {
    await denied(null);
  } catch (e) {
    threw = true;
    message = e instanceof Error ? e.message : String(e);
  }
  assert(threw && message.includes('NEXT_REDIRECT'), 'Non-admin caller is redirected away (requireAdmin gate holds)', message);
  assert(
    rpcCalls.every((c) => c.name !== 'get_admin_participation_analytics'),
    'Non-admin caller never reaches the analytics RPC'
  );

  console.log('\n[Error propagation]');
  rpcResult = { data: null, error: { message: 'Access denied: caller is not an active administrator.' } };
  const failing = load(roles[0].row, []);
  const failRes = await failing(null);
  assert(
    failRes.success === false && Boolean(failRes.error?.includes('Access denied')),
    'RPC errors surface as success:false with the message (so the page can show them, not zeros)'
  );

  console.log(`\n=== Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%) ===`);
  if (passed !== total) process.exit(1);
}

runAdminDashboardGlobalAnalyticsTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
