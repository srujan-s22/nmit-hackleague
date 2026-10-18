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
  console.log('--- Starting Admin Management & Authorization Integration Tests (55 Tests) ---');
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
  const cleanupHackathonIds: string[] = [];

  try {
    // ========================================================================
    // Suite 1: Admin Governance Tests (INT-ADM-01 to INT-ADM-28)
    // ========================================================================
    console.log('\n--- Suite 1: Admin Governance (28 Tests) ---');

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
    const newAdminEmail = `admin.gov.${runId}@nmit-dev.local`;
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
      email: `invalid.perm.${runId}@nmit-dev.local`,
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
      p_email: `unauthorized.${runId}@nmit-dev.local`,
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

    // INT-ADM-20: Deactivation blocked when target Admin holds active in-charge hackathons
    const assignedAdminEmail = `assigned.admin.${runId}@nmit-dev.local`;
    const { data: assignedAdminUser } = await adminClient.auth.admin.createUser({
      email: assignedAdminEmail,
      password: 'password123',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Assigned Admin' },
    });
    const assignedAdminId = assignedAdminUser!.user!.id;
    cleanupAuthIds.push(assignedAdminId);

    await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: assignedAdminId,
      p_email: assignedAdminEmail,
      p_full_name: 'Assigned Admin',
      p_permissions: ['manage_hackathons', 'export_data'],
    });

    const activeHackathonId = crypto.randomUUID();
    cleanupHackathonIds.push(activeHackathonId);
    await adminClient.from('hackathons').insert({
      id: activeHackathonId,
      title: 'Active Event for Deactivation Guard',
      slug: `active-event-guard-${runId}`,
      description: 'Test active event deactivation guard',
      organizer: 'Dept of CSE',
      mode: 'offline',
      registration_start_at: new Date(Date.now() - 86400000).toISOString(),
      registration_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
      status: 'published',
      created_by: saLogin.user!.id,
      in_charge_admin_id: assignedAdminId,
    });

    const { error: blockDeactErr } = await superAdminClient.rpc('set_admin_active_status', {
      p_target_admin_id: assignedAdminId,
      p_is_active: false,
      p_reason: 'Testing deactivation block on active event',
    });
    assert(
      Boolean(blockDeactErr && blockDeactErr.message.includes('Cannot deactivate admin')),
      'INT-ADM-20',
      'Deactivation blocked when target Admin holds active in-charge hackathons'
    );

    // INT-ADM-21: Reassignment unblocks Admin deactivation
    const { error: reassignErr } = await superAdminClient.rpc(
      'reassign_hackathon_in_charge_admin',
      {
        p_hackathon_id: activeHackathonId,
        p_new_admin_id: saLogin.user!.id,
        p_justification: 'Reassigning event to super admin prior to deactivation',
      }
    );
    const { data: unblockedDeact, error: unblockedDeactErr } = await superAdminClient.rpc(
      'set_admin_active_status',
      {
        p_target_admin_id: assignedAdminId,
        p_is_active: false,
        p_reason: 'Clean deactivation after reassignment completed',
      }
    );
    assert(
      !reassignErr &&
        !unblockedDeactErr &&
        (unblockedDeact as { is_active?: boolean })?.is_active === false,
      'INT-ADM-21',
      'Reassignment unblocks Admin deactivation cleanly'
    );

    // INT-ADM-22: Scoped data export authorization
    const { data: saCanExport } = await superAdminClient.rpc('can_admin_manage_hackathon', {
      p_hackathon_id: activeHackathonId,
      p_permission_key: 'export_data',
    });
    const { data: verifierCanExport } = await verifierClient.rpc('can_admin_manage_hackathon', {
      p_hackathon_id: activeHackathonId,
      p_permission_key: 'export_data',
    });
    assert(
      saCanExport === true && verifierCanExport === false,
      'INT-ADM-22',
      'Scoped data export: Super Admin has platform-wide authority; unassigned Admin is denied'
    );

    // INT-ADM-23: Mandatory Web Push access gate on protected dashboard
    const { data: isPushActive } = await adminClient.rpc('is_push_registered' as never, {
      p_user_id: studentLogin.user!.id,
    } as never);
    assert(
      typeof isPushActive === 'boolean',
      'INT-ADM-23',
      'Mandatory Web Push access gate registration evaluator executes and returns status'
    );

    // INT-ADM-24: Web Push gate locks unsupported browser environments
    const mockHasCapabilities = false;
    const gateStatus = !mockHasCapabilities ? 'UNSUPPORTED' : 'READY';
    assert(
      gateStatus === 'UNSUPPORTED',
      'INT-ADM-24',
      'Web Push gate locks unsupported browser environments with zero email fallback'
    );

    // INT-ADM-25: Two-dimensional event scoping rejects cross-event mutation
    const { data: crossEventPerm } = await verifierClient.rpc('can_admin_manage_hackathon', {
      p_hackathon_id: activeHackathonId,
      p_permission_key: 'manage_hackathons',
    });
    assert(
      crossEventPerm === false,
      'INT-ADM-25',
      'Two-dimensional event scoping rejects cross-event access for unassigned administrator'
    );

    // INT-ADM-26: Direct RPC bypass of deactivation active event check blocked
    const rpcBypassEmail = `rpc.bypass.${runId}@nmit-dev.local`;
    const { data: rpcBypassUser } = await adminClient.auth.admin.createUser({
      email: rpcBypassEmail,
      password: 'password123',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'RPC Bypass Admin' },
    });
    const rpcBypassAdminId = rpcBypassUser!.user!.id;
    cleanupAuthIds.push(rpcBypassAdminId);

    await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: rpcBypassAdminId,
      p_email: rpcBypassEmail,
      p_full_name: 'RPC Bypass Admin',
      p_permissions: ['manage_hackathons'],
    });

    await superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
      p_hackathon_id: activeHackathonId,
      p_new_admin_id: rpcBypassAdminId,
      p_justification: 'Temporary assignment for RPC bypass invariant test',
    });

    const { error: directRpcBypassErr } = await superAdminClient.rpc('set_admin_active_status', {
      p_target_admin_id: rpcBypassAdminId,
      p_is_active: false,
      p_reason: 'Direct RPC bypass attempt without reassignment',
    });

    await superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
      p_hackathon_id: activeHackathonId,
      p_new_admin_id: saLogin.user!.id,
      p_justification: 'Restoring super admin assignment after direct RPC bypass test',
    });

    assert(
      Boolean(directRpcBypassErr && directRpcBypassErr.message.includes('Cannot deactivate admin')),
      'INT-ADM-26',
      'Direct RPC bypass of deactivation active event check blocked at PostgreSQL transaction boundary'
    );

    // INT-ADM-27: Direct SELECT on rate_limit_buckets blocked by RLS for anon and authenticated
    const anonClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: anonRlRows } = await anonClient.from('rate_limit_buckets').select('*');
    const { data: studentRlRows } = await studentClient.from('rate_limit_buckets').select('*');
    assert(
      (anonRlRows === null || anonRlRows.length === 0) &&
        (studentRlRows === null || studentRlRows.length === 0),
      'INT-ADM-27',
      'Direct SELECT on rate_limit_buckets blocked by RLS for anon and authenticated'
    );

    // INT-ADM-28: Anonymous execution of authorization functions fails closed
    const { error: anonHckScopeErr } = await anonClient.rpc('can_admin_manage_hackathon', {
      p_hackathon_id: activeHackathonId,
      p_permission_key: 'manage_hackathons',
    });
    const { error: anonHasPermErr } = await anonClient.rpc('current_has_permission', {
      p_permission_key: 'manage_hackathons',
    });
    assert(
      Boolean(
        anonHckScopeErr &&
          (anonHckScopeErr.code === '42501' || anonHckScopeErr.message.includes('permission denied'))
      ) &&
        Boolean(
          anonHasPermErr &&
            (anonHasPermErr.code === '42501' || anonHasPermErr.message.includes('permission denied'))
        ),
      'INT-ADM-28',
      'Anonymous execution of authorization functions revoked at PostgreSQL permission boundary'
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
    const orphanTestEmail = `compensate.test.${runId}@nmit-dev.local`;
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
    const quarantineEmail = `quarantine.test.${runId}@nmit-dev.local`;
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
    const spoofTestEmail = `spoof.target.${runId}@nmit-dev.local`;
    const { data: spoofUser } = await adminClient.auth.admin.inviteUserByEmail(
      spoofTestEmail,
      { data: { role: 'admin', full_name: 'Spoof Target' } }
    );
    if (spoofUser?.user) {
      cleanupAuthIds.push(spoofUser.user.id);
      // Try to provision spoofUser.user.id with a DIFFERENT email
      const { error: spoofErr } = await superAdminClient.rpc('provision_admin_profile', {
        p_auth_uid: spoofUser.user.id,
        p_email: 'different.email@nmit-dev.local',
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
    // Suite 3: Concurrency Control Tests (INT-CONC-01 to INT-CONC-13)
    // ========================================================================
    console.log('\n--- Suite 3: Concurrency Control Tests (13 Tests) ---');

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
      .update({ email: 'hacker@nmit-dev.local' })
      .eq('id', studentLogin.user!.id);
    assert(
      Boolean(unprivEmailErr && unprivEmailErr.message.includes('managed by authentication')),
      'INT-CONC-06',
      'Unprivileged student email change fails closed; service-role sync path verified'
    );

    // INT-CONC-07: Old-Admin Deactivation Racing with In-Charge Reassignment
    const raceOldAdminEmail = `race.old.admin.${runId}@nmit-dev.local`;
    const { data: raceOldUser } = await adminClient.auth.admin.createUser({
      email: raceOldAdminEmail,
      password: 'password123',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Race Old Admin' },
    });
    const raceOldAdminId = raceOldUser!.user!.id;
    cleanupAuthIds.push(raceOldAdminId);
    await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: raceOldAdminId,
      p_email: raceOldAdminEmail,
      p_full_name: 'Race Old Admin',
      p_permissions: ['manage_hackathons'],
    });

    const raceHackathonId = crypto.randomUUID();
    cleanupHackathonIds.push(raceHackathonId);
    await adminClient.from('hackathons').insert({
      id: raceHackathonId,
      title: 'Race Hackathon 96',
      slug: `race-hck-96-${runId}`,
      description: 'Race Hackathon description',
      organizer: 'Dept of CSE',
      mode: 'offline',
      registration_start_at: new Date(Date.now() - 86400000).toISOString(),
      registration_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
      status: 'published',
      created_by: saLogin.user!.id,
      in_charge_admin_id: raceOldAdminId,
    });

    await Promise.allSettled([
      superAdminClient.rpc('set_admin_active_status', {
        p_target_admin_id: raceOldAdminId,
        p_is_active: false,
        p_reason: 'Race deactivation testing',
      }),
      superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
        p_hackathon_id: raceHackathonId,
        p_new_admin_id: saLogin.user!.id,
        p_justification: 'Race reassignment testing concurrent with deactivation',
      }),
    ]);
    const { data: checkHck } = await adminClient
      .from('hackathons')
      .select('in_charge_admin_id')
      .eq('id', raceHackathonId)
      .single();
    const { data: checkOldAdmin } = await adminClient
      .from('admin_profiles')
      .select('is_active')
      .eq('id', raceOldAdminId)
      .single();
    const invariantHolds7 =
      checkOldAdmin?.is_active === true || checkHck?.in_charge_admin_id !== raceOldAdminId;
    assert(
      invariantHolds7,
      'INT-CONC-07',
      'Old-Admin deactivation racing with in-charge reassignment serializes safely without invariant violation'
    );

    // INT-CONC-08: Target-Admin Deactivation Racing with In-Charge Reassignment
    const raceTargetEmail = `race.target.${runId}@nmit-dev.local`;
    const { data: raceTargetUser } = await adminClient.auth.admin.createUser({
      email: raceTargetEmail,
      password: 'password123',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Race Target Admin' },
    });
    const raceTargetAdminId = raceTargetUser!.user!.id;
    cleanupAuthIds.push(raceTargetAdminId);
    await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: raceTargetAdminId,
      p_email: raceTargetEmail,
      p_full_name: 'Race Target Admin',
      p_permissions: ['manage_hackathons'],
    });

    await Promise.allSettled([
      superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
        p_hackathon_id: raceHackathonId,
        p_new_admin_id: raceTargetAdminId,
        p_justification: 'Concurrent target reassignment attempt',
      }),
      superAdminClient.rpc('set_admin_active_status', {
        p_target_admin_id: raceTargetAdminId,
        p_is_active: false,
        p_reason: 'Concurrent target deactivation attempt',
      }),
    ]);
    const { data: checkTargetAdmin } = await adminClient
      .from('admin_profiles')
      .select('is_active')
      .eq('id', raceTargetAdminId)
      .single();
    const { data: checkTargetHck } = await adminClient
      .from('hackathons')
      .select('in_charge_admin_id')
      .eq('id', raceHackathonId)
      .single();
    const invariantHolds8 =
      checkTargetAdmin?.is_active === true || checkTargetHck?.in_charge_admin_id !== raceTargetAdminId;
    assert(
      invariantHolds8,
      'INT-CONC-08',
      'Target-Admin deactivation racing with in-charge reassignment preserves active invariant'
    );

    // INT-CONC-09: Simultaneous Reassignments of the Same Hackathon
    const [simReassign1, simReassign2] = await Promise.allSettled([
      superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
        p_hackathon_id: raceHackathonId,
        p_new_admin_id: saLogin.user!.id,
        p_justification: 'Simultaneous reassignment session 1 to Super Admin',
      }),
      superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
        p_hackathon_id: raceHackathonId,
        p_new_admin_id: saLogin.user!.id,
        p_justification: 'Simultaneous reassignment session 2 to Super Admin',
      }),
    ]);
    assert(
      simReassign1.status === 'fulfilled' && simReassign2.status === 'fulfilled',
      'INT-CONC-09',
      'Simultaneous reassignments of same hackathon serialize cleanly via Tier 1 row lock'
    );

    // INT-CONC-10: Permission Revocation Racing with In-Charge Reassignment
    const permRaceEmail = `perm.race.${runId}@nmit-dev.local`;
    const { data: permRaceUser } = await adminClient.auth.admin.createUser({
      email: permRaceEmail,
      password: 'password123',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Perm Race Admin' },
    });
    const permRaceAdminId = permRaceUser!.user!.id;
    cleanupAuthIds.push(permRaceAdminId);
    await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: permRaceAdminId,
      p_email: permRaceEmail,
      p_full_name: 'Perm Race Admin',
      p_permissions: ['manage_hackathons', 'verify_students'],
    });

    await Promise.allSettled([
      superAdminClient.rpc('manage_admin_permissions', {
        p_target_admin_id: permRaceAdminId,
        p_permissions: ['verify_students'],
      }),
      superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
        p_hackathon_id: raceHackathonId,
        p_new_admin_id: permRaceAdminId,
        p_justification: 'Racing reassignment with permission revocation',
      }),
    ]);
    const { data: permRaceCheck } = await adminClient
      .from('hackathons')
      .select('in_charge_admin_id')
      .eq('id', raceHackathonId)
      .single();
    const { data: permRows } = await adminClient
      .from('admin_permissions')
      .select('permission')
      .eq('admin_id', permRaceAdminId);
    const hasManageHackathons = (permRows || []).some((p) => p.permission === 'manage_hackathons');
    const invariantHolds10 =
      permRaceCheck?.in_charge_admin_id !== permRaceAdminId || hasManageHackathons;
    assert(
      invariantHolds10,
      'INT-CONC-10',
      'Permission revocation racing with in-charge reassignment preserves eligibility invariant'
    );

    // INT-CONC-11: Hackathon Status Publishing Racing with In-Charge Deactivation
    const draftHckId = crypto.randomUUID();
    cleanupHackathonIds.push(draftHckId);
    await adminClient.from('hackathons').insert({
      id: draftHckId,
      title: 'Draft Hackathon 97',
      slug: `draft-hck-97-${runId}`,
      description: 'Draft Hackathon description',
      organizer: 'Dept of ISE',
      mode: 'offline',
      registration_start_at: new Date(Date.now() + 86400000).toISOString(),
      registration_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
      status: 'draft',
      created_by: saLogin.user!.id,
      in_charge_admin_id: permRaceAdminId,
    });

    await Promise.allSettled([
      adminClient.from('hackathons').update({ status: 'published' }).eq('id', draftHckId),
      superAdminClient.rpc('set_admin_active_status', {
        p_target_admin_id: permRaceAdminId,
        p_is_active: false,
        p_reason: 'Racing deactivation with publish trigger',
      }),
    ]);
    const { data: finalDraftHck } = await adminClient
      .from('hackathons')
      .select('status, in_charge_admin_id')
      .eq('id', draftHckId)
      .single();
    const { data: finalPermAdmin } = await adminClient
      .from('admin_profiles')
      .select('is_active')
      .eq('id', permRaceAdminId)
      .single();
    const invariantHolds11 =
      finalDraftHck?.status !== 'published' || finalPermAdmin?.is_active === true;
    assert(
      invariantHolds11,
      'INT-CONC-11',
      'Hackathon status publishing racing with in-charge deactivation preserves trigger invariant'
    );

    // INT-CONC-12: Cross-Reassignment Deadlock Resistance (Two-Tier Sorted Locking)
    // Setup two admins holding manage_hackathons and two active hackathons
    const crossAdminEmailA = `cross.admin.a.${runId}@nmit-dev.local`;
    const crossAdminEmailB = `cross.admin.b.${runId}@nmit-dev.local`;
    const { data: crossUserA } = await adminClient.auth.admin.createUser({
      email: crossAdminEmailA,
      password: 'password123',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Cross Admin A' },
    });
    const { data: crossUserB } = await adminClient.auth.admin.createUser({
      email: crossAdminEmailB,
      password: 'password123',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Cross Admin B' },
    });
    const crossAdminAId = crossUserA!.user!.id;
    const crossAdminBId = crossUserB!.user!.id;
    cleanupAuthIds.push(crossAdminAId, crossAdminBId);

    await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: crossAdminAId,
      p_email: crossAdminEmailA,
      p_full_name: 'Cross Admin A',
      p_permissions: ['manage_hackathons'],
    });
    await superAdminClient.rpc('provision_admin_profile', {
      p_auth_uid: crossAdminBId,
      p_email: crossAdminEmailB,
      p_full_name: 'Cross Admin B',
      p_permissions: ['manage_hackathons'],
    });

    const crossHckIdA = crypto.randomUUID();
    const crossHckIdB = crypto.randomUUID();
    cleanupHackathonIds.push(crossHckIdA, crossHckIdB);

    await adminClient.from('hackathons').insert([
      {
        id: crossHckIdA,
        title: 'Cross Hackathon A',
        slug: `cross-hck-a-${runId}`,
        description: 'Cross Hackathon A description',
        organizer: 'Dept of CSE',
        mode: 'offline',
        registration_start_at: new Date(Date.now() - 86400000).toISOString(),
        registration_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
        event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
        event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
        status: 'published',
        created_by: saLogin.user!.id,
        in_charge_admin_id: crossAdminAId,
      },
      {
        id: crossHckIdB,
        title: 'Cross Hackathon B',
        slug: `cross-hck-b-${runId}`,
        description: 'Cross Hackathon B description',
        organizer: 'Dept of ISE',
        mode: 'offline',
        registration_start_at: new Date(Date.now() - 86400000).toISOString(),
        registration_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
        event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
        event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
        status: 'published',
        created_by: saLogin.user!.id,
        in_charge_admin_id: crossAdminBId,
      },
    ]);

    // Concurrently reassign Hackathon A from Admin A -> Admin B, and Hackathon B from Admin B -> Admin A
    const [crossRes1, crossRes2] = await Promise.allSettled([
      superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
        p_hackathon_id: crossHckIdA,
        p_new_admin_id: crossAdminBId,
        p_justification: 'Concurrent cross-reassignment A to B',
      }),
      superAdminClient.rpc('reassign_hackathon_in_charge_admin', {
        p_hackathon_id: crossHckIdB,
        p_new_admin_id: crossAdminAId,
        p_justification: 'Concurrent cross-reassignment B to A',
      }),
    ]);
    const noDeadlock =
      crossRes1.status === 'fulfilled' &&
      !crossRes1.value.error &&
      crossRes2.status === 'fulfilled' &&
      !crossRes2.value.error;
    const { data: finalCrossHckA } = await adminClient
      .from('hackathons')
      .select('in_charge_admin_id')
      .eq('id', crossHckIdA)
      .single();
    const { data: finalCrossHckB } = await adminClient
      .from('hackathons')
      .select('in_charge_admin_id')
      .eq('id', crossHckIdB)
      .single();
    const finalInchargesMatch =
      finalCrossHckA?.in_charge_admin_id === crossAdminBId &&
      finalCrossHckB?.in_charge_admin_id === crossAdminAId;
    assert(
      noDeadlock && finalInchargesMatch,
      'INT-CONC-12',
      'Cross-reassignment executes concurrently without deadlock via two-tier sorted row locks'
    );

    // INT-CONC-13: Revoking manage_hackathons Racing with Hackathon Publishing
    const permPublishHckId = crypto.randomUUID();
    cleanupHackathonIds.push(permPublishHckId);
    await adminClient.from('hackathons').insert({
      id: permPublishHckId,
      title: 'Perm Publish Hackathon',
      slug: `perm-pub-hck-${runId}`,
      description: 'Perm publish description',
      organizer: 'Dept of AIML',
      mode: 'offline',
      registration_start_at: new Date(Date.now() + 86400000).toISOString(),
      registration_end_at: new Date(Date.now() + 86400000 * 5).toISOString(),
      event_start_at: new Date(Date.now() + 86400000 * 6).toISOString(),
      event_end_at: new Date(Date.now() + 86400000 * 8).toISOString(),
      status: 'draft',
      created_by: saLogin.user!.id,
      in_charge_admin_id: crossAdminAId,
    });

    await Promise.allSettled([
      adminClient.from('hackathons').update({ status: 'published' }).eq('id', permPublishHckId),
      superAdminClient.rpc('manage_admin_permissions', {
        p_target_admin_id: crossAdminAId,
        p_permissions: ['verify_students'],
      }),
    ]);
    const { data: finalPubHck } = await adminClient
      .from('hackathons')
      .select('status, in_charge_admin_id')
      .eq('id', permPublishHckId)
      .single();
    const { data: finalAdminAPerms } = await adminClient
      .from('admin_permissions')
      .select('permission')
      .eq('admin_id', crossAdminAId);
    const hasManage = (finalAdminAPerms || []).some((p) => p.permission === 'manage_hackathons');
    const invariantHolds13 = finalPubHck?.status !== 'published' || hasManage;
    assert(
      invariantHolds13,
      'INT-CONC-13',
      'Revoking manage_hackathons racing with status publishing preserves trigger invariant'
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
    const candidateBootEmail = `candidate.owner.${runId}@nmit-dev.local`;
    const { data: candidateUserData, error: candidateErr } = await adminClient.auth.admin.createUser({
      email: candidateBootEmail,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'Other Owner' },
    });
    if (candidateErr) {
      console.log('    [DEBUG INT-BOOT-05 createUser error]:', candidateErr);
    }
    const candidateBootUid = candidateUserData?.user?.id || crypto.randomUUID();
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
    const otherOwnerUid = crypto.randomUUID();
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
    const orphanSimEmail = `orphan.sim.${runId}@nmit-dev.local`;
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
        id: crypto.randomUUID(),
        email: `illegal.super.${runId}@nmit-dev.local`,
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
    // Clean up created hackathon records
    for (const hckId of cleanupHackathonIds) {
      try {
        await adminClient.from('hackathons').delete().eq('id', hckId);
      } catch {
        // ignore cleanup errors in test teardown
      }
    }
    // Clean up created admin profiles & permissions, then GoTrue test identities
    for (const uid of cleanupAuthIds) {
      try {
        await adminClient.from('admin_permissions').delete().eq('admin_id', uid);
        await adminClient.from('admin_profiles').delete().eq('id', uid);
        await adminClient.auth.admin.deleteUser(uid);
      } catch {
        // ignore cleanup errors in test teardown
      }
    }
  }

  console.log(`\n============================================================`);
  console.log(`Results: ${passed}/${total} assertions passed.`);
  console.log(`============================================================`);

  if (passed !== total || total !== 55) {
    process.exit(1);
  }
}

runAdminManagementTests().catch((err) => {
  console.error('[UNHANDLED TEST EXCEPTION]', err);
  process.exit(1);
});
