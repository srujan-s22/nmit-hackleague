import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local if present
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHddiHzlDeINvg_3BJ';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_secret_NMIT_DEVELOPMENT_SERVICE_ROLE_KEY_2026';

const client = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function runTests() {
  console.log('--- Starting Auth & Signup Integration Tests ---');
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

  const runId = Date.now().toString().slice(-6);

  try {
    // ------------------------------------------------------------------------
    // Test 1: Student signup with personal email succeeds & profile in draft
    // ------------------------------------------------------------------------
    const personalEmail = `student.personal.${runId}@gmail.com`;
    const personalUsn = `1NT23CS${runId.slice(-3)}`;
    const { data: user1, error: err1 } = await client.auth.signUp({
      email: personalEmail,
      password: 'Password123!',
      options: {
        data: {
          full_name: 'Personal Email Student',
          usn: personalUsn,
          phone: '+919876543210',
          branch: 'CSE',
          academic_year: 2,
          sex: 'Male',
          date_of_birth: '2004-05-15',
        },
      },
    });

    assert(!err1 && !!user1.user, 'Test 1a: Personal email (Gmail) signup succeeds without rejection', err1?.message);

    if (user1.user) {
      const { data: profile1 } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', user1.user.id)
        .single();

      assert(
        profile1?.registration_status === 'draft' && profile1?.usn === personalUsn,
        'Test 1b: Profile created atomically in draft status with matching USN'
      );
    }

    // ------------------------------------------------------------------------
    // Test 2: Student signup with institutional domain succeeds
    // ------------------------------------------------------------------------
    const instEmail = `student.inst.${runId}@nmit.ac.in`;
    const instUsn = `1NT23IS${runId.slice(-3)}`;
    const { data: user2, error: err2 } = await client.auth.signUp({
      email: instEmail,
      password: 'Password123!',
      options: {
        data: {
          full_name: 'Institutional Email Student',
          usn: instUsn,
          phone: '+919876543211',
          branch: 'ISE',
          academic_year: 2,
          sex: 'Female',
          date_of_birth: '2004-06-20',
        },
      },
    });

    assert(!err2 && !!user2.user, 'Test 2a: Institutional email (@nmit.ac.in) signup succeeds', err2?.message);

    if (user2.user) {
      const { data: profile2 } = await adminClient
        .from('profiles')
        .select('registration_status')
        .eq('id', user2.user.id)
        .single();

      assert(
        profile2?.registration_status === 'draft',
        'Test 2b: Institutional profile created in draft status'
      );
    }

    // ------------------------------------------------------------------------
    // Test 3: Signup missing required demographic fields is aborted atomically
    // ------------------------------------------------------------------------
    const missingDemoEmail = `missing.demo.${runId}@example.com`;
    const { data: user3, error: err3 } = await client.auth.signUp({
      email: missingDemoEmail,
      password: 'Password123!',
      options: {
        data: {
          full_name: 'Incomplete Student',
          usn: `1NT23EC${runId.slice(-3)}`,
          phone: '+919876543212',
          // Missing sex and date_of_birth
        },
      },
    });

    assert(
      !!err3,
      'Test 3a: Signup with missing demographics aborted by database trigger',
      err3 ? err3.message : 'Expected error but succeeded'
    );

    // Verify no user exists in auth or profiles
    const { data: checkUser3 } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', missingDemoEmail)
      .maybeSingle();

    assert(
      !checkUser3,
      'Test 3b: No orphaned profile row created after aborted signup'
    );

    // ------------------------------------------------------------------------
    // Test 4: Duplicate USN registration is aborted atomically
    // ------------------------------------------------------------------------
    const dupUsnEmail = `dup.usn.${runId}@example.com`;
    const { data: user4, error: err4 } = await client.auth.signUp({
      email: dupUsnEmail,
      password: 'Password123!',
      options: {
        data: {
          full_name: 'Duplicate USN Student',
          usn: personalUsn, // Re-using USN from Test 1!
          phone: '+919876543213',
          branch: 'CSE',
          academic_year: 2,
          sex: 'Male',
          date_of_birth: '2004-07-25',
        },
      },
    });

    assert(
      !!err4,
      'Test 4a: Signup with duplicate USN is rejected atomically',
      err4 ? err4.message : 'Expected error'
    );

    // ------------------------------------------------------------------------
    // Test 5: Underage student registration (< 15 years old) rejected
    // ------------------------------------------------------------------------
    const underageEmail = `underage.${runId}@example.com`;
    const today = new Date();
    const underageDob = `${today.getFullYear() - 14}-01-01`; // 14 years old
    const { data: user5, error: err5 } = await client.auth.signUp({
      email: underageEmail,
      password: 'Password123!',
      options: {
        data: {
          full_name: 'Underage Student',
          usn: `1NT23BT${runId.slice(-3)}`,
          phone: '+919876543214',
          branch: 'BT',
          academic_year: 1,
          sex: 'Other',
          date_of_birth: underageDob,
        },
      },
    });

    assert(
      !!err5,
      'Test 5: Underage registration (< 15 years) rejected by trigger',
      err5 ? err5.message : 'Expected error'
    );

    // ------------------------------------------------------------------------
    // Cleanup fixtures
    // ------------------------------------------------------------------------
    if (user1?.user?.id) {
      await adminClient.auth.admin.deleteUser(user1.user.id);
    }
    if (user2?.user?.id) {
      await adminClient.auth.admin.deleteUser(user2.user.id);
    }
    if (user3?.user?.id) {
      await adminClient.auth.admin.deleteUser(user3.user.id);
    }
  } catch (err) {
    console.error('Unexpected test runner exception:', err);
  }

  console.log(`\nResults: ${passed}/${total} assertions passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
