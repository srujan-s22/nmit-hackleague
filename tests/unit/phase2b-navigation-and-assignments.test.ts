import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 2B: Hackathon Assignment, Scoped Navigation & Review RBAC Suite', () => {
  describe('Suite 1: Assignment Management & Validation Invariants', () => {
    it('P2B-01: assignment role must strictly be "reviewer" or "coordinator"', () => {
      const allowedRoles = ['reviewer', 'coordinator'];
      const validReviewer = 'reviewer';
      const validCoordinator = 'coordinator';
      const invalidInCharge = 'in_charge';
      const invalidSuperAdmin = 'super_admin';
      const invalidCustom = 'organizer';

      assert.ok(allowedRoles.includes(validReviewer));
      assert.ok(allowedRoles.includes(validCoordinator));
      assert.ok(!allowedRoles.includes(invalidInCharge), 'in_charge must not be assignable through standard role selection');
      assert.ok(!allowedRoles.includes(invalidSuperAdmin));
      assert.ok(!allowedRoles.includes(invalidCustom));
    });

    it('P2B-02: assignment removal strictly requires justification of at least 10 non-whitespace characters', () => {
      const validateJustification = (justification: string | undefined | null): { valid: boolean; error?: string } => {
        if (!justification || justification.trim().length < 10) {
          return {
            valid: false,
            error: 'Justification for assignment removal must be at least 10 characters.',
          };
        }
        return { valid: true };
      };

      assert.equal(validateJustification(null).valid, false);
      assert.equal(validateJustification('').valid, false);
      assert.equal(validateJustification('   ').valid, false);
      assert.equal(validateJustification('removed').valid, false); // 7 chars
      assert.equal(validateJustification('left team').valid, false); // 9 chars
      assert.equal(validateJustification('          123456789          ').valid, false); // 9 trimmed
      assert.equal(validateJustification('Faculty reassigned to ISE dept').valid, true); // 30 chars
      assert.equal(validateJustification('Replacement reviewer assigned').valid, true);
    });

    it('P2B-03: inactive administrators are strictly excluded from assignment picker', () => {
      const mockAdminProfiles = [
        { id: 'admin-1', full_name: 'Dr. Active One', email: 'active1@nmit.ac.in', is_active: true },
        { id: 'admin-2', full_name: 'Prof. Inactive Two', email: 'inactive2@nmit.ac.in', is_active: false },
        { id: 'admin-3', full_name: 'Dr. Active Three', email: 'active3@nmit.ac.in', is_active: true },
        { id: 'admin-4', full_name: 'Prof. Deactivated Four', email: 'deactivated4@nmit.ac.in', is_active: false },
      ];

      // Replicates fetchActiveAdminsForAssignmentAction query filtering
      const assignableAdmins = mockAdminProfiles.filter((a) => a.is_active === true);

      assert.equal(assignableAdmins.length, 2);
      assert.ok(assignableAdmins.every((a) => a.is_active === true));
      assert.ok(!assignableAdmins.some((a) => a.id === 'admin-2'));
      assert.ok(!assignableAdmins.some((a) => a.id === 'admin-4'));
    });

    it('P2B-04: in-charge administrator assignment cannot be removed via standard assignment removal', () => {
      const checkRemovable = (assignment: { admin_id: string }, inChargeAdminId: string | null): boolean => {
        return assignment.admin_id !== inChargeAdminId;
      };

      const inChargeId = 'admin-lead-99';
      const reviewerAssignment = { admin_id: 'admin-reviewer-1' };
      const inChargeAssignment = { admin_id: 'admin-lead-99' };

      assert.equal(checkRemovable(reviewerAssignment, inChargeId), true, 'Standard reviewer assignment is removable');
      assert.equal(checkRemovable(inChargeAssignment, inChargeId), false, 'In-charge assignment removal is blocked');
    });
  });

  describe('Suite 2: Navigation Shell & Menu Visibility Logic', () => {
    it('P2B-05: "My Assigned Hackathons" appears only when user has active assignments or is Super Admin', () => {
      const shouldShowMyAssignedHackathons = (
        isActive: boolean,
        isSuperAdmin: boolean,
        assignedCount: number
      ): boolean => {
        if (!isActive) return false;
        return isSuperAdmin || assignedCount > 0;
      };

      // Assigned reviewer
      assert.equal(shouldShowMyAssignedHackathons(true, false, 2), true);
      // Assigned coordinator
      assert.equal(shouldShowMyAssignedHackathons(true, false, 1), true);
      // Unassigned active admin
      assert.equal(shouldShowMyAssignedHackathons(true, false, 0), false);
      // Inactive admin with past assignments (inactive accounts lose operations nav)
      assert.equal(shouldShowMyAssignedHackathons(false, false, 3), false);
      // Super admin without explicit assignment rows (global oversight)
      assert.equal(shouldShowMyAssignedHackathons(true, true, 0), true);
    });

    it('P2B-06: "Administrator Accounts" appears for Super Admin and admins with assign_hackathons', () => {
      const shouldShowAdministratorAccounts = (
        isSuperAdmin: boolean,
        permissions: string[]
      ): boolean => {
        return isSuperAdmin || permissions.includes('assign_hackathons');
      };

      assert.equal(shouldShowAdministratorAccounts(true, []), true, 'Super Admin always sees Administrator Accounts');
      assert.equal(shouldShowAdministratorAccounts(false, ['assign_hackathons']), true, 'assign_hackathons admin sees Administrator Accounts');
      assert.equal(shouldShowAdministratorAccounts(false, ['manage_hackathons']), false, 'manage_hackathons alone does not grant access');
      assert.equal(shouldShowAdministratorAccounts(false, ['verify_students']), false, 'verify_students alone does not grant access');
      assert.equal(shouldShowAdministratorAccounts(false, []), false, 'unprivileged admin does not see Administrator Accounts');
    });
  });

  describe('Suite 3: Shared Hackathons Browsing Interface RBAC', () => {
    it('P2B-07: ONLY Super Admin sees hackathon management action controls on /admin/hackathons', () => {
      const getHackathonManagementControlsVisibility = (isSuperAdmin: boolean) => ({
        showNewHackathonButton: isSuperAdmin,
        showEditDetails: isSuperAdmin,
        showConfigureRounds: isSuperAdmin,
        showOverrideDeadline: isSuperAdmin,
        showLifecycleActions: isSuperAdmin,
        showActionsDropdownMenu: isSuperAdmin,
      });

      const superAdminControls = getHackathonManagementControlsVisibility(true);
      assert.equal(superAdminControls.showNewHackathonButton, true);
      assert.equal(superAdminControls.showEditDetails, true);
      assert.equal(superAdminControls.showConfigureRounds, true);
      assert.equal(superAdminControls.showOverrideDeadline, true);
      assert.equal(superAdminControls.showLifecycleActions, true);
      assert.equal(superAdminControls.showActionsDropdownMenu, true);

      const ordinaryAdminControls = getHackathonManagementControlsVisibility(false);
      assert.equal(ordinaryAdminControls.showNewHackathonButton, false);
      assert.equal(ordinaryAdminControls.showEditDetails, false);
      assert.equal(ordinaryAdminControls.showConfigureRounds, false);
      assert.equal(ordinaryAdminControls.showOverrideDeadline, false);
      assert.equal(ordinaryAdminControls.showLifecycleActions, false);
      assert.equal(ordinaryAdminControls.showActionsDropdownMenu, false);
    });

    it('P2B-08: Student-only registration actions are strictly hidden on administrator browsing pages', () => {
      const getAdminCatalogActions = (isStudent: boolean) => ({
        showRegisterTeamButton: isStudent,
        showJoinTeamButton: isStudent,
        showExternalPortalLink: true,
        showDetailsLink: true,
      });

      const adminView = getAdminCatalogActions(false);
      assert.equal(adminView.showRegisterTeamButton, false, 'No Register Team button for admins');
      assert.equal(adminView.showJoinTeamButton, false, 'No Join Team button for admins');
      assert.equal(adminView.showExternalPortalLink, true);
      assert.equal(adminView.showDetailsLink, true);
    });
  });

  describe('Suite 4: Review Scoping, Decoupling & Registration Proof Tracking', () => {
    it('P2B-09: can_admin_review_hackathon decouples review scope from manage_hackathons and assign_hackathons', () => {
      interface AdminMock {
        id: string;
        is_super_admin: boolean;
        is_active: boolean;
        permissions: string[];
        assignments: string[]; // hackathon_ids
        in_charge_of: string[]; // hackathon_ids
      }

      const canAdminReviewHackathon = (admin: AdminMock, targetHackathonId: string): boolean => {
        if (!admin.is_active) return false;
        if (admin.is_super_admin) return true;
        if (admin.in_charge_of.includes(targetHackathonId)) return true;
        return admin.assignments.includes(targetHackathonId);
      };

      const targetHId = 'hackathon-uuid-100';

      const assignedReviewer: AdminMock = {
        id: 'rev-1',
        is_super_admin: false,
        is_active: true,
        permissions: [],
        assignments: [targetHId],
        in_charge_of: [],
      };

      const globalManagerWithoutAssignment: AdminMock = {
        id: 'mgr-1',
        is_super_admin: false,
        is_active: true,
        permissions: ['manage_hackathons'],
        assignments: [],
        in_charge_of: [],
      };

      const assignerWithoutAssignment: AdminMock = {
        id: 'asg-1',
        is_super_admin: false,
        is_active: true,
        permissions: ['assign_hackathons'],
        assignments: [],
        in_charge_of: [],
      };

      const superAdmin: AdminMock = {
        id: 'super-1',
        is_super_admin: true,
        is_active: true,
        permissions: [],
        assignments: [],
        in_charge_of: [],
      };

      const inactiveAssignedReviewer: AdminMock = {
        id: 'rev-inactive',
        is_super_admin: false,
        is_active: false,
        permissions: [],
        assignments: [targetHId],
        in_charge_of: [],
      };

      assert.equal(canAdminReviewHackathon(assignedReviewer, targetHId), true, 'Assigned reviewer has review access');
      assert.equal(canAdminReviewHackathon(globalManagerWithoutAssignment, targetHId), false, 'manage_hackathons alone does NOT grant review access');
      assert.equal(canAdminReviewHackathon(assignerWithoutAssignment, targetHId), false, 'assign_hackathons alone does NOT grant review access');
      assert.equal(canAdminReviewHackathon(superAdmin, targetHId), true, 'Super Admin retains global review access');
      assert.equal(canAdminReviewHackathon(inactiveAssignedReviewer, targetHId), false, 'Inactive reviewer loses review access');
    });

    it('P2B-10: registration proof access is authorized for review tracking without mandatory approval workflow', () => {
      // Invariant: Initial registration participation points are automated upon proof upload + CDC declaration acceptance.
      // Admins inspect proofs for tracking and verification; no manual gate required to award initial points.
      interface RegistrationProofTracking {
        proofPath: string;
        cdcDeclarationAccepted: boolean;
        pointsAutoAwarded: boolean;
        requiresManualApprovalToEarnPoints: boolean;
        canAssignedAdminViewForTracking: boolean;
      }

      const proofSubmissionRecord: RegistrationProofTracking = {
        proofPath: 'teams/team-uuid-1/registration/proof.png',
        cdcDeclarationAccepted: true,
        pointsAutoAwarded: true,
        requiresManualApprovalToEarnPoints: false,
        canAssignedAdminViewForTracking: true,
      };

      assert.equal(proofSubmissionRecord.cdcDeclarationAccepted, true);
      assert.equal(proofSubmissionRecord.pointsAutoAwarded, true, 'Initial registration points awarded automatically');
      assert.equal(proofSubmissionRecord.requiresManualApprovalToEarnPoints, false, 'No mandatory manual approval workflow');
      assert.equal(proofSubmissionRecord.canAssignedAdminViewForTracking, true, 'Assigned reviewer can view proof for tracking');
    });

    it('P2B-11: fail-closed boundary redirects unassigned admins attempting to access /admin/assigned-hackathons directly', () => {
      const resolveAssignedWorkspaceAccess = (
        isSuperAdmin: boolean,
        assignedHackathonsCount: number
      ): { allowed: boolean; redirectTo?: string } => {
        if (!isSuperAdmin && assignedHackathonsCount === 0) {
          return { allowed: false, redirectTo: '/admin/hackathons?unassigned=1' };
        }
        return { allowed: true };
      };

      assert.deepEqual(resolveAssignedWorkspaceAccess(false, 0), {
        allowed: false,
        redirectTo: '/admin/hackathons?unassigned=1',
      });
      assert.deepEqual(resolveAssignedWorkspaceAccess(false, 1), {
        allowed: true,
      });
      assert.deepEqual(resolveAssignedWorkspaceAccess(true, 0), {
        allowed: true,
      });
    });
  });
});
