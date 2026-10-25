// Client-side store for the signed-in admin's navigation state (role, permission
// names, whether they have hackathon assignments), so the sidebar renders
// instantly on every page instead of re-fetching.
//
// DISPLAY ONLY. Nothing here is an authorization decision: every page, server
// action, export endpoint and database function re-checks the caller's real
// permissions on the server. A stale or tampered entry can at worst draw a menu
// link that the server then refuses. Server code never reads this store.
//
// Like the student header cache it is per-tab (sessionStorage), expires, is
// bound to the admin id, and is cleared on sign-out (see client-session-cache.ts).
//
// It touches module state and sessionStorage, so use it only in the browser
// (effects / event handlers / useSyncExternalStore with a null server snapshot).

export interface AdminNavState {
  adminId: string;
  isSuperAdmin: boolean;
  permissions: string[];
  /** null = unknown yet (not fetched) */
  hasAssignments: boolean | null;
  refreshedAt: number;
}

const STORAGE_KEY = 'hl.adminNav.v1';
const TTL_MS = 12 * 60 * 60 * 1000;
/** Entries older than this are refreshed from the server in the background. */
export const ADMIN_NAV_REFRESH_AFTER_MS = 10 * 60 * 1000;

let entry: AdminNavState | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function isValid(value: unknown): value is AdminNavState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AdminNavState>;
  return (
    typeof v.adminId === 'string' &&
    typeof v.isSuperAdmin === 'boolean' &&
    Array.isArray(v.permissions) &&
    v.permissions.every((p) => typeof p === 'string') &&
    (v.hasAssignments === null || typeof v.hasAssignments === 'boolean') &&
    typeof v.refreshedAt === 'number' &&
    Date.now() - v.refreshedAt < TTL_MS
  );
}

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (isValid(parsed)) entry = parsed;
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable or corrupt: behave as empty
  }
}

/** Stable reference between writes, as useSyncExternalStore requires. */
export function readAdminNavCache(): AdminNavState | null {
  load();
  if (entry && Date.now() - entry.refreshedAt >= TTL_MS) entry = null;
  return entry;
}

export function writeAdminNavCache(value: AdminNavState): void {
  entry = value;
  loaded = true;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // quota/unavailable: in-memory entry still serves this tab session
  }
  notify();
}

export function clearAdminNavCache(): void {
  entry = null;
  loaded = true;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}

export function subscribeAdminNavCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
