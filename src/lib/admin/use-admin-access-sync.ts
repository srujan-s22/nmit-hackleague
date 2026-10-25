'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getMyAdminNavStateAction } from '@/actions/admin-nav-actions';
import { clearAdminNavCache } from '@/lib/admin/admin-nav-cache';

/** What the page was rendered with (server props). */
export interface RenderedAccess {
  isSuperAdmin: boolean;
  permissionsKey: string; // permissions joined with '|'
  /** null when the page did not supply it (then it is not compared). */
  hasAssignments: boolean | null;
}

export interface FreshAccess {
  isSuperAdmin: boolean;
  permissions: string[];
  hasAssignments: boolean;
}

/**
 * True when the server's current view of the admin's access differs from what the
 * page was rendered with, i.e. the page is stale and must be re-rendered.
 */
export function accessDiffers(rendered: RenderedAccess, fresh: FreshAccess): boolean {
  if (rendered.isSuperAdmin !== fresh.isSuperAdmin) return true;
  // Order-insensitive: the database returns permission rows in no fixed order.
  const renderedPerms = rendered.permissionsKey.split('|').filter(Boolean).sort().join('|');
  if (renderedPerms !== [...fresh.permissions].sort().join('|')) return true;
  if (rendered.hasAssignments !== null && rendered.hasAssignments !== fresh.hasAssignments) return true;
  return false;
}

const DEBOUNCE_MS = 400;
/** A refresh already triggered recently is not repeated (loop guard). */
const REFRESH_COOLDOWN_MS = 15_000;
const POLL_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Keeps an admin's open pages in step with their access.
 *
 *  1. Push: subscribes to the admin's PRIVATE Realtime topic `admin-access:<id>`.
 *     A database trigger publishes a payload-free "access_changed" event whenever
 *     their permissions, assignments or active/super status change. Only that admin
 *     is authorized to receive it (RLS on realtime.messages).
 *  2. Fallback: if Realtime is unavailable, a visibility/focus check and a slow poll
 *     compare the server's fresh state with what the page rendered.
 *
 * On a change the client cache is dropped and router.refresh() re-renders the layout
 * and page on the server, so the sidebar updates AND page-level authorization re-runs
 * (an admin who lost access to the open page is redirected by the server, not by this
 * hook). The event content is never trusted: it is only a "re-check" signal.
 */
export function useAdminAccessSync(adminId: string | undefined, rendered: RenderedAccess): void {
  const router = useRouter();
  const renderedRef = useRef(rendered);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    renderedRef.current = rendered;
  });

  useEffect(() => {
    if (!adminId) return;
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const refreshNow = () => {
      if (Date.now() - lastRefreshRef.current < REFRESH_COOLDOWN_MS) return;
      lastRefreshRef.current = Date.now();
      clearAdminNavCache();
      router.refresh();
    };

    const checkAgainstServer = async () => {
      try {
        const res = await getMyAdminNavStateAction();
        if (cancelled) return;
        if (!res.success || !res.state) {
          // Deactivated or no longer an admin: let the server decide (it redirects).
          refreshNow();
          return;
        }
        if (res.state.adminId === adminId && accessDiffers(renderedRef.current, res.state)) refreshNow();
      } catch {
        // network error: try again at the next trigger
      }
    };

    // 1. Push channel
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      try {
        await supabase.realtime.setAuth();
        if (cancelled) return;
        channel = supabase
          .channel(`admin-access:${adminId}`, { config: { private: true } })
          .on('broadcast', { event: 'access_changed' }, () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
              // Bypass the cooldown for an explicit push: access really changed.
              lastRefreshRef.current = 0;
              refreshNow();
            }, DEBOUNCE_MS);
          })
          .subscribe();
      } catch {
        // Realtime unavailable: the fallback below still covers it.
      }
    })();

    // 2. Fallback
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkAgainstServer();
    };
    document.addEventListener('visibilitychange', onVisible);
    const poll = setInterval(onVisible, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [adminId, router]);
}
