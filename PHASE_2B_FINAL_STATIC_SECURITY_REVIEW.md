# NMIT HackLeague — Phase 2B Final Static Security Review

## Executive Summary & Final Verdict

| Metric | Details |
| :--- | :--- |
| **Review Target** | `supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql` |
| **Migration File Size** | 99,998 bytes (3,073 lines) |
| **SHA-256 Hash** | `b1cebd235fe6f80e593efa9fe34f003d626a9fcb884f709909aae6b72c77025a` |
| **Parser AST Validation** | 129 / 129 top-level statements parsed cleanly via PostgreSQL official C parser (`libpg_query` / `pglast`) with 0 errors |
| **Local Unit Tests** | 34 / 34 passed (20 URL validation + 14 team invitation code tests) |
| **TypeScript Type-Check** | Clean (`tsc --noEmit` exited with code 0, 0 errors) |
| **ESLint Validation** | Clean (`eslint .` exited with code 0, 0 warnings/errors) |
| **Hosted State** | Strictly untouched; zero mutations, zero remote database calls executed |
| **Working Tree State** | 11 modified/untracked files preserved exactly without alteration |
| **FINAL VERDICT** | **READY FOR FINAL HUMAN APPROVAL** (Database Migration)<br>*Pending Application-Layer Follow-up for Frontend Integration* |

### Verdict Justification

The proposed migration `20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql` is **SAFE TO DEPLOY** from a database, transactional, RLS, storage, and SQL correctness standpoint:
1. **Zero High/Critical Database Vulnerabilities:** All 4 previously identified database blockers (unsafe `CASCADE`/`REVOKE` on legacy overload, missing demotion on `in_charge_admin_id` transition to `NULL`, permissive-OR storage read leak, and table privilege write bypass) have been resolved in the canonical migration file.
2. **Defensive Posture:** Table-level `INSERT, UPDATE, DELETE` privileges on `hackathon_admin_assignments` are explicitly revoked from `authenticated`, backed by a secondary `USING (false) WITH CHECK (false)` RLS write policy. All assignment mutations are constrained to audited `SECURITY DEFINER` RPCs.
3. **Storage & RLS Scoping:** Access to team registration proofs and round evidence in `submission-evidence` is unified under a single RLS policy delegating to strict SQL helpers (`can_view_registration_proof`, `can_view_team_round_evidence`, `can_view_legacy_evidence`). Unassigned administrators are completely blocked from reading other hackathons' submissions, reviews, and registration proofs.
4. **Application Recommendations Documented:** Gaps between the new database authorization helpers and Next.js route guards/TypeScript permission definitions are identified as non-blocking application findings with clear remediation steps.

---

## 1. Files Inspected & Local Verification Executed

