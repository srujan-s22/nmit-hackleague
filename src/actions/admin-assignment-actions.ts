'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';

export interface HackathonAssignmentItem {
  id: string;
  hackathon_id: string;
  admin_id: string;
  assigned_by: string;
  assigned_at: string;
  role: string;
  notes: string | null;
  admin: {
    id: string;
    full_name: string;
    email: string;
    is_active: boolean;
  };
  assigner?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export interface AssignedHackathonSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  mode: string;
  venue: string | null;
  event_start_at: string;
  event_end_at: string;
  registration_start_at: string;
  registration_end_at: string;
  external_registration_url: string | null;
  role: 'in_charge' | 'coordinator' | 'reviewer';
  assigned_at: string;
  notes: string | null;
  totalSubmissions?: number;
  pendingSubmissions?: number;
}

const assignAdminSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon ID format'),
  targetAdminId: z.string().uuid('Invalid target administrator ID format'),
  role: z.enum(['reviewer', 'coordinator']).default('reviewer'),
  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional().nullable(),
});

const removeAdminSchema = z.object({
  hackathonId: z.string().uuid('Invalid hackathon ID format'),
  targetAdminId: z.string().uuid('Invalid target administrator ID format'),
  justification: z
    .string()
    .min(10, 'Removal justification must be at least 10 characters')
    .max(500, 'Justification cannot exceed 500 characters'),
});

/**
 * Fetches all hackathons eligible for reviewer and coordinator assignment.
 * Accessible to Super Admin or administrators with `assign_hackathons` permission.
 */
export async function fetchHackathonsForAssignmentAction(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    mode: string;
    venue: string | null;
    in_charge_admin_id: string | null;
    event_start_at: string;
    event_end_at: string;
  }>;
  error?: string;
}> {
  try {
    const { admin, permissions } = await requireAdmin();
    const isSuperAdmin = Boolean(admin.is_super_admin);
    const canAssign = isSuperAdmin || permissions.includes('assign_hackathons');

    if (!canAssign) {
      return { success: false, error: 'Unauthorized: assignment management requires assign_hackathons.' };
    }

    const supabase = await createClient();
    const { data: hackathons, error } = await supabase
      .from('hackathons')
      .select('id, title, slug, status, mode, venue, in_charge_admin_id, event_start_at, event_end_at')
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: hackathons || [] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch hackathons.' };
  }
}

/**
 * Fetches currently active administrators available to be assigned to hackathons.
 * Strictly excludes inactive administrators.
 */
export async function fetchActiveAdminsForAssignmentAction(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    full_name: string;
    email: string;
    is_active: boolean;
    is_super_admin: boolean;
  }>;
  error?: string;
}> {
  try {
    const { admin, permissions } = await requireAdmin();
    const isSuperAdmin = Boolean(admin.is_super_admin);
    const canAssign = isSuperAdmin || permissions.includes('assign_hackathons');

    if (!canAssign) {
      return { success: false, error: 'Unauthorized: assignment management requires assign_hackathons.' };
    }

    const supabase = await createClient();
    const { data: admins, error } = await supabase
      .from('admin_profiles')
      .select('id, full_name, email, is_active, is_super_admin')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: admins || [] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch active administrators.' };
  }
}

/**
 * Fetches all assignments for a specific hackathon, including reviewer details and primary in-charge admin.
 */
