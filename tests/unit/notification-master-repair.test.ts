import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

const {
  encryptWebPushPayload,
  createVapidAuthHeader,
} = require('../../src/lib/notifications/push-service');
const { validatePushEndpoint } = require('../../src/lib/notifications/endpoint-validator');
const { validateVapidConfiguration } = require('../../src/lib/notifications/vapid-config');
const { formatNotificationTimestamp } = require('../../src/lib/notifications/format-timestamp');
import type { PushPayload } from '../../src/lib/notifications/push-service';

describe('Notification System Master Repair Unit & Integration Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Web Push RFC 8291 Encryption Verification
  // --------------------------------------------------------------------------
  it('TS-WPU-01: encryptWebPushPayload produces valid RFC 8291 ciphertext and 86-byte header', () => {
    // Generate simulated subscriber keypair
    const clientEcdh = crypto.createECDH('prime256v1');
    clientEcdh.generateKeys();
    const clientP256dh = clientEcdh.getPublicKey('base64url');
    const clientAuth = crypto.randomBytes(16).toString('base64url');

    const payload: PushPayload = {
      title: 'Round 1 Statements Released',
      body: 'Problem statements are now available on the portal.',
      url: '/student/hackathons',
      tag: 'hackleague-general',
    };

    const encrypted = encryptWebPushPayload(payload, clientP256dh, clientAuth);

    // RFC 8291 Section 4 Header:
    // salt (16 bytes) + rs (4 bytes) + idlen (1 byte = 65) + keyid (65 bytes) = 86 bytes
    assert.strictEqual(encrypted.length >= 86 + 16, true, 'Encrypted body must contain header + ciphertext + tag');
    
    const rs = encrypted.readUInt32BE(16);
    assert.strictEqual(rs, 4096, 'Record size in header must be 4096');

    const idlen = encrypted.readUInt8(20);
    assert.strictEqual(idlen, 65, 'Key ID length must be 65 for uncompressed P-256 public key');

    const serverKeyPrefix = encrypted.readUInt8(21);
    assert.strictEqual(serverKeyPrefix, 0x04, 'Ephemeral server public key in header must start with 0x04');
  });

  it('TS-WPU-02: encryptWebPushPayload rejects invalid public key or short auth secret', () => {
    const invalidPub = Buffer.alloc(32).toString('base64url');
    const validAuth = crypto.randomBytes(16).toString('base64url');

    assert.throws(() => {
      encryptWebPushPayload({ title: 'Test', body: 'Body' }, invalidPub, validAuth);
    }, /must be 65-byte uncompressed P-256 point/);

    const clientEcdh = crypto.createECDH('prime256v1');
    clientEcdh.generateKeys();
    const clientPub = clientEcdh.getPublicKey('base64url');
    const shortAuth = crypto.randomBytes(8).toString('base64url');

    assert.throws(() => {
      encryptWebPushPayload({ title: 'Test', body: 'Body' }, clientPub, shortAuth);
    }, /must be at least 16 bytes/);
  });

  // --------------------------------------------------------------------------
  // 2. Web Push RFC 8292 VAPID Authorization Token Verification
  // --------------------------------------------------------------------------
  it('TS-WPU-03: createVapidAuthHeader generates RFC 8292 compliant JWT signature and header format', () => {
    // Generate valid VAPID keypair
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const vapidPub = ecdh.getPublicKey('base64url');
    const vapidPriv = ecdh.getPrivateKey('base64url');

    const config = {
      publicKey: vapidPub,
      privateKey: vapidPriv,
      subject: 'mailto:security@nmit.ac.in',
    };

    const endpoint = 'https://fcm.googleapis.com/fcm/send/sample-token-123';
    const authHeader = createVapidAuthHeader(endpoint, config);

    assert.strictEqual(authHeader.startsWith('vapid t='), true, 'Header must start with vapid t=');
    assert.strictEqual(authHeader.includes(', k='), true, 'Header must contain public key parameter , k=');

    const match = authHeader.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.notStrictEqual(match, null, 'Header must match vapid t=<jwt>, k=<key>');

    const jwt = match![1];
    const pubKeyParam = match![2];

    assert.strictEqual(pubKeyParam, vapidPub, 'Public key in header must match config public key');

    // Verify JWT structure: header.payload.signature
    const parts = jwt.split('.');
    assert.strictEqual(parts.length, 3, 'JWT must have 3 parts');

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    assert.strictEqual(header.alg, 'ES256', 'JWT alg must be ES256');
    assert.strictEqual(header.typ, 'JWT', 'JWT typ must be JWT');

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    assert.strictEqual(payload.aud, 'https://fcm.googleapis.com', 'JWT aud must match endpoint origin');
    assert.strictEqual(payload.sub, 'mailto:security@nmit.ac.in', 'JWT sub must match config subject');
    assert.strictEqual(typeof payload.exp, 'number', 'JWT exp must be numeric timestamp');
  });

  // --------------------------------------------------------------------------
  // 3. SSRF & Push Endpoint Security
  // --------------------------------------------------------------------------
  it('TS-WPU-04: validatePushEndpoint enforces HTTPS, standard port, and allowed push domains', async () => {
    // Plain HTTP
    const httpRes = await validatePushEndpoint('http://fcm.googleapis.com/fcm/send/123');
    assert.strictEqual(httpRes.valid, false, 'Plain HTTP must be rejected');

    // Non-standard port
    const portRes = await validatePushEndpoint('https://fcm.googleapis.com:8443/fcm/send/123');
    assert.strictEqual(portRes.valid, false, 'Non-standard port must be rejected');

    // Embedded credentials
    const credRes = await validatePushEndpoint('https://admin:pass@fcm.googleapis.com/fcm/send/123');
    assert.strictEqual(credRes.valid, false, 'User credentials must be rejected');

    // Untrusted external domain
    const badDomainRes = await validatePushEndpoint('https://evil-push-gateway.example.com/send');
    assert.strictEqual(badDomainRes.valid, false, 'Untrusted gateway domain must be rejected');

    // Trusted FCM domain
    const goodFcm = await validatePushEndpoint('https://fcm.googleapis.com/fcm/send/valid-endpoint', { resolveDns: false });
    assert.strictEqual(goodFcm.valid, true, 'Trusted FCM domain must be approved');

    // Trusted Mozilla domain
    const goodMozilla = await validatePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc', { resolveDns: false });
    assert.strictEqual(goodMozilla.valid, true, 'Trusted Mozilla domain must be approved');
  });

  // --------------------------------------------------------------------------
  // 4. VAPID Configuration Validation
  // --------------------------------------------------------------------------
  it('TS-WPU-05: validateVapidConfiguration enforces valid RFC 8292 key formats in production', () => {
    // Missing keys
    const missing = validateVapidConfiguration({ NODE_ENV: 'production' });
    assert.strictEqual(missing.valid, false, 'Missing keys must be invalid in production');

    // Mock keys
    const mock = validateVapidConfiguration({
      NODE_ENV: 'production',
      VAPID_PUBLIC_KEY: 'mock-key-token',
      VAPID_PRIVATE_KEY: 'mock-priv-token',
    });
    assert.strictEqual(mock.valid, false, 'Mock keys must be rejected in production');

    // Valid keys
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const validPub = ecdh.getPublicKey('base64url');
    const validPriv = ecdh.getPrivateKey('base64url');

    const valid = validateVapidConfiguration({
      NODE_ENV: 'production',
      VAPID_PUBLIC_KEY: validPub,
      VAPID_PRIVATE_KEY: validPriv,
      VAPID_SUBJECT: 'mailto:security@nmit.ac.in',
    });
    assert.strictEqual(valid.valid, true, 'Valid keys must pass production validation');
  });

  // --------------------------------------------------------------------------
  // 5. Deterministic Timestamp Formatting (Hydration Protection)
  // --------------------------------------------------------------------------
  it('TS-HYD-01: formatNotificationTimestamp produces deterministic Asia/Kolkata timestamps with year', () => {
    // 2026-10-23T14:05:00Z + 05:30 = 2026-10-23 19:35 (7:35 PM)
    const formatted = formatNotificationTimestamp('2026-10-23T14:05:00Z');
    assert.strictEqual(formatted, '23 Oct 2026, 07:35 PM');
  });

  it('TS-HYD-02: formatNotificationTimestamp formats without year when requested', () => {
    const formatted = formatNotificationTimestamp('2026-10-23T14:05:00Z', { includeYear: false });
    assert.strictEqual(formatted, '23 Oct, 07:35 PM');
  });

  it('TS-HYD-03: formatNotificationTimestamp safely handles invalid, null, or undefined dates without throwing', () => {
    assert.strictEqual(formatNotificationTimestamp(null), '—');
    assert.strictEqual(formatNotificationTimestamp(undefined), '—');
    assert.strictEqual(formatNotificationTimestamp(''), '—');
    assert.strictEqual(formatNotificationTimestamp('not-a-valid-date'), '—');
  });

  it('TS-HYD-04: formatNotificationTimestamp correctly handles midnight and AM/PM transitions in IST', () => {
    // 2026-10-23T00:00:00Z + 05:30 = 2026-10-23 05:30 AM
    assert.strictEqual(formatNotificationTimestamp('2026-10-23T00:00:00Z'), '23 Oct 2026, 05:30 AM');
    // 2026-10-23T06:30:00Z + 05:30 = 2026-10-23 12:00 PM (Noon)
    assert.strictEqual(formatNotificationTimestamp('2026-10-23T06:30:00Z'), '23 Oct 2026, 12:00 PM');
    // 2026-10-22T18:30:00Z + 05:30 = 2026-10-23 12:00 AM (Midnight)
    assert.strictEqual(formatNotificationTimestamp('2026-10-22T18:30:00Z'), '23 Oct 2026, 12:00 AM');
  });
});

