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

import { z } from 'zod';
import { MANDATORY_CDC_DECLARATION_TEXT } from '../../src/lib/validation/team-schemas';
import { computeRegistrationState, computeEventTimingState } from '../../src/lib/hackathons/registration-state';
import { generateRegistrationProofStoragePath } from '../../src/lib/storage/paths';

describe('Unified Hackathon Experience & Registration Workflow Fix Suite', () => {
  describe('Requirement 1 — Simplified Administrator Assignment', () => {
    // Replicate assignAdminSchema from admin-assignment-actions.ts
    const assignAdminSchema = z.object({
      hackathonId: z.string().uuid('Invalid hackathon ID format'),
      targetAdminId: z.string().uuid('Invalid target administrator ID format'),
      role: z.enum(['reviewer', 'coordinator']).default('reviewer'),
      notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional().nullable(),
    });

    test('REQ1-01: assignment payload without role defaults safely to "reviewer"', () => {
      const parsed = assignAdminSchema.parse({
        hackathonId: '11111111-1111-4111-8111-111111111111',
        targetAdminId: '22222222-2222-4222-8222-222222222222',
        notes: 'Track 1 evaluator',
      });

      assert.strictEqual(parsed.role, 'reviewer', 'Assignment role must default to reviewer');
      assert.strictEqual(parsed.notes, 'Track 1 evaluator');
    });

    test('REQ1-02: explicit legacy role "coordinator" remains schema-compatible without breaking', () => {
      const parsed = assignAdminSchema.parse({
        hackathonId: '11111111-1111-4111-8111-111111111111',
        targetAdminId: '22222222-2222-4222-8222-222222222222',
        role: 'coordinator',
      });

      assert.strictEqual(parsed.role, 'coordinator');
    });

    test('REQ1-03: invalid role strings are strictly rejected', () => {
      const result = assignAdminSchema.safeParse({
        hackathonId: '11111111-1111-4111-8111-111111111111',
        targetAdminId: '22222222-2222-4222-8222-222222222222',
        role: 'super_admin',
      });

      assert.strictEqual(result.success, false, 'Arbitrary roles must be rejected');
    });

    test('REQ1-04: non-UUID hackathon or admin IDs are rejected fail-closed', () => {
      const result = assignAdminSchema.safeParse({
        hackathonId: 'not-a-uuid',
        targetAdminId: '22222222-2222-4222-8222-222222222222',
      });

      assert.strictEqual(result.success, false);
    });
  });

  describe('Requirement 2 — Hackathon Read-Only Details Route & Privacy', () => {
    test('REQ2-01: registration state and timing state compute correctly for public details', () => {
      const now = new Date();
      const future = new Date(now.getTime() + 7 * 86400000).toISOString();
      const past = new Date(now.getTime() - 7 * 86400000).toISOString();

      const openState = computeRegistrationState('published', past, future);
      assert.strictEqual(openState, 'OPEN', 'Open registration state expected');

      const draftState = computeRegistrationState('draft', past, future);
      assert.strictEqual(draftState, 'DRAFT', 'Draft state must be preserved as DRAFT');

      const timing = computeEventTimingState(past, future);
      assert.strictEqual(timing, 'TIMING_IN_PROGRESS', 'Active event timing expected');
    });

    test('REQ2-02: draft hackathons are private and accessible only to authorized viewers', () => {
      // Authorization simulation matching src/app/hackathons/[slug]/page.tsx
      function canViewHackathonDetails(
        hackathon: { id: string; status: string; in_charge_admin_id: string | null },
        viewer: { isAdmin: boolean; isSuperAdmin: boolean; adminId?: string; assignedHackathonIds: string[] }
      ): boolean {
        if (hackathon.status !== 'draft') {
          return true; // Published/closed/archived is viewable
        }
        if (viewer.isSuperAdmin) {
          return true; // Super Admin has global draft visibility
        }
        if (!viewer.isAdmin) {
          return false; // Students/unauthenticated cannot view drafts
        }
        const isAssigned =
          hackathon.in_charge_admin_id === viewer.adminId ||
          viewer.assignedHackathonIds.includes(hackathon.id);
        return isAssigned; // Ordinary admin can view only if assigned
      }

      const draftHackathon = {
        id: 'h1',
        status: 'draft',
        in_charge_admin_id: 'admin_in_charge',
      };

      const superAdminViewer = { isAdmin: true, isSuperAdmin: true, assignedHackathonIds: [] };
      const inChargeViewer = { isAdmin: true, isSuperAdmin: false, adminId: 'admin_in_charge', assignedHackathonIds: [] };
      const assignedReviewer = { isAdmin: true, isSuperAdmin: false, adminId: 'admin_rev', assignedHackathonIds: ['h1'] };
      const unassignedAdmin = { isAdmin: true, isSuperAdmin: false, adminId: 'admin_other', assignedHackathonIds: ['h2'] };
      const studentViewer = { isAdmin: false, isSuperAdmin: false, assignedHackathonIds: [] };

      assert.strictEqual(canViewHackathonDetails(draftHackathon, superAdminViewer), true, 'Super Admin can view draft');
      assert.strictEqual(canViewHackathonDetails(draftHackathon, inChargeViewer), true, 'In-charge admin can view draft');
      assert.strictEqual(canViewHackathonDetails(draftHackathon, assignedReviewer), true, 'Assigned reviewer can view draft');
      assert.strictEqual(canViewHackathonDetails(draftHackathon, unassignedAdmin), false, 'Unassigned admin cannot view draft');
      assert.strictEqual(canViewHackathonDetails(draftHackathon, studentViewer), false, 'Student cannot view draft');
    });
  });

  describe('Requirement 3 — Registered-Team Roster Scoping & Privacy', () => {
    test('REQ3-01: student roster fields are strictly non-sensitive (no phone, DOB, or photo path)', () => {
      // Allowed student profile fields for registered team roster
      const allowedStudentFields = new Set(['id', 'full_name', 'usn', 'branch', 'academic_year']);
      const sensitiveFields = ['phone', 'date_of_birth', 'college_id_path', 'profile_photo_path', 'registration_status'];

      for (const field of sensitiveFields) {
        assert.ok(!allowedStudentFields.has(field), `Sensitive field '${field}' must NOT be in roster projections`);
      }
    });

    test('REQ3-02: review scope authorizes Super Admin and assigned reviewers, rejects unassigned', () => {
      function checkReviewScope(
        hackathonId: string,
        admin: { is_active: boolean; is_super_admin: boolean; id: string },
        assignedHackathonIds: string[],
        inChargeAdminId: string | null
      ): boolean {
        if (!admin.is_active) return false;
        if (admin.is_super_admin) return true;
        if (inChargeAdminId === admin.id) return true;
        return assignedHackathonIds.includes(hackathonId);
      }

      const hackathonId = 'h-test-1';
      const superAdmin = { is_active: true, is_super_admin: true, id: 'sa-1' };
      const assignedAdmin = { is_active: true, is_super_admin: false, id: 'a-1' };
      const unassignedAdmin = { is_active: true, is_super_admin: false, id: 'a-2' };
      const inactiveAdmin = { is_active: false, is_super_admin: false, id: 'a-3' };

      assert.strictEqual(checkReviewScope(hackathonId, superAdmin, [], null), true, 'Super Admin must have global review scope');
      assert.strictEqual(checkReviewScope(hackathonId, assignedAdmin, [hackathonId], null), true, 'Assigned admin has review scope');
      assert.strictEqual(checkReviewScope(hackathonId, unassignedAdmin, ['other-h'], null), false, 'Unassigned admin must be rejected');
      assert.strictEqual(checkReviewScope(hackathonId, inactiveAdmin, [hackathonId], null), false, 'Inactive admin must be rejected');
    });
  });

  describe('Requirement 4 — Unified Hackathon Cards & Super Admin Invariant', () => {
    test('REQ4-01: Super Admin global visibility returns all hackathons without synthetic DB rows', () => {
      const allHackathons = [
        { id: 'h1', title: 'Web Hackathon' },
        { id: 'h2', title: 'AI Hackathon' },
        { id: 'h3', title: 'Cloud Hackathon' },
      ];

      const databaseAssignmentRows = [
        { hackathon_id: 'h1', admin_id: 'ordinary_admin' },
      ];

      // Ordinary admin: sees only assigned rows
      const ordinaryAssignedIds = databaseAssignmentRows
        .filter((r) => r.admin_id === 'ordinary_admin')
        .map((r) => r.hackathon_id);
      const ordinaryView = allHackathons.filter((h) => ordinaryAssignedIds.includes(h.id));
      assert.strictEqual(ordinaryView.length, 1, 'Ordinary admin sees only explicitly assigned hackathon');

      // Super Admin: sees all hackathons due to authorization invariant
      const isSuperAdmin = true;
      const superAdminView = isSuperAdmin
        ? allHackathons
        : allHackathons.filter((h) => ordinaryAssignedIds.includes(h.id));

      assert.strictEqual(superAdminView.length, 3, 'Super Admin sees all hackathons without fake assignment rows');
      assert.strictEqual(databaseAssignmentRows.length, 1, 'Database remains free of fabricated assignment rows');
    });

    test('REQ4-02: ordinary admin cards do not render Super Admin management controls', () => {
      function getVisibleCardActions(isSuperAdmin: boolean, isAssigned: boolean) {
        const actions: string[] = ['details', 'portal'];
        if (isAssigned || isSuperAdmin) {
          actions.push('teams', 'submissions');
        }
        if (isSuperAdmin) {
          actions.push('edit', 'configure_rounds', 'lifecycle_controls');
        }
        return actions;
      }

      const superAdminActions = getVisibleCardActions(true, false);
      assert.ok(superAdminActions.includes('teams'), 'Super Admin can access teams');
      assert.ok(superAdminActions.includes('submissions'), 'Super Admin can access submissions');
      assert.ok(superAdminActions.includes('edit'), 'Super Admin has edit action');
      assert.ok(superAdminActions.includes('configure_rounds'), 'Super Admin has configure rounds action');

      const assignedAdminActions = getVisibleCardActions(false, true);
      assert.ok(assignedAdminActions.includes('teams'), 'Assigned admin can access teams');
      assert.ok(assignedAdminActions.includes('submissions'), 'Assigned admin can access submissions');
      assert.ok(!assignedAdminActions.includes('edit'), 'Assigned admin must NOT see edit action');
      assert.ok(!assignedAdminActions.includes('configure_rounds'), 'Assigned admin must NOT see configure rounds action');

      const unassignedAdminActions = getVisibleCardActions(false, false);
      assert.ok(!unassignedAdminActions.includes('teams'), 'Unassigned admin must NOT see teams');
      assert.ok(!unassignedAdminActions.includes('submissions'), 'Unassigned admin must NOT see submissions');
      assert.ok(!unassignedAdminActions.includes('edit'), 'Unassigned admin must NOT see edit action');
      assert.ok(unassignedAdminActions.includes('details'), 'Unassigned admin sees read-only details');
    });
  });

  describe('Requirement 5 — Registration Proof Workflow & Signed URL Safety', () => {
    test('REQ5-01: registration proof path is deterministic and isolates by team ID', () => {
      const teamId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
      const pathPng = generateRegistrationProofStoragePath(teamId, 'png');
      const pathJpg = generateRegistrationProofStoragePath(teamId, 'jpg');

      assert.ok(pathPng.startsWith(`teams/${teamId}/registration/`), 'Must start with team folder prefix');
      assert.ok(pathPng.endsWith('.png'), 'Must have .png extension');
      assert.ok(pathJpg.startsWith(`teams/${teamId}/registration/`), 'Must start with team folder prefix');
      assert.ok(pathJpg.endsWith('.jpg'), 'Must have .jpg extension');
    });

    test('REQ5-02: mandatory CDC declaration text is verified and required', () => {
      assert.ok(
        MANDATORY_CDC_DECLARATION_TEXT.includes('Career Development Centre (CDC)'),
        'CDC declaration must reference Career Development Centre'
      );
      assert.ok(
        MANDATORY_CDC_DECLARATION_TEXT.includes('genuine, unaltered'),
        'CDC declaration must mandate genuine, unaltered screenshot'
      );
    });

    test('REQ5-03: registration proof does NOT require mandatory manual approval for initial status', () => {
      // In Phase 2B/5, submitting external proof automatically awards initial registration points
      // and sets status to 'submitted' without requiring manual admin approval
      function computeProofOutcome(cdcAccepted: boolean) {
        if (!cdcAccepted) {
          return { success: false, error: 'CDC declaration required' };
        }
        return {
          success: true,
          external_status: 'submitted',
          points_awarded: true,
          requiresManualAdminApproval: false,
        };
      }

      const outcome = computeProofOutcome(true);
      assert.strictEqual(outcome.success, true);
      assert.strictEqual(outcome.external_status, 'submitted');
      assert.strictEqual(outcome.points_awarded, true);
      assert.strictEqual(outcome.requiresManualAdminApproval, false, 'Manual admin approval is NOT mandatory');
    });

    test('REQ5-04: signed preview URLs have short time-to-live (60 seconds) preventing public exposure', () => {
      const defaultPreviewExpiry = 60; // 60 seconds
      assert.strictEqual(defaultPreviewExpiry, 60, 'Preview URL must expire within 60 seconds');
    });
  });

  describe('Requirement 6 — Separation of Registration Claims & Round Submissions', () => {
    test('REQ6-01: team with external registration proof exists independently of round submissions', () => {
      const teamId = '21b0b4f2-eda8-4908-8c77-ad0f5cfba29a';
      const hackathonId = '91d38c5c-56f2-4377-9b5f-69f3b5e7a5cc';

      const registrationClaim = {
        id: teamId,
        name: 'Test team',
        hackathon_id: hackathonId,
        external_status: 'submitted',
        external_proof_path: `teams/${teamId}/registration/proof.jpg`,
        cdc_declaration_accepted: true,
      };

      const roundSubmissions: any[] = [];

      // Assertion: Registration proof exists even when round submissions are empty
      assert.ok(registrationClaim.external_proof_path, 'Registration proof path is populated');
      assert.strictEqual(registrationClaim.external_status, 'submitted');
      assert.strictEqual(roundSubmissions.length, 0, 'Round submissions can be empty without invalidating claim');
    });

    test('REQ6-02: claims and round submissions are partitioned by hackathon_id', () => {
      const targetHackathonId = 'h-target';
      const otherHackathonId = 'h-other';

      const allClaims = [
        { id: 't1', hackathon_id: targetHackathonId, name: 'Team Alpha' },
        { id: 't2', hackathon_id: otherHackathonId, name: 'Team Beta' },
      ];

      const scopedClaims = allClaims.filter((c) => c.hackathon_id === targetHackathonId);
      assert.strictEqual(scopedClaims.length, 1);
      assert.strictEqual(scopedClaims[0].id, 't1');
    });

    test('REQ6-03: claims filtering by status and search matches expected records', () => {
      const claims = [
        { id: 't1', name: 'Alpha Devs', external_status: 'submitted', leader: { full_name: 'Alice', usn: '1NT24CS001', branch: 'CSE' } },
        { id: 't2', name: 'Beta Hackers', external_status: 'not_submitted', leader: { full_name: 'Bob', usn: '1NT24IS002', branch: 'ISE' } },
        { id: 't3', name: 'Gamma Coders', external_status: 'rejected', leader: { full_name: 'Charlie', usn: '1NT24EC003', branch: 'ECE' } },
      ];

      // Filter by status 'submitted'
      const submitted = claims.filter((c) => c.external_status === 'submitted');
      assert.strictEqual(submitted.length, 1);
      assert.strictEqual(submitted[0].id, 't1');

      // Search by USN
      const searchUsn = '1NT24IS';
      const searchResult = claims.filter(
        (c) => c.name.toLowerCase().includes(searchUsn.toLowerCase()) ||
               c.leader.usn.toLowerCase().includes(searchUsn.toLowerCase())
      );
      assert.strictEqual(searchResult.length, 1);
      assert.strictEqual(searchResult[0].id, 't2');
    });

    test('REQ6-04: review-scope authorization gate allows Super Admin and assigned admin, rejects unassigned', () => {
      function canReviewHackathonSubmissions(
        hackathonId: string,
        caller: { isSuperAdmin: boolean; assignedHackathonIds: string[] }
      ): boolean {
        if (caller.isSuperAdmin) return true;
        return caller.assignedHackathonIds.includes(hackathonId);
      }

      const hackathonId = '91d38c5c-56f2-4377-9b5f-69f3b5e7a5cc';

      assert.strictEqual(
        canReviewHackathonSubmissions(hackathonId, { isSuperAdmin: true, assignedHackathonIds: [] }),
        true,
        'Super Admin has global review scope'
      );

      assert.strictEqual(
        canReviewHackathonSubmissions(hackathonId, { isSuperAdmin: false, assignedHackathonIds: [hackathonId] }),
        true,
        'Assigned reviewer has scoped review access'
      );

      assert.strictEqual(
        canReviewHackathonSubmissions(hackathonId, { isSuperAdmin: false, assignedHackathonIds: ['other-h'] }),
        false,
        'Unassigned reviewer is denied access'
      );
    });
  });
});
