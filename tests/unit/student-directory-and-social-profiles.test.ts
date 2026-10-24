import * as path from 'path';

// 1. Neutralize server-only package for standalone tsx test execution
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
} as unknown as NodeModule;

// 2. Import validation schemas and permission catalogs
const {
  validateLinkedInUrl,
  validateGitHubUrl,
  updateSocialLinksSchema,
} = require('../../src/lib/validation/profile-schemas');

const {
  CANONICAL_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  adminPermissionKeySchema,
} = require('../../src/lib/auth/permissions');

async function runStudentDirectoryAndSocialTests() {
  console.log('=== NMIT HackLeague: Student Directory & Professional Profiles Security Tests ===\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${name}`);
    }
  }

  // --------------------------------------------------------------------------
  // Suite 1: Permission Catalog & Schema Integrity
  // --------------------------------------------------------------------------
  console.log('[Suite 1: Permission Catalog & RBAC Definition]');

  assert(
    CANONICAL_PERMISSIONS.includes('view_student_data'),
    "'view_student_data' is registered in CANONICAL_PERMISSIONS"
  );

  assert(
    Boolean(PERMISSION_DEFINITIONS.view_student_data),
    "'view_student_data' has full metadata in PERMISSION_DEFINITIONS"
  );

  assert(
    PERMISSION_DEFINITIONS.view_student_data.label === 'Student Directory',
    "view_student_data has human-readable label 'Student Directory'"
  );

  const parsedValidKey = adminPermissionKeySchema.safeParse('view_student_data');
  assert(
    parsedValidKey.success === true && parsedValidKey.data === 'view_student_data',
    'adminPermissionKeySchema accepts view_student_data'
  );

  const parsedInvalidKey = adminPermissionKeySchema.safeParse('arbitrary_hacker_permission');
  assert(
    parsedInvalidKey.success === false,
    'adminPermissionKeySchema rejects unauthorized arbitrary permission string'
  );

  // --------------------------------------------------------------------------
  // Suite 2: Social Links URL Security & Strict Validation
  // --------------------------------------------------------------------------
  console.log('\n[Suite 2: Social Links URL Security & Strict Validation]');

  // LinkedIn Valid Cases
  const validLinkedIn1 = validateLinkedInUrl('https://linkedin.com/in/srujan-s');
  assert(validLinkedIn1.isValid === true && validLinkedIn1.normalized === 'https://linkedin.com/in/srujan-s', 'Standard HTTPS LinkedIn URL is accepted and normalized');

  const validLinkedIn2 = validateLinkedInUrl('https://www.linkedin.com/in/john_doe-123/');
  assert(validLinkedIn2.isValid === true && validLinkedIn2.normalized === 'https://www.linkedin.com/in/john_doe-123', 'Trailing slash is stripped and normalized');

  const validLinkedIn3 = validateLinkedInUrl('https://in.linkedin.com/in/nmit-student');
  assert(validLinkedIn3.isValid === true, 'Regional LinkedIn subdomain (in.linkedin.com) is accepted');

  const validLinkedInCompany = validateLinkedInUrl('https://www.linkedin.com/company/nmit-hackleague');
  assert(validLinkedInCompany.isValid === true && validLinkedInCompany.normalized === 'https://www.linkedin.com/company/nmit-hackleague', 'LinkedIn company URL is accepted');

  // LinkedIn Invalid / Attack Vectors
  const deceptiveLinkedIn = validateLinkedInUrl('https://linkedin.com.attacker.com/in/fake');
  assert(deceptiveLinkedIn.isValid === false, 'Deceptive attacker domain (linkedin.com.attacker.com) is rejected');

  const httpLinkedIn = validateLinkedInUrl('http://linkedin.com/in/insecure');
  assert(httpLinkedIn.isValid === false && httpLinkedIn.error?.includes('HTTPS'), 'Plain HTTP LinkedIn URL is rejected');

  const credentialsLinkedIn = validateLinkedInUrl('https://user:pass@linkedin.com/in/victim');
  assert(credentialsLinkedIn.isValid === false && credentialsLinkedIn.error?.includes('Credentials'), 'Embedded credentials in LinkedIn URL are rejected');

  const portLinkedIn = validateLinkedInUrl('https://linkedin.com:8080/in/victim');
  assert(portLinkedIn.isValid === false && portLinkedIn.error?.includes('port'), 'Explicit port in LinkedIn URL is rejected');

  const javascriptLinkedIn = validateLinkedInUrl('javascript:alert(1)');
  assert(javascriptLinkedIn.isValid === false, 'JavaScript pseudo-protocol injection is rejected');

  // GitHub Valid Cases
  const validGitHub1 = validateGitHubUrl('https://github.com/torvalds');
  assert(validGitHub1.isValid === true && validGitHub1.normalized === 'https://github.com/torvalds', 'Standard HTTPS GitHub profile URL is accepted');

  const validGitHub2 = validateGitHubUrl('https://www.github.com/octocat/');
  assert(validGitHub2.isValid === true && validGitHub2.normalized === 'https://github.com/octocat', 'www.github.com is normalized to https://github.com/username');

  // GitHub Invalid / Attack Vectors
  const deceptiveGitHub = validateGitHubUrl('https://github.com.evil.com/fake');
  assert(deceptiveGitHub.isValid === false, 'Deceptive attacker domain (github.com.evil.com) is rejected');

  const reservedGitHub = validateGitHubUrl('https://github.com/settings');
  assert(reservedGitHub.isValid === false && reservedGitHub.error?.includes('reserved'), 'Reserved system path (https://github.com/settings) is rejected');

  const deepPathGitHub = validateGitHubUrl('https://github.com/octocat/my-repo');
  assert(deepPathGitHub.isValid === false && deepPathGitHub.error?.includes('user profile'), 'Repository subpath (not a user profile) is rejected');

  const httpGitHub = validateGitHubUrl('http://github.com/insecure');
  assert(httpGitHub.isValid === false && httpGitHub.error?.includes('HTTPS'), 'Plain HTTP GitHub URL is rejected');

  // Null / Blank Normalization & Clearing
  const clearLinkedIn = validateLinkedInUrl('');
  assert(clearLinkedIn.isValid === true && clearLinkedIn.normalized === null, 'Empty string for LinkedIn URL normalizes to null (clears field)');

  const nullGitHub = validateGitHubUrl(null);
  assert(nullGitHub.isValid === true && nullGitHub.normalized === null, 'null for GitHub URL normalizes to null');

  // --------------------------------------------------------------------------
  // Suite 3: updateSocialLinksSchema Independent Updates & Preservation
  // --------------------------------------------------------------------------
  console.log('\n[Suite 3: Independent Social Links Update & Preservation]');

  // Update only LinkedIn
  const onlyLinkedIn = updateSocialLinksSchema.safeParse({
    linkedin_url: 'https://linkedin.com/in/srujan',
  });
  assert(
    onlyLinkedIn.success === true &&
      onlyLinkedIn.data.linkedin_url === 'https://linkedin.com/in/srujan' &&
      onlyLinkedIn.data.github_url === undefined,
    'Updating only LinkedIn leaves github_url undefined (preserves existing database value)'
  );

  // Clear LinkedIn while updating GitHub
  const clearLinkedInUpdateGitHub = updateSocialLinksSchema.safeParse({
    linkedin_url: '',
    github_url: 'https://github.com/srujan',
  });
  assert(
    clearLinkedInUpdateGitHub.success === true &&
      clearLinkedInUpdateGitHub.data.linkedin_url === null &&
      clearLinkedInUpdateGitHub.data.github_url === 'https://github.com/srujan',
    'Blank string clears linkedin_url to null while updating github_url'
  );

  // --------------------------------------------------------------------------
  // Suite 4: Directory Actions Security & Phone Masking
  // --------------------------------------------------------------------------
  console.log('\n[Suite 4: Server Action Permission Gating & PII Redaction]');

  // Mocking database & auth context
  let mockCurrentAdmin: any = null;
  let mockCurrentPermissions: string[] = [];

  const guardsPath = require.resolve('../../src/lib/auth/guards');
  require.cache[guardsPath] = {
    id: guardsPath,
    filename: guardsPath,
    loaded: true,
    exports: {
      requireAdmin: async () => {
        if (!mockCurrentAdmin) {
          throw new Error('Unauthorized');
        }
        return {
          admin: mockCurrentAdmin,
          permissions: mockCurrentPermissions,
        };
      },
    },
  } as unknown as NodeModule;

  // Mock student profiles in DB
  const mockDbStudents = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'Approved Student Alpha',
      usn: '1NT22CS001',
      email: 'alpha@nmit.ac.in',
      phone: '+919876543210',
      branch: 'CSE',
      academic_year: 3,
      registration_status: 'approved',
      college_id_path: '11111111-1111-4111-8111-111111111111/id.pdf',
      profile_photo_path: '11111111-1111-4111-8111-111111111111/avatar.png',
      linkedin_url: 'https://linkedin.com/in/alpha',
      github_url: 'https://github.com/alpha',
      created_at: new Date().toISOString(),
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      full_name: 'Unverified Student Beta',
      usn: '1NT22CS002',
      email: 'beta@nmit.ac.in',
      phone: '+919876543211',
      branch: 'ISE',
      academic_year: 2,
      registration_status: 'under_review', // NOT approved!
      college_id_path: '22222222-2222-4222-8222-222222222222/id.pdf',
      profile_photo_path: null,
      linkedin_url: null,
      github_url: null,
      created_at: new Date().toISOString(),
    },
  ];

  const adminClientPath = require.resolve('../../src/lib/supabase/admin');
  require.cache[adminClientPath] = {
    id: adminClientPath,
    filename: adminClientPath,
    loaded: true,
    exports: {
      createAdminClient: () => ({
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: (cols: string, opts?: any) => {
                let filtered = [...mockDbStudents];
                const chain = {
                  eq: (col: string, val: any) => {
                    filtered = filtered.filter((s: any) => s[col] === val);
                    return chain;
                  },
                  or: (_condition: string) => chain,
                  order: (_col: string, _opts: any) => chain,
                  range: (_from: number, _to: number) => chain,
                  single: async () => ({
                    data: filtered[0] || null,
                    error: filtered.length > 0 ? null : new Error('Row not found'),
                  }),
                  then: (resolve: any) =>
                    resolve({
                      data: filtered,
                      count: filtered.length,
                      error: null,
                    }),
                };
                return chain;
              },
            };
          }
          if (table === 'points_ledger') {
            return {
              select: () => ({
                in: async () => ({
                  data: [{ student_id: '11111111-1111-4111-8111-111111111111', points: 150 }],
                  error: null,
                }),
              }),
            };
          }
          if (table === 'team_members') {
            return {
              select: () => ({
                eq: async () => ({
                  data: [{ team_id: 'team-1', hackathon_id: 'hack-1', role: 'leader' }],
                  error: null,
                }),
              }),
            };
          }
          if (table === 'teams') {
            return {
              select: () => ({
                in: async () => ({
                  data: [{ id: 'team-1', name: 'Alpha Hackers', internal_status: 'verified', external_status: 'active' }],
                  error: null,
                }),
              }),
            };
          }
          if (table === 'hackathons') {
            return {
              select: () => ({
                in: async () => ({
                  data: [{ id: 'hack-1', title: 'NMIT Hacks 2026', slug: 'nmit-hacks-2026', status: 'active' }],
                  error: null,
                }),
              }),
            };
          }
          return {};
        },
      }),
    },
  } as unknown as NodeModule;

  const pathsPath = require.resolve('../../src/lib/storage/paths');
  require.cache[pathsPath] = {
    id: pathsPath,
    filename: pathsPath,
    loaded: true,
    exports: {
      getSignedPreviewUrlWithClient: async () => ({
        success: true,
        url: 'https://signed.storage.preview/avatar.png',
      }),
    },
  } as unknown as NodeModule;

  const pointsQueriesPath = require.resolve('../../src/lib/points/leaderboard-queries');
  require.cache[pointsQueriesPath] = {
    id: pointsQueriesPath,
    filename: pointsQueriesPath,
    loaded: true,
    exports: {
      getStudentPointsSummary: async () => ({
        data: { total_points: 150, rank: 1, verified_qualifications_count: 1, submitted_claims_count: 1 },
      }),
    },
  } as unknown as NodeModule;

  const directoryActions = require('../../src/actions/student-directory-actions');

  // Test 4a: Super Admin access works without explicit permission row
  mockCurrentAdmin = { id: 'super-admin-uuid', is_super_admin: true, is_active: true };
  mockCurrentPermissions = []; // No explicit row
  const superAdminList = await directoryActions.getStudentDirectoryAction({});
  assert(
    superAdminList.success === true && superAdminList.students.length === 1,
    'Super Admin can access student directory without explicit permission row'
  );

  // Test 4b: Admin with 'view_student_data' can access directory
  mockCurrentAdmin = { id: 'admin-uuid', is_super_admin: false, is_active: true };
  mockCurrentPermissions = ['view_student_data'];
  const authorizedAdminList = await directoryActions.getStudentDirectoryAction({});
  assert(
    authorizedAdminList.success === true && authorizedAdminList.students.length === 1,
    "Admin with 'view_student_data' can access student directory"
  );

  // Test 4c: Admin WITHOUT 'view_student_data' is denied
  mockCurrentAdmin = { id: 'unauthorized-admin-uuid', is_super_admin: false, is_active: true };
  mockCurrentPermissions = ['manage_hackathons']; // does not have view_student_data
  const unauthorizedAdminList = await directoryActions.getStudentDirectoryAction({});
  assert(
    unauthorizedAdminList.success === false && unauthorizedAdminList.error?.includes('Access denied'),
    "Admin without 'view_student_data' is denied access to student directory"
  );

  // Test 4d: Unauthenticated caller is denied
  mockCurrentAdmin = null;
  mockCurrentPermissions = [];
  const unauthList = await directoryActions.getStudentDirectoryAction({});
  assert(
    unauthList.success === false,
    'Unauthenticated caller is rejected from student directory'
  );

  // Test 4e: Directory listings NEVER return phone numbers or private storage paths
  mockCurrentAdmin = { id: 'admin-uuid', is_super_admin: false, is_active: true };
  mockCurrentPermissions = ['view_student_data'];
  const testListResponse = await directoryActions.getStudentDirectoryAction({});
  const returnedStudent = testListResponse.students[0];

  assert(
    returnedStudent !== undefined,
    'Directory returned approved student'
  );
  assert(
    !('phone' in returnedStudent),
    'CRITICAL: Directory response object does NOT contain the phone property'
  );
  assert(
    !('college_id_path' in returnedStudent),
    'Directory response object does NOT contain college_id_path'
  );
  assert(
    !('profile_photo_path' in returnedStudent),
    'Directory response object does NOT expose raw profile_photo_path'
  );
  assert(
    returnedStudent.avatar_url === 'https://signed.storage.preview/avatar.png',
    'Directory returns safe signed preview URL instead of raw storage path'
  );

  // Test 4f: Unverified/under-review student does NOT appear in directory
  const containsBeta = testListResponse.students.some((s: any) => s.usn === '1NT22CS002');
  assert(
    containsBeta === false,
    'Under review / non-approved student (1NT22CS002) is strictly filtered out of directory'
  );

  // Test 4g: Detail view includes phone number only for authorized requests
  const detailResponse = await directoryActions.getStudentDetailAction('11111111-1111-4111-8111-111111111111');
  assert(
    detailResponse.success === true && detailResponse.data?.phone === '+919876543210',
    'Detail response contains verified phone number for authorized admin'
  );
  assert(
    !('college_id_path' in (detailResponse.data || {})),
    'Detail response excludes private college_id_path'
  );

  // Test 4h: Unauthorized admin denied from detail view
  mockCurrentAdmin = { id: 'unauthorized-admin', is_super_admin: false, is_active: true };
  mockCurrentPermissions = [];
  const unauthorizedDetail = await directoryActions.getStudentDetailAction('11111111-1111-4111-8111-111111111111');
  assert(
    unauthorizedDetail.success === false && unauthorizedDetail.error?.includes('Access denied'),
    "Unauthorized admin cannot call getStudentDetailAction directly"
  );

  // Test 4i: Non-approved student cannot be retrieved via detail action
  mockCurrentAdmin = { id: 'admin-uuid', is_super_admin: false, is_active: true };
  mockCurrentPermissions = ['view_student_data'];
  const unapprovedDetail = await directoryActions.getStudentDetailAction('22222222-2222-4222-8222-222222222222');
  assert(
    unapprovedDetail.success === false && unapprovedDetail.error?.includes('not found'),
    'Non-approved student cannot be queried via getStudentDetailAction'
  );

  // --------------------------------------------------------------------------
  // Suite 5: Profile Photo Fail-Closed Verification
  // --------------------------------------------------------------------------
  console.log('\n[Suite 5: Post-Onboarding Profile Photo Actions Remain Disabled]');

  const profileActions = require('../../src/actions/profile-actions');
  const uploadPhotoRes = await profileActions.uploadProfilePhotoAction();
  assert(
    uploadPhotoRes.success === false && uploadPhotoRes.error?.includes('removed'),
    'profile-actions uploadProfilePhotoAction remains strictly disabled'
  );

  const removePhotoRes = await profileActions.removeProfilePhotoAction();
  assert(
    removePhotoRes.success === false && removePhotoRes.error?.includes('removed'),
    'profile-actions removeProfilePhotoAction remains strictly disabled'
  );

  console.log('\n========================================');
  console.log(`Test Results: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('========================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runStudentDirectoryAndSocialTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
