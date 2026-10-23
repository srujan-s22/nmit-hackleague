// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

// Mock next/headers
const nextHeadersPath = require.resolve('next/headers');
require.cache[nextHeadersPath] = {
  id: nextHeadersPath,
  filename: nextHeadersPath,
  loaded: true,
  exports: {
    headers: async () => ({
      get: (headerName: string) => {
        if (headerName.toLowerCase() === 'x-forwarded-for') {
          return '127.0.0.1';
        }
        return null;
      },
    }),
  },
} as unknown as NodeModule;

// Import modules after require.cache patch
const { formatUpdatedTime } = require('../../src/app/admin/admin-dashboard-client');

async function runRateLimiterAndHydrationTests() {
  console.log('=== NMIT HackLeague: Rate Limiter & Hydration Unit Tests ===\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  // --------------------------------------------------------------------------
  // Suite 1: Admin Dashboard Hydration-Safe Timestamp Formatting
  // --------------------------------------------------------------------------
  console.log('[Suite 1: Admin Dashboard Hydration-Safe Timestamp Formatting]');

  const testIsoTime = '2026-10-23T08:32:58.000Z';

  // Test 1a: Server-side rendering (isMounted = false) always returns "Just now"
  const serverOutput = formatUpdatedTime(testIsoTime, false);
  assert(
    serverOutput === 'Just now',
    'Server SSR render (isMounted=false) produces deterministic "Just now" placeholder'
  );

  // Test 1b: Client initial hydration (isMounted = false) matches server render identically
  const initialClientHydrationOutput = formatUpdatedTime(testIsoTime, false);
  assert(
    initialClientHydrationOutput === serverOutput,
    'Client initial hydration matches server output identically (no hydration mismatch)'
  );

  // Test 1c: Post-mount client render (isMounted = true) produces localized time
  const mountedClientOutput = formatUpdatedTime(testIsoTime, true);
  const expectedLocalTime = new Date(testIsoTime).toLocaleTimeString();
  assert(
    mountedClientOutput === expectedLocalTime,
    'Post-mount client render (isMounted=true) produces client-localized time'
  );

  // Test 1d: Null/undefined timestamp gracefully returns "Just now"
  assert(
    formatUpdatedTime(null, true) === 'Just now',
    'Null timestamp returns "Just now"'
  );
  assert(
    formatUpdatedTime(undefined, true) === 'Just now',
    'Undefined timestamp returns "Just now"'
  );
  assert(
    formatUpdatedTime(null, false) === 'Just now',
    'Null timestamp during SSR returns "Just now"'
  );

  // Test 1e: Corrupted/invalid timestamp gracefully returns "Just now" without throwing
  assert(
    formatUpdatedTime('invalid-iso-date', true) === 'Just now',
    'Invalid date string returns "Just now"'
  );

  // --------------------------------------------------------------------------
  // Suite 2: Rate Limiter Development Bypass & Production Enforcement
  // --------------------------------------------------------------------------
  console.log('\n[Suite 2: Signup Rate Limiter Development Bypass & Production Enforcement]');

  const originalNodeEnv = process.env.NODE_ENV;
  const originalHmacSecret = process.env.RATE_LIMIT_HMAC_SECRET;
  process.env.RATE_LIMIT_HMAC_SECRET = 'a'.repeat(32); // Valid 32-char secret

  // Mock Supabase admin client module
  let rpcCallCount = 0;
  let rpcMockResult: { data: boolean; error: Error | null } = { data: true, error: null };

  const adminModulePath = require.resolve('../../src/lib/supabase/admin');
  require.cache[adminModulePath] = {
    id: adminModulePath,
    filename: adminModulePath,
    loaded: true,
    exports: {
      createAdminClient: () => ({
        rpc: async (_rpcName: string, _args: any) => {
          rpcCallCount++;
          return rpcMockResult;
        },
      }),
    },
  } as unknown as NodeModule;

  // Import rate limiter after require.cache patches
  const { checkRateLimit } = require('../../src/lib/auth/rate-limiter');

  // Test 2a: In development mode, checkRateLimit('signup') returns true immediately
  try {
    (process.env as any).NODE_ENV = 'development';
    rpcCallCount = 0;
    const devAllowed = await checkRateLimit('signup', 'mock_dev_key');
    assert(devAllowed === true, 'In development mode, checkRateLimit("signup") returns true');
    assert(rpcCallCount === 0, 'In development mode, consume_rate_limit RPC is completely skipped');
  } catch (err: any) {
    assert(false, 'Development mode rate limiter test threw error', err.message);
  }

  // Test 2b: In production mode, checkRateLimit('signup') calls consume_rate_limit RPC
  try {
    (process.env as any).NODE_ENV = 'production';
    rpcCallCount = 0;
    rpcMockResult = { data: true, error: null };
    const prodAllowed = await checkRateLimit('signup', 'mock_valid_key_1234567890');
    assert(prodAllowed === true, 'In production mode, permitted request returns true');
    assert(rpcCallCount === 1, 'In production mode, consume_rate_limit RPC is invoked');
  } catch (err: any) {
    assert(false, 'Production mode permitted test threw error', err.message);
  }

  // Test 2c: In production mode, checkRateLimit('signup') enforces rejection when RPC returns false
  try {
    (process.env as any).NODE_ENV = 'production';
    rpcCallCount = 0;
    rpcMockResult = { data: false, error: null };
    const prodBlocked = await checkRateLimit('signup', 'mock_valid_key_1234567890');
    assert(prodBlocked === false, 'In production mode, exceeded quota returns false (rejected)');
    assert(rpcCallCount === 1, 'In production mode, rejection verified via RPC');
  } catch (err: any) {
    assert(false, 'Production mode rejection test threw error', err.message);
  }

  // Test 2d: In production mode, RPC failure throws operational error
  try {
    (process.env as any).NODE_ENV = 'production';
    rpcCallCount = 0;
    rpcMockResult = { data: false, error: new Error('PostgreSQL RPC connection timeout') };
    let threw = false;
    try {
      await checkRateLimit('signup', 'mock_valid_key_1234567890');
    } catch {
      threw = true;
    }
    assert(threw, 'In production mode, database RPC error bubbles up as exception');
  } catch (err: any) {
    assert(false, 'Production mode RPC failure test threw error', err.message);
  }

  // Cleanup environment variables
  (process.env as any).NODE_ENV = originalNodeEnv;
  process.env.RATE_LIMIT_HMAC_SECRET = originalHmacSecret;

  console.log('\n========================================');
  console.log(`Test Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('========================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runRateLimiterAndHydrationTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
