'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/guards';
import { sendWebPushNotification, type PushPayload } from '@/lib/notifications/push-service';
import { revalidatePath } from 'next/cache';

export interface InAppNotification {
  id: string;
  title: string;
  message: string;
  target_role: 'all' | 'students' | 'admins';
  created_at: string;
  is_read: boolean;
  read_at: string | null;
}

/**
 * Publishes an announcement across the platform and triggers Web Push broadcast
 * to all active subscribers in the targeted audience.
 * Enforces 'manage_notifications' administrative permission or Super Admin authority.
 */
export async function publishAnnouncementAction(
  title: string,
  message: string,
  targetRole: 'all' | 'students' | 'admins' = 'all'
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
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
    });

    if (rpcError) {
      return {
        success: false,
        error: `Failed to publish announcement: ${rpcError.message}`,
      };
    }

    // Dispatch Web Push notifications to active subscribers
    try {
      const adminClient = createAdminClient();
      let query = adminClient
        .from('user_push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_id')
        .eq('active', true);

      if (targetRole === 'students') {
        const { data: studentUsers } = await adminClient.from('profiles').select('id');
        const studentIds = (studentUsers || []).map((u) => u.id);
        if (studentIds.length > 0) {
          query = query.in('user_id', studentIds);
        }
      } else if (targetRole === 'admins') {
        const { data: adminUsers } = await adminClient.from('admin_profiles').select('id');
        const adminIds = (adminUsers || []).map((u) => u.id);
        if (adminIds.length > 0) {
          query = query.in('user_id', adminIds);
        }
      }

      const { data: subscriptions } = await query;

      if (subscriptions && subscriptions.length > 0) {
        const pushPayload: PushPayload = {
          title: `NMIT HackLeague: ${title.trim()}`,
          body: message.trim().slice(0, 180),
          url: '/student/hackathons',
          tag: 'hackleague-announcement',
        };

        // Asynchronously dispatch push to subscribers without blocking response
        Promise.allSettled(
          subscriptions.map((sub) => sendWebPushNotification(sub, pushPayload))
        ).catch(() => {});
      }
    } catch {
      // Non-blocking: Announcement remains published in DB even if push gateway fails
    }

    revalidatePath('/admin/notifications');
    revalidatePath('/student/hackathons');

    return {
      success: true,
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

    // Fetch announcements visible to this user
    let announcementsQuery = supabase
      .from('announcements')
      .select('id, title, body, target_role, created_at')
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
