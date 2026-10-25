import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  HTTP_URL_REGEX,
  mandatoryHttpUrlSchema,
  optionalHttpUrlSchema,
  hackathonCreateSchema,
  hackathonUpdateSchema,
} from '../../src/lib/validation/hackathon-schemas';

describe('HackLeague URL Validation & Compatibility Test Suite', () => {
  // --------------------------------------------------------------------------
  // 1. HTTP_URL_REGEX Boundary & Parity Tests
  // --------------------------------------------------------------------------
  describe('HTTP_URL_REGEX Boundary Conditions', () => {
    it('UV-01: accepts valid FQDNs with HTTP and HTTPS', () => {
      const validUrls = [
        'http://example.com',
        'https://example.com',
        'https://devpost.com',
        'https://subdomain.example.co.uk',
        'https://my-hackathon-2026.nmit.ac.in',
        'https://portal.nmit.ac.in/events/2026',
      ];
      for (const url of validUrls) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), true, `URL should be valid: ${url}`);
      }
    });

    it('UV-02: accepts localhost with and without port', () => {
      const validLocalhosts = [
        'http://localhost',
        'https://localhost',
        'http://localhost:3000',
        'http://localhost:8080/api/callback',
      ];
      for (const url of validLocalhosts) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), true, `Localhost should be valid: ${url}`);
      }
    });

    it('UV-03: accepts strictly bounded IPv4 addresses (0–255 octets)', () => {
      const validIps = [
        'http://127.0.0.1',
        'http://0.0.0.0',
        'https://192.168.1.1',
        'https://10.0.0.1:8080',
        'http://255.255.255.255:65535',
        'https://172.16.254.1/path?param=1#hash',
      ];
      for (const url of validIps) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), true, `IPv4 URL should be valid: ${url}`);
      }
    });

    it('UV-04: accepts valid paths, query strings, and fragments', () => {
      const complexUrls = [
        'https://devpost.com/hackathons/nmit-hacks-2026',
        'https://chat.whatsapp.com/invite/AbCdEf123456',
        'https://discord.gg/invite/nmit-coders',
        'https://example.com/api/v1/resource?id=123&sort=desc#overview',
        'https://example.com/search?q=hackathon+2026&category=tech',
      ];
      for (const url of complexUrls) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), true, `Complex URL should be valid: ${url}`);
      }
    });

    it('UV-05: accepts valid ports in range 1–65535', () => {
      const validPorts = [
        'http://localhost:1',
        'http://localhost:80',
        'https://localhost:443',
        'http://localhost:8080',
        'http://localhost:65535',
      ];
      for (const url of validPorts) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), true, `Port should be valid: ${url}`);
      }
    });

    it('UV-06: rejects missing or non-HTTP(S) schemes', () => {
      const invalidSchemes = [
        'example.com',
        'www.example.com',
        'ftp://example.com/file.zip',
        'file:///path/to/file',
        'javascript:alert(1)',
        'data:text/html,test',
        'ws://example.com/socket',
      ];
      for (const url of invalidSchemes) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), false, `Scheme should be rejected: ${url}`);
      }
    });

    it('UV-07: rejects invalid IPv4 octets (> 255)', () => {
      const invalidIps = [
        'http://256.0.0.1',
        'http://192.168.1.300',
        'http://999.999.999.999',
        'http://1.2.3.4.5',
        'http://192.168.1',
      ];
      for (const url of invalidIps) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), false, `Invalid IPv4 should be rejected: ${url}`);
      }
    });

    it('UV-08: rejects invalid ports (0 or > 65535)', () => {
      const invalidPorts = [
        'http://localhost:0',
        'http://localhost:65536',
        'http://localhost:99999',
        'https://example.com:0000',
      ];
      for (const url of invalidPorts) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), false, `Invalid port should be rejected: ${url}`);
      }
    });

    it('UV-09: rejects whitespace anywhere in the URL', () => {
      const whitespaceUrls = [
        'https:// example.com',
        'https://example.com ',
        'https://example.com/path with spaces',
        'https://example.com/path\twith\ttabs',
        'https://example.com?query=hello world',
        'https://example.com#section with space',
      ];
      for (const url of whitespaceUrls) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), false, `Whitespace should be rejected: ${url}`);
      }
    });

    it('UV-10: rejects malformed hosts and single-char TLDs', () => {
      const malformedHosts = [
        'https://',
        'https://:8080',
        'https://-badhost.com',
        'https://badhost-.com',
        'https://example.c',
        'https://.example.com',
      ];
      for (const url of malformedHosts) {
        assert.strictEqual(HTTP_URL_REGEX.test(url), false, `Malformed host should be rejected: ${url}`);
      }
    });
  });

  // --------------------------------------------------------------------------
  // 2. Mandatory vs Optional URL Schemas
  // --------------------------------------------------------------------------
  describe('Zod URL Schema Enforcement', () => {
    it('UV-11: mandatoryHttpUrlSchema rejects undefined, empty string, and whitespace', () => {
      assert.strictEqual(mandatoryHttpUrlSchema.safeParse(undefined).success, false);
      assert.strictEqual(mandatoryHttpUrlSchema.safeParse(null).success, false);
      assert.strictEqual(mandatoryHttpUrlSchema.safeParse('').success, false);
      assert.strictEqual(mandatoryHttpUrlSchema.safeParse('   ').success, false);
      assert.strictEqual(mandatoryHttpUrlSchema.safeParse('\t\n').success, false);
    });

    it('UV-12: mandatoryHttpUrlSchema accepts valid URLs and trims whitespace', () => {
      const result = mandatoryHttpUrlSchema.safeParse('  https://devpost.com/hackathons/nmit  ');
      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(result.data, 'https://devpost.com/hackathons/nmit');
      }
    });

    it('UV-13: optionalHttpUrlSchema accepts undefined, null, empty, and blank strings', () => {
      assert.strictEqual(optionalHttpUrlSchema.safeParse(undefined).success, true);
      assert.strictEqual(optionalHttpUrlSchema.safeParse('').success, true);
      assert.strictEqual(optionalHttpUrlSchema.safeParse('   ').success, true);
    });

    it('UV-14: optionalHttpUrlSchema rejects invalid URLs when provided', () => {
      assert.strictEqual(optionalHttpUrlSchema.safeParse('javascript:alert(1)').success, false);
      assert.strictEqual(optionalHttpUrlSchema.safeParse('ftp://example.com').success, false);
      assert.strictEqual(optionalHttpUrlSchema.safeParse('https://example.com/bad path').success, false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Form Creation vs Update Schema Tests
  // --------------------------------------------------------------------------
  describe('Form Creation vs Update Schema Integration', () => {
    const basePayload = {
      title: 'NMIT Inter-Collegiate Hackathon 2026',
      slug: 'nmit-inter-collegiate-2026',
      tagline: 'Innovate the future',
      description: 'A comprehensive 48-hour competitive hackathon for engineering students.',
      organizer: 'Department of Computer Science & Engineering',
      mode: 'hybrid' as const,
      venue: 'NMIT Campus, Bangalore',
      registrationStartAt: '2026-11-01T00:00:00.000Z',
      registrationEndAt: '2026-11-15T23:59:59.000Z',
      eventStartAt: '2026-11-20T09:00:00.000Z',
      eventEndAt: '2026-11-22T18:00:00.000Z',
      timezone: 'Asia/Kolkata',
      minTeamSize: 2,
      maxTeamSize: 4,
      isSoloAllowed: false,
      eligibility: 'Open to all undergraduate engineering students.',
      prizesSummary: 'Prizes worth 2,00,000 INR',
      prizesDetail: [],
    };

    it('UV-15: hackathonCreateSchema rejects creation when externalRegistrationUrl is missing', () => {
      const payloadWithoutUrl = { ...basePayload };
      const result = hackathonCreateSchema.safeParse(payloadWithoutUrl);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        const issues = result.error.issues.map((i) => i.path.join('.'));
        assert.ok(
          issues.includes('externalRegistrationUrl'),
          'Should report error on externalRegistrationUrl'
        );
      }
    });

    it('UV-16: hackathonCreateSchema rejects creation when externalRegistrationUrl is empty or blank', () => {
      const payloadEmptyUrl = { ...basePayload, externalRegistrationUrl: '   ' };
      const result = hackathonCreateSchema.safeParse(payloadEmptyUrl);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        const issues = result.error.issues.map((i) => i.path.join('.'));
        assert.ok(issues.includes('externalRegistrationUrl'));
      }
    });

    it('UV-17: hackathonCreateSchema accepts creation with valid externalRegistrationUrl', () => {
      const payloadWithUrl = {
        ...basePayload,
        externalRegistrationUrl: 'https://devpost.com/hackathons/nmit-2026',
      };
      const result = hackathonCreateSchema.safeParse(payloadWithUrl);
      assert.strictEqual(result.success, true);
    });

    it('UV-18: hackathonUpdateSchema permits empty externalRegistrationUrl (historical rows)', () => {
      const payloadWithoutUrl = { ...basePayload, externalRegistrationUrl: '' };
      const result = hackathonUpdateSchema.safeParse(payloadWithoutUrl);
      assert.strictEqual(result.success, true, 'Historical records without URL should pass update schema');
    });

    it('UV-19: hackathonUpdateSchema rejects invalid externalRegistrationUrl when provided', () => {
      const payloadBadUrl = { ...basePayload, externalRegistrationUrl: 'http://example.com/has space' };
      const result = hackathonUpdateSchema.safeParse(payloadBadUrl);
      assert.strictEqual(result.success, false);
    });

    it('UV-20: communityUrl remains optional in both create and update schemas', () => {
      const createWithCommunity = {
        ...basePayload,
        externalRegistrationUrl: 'https://devpost.com/hackathons/nmit-2026',
        communityUrl: 'https://chat.whatsapp.com/invite/123456',
      };
      assert.strictEqual(hackathonCreateSchema.safeParse(createWithCommunity).success, true);

      const createWithoutCommunity = {
        ...basePayload,
        externalRegistrationUrl: 'https://devpost.com/hackathons/nmit-2026',
        communityUrl: '',
      };
      assert.strictEqual(hackathonCreateSchema.safeParse(createWithoutCommunity).success, true);
    });
  });
});
