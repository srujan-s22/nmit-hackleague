'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { sendWebPushNotification, type PushPayload } from '@/lib/notifications/push-service';
import { checkSystemHealth, type SystemHealthReport } from '@/lib/reliability/health-service';
import { revalidatePath } from 'next/cache';
import type { Json } from '@/types/database';

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  target_role: 'all' | 'students' | 'admins';
  hackathon_id?: string | null;
  announcement_type?: 'general' | 'deadline' | 'system' | 'urgent';
  metadata?: Record<string, unknown>;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
}

export interface PublishAnnouncementResult {
  success: boolean;
  announcementId?: string;
  subscribersTargeted?: number;
  error?: string;
  message?: string;
}

export interface DeliveryStats {
  delivered: number;
  failed: number;
  expired: number;
  pending: number;
  totalAttempts: number;
}

/**
 * Publishes an announcement across the platform and triggers Web Push broadcast
 * to all active subscribers in the targeted audience.
 * Enforces 'manage_notifications' administrative permission or Super Admin authority,
 * or assigned hackathon admin authority when scoped to an event.
 */
export async function publishAnnouncementAction(
  title: string,
  message: string,
  targetRole: 'all' | 'students' | 'admins' = 'all',
  hackathonId?: string,
  announcementType: 'general' | 'deadline' | 'system' | 'urgent' = 'general',
  metadata?: Record<string, unknown>
): Promise<PublishAnnouncementResult> {
  try {
    // 1. Enforce admin permission
    await requireAdmin('manage_notifications');

    const supabase = await createClient();

    if (!title || !title.trim()) {
      return { success: false, error: 'Announcement title is mandatory.' };
    }

    if (!message || !message.trim()) {
      return { success: false, error: 'Announcement message body is mandatory.' };
    }

    if (!['all', 'students', 'admins'].includes(targetRole)) {
      return { success: false, error: 'Invalid target audience specified.' };
    }

    // Call public.publish_announcement RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('publish_announcement', {
      p_title: title.trim(),
      p_body: message.trim(),
      p_target_role: targetRole,
      p_hackathon_id: hackathonId || undefined,
      p_announcement_type: announcementType,
      p_metadata: (metadata || {}) as Json,
    });

    if (rpcError) {
      return {
        success: false,
        error: `Failed to publish announcement: ${rpcError.message}`,
      };
    }

    const newAnnouncementId = (rpcData as { announcement_id?: string })?.announcement_id;
    let subscribersCount = 0;

    // Dispatch Web Push notifications to active subscribers
    try {
      const adminClient = createAdminClient();
      let query = adminClient
        .from('user_push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_id')
        .eq('active', true);

      if (hackathonId) {
        // Scoped event: target students registered in this hackathon + event admins
        const { data: teamMembers } = await adminClient
          .from('team_members')
          .select('student_id')
          .eq('hackathon_id', hackathonId);

        const { data: eventAdmins } = await adminClient
          .from('hackathons')
          .select('in_charge_admin_id')
          .eq('id', hackathonId)
          .maybeSingle();

        const targetUserIds = new Set<string>();
        (teamMembers || []).forEach((tm) => targetUserIds.add(tm.student_id));
        if (eventAdmins?.in_charge_admin_id) {
          targetUserIds.add(eventAdmins.in_charge_admin_id);
        }

        if (targetUserIds.size > 0) {
          query = query.in('user_id', Array.from(targetUserIds));
        } else {
          query = query.in('user_id', ['00000000-0000-0000-0000-000000000000']); // empty match
        }
      } else {
        // Global targeting based on role
        if (targetRole === 'students') {
          const { data: studentUsers } = await adminClient.from('profiles').select('id');
          const studentIds = (studentUsers || []).map((u) => u.id);
          if (studentIds.length > 0) {
            query = query.in('user_id', studentIds);
          } else {
            query = query.in('user_id', ['00000000-0000-0000-0000-000000000000']);
          }
        } else if (targetRole === 'admins') {
          const { data: adminUsers } = await adminClient.from('admin_profiles').select('id');
          const adminIds = (adminUsers || []).map((u) => u.id);
          if (adminIds.length > 0) {
            query = query.in('user_id', adminIds);
          } else {
            query = query.in('user_id', ['00000000-0000-0000-0000-000000000000']);
          }
        }
      }

      const { data: subscriptions } = await query;
      subscribersCount = subscriptions?.length || 0;

      if (subscriptions && subscriptions.length > 0) {
        const pushPayload: PushPayload = {
          title: `NMIT HackLeague: ${title.trim()}`,
          body: message.trim().slice(0, 180),
          url: hackathonId ? `/student/hackathons` : '/student/hackathons',
          tag: `hackleague-${announcementType}`,
        };

        // Dispatch push to active subscribers with bounded retries and audit logging
        await Promise.allSettled(
          subscriptions.map((sub) =>
            sendWebPushNotification(
              { ...sub, userId: sub.user_id },
              pushPayload,
              { announcementId: newAnnouncementId, userId: sub.user_id }
            )
          )
        );
      }
    } catch {
      // Non-blocking: Announcement remains published in DB even if push gateway fails
    }

    revalidatePath('/admin/notifications');
    revalidatePath('/student/hackathons');
    revalidatePath('/student');
    revalidatePath('/admin');

    return {
      success: true,
      announcementId: newAnnouncementId,
      subscribersTargeted: subscribersCount,
      message: 'Announcement successfully published and broadcast dispatched.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to publish announcement.',
    };
  }
}

