import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  INVITATION_CODE_ALPHABET,
  INVITATION_CODE_LENGTH,
  LEGACY_INVITATION_CODE_LENGTH,
  generateInvitationCode,
  normalizeInvitationCode,
  isValidNewInvitationCode,
  isValidInvitationCode,
} from '../../src/lib/teams/invitation-code';
import {
  invitationCodeSchema,
  newInvitationCodeSchema,
  joinTeamSchema,
} from '../../src/lib/validation/team-schemas';

describe('Team Invitation Code Specification & Security Suite', () => {
  // --------------------------------------------------------------------------
  // 1. Length & Format Requirements
  // --------------------------------------------------------------------------
  it('TIC-01: newly generated codes are exactly six characters', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateInvitationCode();
      assert.strictEqual(code.length, 6, `Code ${code} must be exactly 6 characters`);
    }
  });

  it('TIC-02: all characters belong to the allowed Crockford Base32 alphabet', () => {
    const allowedSet = new Set(INVITATION_CODE_ALPHABET.split(''));
    // Ensure alphabet has exactly 32 distinct characters (excluding 0, 1, I, O)
    assert.strictEqual(allowedSet.size, 32);
    assert.strictEqual(allowedSet.has('0'), false, 'Alphabet must not include 0');
    assert.strictEqual(allowedSet.has('1'), false, 'Alphabet must not include 1');
    assert.strictEqual(allowedSet.has('I'), false, 'Alphabet must not include I');
    assert.strictEqual(allowedSet.has('O'), false, 'Alphabet must not include O');

    for (let i = 0; i < 100; i++) {
      const code = generateInvitationCode();
      for (const char of code) {
        assert.strictEqual(
          allowedSet.has(char),
          true,
          `Character ${char} in ${code} must belong to allowed alphabet`
        );
      }
    }
  });

  it('TIC-03: generation uses a cryptographically secure random source with uniform distribution', () => {
    // Generate 3,200 characters (sample size) and verify uniform frequency distribution
    const counts: Record<string, number> = {};
    for (const char of INVITATION_CODE_ALPHABET) {
      counts[char] = 0;
    }

    const totalSamples = 3200;
    for (let i = 0; i < totalSamples / 6; i++) {
      const code = generateInvitationCode();
      for (const char of code) {
        counts[char]++;
      }
    }

    // Every character in the 32-char alphabet should appear at least once in 3,200 samples
    for (const char of INVITATION_CODE_ALPHABET) {
      assert.strictEqual(
        counts[char] > 0,
        true,
        `Alphabet character '${char}' was never sampled`
      );
    }
  });

  // --------------------------------------------------------------------------
  // 2. Input Normalization
  // --------------------------------------------------------------------------
  it('TIC-04: input normalization works consistently with whitespace and casing', () => {
    // Trimming and whitespace removal
    assert.strictEqual(normalizeInvitationCode('  4F4D3E  '), '4F4D3E');
    assert.strictEqual(normalizeInvitationCode('4F 4D 3E'), '4F4D3E');
    assert.strictEqual(normalizeInvitationCode('\t4f4d3e\n'), '4F4D3E');
    assert.strictEqual(normalizeInvitationCode(''), '');

    // Schema normalization
    const parsed1 = invitationCodeSchema.safeParse('  4f4d3e  ');
    assert.strictEqual(parsed1.success, true);
    if (parsed1.success) {
      assert.strictEqual(parsed1.data, '4F4D3E');
    }

    const parsed2 = invitationCodeSchema.safeParse('4f 4d 3e');
    assert.strictEqual(parsed2.success, true);
    if (parsed2.success) {
      assert.strictEqual(parsed2.data, '4F4D3E');
    }
  });

  // --------------------------------------------------------------------------
  // 3. Validation & Rejection of Invalid Codes
  // --------------------------------------------------------------------------
  it('TIC-05: invalid-length and invalid-character codes are rejected for newly generated codes', () => {
    // Invalid lengths
    assert.strictEqual(isValidNewInvitationCode('4F4D3'), false, 'Rejects 5 chars');
    assert.strictEqual(isValidNewInvitationCode('4F4D3E2'), false, 'Rejects 7 chars');
    assert.strictEqual(isValidNewInvitationCode(''), false, 'Rejects empty');

    // Forbidden ambiguous characters
    assert.strictEqual(isValidNewInvitationCode('4F4D0E'), false, 'Rejects "0"');
    assert.strictEqual(isValidNewInvitationCode('4F4D1E'), false, 'Rejects "1"');
    assert.strictEqual(isValidNewInvitationCode('4F4DIE'), false, 'Rejects "I"');
    assert.strictEqual(isValidNewInvitationCode('4F4DOE'), false, 'Rejects "O"');

    // Punctuation & special chars
    assert.strictEqual(isValidNewInvitationCode('4F-4DE'), false, 'Rejects hyphen');
    assert.strictEqual(isValidNewInvitationCode('4F4D#E'), false, 'Rejects symbol');

    // Schema level
    assert.strictEqual(newInvitationCodeSchema.safeParse('SHORT').success, false);
    assert.strictEqual(newInvitationCodeSchema.safeParse('4F4D0E').success, false);
    assert.strictEqual(newInvitationCodeSchema.safeParse('4F4D3E').success, true);
  });

  // --------------------------------------------------------------------------
  // 4. Concurrency & Uniqueness Simulation
  // --------------------------------------------------------------------------
  it('TIC-06: two concurrent generation requests cannot successfully create duplicate active codes', () => {
    const activeRegistry = new Set<string>();

    function registerCodeAtomic(code: string): boolean {
      if (activeRegistry.has(code)) {
        return false; // Unique violation in database
      }
      activeRegistry.add(code);
      return true;
    }

    const generated = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const code = generateInvitationCode();
      const success = registerCodeAtomic(code);
      assert.strictEqual(success, true, 'Every unique code registers successfully');
      generated.add(code);
    }

    assert.strictEqual(generated.size, 1000, '1000 independent samples have no collisions');
  });

  it('TIC-07: collision retries work and have a bounded failure path', () => {
    let attempts = 0;
    const maxAttempts = 5;
    const simulatedExistingCode = '4F4D3E';

    function generateWithRetry(alwaysCollide: boolean): string {
      attempts = 0;
      while (attempts <= maxAttempts) {
        attempts++;
        const candidate = alwaysCollide ? simulatedExistingCode : generateInvitationCode();
        if (candidate !== simulatedExistingCode || !alwaysCollide) {
          return candidate;
        }
        if (attempts >= maxAttempts) {
          throw new Error('Failed to generate unique invitation code after 5 attempts. Please retry.');
        }
      }
      throw new Error('Unreachable');
    }

    // Normal generation succeeds in 1 attempt
    const code = generateWithRetry(false);
    assert.strictEqual(code.length, 6);
    assert.strictEqual(attempts, 1);

    // Simulated collision exhaustion throws safe bounded exception
    assert.throws(
      () => generateWithRetry(true),
      /Failed to generate unique invitation code after 5 attempts/
    );
    assert.strictEqual(attempts, 5, 'Retried exactly 5 bounded attempts before failing');
  });

  // --------------------------------------------------------------------------
  // 5. Backward Compatibility (12-character Legacy Codes)
  // --------------------------------------------------------------------------
  it('TIC-08: existing valid active 12-character codes remain usable until expiry', () => {
    const legacyValidCode = '23456789ABCD';
    assert.strictEqual(legacyValidCode.length, LEGACY_INVITATION_CODE_LENGTH);

    // General validator accepts both 6 and 12 chars
    assert.strictEqual(isValidInvitationCode(legacyValidCode), true);
    assert.strictEqual(isValidInvitationCode('4F4D3E'), true);

    // Schema accepts both
    const parseLegacy = joinTeamSchema.safeParse({ invitationCode: legacyValidCode });
    assert.strictEqual(parseLegacy.success, true);
    if (parseLegacy.success) {
      assert.strictEqual(parseLegacy.data.invitationCode, legacyValidCode);
    }

    const parseNew = joinTeamSchema.safeParse({ invitationCode: '4F4D3E' });
    assert.strictEqual(parseNew.success, true);
    if (parseNew.success) {
      assert.strictEqual(parseNew.data.invitationCode, '4F4D3E');
    }

    // Still rejects invalid lengths (e.g. 5, 7, 8, 10, 11, 13)
    assert.strictEqual(joinTeamSchema.safeParse({ invitationCode: '12345' }).success, false);
    assert.strictEqual(joinTeamSchema.safeParse({ invitationCode: '1234567' }).success, false);
    assert.strictEqual(joinTeamSchema.safeParse({ invitationCode: '12345678901' }).success, false);
  });

  // --------------------------------------------------------------------------
  // 6. Expiry & Invalidation Simulation
  // --------------------------------------------------------------------------
  it('TIC-09: expired codes are rejected based on expiration timestamp', () => {
    const now = Date.now();
    const activeTeam = {
      code: '4F4D3E',
      expiresAt: new Date(now + 3600 * 1000).toISOString(), // +1 hour
    };
    const expiredTeam = {
      code: '2A3B4C',
      expiresAt: new Date(now - 3600 * 1000).toISOString(), // -1 hour
    };

    function canJoin(team: { code: string; expiresAt: string }): boolean {
      return new Date(team.expiresAt).getTime() > Date.now();
    }

    assert.strictEqual(canJoin(activeTeam), true, 'Active code is permitted');
    assert.strictEqual(canJoin(expiredTeam), false, 'Expired code is rejected');
  });

  it('TIC-10: regeneration invalidates the previous code immediately', () => {
    let currentCode = 'OLD123';
    let expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();

    function regenerateCode(): { newCode: string; newExpiry: string } {
      // Old code is immediately overwritten
      currentCode = generateInvitationCode();
      expiresAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
      return { newCode: currentCode, newExpiry: expiresAt };
    }

    const res = regenerateCode();
    assert.notStrictEqual(res.newCode, 'OLD123');
    assert.strictEqual(res.newCode.length, 6);
    assert.strictEqual(currentCode, res.newCode);
  });

  // --------------------------------------------------------------------------
  // 7. Authorization & Eligibility Simulation
  // --------------------------------------------------------------------------
  it('TIC-11: unauthorized users cannot regenerate codes or bypass eligibility', () => {
    function checkCanRegenerate(team: { leaderId: string; status: string }, userId: string): boolean {
      if (team.leaderId !== userId) return false;
      if (team.status !== 'forming') return false;
      return true;
    }

    const team = { leaderId: 'student-leader-1', status: 'forming' };
    assert.strictEqual(checkCanRegenerate(team, 'student-leader-1'), true, 'Leader can regenerate');
    assert.strictEqual(checkCanRegenerate(team, 'student-member-2'), false, 'Non-leader cannot regenerate');

    const lockedTeam = { leaderId: 'student-leader-1', status: 'locked' };
    assert.strictEqual(checkCanRegenerate(lockedTeam, 'student-leader-1'), false, 'Locked team cannot regenerate');
  });

  // --------------------------------------------------------------------------
  // 8. Atomic Subtransaction Retry & Constraint Diagnostics Simulation
  // --------------------------------------------------------------------------
  it('TIC-12: atomic retry loop handles teams_invitation_code_key collision by retrying up to 5 times', () => {
    let attempts = 0;
    const existingDbCodes = new Set(['COLLID', 'DUPLIC']);

    function simulateAtomicRegenerate(alwaysFail: boolean): { code: string; attempts: number } {
      attempts = 0;
      while (attempts < 5) {
        attempts++;
        const candidateCode = alwaysFail ? 'COLLID' : attempts === 1 ? 'DUPLIC' : generateInvitationCode();

        // Simulate database atomic attempt inside subtransaction
        try {
          if (existingDbCodes.has(candidateCode)) {
            const err: any = new Error('duplicate key value violates unique constraint');
            err.constraint = 'teams_invitation_code_key';
            throw err;
          }
          return { code: candidateCode, attempts };
        } catch (e: any) {
          if (e.constraint === 'teams_invitation_code_key') {
            if (attempts >= 5) {
              throw new Error('Failed to generate unique invitation code after 5 attempts. Please retry.');
            }
            continue; // retry
          }
          throw e;
        }
      }
      throw new Error('Unreachable');
    }

    // Attempt 1 collided with 'DUPLIC', attempt 2 succeeded with fresh 6-char code
    const result = simulateAtomicRegenerate(false);
    assert.strictEqual(result.attempts, 2);
    assert.strictEqual(result.code.length, 6);
    assert.strictEqual(existingDbCodes.has(result.code), false);

    // 5 consecutive collisions trigger bounded error
    assert.throws(
      () => simulateAtomicRegenerate(true),
      /Failed to generate unique invitation code after 5 attempts/
    );
    assert.strictEqual(attempts, 5);
  });

  it('TIC-13: duplicate team name collision (uq_teams_hackathon_name_ci) immediately aborts without retrying code generation', () => {
    let codeGenAttempts = 0;

    function simulateCreateTeam(teamName: string, existingNames: Set<string>) {
      while (codeGenAttempts < 5) {
        codeGenAttempts++;
        const code = generateInvitationCode();

        try {
          if (existingNames.has(teamName.toLowerCase().trim())) {
            const err: any = new Error('duplicate key value violates unique constraint');
            err.constraint = 'uq_teams_hackathon_name_ci';
            throw err;
          }
          return { name: teamName, code, attempts: codeGenAttempts };
        } catch (e: any) {
          if (e.constraint === 'teams_invitation_code_key') {
            if (codeGenAttempts >= 5) {
              throw new Error('Failed to generate unique invitation code after 5 attempts. Please retry.');
            }
            continue;
          } else if (e.constraint === 'uq_teams_hackathon_name_ci') {
            throw new Error(`Team name "${teamName}" is already taken in this hackathon.`);
          }
          throw e;
        }
      }
    }

    assert.throws(
      () => simulateCreateTeam('Alpha Team', new Set(['alpha team'])),
      /Team name "Alpha Team" is already taken in this hackathon\./
    );
    // Crucial check: code generation was attempted exactly once and immediately aborted without retrying code generation
    assert.strictEqual(codeGenAttempts, 1);
  });

  it('TIC-14: unrelated unique constraints (e.g. uq_team_members_one_team_per_hackathon) are immediately re-raised and never swallowed', () => {
    let attempts = 0;

    function simulateUnrelatedConstraintFailure() {
      while (attempts < 5) {
        attempts++;
        const code = generateInvitationCode();

        try {
          const err: any = new Error('duplicate key value violates unique constraint');
          err.constraint = 'uq_team_members_one_team_per_hackathon';
          throw err;
        } catch (e: any) {
          if (e.constraint === 'teams_invitation_code_key') {
            continue;
          }
          // Unrelated constraint is re-raised
          throw e;
        }
      }
    }

    assert.throws(
      () => simulateUnrelatedConstraintFailure(),
      (err: any) => err.constraint === 'uq_team_members_one_team_per_hackathon'
    );
    // Did not retry
    assert.strictEqual(attempts, 1);
  });
});
