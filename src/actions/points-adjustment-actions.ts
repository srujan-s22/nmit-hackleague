'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAdmin, requireHackathonScope, requireSuperAdmin } from '@/lib/auth/guards';
import { revalidatePath } from 'next/cache';
import { adjustPointsSchema, reversePointsSchema } from '@/lib/validation/points-schemas';
import type { AdjustPointsActionResult, ReversePointsActionResult } from '@/types/points';

/**
 * Executes a reasoned manual points adjustment.
 * Enforces Level 1 (teams) and Level 2 (profiles) locking, zero-floor guard,
 * Super Admin override authorization, and append-only audit logging.
 */
export async function adjustPointsAction(input: {
  studentId: string;
  hackathonId: string;
  teamId?: string | null;
  points: number;
  reason: string;
  idempotencyKey?: string | null;
  adjustedEntryId?: string | null;
  overrideNegativeFloor?: boolean;
}): Promise<AdjustPointsActionResult> {
  try {
    const validated = adjustPointsSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message || 'Invalid adjustment parameters.',
      };
    }

    const {
      studentId,
      hackathonId,
      teamId,
      points,
      reason,
      idempotencyKey,
      adjustedEntryId,
      overrideNegativeFloor,
    } = validated.data;

    // 1. Authorization: Scoped admin or super admin with manage_points
    if (overrideNegativeFloor) {
      // Overriding negative balance floor requires super_admin
      await requireSuperAdmin();
    } else {
      await requireHackathonScope(hackathonId, 'manage_points');
    }

    const supabase = await createClient();

    let effectiveTeamId = teamId;
    if (!effectiveTeamId) {
      const { data: memberRecord } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('student_id', studentId)
        .eq('hackathon_id', hackathonId)
        .limit(1)
        .maybeSingle();

      if (memberRecord?.team_id) {
        effectiveTeamId = memberRecord.team_id;
      }
    }

    if (!effectiveTeamId) {
      return {
        success: false,
        error: 'Student is not a member of any team in this hackathon. A valid team ID is required.',
      };
    }

    const effectiveIdempotencyKey = idempotencyKey || crypto.randomUUID();

    // 2. Invoke database RPC
    const { data, error } = await supabase.rpc('adjust_points_ledger_entry', {
      p_student_id: studentId,
      p_hackathon_id: hackathonId,
      p_team_id: effectiveTeamId,
      p_points: points,
      p_reason: reason,
      p_idempotency_key: effectiveIdempotencyKey,
      p_adjusted_entry_id: adjustedEntryId || undefined,
      p_override_negative_floor: overrideNegativeFloor ?? false,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    const res = data as any;

    revalidatePath('/admin/points');
    revalidatePath('/student/points');
    revalidatePath('/leaderboard');

    return {
      success: true,
      ledgerId: res.ledger_id,
      points: res.points,
      idempotentReplay: Boolean(res.idempotent_replay),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to adjust points.',
    };
  }
}

/**
 * Reverses a prior award entry using Option 2A (Exact Accounting Reversal).
 * Appends an exact negative cancellation row (-1 * orig.points) referencing reversal_of_id.
 */
export async function reversePointsAction(input: {
  ledgerId: string;
  reason: string;
}): Promise<ReversePointsActionResult> {
  try {
    const validated = reversePointsSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: validated.error.issues[0]?.message || 'Invalid reversal parameters.',
      };
    }

    const { ledgerId, reason } = validated.data;
    const supabase = await createClient();

    // 1. Find entry to check hackathon scope
    const { data: entry, error: findError } = await supabase
      .from('points_ledger')
      .select('id, hackathon_id')
      .eq('id', ledgerId)
      .single();

    if (findError || !entry) {
      return {
        success: false,
        error: 'Points ledger entry not found.',
      };
    }

    // 2. Verify scoped admin permission
    await requireHackathonScope(entry.hackathon_id, 'manage_points');

    // 3. Invoke database RPC
    const { data, error } = await supabase.rpc('reverse_points_ledger_entry', {
      p_ledger_id: ledgerId,
      p_reason: reason,
    });

    if (error) {
      return {
        success: false,
        error: error.message,
      };
    }

    const res = data as any;

    revalidatePath('/admin/points');
    revalidatePath('/student/points');
    revalidatePath('/leaderboard');

    return {
      success: true,
      reversalLedgerId: res.reversal_ledger_id,
      reversedPoints: res.reversed_points,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to reverse points entry.',
    };
  }
}