/**
 * Publishes a deadline reminder announcement scoped to a hackathon round.
 */
export async function publishDeadlineReminderAction(
  hackathonId: string,
  roundId: string,
  deadline: string,
  customMessage?: string
): Promise<PublishAnnouncementResult> {
  try {
    const supabase = await createClient();

    if (!hackathonId || !roundId || !deadline) {
      return { success: false, error: 'Hackathon, round, and deadline timestamp are mandatory.' };
    }

    const { data, error } = await supabase.rpc('publish_deadline_reminder', {
      p_hackathon_id: hackathonId,
      p_round_id: roundId,
      p_deadline: deadline,
      p_custom_message: customMessage || undefined,
    });

    if (error) {
      return { success: false, error: `Failed to publish deadline reminder: ${error.message}` };
    }

    const res = data as { announcement_id?: string; title?: string };

    revalidatePath('/admin/notifications');
    revalidatePath('/student/hackathons');

    return {
      success: true,
      announcementId: res.announcement_id,
      message: 'Deadline reminder published and dispatched to registered participants.',
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to dispatch deadline reminder.',
    };
  }
}

/**
 * Retrieves in-app notifications and announcements visible to the authenticated user,
 * along with read tracking status from public.announcement_reads.
 */
export async function getInAppNotificationsAction(): Promise<{
  success: boolean;
  notifications: InAppNotification[];
  unreadCount: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, notifications: [], unreadCount: 0, error: 'Unauthorized.' };
    }

    // Determine user role
    const { data: adminProfile } = await supabase
      .from('admin_profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = Boolean(adminProfile);

    // Fetch announcements visible to this user under RLS
    let announcementsQuery = supabase
      .from('announcements')
      .select('id, title, body, target_role, hackathon_id, announcement_type, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    if (isAdmin) {
      announcementsQuery = announcementsQuery.in('target_role', ['all', 'admins']);
    } else {
      announcementsQuery = announcementsQuery.in('target_role', ['all', 'students']);
    }

    const { data: announcements, error: annError } = await announcementsQuery;
    if (annError) {
      return { success: false, notifications: [], unreadCount: 0, error: annError.message };
    }

    // Fetch read receipts for this user
    const { data: reads } = await supabase
      .from('announcement_reads')
      .select('announcement_id, read_at')
      .eq('user_id', user.id);

    const readMap = new Map<string, string>();
    (reads || []).forEach((r) => {
      readMap.set(r.announcement_id, r.read_at);
    });

    const notifications: InAppNotification[] = (announcements || []).map((ann) => {
      const readAt = readMap.get(ann.id) || null;
      return {
        id: ann.id,
        title: ann.title,
        message: ann.body,
        target_role: ann.target_role as 'all' | 'students' | 'admins',
        hackathon_id: ann.hackathon_id,
        announcement_type: ann.announcement_type as 'general' | 'deadline' | 'system' | 'urgent',
        metadata: ann.metadata as Record<string, unknown>,
        created_at: ann.created_at,
        is_read: Boolean(readAt),
        read_at: readAt,
      };
    });

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    return {
      success: true,
      notifications,
      unreadCount,
    };
  } catch (err: unknown) {
    return {
      success: false,
      notifications: [],
      unreadCount: 0,
      error: err instanceof Error ? err.message : 'Failed to retrieve notifications.',
    };
  }
}

/**
 * Marks a specific announcement as read for the authenticated user.
 */
export async function markNotificationReadAction(
  announcementId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.rpc('mark_announcement_read', {
      p_announcement_id: announcementId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to mark notification as read.',
    };
  }
}

/**
 * Retrieves aggregate push delivery statistics for administrators.
 */
export async function getNotificationDeliveryStatsAction(): Promise<{
  success: boolean;
  stats?: DeliveryStats;
  error?: string;
}> {
  try {
    await requireAdmin('manage_notifications');
    const adminClient = createAdminClient();

    const { data: logs, error } = await adminClient
      .from('push_delivery_logs')
      .select('status');

    if (error) {
      return { success: false, error: error.message };
    }

    const stats: DeliveryStats = {
      delivered: 0,
      failed: 0,
      expired: 0,
      pending: 0,
      totalAttempts: logs?.length || 0,
    };

    (logs || []).forEach((log) => {
      if (log.status === 'delivered') stats.delivered++;
      else if (log.status === 'failed') stats.failed++;
      else if (log.status === 'expired') stats.expired++;
      else if (log.status === 'pending') stats.pending++;
    });

    return { success: true, stats };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load delivery statistics.',
    };
  }
}

/**
 * Returns system operational and database health metrics.
 */
export async function getSystemHealthAction(): Promise<{
  success: boolean;
  report?: SystemHealthReport;
  error?: string;
}> {
  try {
    const report = await checkSystemHealth();
    return { success: true, report };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to obtain health metrics.',
    };
  }
}