export async function fetchHackathonAssignmentsAction(hackathonId: string): Promise<{
  success: boolean;
  data?: {
    assignments: HackathonAssignmentItem[];
    inChargeAdminId: string | null;
  };
  error?: string;
}> {
  try {
    const uuidParse = z.string().uuid().safeParse(hackathonId);
    if (!uuidParse.success) {
      return { success: false, error: 'Invalid hackathon ID format.' };
    }

    const { admin, permissions } = await requireAdmin();
    const isSuperAdmin = Boolean(admin.is_super_admin);
    const canAssign = isSuperAdmin || permissions.includes('assign_hackathons');

    if (!canAssign) {
      return { success: false, error: 'Unauthorized: viewing assignments requires assign_hackathons or Super Admin.' };
    }

    const supabase = await createClient();

    // 1. Get hackathon details for in_charge_admin_id
    const { data: hackathon, error: hError } = await supabase
      .from('hackathons')
      .select('id, title, in_charge_admin_id')
      .eq('id', hackathonId)
      .single();

    if (hError || !hackathon) {
      return { success: false, error: 'Hackathon not found.' };
    }

    // 2. Fetch assignments joined with admin_profiles
    const { data: assignments, error: aError } = await supabase
      .from('hackathon_admin_assignments')
      .select(`
        id,
        hackathon_id,
        admin_id,
        assigned_by,
        assigned_at,
        role,
        notes,
        admin:admin_profiles!hackathon_admin_assignments_admin_id_fkey (
          id,
          full_name,
          email,
          is_active
        ),
        assigner:admin_profiles!hackathon_admin_assignments_assigned_by_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq('hackathon_id', hackathonId)
      .order('assigned_at', { ascending: false });

    if (aError) {
      return { success: false, error: aError.message };
    }

    // Format results cleanly
    const items: HackathonAssignmentItem[] = (assignments || []).map((row: any) => ({
      id: row.id,
      hackathon_id: row.hackathon_id,
      admin_id: row.admin_id,
      assigned_by: row.assigned_by,
      assigned_at: row.assigned_at,
      role: row.role,
      notes: row.notes,
      admin: row.admin,
      assigner: row.assigner,
    }));

    return {
      success: true,
      data: {
        assignments: items,
        inChargeAdminId: hackathon.in_charge_admin_id,
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch assignments.' };
  }
}

/**
 * Assigns an active administrator to a hackathon with role ('reviewer' or 'coordinator').
 * Invokes the database RPC assign_admin_to_hackathon.
 */
export async function assignAdminToHackathonAction(rawInput: {
  hackathonId: string;
  targetAdminId: string;
  role?: 'reviewer' | 'coordinator';
  notes?: string;
}): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const parse = assignAdminSchema.safeParse(rawInput);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid assignment input.' };
    }

    const { hackathonId, targetAdminId, role, notes } = parse.data;
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('assign_admin_to_hackathon', {
      p_hackathon_id: hackathonId,
      p_target_admin_id: targetAdminId,
      p_role: role,
      p_notes: notes || undefined,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/admins');
    revalidatePath('/admin/hackathons');
    revalidatePath('/admin/assigned-hackathons');

    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to assign administrator.' };
  }
}

/**
 * Removes an administrator assignment from a hackathon with mandatory justification.
 * Invokes the database RPC remove_admin_from_hackathon.
 */
export async function removeAdminFromHackathonAction(rawInput: {
  hackathonId: string;
  targetAdminId: string;
  justification: string;
}): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  try {
    const parse = removeAdminSchema.safeParse(rawInput);
    if (!parse.success) {
      return { success: false, error: parse.error.issues[0]?.message || 'Invalid removal input.' };
    }

    const { hackathonId, targetAdminId, justification } = parse.data;
    await requireAdmin();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('remove_admin_from_hackathon', {
      p_hackathon_id: hackathonId,
      p_target_admin_id: targetAdminId,
      p_justification: justification.trim(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/admin/admins');
    revalidatePath('/admin/hackathons');
    revalidatePath('/admin/assigned-hackathons');

    return { success: true, data };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to remove administrator assignment.' };
  }
}

/**
 * Fetches all hackathons assigned to the currently authenticated administrator.
 * Includes both explicitly assigned rows (reviewer/coordinator) and in-charge designations.
 */
export async function fetchMyAssignedHackathonsAction(): Promise<{
  success: boolean;
  data?: AssignedHackathonSummary[];
  isSuperAdmin?: boolean;
  error?: string;
}> {
  try {
    const { admin } = await requireAdmin();
    const isSuperAdmin = Boolean(admin.is_super_admin);
    const supabase = await createClient();

    // 1. Fetch direct assignments
    const { data: assignments, error: aError } = await supabase
      .from('hackathon_admin_assignments')
      .select('hackathon_id, role, notes, assigned_at')
      .eq('admin_id', admin.id);

    if (aError) {
      return { success: false, error: aError.message };
    }

    const assignedHackathonIds = new Set((assignments || []).map((a) => a.hackathon_id));
    const assignmentRoleMap = new Map<string, { role: 'in_charge' | 'coordinator' | 'reviewer'; assigned_at: string; notes: string | null }>();

    for (const a of assignments || []) {
      assignmentRoleMap.set(a.hackathon_id, {
        role: a.role as any,
        assigned_at: a.assigned_at,
        notes: a.notes,
      });
    }

    // 2. Fetch hackathons where admin is in_charge
    const { data: inChargeHackathons, error: inChargeErr } = await supabase
      .from('hackathons')
      .select('id, created_at')
      .eq('in_charge_admin_id', admin.id);

    if (!inChargeErr && inChargeHackathons) {
      for (const h of inChargeHackathons) {
        assignedHackathonIds.add(h.id);
        if (!assignmentRoleMap.has(h.id)) {
          assignmentRoleMap.set(h.id, {
            role: 'in_charge',
            assigned_at: h.created_at,
            notes: 'Designated In-Charge Administrator',
          });
        }
      }
    }

    if (assignedHackathonIds.size === 0 && !isSuperAdmin) {
      return { success: true, data: [], isSuperAdmin: false };
    }

    // 3. Query hackathons
    let query = supabase.from('hackathons').select('*');
    if (!isSuperAdmin) {
      query = query.in('id', Array.from(assignedHackathonIds));
    }

    const { data: hackathons, error: hError } = await query.order('event_start_at', { ascending: true });

    if (hError) {
      return { success: false, error: hError.message };
    }

    const summaries: AssignedHackathonSummary[] = (hackathons || []).map((h) => {
      const assignment = assignmentRoleMap.get(h.id);
      return {
        id: h.id,
        title: h.title,
        slug: h.slug,
        status: h.status,
        mode: h.mode,
        venue: h.venue,
        event_start_at: h.event_start_at,
        event_end_at: h.event_end_at,
        registration_start_at: h.registration_start_at,
        registration_end_at: h.registration_end_at,
        external_registration_url: h.external_registration_url,
        role: assignment ? assignment.role : (isSuperAdmin ? 'in_charge' : 'reviewer'),
        assigned_at: assignment ? assignment.assigned_at : h.created_at,
        notes: assignment ? assignment.notes : null,
      };
    });

    return {
      success: true,
      data: summaries,
      isSuperAdmin,
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to fetch assigned hackathons.' };
  }
}
