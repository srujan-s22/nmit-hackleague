'use server';

import { createClient } from '@/lib/supabase/server';

export interface HeaderProfile {
  full_name: string;
  usn: string | null;
  /** Short-lived signed URL for the profile photo, or null when none/unavailable. */
  avatarUrl: string | null;
}

const AVATAR_URL_TTL_SECONDS = 900;

/**
 * Identity + profile-photo URL for the signed-in student's top-right header
 * capsule, usable from every page. Returns { success: false } (no error) for
 * callers without a student profile (e.g. admins) so the header just keeps its
 * initials fallback.
 *
 * The signed URL is created directly rather than through
 * getSignedPreviewUrlWithClient: that helper downloads the whole image to
 * re-validate its binary signature on each call, which is wasteful for a header
 * that renders on every page. The photo was already binary-validated at upload
 * and again at admin approval, and the URL is private, short-lived (15 min) and
 * only issuable to the owner by the bucket's RLS.
 */
export async function getMyHeaderProfileAction(): Promise<{
  success: boolean;
  profile?: HeaderProfile;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, usn, profile_photo_path')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) return { success: false };

    let avatarUrl: string | null = null;
    if (profile.profile_photo_path) {
      const { data } = await supabase.storage
        .from('profile-photos')
        .createSignedUrl(profile.profile_photo_path, AVATAR_URL_TTL_SECONDS);
      avatarUrl = data?.signedUrl ?? null;
    }

    return {
      success: true,
      profile: { full_name: profile.full_name, usn: profile.usn ?? null, avatarUrl },
    };
  } catch {
    return { success: false };
  }
}
