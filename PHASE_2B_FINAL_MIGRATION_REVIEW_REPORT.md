# NMIT HackLeague — Phase 2B Final Database Migration Review Report

**File Under Review:** `supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql`
**Expected SHA-256:** `b1cebd235fe6f80e593efa9fe34f003d626a9fcb884f709909aae6b72c77025a`
**Actual SHA-256:** `b1cebd235fe6f80e593efa9fe34f003d626a9fcb884f709909aae6b72c77025a`
**Review Type:** Independent, Read-Only Static Verification & Structural Audit
**Date:** October 24, 2026

---

## Overall Verdict: APPROVE FOR STAGING

The proposed migration `20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql` is **APPROVED FOR STAGING DEPLOYMENT**.

The migration is robust, transactional (`BEGIN ... COMMIT`), fail-closed, and non-destructive. It enforces strict separation between global configuration (`manage_hackathons`), global assignments (`assign_hackathons`), and event-scoped review authority (`can_admin_review_hackathon`). It properly reconciles legacy function overloads without `CASCADE`, establishes safe storage policies, and preserves all student/team access rights and invitation-code behavior.

Before applying the migration to staging or production, the read-only preflight queries detailed in Section 4 must be executed to confirm the live database contains no pre-existing data violations.

---

## 1. Findings Classified by Severity

### Critical / High Severity
*None identified.* The migration contains zero blind drops, zero unpinned search paths, zero `CASCADE` drops, and zero privilege escalation paths.

---

### Medium Severity (Operational & Environmental Assumptions)

1. **[MED-01] Preflight Data Compliance Requirement on Hosted Target**
   - **Locations:** [Lines 13-33](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L13-L33), [Lines 38-56](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L38-L56), [Lines 110-112](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L110-L112)
   - **Description:** The migration introduces new table constraints and unique indexes:
     - `chk_admin_permissions_key` on `admin_permissions` (restricting keys to 13 canonical values).
     - `chk_hackathons_external_url` and `chk_hackathons_community_url` on `hackathons`.
     - `uq_results_team_win_placement` on `results` for `milestone_type = 'win_placement'`.
   - **Impact:** If unmigrated production data contains non-conforming URLs (e.g., spaces or unencoded characters), unrecognized permission keys, or duplicate winner placements for a single team in one hackathon, the migration transaction will abort.
   - **Remediation:** Execute the provided read-only preflight queries (Section 4) before running the migration.

2. **[MED-02] Live RPC and Storage Token Execution Requires Staging Environment**
   - **Locations:** [Lines 374-498](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L374-L498), [Lines 660-685](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L660-L685)
   - **Description:** Storage RLS policies delegate to helper functions (`can_view_registration_proof`, `can_view_team_round_evidence`, `can_view_legacy_evidence`) which invoke `auth.uid()` and parse folder names. While static code inspection confirms correct regex parsing and role checking, authenticated storage download URLs and token authorization can only be fully validated on a live staging database.
   - **Impact:** Cannot claim end-to-end browser verification against live tokens until deployed to a staging project.

---

### Low Severity / Informational Observations

1. **[LOW-01] Default Permissive Interaction on Direct Write Denial Policy**
   - **Location:** [Lines 100-105](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L100-L105)
   - **Description:** Policy `"hackathon_admin_assignments_deny_direct_write"` is defined `FOR ALL TO authenticated USING (false) WITH CHECK (false)`. In PostgreSQL, multiple permissive RLS policies are combined using logical `OR`. The subsequent policy `"hackathon_admin_assignments_select_admin"` (`FOR SELECT`) evaluates `false OR can_admin_...`, which correctly permits authorized `SELECT` queries. In addition, table privileges explicitly execute `REVOKE INSERT, UPDATE, DELETE ON TABLE public.hackathon_admin_assignments FROM authenticated;`.
   - **Status:** Fully secure. Defining the denial policy `FOR INSERT, UPDATE, DELETE` would be more idiomatic, but the current configuration is completely functional and safe.

