// Admin navigation cache + shared admin layout: behavior and security guard rails.
//
// The cache is display-only. These tests pin that (a) it expires, is bound to one
// admin id, rejects tampered shapes and is wiped on sign-out paths, and (b) it can
// never become an authorization input: server code does not read it, the admin
// layout is not the only gate (every /admin page still authorizes itself), and the
// refresh action reveals nothing to non-admins.
export {};

import fs from 'node:fs';
import path from 'node:path';

const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as unknown as NodeModule;

// Minimal sessionStorage so the browser-only modules run under tsx.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

async function run() {
  console.log('=== NMIT HackLeague: Admin Nav Cache & Layout Security Tests ===\n');
  let passed = 0;
  let total = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    total++;
    if (cond) { console.log(`  ✓ [PASS] ${name}`); passed++; }
    else console.error(`  ✗ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
  }

  const cache = require('../../src/lib/admin/admin-nav-cache');
  const header = require('../../src/lib/student/header-profile-cache');
  const session = require('../../src/lib/session/client-session-cache');

  console.log('[Cache behavior]');
  const entry = { adminId: 'a1', isSuperAdmin: false, permissions: ['export_data'], hasAssignments: true, refreshedAt: Date.now() };
  assert(cache.readAdminNavCache() === null, 'starts empty');
  cache.writeAdminNavCache(entry);
  assert(cache.readAdminNavCache() === entry, 'returns the written entry (stable reference)');
  assert(JSON.parse(store.get('hl.adminNav.v1')!).adminId === 'a1', 'persisted in sessionStorage (per tab)');
  const stored = store.get('hl.adminNav.v1')!;
  assert(!/token|password|secret|email/i.test(stored), 'stored value holds only role/permission names and flags (no tokens, secrets or personal data)', stored);

  let notified = 0;
  const unsubscribe = cache.subscribeAdminNavCache(() => notified++);
  cache.clearAdminNavCache();
  assert(cache.readAdminNavCache() === null && !store.has('hl.adminNav.v1') && notified === 1, 'clear empties memory + storage and notifies subscribers');
  unsubscribe();

  // Fresh module state to prove it re-hydrates from storage and validates shape/expiry.
  function reload() {
    delete require.cache[require.resolve('../../src/lib/admin/admin-nav-cache')];
    return require('../../src/lib/admin/admin-nav-cache');
  }
  store.set('hl.adminNav.v1', JSON.stringify(entry));
  assert(reload().readAdminNavCache()?.adminId === 'a1', 'a valid stored entry is restored after a page reload');
  store.set('hl.adminNav.v1', JSON.stringify({ ...entry, refreshedAt: Date.now() - 13 * 60 * 60 * 1000 }));
  assert(reload().readAdminNavCache() === null, 'an entry older than 12h is discarded');
  store.set('hl.adminNav.v1', JSON.stringify({ ...entry, permissions: 'export_data' }));
  assert(reload().readAdminNavCache() === null, 'a tampered shape (permissions not an array) is rejected');
  store.set('hl.adminNav.v1', JSON.stringify({ ...entry, permissions: [1, 2] }));
  assert(reload().readAdminNavCache() === null, 'non-string permission entries are rejected');
  store.set('hl.adminNav.v1', '{not json');
  assert(reload().readAdminNavCache() === null, 'corrupt storage behaves as an empty cache');

  console.log('\n[Sign-out wipes everything]');
  const c2 = reload();
  c2.writeAdminNavCache(entry);
  header.writeHeaderProfileCache({ full_name: 'S', usn: '1', avatarUrl: 'data:image/jpeg;base64,AA' });
  session.clearClientSessionCache();
  assert(
    store.size === 0 && header.readHeaderProfileCache() === null,
    'clearClientSessionCache removes both the admin nav store and the student header/photo store', [...store.keys()].join(',')
  );
  for (const file of [
    'src/components/layout/app-header.tsx',
    'src/components/layout/sidebar-nav.tsx',
    'src/app/auth/complete-setup/page.tsx',
    'src/app/login/page.tsx',
  ]) {
    assert(/clearClientSessionCache\(\)/.test(read(file)), `${file} clears the client session cache`);
  }
  assert(
    /useEffect\(\(\) => \{\s*clearClientSessionCache\(\);\s*\}, \[\]\)/.test(read('src/app/login/page.tsx')),
    'the login page clears the cache on mount (covers form-based sign-out, expiry and redirects)'
  );

  console.log('\n[The cache is display-only: security invariants]');
  const serverFiles = [
    ...walk(path.join(ROOT, 'src/actions')),
    ...walk(path.join(ROOT, 'src/lib/auth')),
    ...walk(path.join(ROOT, 'src/lib/reports')),
    ...walk(path.join(ROOT, 'src/app/api')),
  ].filter((f) => /\.(ts|tsx)$/.test(f));
  const leaks = serverFiles.filter((f) => /admin-nav-cache|header-profile-cache|client-session-cache/.test(fs.readFileSync(f, 'utf-8')));
  assert(leaks.length === 0, 'no server action / auth guard / API route reads the client caches', leaks.join(', '));

  const adminPages = walk(path.join(ROOT, 'src/app/admin')).filter((f) => f.endsWith('page.tsx'));
  const unguarded = adminPages.filter((f) => !/requireAdmin\(|requireSuperAdmin\(|requireHackathonReviewScope\(|requireHackathonScope\(|getCurrentAdminProfile\(/.test(fs.readFileSync(f, 'utf-8')));
  assert(adminPages.length >= 10 && unguarded.length === 0, `every /admin page still authorizes itself server-side (${adminPages.length} pages checked)`, unguarded.join(', '));

  const layout = read('src/app/admin/layout.tsx');
  assert(/requireAdmin\(\)/.test(layout), 'the admin layout requires an active admin before rendering the shell');
  assert(!/admin-nav-cache|sessionStorage/.test(layout), 'the layout (server) never touches the client cache');
  const pages = adminPages.map((f) => fs.readFileSync(f, 'utf-8'));
  assert(pages.every((p) => !/admin-layout-context|useInAdminLayout/.test(p)), 'pages do not toggle the layout context themselves');

  console.log('\n[Refresh action reveals nothing to non-admins]');
  function loadAction(user: { id: string } | null, admin: { id: string; is_super_admin: boolean; is_active: boolean } | null) {
    const client = {
      auth: { getUser: async () => ({ data: { user } }) },
      from: (table: string) => {
        if (table === 'admin_profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: admin }) }) }) };
        if (table === 'admin_permissions') return { select: () => ({ eq: async () => ({ data: [{ permission: 'export_data' }] }) }) };
        const counted = { select: () => ({ eq: async () => ({ count: 1, error: null }) }) };
        return counted;
      },
    };
    const p = require.resolve('../../src/lib/supabase/server');
    require.cache[p] = { id: p, filename: p, loaded: true, exports: { createClient: async () => client } } as unknown as NodeModule;
    delete require.cache[require.resolve('../../src/actions/admin-nav-actions')];
    return require('../../src/actions/admin-nav-actions').getMyAdminNavStateAction as () => Promise<{ success: boolean; state?: Record<string, unknown> }>;
  }
  assert((await loadAction(null, null)()).success === false, 'signed-out caller gets nothing');
  assert((await loadAction({ id: 's1' }, null)()).success === false, 'a student (no admin profile) gets nothing');
  assert((await loadAction({ id: 'a1' }, { id: 'a1', is_super_admin: true, is_active: false })()).success === false, 'a deactivated admin gets nothing (and the client clears its cache)');
  const ok = await loadAction({ id: 'a1' }, { id: 'a1', is_super_admin: false, is_active: true })();
  assert(
    ok.success && ok.state?.adminId === 'a1' && ok.state?.hasAssignments === true && JSON.stringify(ok.state?.permissions) === '["export_data"]',
    'an active admin gets only their own id, role, permission names and assignment flag'
  );

  console.log(`\n=== Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%) ===`);
  if (passed !== total) process.exit(1);
}

run().catch((e) => { console.error('Fatal test error:', e); process.exit(1); });
