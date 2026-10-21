'use server';

import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';
import { updatePointConfigurationSchema } from '@/lib/validation/points-schemas';
import type { UpdatePointConfigActionResult } from '@/types/points';

/**
 * Updates milestone point values in point_configurations.
 * Restricted strictly to Super Admin.
 * Winner bonuses cannot be updated or reactivated.
 */
export async function updatePointConfigurationAction(input: {
  milestoneType: string;
  regularMemberPoints: number;
  teamLeaderPoints: number;
}): Promise<UpdatePointConfigActionResult> {
  try {
    // 1. Strict Super Admin guard
    const { admin, user } = await requireSuperAdmin();

    // 2. Validate input schema (strictly rejects win_placement)
    const validated = updatePointConfigurationSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message || 'Invalid configuration parameters.',
      };
    }

    const { milestoneType, regularMemberPoints, teamLeaderPoints } = validated.data;
    const supabase = await createClient();

    // 3. Fetch existing configuration
    const { data: existing, error: fetchErr } = await supabase
      .from('point_configurations')
      .select('*')
      .eq('milestone_type', milestoneType)
      .single();

    if (fetchErr || !existing) {
      return {
        success: false,
        error: `Point configuration for ${milestoneType} not found.`,
      };
    }

    // 4. Update configuration
    const { data: updated, error: updateErr } = await supabase
      .from('point_configurations')
      .update({
        regular_member_points: regularMemberPoints,
        team_leader_points: teamLeaderPoints,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('milestone_type', milestoneType)
      .select()
      .single();

    if (updateErr || !updated) {
      return {
        success: false,
        error: updateErr?.message || 'Failed to update point configuration.',
      };
    }

    // 5. Append audit log
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      actor_role: 'super_admin',
      action: 'point_configuration.updated',
      target_type: 'point_configuration',
      target_id: updated.id,
      details: {
        milestone_type: milestoneType,
        previous_regular_member_points: existing.regular_member_points,
        previous_team_leader_points: existing.team_leader_points,
        new_regular_member_points: regularMemberPoints,
        new_team_leader_points: teamLeaderPoints,
      },
    });

    revalidatePath('/admin/points');

    return {
      success: true,
      config: {
        id: updated.id,
        milestone_type: updated.milestone_type,
        regular_member_points: updated.regular_member_points,
        team_leader_points: updated.team_leader_points,
        is_active: updated.is_active,
        updated_by: updated.updated_by,
        updated_at: updated.updated_at,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update point configuration.',
    };
  }
}
