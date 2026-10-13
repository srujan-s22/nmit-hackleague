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

async function runOnboardingTests() {
  console.log('--- Starting Onboarding, Review & Deletion Integration Tests ---');
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
  let studentUid = '';
  let studentClient: typeof client | null = null;
  let verifierClient: typeof client | null = null;

  try {
    // ------------------------------------------------------------------------
    // Step 1: Create a fresh test student via GoTrue
    // ------------------------------------------------------------------------
    const studentEmail = `student.onboarding.${runId}@example.com`;
    const studentUsn = `1NT23CS${runId.slice(-3)}`;
    const studentPassword = 'Password123!';

    const { data: signUpData, error: signUpError } = await client.auth.signUp({
      email: studentEmail,
      password: studentPassword,
      options: {
        data: {
          full_name: 'Onboarding Test Student',
          usn: studentUsn,
          phone: '+919988776655',
          branch: 'CSE',
          academic_year: 3,
          sex: 'Male',
          date_of_birth: '2004-03-20',
        },
      },
    });

    assert(!signUpError && !!signUpData.user, 'Step 1a: Test student registered via GoTrue', signUpError?.message);
    studentUid = signUpData.user!.id;

    // Confirm student email via admin client for immediate session creation
    await adminClient.auth.admin.updateUserById(studentUid, {
      email_confirm: true,
    });

    // Create authenticated student client
    studentClient = createClient(supabaseUrl, anonKey);
    const { error: signInError } = await studentClient.auth.signInWithPassword({
      email: studentEmail,
      password: studentPassword,
    });
    assert(!signInError, 'Step 1b: Authenticated student session established', signInError?.message);

    // ------------------------------------------------------------------------
    // Step 2: Upload College ID to private storage & update profile in draft
    // ------------------------------------------------------------------------
    const fakeIdContent = Buffer.from('FAKE_COLLEGE_ID_PNG_HEADER_DATA');
    const storagePath1 = `${studentUid}/card_v1.png`;

    const { error: uploadError1 } = await studentClient.storage
      .from('college-ids')
      .upload(storagePath1, fakeIdContent, { contentType: 'image/png' });

    assert(!uploadError1, 'Step 2a: Student uploads College ID into own storage folder', uploadError1?.message);

    const { error: profileUpdateError } = await studentClient
      .from('profiles')
      .update({ college_id_path: storagePath1 })
      .eq('id', studentUid);

    assert(!profileUpdateError, 'Step 2b: Student links storage path to profile in draft', profileUpdateError?.message);

    // ------------------------------------------------------------------------
    // Step 3: Submit profile for review via RPC -> transitions to 'under_review'
    // ------------------------------------------------------------------------
    const { data: submitData, error: submitError } = await studentClient.rpc('submit_profile_for_review');
    assert(!submitError && (submitData as { success?: boolean })?.success === true, 'Step 3a: submit_profile_for_review RPC succeeds', submitError?.message);

    const { data: profileCheck1 } = await adminClient
      .from('profiles')
      .select('registration_status')
      .eq('id', studentUid)
      .single();

    assert(profileCheck1?.registration_status === 'under_review', 'Step 3b: Profile status transitioned to under_review');

    // ------------------------------------------------------------------------
    // Step 4: Verifier Admin requests correction
    // ------------------------------------------------------------------------
    verifierClient = createClient(supabaseUrl, anonKey);
    const { error: verifierSignInError } = await verifierClient.auth.signInWithPassword({
      email: 'verifier.admin@nmit-dev.local',
      password: 'password123',
    });
    assert(!verifierSignInError, 'Step 4a: Verifier admin session established', verifierSignInError?.message);

    const { data: reviewData1, error: reviewError1 } = await verifierClient.rpc('review_student_registration', {
      p_student_id: studentUid,
      p_decision: 'correction_required',
      p_rejection_reason: 'Photo is blurry, please provide a clear image',
    });

    assert(!reviewError1 && (reviewData1 as { success?: boolean })?.success === true, 'Step 4b: Admin requests correction via review_student_registration RPC', reviewError1?.message);

    // Verify status and zero deletion queue entries
    const { data: profileCheck2 } = await adminClient
      .from('profiles')
      .select('registration_status, rejection_reason')
      .eq('id', studentUid)
      .single();

    assert(
      profileCheck2?.registration_status === 'correction_required' &&
      profileCheck2?.rejection_reason === 'Photo is blurry, please provide a clear image',
      'Step 4c: Profile status is correction_required with reviewer feedback stored'
    );

    const { data: queueCheck1 } = await adminClient
      .from('storage_deletion_queue')
      .select('id')
      .eq('object_path', storagePath1);

    assert((queueCheck1?.length || 0) === 0, 'Step 4d: Active ID retained in storage; zero deletion queue jobs enqueued');

    // ------------------------------------------------------------------------
    // Step 5: Student uploads replacement ID & calls replace_college_id RPC
    // ------------------------------------------------------------------------
    const storagePath2 = `${studentUid}/card_v2.png`;
    const { error: uploadError2 } = await studentClient.storage
      .from('college-ids')
      .upload(storagePath2, fakeIdContent, { contentType: 'image/png' });

    assert(!uploadError2, 'Step 5a: Student uploads replacement ID card file', uploadError2?.message);

    const { data: replaceData, error: replaceError } = await studentClient.rpc('replace_college_id', {
      p_new_storage_path: storagePath2,
    });

    assert(!replaceError && (replaceData as { success?: boolean })?.success === true, 'Step 5b: replace_college_id RPC succeeds atomically', replaceError?.message);

    // Verify superseded ID was enqueued for deletion
    const { data: queueCheck2 } = await adminClient
      .from('storage_deletion_queue')
      .select('*')
      .eq('object_path', storagePath1)
      .single();

    assert(
      queueCheck2?.target_type === 'profile_college_id_superseded' && queueCheck2?.status === 'pending',
      'Step 5c: Superseded ID card enqueued into storage_deletion_queue with target_type profile_college_id_superseded'
    );

    // ------------------------------------------------------------------------
    // Step 6: Student resubmits for review -> Admin approves
    // ------------------------------------------------------------------------
    const { error: resubmitError } = await studentClient.rpc('submit_profile_for_review');
    assert(!resubmitError, 'Step 6a: Student resubmits profile from correction_required to under_review', resubmitError?.message);

    const { data: reviewData2, error: reviewError2 } = await verifierClient.rpc('review_student_registration', {
      p_student_id: studentUid,
      p_decision: 'approved',
    });

    assert(!reviewError2 && (reviewData2 as { success?: boolean })?.success === true, 'Step 6b: Admin approves student registration', reviewError2?.message);

    // Verify active ID enqueued for final deletion upon approval
    const { data: queueCheck3 } = await adminClient
      .from('storage_deletion_queue')
      .select('*')
      .eq('object_path', storagePath2)
      .single();

    assert(
      queueCheck3?.target_type === 'profile_college_id' && queueCheck3?.status === 'pending',
      'Step 6c: Verified College ID enqueued for secure background deletion with target_type profile_college_id'
    );

    // ------------------------------------------------------------------------
    // Step 7: Deletion Worker execution via atomic RPCs
    // ------------------------------------------------------------------------
    const workerId = `worker-${runId}`;
    const { data: claimed, error: claimErr } = await adminClient.rpc('claim_storage_deletion_jobs', {
      p_worker_id: workerId,
      p_batch_size: 10,
      p_lease_seconds: 60,
    });

    assert(!claimErr && Array.isArray(claimed) && claimed.length >= 2, 'Step 7a: Worker claims pending deletion jobs with lease lock');

    // Delete from storage
    const { error: storageDeleteError1 } = await adminClient.storage
      .from('college-ids')
      .remove([storagePath1]);
    const { error: storageDeleteError2 } = await adminClient.storage
      .from('college-ids')
      .remove([storagePath2]);

    assert(!storageDeleteError1 && !storageDeleteError2, 'Step 7b: Storage deletion removes objects from storage');

    // Complete jobs via complete_storage_deletion_job RPC
    for (const job of ((claimed as unknown) as Array<{ object_path: string; job_id: string; lease_token: string }>) || []) {
      if (job.object_path === storagePath1 || job.object_path === storagePath2) {
        await adminClient.rpc('complete_storage_deletion_job', {
          p_job_id: job.job_id,
          p_lease_token: job.lease_token,
        });
      }
    }

    const { data: finalProfile } = await adminClient
      .from('profiles')
      .select('registration_status, college_id_deleted_at, college_id_path')
      .eq('id', studentUid)
      .single();

    assert(
      finalProfile?.registration_status === 'approved' &&
      finalProfile?.college_id_path === null &&
      !!finalProfile?.college_id_deleted_at,
      'Step 7c: complete_storage_deletion_job clears college_id_path and records college_id_deleted_at'
    );

  } catch (err) {
    console.error('Unexpected integration test error:', err);
  } finally {
    // Clean up test user
    if (studentUid) {
      await adminClient.auth.admin.deleteUser(studentUid);
    }
  }

  console.log(`\nResults: ${passed}/${total} assertions passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runOnboardingTests();
