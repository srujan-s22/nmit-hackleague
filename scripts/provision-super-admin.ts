#!/usr/bin/env node
/**
 * NMIT HackLeague — Super Admin Bootstrap & Provisioning CLI Script
 *
 * Implements the out-of-band operational establishment of the platform's
 * sole active Super Admin according to Phase 5 Specification (Revision 1.5.2).
 *
 * Usage:
 *   npx tsx scripts/provision-super-admin.ts --email=owner@nmit.ac.in --name="Dr. Nagaraj" [--dry-run]
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured in environment.
 *   - Plaintext passwords are NEVER accepted, logged, or generated.
 *   - Implicit Super Admin authority: zero admin_permissions rows are created.
 */

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

interface CliArgs {
  email?: string;
  name?: string;
  dryRun?: boolean;
}

function parseArgs(): CliArgs {
  const args: CliArgs = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--email=')) {
      args.email = arg.split('=')[1]?.trim();
    } else if (arg.startsWith('--name=')) {
      args.name = arg.split('=').slice(1).join('=').trim();
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

export async function bootstrapSuperAdmin(cliArgs?: CliArgs) {
  const args = cliArgs || parseArgs();

  console.log('------------------------------------------------------------');
  console.log('NMIT HackLeague — Super Admin Bootstrap Utility');
  console.log('------------------------------------------------------------');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[FATAL] Missing required environment variables.');
    console.error('Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
    process.exit(1);
  }

  if (!args.email || !args.name) {
    console.error('[ERROR] Both --email and --name arguments are required.');
    console.error('Example: npx tsx scripts/provision-super-admin.ts --email="owner@nmit.ac.in" --name="Dr. Nagaraj"');
    process.exit(1);
  }

  const email = args.email.toLowerCase().trim();
  const fullName = args.name.trim();

  // Basic email validation
  if (!email.includes('@') || !email.includes('.')) {
    console.error(`[ERROR] Invalid email address format: "${email}".`);
    process.exit(1);
  }

  console.log(`[INFO] Target Super Admin: ${fullName} <${email}>`);
  if (args.dryRun) {
    console.log('[INFO] Dry-run mode enabled: validating configuration and connectivity only.');
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 1. Pre-check: Ensure email does NOT exist in public.profiles (Student collision)
  const { data: studentMatch, error: studentCheckError } = await adminClient
    .from('profiles')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle();

  if (studentCheckError) {
    console.error(`[ERROR] Database check failed: ${studentCheckError.message}`);
    process.exit(1);
  }

  if (studentMatch) {
    console.error(`[ABORT] Dual-identity collision: email ${email} is registered as a student participant.`);
    process.exit(1);
  }

  if (args.dryRun) {
    console.log('[SUCCESS] Dry run completed: configuration valid and no collisions detected.');
    return;
  }

  // 2. Check if user already exists in auth.users (Reconcile / Retry)
  let targetAuthUid: string | null = null;
  let isNewlyCreated = false;

  const { data: userListData, error: listError } = await adminClient.auth.admin.listUsers();
  if (listError) {
    console.error(`[ERROR] Failed to list auth users: ${listError.message}`);
    process.exit(1);
  }

  const existingAuthUser = (userListData?.users || []).find(
    (u) => u.email?.toLowerCase().trim() === email
  );

  if (existingAuthUser) {
    targetAuthUid = existingAuthUser.id;
    console.log(`[INFO] Found existing Auth user identity (UUID: ${targetAuthUid}). Proceeding to reconciliation.`);
  } else {
    // 3. Dispatch GoTrue Invitation
    console.log('[INFO] Dispatching GoTrue invitation...');
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          role: 'admin',
          full_name: fullName,
        },
      }
    );

    if (inviteError || !inviteData?.user) {
      console.error(`[ABORT] GoTrue invitation failed: ${inviteError?.message || 'Unknown error'}. 0 DB writes performed.`);
      process.exit(1);
    }

    targetAuthUid = inviteData.user.id;
    isNewlyCreated = true;
    console.log(`[INFO] GoTrue invitation sent. Auth UUID established: ${targetAuthUid}`);
  }

  // 4. Execute bootstrap_super_admin RPC under service_role authority
  console.log('[INFO] Executing transactional bootstrap_super_admin RPC in PostgreSQL...');
  const { data: rpcData, error: rpcError } = await adminClient.rpc('bootstrap_super_admin', {
    p_auth_uid: targetAuthUid,
    p_email: email,
    p_full_name: fullName,
  });

  if (rpcError) {
    console.error(`[ERROR] PostgreSQL bootstrap rejected: ${rpcError.message}`);

    if (isNewlyCreated && targetAuthUid) {
      console.log('[INFO] Attempting compensating Auth cleanup for newly invited user...');
      try {
        await adminClient.auth.admin.deleteUser(targetAuthUid);
        console.log('[INFO] Compensating Auth cleanup successful. Safe to retry.');
      } catch (cleanError) {
        console.error('[CRITICAL_AUTH_ORPHAN] Compensating Auth cleanup failed!');
        console.error(`Orphaned User ID: ${targetAuthUid}`);
        console.error('Operator Remediation: Manually remove user from auth.users via Supabase dashboard or SQL.');
      }
    } else {
      console.log('[INFO] Pre-existing Auth user retained. Zero database changes applied.');
    }

    process.exit(1);
  }

  const result = rpcData as { success: boolean; status: string; message?: string };

  if (result.status === 'already_bootstrapped') {
    console.log('[NOTICE] Super Admin identity is already established. Zero mutations applied.');
    console.log('Result:', result);
  } else if (result.status === 'bootstrapped') {
    console.log('[SUCCESS] Super Admin account successfully established!');
    console.log(`Admin ID: ${targetAuthUid}`);
    console.log('Implicit authority conferred: zero admin_permissions rows created.');
    console.log('Audit record written: actor_role = system_bootstrap.');
    console.log('Check recipient email to complete account setup and set password.');
  } else {
    console.log('[INFO] RPC executed with outcome:', result);
  }

  console.log('------------------------------------------------------------');
}

// Execute when run directly
if (process.argv[1]?.endsWith('provision-super-admin.ts')) {
  bootstrapSuperAdmin().catch((err) => {
    console.error('[UNHANDLED_ERROR]', err);
    process.exit(1);
  });
}
