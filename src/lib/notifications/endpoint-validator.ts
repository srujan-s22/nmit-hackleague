import dns from 'dns';
import net from 'net';

/**
 * Trusted Web Push Service endpoints according to W3C Web Push and major browser vendors
 */
export const ALLOWED_PUSH_DOMAINS = [
  /^https:\/\/fcm\.googleapis\.com\/.*$/,
  /^https:\/\/updates\.push\.services\.mozilla\.com\/.*$/,
  /^https:\/\/[a-zA-Z0-9.\-]+\.push\.apple\.com\/.*$/,
  /^https:\/\/[a-zA-Z0-9.\-]+\.notify\.windows\.com\/.*$/,
];

/**
 * Checks if a URL matches one of the authorized Web Push domains
 */
export function isAllowedPushDomain(endpointUrl: string): boolean {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    return false;
  }
  return ALLOWED_PUSH_DOMAINS.some((pattern) => pattern.test(endpointUrl));
}

/**
 * Detects whether an IP address belongs to loopback, private, link-local,
 * cloud-metadata, or reserved ranges to prevent SSRF vulnerabilities.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 0) {
    return true; // Not a valid IP -> unsafe
  }

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 10.0.0.0/8 (Private RFC1918)
    if (a === 10) return true;

    // 172.16.0.0/12 (Private RFC1918)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 (Private RFC1918)
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 (Link-local, including Cloud Metadata 169.254.169.254)
    if (a === 169 && b === 254) return true;

    // 100.64.0.0/10 (Carrier-Grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    // 192.0.2.0/24 (TEST-NET-1)
    // 198.51.100.0/24 (TEST-NET-2)
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
    if (a === 203 && b === 0) return true;

    // 224.0.0.0/4 (Multicast)
    // 240.0.0.0/4 (Reserved / Future Use / Broadcast)
    if (a >= 224) return true;

    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();

    // Loopback ::1
    if (normalized === '::1' || normalized === '0000:0000:0000:0000:0000:0000:0000:0001') {
      return true;
    }

    // Unspecified ::
    if (normalized === '::' || normalized === '0000:0000:0000:0000:0000:0000:0000:0000') {
      return true;
    }

    // Link-local: fe80::/10
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
      return true;
    }

    // Unique local address: fc00::/7 (fd00::/8, fc00::/8)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }

    // IPv4-mapped IPv6: ::ffff:127.0.0.1, etc.
    if (normalized.includes('::ffff:')) {
      const ipv4Part = normalized.split('::ffff:')[1];
      if (ipv4Part && net.isIPv4(ipv4Part)) {
        return isPrivateOrReservedIp(ipv4Part);
      }
      return true;
    }

    return false;
  }

  return true;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a web push endpoint URL before registration or dispatch:
 * 1. Checks HTTPS protocol
 * 2. Checks domain allowlist against known push gateways
 * 3. Resolves DNS and checks IP against SSRF blacklists (pre-connect check)
 */
export async function validatePushEndpoint(
  endpointUrl: string,
  options: { resolveDns?: boolean } = { resolveDns: true }
): Promise<ValidationResult> {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    return { valid: false, error: 'Endpoint URL is required.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return { valid: false, error: 'Malformed push endpoint URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Push endpoint must use HTTPS.' };
  }

  if (!isAllowedPushDomain(endpointUrl)) {
    return {
      valid: false,
      error: 'Untrusted push gateway domain. Only standard Web Push services are permitted.',
    };
  }

  // Pre-connect DNS resolution check to prevent SSRF
  if (options.resolveDns) {
    try {
      const lookupResult = await dns.promises.lookup(parsed.hostname, { all: true });
      if (!lookupResult || lookupResult.length === 0) {
        return { valid: false, error: 'Push gateway hostname could not be resolved.' };
      }

      for (const record of lookupResult) {
        if (isPrivateOrReservedIp(record.address)) {
          return {
            valid: false,
            error: `Push gateway resolved to a private or restricted address (${record.address}). Request blocked.`,
          };
        }
      }
    } catch (dnsErr) {
      const message = dnsErr instanceof Error ? dnsErr.message : 'DNS lookup failed';
      return { valid: false, error: `Failed to verify push gateway DNS: ${message}` };
    }
  }

  return { valid: true };
}