2. **[LOW-02] Pre-Migration Application Fallback Gracefully Absorbs Unmigrated State**
   - **Location:** [src/app/admin/hackathons/page.tsx:24-35](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/page.tsx#L24-L35)
   - **Description:** The Next.js page queries `hackathon_admin_assignments` wrapped in a try/catch block with fallback to `h.in_charge_admin_id === admin.id`. This ensures local development servers and preflight builds do not crash before the table exists on remote Supabase. Once Phase 2B is deployed, the table query succeeds naturally.

---

## 2. Comprehensive Migration Architecture Audit

### 2.1 Table Structure & Constraints

| Object | SQL Definition | Audit Status |
| :--- | :--- | :--- |
| `public.hackathon_admin_assignments` | Table with UUID primary key, foreign keys to `hackathons` (CASCADE) and `admin_profiles` (RESTRICT), `uq_hackathon_admin_assignments` UNIQUE `(hackathon_id, admin_id)`, and `chk_hackathon_admin_role` | **Verified.** Prevents orphaned records. |
| In-Charge Partial Unique Index | `uq_hackathon_admin_assignments_in_charge` UNIQUE `(hackathon_id) WHERE (role = 'in_charge')` | **Verified.** Ensures at most one primary in-charge admin per hackathon. |
| Placement Partial Unique Index | `uq_results_team_win_placement` UNIQUE `(hackathon_id, team_id) WHERE (milestone_type = 'win_placement')` | **Verified.** Eliminates race conditions in winner placement. |
| URL Boundaries | `chk_hackathons_external_url`, `chk_hackathons_community_url` allowing `NULL` or valid RFC 3986 HTTP(S) URL | **Verified.** Historical records with `NULL` remain valid; malformed strings are blocked. |
| Permissions Constraint | `chk_admin_permissions_key` accepting exactly 13 canonical permissions | **Verified.** Includes `assign_hackathons` in exact parity with application catalog. |

### 2.2 Security Definer, Search Path & Grant Integrity

Every function declared in the migration was audited against the project's hardening standards:

- **Total Functions:** 25 (24 callable RPCs/helpers + 1 trigger function)
- **`SECURITY DEFINER`:** 25 / 25 (**100%**)
- **`SET search_path = public, pg_temp`:** 25 / 25 (**100%**)
- **`REVOKE ALL ... FROM PUBLIC, anon`:** 24 / 24 callable functions (**100%**)
- **`GRANT EXECUTE ... TO authenticated`:** 24 / 24 callable functions (**100%**)
- **Table Writes Revocation:** `REVOKE INSERT, UPDATE, DELETE ON TABLE public.hackathon_admin_assignments FROM authenticated;` (**100%**)

### 2.3 Access Control & RBAC Invariant Verification

1. **Super Admin Global Access:**
   - [can_admin_manage_hackathon_config:147](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L147): Returns `TRUE` if `v_is_super IS TRUE`.
   - [can_admin_manage_assignments:198](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L198): Returns `TRUE` if `v_is_super IS TRUE`.
   - [can_admin_review_hackathon:249](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L249): Returns `TRUE` if `v_is_super IS TRUE`.
   - [can_admin_manage_hackathon:326](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L326): Returns `TRUE` if `v_is_super IS TRUE`.
   - All RLS policies on `hackathons`, `hackathon_rounds`, `teams`, `submissions`, `submission_reviews`, `results`, and `storage.objects` include Super Admin bypass.

2. **Independence of `manage_hackathons` and `assign_hackathons`:**
   - `manage_hackathons` grants `can_admin_manage_hackathon_config`, allowing draft creation, round configuration, schedule updates, deadline overrides, and lifecycle transitions. It **does NOT** grant `can_admin_manage_assignments`.
   - `assign_hackathons` grants `can_admin_manage_assignments`, allowing assigning/removing reviewers. It **does NOT** grant `can_admin_manage_hackathon_config`.
   - Neither permission is a prerequisite for the other.

3. **Assigned Reviewer Scoping:**
   - `can_admin_review_hackathon(hackathon_id)` checks `EXISTS (SELECT 1 FROM hackathon_admin_assignments WHERE hackathon_id = p_hackathon_id AND admin_id = v_caller_id)`.
   - Reviewers assigned to Hackathon A cannot review Hackathon B.
   - Unassigned administrators receive `FALSE` across `submissions`, `submission_reviews`, `results`, and `storage.objects`.

4. **Direct Table Write Protection:**
   - Direct SQL mutations against `hackathon_admin_assignments` are denied at both table privilege level and RLS level.
   - Assignments can only be created, updated, or deleted through audited RPCs (`assign_admin_to_hackathon`, `remove_admin_from_hackathon`, `reassign_hackathon_in_charge_admin`, `create_hackathon_draft`) or the synchronized database trigger.

5. **External Registration URL Lifecycle:**
   - In `create_hackathon_draft` ([lines 830-837](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L830-L837)), `external_registration_url` is mandatory and non-empty.
   - In `update_hackathon_metadata` ([lines 1052-1055](file:///Volumes/CodingVault/web/HackLeague/supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql#L1052-L1055)), `external_registration_url` can be `NULL` for legacy records, but if provided, must match the strict URL regex.

6. **Team Invitation Codes & Student Access:**
   - Student and team member RLS policies (`teams_select_member`, `submissions_select_member`, `submission_reviews_select_team_member`) remain intact.
   - Storage evidence policies grant read access to team members for their own team submissions via `current_is_team_member(v_team_id)`.
   - Backward-compatibility helper `can_admin_manage_hackathon(id, 'manage_teams')` is fully preserved for `regenerate_team_invitation_code`.

---

## 3. Application Integration Alignment Audit

| Application File & Function | Database Anchor | Alignment Result |
| :--- | :--- | :--- |
| [requireHackathonReviewScope](file:///Volumes/CodingVault/web/HackLeague/src/lib/auth/guards.ts#L293) | `can_admin_review_hackathon(UUID)` | **Aligned.** Active admin authentication enforced; RPC checked; unauthorized callers redirected. |
| [reviewRoundAdvancementAction](file:///Volumes/CodingVault/web/HackLeague/src/actions/registration-proof-actions.ts#L103) | `review_round_advancement(UUID, TEXT, TEXT)` | **Aligned.** Finds `hackathon_id`, verifies review scope, calls 3-arg RPC with lock protection. |
| [reviewRoundSubmissionAction](file:///Volumes/CodingVault/web/HackLeague/src/actions/round-review-actions.ts#L52) | `review_round_submission(UUID, TEXT, TEXT)` | **Aligned.** Verifies review scope, invokes locked DAG review function, awards points atomically. |
| [AdminHackathonsPage](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/page.tsx#L14) | `hackathons_select_policy` + assignments query | **Aligned.** Strips draft hackathons server-side for unassigned admins; passes role capabilities to client. |
| [HackathonsClient Actions Column](file:///Volumes/CodingVault/web/HackLeague/src/app/admin/hackathons/hackathons-client.tsx#L320) | `can_admin_manage_hackathon_config`, `can_admin_review_hackathon`, `can_admin_manage_assignments` | **Aligned.** Shows primary Submissions button to reviewers; gates secondary action dropdown by capability. |
| [CANONICAL_PERMISSIONS](file:///Volumes/CodingVault/web/HackLeague/src/lib/auth/permissions.ts#L4) | `chk_admin_permissions_key` | **Aligned.** Exactly 13 permissions; includes `assign_hackathons` in category `'Event Operations'`. |

---

## 4. Manual Pre-Migration Read-Only Verification Checklist

Execute these read-only SQL queries in the Supabase SQL Editor **before** applying the migration. All queries must return `0` rows or expected values.

```sql
-- ============================================================================
-- PRE-MIGRATION READ-ONLY CHECKLIST (SAFE TO RUN ANYTIME)
-- ============================================================================

-- Check 1: Verify all existing admin permissions match the 13 canonical keys
SELECT permission, COUNT(*) AS count
FROM public.admin_permissions
WHERE permission NOT IN (
  'verify_students',
  'manage_password_resets',
  'manage_hackathons',
  'assign_hackathons',
  'manage_teams',
  'manage_followups',
  'manage_students',
  'view_analytics',
  'export_data',
  'view_audit_logs',
  'manage_points',
  'manage_notifications',
  'view_student_data'
)
GROUP BY permission;
-- Expected output: 0 rows.

-- Check 2: Verify existing external_registration_url values conform to protocol regex
SELECT id, title, external_registration_url
FROM public.hackathons
WHERE external_registration_url IS NOT NULL
  AND NOT (
    external_registration_url ~* '^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&''()*+,;%=]*)?$'
  );
-- Expected output: 0 rows.

-- Check 3: Verify existing community_url values conform to protocol regex
SELECT id, title, community_url
FROM public.hackathons
WHERE community_url IS NOT NULL
  AND NOT (
    community_url ~* '^https?:\/\/((([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,})|localhost|(((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])))(:(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3}))?([/?#][a-zA-Z0-9\-._~:/?#\[\]@!$&''()*+,;%=]*)?$'
  );
-- Expected output: 0 rows.

-- Check 4: Verify no duplicate winner placements exist in public.results
SELECT hackathon_id, team_id, COUNT(*) AS duplicate_placements
FROM public.results
WHERE milestone_type = 'win_placement'
GROUP BY hackathon_id, team_id
HAVING COUNT(*) > 1;
-- Expected output: 0 rows.

-- Check 5: Inspect hackathons.in_charge_admin_id integrity (identify any orphaned references)
SELECT h.id, h.title, h.in_charge_admin_id
FROM public.hackathons h
LEFT JOIN public.admin_profiles ap ON ap.id = h.in_charge_admin_id
WHERE h.in_charge_admin_id IS NOT NULL
  AND ap.id IS NULL;
-- Expected output: 0 rows (all in-charge references resolve to valid admin profiles).

-- Check 6: Inspect existing review_round_advancement overloads
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  n.nspname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'review_round_advancement';
-- Expected output: Lists current overload(s). If 4-arg overload exists, the migration will safely clean it up.
```

---

## 5. Post-Migration Verification Checklist (DO NOT RUN YET)

> [!CAUTION]
> **DO NOT EXECUTE THESE QUERIES NOW.** These queries are for post-migration verification on staging/production after the migration has been applied.

```sql
-- ============================================================================
-- POST-MIGRATION VERIFICATION CHECKLIST (RUN ONLY AFTER MIGRATION IS APPLIED)
-- ============================================================================

-- 1. Verify hackathon_admin_assignments table exists and has RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'hackathon_admin_assignments';
-- Expected: 1 row, rowsecurity = true.

-- 2. Verify in-charge partial unique index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'hackathon_admin_assignments'
  AND indexname = 'uq_hackathon_admin_assignments_in_charge';
-- Expected: 1 row, indexdef contains WHERE (role = 'in_charge').

-- 3. Verify winner placement partial unique index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'results'
  AND indexname = 'uq_results_team_win_placement';
-- Expected: 1 row, indexdef contains WHERE (milestone_type = 'win_placement').

-- 4. Verify initial in-charge backfill matches hackathons table count
SELECT
  (SELECT COUNT(*) FROM public.hackathons WHERE in_charge_admin_id IS NOT NULL) AS hackathons_with_in_charge,
  (SELECT COUNT(*) FROM public.hackathon_admin_assignments WHERE role = 'in_charge') AS backfilled_in_charge_assignments;
-- Expected: hackathons_with_in_charge = backfilled_in_charge_assignments.

-- 5. Verify review_round_advancement has exactly ONE callable overload (3 arguments)
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'review_round_advancement';
-- Expected: Exactly 1 row with args: 'uuid, text, text' (or 'p_submission_id uuid, p_decision text, p_feedback text').

-- 6. Verify storage policies on submission-evidence
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname = 'submission_evidence_select';
-- Expected: Exactly 1 row handling teams/registration, teams/evidence, and legacy evidence.

-- 7. Verify assign_hackathons is recognized in check constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chk_admin_permissions_key';
-- Expected: Contains 'assign_hackathons'.
```

---

## 6. Remaining Risks & Staging Test Plan

| Risk | Context | Staging Validation Required |
| :--- | :--- | :--- |
| **Active Session Permissions Refresh** | Administrators currently logged in with JWTs issued prior to permission updates may retain stale claims. | Test admin log out and log in after granting `assign_hackathons`. |
| **Storage Evidence Download Tokens** | Browser verification of authenticated signed URLs for registration proofs and round evidence. | Log in as assigned reviewer: verify evidence renders. Log in as unassigned admin: verify 403 Forbidden. |
| **Simultaneous Review Submission Concurrency** | Two reviewers evaluating the same submission simultaneously. | Test concurrent RPC execution; confirm one succeeds and second receives `40001` concurrency lock exception. |

---

## 7. Migration File & Working Tree Integrity Confirmation

- **Migration File Path:** `supabase/migrations/20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql`
- **SHA-256 Before Review:** `b1cebd235fe6f80e593efa9fe34f003d626a9fcb884f709909aae6b72c77025a`
- **SHA-256 After Review:** `b1cebd235fe6f80e593efa9fe34f003d626a9fcb884f709909aae6b72c77025a` (**100% Invariant**)
- **Working Tree Preservation:** All uncommitted changes (six-character team invitation codes, external registration URL validation, application integration fixes, and test suites) remain preserved.
- **Hosted Supabase Status:** **Zero remote connections made. Zero remote SQL executed. Hosted project (`hmmhghnljaloipkkgeqj`) strictly untouched.**
