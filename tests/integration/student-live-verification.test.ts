import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env.local
const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx > 0) env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const client = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceKey);

async function runLiveVerification() {
  console.log('=== NMIT HackLeague: Live Student Registration Verification on Hosted Project ===\n');

  const ts = Date.now();
  const testEmail = `student_qa_${ts}@nmit.ac.in`;
  const testUsn = `1NT22CS${(ts % 800 + 100)}`; // e.g. 1NT22CS456

  console.log(`[Step 1] Creating fresh student via Supabase Auth: ${testEmail} (USN: ${testUsn})`);

  // Use adminClient to test user creation and verify trigger execution without consuming rate-limited SMTP quota
  const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
    email: testEmail,
    password: 'TestSecurePassword123!',
    email_confirm: false,
    user_metadata: {
      full_name: 'Priya Nair',
      usn: testUsn,
      phone: '+919876543210',
      branch: 'CSE',
      academic_year: 3,
      sex: 'Female',
      date_of_birth: '2004-02-20',
    },
  });

  if (createError) {
    console.error('✗ [FAIL] Student user creation failed with error:', createError);
    process.exit(1);
  }

  const userId = createData.user?.id;
  console.log(`✓ [PASS] Supabase Auth successfully created student user: ${userId}`);

  // Step 2: Verify profile in database
  console.log('\n[Step 2] Verifying public.profiles atomic creation by trigger...');
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileErr || !profile) {
    console.error('✗ [FAIL] Student profile row not found in public.profiles:', profileErr);
    process.exit(1);
  }

  console.log('✓ [PASS] Student profile row successfully created in public.profiles:');
  console.log(`  - ID: ${profile.id}`);
  console.log(`  - Full Name: ${profile.full_name}`);
  console.log(`  - USN: ${profile.usn}`);
  console.log(`  - Email: ${profile.email}`);
  console.log(`  - Phone: ${profile.phone}`);
  console.log(`  - Branch: ${profile.branch}`);
  console.log(`  - Academic Year: ${profile.academic_year}`);
  console.log(`  - Sex: ${profile.sex}`);
  console.log(`  - Date of Birth: ${profile.date_of_birth}`);
  console.log(`  - Registration Status: ${profile.registration_status} (must be 'draft')`);

  if (profile.registration_status !== 'draft') {
    console.error(`✗ [FAIL] Expected registration_status to be 'draft', got: ${profile.registration_status}`);
    process.exit(1);
  }

  // Step 3: Test duplicate USN collision rejection by hardened trigger
  console.log('\n[Step 3] Testing duplicate USN prevention in trigger...');
  const dupEmail = `student_dup_${ts}@nmit.ac.in`;
  const { data: dupData, error: dupError } = await adminClient.auth.admin.createUser({
    email: dupEmail,
    password: 'TestSecurePassword123!',
    email_confirm: false,
    user_metadata: {
      full_name: 'Imposter Student',
      usn: testUsn, // Collides with already registered USN
      phone: '+919876543210',
      branch: 'CSE',
      academic_year: 3,
      sex: 'Male',
      date_of_birth: '2004-05-15',
    },
  });

  if (dupError) {
    console.log(`✓ [PASS] Duplicate USN correctly rejected by database trigger (Error: ${dupError.message})`);
  } else {
    console.error('✗ [FAIL] Duplicate USN was unexpectedly allowed:', dupData);
    process.exit(1);
  }

  // Step 4: Test case-insensitive sex mapping in hardened trigger
  console.log('\n[Step 4] Testing case-insensitive sex mapping ("male" -> "Male")...');
  const caseTestEmail = `student_case_${ts}@nmit.ac.in`;
  const caseTestUsn = `1NT22IS991`; // Guaranteed distinct USN
  const { data: caseData, error: caseError } = await adminClient.auth.admin.createUser({
    email: caseTestEmail,
    password: 'TestSecurePassword123!',
    email_confirm: false,
    user_metadata: {
      full_name: 'Case Test Student',
      usn: caseTestUsn,
      phone: '+919876543210',
      branch: 'ISE',
      academic_year: 2,
      sex: 'male', // Lowercase!
      date_of_birth: '2004-08-10',
    },
  });

  if (caseError) {
    console.error('✗ [FAIL] Case-insensitive sex test failed:', caseError);
    process.exit(1);
  }

  const { data: caseProfile } = await adminClient
    .from('profiles')
    .select('sex')
    .eq('id', caseData.user.id)
    .single();

  if (caseProfile?.sex === 'Male') {
    console.log('✓ [PASS] Lowercase "male" was successfully mapped to enum "Male" in public.profiles');
  } else {
    console.error('✗ [FAIL] Unexpected profile sex:', caseProfile);
    process.exit(1);
  }

  // Step 5: Test invalid OTP code rejection
  console.log('\n[Step 5] Testing invalid OTP rejection via verifyOtp...');
  const { data: otpData, error: otpError } = await client.auth.verifyOtp({
    email: testEmail,
    token: '000000',
    type: 'signup',
  });

  if (otpError) {
    console.log(`✓ [PASS] Invalid OTP '000000' correctly rejected (Error: ${otpError.message})`);
  } else {
    console.error('✗ [FAIL] Invalid OTP was unexpectedly accepted:', otpData);
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('✓ ALL LIVE HOSTED VERIFICATIONS COMPLETED SUCCESSFULLY');
  console.log('======================================================\n');
}

runLiveVerification().catch((err) => {
  console.error('Fatal error during live verification:', err);
  process.exit(1);
});
