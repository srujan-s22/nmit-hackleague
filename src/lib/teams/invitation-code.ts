import { randomInt } from 'node:crypto';

/**
 * Crockford Base32 alphabet for team invitation codes:
 * - 32 uppercase characters: digits 2-9, letters A-Z excluding I and O
 * - Excludes 0 (zero) to eliminate confusion with letter O
 * - Excludes 1 (one) to eliminate confusion with letter I / L
 * - Excludes I and O
 * - Keyspace for 6 characters: 32^6 = 1,073,741,824 combinations (~1.07 billion)
 */
export const INVITATION_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const INVITATION_CODE_LENGTH = 6;
export const LEGACY_INVITATION_CODE_LENGTH = 12;

export const INVITATION_CODE_REGEX = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
export const LEGACY_INVITATION_CODE_REGEX = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/;

/**
 * Normalizes an invitation code input:
 * - Strips all internal and surrounding whitespace
 * - Converts to uppercase
 */
export function normalizeInvitationCode(input: string): string {
  if (!input) return '';
  return input.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Generates an unguessable 6-character invitation code using Node.js crypto CSPRNG.
 * Every character is sampled uniformly from the 32-character Crockford Base32 alphabet.
 */
export function generateInvitationCode(): string {
  let code = '';
  for (let i = 0; i < INVITATION_CODE_LENGTH; i++) {
    const idx = randomInt(0, INVITATION_CODE_ALPHABET.length);
    code += INVITATION_CODE_ALPHABET[idx];
  }
  return code;
}

/**
 * Validates whether a code strictly satisfies the new 6-character format.
 */
export function isValidNewInvitationCode(code: string): boolean {
  const normalized = normalizeInvitationCode(code);
  return normalized.length === INVITATION_CODE_LENGTH && INVITATION_CODE_REGEX.test(normalized);
}

/**
 * Validates whether a code satisfies either the new 6-character format or
 * the legacy 12-character format (for backward compatibility).
 */
export function isValidInvitationCode(code: string): boolean {
  const normalized = normalizeInvitationCode(code);
  return (
    (normalized.length === INVITATION_CODE_LENGTH && INVITATION_CODE_REGEX.test(normalized)) ||
    (normalized.length === LEGACY_INVITATION_CODE_LENGTH && LEGACY_INVITATION_CODE_REGEX.test(normalized))
  );
}
