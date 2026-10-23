/**
 * Push capability detection and environment analysis for NMIT HackLeague.
 * Evaluates Web Push API availability, secure context invariants, and platform-specific
 * installation requirements without relying solely on viewport dimensions or user-agent regex.
 */

export type PushCapabilityStatus =
  | 'SUPPORTED'                 // Full Web Push API available in a secure context
  | 'INSECURE_CONTEXT'          // Accessing over unencrypted LAN/HTTP (e.g. http://192.168.x.x:3000)
  | 'IOS_STANDALONE_REQUIRED'   // iOS/iPadOS Safari tab: requires Add to Home Screen to access PushManager
  | 'UNSUPPORTED_MOBILE'        // Mobile/tablet environment genuinely lacking Web Push (in-app webview, iOS <16.4)
  | 'UNSUPPORTED_DESKTOP';      // Desktop browser genuinely lacking ServiceWorker or PushManager

export interface PushCapabilityDetails {
  status: PushCapabilityStatus;
  isSecureContext: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIos: boolean;
  isStandalone: boolean;
  isMobileOrTablet: boolean;
  permission: NotificationPermission | 'unsupported';
  description: string;
}

/**
 * Converts a base64 or base64url encoded VAPID public key string into a Uint8Array.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof window !== 'undefined'
    ? window.atob(base64)
    : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Checks whether an existing PushSubscription's applicationServerKey matches the expected VAPID public key.
 */
export function isSameApplicationServerKey(
  existingKeyBuffer: ArrayBuffer | null | undefined,
  expectedKeyB64Url: string
): boolean {
  if (!existingKeyBuffer || !expectedKeyB64Url) return false;
  try {
    const existingBytes = new Uint8Array(existingKeyBuffer);
    const padding = '='.repeat((4 - (expectedKeyB64Url.length % 4)) % 4);
    const base64 = (expectedKeyB64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const expectedRaw = typeof window !== 'undefined'
      ? window.atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');

    if (existingBytes.length !== expectedRaw.length) return false;
    for (let i = 0; i < existingBytes.length; i++) {
      if (existingBytes[i] !== expectedRaw.charCodeAt(i)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Performs client-side feature and context detection.
 * Can accept injected mock environment objects for deterministic automated testing.
 */
export function detectPushCapabilities(env?: {
  window?: Partial<Window> & {
    isSecureContext?: boolean;
    matchMedia?: (q: string) => { matches: boolean };
    Notification?: { permission: NotificationPermission };
    PushManager?: unknown;
  };
  navigator?: Partial<Navigator> & {
    maxTouchPoints?: number;
    standalone?: boolean;
    serviceWorker?: unknown;
    platform?: string;
  };
  location?: Partial<Location>;
}): PushCapabilityDetails {
  const win = env?.window ?? (typeof window !== 'undefined' ? window : undefined);
  const nav = env?.navigator ?? (typeof navigator !== 'undefined' ? navigator : undefined);

  const isSecureContext = Boolean(win?.isSecureContext);
  const hasServiceWorker = Boolean(nav && 'serviceWorker' in nav && nav.serviceWorker !== undefined);
  const hasPushManager = Boolean(win && 'PushManager' in win && win.PushManager !== undefined);
  const hasNotification = Boolean(win && 'Notification' in win && win.Notification !== undefined);

  // Platform heuristics: determine iOS and mobile/tablet form-factors for setup guidance
  const ua = nav?.userAgent || '';
  const maxTouchPoints = nav?.maxTouchPoints ?? 0;

  // iOS detection: iPhone, iPod, or iPad (including iPadOS MacIntel touch devices)
  const isIos = /iPad|iPhone|iPod/i.test(ua) || (Boolean(nav?.platform === 'MacIntel') && maxTouchPoints > 1);

  // Standalone PWA detection (iOS navigator.standalone or display-mode: standalone media query)
  let isStandalone = false;
  if (nav && 'standalone' in nav && Boolean((nav as unknown as { standalone?: boolean }).standalone)) {
    isStandalone = true;
  } else if (win?.matchMedia) {
    try {
      isStandalone = win.matchMedia('(display-mode: standalone)').matches;
    } catch {
      isStandalone = false;
    }
  }

  // Mobile / Tablet classification based on touch capabilities and user agent markers
  const isMobileOrTablet =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua) ||
    (maxTouchPoints > 0 && win?.matchMedia ? !win.matchMedia('(pointer: fine)').matches : false);

  let permission: NotificationPermission | 'unsupported' = 'unsupported';
  if (hasNotification && win?.Notification) {
    permission = win.Notification.permission;
  }

  // 1. Insecure Context Check (W3C Secure Contexts Level 1 invariant)
  // Browsers unconditionally disable Service Workers and PushManager over unencrypted HTTP (except localhost)
  if (!isSecureContext) {
    return {
      status: 'INSECURE_CONTEXT',
      isSecureContext,
      hasServiceWorker,
      hasPushManager,
      hasNotification,
      isIos,
      isStandalone,
      isMobileOrTablet,
      permission,
      description:
        'LAN HTTP origin (not a secure context). Service Workers and Web Push require HTTPS or localhost.',
    };
  }

  // 2. Full Web Push Availability
  if (hasServiceWorker && hasPushManager && hasNotification) {
    return {
      status: 'SUPPORTED',
      isSecureContext,
      hasServiceWorker,
      hasPushManager,
      hasNotification,
      isIos,
      isStandalone,
      isMobileOrTablet,
      permission,
      description: 'Web Push is fully supported by this browser.',
    };
  }

  // 3. iOS/iPadOS Safari tab detection (Apple WebKit requires Home Screen PWA installation)
  if (isIos && !isStandalone) {
    return {
      status: 'IOS_STANDALONE_REQUIRED',
      isSecureContext,
      hasServiceWorker,
      hasPushManager,
      hasNotification,
      isIos,
      isStandalone,
      isMobileOrTablet,
      permission,
      description:
        'iOS Safari requires adding NMIT HackLeague to the Home Screen to enable Web Push notifications.',
    };
  }

  // 4. Mobile/Tablet environments where Web Push is missing (in-app webview or unsupported browser)
  if (isMobileOrTablet) {
    return {
      status: 'UNSUPPORTED_MOBILE',
      isSecureContext,
      hasServiceWorker,
      hasPushManager,
      hasNotification,
      isIos,
      isStandalone,
      isMobileOrTablet,
      permission,
      description: 'Web Push is not available in this mobile browser. In-app notifications remain active.',
    };
  }

  // 5. Desktop environment lacking Web Push
  return {
    status: 'UNSUPPORTED_DESKTOP',
    isSecureContext,
    hasServiceWorker,
    hasPushManager,
    hasNotification,
    isIos,
    isStandalone,
    isMobileOrTablet,
    permission,
    description: 'This desktop browser does not support Service Workers or the Web Push API.',
  };
}
