/**
 * Authoritative VAPID Configuration & Production Credential Verifier
 * 
 * Enforces RFC 8292 Web Push VAPID key verification:
 * 1. Production environments (NODE_ENV === 'production') MUST have valid, non-mock
 *    VAPID public and private keys configured.
 * 2. Mock, placeholder, or synthetic credentials are strictly prohibited from being
 *    treated as production credentials or reported as successful real delivery.
 * 3. Public key must be a valid base64url-encoded 65-byte uncompressed P-256 point (0x04 prefix).
 * 4. Private key must be a valid base64url-encoded 32-byte scalar.
 */

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface VapidValidationResult {
  valid: boolean;
  config?: VapidConfig;
  error?: string;
  isMock: boolean;
}

const MOCK_CREDENTIAL_PATTERNS = [
  /mock/i,
  /placeholder/i,
  /fake/i,
  /dummy/i,
  /synthetic/i,
  /test-token/i,
];

/**
 * Validates the VAPID configuration in the active runtime environment.
 */
export function validateVapidConfiguration(env: NodeJS.ProcessEnv = process.env): VapidValidationResult {
  const isProduction = env.NODE_ENV === 'production';
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY || '';
  const privateKey = env.VAPID_PRIVATE_KEY || '';
  const subject = env.VAPID_SUBJECT || 'mailto:security@nmit.ac.in';

  const isMock =
    !publicKey ||
    !privateKey ||
    MOCK_CREDENTIAL_PATTERNS.some((p) => p.test(publicKey) || p.test(privateKey));

  if (isProduction) {
    if (!publicKey || !privateKey) {
      return {
        valid: false,
        isMock: false,
        error: 'Production Web Push requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to be configured in environment.',
      };
    }

    if (isMock) {
      return {
        valid: false,
        isMock: true,
        error: 'Production Web Push cannot use development mocks or placeholder VAPID credentials.',
      };
    }

    // Validate VAPID public key format (65 bytes uncompressed P-256 EC point starting with 0x04)
    try {
      const pubBuf = Buffer.from(publicKey, 'base64url');
      if (pubBuf.length !== 65 || pubBuf[0] !== 0x04) {
        return {
          valid: false,
          isMock: false,
          error: 'Invalid VAPID public key: must be a 65-byte base64url uncompressed P-256 point starting with 0x04.',
        };
      }
    } catch {
      return {
        valid: false,
        isMock: false,
        error: 'Malformed VAPID public key encoding.',
      };
    }

    // Validate VAPID private key format (32 bytes P-256 scalar)
    try {
      const privBuf = Buffer.from(privateKey, 'base64url');
      if (privBuf.length !== 32) {
        return {
          valid: false,
          isMock: false,
          error: 'Invalid VAPID private key: must be a 32-byte base64url P-256 scalar.',
        };
      }
    } catch {
      return {
        valid: false,
        isMock: false,
        error: 'Malformed VAPID private key encoding.',
      };
    }

    // Validate subject format per RFC 8292
    if (!subject.startsWith('mailto:') && !subject.startsWith('https://')) {
      return {
        valid: false,
        isMock: false,
        error: 'Invalid VAPID subject: must be a mailto: or https: URI per RFC 8292.',
      };
    }
  }

  return {
    valid: isProduction ? true : !isMock,
    isMock,
    config: {
      publicKey,
      privateKey,
      subject,
    },
  };
}

/**
 * Checks whether a given push subscription or device fingerprint is a local development mock.
 */
export function isMockSubscription(subscription: {
  endpoint?: string;
  deviceFingerprint?: string;
  p256dh?: string;
  auth?: string;
}): boolean {
  if (!subscription) return true;
  const fp = subscription.deviceFingerprint || '';
  const ep = subscription.endpoint || '';
  const p256 = subscription.p256dh || '';
  const a = subscription.auth || '';
  return (
    fp.startsWith('mock-') ||
    fp.startsWith('dev-mock-') ||
    fp.startsWith('test-') ||
    ep.includes('/mock/') ||
    ep.includes('synthetic') ||
    MOCK_CREDENTIAL_PATTERNS.some((p) => p.test(fp) || p.test(ep) || p.test(p256) || p.test(a))
  );
}
