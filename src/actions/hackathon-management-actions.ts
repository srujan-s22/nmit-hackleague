'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/guards';
import {
  hackathonFormSchema,
  deadlineOverrideSchema,
  roundConfigArraySchema,
  lifecycleTransitionSchema,
  type HackathonFormData,
  type DeadlineOverrideData,
  type RoundConfigArrayData,
  type LifecycleTransitionData,
} from '@/lib/validation/hackathon-schemas';
import type { ActionResult } from '@/types/auth';
import type { Json } from '@/types/database';

/**
 * Creates a new hackathon in 'draft' status using the security definer RPC create_hackathon_draft.
 * Restricted to administrators with 'manage_hackathons' or Super Admin.
 */
export async function createHackathonDraftAction(
  rawInput: unknown
): Promise<ActionResult<{ id: string; slug: string; status: string }>> {
  try {
    await requireAdmin('manage_hackathons');

    const parsed = hackathonFormSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        fieldErrors[path] = fieldErrors[path] || [];
        fieldErrors[path].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed. Please correct the highlighted errors.',
        fieldErrors,
      };
    }

    const data: HackathonFormData = parsed.data;
    const supabase = await createClient();

    const { data: result, error } = await supabase.rpc('create_hackathon_draft', {
      p_title: data.title,
      p_slug: data.slug,
      p_tagline: data.tagline || undefined,
      p_description: data.description,
      p_organizer: data.organizer,
      p_mode: data.mode,
      p_venue: data.venue || '',
      p_registration_start_at: data.registrationStartAt,
      p_registration_end_at: data.registrationEndAt,
      p_event_start_at: data.eventStartAt,
      p_event_end_at: data.eventEndAt,
      p_min_team_size: data.minTeamSize,
      p_max_team_size: data.maxTeamSize,
      p_is_solo_allowed: data.isSoloAllowed,
      p_eligibility: data.eligibility,
      p_prizes_summary: data.prizesSummary || undefined,
      p_prizes_detail: (data.prizesDetail ?? []) as unknown as Json,
      p_external_registration_url: data.externalRegistrationUrl || undefined,
      p_community_url: data.communityUrl || undefined,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = result as { id: string; slug: string; status: string };

    revalidatePath('/admin/hackathons');
    revalidatePath('/student/hackathons');

    return {
      success: true,
      message: 'Draft event created successfully.',
      data: payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create hackathon draft.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return { success: false, error: message };
  }
}

/**
 * Updates hackathon configuration/metadata without modifying registration deadline.
 * Enforces round boundary safety checks server-side inside the RPC.
 */
export async function updateHackathonMetadataAction(
  hackathonId: string,
  rawInput: unknown
): Promise<ActionResult<{ id: string; slug: string; status: string }>> {
  try {
    await requireAdmin('manage_hackathons');

    const parsed = hackathonFormSchema.safeParse(rawInput);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        fieldErrors[path] = fieldErrors[path] || [];
        fieldErrors[path].push(issue.message);
      }
      return {
        success: false,
        error: 'Validation failed. Please correct the highlighted errors.',
        fieldErrors,
      };
    }

    const data: HackathonFormData = parsed.data;
    const supabase = await createClient();

    const { data: result, error } = await supabase.rpc('update_hackathon_metadata', {
      p_hackathon_id: hackathonId,
      p_title: data.title,
      p_slug: data.slug,
      p_tagline: data.tagline || '',
      p_description: data.description,
      p_organizer: data.organizer,
      p_mode: data.mode,
      p_venue: data.venue || '',
      p_registration_start_at: data.registrationStartAt,
      p_event_start_at: data.eventStartAt,
      p_event_end_at: data.eventEndAt,
      p_min_team_size: data.minTeamSize,
      p_max_team_size: data.maxTeamSize,
      p_is_solo_allowed: data.isSoloAllowed,
      p_eligibility: data.eligibility,
      p_prizes_summary: data.prizesSummary || '',
      p_prizes_detail: (data.prizesDetail ?? []) as unknown as Json,
      p_external_registration_url: data.externalRegistrationUrl || '',
      p_community_url: data.communityUrl || '',
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = result as { id: string; slug: string; status: string };

    revalidatePath('/admin/hackathons');
    revalidatePath(`/admin/hackathons/${hackathonId}/edit`);
    revalidatePath('/student/hackathons');
    revalidatePath(`/student/hackathons/${data.slug}`);

    return {
      success: true,
      message: 'Hackathon metadata updated successfully.',
      data: payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update hackathon metadata.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return { success: false, error: message };
  }
}

/**
 * Overrides a hackathon registration deadline with mandatory justification and audit logging.
 * Enforces Option A flexible override policy with unchanged deadline rejection.
 */
export async function overrideDeadlineAction(
  rawInput: unknown
): Promise<ActionResult<{ success: boolean; old_deadline: string; new_deadline: string; status: string }>> {
  try {
    await requireAdmin('manage_hackathons');

    const parsed = deadlineOverrideSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid deadline override parameters.',
      };
    }

    const data: DeadlineOverrideData = parsed.data;
    const supabase = await createClient();

    const { data: result, error } = await supabase.rpc('override_hackathon_deadline', {
      p_hackathon_id: data.hackathonId,
      p_new_deadline: data.newDeadline,
      p_reason: data.reason,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = result as {
      success: boolean;
      old_deadline: string;
      new_deadline: string;
      status: string;
    };

    revalidatePath('/admin/hackathons');
    revalidatePath(`/admin/hackathons/${data.hackathonId}/edit`);
    revalidatePath('/student/hackathons');

    return {
      success: true,
      message: 'Registration deadline successfully overridden.',
      data: payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to override deadline.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return { success: false, error: message };
  }
}

/**
 * Reconfigures the complete round structure for a hackathon atomically.
 * Prevents mutation if submissions have been accepted for modified rounds.
 */
export async function configureRoundsAction(
  hackathonId: string,
  rawRounds: unknown
): Promise<ActionResult<{ success: boolean; configured_rounds: number }>> {
  try {
    await requireAdmin('manage_hackathons');

    const parsed = roundConfigArraySchema.safeParse(rawRounds);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid round configuration.',
      };
    }

    const rounds: RoundConfigArrayData = parsed.data;
    const supabase = await createClient();

    const roundsPayload = rounds.map((r) => ({
      id: r.id || undefined,
      round_number: r.roundNumber,
      name: r.name,
      description: r.description || null,
      start_at: r.startAt,
      end_at: r.endAt,
      is_final_round: r.isFinalRound,
    }));

    const { data: result, error } = await supabase.rpc('configure_hackathon_rounds', {
      p_hackathon_id: hackathonId,
      p_rounds: roundsPayload as unknown as Json,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = result as { success: boolean; configured_rounds: number };

    revalidatePath('/admin/hackathons');
    revalidatePath(`/admin/hackathons/${hackathonId}/rounds`);
    revalidatePath('/student/hackathons');

    return {
      success: true,
      message: `Configured ${payload.configured_rounds} rounds successfully.`,
      data: payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to configure rounds.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return { success: false, error: message };
  }
}

/**
 * Transitions hackathon lifecycle (publish, close registration, archive).
 * Enforces state machine invariants, round prerequisite, and premature archival reason.
 */
export async function transitionLifecycleAction(
  rawInput: unknown
): Promise<ActionResult<{ success: boolean; status: string; message: string }>> {
  try {
    await requireAdmin('manage_hackathons');

    const parsed = lifecycleTransitionSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message || 'Invalid lifecycle transition payload.',
      };
    }

    const data: LifecycleTransitionData = parsed.data;
    const supabase = await createClient();

    const { data: result, error } = await supabase.rpc('transition_hackathon_lifecycle', {
      p_hackathon_id: data.hackathonId,
      p_target_status: data.targetStatus,
      p_reason: data.reason || undefined,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = result as { success: boolean; status: string; message: string };

    revalidatePath('/admin/hackathons');
    revalidatePath(`/admin/hackathons/${data.hackathonId}/edit`);
    revalidatePath('/student/hackathons');

    return {
      success: true,
      message: payload.message || `Status updated to ${payload.status}.`,
      data: payload,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to transition hackathon lifecycle.';
    if (message.includes('NEXT_REDIRECT')) {
      throw err;
    }
    return { success: false, error: message };
  }
}
