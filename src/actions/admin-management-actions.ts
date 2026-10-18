'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { checkRateLimit } from '@/lib/auth/rate-limiter';
import {
  adminCreationSchema,
  adminPermissionsUpdateSchema,
  adminStatusSchema,
  adminReassignSchema,
} from '@/lib/auth/permissions';
import type {
  AdminCreationInput,
  AdminUpdateInput,
  AdminWithPermissions,
  ActionResult,
} from '@/types/auth';

/**
 * Fetch all administrator accounts with their explicit permissions and assigned active hackathons.
 * Restricted strictly to active Super Admin.
 */
export async function fetchAdminsAction(): Promise<ActionResult<AdminWithPermissions[]>> {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    const { data: admins, error: adminsError } = await supabase
      .from('admin_profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (adminsError) {
      return { success: false, error: adminsError.message };
    }

    const { data: permissionsData, error: permError } = await supabase
      .from('admin_permissions')
      .select('admin_id, permission');

    if (permError) {
      return { success: false, error: permError.message };
    }

    const { data: activeHackathonsData } = await supabase
      .from('hackathons')
      .select('id, title, slug, status, in_charge_admin_id')
      .in('status', ['published', 'registration_closed', 'ongoing']);

    const permMap = new Map<string, string[]>();
    for (const p of permissionsData || []) {
      const existing = permMap.get(p.admin_id) || [];
      existing.push(p.permission);
      permMap.set(p.admin_id, existing);
    }

    const hackathonMap = new Map<string, { id: string; title: string; slug: string; status: string }[]>();
    for (const h of activeHackathonsData || []) {
      if (h.in_charge_admin_id) {
        const existing = hackathonMap.get(h.in_charge_admin_id) || [];
        existing.push({
          id: h.id,
          title: h.title,
          slug: h.slug,
          status: h.status,
        });
        hackathonMap.set(h.in_charge_admin_id, existing);
      }
    }

    const result: AdminWithPermissions[] = (admins || []).map((admin) => {
      const activeEvents = hackathonMap.get(admin.id) || [];
      return {
        ...admin,
        permissions: (permMap.get(admin.id) || []) as AdminWithPermissions['permissions'],
        activeHackathons: activeEvents,
        activeHackathonsCount: activeEvents.length,
      };
    });

    return { success: true, data: result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch administrator accounts.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return { success: false, error: message };
  }
}

/**
 * Provision a new administrator account.
 * Executes cross-system saga:
 * 1. Verify caller is active Super Admin
 * 2. Pre-check email uniqueness across profiles and admin_profiles
 * 3. GoTrue Admin inviteUserByEmail
 * 4. Transactional provision_admin_profile RPC
 * 5. Compensating deleteUser if DB transaction fails
 */
export async function createAdminAction(
  input: AdminCreationInput
): Promise<ActionResult<{ adminId: string }>> {
  let callerSuperAdmin: { admin: { id: string }; user: { id: string } };
  try {
    callerSuperAdmin = await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  // 1. Validate input payload against Zod schema
  const parsed = adminCreationSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
    return { success: false, error: errorMsg };
  }

  const { email, fullName, permissions } = parsed.data;

  // 2. Consume rate limit quota
  try {
    const allowed = await checkRateLimit('admin_management');
    if (!allowed) {
      return { success: false, error: 'Rate limit exceeded: maximum 10 administrative operations per minute.' };
    }
  } catch {
    // If rate limiter fails, proceed cautiously in development
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // 3. Pre-check email exclusivity in public.profiles (Student)
  const { data: existingStudent } = await adminClient
    .from('profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle();

  if (existingStudent) {
    return {
      success: false,
      error: 'Cannot provision administrator: this email belongs to an existing student',
    };
  }

  // 4. Pre-check email exclusivity in public.admin_profiles
  const { data: existingAdmin } = await adminClient
    .from('admin_profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle();

  if (existingAdmin) {
    return {
      success: false,
      error: 'An account with this email already exists.',
    };
  }

  // 5. Check if user already exists in GoTrue (e.g. from an interrupted prior attempt)
  let targetAuthUid: string | null = null;
  let isNewlyCreatedAuthUser = false;

  const { data: userListData } = await adminClient.auth.admin.listUsers();
  const existingAuthUser = (userListData?.users || []).find(
    (u) => u.email?.toLowerCase().trim() === email.toLowerCase().trim()
  );

  if (existingAuthUser) {
    // User exists in GoTrue: verify if it has any DB profile
    targetAuthUid = existingAuthUser.id;
  } else {
    // 6. GoTrue Invitation
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
      const msg = inviteError?.message || 'Failed to dispatch administrator invitation.';
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('exists')) {
        return { success: false, error: 'An account with this email already exists.' };
      }
      return { success: false, error: msg };
    }

    targetAuthUid = inviteData.user.id;
    isNewlyCreatedAuthUser = true;
  }

  // 7. Atomic Database Provisioning via provision_admin_profile RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc('provision_admin_profile', {
    p_auth_uid: targetAuthUid,
    p_email: email,
    p_full_name: fullName,
    p_permissions: permissions,
  });

  if (rpcError) {
    // 8. Compensating Cleanup if newly created in this saga
    if (isNewlyCreatedAuthUser && targetAuthUid) {
      try {
        await adminClient.auth.admin.deleteUser(targetAuthUid);
      } catch (compError) {
        console.error('[PROVISION_COMPENSATION_FAILED] [CRITICAL_AUTH_ORPHAN]', {
          adminId: targetAuthUid,
          email,
          error: compError,
        });
        return {
          success: false,
          error: 'Partial failure: database provisioning failed and identity could not be automatically deleted. Account quarantined with zero permissions. Safe to retry.',
        };
      }
    }

    return {
      success: false,
      error: rpcError.message || 'Database provisioning failed.',
    };
  }

  return {
    success: true,
    message: 'Administrator provisioned successfully and invitation dispatched.',
    data: { adminId: targetAuthUid },
  };
}

