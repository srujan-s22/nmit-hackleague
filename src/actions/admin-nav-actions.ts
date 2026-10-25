'use server';

import { createClient } from '@/lib/supabase/server';
import { adminHasAssignments, type NavStateClient } from '@/lib/admin/nav-state';

export interface MyAdminNavState {
  adminId: string;
  isSuperAdmin: boolean;
  permissions: string[];
  hasAssignments: boolean;
}

/**
 * Fresh navigation state for the signed-in admin, used only to refresh the
 * client's sidebar cache. Display data about the caller's own account: it grants
 * nothing, and returns { success: false } (no redirect, no error) for anyone who
 * is not an active admin so the client keeps/clears its cache accordingly.
 */
export async function getMyAdminNavStateAction(): Promise<{ success: boolean; state?: MyAdminNavState }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const { data: admin } = await supabase
      .from('admin_profiles')
      .select('id, is_super_admin, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (!admin || !admin.is_active) return { success: false };

    const [{ data: permissionRows }, hasAssignments] = await Promise.all([
      supabase.from('admin_permissions').select('permission').eq('admin_id', user.id),
      adminHasAssignments(supabase as unknown as NavStateClient, user.id),
    ]);

    return {
      success: true,
      state: {
        adminId: user.id,
        isSuperAdmin: Boolean(admin.is_super_admin),
        permissions: (permissionRows ?? []).map((p) => p.permission),
        hasAssignments,
      },
    };
  } catch {
    return { success: false };
  }
}