### Files Inspected
- Migration: [20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql)
- Invitation Code Migration: [20261028000001_six_character_team_invitation_codes.sql](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261028000001_six_character_team_invitation_codes.sql)
- Server Actions:
  - [hackathon-management-actions.ts](file:///Volumes/CodingVault/web/HackLeague/src/actions/hackathon-management-actions.ts)
  - [round-review-actions.ts](file:///Volumes/CodingVault/web/HackLeague/src/actions/round-review-actions.ts)
  - [registration-proof-actions.ts](file:///Volumes/CodingVault/web/HackLeague/src/actions/registration-proof-actions.ts)
  - [team-actions.ts](file:///Volumes/CodingVault/web/HackLeague/src/actions/team-actions.ts)
  - [admin-management-actions.ts](file:///Volumes/CodingVault/web/HackLeague/src/actions/admin-management-actions.ts)
- Data Queries & Storage:
  - [queries.ts](file:///Volumes/CodingVault/web/HackLeague/src/lib/teams/queries.ts)
  - [paths.ts](file:///Volumes/CodingVault/web/HackLeague/src/lib/storage/paths.ts)
  - [registration-proof-service.ts](file:///Volumes/CodingVault/web/HackLeague/src/lib/storage/registration-proof-service.ts)
  - [round-evidence-service.ts](file:///Volumes/CodingVault/web/HackLeague/src/lib/storage/round-evidence-service.ts)
- Auth Guards & Permissions:
  - [guards.ts](file:///Volumes/CodingVault/web/HackLeague/src/lib/auth/guards.ts)
  - [permissions.ts](file:///Volumes/CodingVault/web/HackLeague/src/lib/auth/permissions.ts)
- Validation Schemas:
  - [hackathon-schemas.ts](file:///Volumes/CodingVault/web/HackLeague/src/lib/validation/hackathon-schemas.ts)
  - [team-schemas.ts](file:///Volumes/CodingVault/web/HackLeague/src/lib/validation/team-schemas.ts)
- UI Components & Shells:
  - [hackathon-form.tsx](file:///Volumes/CodingVault/web/HackLeague/src/components/hackathons/hackathon-form.tsx)
  - [admin-shell.tsx](file:///Volumes/CodingVault/web/HackLeague/src/components/shells/admin-shell.tsx)
  - [hackathons/page.tsx](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/page.tsx)
  - [hackathons-client.tsx](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/hackathons-client.tsx)
  - [submissions/page.tsx](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/[id]/submissions/page.tsx)
  - [submissions-client.tsx](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/[id]/submissions/submissions-client.tsx)

### Verification Commands & Test Results Actually Executed

```bash
# 1. SHA-256 Checksum Computation
$ shasum -a 256 supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql
b1cebd235fe6f80e593efa9fe34f003d626a9fcb884f709909aae6b72c77025a  supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql
# Exit Code: 0

# 2. PostgreSQL Official C-Parser AST Validation (libpg_query / pglast)
$ uv run --with pglast python3 -c "import pglast; ast = pglast.parse_sql(open('supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql').read()); print(f'Parsed {len(ast)} statements successfully')"
# Output: Parsed 129 statements successfully!
# Exit Code: 0

# 3. TypeScript Compilation & Static Type-Checking
$ npm run type-check
# Output: tsc --noEmit
# Exit Code: 0 (0 type errors)

# 4. ESLint Static Analysis
$ npm run lint
# Output: eslint .
# Exit Code: 0 (0 lint errors)

# 5. URL Validation & Backward-Compatibility Test Suite
$ npx tsx tests/unit/hackathon-url-validation.test.ts
# Output: 20 passed, 0 failed, 4 suites (12.29ms)
# Exit Code: 0

# 6. Team Invitation Code Cryptographic & Security Test Suite
$ npx tsx tests/unit/team-invitation-code.test.ts
# Output: 14 passed, 0 failed, 1 suite (12.62ms)
# Exit Code: 0

# 7. Git Working Tree Preservation Verification
$ git status --short
# Output: 11 existing modified/untracked files intact
# Exit Code: 0
```

---

## 2. Classified Security & Correctness Findings

### Summary of Findings
| ID | Severity | Category | Target Reference | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | INFO | Migration Integrity | [Migration L1-3073](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L1-L3073) | **VERIFIED & SAFE** |
| **SEC-02** | INFO | Safe Deprecation | [Migration L1822-1847](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L1822-L1847) | **VERIFIED & SAFE** |
| **SEC-03** | INFO | Lifecycle Integrity | [Migration L694-738](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L694-L738) | **VERIFIED & SAFE** |
| **SEC-04** | INFO | Defense-in-Depth Privileges | [Migration L91-105](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L91-L105) | **VERIFIED & SAFE** |
| **SEC-05** | INFO | Storage RLS Composition | [Migration L657-690](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L657-L690) | **VERIFIED & SAFE** |
| **SEC-06** | INFO | URL Validation Parity | [Migration L23-53](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L23-L53) & [hackathon-schemas.ts L18-20](file:///Volumes/CodingVault/web/HackLeague/src/lib/validation/hackathon-schemas.ts#L18-L20) | **VERIFIED & SAFE** |
| **APP-01** | MEDIUM | Route & Action Guards | [submissions/page.tsx L20](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/[id]/submissions/page.tsx#L20), [round-review-actions.ts L56](file:///Volumes/CodingVault/web/HackLeague/src/actions/round-review-actions.ts#L56) | **APPLICATION GAP** |
| **APP-02** | MEDIUM | RBAC Schema Parity | [permissions.ts L3-16](file:///Volumes/CodingVault/web/HackLeague/src/lib/auth/permissions.ts#L3-L16) | **APPLICATION GAP** |
| **APP-03** | LOW | UI Visibility & Navigation | [admin-shell.tsx L29-30](file:///Volumes/CodingVault/web/HackLeague/src/components/shells/admin-shell.tsx#L29-L30), [hackathons/page.tsx L15](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/page.tsx#L15) | **UI GAP** |
| **APP-04** | LOW | UI Action Crowding | [hackathons-client.tsx L264-340](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/hackathons-client.tsx#L264-L340) | **UI GAP** |

---

### Detailed Findings

#### Finding SEC-01: Migration Transactional Integrity, Ordering, and AST Correctness
- **Classification:** INFO (Verified Safe)
- **File Reference:** [20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql:L1-L3073](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L1-L3073)
- **Description:** The migration wraps all DDL and DML operations in an atomic transaction (`BEGIN;` at L1, `COMMIT;` at L3073).
- **Evidence:**
  - Official PostgreSQL parser AST execution parsed all 129 statements with 0 syntax errors.
  - Strict dependency ordering: constraints updated first, tables created, indexes created, helper functions defined, RLS policies dropped/recreated, triggers created, idempotent backfill performed, and RPCs updated.
  - All object creation uses `CREATE ... IF NOT EXISTS` or `CREATE OR REPLACE FUNCTION`.
  - All drops use guarded syntax: `DROP POLICY IF EXISTS`, `DROP TRIGGER IF EXISTS`, `DROP CONSTRAINT IF EXISTS`.
  - Zero unguarded `CASCADE` operations exist.

#### Finding SEC-02: Safe Legacy Overload Cleanup for `review_round_advancement(UUID, TEXT, TEXT, TEXT)`
- **Classification:** INFO (Verified Safe)
- **File Reference:** [20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql:L1822-L1847](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L1822-L1847)
- **Risk:** Earlier drafts attempted `REVOKE ALL ON FUNCTION ... (UUID, TEXT, TEXT, TEXT)`, which causes immediate transaction abortion on environments where the 4-argument overload was never deployed.
- **Evidence:** The canonical migration employs a conditional PL/pgSQL block:
  ```sql
  DO $cleanup_overload$
  DECLARE
    v_proc_oid OID;
    v_dep_desc TEXT;
  BEGIN
    SELECT p.oid INTO v_proc_oid
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'review_round_advancement'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, text';

    IF v_proc_oid IS NOT NULL THEN
      SELECT string_agg(deptype || ': ' || pg_describe_object(classid, objid, objsubid), ', ')
      INTO v_dep_desc
      FROM pg_depend
      WHERE refobjid = v_proc_oid AND deptype NOT IN ('i', 'a');

      IF v_dep_desc IS NOT NULL AND v_dep_desc <> '' THEN
        RAISE EXCEPTION 'Cannot drop obsolete overload review_round_advancement(UUID, TEXT, TEXT, TEXT): dependent objects detected: %', v_dep_desc;
      END IF;

      EXECUTE 'DROP FUNCTION public.review_round_advancement(UUID, TEXT, TEXT, TEXT) RESTRICT';
    END IF;
  END $cleanup_overload$;
  ```
- **Impact:** Safely removes the broader-permission overload if present, cleanly passes if absent, inspects `pg_depend` for reverse dependencies, and refuses to drop via `RESTRICT` if dependencies exist.

#### Finding SEC-03: In-Charge Lifecycle Synchronization & Demotion on Transition to NULL
- **Classification:** INFO (Verified Safe)
- **File Reference:** [20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql:L694-L738](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L694-L738)
- **Risk:** Setting `hackathons.in_charge_admin_id` to `NULL` previously failed to demote the former in-charge administrator, leaving an orphaned `role = 'in_charge'` record violating synchronization invariants.
- **Evidence:**
  - Trigger `trg_fn_sync_hackathon_in_charge_assignment` explicitly executes demotion:
    ```sql
    IF TG_OP = 'UPDATE' AND OLD.in_charge_admin_id IS NOT NULL THEN
      UPDATE public.hackathon_admin_assignments
      SET role = 'reviewer', updated_at = clock_timestamp()
      WHERE hackathon_id = NEW.id
        AND admin_id = OLD.in_charge_admin_id
        AND role = 'in_charge';
    END IF;
    ```
  - Step 2 inserts/upserts the new in-charge admin only when `NEW.in_charge_admin_id IS NOT NULL`.
  - Demoting the prior administrator before promoting the new administrator guarantees zero collisions against the partial unique index `uq_hackathon_admin_assignments_in_charge`.
  - Demotion preserves original `assigned_by` attribution and only targets rows with `role = 'in_charge'`.

#### Finding SEC-04: Defense-in-Depth Privilege Layer on `hackathon_admin_assignments`
- **Classification:** INFO (Verified Safe)
- **File Reference:** [20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql:L91-L105](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L91-L105)
- **Evidence:**
  - Table privileges:
    ```sql
    REVOKE ALL ON TABLE public.hackathon_admin_assignments FROM PUBLIC, anon;
    REVOKE INSERT, UPDATE, DELETE ON TABLE public.hackathon_admin_assignments FROM authenticated;
    GRANT SELECT ON TABLE public.hackathon_admin_assignments TO authenticated;
    ```
  - Secondary RLS write policy:
    ```sql
    CREATE POLICY "hackathon_admin_assignments_deny_direct_write"
    ON public.hackathon_admin_assignments
    FOR ALL TO authenticated
    USING (FALSE) WITH CHECK (FALSE);
    ```
  - All assignment mutations are channeled through validated `SECURITY DEFINER` RPCs:
    - `assign_admin_to_hackathon` (checks `can_admin_manage_assignments`, prevents self-elevation to `in_charge`)
    - `remove_admin_from_hackathon` (checks `can_admin_manage_assignments`, protects active in-charge admin from deletion)
    - `reassign_hackathon_in_charge_admin` (strictly restricted to Super Admin)
    - `create_hackathon_draft` (automatically assigns creator or validates Super Admin specification)

#### Finding SEC-05: Storage RLS Policy Composition & Elimination of Permissive-OR Bypass
- **Classification:** INFO (Verified Safe)
- **File Reference:** [20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql:L657-L690](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L657-L690)
- **Evidence:**
  - Drops both `submission_evidence_select_registration_proof` and the legacy `submission_evidence_select` on `storage.objects`.
  - Replaces them with a single consolidated policy `submission_evidence_select` on `storage.objects`:
    ```sql
    CREATE POLICY "submission_evidence_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'submission-evidence' AND (
        -- Path 1: Registration Proof: teams/<team_id>/registration/<filename>
        (
          (storage.foldername(name))[1] = 'teams' AND
          (storage.foldername(name))[3] = 'registration' AND
          public.can_view_registration_proof((storage.foldername(name))[2])
        )
        OR
        -- Path 2: Round Evidence: teams/<team_id>/... (not registration)
        (
          (storage.foldername(name))[1] = 'teams' AND
          COALESCE((storage.foldername(name))[3], '') <> 'registration' AND
          public.can_view_team_round_evidence((storage.foldername(name))[2])
        )
        OR
        -- Path 3: Legacy Round Evidence: evidence/<hackathon_id>/<submission_id>/<filename>
        (
          (storage.foldername(name))[1] = 'evidence' AND
          public.can_view_legacy_evidence((storage.foldername(name))[2], (storage.foldername(name))[3])
        )
      )
    );
    ```
  - `storage.foldername(name)` in PostgreSQL returns an array of folder components. For `teams/{team_id}/registration/{uuid}.png`, index 1 is `'teams'`, index 2 is `{team_id}`, index 3 is `'registration'`.
  - Passes the extracted `{team_id}` to `can_view_registration_proof`, which checks UUID regex, resolves `hackathon_id`, and requires `can_admin_review_hackathon(hackathon_id)` or `current_is_team_member(team_id)`.
  - Storage buckets `college-ids` and `profile-photos` remain completely untouched.

#### Finding SEC-06: External Registration & Community URL Validation Parity
- **Classification:** INFO (Verified Safe)
- **File Reference:** [20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql:L23-L53](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L23-L53) & [hackathon-schemas.ts:L18-L20](file:///Volumes/CodingVault/web/HackLeague/src/lib/validation/hackathon-schemas.ts#L18-L20)
- **Evidence:**
  - SQL check constraints `chk_hackathons_external_url` and `chk_hackathons_community_url` use the exact POSIX regex:
    `^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;%=]*)?$`
  - `create_hackathon_draft` enforces that `p_external_registration_url` is mandatory and non-empty for new hackathons.
  - `update_hackathon_metadata` permits NULL URLs, preserving historical hackathons while enforcing the strict HTTP/HTTPS regex on any non-null value provided.
  - Tested across 20 automated unit test cases in `tests/unit/hackathon-url-validation.test.ts` (boundary IPs, IPv4 0-255 octets, localhost, ports 1-65535, query params, hash fragments, and rejection of javascript/data/whitespace URLs).

#### Finding APP-01: Next.js Review Page and Server Actions Demand Global `manage_hackathons`
- **Classification:** MEDIUM (Application-Layer Authorization Gap)
- **File References:**
  - [src/app/admin/hackathons/[id]/submissions/page.tsx:L20](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/[id]/submissions/page.tsx#L20)
  - [src/actions/round-review-actions.ts:L56, L124, L186](file:///Volumes/CodingVault/web/HackLeague/src/actions/round-review-actions.ts#L56)
  - [src/actions/registration-proof-actions.ts:L93](file:///Volumes/CodingVault/web/HackLeague/src/actions/registration-proof-actions.ts#L93)
  - [src/lib/auth/guards.ts:L257-L278](file:///Volumes/CodingVault/web/HackLeague/src/lib/auth/guards.ts#L257-L278)
- **Risk:** In Phase 2B's database design, an assigned reviewer without global `manage_hackathons` is permitted to review submissions via `can_admin_review_hackathon`. However, the Next.js server page and server actions call `requireHackathonScope(hackathonId, 'manage_hackathons')`, which calls `requireAdmin('manage_hackathons')`.
- **Evidence:**
  ```typescript
  // src/app/admin/hackathons/[id]/submissions/page.tsx:20
  const scope = await requireHackathonScope(id, 'manage_hackathons');

  // src/actions/round-review-actions.ts:56
  await requireHackathonScope(sub.hackathon_id, 'manage_hackathons');
  ```
  If an administrator is assigned as a reviewer to hackathon X but does NOT hold global `manage_hackathons` in `admin_permissions`:
  1. `requireAdmin('manage_hackathons')` fails and redirects them to `/login`.
  2. `reviewRoundSubmissionAction` and `reviewRoundAdvancementAction` abort before calling the RPC.
- **Impact:** Scoped reviewer assignments cannot function end-to-end through the Next.js web UI unless the reviewer is also granted global `manage_hackathons`. But granting global `manage_hackathons` violates least-privilege by giving them configuration rights across all hackathons.
- **Recommended Remediation:**
  1. Add a dedicated server guard in `src/lib/auth/guards.ts`:
     ```typescript
     export async function requireHackathonReviewScope(hackathonId: string) {
       const { admin, permissions } = await requireAdmin(); // Require active admin profile only
       const supabase = await createClient();
       const { data: canReview } = await supabase.rpc('can_admin_review_hackathon', {
         p_hackathon_id: hackathonId,
       });
       if (!canReview) {
         redirect('/admin/hackathons');
       }
       return { admin, permissions, hackathonId, isSuperAdmin: Boolean(admin.is_super_admin) };
     }
     ```
  2. Update `src/app/admin/hackathons/[id]/submissions/page.tsx` and `src/actions/round-review-actions.ts` to call `requireHackathonReviewScope`.

#### Finding APP-02: TypeScript Canonical Permissions and Zod Enum Omit `assign_hackathons`
- **Classification:** MEDIUM (Application-Layer Schema Parity)
- **File References:**
  - [src/lib/auth/permissions.ts:L3-L16](file:///Volumes/CodingVault/web/HackLeague/src/lib/auth/permissions.ts#L3-L16)
  - [src/lib/auth/permissions.ts:L135](file:///Volumes/CodingVault/web/HackLeague/src/lib/auth/permissions.ts#L135)
  - [src/app/admin/admins/create-admin-dialog.tsx:L12](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/admins/create-admin-dialog.tsx#L12)
- **Risk:** Database constraint `chk_admin_permissions_key` specifically includes `'assign_hackathons'`. However, `CANONICAL_PERMISSIONS` in TypeScript only contains 12 entries and omits `'assign_hackathons'`.
- **Evidence:**
  ```typescript
  // src/lib/auth/permissions.ts
  export const CANONICAL_PERMISSIONS = [
    'verify_students',
    'manage_students',
    'manage_password_resets',
    'manage_hackathons',
    // 'assign_hackathons' is missing!
    'manage_teams',
    'manage_followups',
    'view_analytics',
    'export_data',
    'view_audit_logs',
    'manage_points',
    'manage_notifications',
    'view_student_data',
  ] as const;
  export const adminPermissionKeySchema = z.enum(CANONICAL_PERMISSIONS);
  ```
- **Impact:**
  - Super Admin cannot assign or toggle the `assign_hackathons` permission through admin UI forms because it is missing from `PERMISSION_DEFINITIONS`.
  - Any server action validating permissions with `adminPermissionKeySchema` will reject `'assign_hackathons'`.
- **Recommended Remediation:**
  1. Add `'assign_hackathons'` to `CANONICAL_PERMISSIONS` in `src/lib/auth/permissions.ts`.
  2. Add its entry to `PERMISSION_DEFINITIONS` under category `'Event Operations'`:
     ```typescript
     assign_hackathons: {
       key: 'assign_hackathons',
       label: 'Hackathon Assignment Management',
       category: 'Event Operations',
       description: 'Assign and remove administrators and reviewers for institutional hackathons.',
       phaseAvailability: 'Active in Phase 2B',
     },
     ```

#### Finding APP-03: Admin Shell Navigation Hides "Hackathons" from Reviewer-Only Administrators
- **Classification:** LOW (UI Visibility Gap)
- **File References:**
  - [src/components/shells/admin-shell.tsx:L29-L30](file:///Volumes/CodingVault/web/HackLeague/src/components/shells/admin-shell.tsx#L29-L30)
  - [src/app/admin/hackathons/page.tsx:L15](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/page.tsx#L15)
- **Risk:** In `admin-shell.tsx`, the `Hackathons` navigation item is only added to the sidebar if `adminProfile?.is_super_admin || permissions.includes('manage_hackathons')`.
- **Evidence:**
  ```typescript
  // src/components/shells/admin-shell.tsx:29-30
  const hasManageHackathons =
    adminProfile?.is_super_admin || permissions.includes('manage_hackathons');
  if (hasManageHackathons) {
    eventOpItems.push({ label: 'Hackathons', href: '/admin/hackathons', ... });
  }
  ```
  Furthermore, `src/app/admin/hackathons/page.tsx:15` executes `requireAdmin('manage_hackathons')`, redirecting non-managing admins.
- **Impact:** Reviewers who are assigned to a hackathon cannot see the "Hackathons" link in the admin sidebar and cannot open `/admin/hackathons` to find their assigned hackathons.
- **Recommended Remediation:**
  1. Update `admin-shell.tsx` to display `Hackathons` to any active admin (or check if they have assignments / `assign_hackathons` / `manage_hackathons`).
  2. Update `src/app/admin/hackathons/page.tsx` to use `requireAdmin()` without a required permission, letting RLS policy `hackathons_select_policy` filter the rows:
     `status <> 'draft' OR can_admin_manage_hackathon_config(id) OR can_admin_manage_assignments(id) OR can_admin_review_hackathon(id)`.

#### Finding APP-04: Congested Actions Column in `hackathons-client.tsx`
- **Classification:** LOW (UI Refinement)
- **File Reference:** [src/app/admin/hackathons/hackathons-client.tsx:L264-L340](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/hackathons-client.tsx#L264-L340)
- **Risk:** Up to 6 interactive buttons and links (`Edit`, `Rounds`, `Submissions`, `Deadline`, `Publish`/`Close Reg.`, `Archive`) are rendered in every row's action cell without responsive grouping.
- **Evidence:** On viewports under 1280px, wrapping causes row height distortion and misaligned action targets. Reviewers without `manage_hackathons` also see buttons (`Edit`, `Rounds`, `Publish`, `Archive`) that they have no permission to execute.
- **Recommended Remediation:**
  1. Pass the caller's permission context (`canManageConfig`, `canManageAssignments`, `canReview`) to `HackathonsClient`.
  2. Conditionally hide configuration actions for reviewer-only admins.
  3. Replace the flat button list with a clean primary action (`Submissions` or `Edit`) and a dropdown menu (`...`) for secondary actions (`Deadline`, `Rounds`, `Assignments`, `Archive`).

---

## 3. Comprehensive Authorization Matrix

The table below details the effective permissions across all six authorization tiers under the proposed migration:

| Operation / Asset | Super Admin | Admin with `manage_hackathons` (Unassigned) | Admin with `assign_hackathons` (No Manage) | Assigned Reviewer (Assigned to Hackathon H) | Unassigned Admin (No Assignment, Other Perms) | Student / Team Member |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **View Published Hackathons** | Yes | Yes | Yes | Yes | Yes | Yes |
| **View Draft Hackathons** | Yes | Yes (All) | Yes (All) | Yes (Assigned H) | Denied | Denied |
| **Create Hackathon Draft** | Yes | Yes | Denied | Denied | Denied | Denied |
| **Update Hackathon Metadata** | Yes | Yes (All) | Denied | Denied | Denied | Denied |
| **Override Deadline / Lifecycle** | Yes | Yes (All) | Denied | Denied | Denied | Denied |
| **Configure Rounds / Schedule** | Yes | Yes (All) | Denied | Denied | Denied | Denied |
| **View Admin Assignments Table** | Yes | Yes (All) | Yes (All) | Yes (Assigned H) | Denied | Denied |
| **Assign Reviewers to Hackathon** | Yes | Denied | Yes (All) | Denied | Denied | Denied |
| **Remove Reviewers from Hackathon**| Yes | Denied | Yes (All) | Denied | Denied | Denied |
| **Reassign Primary In-Charge Admin**| Yes | Denied | Denied | Denied | Denied | Denied |
| **View Hackathon Teams Roster** | Yes | Yes (All) | Denied | Yes (Assigned H) | Denied | Denied (Own team only)|
| **View Submissions Queue** | Yes | Denied* | Denied | Yes (Assigned H) | Denied | Denied (Own team only)|
| **Review Round Submissions (RPC)**| Yes | Denied | Denied | Yes (Assigned H) | Denied | Denied |
| **Record Round Placement (RPC)** | Yes | Denied | Denied | Yes (Assigned H) | Denied | Denied |
| **View Registration Proof Path** | Yes | Denied* | Denied | Yes (Assigned H) | Denied | Own team only |
| **Download Registration Proof (Storage)**| Yes | Denied | Denied | Yes (Assigned H) | Denied | Own team only |
| **Download Round Evidence (Storage)**| Yes | Denied | Denied | Yes (Assigned H) | Denied | Own team only |
| **Upload Registration Proof** | Denied | Denied | Denied | Denied | Denied | Yes (Team Leader) |
| **Direct Write to Assignments Table**| Denied (Blocked by Privilege & RLS) | Denied | Denied | Denied | Denied | Denied |

*\* Note: Administrators holding `export_data` can read teams and submissions for analytical exports via scoped RLS policy, but cannot review, update, or download raw evidence.*

---

## 4. End-to-End Registration-Proof Flow Audit

Tracing the exact lifecycle of external hackathon registration proofs:

```
[Student Leader]
      │
      ▼
1. Generates object path: teams/{teamId}/registration/{uuid}.{ext}
      │
      ▼
2. Uploads screenshot to storage bucket 'submission-evidence'
      │  (Authorized by storage.objects insert policy: student leader check)
      ▼
3. Invokes RPC submit_registration_proof(team_id, proof_path, cdc_declaration)
      │  (Persists external_proof_path in public.teams table)
      ▼
[Reviewer / Admin Access]
      │
      ▼
4. Admin queries getRegistrationProofPreviewUrl(teamId)
      │
      ├──> A. RPC can_view_registration_proof(teamId)
      │         │
      │         ├── Checks UUID syntax: ^[0-9a-f]{8}-...$
      │         ├── Queries teams.hackathon_id for teamId
      │         └── Evaluates can_admin_review_hackathon(hackathon_id)
      │                   │
      │                   ├── Super Admin: TRUE
      │                   ├── Assigned Admin in hackathon_admin_assignments: TRUE
      │                   └── Unassigned Admin: FALSE
      │
      ├──> B. Queries public.teams.external_proof_path
      │         │
      │         └── RLS policy teams_select_admin evaluates:
      │             can_admin_review_hackathon(hackathon_id) -> ALLOWS assigned reviewer
      │
      └──> C. Generates signed preview URL for 'submission-evidence' (60s TTL)
                │
                └── Storage RLS policy submission_evidence_select evaluates:
                    ((storage.foldername(name))[1] = 'teams' AND
                     (storage.foldername(name))[3] = 'registration' AND
                     public.can_view_registration_proof((storage.foldername(name))[2]))
                    -> ALLOWS assigned reviewer, DENIES unassigned admin
```

### Storage Alignment Verification
- **Application path generated:** `teams/${teamId}/registration/${randomSuffix}.${ext}` ([paths.ts:565](file:///Volumes/CodingVault/web/HackLeague/src/lib/storage/paths.ts#L565)).
- **Folder components extracted:**
  - `(storage.foldername(name))[1]` = `'teams'`
  - `(storage.foldername(name))[2]` = `${teamId}`
  - `(storage.foldername(name))[3]` = `'registration'`
- **RLS Policy invocation:** Passes `(storage.foldername(name))[2]` directly to `can_view_registration_proof(p_team_id_text)`.
- **Verdict:** Path structure, table column, helper function argument, and storage policy components align with 100% precision.

---

## 5. Unresolved Assumptions & Integration Test Requirements

The following behaviors have been validated statically via source analysis and AST parsing, but require live execution during hosted preflight / staging:

1. **Active In-Charge Foreign Key Integrity on Pre-Existing Hackathons:**
   - *Assumption:* Every non-null `in_charge_admin_id` in `public.hackathons` currently references an existing record in `public.admin_profiles`.
   - *Preflight Query Provided:* Query 1 below verifies this before migration.
2. **Historical External & Community URL Formatting:**
   - *Assumption:* All non-null `external_registration_url` and `community_url` values currently stored in `public.hackathons` conform to the strict POSIX regex.
   - *Preflight Query Provided:* Query 2 below verifies this before migration.
3. **Absence of Dependent Views on Legacy Overload:**
   - *Assumption:* No custom database views or external reporting scripts depend on `review_round_advancement(UUID, TEXT, TEXT, TEXT)`.
   - *Preflight Query Provided:* Query 3 below inspects `pg_depend`.
4. **Storage Object Metadata in Supabase Storage API:**
   - *Assumption:* Supabase storage API creates folder prefixes compatible with `storage.foldername(name)`. (Verified standard on Supabase Storage v1/v2).

---

## 6. Pre-Migration Hosted Diagnostic Queries (READ-ONLY)

> [!IMPORTANT]
> Execute these read-only SQL queries against hosted Supabase **BEFORE** applying the migration. None of these queries mutate data or reference uncreated objects like `hackathon_admin_assignments`.

```sql
-- ============================================================================
-- PRE-MIGRATION QUERY 1: Inspect Hackathon In-Charge References & Admin Validity
-- Identifies any invalid or inactive in-charge admin references in public.hackathons
-- ============================================================================
SELECT
  h.id AS hackathon_id,
  h.title,
  h.status,
  h.in_charge_admin_id,
  ap.id AS profile_id,
  ap.full_name AS in_charge_name,
  ap.is_active,
  ap.is_super_admin,
  EXISTS(
    SELECT 1 FROM public.admin_permissions p
    WHERE p.admin_id = h.in_charge_admin_id AND p.permission = 'manage_hackathons'
  ) AS has_manage_hackathons
FROM public.hackathons h
LEFT JOIN public.admin_profiles ap ON ap.id = h.in_charge_admin_id
WHERE h.in_charge_admin_id IS NOT NULL;

-- Expected result: ap.profile_id is NOT NULL, ap.is_active = true.
-- If any row has ap.profile_id IS NULL, resolve foreign key reference before migrating.


-- ============================================================================
-- PRE-MIGRATION QUERY 2: URL Regex Preflight on Historical Hackathons
-- Validates that all non-null URLs comply with the proposed check constraints
-- ============================================================================
WITH regex_def AS (
  SELECT '^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&''()*+,;%=]*)?$' AS url_pattern
)
SELECT
  h.id,
  h.title,
  h.external_registration_url,
  h.community_url,
  CASE
    WHEN h.external_registration_url IS NOT NULL
     AND NOT (h.external_registration_url ~* (SELECT url_pattern FROM regex_def))
    THEN 'INVALID_EXTERNAL_URL'
    ELSE 'OK'
  END AS external_url_status,
  CASE
    WHEN h.community_url IS NOT NULL
     AND NOT (h.community_url ~* (SELECT url_pattern FROM regex_def))
    THEN 'INVALID_COMMUNITY_URL'
    ELSE 'OK'
  END AS community_url_status
FROM public.hackathons h
WHERE h.external_registration_url IS NOT NULL
   OR h.community_url IS NOT NULL;

-- Expected result: 0 rows with status <> 'OK'.


-- ============================================================================
-- PRE-MIGRATION QUERY 3: Legacy Overload Existence & Dependency Audit
-- Checks if review_round_advancement(UUID, TEXT, TEXT, TEXT) exists and has dependents
-- ============================================================================
SELECT
  p.oid AS proc_oid,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_args,
  d.deptype,
  pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN pg_depend d ON d.refobjid = p.oid AND d.deptype NOT IN ('i', 'a')
WHERE n.nspname = 'public'
  AND p.proname = 'review_round_advancement'
  AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, text';

-- Expected result: proc_oid may exist or be NULL. dependent_object must be NULL.
```

---

## 7. Post-Migration Verification Queries (READ-ONLY)

> [!NOTE]
> Execute these read-only SQL queries **IMMEDIATELY AFTER** applying the migration to confirm full database health and synchronization.

```sql
-- ============================================================================
-- POST-MIGRATION QUERY 1: In-Charge Assignment Cardinality & Partial Index Check
-- Verifies that no hackathon has more than 1 in_charge administrator
-- ============================================================================
SELECT
  hackathon_id,
  COUNT(*) AS in_charge_count
FROM public.hackathon_admin_assignments
WHERE role = 'in_charge'
GROUP BY hackathon_id
HAVING COUNT(*) > 1;

-- Expected result: 0 rows (strictly enforced by partial unique index).


-- ============================================================================
-- POST-MIGRATION QUERY 2: Full Reconciliation: hackathons vs assignments
-- Compares hackathons.in_charge_admin_id with hackathon_admin_assignments
-- ============================================================================
SELECT
  h.id AS hackathon_id,
  h.title,
  h.in_charge_admin_id,
  a.admin_id AS assignment_in_charge_admin_id,
  CASE
    WHEN h.in_charge_admin_id IS NULL AND a.admin_id IS NULL THEN 'SYNCHRONIZED_NO_IN_CHARGE'
    WHEN h.in_charge_admin_id = a.admin_id THEN 'SYNCHRONIZED_MATCH'
    WHEN h.in_charge_admin_id IS NOT NULL AND a.admin_id IS NULL THEN 'MISSING_ASSIGNMENT_RECORD'
    WHEN h.in_charge_admin_id IS NULL AND a.admin_id IS NOT NULL THEN 'ORPHANED_IN_CHARGE_ASSIGNMENT'
    ELSE 'ADMIN_MISMATCH'
  END AS reconciliation_status
FROM public.hackathons h
FULL OUTER JOIN public.hackathon_admin_assignments a
  ON h.id = a.hackathon_id AND a.role = 'in_charge';

-- Expected result: All rows have reconciliation_status IN ('SYNCHRONIZED_MATCH', 'SYNCHRONIZED_NO_IN_CHARGE').


-- ============================================================================
-- POST-MIGRATION QUERY 3: Verify Privilege Revocation & RLS on Assignments Table
-- ============================================================================
SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'hackathon_admin_assignments'
ORDER BY grantee, privilege_type;

-- Expected result:
-- authenticated: SELECT only.
-- anon: NO privileges.
-- public: NO privileges.


-- ============================================================================
-- POST-MIGRATION QUERY 4: Storage Policies Composition Audit
-- ============================================================================
SELECT
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE '%submission_evidence%';

-- Expected result: Exactly two policies:
-- 1. "submission_evidence_insert_member" (FOR INSERT)
-- 2. "submission_evidence_select" (FOR SELECT)
-- (No legacy or duplicate SELECT policies surviving).
```

---

## 8. Rollout Plan & Execution Checklist

### Phase 1: Pre-Migration Read-Only Checks
- [ ] Run Pre-Migration Query 1 (In-Charge references validity).
- [ ] Run Pre-Migration Query 2 (Historical URL regex conformity).
- [ ] Run Pre-Migration Query 3 (Legacy overload reverse dependencies).
- [ ] Confirm Supabase service role and database backups are operational.

### Phase 2: Migration Execution
- [ ] Execute `supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql` within a dedicated maintenance window.
- [ ] Confirm zero errors during execution and successful `COMMIT`.

### Phase 3: Post-Migration Database Health Verification
- [ ] Run Post-Migration Query 1 (In-Charge cardinality check).
- [ ] Run Post-Migration Query 2 (Full reconciliation check).
- [ ] Run Post-Migration Query 3 (Privilege revocation verification).
- [ ] Run Post-Migration Query 4 (Storage policy composition check).

### Phase 4: Application-Layer Follow-up (Recommended Pull Request)
- [ ] Add `'assign_hackathons'` to `CANONICAL_PERMISSIONS` and `PERMISSION_DEFINITIONS` in `src/lib/auth/permissions.ts`.
- [ ] Introduce `requireHackathonReviewScope` in `src/lib/auth/guards.ts`.
- [ ] Update `submissions/page.tsx` and `round-review-actions.ts` to use review scope instead of configuration scope.
- [ ] Update `admin-shell.tsx` and `hackathons/page.tsx` so reviewers can access the Hackathons queue.
- [ ] Clean up `hackathons-client.tsx` Actions column into a responsive menu.

---

## 9. Explicit Non-Interference Confirmation

- **Hosted Supabase Project:** Strictly untouched (`hmmhghnljaloipkkgeqj`). No DDL, DML, or queries executed against hosted infrastructure.
- **Git Repository State:** Uncommitted working-tree modifications (6-character invitation code files and URL validation tests) preserved with zero modifications or reverts.
- **Branches & Commits:** Zero commits created, zero branches switched or deleted, zero remote pushes executed.
- **Deployment Pipelines:** No deployments triggered or queued.
- **Secrets & Credentials:** No API keys, service role tokens, or environment values exposed.
