import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

import { createClient } from '@supabase/supabase-js';
import { testBackupRestoration } from '../../scripts/test-backup-restoration';

// Import server-only modules after require.cache patch
const { sendTransactionalEmail } = require('../../src/lib/email/resend-service');
const { checkSystemHealth } = require('../../src/lib/reliability/health-service');

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

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition: boolean, testId: string, testName: string, detail?: string) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  ✓ [PASS] [${testId}] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] [${testId}] ${testName} ${detail ? `(${detail})` : ''}`);
    throw new Error(`Assertion failed: [${testId}] ${testName} ${detail || ''}`);
  }
}

async function getSuperAdminClient() {
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: 'superadmin@nmit-dev.local',
    password: 'password123',
  });

  if (signInErr || !signInData.session) {
    throw new Error(`Failed to authenticate Super Admin seed: ${signInErr?.message}`);
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
  });

  return { adminId: signInData.user.id, email: 'superadmin@nmit-dev.local', client };
}

async function runTests() {
  console.log('================================================================');
  console.log(' Phase 12: Notifications & Reliability Integration Test Suite');
  console.log('================================================================\n');

  const superAdmin = await getSuperAdminClient();

  // --------------------------------------------------------------------------
  // Test 1: Transactional Email & Duplicate Prevention (Idempotency)
  // --------------------------------------------------------------------------
  console.log('[P12-INT-01] Transactional Email Service & Idempotency Duplicate Prevention');

  const testIdempotencyKey = `p12_test_idem_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const testEmail = 'student.verify@nmit-test.ac.in';

  // 1a: Dispatch email
  const initialResult = await sendTransactionalEmail({
    to: testEmail,
    subject: 'NMIT HackLeague: Account Verification Code',
    template: 'account_verification',
    variables: { name: 'Student Test', otp: '123456' },
    idempotencyKey: testIdempotencyKey,
  });

  assert(initialResult.success === true, 'P12-INT-01a', 'Initial email dispatch succeeds');
  assert(!!initialResult.messageId, 'P12-INT-01b', 'Returns valid delivery message ID');

  // 1b: Verify log in PostgreSQL public.email_delivery_logs
  const { data: emailLog, error: logErr } = await adminClient
    .from('email_delivery_logs')
    .select('id, recipient_email, template_name, status, idempotency_key, payload')
    .eq('idempotency_key', testIdempotencyKey)
    .single();

  assert(!logErr && !!emailLog, 'P12-INT-01c', 'Email delivery log stored in PostgreSQL', logErr?.message);
  assert(emailLog?.recipient_email === testEmail, 'P12-INT-01d', 'Log recipient matches dispatch recipient');
  assert(emailLog?.template_name === 'account_verification', 'P12-INT-01e', 'Log template name matches');
  assert((emailLog?.payload as any)?.otp === '[REDACTED]', 'P12-INT-01e2', 'OTP is redacted in email delivery log payload');

  // 1c: Re-dispatch with identical idempotencyKey: must be prevented
  const duplicateResult = await sendTransactionalEmail({
    to: testEmail,
    subject: 'NMIT HackLeague: Account Verification Code',
    template: 'account_verification',
    variables: { name: 'Student Test', otp: '123456' },
    idempotencyKey: testIdempotencyKey,
  });

  assert(duplicateResult.success === true, 'P12-INT-01f', 'Duplicate call returns success');
  assert(duplicateResult.duplicatePrevented === true, 'P12-INT-01g', 'Duplicate dispatch strictly prevented via idempotency key');

  // 1d: Verify other transactional templates render and dispatch cleanly
  const templates = ['password_recovery', 'profile_change_decision', 'team_invitation', 'deadline_reminder'] as const;
  for (const t of templates) {
    const res = await sendTransactionalEmail({
      to: testEmail,
      subject: `Testing template ${t}`,
      template: t,
      variables: {
        name: 'Student',
        resetUrl: 'https://hackleague.nmit.ac.in/reset-password',
        fieldName: 'Full Name',
        status: 'approved',
        reviewerNotes: 'Verified with university registry',
        teamName: 'Alpha Coders',
        inviterName: 'Jane Doe',
        hackathonTitle: 'HackLeague 2026',
        inviteCode: 'INV-1234',
        roundName: 'Round 1 Submission',
        deadlineTime: 'Tomorrow at 11:59 PM',
      },
      idempotencyKey: `p12_template_${t}_${Date.now()}`,
    });
    assert(res.success === true, 'P12-INT-01h', `Template ${t} renders and dispatches successfully`);
  }

  // 1e: Simulation prevention in production environment
  const originalEnv = process.env.NODE_ENV;
  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const prodResult = await sendTransactionalEmail({
      to: testEmail,
      subject: 'Production Simulation Rejection Test',
      template: 'account_verification',
      variables: { name: 'Student Test', otp: '123456' },
      idempotencyKey: `prod_test_${Date.now()}`,
    });
    assert(
      prodResult.success === false && prodResult.isSimulated === false,
      'P12-INT-01i',
      'Simulation strictly disallowed in production environment'
    );
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
  }

  // --------------------------------------------------------------------------
  // Test 2: Global and Scoped Announcement Publishing
  // --------------------------------------------------------------------------
  console.log('\n[P12-INT-02] Global and Scoped Announcement Publishing & Auditing');

  // 2a: Global announcement publication
  const { data: globalAnn, error: globalErr } = await superAdmin.client.rpc(
    'publish_announcement' as never,
    {
      p_title: 'Global Campus Notice: Phase 12 Verified',
      p_body: 'This is an institutional broadcast addressed to all campus participants.',
      p_target_role: 'all',
      p_hackathon_id: null,
      p_announcement_type: 'general',
      p_metadata: { platform: 'NMIT HackLeague', release: 'Phase 12' },
    } as never
  );

  assert(!globalErr, 'P12-INT-02a', 'publish_announcement executes without error for global announcement', globalErr?.message);
  assert((globalAnn as any)?.success === true, 'P12-INT-02b', 'Global announcement successfully published');
  const globalAnnId = (globalAnn as any)?.announcement_id;
  assert(!!globalAnnId, 'P12-INT-02c', 'Returns valid announcement ID');

  // 2b: Verify record in announcements table
  const { data: annRow } = await adminClient
    .from('announcements')
    .select('id, title, target_role, hackathon_id, announcement_type')
    .eq('id', globalAnnId)
    .single();

  assert(annRow?.title === 'Global Campus Notice: Phase 12 Verified', 'P12-INT-02d', 'Stored announcement title matches');
  assert(annRow?.target_role === 'all', 'P12-INT-02e', 'Stored announcement target_role is all');
  assert(annRow?.hackathon_id === null, 'P12-INT-02f', 'Stored announcement hackathon_id is null');

  // 2c: Scoped announcement to specific hackathon
  const { data: hackathons } = await adminClient.from('hackathons').select('id, title').limit(1);
  if (hackathons && hackathons.length > 0) {
    const testHackathonId = hackathons[0].id;
    const { data: scopedAnn, error: scopedErr } = await superAdmin.client.rpc(
      'publish_announcement' as never,
      {
        p_title: 'Event-Scoped Alert: Hackathon Briefing',
        p_body: 'Participants in this hackathon please report to Hall 3.',
        p_target_role: 'students',
        p_hackathon_id: testHackathonId,
        p_announcement_type: 'urgent',
      } as never
    );

    assert(!scopedErr, 'P12-INT-02g', 'publish_announcement succeeds with hackathon_id scope', scopedErr?.message);
    assert((scopedAnn as any)?.hackathon_id === testHackathonId, 'P12-INT-02h', 'Scoped announcement retains hackathon_id');

    // 2d: Deadline Reminder publication
    const { data: rounds } = await adminClient.from('hackathon_rounds').select('id').eq('hackathon_id', testHackathonId).limit(1);
    if (rounds && rounds.length > 0) {
      const testRoundId = rounds[0].id;
      const { data: deadlineRes, error: deadlineErr } = await superAdmin.client.rpc(
        'publish_deadline_reminder' as never,
        {
          p_hackathon_id: testHackathonId,
          p_round_id: testRoundId,
          p_deadline: new Date(Date.now() + 86400000).toISOString(),
          p_custom_message: 'Final git commit push must be verified before cutoff.',
        } as never
      );

      assert(!deadlineErr, 'P12-INT-02i', 'publish_deadline_reminder executes successfully', deadlineErr?.message);
      assert((deadlineRes as any)?.announcement_type === 'deadline', 'P12-INT-02j', 'Deadline reminder announcement has announcement_type = deadline');
    }
  }

  // --------------------------------------------------------------------------
  // Test 3: Web Push Delivery Outcome Logging & Invalid Subscription Deactivation
  // --------------------------------------------------------------------------
  console.log('\n[P12-INT-03] Web Push Delivery Outcome Logging & Invalid Subscription Deactivation');

  const testEndpoint = `https://fcm.googleapis.com/fcm/send/test_sub_${Date.now()}`;
  const testSubId = crypto.randomUUID();

  // Create temporary test subscription
  await adminClient.from('user_push_subscriptions').insert({
    id: testSubId,
    user_id: superAdmin.adminId,
    endpoint: testEndpoint,
    p256dh: 'test-p256dh-key',
    auth: 'test-auth-key',
    device_fingerprint: `fp-test-${Date.now()}`,
    active: true,
  });

  // Log successful delivery
  const { data: logDelivered, error: delErr } = await adminClient.rpc(
    'log_push_delivery_outcome' as never,
    {
      p_announcement_id: globalAnnId,
      p_subscription_id: testSubId,
      p_user_id: superAdmin.adminId,
      p_endpoint: testEndpoint,
      p_status: 'delivered',
      p_status_code: 201,
      p_error_message: null,
      p_attempt_count: 1,
    } as never
  );

  assert(!delErr && !!logDelivered, 'P12-INT-03a', 'log_push_delivery_outcome records delivered status', delErr?.message);

  // Log 410 Gone / expired endpoint: must automatically deactivate subscription
  const { data: logExpired, error: expErr } = await adminClient.rpc(
    'log_push_delivery_outcome' as never,
    {
      p_announcement_id: globalAnnId,
      p_subscription_id: testSubId,
      p_user_id: superAdmin.adminId,
      p_endpoint: testEndpoint,
      p_status: 'expired',
      p_status_code: 410,
      p_error_message: 'Push subscription expired at push gateway',
      p_attempt_count: 2,
    } as never
  );

  assert(!expErr && !!logExpired, 'P12-INT-03b', 'log_push_delivery_outcome records expired status', expErr?.message);

  // Check subscription was deactivated in database
  const { data: updatedSub } = await adminClient
    .from('user_push_subscriptions')
    .select('active')
    .eq('id', testSubId)
    .single();

  assert(updatedSub?.active === false, 'P12-INT-03c', 'Expired endpoint automatically set to active = false in PostgreSQL');

  // Verify push delivery log row
  const { data: pushLog } = await adminClient
    .from('push_delivery_logs')
    .select('status, status_code, attempt_count')
    .eq('id', logExpired)
    .single();

  assert(pushLog?.status === 'expired', 'P12-INT-03d', 'Push delivery log status is expired');
  assert(pushLog?.status_code === 410, 'P12-INT-03e', 'Push delivery log records status code 410');
  assert(pushLog?.attempt_count === 2, 'P12-INT-03f', 'Push delivery log records attempt count = 2');

  // Clean up test subscription
  await adminClient.from('user_push_subscriptions').delete().eq('id', testSubId);

  // 3g: Validate push endpoint security (SSRF prevention, ports, credentials)
  const { validatePushEndpoint } = require('../../src/lib/notifications/endpoint-validator');

  const credEndpoint = await validatePushEndpoint('https://user:pass@fcm.googleapis.com/fcm/send/123');
  assert(credEndpoint.valid === false && credEndpoint.error?.includes('user credentials'), 'P12-INT-03g', 'Push endpoint with credentials rejected');

  const portEndpoint = await validatePushEndpoint('https://fcm.googleapis.com:8080/fcm/send/123');
  assert(portEndpoint.valid === false && portEndpoint.error?.includes('standard HTTPS port'), 'P12-INT-03h', 'Push endpoint with non-standard port rejected');

  const validEndpoint = await validatePushEndpoint('https://fcm.googleapis.com/fcm/send/valid123', { resolveDns: false });
  assert(validEndpoint.valid === true, 'P12-INT-03i', 'Standard authorized push gateway endpoint accepted');

  // --------------------------------------------------------------------------
  // Test 4: System Health, Reliability & Supabase Free Plan Limitations
  // --------------------------------------------------------------------------
  console.log('\n[P12-INT-04] System Operational Health & Free-Plan Keepalive Documentation');

  const healthReport = await checkSystemHealth();

  assert(healthReport.status === 'healthy' || healthReport.status === 'degraded', 'P12-INT-04a', 'Health service returns operational status');
  assert(healthReport.database.connected === true, 'P12-INT-04b', 'Database connectivity confirmed true');
  assert(typeof healthReport.latencyMs === 'number' && healthReport.latencyMs >= 0, 'P12-INT-04c', 'Database ping latency recorded in milliseconds');
  assert(
    healthReport.reliabilityNotice.includes('Supabase Free plan') || healthReport.reliabilityNotice.includes('Free plan'),
    'P12-INT-04d',
    'Supabase Free plan operational limitations documented in health report'
  );

  // 4e: Verify unauthenticated public /api/health response sanitization
  const { GET: healthGet } = require('../../src/app/api/health/route');
  const publicReq = new Request('http://localhost/api/health');
  const healthResp = await healthGet(publicReq);
  const healthJson = await healthResp.json();

  assert(healthJson.status === 'healthy' || healthJson.status === 'degraded', 'P12-INT-04e', 'Public health endpoint returns status');
  assert(typeof healthJson.latencyMs === 'number', 'P12-INT-04f', 'Public health endpoint includes latency');
  assert(healthJson.database === undefined, 'P12-INT-04g', 'Public health endpoint does NOT leak internal database counts');
  assert(healthJson.storage === undefined, 'P12-INT-04h', 'Public health endpoint does NOT leak internal storage details');

  // --------------------------------------------------------------------------
  // Test 5: Independent Database Backup & Restoration Testing
  // --------------------------------------------------------------------------
  console.log('\n[P12-INT-05] Independent Database Backup & Restoration Verification');

  const restorationReport = await testBackupRestoration();

  assert(restorationReport.success === true, 'P12-INT-05a', 'Backup restoration test execution succeeded');
  assert(restorationReport.checksumVerified === true, 'P12-INT-05b', 'Backup file SHA-256 checksum verified against manifest');
  assert(restorationReport.schemaVerification.missingTables.length === 0, 'P12-INT-05c', 'All critical institutional tables present in backup');
  assert(restorationReport.restorationExecution.success === true, 'P12-INT-05d', 'Schema restoration in isolated test container succeeded');

  console.log('\n================================================================');
  console.log(` Phase 12 Integration Test Results: ${passedAssertions}/${totalAssertions} assertions passed`);
  console.log(' ALL TESTS PASSED SUCCESSFULLY');
  console.log('================================================================\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nTest runner failed:', err);
    process.exit(1);
  });
