#!/usr/bin/env node
/**
 * NMIT HackLeague — Local Super Admin In-Place Update Utility
 *
 * Updates the existing local seeded Super Admin (00000000-0000-0000-0000-000000000001)
 * in-place with the owner's email and password via interactive hidden prompt.
 *
 * Security & Integrity Safeguards:
 *  1. Strictly locked to http://127.0.0.1:54321; fails closed on any other host.
 *  2. Disables terminal echo reliably; restores terminal settings and removes listeners on exit/interruption.
 *  3. Collision checks: verifies email does not exist in auth.users, public.profiles, or admin_profiles.
 *  4. Preserves UUID 00000000-0000-0000-0000-000000000001, is_super_admin = true, and is_active = true.
 *  5. Merges user_metadata and app_metadata preserving existing keys.
 *  6. Verifies every database operation and final state across Auth and Database; never prints false success.
 *  7. Preserves passwords exactly as entered without trimming. Never logs passwords.
 */

import { createClient, type User } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// 1. Load local environment configuration (.env.local)
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

const SUPER_ADMIN_UUID = '00000000-0000-0000-0000-000000000001';
const EXPECTED_LOCAL_URL = 'http://127.0.0.1:54321';
const TARGET_EMAIL = 'ssrujan246@gmail.com';
const TARGET_NAME = 'SRUJAN S';

/**
 * Prompts for password on TTY with terminal echo disabled.
 * Preserves the password exactly as entered (no trimming).
 * Restores terminal state safely and cleans up all listeners on completion, interruption, or errors.
 */
