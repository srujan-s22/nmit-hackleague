// Live access sync: when a Super Admin changes an admin's access, that admin's open
// pages re-render. Database side (trigger, private topic, receive policy, no client
// publish) is proven in supabase/tests/29_ts_admin_access_change_broadcast.sql.
// This file pins the browser side: the staleness comparison and the security
// properties of the subscription.
export {};

import fs from 'node:fs';
import path from 'node:path';

const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as unknown as NodeModule;

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

async function run() {
  console.log('=== NMIT HackLeague: Admin Access Sync Tests ===\n');
  let passed = 0;
  let total = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    total++;
    if (cond) { console.log(`  ✓ [PASS] ${name}`); passed++; }
    else console.error(`  ✗ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
  }

  const { accessDiffers } = require('../../src/lib/admin/use-admin-access-sync');
  const rendered = { isSuperAdmin: false, permissionsKey: 'export_data|view_analytics', hasAssignments: true };

  console.log('[Staleness comparison]');
  assert(!accessDiffers(rendered, { isSuperAdmin: false, permissions: ['export_data', 'view_analytics'], hasAssignments: true }), 'identical access is not stale');
  assert(!accessDiffers(rendered, { isSuperAdmin: false, permissions: ['view_analytics', 'export_data'], hasAssignments: true }), 'permission order does not cause a refresh (no refresh loops)');
  assert(accessDiffers(rendered, { isSuperAdmin: false, permissions: ['export_data'], hasAssignments: true }), 'a revoked permission is stale');
  assert(accessDiffers(rendered, { isSuperAdmin: false, permissions: ['export_data', 'view_analytics', 'manage_points'], hasAssignments: true }), 'a granted permission is stale');
  assert(accessDiffers(rendered, { isSuperAdmin: true, permissions: ['export_data', 'view_analytics'], hasAssignments: true }), 'a role change is stale');
  assert(accessDiffers(rendered, { isSuperAdmin: false, permissions: ['export_data', 'view_analytics'], hasAssignments: false }), 'losing all assignments is stale');
  assert(!accessDiffers({ ...rendered, hasAssignments: null }, { isSuperAdmin: false, permissions: ['export_data', 'view_analytics'], hasAssignments: false }), 'assignments are not compared when the page did not supply them');
  assert(!accessDiffers({ ...rendered, permissionsKey: '' }, { isSuperAdmin: false, permissions: [], hasAssignments: true }), 'empty permission sets compare equal');

  console.log('\n[Subscription security]');
  const hook = read('src/lib/admin/use-admin-access-sync.ts');
  assert(/private:\s*true/.test(hook), 'subscribes on a PRIVATE channel (server-enforced receive policy)');
  assert(/`admin-access:\$\{adminId\}`/.test(hook), 'the topic is derived from the signed-in admin id only');
  assert(!/\.on\('broadcast',[^)]*\(\s*(payload|msg|message|event)/.test(hook), 'the broadcast handler ignores the event payload (it is only a re-check signal)');
  assert(/router\.refresh\(\)/.test(hook) && /clearAdminNavCache\(\)/.test(hook), 'a change drops the client cache and re-renders on the server (which re-authorizes)');
  assert(/REFRESH_COOLDOWN_MS/.test(hook), 'fallback refreshes have a loop guard');
  assert(/removeChannel/.test(hook) && /removeEventListener/.test(hook) && /clearInterval/.test(hook), 'the channel, listener and poll are cleaned up on unmount');

  const shell = read('src/components/shells/admin-shell.tsx');
  assert(/useAdminAccessSync\(isActiveAdmin \? adminId : undefined/.test(shell), 'only active admins subscribe, and only to their own id');

  const migration = read('supabase/migrations/20261031000002_admin_access_change_broadcast.sql');
  assert(/realtime\.send\([\s\S]*true\s*\)/.test(migration), 'the trigger publishes on a private topic');
  assert(/FOR SELECT TO authenticated/.test(migration) && !/FOR INSERT/.test(migration), 'clients can only receive, never publish');
  assert(/EXCEPTION WHEN OTHERS/.test(migration), 'a broadcast failure cannot block a permission change');

  console.log(`\n=== Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%) ===`);
  if (passed !== total) process.exit(1);
}

run().catch((e) => { console.error('Fatal test error:', e); process.exit(1); });
