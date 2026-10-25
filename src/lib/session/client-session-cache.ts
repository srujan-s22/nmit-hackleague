import { clearAdminNavCache } from '@/lib/admin/admin-nav-cache';
import { clearHeaderProfileCache } from '@/lib/student/header-profile-cache';

/**
 * Removes every per-user value this app keeps in the browser (student header
 * profile + photo, admin navigation state). Call it on every sign-out path and
 * whenever the login page is shown, so a signed-out tab never retains the
 * previous user's data. Browser-only.
 */
export function clearClientSessionCache(): void {
  clearHeaderProfileCache();
  clearAdminNavCache();
}
