import 'server-only';
import { randomBytes, randomInt } from 'node:crypto';

/**
 * Character sets for temporary password generation.
 * Avoid ambiguous characters like 0, O, I, l, 1 to prevent transcription errors
 * while retaining high entropy.
 */
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const NUMBERS = '23456789';
const SYMBOLS = '!@#$%^&*-_+=';
const ALL_CHARS = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS;

/**
 * Generate a cryptographically secure random temporary password.
 *
 * Entropy calculation:
 * Minimum length = 20 characters.
 * Pool size = 24 (upper) + 24 (lower) + 8 (nums) + 12 (symbols) = 68 characters.
 * Entropy = 20 * log2(68) ≈ 121.7 bits for 20 chars;
 * Using 24 characters yields 24 * log2(68) ≈ 146 bits of entropy (exceeds 128-bit requirement).
 *
 * Guaranteed constraints:
 * - At least 2 uppercase letters
 * - At least 2 lowercase letters
 * - At least 2 numbers
 * - At least 2 special symbols
 * - Satisfies all application password validation schemas (min 8 chars, upper, lower, number).
 */
export function generateSecureTemporaryPassword(length = 24): string {
  if (length < 20) {
    throw new Error('Temporary password length must be at least 20 characters for sufficient entropy.');
  }

  const passwordChars: string[] = [];

  // Guarantee at least two characters from each required character class
  passwordChars.push(UPPERCASE[randomInt(0, UPPERCASE.length)]);
  passwordChars.push(UPPERCASE[randomInt(0, UPPERCASE.length)]);

  passwordChars.push(LOWERCASE[randomInt(0, LOWERCASE.length)]);
  passwordChars.push(LOWERCASE[randomInt(0, LOWERCASE.length)]);

  passwordChars.push(NUMBERS[randomInt(0, NUMBERS.length)]);
  passwordChars.push(NUMBERS[randomInt(0, NUMBERS.length)]);

  passwordChars.push(SYMBOLS[randomInt(0, SYMBOLS.length)]);
  passwordChars.push(SYMBOLS[randomInt(0, SYMBOLS.length)]);

  // Fill remaining characters from entire character pool using cryptographic randomness
  const remainingLength = length - passwordChars.length;
  const bytes = randomBytes(remainingLength);
  for (let i = 0; i < remainingLength; i++) {
    const charIndex = bytes[i] % ALL_CHARS.length;
    passwordChars.push(ALL_CHARS[charIndex]);
  }

  // Fisher-Yates shuffle using crypto.randomInt to eliminate positional bias
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const temp = passwordChars[i];
    passwordChars[i] = passwordChars[j];
    passwordChars[j] = temp;
  }

  return passwordChars.join('');
}

/**
 * DEPRECATED STATIC FALLBACK (Retained solely for permanent password blacklist checks):
 * MUST NEVER be provisioned or assigned to any administrator.
 * Used exclusively to prevent users from setting this former fallback as their permanent password.
 */
export const DEV_ADMIN_TEMP_PASSWORD_FALLBACK = 'Hackleague@nmit';

/**
 * Returns the initial temporary password for newly provisioned administrators.
 * Always generates a unique, cryptographically secure 24-character random password
 * (>146 bits of entropy) on the server across all environments.
 * Static password fallbacks are strictly prohibited.
 */
export function getInitialAdminProvisioningPassword(): {
  password: string;
  isDevFallback: boolean;
} {
  return {
    password: generateSecureTemporaryPassword(24),
    isDevFallback: false,
  };
}