/**
 * Update an administrator's assigned permissions.
 * Restricted to active Super Admin.
 */
export async function updateAdminPermissionsAction(
  input: { adminId: string; permissions: import('@/lib/auth/permissions').AdminPermissionKey[] }
): Promise<ActionResult> {
  let callerSuperAdmin: { admin: { id: string }; user: { id: string } };
  try {
    callerSuperAdmin = await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  const parsed = adminPermissionsUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { adminId, permissions } = parsed.data;

  if (adminId === callerSuperAdmin.admin.id) {
    return { success: false, error: 'Self-management prohibited: Super Admin cannot modify their own permissions.' };
  }

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc('manage_admin_permissions', {
    p_target_admin_id: adminId,
    p_permissions: permissions,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return {
    success: true,
    message: 'Administrator permissions updated successfully.',
  };
}

/**
 * Activate or deactivate an administrator account.
 * Restricted to active Super Admin.
 */
export async function setAdminActiveStatusAction(
  input: { adminId: string; isActive: boolean; reason: string }
): Promise<ActionResult> {
  let callerSuperAdmin: { admin: { id: string }; user: { id: string } };
  try {
    callerSuperAdmin = await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  const parsed = adminStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { adminId, isActive, reason } = parsed.data;

  if (adminId === callerSuperAdmin.admin.id) {
    return { success: false, error: 'Self-deactivation prohibited: Super Admin cannot deactivate their own account.' };
  }

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc('set_admin_active_status', {
    p_target_admin_id: adminId,
    p_is_active: isActive,
    p_reason: reason,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return {
    success: true,
    message: isActive ? 'Administrator account reactivated.' : 'Administrator account deactivated.',
  };
}

/**
 * Atomically reassign the in-charge administrator of a hackathon.
 * Restricted strictly to active Super Admin.
 */
export async function reassignHackathonInChargeAdminAction(input: {
  hackathonId: string;
  newAdminId: string;
  justification: string;
}): Promise<ActionResult<{ hackathonId: string; inChargeAdminId: string }>> {
  try {
    await requireSuperAdmin();
  } catch {
    return { success: false, error: 'Unauthorized: Super Admin authority required' };
  }

  const parsed = adminReassignSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const { hackathonId, newAdminId, justification } = parsed.data;

  try {
    const allowed = await checkRateLimit('admin_management');
    if (!allowed) {
      return { success: false, error: 'Rate limit exceeded: maximum 10 administrative operations per minute.' };
    }
  } catch {
    // Proceed if rate limiter throws in non-standard context
  }

  const supabase = await createClient();
  const { error: rpcError } = await supabase.rpc('reassign_hackathon_in_charge_admin', {
    p_hackathon_id: hackathonId,
    p_new_admin_id: newAdminId,
    p_justification: justification,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return {
    success: true,
    message: 'Hackathon in-charge administrator reassigned successfully.',
    data: {
      hackathonId,
      inChargeAdminId: newAdminId,
    },
  };
}

/**
 * Fetch eligible administrators for in-charge assignment.
 * Target must be active and either Super Admin or hold 'manage_hackathons'.
 */
export async function fetchEligibleAdminsForReassignmentAction(): Promise<
  ActionResult<Array<{ id: string; full_name: string; email: string; is_super_admin: boolean }>>
> {
  try {
    await requireSuperAdmin();
    const supabase = await createClient();

    // Query active admins
    const { data: admins, error: adminsError } = await supabase
      .from('admin_profiles')
      .select('id, full_name, email, is_super_admin')
      .eq('is_active', true);

    if (adminsError) {
      return { success: false, error: adminsError.message };
    }

    // Query who has manage_hackathons
    const { data: permData, error: permError } = await supabase
      .from('admin_permissions')
      .select('admin_id')
      .eq('permission', 'manage_hackathons');

    if (permError) {
      return { success: false, error: permError.message };
    }

    const permittedSet = new Set((permData || []).map((p) => p.admin_id));
    const eligible = (admins || []).filter(
      (a) => a.is_super_admin || permittedSet.has(a.id)
    );

    return { success: true, data: eligible };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch eligible administrators.';
    return { success: false, error: message };
  }
}
