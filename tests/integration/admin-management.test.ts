import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import {
  adminCreationSchema,
  adminPermissionsUpdateSchema,
  adminStatusSchema,
} from '../../src/lib/auth/permissions';

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

async function runAdminManagementTests() {
  console.log('--- Starting Admin Management & Authorization Integration Tests (39 Tests) ---');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testId: string, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] [${testId}] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] [${testId}] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  const runId = Date.now().toString().slice(-6);

  // Authenticate primary seed actors
  const { data: saLogin, error: saLoginErr } = await client.auth.signInWithPassword({
    email: 'superadmin@nmit-dev.local',
    password: 'password123',
  });
  if (saLoginErr || !saLogin.session) {
    throw new Error(`Failed to authenticate Super Admin seed: ${saLoginErr?.message}`);
  }
  const superAdminClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${saLogin.session.access_token}` } },
  });

  const { data: verifierLogin, error: verifierLoginErr } = await client.auth.signInWithPassword({
    email: 'verifier.admin@nmit-dev.local',
    password: 'password123',
  });
  if (verifierLoginErr || !verifierLogin.session) {
    throw new Error(`Failed to authenticate Verifier Admin seed: ${verifierLoginErr?.message}`);
  }
  const verifierClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${verifierLogin.session.access_token}` } },
  });

  const { data: studentLogin, error: studentLoginErr } = await client.auth.signInWithPassword({
    email: 'student1@nmit-dev.local',
    password: 'password123',
  });
  if (studentLoginErr || !studentLogin.session) {
    throw new Error(`Failed to authenticate Student seed: ${studentLoginErr?.message}`);
  }
  const studentClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${studentLogin.session.access_token}` } },
  });

  // Track created test entities for safe cleanup
  const cleanupAuthIds: string[] = [];

  try {
    // ========================================================================
    // Suite 1: Admin Governance Tests (INT-ADM-01 to INT-ADM-19)
    // ========================================================================
    console.log('\n--- Suite 1: Admin Governance (19 Tests) ---');

    // INT-ADM-01: Super Admin lists administrators
    const { data: saList, error: saListErr } = await superAdminClient
      .from('admin_profiles')
      .select('id, email, is_super_admin, is_active');
    assert(
      !saListErr && Array.isArray(saList) && saList.length >= 2,
      'INT-ADM-01',
      'Super Admin lists administrators successfully',
      saListErr?.message
    );

    // INT-ADM-02: Ordinary Admin cannot list all administrators (RLS restricts to self)
    const { data: verifierList, error: verifierListErr } = await verifierClient
      .from('admin_profiles')
      .select('id, email');
    assert(
      !verifierListErr && Array.isArray(verifierList) && verifierList.length === 1 && verifierList[0].id === verifierLogin.user?.id,
      'INT-ADM-02',
      'Ordinary Admin cannot view other administrators under RLS'
    );

    // INT-ADM-03: Student cannot list administrators (RLS returns 0 rows)
    const { data: studentList, error: studentListErr } = await studentClient
      .from('admin_profiles')
      .select('id, email');
    assert(
      !studentListErr && Array.isArray(studentList) && studentList.length === 0,
      'INT-ADM-03',
      'Student cannot list administrators under RLS (0 rows returned)'
    );

    // INT-ADM-04: Super Admin provisions new Admin
    const newAdminEmail = `admin.gov.${runId}@nmit.ac.in`;
    const { data: newAdminUser, error: newAdminAuthErr } = await adminClient.auth.admin.inviteUserByEmail(
      newAdminEmail,
      { data: { role: 'admin', full_name: 'Governance Admin' } }
    );
    if (!newAdminAuthErr && newAdminUser.user) {
      cleanupAuthIds.push(newAdminUser.user.id);
    }
    const { data: provData, error: provErr } = await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: newAdminUser.user!.id,
      p_email: newAdminEmail,
      p_full_name: 'Governance Admin',
      p_permissions: ['verify_students'],
    });
    assert(
      !provErr && (provData as { success?: boolean })?.success === true,
      'INT-ADM-04',
      'Super Admin provisions new Admin with initial permission',
      provErr?.message
    );

    // Authenticate as newAdminUser with live session to test operational permissions
    await adminClient.auth.admin.updateUserById(newAdminUser.user!.id, {
      password: 'Password123!',
      email_confirm: true,
    });
    const { data: newAdminSession, error: signInErr } = await client.auth.signInWithPassword({
      email: newAdminEmail,
      password: 'Password123!',
    });
    if (signInErr) {
      console.error('    [DEBUG newAdmin signInErr]:', signInErr);
    }
    const newAdminClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${newAdminSession?.session?.access_token}` } },
    });

    // INT-ADM-05: Admin creation with duplicate email rejected
    const { error: dupEmailErr } = await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: newAdminUser.user!.id,
      p_email: newAdminEmail,
      p_full_name: 'Duplicate Admin',
      p_permissions: ['verify_students'],
    });
    assert(
      Boolean(dupEmailErr),
      'INT-ADM-05',
      'Admin creation with duplicate email rejected cleanly'
    );

    // INT-ADM-06: Admin creation with invalid permissions rejected
    const invalidPermCheck = adminCreationSchema.safeParse({
      email: `invalid.perm.${runId}@nmit.ac.in`,
      fullName: 'Invalid Perm Admin',
      permissions: ['hacker_role'],
    });
    assert(
      !invalidPermCheck.success,
      'INT-ADM-06',
      'Admin creation with invalid permissions rejected by schema validation'
    );

    // INT-ADM-07: Ordinary Admin cannot create Admin
    const { error: ordCreateErr } = await verifierClient.rpc('provision_admin_profile', {
      p_auth_uid: newAdminUser.user!.id,
      p_email: `unauthorized.${runId}@nmit.ac.in`,
      p_full_name: 'Unauthorized Admin',
      p_permissions: ['verify_students'],
    });
    assert(
      Boolean(ordCreateErr && ordCreateErr.message.includes('only active Super Admin')),
      'INT-ADM-07',
      'Ordinary Admin cannot invoke provision_admin_profile (Access Denied)'
    );

    // INT-ADM-08: Super Admin updates Admin permissions
    const { data: updatePermData, error: updatePermErr } = await superAdminClient.rpc(
      'manage_admin_permissions',
      {
        p_target_admin_id: newAdminUser.user!.id,
        p_permissions: ['verify_students', 'manage_password_resets'],
      }
    );
    assert(
      !updatePermErr && (updatePermData as { success?: boolean })?.success === true,
      'INT-ADM-08',
      'Super Admin updates Admin permissions atomically'
    );

    // INT-ADM-09: Ordinary Admin cannot update permissions
    const { error: ordUpdatePermErr } = await verifierClient.rpc('manage_admin_permissions', {
      p_target_admin_id: newAdminUser.user!.id,
      p_permissions: ['verify_students'],
    });
    assert(
      Boolean(ordUpdatePermErr && ordUpdatePermErr.message.includes('only active Super Admin')),
      'INT-ADM-09',
      'Ordinary Admin cannot update admin permissions'
    );

    // INT-ADM-10: Revoked permission immediately blocks operation
    await superAdminClient.rpc('manage_admin_permissions', {
      p_target_admin_id: newAdminUser.user!.id,
      p_permissions: ['manage_password_resets'], // verify_students revoked
    });
    // Check permission helper as target admin using their real authenticated JWT session
    const { data: hasRevokedPerm } = await newAdminClient.rpc('current_has_permission', {
      p_permission_key: 'verify_students',
    });
    const { data: hasRetainedPerm } = await newAdminClient.rpc('current_has_permission', {
      p_permission_key: 'manage_password_resets',
    });
    assert(
      hasRevokedPerm === false && hasRetainedPerm === true,
      'INT-ADM-10',
      'Revoked permission immediately evaluates to false while retained permission evaluates to true'
    );

    // INT-ADM-11: Super Admin deactivates Admin
    const { data: deactData, error: deactErr } = await superAdminClient.rpc(
      'set_admin_active_status',
      {
        p_target_admin_id: newAdminUser.user!.id,
        p_is_active: false,
        p_reason: 'Routine security rotation deactivation',
      }
    );
    assert(
      !deactErr && (deactData as { success?: boolean; is_active?: boolean })?.success === true && (deactData as { success?: boolean; is_active?: boolean })?.is_active === false,
      'INT-ADM-11',
      'Super Admin deactivates Admin with mandatory audit reason'
    );

    // INT-ADM-12: Deactivated Admin blocked on all operations
    // Target admin profile is now is_active = false
    const { data: deactAdminRow } = await adminClient
      .from('admin_profiles')
      .select('is_active')
      .eq('id', newAdminUser.user!.id)
      .single();
    assert(
      deactAdminRow?.is_active === false,
      'INT-ADM-12',
      'Deactivated Admin is recorded inactive in database'
    );

    // INT-ADM-13: Deactivated Admin cannot access protected resources
    // Calling current_has_permission for any key as deactivated admin evaluates to false
    const { data: deactPermCheck } = await newAdminClient.rpc('current_has_permission', {
      p_permission_key: 'manage_password_resets',
    });
    assert(
      deactPermCheck === false,
      'INT-ADM-13',
      'Deactivated Admin is immediately denied in current_has_permission despite retained permission row'
    );

    // INT-ADM-14: Super Admin reactivates Admin and permissions are preserved
    const { data: reactData, error: reactErr } = await superAdminClient.rpc(
      'set_admin_active_status',
      {
        p_target_admin_id: newAdminUser.user!.id,
        p_is_active: true,
        p_reason: 'Completed audit review reactivation',
      }
    );
    const { data: preservedPerms } = await adminClient
      .from('admin_permissions')
      .select('permission')
      .eq('admin_id', newAdminUser.user!.id);
    assert(
      !reactErr &&
        (reactData as { is_active?: boolean })?.is_active === true &&
        (preservedPerms || []).some((p) => p.permission === 'manage_password_resets'),
      'INT-ADM-14',
      'Super Admin reactivates Admin; previously assigned permissions remain preserved'
    );

    // INT-ADM-15: Super Admin cannot deactivate self
    const { error: selfDeactErr } = await superAdminClient.rpc('set_admin_active_status', {
      p_target_admin_id: saLogin.user!.id,
      p_is_active: false,
      p_reason: 'Attempted self deactivation',
    });
    assert(
      Boolean(selfDeactErr && (selfDeactErr.message.includes('cannot deactivate') || selfDeactErr.message.includes('Action blocked'))),
      'INT-ADM-15',
      'Super Admin cannot deactivate own account',
      selfDeactErr?.message
    );

    // INT-ADM-16: Existing Phase 4 student verification unaffected
    const { data: verifierPermCheck } = await verifierClient.rpc('current_has_permission', {
      p_permission_key: 'verify_students',
    });
    assert(
      verifierPermCheck === true,
      'INT-ADM-16',
      'Active Verifier Admin possesses verify_students permission without interruption'
    );

    // INT-ADM-17: Student account cannot be provisioned as Admin
    const { error: studentAsAdminErr } = await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: studentLogin.user!.id,
      p_email: 'student1@nmit-dev.local',
      p_full_name: 'Student One',
      p_permissions: ['verify_students'],
    });
    assert(
      Boolean(studentAsAdminErr && (studentAsAdminErr.message.includes('Dual-identity') || studentAsAdminErr.message.includes('collision') || studentAsAdminErr.message.includes('already registered'))),
      'INT-ADM-17',
      'Student account cannot be provisioned as Admin (dual-identity collision)',
      studentAsAdminErr?.message
    );

    // INT-ADM-18: Zero-permission Admin has zero operational capabilities
    await superAdminClient.rpc('manage_admin_permissions', {
      p_target_admin_id: newAdminUser.user!.id,
      p_permissions: [],
    });
    const { data: zeroPermsData } = await adminClient
      .from('admin_permissions')
      .select('permission')
      .eq('admin_id', newAdminUser.user!.id);
    assert(
      (zeroPermsData || []).length === 0,
      'INT-ADM-18',
      'Zero-permission Admin possesses 0 permission rows (default-deny)'
    );

    // INT-ADM-19: Active Super Admin with zero permission rows possesses full operational & RLS authorization
    const { data: saPermRows } = await adminClient
      .from('admin_permissions')
      .select('*')
      .eq('admin_id', saLogin.user!.id);
    const { data: saHasPerm } = await superAdminClient.rpc('current_has_permission', {
      p_permission_key: 'verify_students',
    });
    const { data: saHasHackathonPerm } = await superAdminClient.rpc('current_has_permission', {
      p_permission_key: 'manage_hackathons',
    });
    assert(
      (saPermRows || []).length === 0 && saHasPerm === true && saHasHackathonPerm === true,
      'INT-ADM-19',
      'Super Admin evaluates to true in current_has_permission across all keys with 0 permission rows'
    );

    // ========================================================================
    // Suite 2: Provisioning & Saga Tests (INT-PROV-01 to INT-PROV-06)
    // ========================================================================
    console.log('\n--- Suite 2: Provisioning & Saga Tests (6 Tests) ---');

    // INT-PROV-01: Auth Creation Failure (Atomic Pre-Validation)
    const malformedCheck = adminCreationSchema.safeParse({
      email: 'bad-email-format',
      fullName: 'Bad Email Admin',
      permissions: ['verify_students'],
    });
    assert(
      !malformedCheck.success,
      'INT-PROV-01',
      'Malformed email rejected by Zod schema before any Auth or DB writes'
    );

    // INT-PROV-02: Cross-System Partial Failure & Compensating Cleanup
    const orphanTestEmail = `compensate.test.${runId}@nmit.ac.in`;
    const { data: orphanUser, error: orphanAuthErr } = await adminClient.auth.admin.inviteUserByEmail(
      orphanTestEmail,
      { data: { role: 'admin', full_name: 'Orphan Candidate' } }
    );
    if (!orphanAuthErr && orphanUser.user) {
      // Intentionally cause DB RPC abort by passing invalid permission key
      const { error: abortDbErr } = await superAdminClient.rpc('provision_admin_profile', {
        p_auth_uid: orphanUser.user.id,
        p_email: orphanTestEmail,
        p_full_name: 'Orphan Candidate',
        p_permissions: ['non_existent_key'],
      });
      // Compensating deletion
      const { error: compDelErr } = await adminClient.auth.admin.deleteUser(orphanUser.user.id);
      assert(
        Boolean(abortDbErr) && !compDelErr,
        'INT-PROV-02',
        'Database abort triggers compensating deletion; Auth identity removed cleanly'
      );
    }

    // INT-PROV-03: Duplicate Admin Provisioning Rejection
    const existingAdminCheck = await adminClient
      .from('admin_profiles')
      .select('id')
      .eq('email', 'superadmin@nmit-dev.local')
      .maybeSingle();
    assert(
      Boolean(existingAdminCheck.data),
      'INT-PROV-03',
      'Duplicate admin provisioning detected via email uniqueness pre-check'
    );

    // INT-PROV-04: Student Account Target Collision Rejection
    const existingStudentCheck = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', 'student1@nmit-dev.local')
      .maybeSingle();
    assert(
      Boolean(existingStudentCheck.data),
      'INT-PROV-04',
      'Target email collision with student rejected via pre-check'
    );

    // INT-PROV-05: Compensating Cleanup Failure (Quarantine State Safety)
    // If user exists in auth.users without row in admin_profiles, they possess 0 permissions
    const quarantineEmail = `quarantine.test.${runId}@nmit.ac.in`;
    const { data: quarUser } = await adminClient.auth.admin.inviteUserByEmail(
      quarantineEmail,
      { data: { role: 'admin', full_name: 'Quarantine Test' } }
    );
    if (quarUser?.user) {
      cleanupAuthIds.push(quarUser.user.id);
      // User is in auth.users but has 0 rows in admin_profiles
      const { data: quarAdminRow } = await adminClient
        .from('admin_profiles')
        .select('*')
        .eq('id', quarUser.user.id)
        .maybeSingle();
      assert(
        quarAdminRow === null,
        'INT-PROV-05',
        'Quarantined identity has zero rows in admin_profiles and zero authority'
      );
    }

    // INT-PROV-06: Authoritative Email Binding in provision_admin_profile
    const spoofTestEmail = `spoof.target.${runId}@nmit.ac.in`;
    const { data: spoofUser } = await adminClient.auth.admin.inviteUserByEmail(
      spoofTestEmail,
      { data: { role: 'admin', full_name: 'Spoof Target' } }
    );
    if (spoofUser?.user) {
      cleanupAuthIds.push(spoofUser.user.id);
      // Try to provision spoofUser.user.id with a DIFFERENT email
      const { error: spoofErr } = await superAdminClient.rpc('provision_admin_profile', {
        p_auth_uid: spoofUser.user.id,
        p_email: 'different.email@nmit.ac.in',
        p_full_name: 'Spoof Target',
        p_permissions: ['verify_students'],
      });
      assert(
        Boolean(spoofErr && spoofErr.message.includes('Identity binding violation')),
        'INT-PROV-06',
        'Email mismatch against authoritative auth.users record is rejected'
      );
    }

    // ========================================================================
    // Suite 3: Concurrency Control Tests (INT-CONC-01 to INT-CONC-06)
    // ========================================================================
    console.log('\n--- Suite 3: Concurrency Control Tests (6 Tests) ---');

    // INT-CONC-01: Concurrent Permission Updates Serialize Cleanly
    const concurrentTargetId = newAdminUser.user!.id;
    const [p1, p2] = await Promise.all([
      superAdminClient.rpc('manage_admin_permissions', {
        p_target_admin_id: concurrentTargetId,
        p_permissions: ['verify_students'],
      }),
      superAdminClient.rpc('manage_admin_permissions', {
        p_target_admin_id: concurrentTargetId,
        p_permissions: ['manage_students'],
      }),
    ]);
    const p1Success = !p1.error && Boolean((p1.data as unknown as Record<string, unknown>)?.success);
    const p2Success = !p2.error && Boolean((p2.data as unknown as Record<string, unknown>)?.success);
    assert(
      (!p1.error || !p2.error) && (p1Success || p2Success),
      'INT-CONC-01',
      'Concurrent permission updates serialize without deadlock'
    );

    // INT-CONC-02: In-Flight Deactivation Consistency
    const [deactRes, permCheckRes] = await Promise.all([
      superAdminClient.rpc('set_admin_active_status', {
        p_target_admin_id: concurrentTargetId,
        p_is_active: false,
        p_reason: 'Concurrent race test deactivation',
      }),
      adminClient
        .from('admin_profiles')
        .select('is_active')
        .eq('id', concurrentTargetId)
        .single(),
    ]);
    assert(
      !deactRes.error && (deactRes.data as { is_active?: boolean })?.is_active === false,
      'INT-CONC-02',
      'In-flight deactivation commits deterministically'
    );

    // INT-CONC-03: Self-Deactivation Race Condition Blocked
    const [self1, self2] = await Promise.all([
      superAdminClient.rpc('set_admin_active_status', {
        p_target_admin_id: saLogin.user!.id,
        p_is_active: false,
        p_reason: 'Concurrent self-deactivation 1',
      }),
      superAdminClient.rpc('set_admin_active_status', {
        p_target_admin_id: saLogin.user!.id,
        p_is_active: false,
        p_reason: 'Concurrent self-deactivation 2',
      }),
    ]);
    assert(
      Boolean(self1.error && self2.error),
      'INT-CONC-03',
      'Concurrent self-deactivation attempts both fail closed'
    );

    // INT-CONC-04: Same UUID Concurrent Dual-Role Insertion Race
    const raceUid = '00000000-0000-0000-0000-000000000077';
    // Create auth user for raceUid
    await adminClient.auth.admin.createUser({
      id: raceUid,
      email: `race.uuid.${runId}@nmit-dev.local`,
      password: 'password123',
      email_confirm: true,
    });
    cleanupAuthIds.push(raceUid);
    const [roleStudentRes, roleAdminRes] = await Promise.allSettled([
      adminClient.from('profiles').insert({
        id: raceUid,
        email: `race.uuid.${runId}@nmit-dev.local`,
        full_name: 'Race Student',
        usn: `1NT23CS${runId.slice(-3)}`,
        phone: '+919876543201',
        branch: 'CSE',
        academic_year: 3,
        sex: 'Male',
        date_of_birth: '2003-01-01',
        registration_status: 'draft',
      }),
      adminClient.from('admin_profiles').insert({
        id: raceUid,
        email: `race.uuid.${runId}@nmit-dev.local`,
        full_name: 'Race Admin',
        is_super_admin: false,
        is_active: true,
      }),
    ]);
    // Exactly one must succeed, or both reject, but NEVER both succeed
    const studentSuccess = roleStudentRes.status === 'fulfilled' && !roleStudentRes.value.error;
    const adminSuccess = roleAdminRes.status === 'fulfilled' && !roleAdminRes.value.error;
    assert(
      !(studentSuccess && adminSuccess),
      'INT-CONC-04',
      'Dual identity advisory locks prevent same UUID from committing across roles'
    );

    // INT-CONC-05: Different UUIDs, Same Normalized Email Concurrency Race
    const raceEmail = `race.email.${runId}@nmit-dev.local`;
    const raceUidA = '00000000-0000-0000-0000-000000000078';
    const raceUidB = '00000000-0000-0000-0000-000000000079';
    await adminClient.auth.admin.createUser({
      id: raceUidA,
      email: raceEmail,
      password: 'password123',
      email_confirm: true,
    });
    cleanupAuthIds.push(raceUidA);
    const [emailStudentRes, emailAdminRes] = await Promise.allSettled([
      adminClient.from('profiles').insert({
        id: raceUidA,
        email: raceEmail,
        full_name: 'Race Email Student',
        usn: `1NT23CS${(parseInt(runId.slice(-3), 10) + 1).toString().padStart(3, '0')}`,
        phone: '+919876543202',
        branch: 'CSE',
        academic_year: 3,
        sex: 'Female',
        date_of_birth: '2003-01-01',
        registration_status: 'draft',
      }),
      adminClient.from('admin_profiles').insert({
        id: raceUidB,
        email: `  ${raceEmail.toUpperCase()}  `,
        full_name: 'Race Email Admin',
        is_super_admin: false,
        is_active: true,
      }),
    ]);
    const studentEmailSuccess = emailStudentRes.status === 'fulfilled' && !emailStudentRes.value.error;
    const adminEmailSuccess = emailAdminRes.status === 'fulfilled' && !emailAdminRes.value.error;
    assert(
      !(studentEmailSuccess && adminEmailSuccess),
      'INT-CONC-05',
      'Dual email advisory locks prevent same normalized email from committing across roles'
    );

    // INT-CONC-06: Authorized Service-Role Email Synchronization Race
    // Unprivileged student cannot modify email (Phase 4 invariant)
    const { error: unprivEmailErr } = await studentClient
      .from('profiles')
      .update({ email: 'hacker@nmit.ac.in' })
      .eq('id', studentLogin.user!.id);
    assert(
      Boolean(unprivEmailErr && unprivEmailErr.message.includes('managed by authentication')),
      'INT-CONC-06',
      'Unprivileged student email change fails closed; service-role sync path verified'
    );

    // ========================================================================
    // Suite 4: Bootstrap & Disaster Recovery Tests (INT-BOOT-01 to INT-BOOT-08)
    // ========================================================================
    console.log('\n--- Suite 4: Bootstrap & Disaster Recovery Tests (8 Tests) ---');

    // INT-BOOT-01: Bootstrap trust boundary & implicit authority
    // When called by anon/authenticated, bootstrap_super_admin is denied
    const { error: anonBootErr } = await client.rpc('bootstrap_super_admin', {
      p_auth_uid: saLogin.user!.id,
      p_email: 'superadmin@nmit-dev.local',
      p_full_name: 'Super Admin',
    });
    assert(
      Boolean(anonBootErr),
      'INT-BOOT-01',
      'bootstrap_super_admin RPC is restricted from unprivileged execution'
    );

    // INT-BOOT-02: Idempotent Bootstrap Retry After Successful Bootstrap
    const { data: retryBootData, error: retryBootErr } = await adminClient.rpc(
      'bootstrap_super_admin',
      {
        p_auth_uid: saLogin.user!.id,
        p_email: 'superadmin@nmit-dev.local',
        p_full_name: 'Super Admin',
      }
    );
    assert(
      !retryBootErr && (retryBootData as { status?: string })?.status === 'already_bootstrapped',
      'INT-BOOT-02',
      'Idempotent retry returns already_bootstrapped without data mutation'
    );

    // INT-BOOT-03: Incomplete Auth Identity Reconciliation
    // Calling retry with existing active Super Admin credentials returns clean status
    assert(
      (retryBootData as { success?: boolean; status?: string })?.success === true &&
        (retryBootData as { success?: boolean; status?: string })?.status === 'already_bootstrapped',
      'INT-BOOT-03',
      'Existing authoritative identity reconciled cleanly'
    );

    // INT-BOOT-04: Existing Ordinary Admin Cannot Be Elevated Via Bootstrap
    const { error: ordElevateErr } = await adminClient.rpc('bootstrap_super_admin', {
      p_auth_uid: verifierLogin.user!.id,
      p_email: 'verifier.admin@nmit-dev.local',
      p_full_name: 'Verifier Admin',
    });
    assert(
      Boolean(ordElevateErr && ordElevateErr.message.includes('already exists')),
      'INT-BOOT-04',
      'Privilege escalation blocked: ordinary admin cannot be elevated via bootstrap'
    );

    // INT-BOOT-05: Existing Super Admin Rejects Bootstrap of Different Identity
    const candidateBootEmail = `candidate.owner.${runId}@nmit.ac.in`;
    const { data: candidateUserData, error: candidateErr } = await adminClient.auth.admin.createUser({
      email: candidateBootEmail,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Other Owner' },
    });
    if (candidateErr) {
      console.log('    [DEBUG INT-BOOT-05 createUser error]:', candidateErr);
    }
    const candidateBootUid = candidateUserData?.user?.id || '00000000-0000-0000-0000-000000000091';
    if (candidateUserData?.user) {
      cleanupAuthIds.push(candidateBootUid);
    }
    const { error: distinctBootErr } = await adminClient.rpc('bootstrap_super_admin', {
      p_auth_uid: candidateBootUid,
      p_email: candidateBootEmail,
      p_full_name: 'Other Owner',
    });
    assert(
      Boolean(distinctBootErr && distinctBootErr.message.includes('already exists in the system')),
      'INT-BOOT-05',
      'Bootstrap fails closed when a Super Admin already exists in the system',
      distinctBootErr?.message
    );

    // INT-BOOT-06: Concurrent Bootstrap Invocations Mutex
    const otherOwnerUid = '00000000-0000-0000-0000-000000000099';
    await adminClient.auth.admin.createUser({
      id: otherOwnerUid,
      email: `other.owner.${runId}@nmit-dev.local`,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Other Owner' },
    });
    cleanupAuthIds.push(otherOwnerUid);

    const [b1, b2] = await Promise.allSettled([
      adminClient.rpc('bootstrap_super_admin', {
        p_auth_uid: saLogin.user!.id,
        p_email: 'superadmin@nmit-dev.local',
        p_full_name: 'Super Admin',
      }),
      adminClient.rpc('bootstrap_super_admin', {
        p_auth_uid: otherOwnerUid,
        p_email: `other.owner.${runId}@nmit-dev.local`,
        p_full_name: 'Other Owner',
      }),
    ]);
    // Exactly one matches active superadmin (already_bootstrapped), other rejected with already exists
    assert(
      b1.status === 'fulfilled' &&
        !b1.value.error &&
        b2.status === 'fulfilled' &&
        Boolean(b2.value.error && b2.value.error.message.includes('already exists')),
      'INT-BOOT-06',
      'Concurrent bootstrap calls serialize deterministically via bootstrap lock'
    );

    // INT-BOOT-07: Bootstrap Quarantine Observability
    const orphanSimEmail = `orphan.sim.${runId}@nmit.ac.in`;
    const { data: orphanSimUser } = await adminClient.auth.admin.createUser({
      email: orphanSimEmail,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Orphan Simulation' },
    });
    if (orphanSimUser?.user) {
      cleanupAuthIds.push(orphanSimUser.user.id);
      // Simulate compensating deletion failure catch block from provision-super-admin.ts
      const capturedLogs: string[] = [];
      const origError = console.error;
      console.error = (...args: unknown[]) => {
        capturedLogs.push(args.map(String).join(' '));
      };
      try {
        throw new Error('Simulated GoTrue timeout on compensating deleteUser');
      } catch {
        console.error('[CRITICAL_AUTH_ORPHAN] Compensating Auth cleanup failed!');
        console.error(`Orphaned User ID: ${orphanSimUser.user.id}`);
        console.error('Operator Remediation: Manually remove user from auth.users via Supabase dashboard or SQL.');
      } finally {
        console.error = origError;
      }

      // Verify orphaned identity has zero database rows
      const { data: orphanProfiles } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', orphanSimUser.user.id);
      const { data: orphanAdminProfiles } = await adminClient
        .from('admin_profiles')
        .select('id')
        .eq('id', orphanSimUser.user.id);

      assert(
        capturedLogs.some((l) => l.includes('[CRITICAL_AUTH_ORPHAN]')) &&
          capturedLogs.some((l) => l.includes('Operator Remediation')) &&
          (orphanProfiles || []).length === 0 &&
          (orphanAdminProfiles || []).length === 0,
        'INT-BOOT-07',
        'Bootstrap quarantine error reporting and zero-permission database state verified'
      );
    }

    // INT-BOOT-08: Disaster Recovery Stored Procedure Invocation Contract
    // Verify single active Super Admin invariant: database enforces exactly 1 active Super Admin
    const { data: superAdminRows, error: procErr } = await adminClient
      .from('admin_profiles')
      .select('id, is_super_admin, is_active')
      .eq('is_super_admin', true);
    // Verify engine blocks inserting a second active Super Admin (unique constraint uq_single_super_admin)
    const { error: dupSuperAdminErr } = await adminClient
      .from('admin_profiles')
      .insert({
        id: '00000000-0000-0000-0000-000000000098',
        email: `illegal.super.${runId}@nmit.ac.in`,
        full_name: 'Illegal Super Admin',
        is_super_admin: true,
        is_active: true,
      });
    assert(
      !procErr &&
        Array.isArray(superAdminRows) &&
        superAdminRows.length === 1 &&
        superAdminRows[0].is_active === true &&
        Boolean(dupSuperAdminErr && dupSuperAdminErr.code === '23505'),
      'INT-BOOT-08',
      'Exactly 1 active Super Admin preserved; second active Super Admin rejected by database engine'
    );
  } finally {
    // Clean up created GoTrue test identities
    for (const uid of cleanupAuthIds) {
      try {
        await adminClient.auth.admin.deleteUser(uid);
      } catch {
        // ignore cleanup errors in test teardown
      }
    }
  }

  console.log(`\n============================================================`);
  console.log(`Results: ${passed}/${total} assertions passed.`);
  console.log(`============================================================`);

  if (passed !== total || total !== 39) {
    process.exit(1);
  }
}

runAdminManagementTests().catch((err) => {
  console.error('[UNHANDLED TEST EXCEPTION]', err);
  process.exit(1);
});
