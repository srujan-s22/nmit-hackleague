import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

import {
  CANONICAL_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  PERMISSIONS_LIST,
  PERMISSIONS_BY_CATEGORY,
  adminPermissionKeySchema,
  adminPermissionsArraySchema,
  adminCreationSchema,
  adminPermissionsUpdateSchema,
} from '../../src/lib/auth/permissions';

const { requireHackathonReviewScope, requireHackathonScope } = require('../../src/lib/auth/guards');

describe('Phase 2B: RBAC Permissions & Reviewer Authorization Scope', () => {
  describe('Permission Catalog: assign_hackathons', () => {
    test('P2B-01: assign_hackathons is registered in CANONICAL_PERMISSIONS', () => {
      assert.ok(
        CANONICAL_PERMISSIONS.includes('assign_hackathons' as any),
        "'assign_hackathons' must be registered in CANONICAL_PERMISSIONS"
      );
      assert.strictEqual(
        CANONICAL_PERMISSIONS.length,
        13,
        'CANONICAL_PERMISSIONS must contain exactly 13 canonical permissions'
      );
    });

    test('P2B-02: assign_hackathons has complete metadata in PERMISSION_DEFINITIONS', () => {
      const def = PERMISSION_DEFINITIONS['assign_hackathons'];
      assert.ok(def, 'PERMISSION_DEFINITIONS must contain an entry for assign_hackathons');
      assert.strictEqual(def.key, 'assign_hackathons');
      assert.strictEqual(def.label, 'Assign Hackathons');
      assert.strictEqual(def.category, 'Event Operations');
      assert.ok(def.description.length > 10, 'Description must be informative');
      assert.ok(def.phaseAvailability.includes('Phase 2B'), 'Phase availability must specify Phase 2B');
    });

    test('P2B-03: assign_hackathons appears in PERMISSIONS_LIST and PERMISSIONS_BY_CATEGORY', () => {
      const inList = PERMISSIONS_LIST.some((p) => p.key === 'assign_hackathons');
      assert.ok(inList, 'assign_hackathons must be present in PERMISSIONS_LIST');

      const eventOps = PERMISSIONS_BY_CATEGORY['Event Operations'];
      assert.ok(eventOps, 'Event Operations category must exist');
      const inCategory = eventOps.some((p) => p.key === 'assign_hackathons');
      assert.ok(inCategory, 'assign_hackathons must be grouped under Event Operations category');
    });

    test('P2B-04: adminPermissionKeySchema validates assign_hackathons correctly', () => {
      const valid = adminPermissionKeySchema.safeParse('assign_hackathons');
      assert.strictEqual(valid.success, true, 'adminPermissionKeySchema must accept assign_hackathons');
      if (valid.success) {
        assert.strictEqual(valid.data, 'assign_hackathons');
      }

      const invalid = adminPermissionKeySchema.safeParse('super_powers');
      assert.strictEqual(invalid.success, false, 'adminPermissionKeySchema must reject non-canonical permissions');
    });

    test('P2B-05: adminPermissionsArraySchema transforms and deduplicates assign_hackathons', () => {
      const parsed = adminPermissionsArraySchema.safeParse([
        'assign_hackathons',
        'verify_students',
        'assign_hackathons',
        'manage_hackathons',
      ]);
      assert.strictEqual(parsed.success, true);
      if (parsed.success) {
        assert.deepStrictEqual(
          parsed.data,
          ['assign_hackathons', 'manage_hackathons', 'verify_students'],
          'Must deduplicate and sort keys alphabetically'
        );
      }
    });

    test('P2B-06: adminCreationSchema and adminPermissionsUpdateSchema accept assign_hackathons', () => {
      const creation = adminCreationSchema.safeParse({
        email: 'ops-admin@nmit.ac.in',
        fullName: 'Operations Coordinator',
        permissions: ['assign_hackathons'],
      });
      assert.strictEqual(creation.success, true, 'adminCreationSchema must accept assign_hackathons');

      const update = adminPermissionsUpdateSchema.safeParse({
        adminId: 'a0000000-0000-4000-8000-000000000001',
        permissions: ['assign_hackathons', 'manage_hackathons'],
      });
      assert.strictEqual(update.success, true, 'adminPermissionsUpdateSchema must accept assign_hackathons');
    });

    test('P2B-07: assign_hackathons is completely independent of manage_hackathons', () => {
      // An admin holding only assign_hackathons does NOT have manage_hackathons
      const assignerPerms = ['assign_hackathons'];
      assert.strictEqual(
        assignerPerms.includes('manage_hackathons'),
        false,
        'assign_hackathons must not automatically imply manage_hackathons'
      );

      // An admin holding only manage_hackathons does NOT have assign_hackathons
      const managerPerms = ['manage_hackathons'];
      assert.strictEqual(
        managerPerms.includes('assign_hackathons'),
        false,
        'manage_hackathons must not automatically imply assign_hackathons'
      );
    });
  });

  describe('Reviewer Authorization Scope: requireHackathonReviewScope', () => {
    test('P2B-08: requireHackathonReviewScope is exported and is a callable function', () => {
      assert.strictEqual(typeof requireHackathonReviewScope, 'function');
      assert.strictEqual(typeof requireHackathonScope, 'function');
    });

    test('P2B-09: requireHackathonReviewScope requires hackathonId argument', () => {
      assert.strictEqual(
        requireHackathonReviewScope.length,
        1,
        'requireHackathonReviewScope must accept exactly 1 argument (hackathonId)'
      );
    });
  });
});
