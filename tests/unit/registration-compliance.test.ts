// External registration is compulsory: pending until the deadline, then not_registered.
export {};

import {
  daysUntilDeadline,
  teamRegistrationState,
} from '../../src/lib/teams/registration-compliance';

let passed = 0;
let total = 0;
function assert(cond: boolean, name: string, detail?: string) {
  total++;
  if (cond) { console.log(`  ✓ [PASS] ${name}`); passed++; }
  else console.error(`  ✗ [FAIL] ${name} ${detail ?? ''}`);
}

console.log('=== Team registration compliance ===\n');
const now = new Date('2026-11-10T12:00:00Z');
const future = '2026-11-12T12:00:00Z';
const past = '2026-11-09T12:00:00Z';

assert(teamRegistrationState('submitted', future, now) === 'registered', 'proof submitted before the deadline is registered');
assert(teamRegistrationState('submitted', past, now) === 'registered', 'proof submitted stays registered after the deadline');
assert(teamRegistrationState('not_submitted', future, now) === 'pending', 'no proof before the deadline is pending');
assert(teamRegistrationState('not_submitted', past, now) === 'not_registered', 'no proof after the deadline is not registered');
assert(teamRegistrationState('rejected', past, now) === 'not_registered', 'a rejected proof after the deadline is not registered');
assert(teamRegistrationState('not_submitted', '2026-11-10T12:00:00Z', now) === 'pending', 'the deadline moment itself is still pending (inclusive)');
assert(teamRegistrationState('not_submitted', null, now) === 'pending', 'unknown deadline never marks a team not registered');
assert(daysUntilDeadline(future, now) === 2 && daysUntilDeadline(past, now) < 0, 'days until deadline counts down and goes negative after');

console.log(`\n=== Results: ${passed}/${total} passed ===`);
if (passed !== total) process.exit(1);
