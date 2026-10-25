// Covers the top-right header avatar data path shared by every student page:
// getMyHeaderProfileAction (identity + signed photo URL) and the client cache.
export {};

const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

async function run() {
  console.log('=== NMIT HackLeague: Header Profile Photo Tests ===\n');
  let passed = 0;
  let total = 0;
  function assert(cond: boolean, name: string, detail?: string) {
    total++;
    if (cond) { console.log(`  ✓ [PASS] ${name}`); passed++; }
    else console.error(`  ✗ [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
  }

  type Row = { full_name: string; usn: string | null; profile_photo_path: string | null } | null;
  let signCalls: { bucket: string; path: string; ttl: number }[] = [];
  let signResult: { data: { signedUrl: string } | null; error: unknown } = { data: { signedUrl: 'https://signed.example/photo?t=1' }, error: null };

  function load(user: { id: string } | null, row: Row) {
    signCalls = [];
    const client = {
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from: (table: string) => {
        if (table !== 'profiles') throw new Error(`unexpected table ${table}`);
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) };
      },
      storage: {
        from: (bucket: string) => ({
          createSignedUrl: async (path: string, ttl: number) => {
            signCalls.push({ bucket, path, ttl });
            return signResult;
          },
        }),
      },
    };
    const p = require.resolve('../../src/lib/supabase/server');
    require.cache[p] = { id: p, filename: p, loaded: true, exports: { createClient: async () => client } } as unknown as NodeModule;
    delete require.cache[require.resolve('../../src/actions/header-profile-actions')];
    return require('../../src/actions/header-profile-actions').getMyHeaderProfileAction as () => Promise<{
      success: boolean;
      profile?: { full_name: string; usn: string | null; avatarUrl: string | null };
    }>;
  }

  console.log('[Student with a profile photo]');
  let res = await load({ id: 'u1' }, { full_name: 'Test Student', usn: '1NT22CS001', profile_photo_path: 'u1/photo.jpg' })();
  assert(res.success === true, 'returns success');
  assert(res.profile?.full_name === 'Test Student' && res.profile?.usn === '1NT22CS001', 'returns name and USN for the header');
  assert(res.profile?.avatarUrl === 'https://signed.example/photo?t=1', 'returns the signed photo URL');
  assert(
    signCalls.length === 1 && signCalls[0].bucket === 'profile-photos' && signCalls[0].path === 'u1/photo.jpg' && signCalls[0].ttl === 900,
    'signs the private profile-photos object for 15 minutes', JSON.stringify(signCalls)
  );

  console.log('\n[Student without a photo]');
  res = await load({ id: 'u2' }, { full_name: 'No Photo', usn: null, profile_photo_path: null })();
  assert(res.success === true && res.profile?.avatarUrl === null, 'avatarUrl is null (header keeps the initials fallback)');
  assert(signCalls.length === 0, 'no signing request when there is no photo path');

  console.log('\n[Signing failure]');
  signResult = { data: null, error: { message: 'object not found' } };
  res = await load({ id: 'u3' }, { full_name: 'Missing File', usn: null, profile_photo_path: 'u3/gone.jpg' })();
  assert(res.success === true && res.profile?.avatarUrl === null, 'a missing/unsignable photo degrades to null instead of failing the whole header');
  signResult = { data: { signedUrl: 'https://signed.example/photo?t=1' }, error: null };

  console.log('\n[Non-students and signed-out callers]');
  res = await load({ id: 'admin-1' }, null)();
  assert(res.success === false, 'a user with no student profile (e.g. an admin) gets success:false, no error');
  res = await load(null, null)();
  assert(res.success === false, 'a signed-out caller gets success:false');

  console.log('\n[Client cache]');
  const cache = require('../../src/lib/student/header-profile-cache');
  const value = { full_name: 'Cached', usn: null, avatarUrl: 'https://signed.example/c' };
  assert(cache.readHeaderProfileCache() === null, 'cache starts empty');
  cache.writeHeaderProfileCache(value);
  assert(cache.readHeaderProfileCache() === value, 'a written value is returned');
  cache.clearHeaderProfileCache();
  assert(cache.readHeaderProfileCache() === null, 'clearing (done on sign-out) removes the previous user\'s profile');

  console.log(`\n=== Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%) ===`);
  if (passed !== total) process.exit(1);
}

run().catch((e) => { console.error('Fatal test error:', e); process.exit(1); });
