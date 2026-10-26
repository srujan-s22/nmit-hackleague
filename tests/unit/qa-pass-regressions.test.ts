// Regression guards for bugs found in the hosted end-to-end QA pass (2026-10-26).
// Database behaviour for the matching migrations (20261101000001..06) was verified
// on the hosted project during the pass; these checks keep the application-side
// fixes from silently regressing.
export {};

import fs from 'node:fs';
import path from 'node:path';

const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as unknown as NodeModule;

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

async function run() {
  console.log('=== NMIT HackLeague: QA Pass Regression Tests ===\n');
  let passed = 0;
  let total = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    total++;
    if (cond) { console.log(`  ✓ [PASS] ${name}`); passed++; }
    else console.error(`  ✗ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
  }

  console.log('[Round submissions]');
  const actions = read('src/actions/round-submission-actions.ts');
  assert((actions.match(/p_evidence_sha256: evidenceSha256/g) || []).length === 2, 'submit and resubmit pass the server-computed evidence SHA-256 to the database');
  assert((actions.match(/await refreshRoundStatuses\(supabase\)/g) || []).length === 2, 'submit and resubmit advance round statuses before calling the RPC');
  const teamQueries = read('src/lib/teams/queries.ts');
  assert(/github_url:repo_url/.test(teamQueries) && /live_demo_url:demo_url/.test(teamQueries) && /submitted_at:created_at/.test(teamQueries),
    'team page selects real submission columns (aliased), so submitted work is displayed');
  assert(!/\n\s+github_url,\n/.test(teamQueries), 'team page no longer selects the non-existent github_url column');

  const { refreshRoundStatuses } = require('../../src/lib/hackathons/round-status');
  const calls: unknown[] = [];
  await refreshRoundStatuses({ rpc: async (fn: string, args: unknown) => { calls.push([fn, args]); return { error: null }; } }, 'h1');
  assert(JSON.stringify(calls) === JSON.stringify([['refresh_round_statuses', { p_hackathon_id: 'h1' }]]), 'refreshRoundStatuses calls the RPC with the hackathon id');
  let threw = false;
  try {
    await refreshRoundStatuses({ rpc: async () => { throw new Error('down'); } });
  } catch { threw = true; }
  assert(!threw, 'a failing status refresh never breaks the page');

  console.log('\n[Access redirects]');
  const guards = read('src/lib/auth/guards.ts');
  assert(/permissions\.includes\(requiredPermission\)\)\s*\{[\s\S]{0,200}redirect\('\/admin'\)/.test(guards), 'admin missing a page permission goes to /admin, not /login');
  assert(/if \(adminRow\) redirect\('\/admin'\)/.test(guards), 'admins opening student routes are sent to /admin');
  assert(/if \(adminRow\) \{\s*redirect\('\/admin'\);/.test(read('src/app/onboarding/page.tsx')), 'admins never see student onboarding');

  console.log('\n[UI text]');
  const ui = [...walk(path.join(ROOT, 'src/app')), ...walk(path.join(ROOT, 'src/components'))];
  const nearr = ui.filter((f) => fs.readFileSync(f, 'utf-8').includes('&nearr;'));
  assert(nearr.length === 0, 'no unsupported &nearr; entity left (rendered as literal text)', nearr.join(', '));
  const leaks = ui.filter((f) => f.endsWith('.tsx') && /Supabase Auth|0 DB rows|201 Created|410 Gone|Audited in PostgreSQL/.test(fs.readFileSync(f, 'utf-8')));
  assert(leaks.length === 0, 'no implementation jargon in user-facing copy', leaks.join(', '));
  assert(!/'₹25,000 \+ Trophy'/.test(read('src/components/hackathons/hackathon-form.tsx')), 'new hackathon form no longer pre-fills sample prize amounts');
  assert(!/name: 'Round \d+:/.test(read('src/components/hackathons/round-config-form.tsx')), 'default round names do not repeat the "Round N:" prefix');

  console.log('\n[Auth messages]');
  assert(/incorrect or has expired/.test(read('src/actions/auth-actions.ts')), 'a wrong verification code is not reported as merely "expired"');

  console.log(`\n=== Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%) ===`);
  if (passed !== total) process.exit(1);
}

run().catch((e) => { console.error('Fatal test error:', e); process.exit(1); });
