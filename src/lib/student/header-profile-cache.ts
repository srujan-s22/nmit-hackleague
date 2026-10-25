import type { HeaderProfile } from '@/actions/header-profile-actions';

// Client-side store for the header profile (name, USN, avatar) so the top-right
// photo is fetched once per browser tab session and reused on every page,
// including after full page reloads.
//
// The avatar is stored as a small data URL (downscaled JPEG), not the signed
// storage URL: signed URLs are different on every request and expire, so a
// cached signed URL would still re-download the image and eventually break.
// A data URL needs no network at all.
//
// SECURITY NOTE: this touches module state and sessionStorage, so it MUST only
// be used from the browser (effects / event handlers / useSyncExternalStore
// with a null server snapshot), never during server rendering — module state
// on the server is shared across requests and would leak one user's profile
// into another's HTML. It is cleared on sign-out and dropped when the cached
// USN no longer matches the signed-in student.
const STORAGE_KEY = 'hl.headerProfile.v1';
const TTL_MS = 12 * 60 * 60 * 1000;
const AVATAR_SIZE_PX = 128;

let entry: { value: HeaderProfile; expires: number } | null = null;
let loadedFromStorage = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function loadFromStorage() {
  if (loadedFromStorage || typeof window === 'undefined') return;
  loadedFromStorage = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { value?: HeaderProfile; expires?: number };
    if (parsed?.value && typeof parsed.expires === 'number' && parsed.expires > Date.now()) {
      entry = { value: parsed.value, expires: parsed.expires };
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage unavailable or corrupt: behave as an empty cache
  }
}

/** Stable reference between writes, as useSyncExternalStore requires. */
export function readHeaderProfileCache(): HeaderProfile | null {
  loadFromStorage();
  if (entry && entry.expires <= Date.now()) {
    entry = null;
  }
  return entry ? entry.value : null;
}

export function writeHeaderProfileCache(value: HeaderProfile): void {
  entry = { value, expires: Date.now() + TTL_MS };
  loadedFromStorage = true;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // quota/unavailable: the in-memory entry still serves this page session
  }
  notify();
}

export function clearHeaderProfileCache(): void {
  entry = null;
  loadedFromStorage = true;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}

export function subscribeHeaderProfileCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Downloads the image once and returns a small square JPEG data URL. Returns
 * null on any failure (CORS, decode, missing file) so callers can degrade to
 * initials.
 */
export async function avatarUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX
    );
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  }
}