function promptPassword(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      return reject(new Error('Interactive terminal (TTY) required for secure password entry. Input cannot be piped.'));
    }

    let password = '';
    const wasRaw = stdin.isRaw;
    let isCleanedUp = false;

    function restoreTerminal() {
      if (isCleanedUp) return;
      isCleanedUp = true;
      try {
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw || false);
        }
        stdin.pause();
      } catch {
        // Ignore errors during terminal restoration
      }
    }

    function cleanup() {
      restoreTerminal();
      stdin.removeListener('data', onData);
      process.removeListener('SIGINT', onSigint);
      process.removeListener('SIGTERM', onSigterm);
    }

    function onSigint() {
      cleanup();
      stdout.write('\n[INFO] Operation cancelled by operator (SIGINT).\n');
      process.exit(130);
    }

    function onSigterm() {
      cleanup();
      stdout.write('\n[INFO] Operation terminated by operator (SIGTERM).\n');
      process.exit(143);
    }

    function onData(buffer: Buffer) {
      const inputStr = buffer.toString('utf8');

      for (let i = 0; i < inputStr.length; i++) {
        const char = inputStr[i];

        if (char === '\u0003') {
          // Ctrl+C
          cleanup();
          stdout.write('\n[INFO] Operation cancelled by operator.\n');
          process.exit(130);
        } else if (char === '\r' || char === '\n') {
          // Enter key
          cleanup();
          stdout.write('\n');
          // Preserve password exactly as typed — do NOT trim
          return resolve(password);
        } else if (char === '\u007f' || char === '\b') {
          // Backspace
          password = password.slice(0, -1);
        } else if (char >= ' ' && char <= '~') {
          // Printable ASCII character — append without echoing to stdout
          password += char;
        }
      }
    }

    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);

    try {
      stdin.setRawMode(true);
      stdin.resume();
      stdout.write(promptText);
      stdin.on('data', onData);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

export async function main() {
  console.log('================================================================');
  console.log(' NMIT HackLeague — Local Super Admin In-Place Update');
  console.log('================================================================\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  // 1. Strict Host Safeguard: Fail-closed if URL is not exactly local
  if (!supabaseUrl || supabaseUrl !== EXPECTED_LOCAL_URL) {
    console.error('[FATAL] Safety abort: Script is strictly locked to local Supabase URL (http://127.0.0.1:54321).');
    console.error(`Configured URL is: "${supabaseUrl || '(empty)'}"`);
    console.error('Operation aborted. No remote database or hosted environment can be targeted.');
    process.exit(1);
  }

  if (!serviceRoleKey) {
    console.error('[FATAL] Missing SUPABASE_SERVICE_ROLE_KEY in environment.');
    console.error('Ensure SUPABASE_SERVICE_ROLE_KEY is configured in .env.local.');
    process.exit(1);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 2. Pre-check: Target seeded Super Admin must exist
  console.log(`[INFO] Verifying target Super Admin identity (${SUPER_ADMIN_UUID})...`);
  const { data: adminProfile, error: adminProfileErr } = await adminClient
    .from('admin_profiles')
    .select('id, email, full_name, is_super_admin, is_active')
    .eq('id', SUPER_ADMIN_UUID)
    .maybeSingle();

  if (adminProfileErr || !adminProfile) {
    console.error(`[FATAL] Target Super Admin profile not found: ${adminProfileErr?.message || 'Row does not exist'}`);
    process.exit(1);
  }

  if (!adminProfile.is_super_admin || !adminProfile.is_active) {
    console.error(`[FATAL] Target profile ${SUPER_ADMIN_UUID} is not an active Super Admin (is_super_admin=${adminProfile.is_super_admin}, is_active=${adminProfile.is_active}).`);
    process.exit(1);
  }

  const { data: userListData, error: userListErr } = await adminClient.auth.admin.listUsers();
  if (userListErr || !userListData?.users) {
    console.error(`[FATAL] Failed to inspect auth.users: ${userListErr?.message || 'Unknown error'}`);
    process.exit(1);
  }

  const users = (userListData.users as User[]) || [];
  const targetAuthUser = users.find((u) => u.id === SUPER_ADMIN_UUID);
  if (!targetAuthUser) {
    console.error(`[FATAL] Auth user for Super Admin UUID ${SUPER_ADMIN_UUID} does not exist in auth.users.`);
    process.exit(1);
  }

  // 3. Collision Checks: Email must not exist in auth.users, public.profiles, or admin_profiles under another ID
  console.log(`[INFO] Checking email collisions for "${TARGET_EMAIL}"...`);

  // 3a. Collision in auth.users
  const collidingAuthUser = users.find(
    (u) => u.email?.toLowerCase().trim() === TARGET_EMAIL.toLowerCase().trim() && u.id !== SUPER_ADMIN_UUID
  );
  if (collidingAuthUser) {
    console.error(`[FATAL] Identity collision: Email "${TARGET_EMAIL}" is already registered to another Auth user (ID: ${collidingAuthUser.id}).`);
    process.exit(1);
  }

  // 3b. Collision in public.profiles (Student identity)
  const { data: studentCollision, error: studentCheckErr } = await adminClient
    .from('profiles')
    .select('id, usn')
    .ilike('email', TARGET_EMAIL)
    .maybeSingle();

  if (studentCheckErr) {
    console.error(`[FATAL] Database check on profiles failed: ${studentCheckErr.message}`);
    process.exit(1);
  }

  if (studentCollision) {
    console.error(`[FATAL] Dual-identity collision: Email "${TARGET_EMAIL}" is registered to student USN ${studentCollision.usn}.`);
    process.exit(1);
  }

  // 3c. Collision in public.admin_profiles
  const { data: adminCollision, error: adminCheckErr } = await adminClient
    .from('admin_profiles')
    .select('id')
    .ilike('email', TARGET_EMAIL)
    .neq('id', SUPER_ADMIN_UUID)
    .maybeSingle();

  if (adminCheckErr) {
    console.error(`[FATAL] Database check on admin_profiles failed: ${adminCheckErr.message}`);
    process.exit(1);
  }

  if (adminCollision) {
    console.error(`[FATAL] Email collision: Email "${TARGET_EMAIL}" is already used by another administrator (ID: ${adminCollision.id}).`);
    process.exit(1);
  }

  console.log('[INFO] No collisions found. Identity validation passed.\n');
  console.log(`  Target UUID:        ${SUPER_ADMIN_UUID}`);
  console.log(`  Current Email:      ${adminProfile.email}`);
  console.log(`  New Email:          ${TARGET_EMAIL}`);
  console.log(`  New Full Name:      ${TARGET_NAME}`);
  console.log(`  Super Admin Status: Preserved (is_super_admin: true, is_active: true)\n`);

  // 4. Interactive No-Echo Password Prompt (password preserved as entered)
  const pass1 = await promptPassword('Enter new Super Admin password (min 8 chars): ');
  if (!pass1 || pass1.length < 8) {
    console.error('[ERROR] Password must be at least 8 characters long. Aborting.');
    process.exit(1);
  }

  const pass2 = await promptPassword('Confirm new Super Admin password: ');
  if (pass1 !== pass2) {
    console.error('[ERROR] Passwords do not match. Aborting.');
    process.exit(1);
  }

  // 5. Operation 1: Update Auth Identity via Supabase Auth Admin API (Preserving and Merging Metadata)
  console.log('\n[1/3] Updating auth.users (email, password, email_confirm, merged metadata)...');

  const mergedUserMetadata = {
    ...(targetAuthUser.user_metadata || {}),
    role: 'admin',
    full_name: TARGET_NAME,
  };

  const mergedAppMetadata = {
    ...(targetAuthUser.app_metadata || {}),
    claims_admin: true,
  };

  const { error: authUpdateErr } = await adminClient.auth.admin.updateUserById(
    SUPER_ADMIN_UUID,
    {
      email: TARGET_EMAIL,
      password: pass1,
      email_confirm: true,
      user_metadata: mergedUserMetadata,
      app_metadata: mergedAppMetadata,
    }
  );

  if (authUpdateErr) {
    console.error(`[FATAL] Supabase Auth update failed: ${authUpdateErr.message}`);
    console.error('Zero database profile modifications performed. State remains unaltered.');
    process.exit(1);
  }

  // 6. Operation 2: Update public.admin_profiles
  console.log('[2/3] Updating public.admin_profiles (email, full_name)...');
  const { error: profileUpdateErr } = await adminClient
    .from('admin_profiles')
    .update({
      email: TARGET_EMAIL,
      full_name: TARGET_NAME,
      updated_at: new Date().toISOString(),
    })
    .eq('id', SUPER_ADMIN_UUID);

  if (profileUpdateErr) {
    console.error('\n[CRITICAL_PARTIAL_FAILURE] Auth identity was updated, but public.admin_profiles update failed!');
    console.error(`Profile update error: ${profileUpdateErr.message}`);
    console.error('\n--- SAFE OPERATOR RECOVERY PROCEDURE ---');
    console.error('Do NOT delete any account. The Super Admin UUID and privileges remain intact.');
    console.error('Execute the following reconciliation SQL statement in your database to complete setup:');
    console.error(`  UPDATE public.admin_profiles SET email = '${TARGET_EMAIL}', full_name = '${TARGET_NAME}', updated_at = now() WHERE id = '${SUPER_ADMIN_UUID}';`);
    console.error('----------------------------------------\n');
    process.exit(1);
  }

  // 7. Operation 3: Insert Audit Log Record
  console.log('[3/3] Writing audit log record...');
  let auditLogSucceeded = true;
  let auditErrorMessage = '';

  const { error: auditErr } = await adminClient.from('audit_logs').insert({
    actor_id: SUPER_ADMIN_UUID,
    actor_role: 'super_admin',
    action: 'super_admin.credentials_updated',
    target_type: 'admin_profile',
    target_id: SUPER_ADMIN_UUID,
    details: {
      email: TARGET_EMAIL,
      full_name: TARGET_NAME,
      updated_via: 'update-local-super-admin.ts',
      environment: 'local_development',
    },
  });

  if (auditErr) {
    auditLogSucceeded = false;
    auditErrorMessage = auditErr.message;
    console.error(`\n[WARNING] Account credentials updated in Auth and Database, but audit log insert failed: ${auditErr.message}`);
    console.error('Operator Note: The Super Admin account is operational, but the audit entry was not recorded.');
  }

  // 8. Authoritative Final Verification across both Auth user and public.admin_profiles
  console.log('[INFO] Performing authoritative final verification across Auth and Database...');

  // 8a. Verify Auth User in GoTrue
  const { data: verifiedAuthData, error: verifyAuthErr } = await adminClient.auth.admin.getUserById(SUPER_ADMIN_UUID);
  if (verifyAuthErr || !verifiedAuthData?.user) {
    console.error(`[FATAL] Verification failed: Unable to fetch Auth user ${SUPER_ADMIN_UUID}: ${verifyAuthErr?.message}`);
    process.exit(1);
  }

  const verifiedUser = verifiedAuthData.user;
  if (verifiedUser.id !== SUPER_ADMIN_UUID) {
    console.error(`[FATAL] Verification failed: Auth UUID mismatch. Expected ${SUPER_ADMIN_UUID}, got ${verifiedUser.id}`);
    process.exit(1);
  }
  if (verifiedUser.email?.toLowerCase().trim() !== TARGET_EMAIL.toLowerCase().trim()) {
    console.error(`[FATAL] Verification failed: Auth email mismatch. Expected ${TARGET_EMAIL}, got ${verifiedUser.email}`);
    process.exit(1);
  }
  if (verifiedUser.user_metadata?.full_name !== TARGET_NAME) {
    console.error(`[FATAL] Verification failed: Auth user_metadata full_name mismatch. Expected ${TARGET_NAME}, got ${verifiedUser.user_metadata?.full_name}`);
    process.exit(1);
  }
  if (!verifiedUser.email_confirmed_at) {
    console.error('[FATAL] Verification failed: Auth user email_confirmed_at is not set.');
    process.exit(1);
  }

  // 8b. Verify public.admin_profiles in PostgreSQL
  const { data: verifiedAdmin, error: verifyAdminErr } = await adminClient
    .from('admin_profiles')
    .select('id, email, full_name, is_super_admin, is_active')
    .eq('id', SUPER_ADMIN_UUID)
    .single();

  if (verifyAdminErr || !verifiedAdmin) {
    console.error(`[FATAL] Verification failed: Unable to fetch admin profile ${SUPER_ADMIN_UUID}: ${verifyAdminErr?.message}`);
    process.exit(1);
  }
  if (verifiedAdmin.id !== SUPER_ADMIN_UUID) {
    console.error(`[FATAL] Verification failed: Admin profile UUID mismatch. Expected ${SUPER_ADMIN_UUID}, got ${verifiedAdmin.id}`);
    process.exit(1);
  }
  if (verifiedAdmin.email.toLowerCase().trim() !== TARGET_EMAIL.toLowerCase().trim()) {
    console.error(`[FATAL] Verification failed: Admin profile email mismatch. Expected ${TARGET_EMAIL}, got ${verifiedAdmin.email}`);
    process.exit(1);
  }
  if (verifiedAdmin.full_name !== TARGET_NAME) {
    console.error(`[FATAL] Verification failed: Admin profile full_name mismatch. Expected ${TARGET_NAME}, got ${verifiedAdmin.full_name}`);
    process.exit(1);
  }
  if (verifiedAdmin.is_super_admin !== true) {
    console.error('[FATAL] Verification failed: Admin profile is_super_admin is not true.');
    process.exit(1);
  }
  if (verifiedAdmin.is_active !== true) {
    console.error('[FATAL] Verification failed: Admin profile is_active is not true.');
    process.exit(1);
  }

  // 9. Outcome Reporting: Honest success accounting
  if (!auditLogSucceeded) {
    console.log('\n================================================================');
    console.log('[PARTIAL SUCCESS] Super Admin account updated, but audit log insert failed.');
    console.log(`  UUID:               ${verifiedAdmin.id}`);
    console.log(`  Email:              ${verifiedAdmin.email}`);
    console.log(`  Full Name:          ${verifiedAdmin.full_name}`);
    console.log(`  Super Admin Status: ${verifiedAdmin.is_super_admin ? 'Active Super Admin' : 'Inactive'}`);
    console.log(`  Email Confirmed:    Yes (verified in Auth)`);
    console.log(`  Audit Log:          FAILED (${auditErrorMessage})`);
    console.log('\nThe account is operational for login at http://localhost:3000/login, but audit trail is incomplete.');
    console.log('================================================================');
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('[SUCCESS] Super Admin account updated and verified successfully in-place!');
  console.log(`  UUID:               ${verifiedAdmin.id}`);
  console.log(`  Email:              ${verifiedAdmin.email}`);
  console.log(`  Full Name:          ${verifiedAdmin.full_name}`);
  console.log(`  Super Admin Status: ${verifiedAdmin.is_super_admin ? 'Active Super Admin' : 'Inactive'}`);
  console.log(`  Email Confirmed:    Yes (verified in Auth)`);
  console.log(`  Audit Log:          Recorded (action: super_admin.credentials_updated)`);
  console.log('\nYou can now sign in at http://localhost:3000/login');
  console.log('================================================================');
}

if (process.argv[1]?.endsWith('update-local-super-admin.ts')) {
  main().catch((err) => {
    console.error('[UNHANDLED_ERROR]', err);
    process.exit(1);
  });
}
