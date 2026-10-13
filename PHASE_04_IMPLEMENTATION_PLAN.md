# NMIT HackLeague — Phase 4 Implementation Plan
## Authentication, Email Verification & Student Onboarding

**Document Version:** 1.5.2 (Revision 1.5.2 — Final Status-Constraint Consistency Fix)
**Status:** PROPOSED — PENDING ARCHITECTURAL REVIEW & OWNER APPROVAL
**Branch:** `v1`
**Repository Root:** `/Volumes/CodingVault/web/HackLeague`
**Target Environment:** Next.js 16.4.0 (App Router), React 19.0.0, TypeScript 5.7.0, Tailwind CSS 4.0.0, Supabase PostgreSQL 17, Supabase Auth (GoTrue), Supabase Storage, Resend SMTP, Vercel

---

## Document Revision History

| Revision | Date | Author / Role | Key Changes & Focus Areas |
| :--- | :--- | :--- | :--- |
| **v1.0.0** | Oct 13, 2026 | System Architect | Initial planning baseline for authentication, onboarding, and storage integration. |
| **v1.1.0** | Oct 13, 2026 | System Architect | Architecture corrections: resolved registration to trigger-based pattern, restored canonical demographic requirements, aligned deletion queue with final review outcomes. |
| **v1.2.0** | Oct 13, 2026 | Security & Database Architect | Concurrency-safe rate limiting concept, safe demographics migration concept, integration test specification. |
| **v1.3.0** | Oct 13, 2026 | Security & Database Architect | Final Blocking Defect Corrections Pass: rate-limit role authorization, dynamic age validation, storage queue enforcement, dedicated HMAC secret, rate limit bucket pruning, suspended state contract. |
| **v1.4.0** | Oct 13, 2026 | Security & Database Architect | Focused architectural corrections: compatibility concepts, canonical 5-action rate limiter whitelist (`signup`, `submit_review`, `replace_id`, `review_action`, `view_college_id`). |
| **v1.5.0** | Oct 13, 2026 | Security & Database Architect | Final Security Correction Pass: eliminated unsafe transaction-timestamp authorization; introduced private `profile_action_authorizations` table with `pg_current_xact_id()` binding and single-use consumption; expanded adversarial pgTAP suite to 28 tests. |
| **v1.5.1** | Oct 13, 2026 | Security & Database Architect | **Email Domain Policy Correction:** Explicitly clarified in Section 4.2 and acceptance criteria that Supabase Auth verifies ownership of the student's supplied email address without requiring `@nmit.ac.in` or any institutional domain restriction. Any syntactically valid email (personal or institutional) is accepted; institutional eligibility is verified exclusively through compulsory College ID card upload and authorized administrator review. Preserved all transaction-bound authorization mechanics (`profile_action_authorizations`, `pg_current_xact_id()`, ephemeral consumption, rollback guarantees). |
| **v1.5.2** | Oct 13, 2026 | Security & Database Architect | **Registration Status Constraint Consistency Fix:** Inspected actual Phase 3 constraint `chk_profiles_status` (`draft`, `pending_verification`, `under_review`, `approved`, `rejected`, `suspended`). Replaced and extended constraint via safe `DROP CONSTRAINT IF EXISTS ... ADD CONSTRAINT ...` in Phase 4 migration to include `correction_required` alongside all 6 legacy/existing statuses. Verified all status transitions across `handle_new_auth_user()`, `protect_profile_columns()`, `submit_profile_for_review()`, `replace_college_id()`, and `review_student_registration()`. Added `TS-ONB-29` (constraint validation across all 7 statuses + invalid rejection) and `TS-ONB-30` (resubmission from `correction_required` to `under_review`), expanding pgTAP suite from 28 to 30 tests (131 total database tests). |

---

## 1. Executive Summary & Problem Resolution Matrix

### 1.1 Resolution Mapping to Review Directives

| Directive / Defect | Resolution in Revision 1.5 | Plan Section |
| :--- | :--- | :--- |
| **1. Unsafe Transaction-Timestamp Authorization Flaw** | Eliminated timestamp comparisons. Created private table `public.profile_action_authorizations` (`xact_id`, `student_id`, `action_type`, `old_value`, `new_value`). RPCs insert authorization keyed by `pg_current_xact_id()::text`. Trigger checks and immediately deletes (`DELETE ... RETURNING 1`) the exact matching record. Cross-transaction records, stale jobs, and concurrent writes are mathematically isolated. | **Section 5.3, 5.4, 8.1** |
| **2. Unsafe Audit-Log Check for Profile Submission** | Removed timestamp-based audit-log checks. `submit_profile_for_review()` writes an explicit authorization record into `profile_action_authorizations` for `('submit_profile_for_review', old_status, 'under_review')`. `protect_profile_columns()` verifies and consumes the record atomically. Direct status updates by students are strictly blocked. | **Section 5.4, 8.1** |
| **3. Canonical Rate-Limiter Action Whitelist** | Retained the 5 canonical action names settled in Revision 1.4: `signup`, `submit_review`, `replace_id`, `review_action`, `view_college_id`. Documented native GoTrue rate limiting for email OTP/link dispatch and PostgREST session limits for routine draft edits. | **Section 7.1, 7.2, 8.1** |
| **4. Adversarial Database Test Suite** | Added dedicated adversarial pgTAP tests covering: cross-transaction rejection, path/student mismatch rejection, direct auth-table injection denial, pre-existing deletion job bypass rejection, stale audit record rejection, and full rollback atomicity. | **Section 9.1** |
| **5. Storage Deletion Hygiene & ID Lifecycle** | Preserved exact Phase 3 storage queue invariants: final decisions (`approved`, `rejected`) enqueue active ID for deletion; `correction_required` retains ID until replaced via `replace_college_id()`, which enqueues superseded ID atomically. | **Section 5.3, 8.1** |
| **6. Email Domain Policy (Universal Email Acceptance)** | Specified that Supabase Auth verifies ownership of the student's supplied email address without enforcing `@nmit.ac.in` or any institutional domain restriction. Personal and institutional email addresses are accepted; institutional eligibility is verified separately through compulsory College ID upload and administrator review. | **Section 4.2, 10.1, 12** |
| **7. Registration-Status Constraint Consistency (`chk_profiles_status`)** | Verified actual Phase 3 constraint `chk_profiles_status` on `public.profiles`. Phase 4 migration safely replaces constraint via `ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_status; ADD CONSTRAINT chk_profiles_status CHECK (registration_status IN ('draft', 'pending_verification', 'under_review', 'approved', 'rejected', 'correction_required', 'suspended'))`. Fully enables reviewer transition to `correction_required` and student resubmission to `under_review` without duplicate/missing constraint errors on clean `supabase db reset`. Expanded test suite to 30 tests (`TS-ONB-29`, `TS-ONB-30`). | **Section 5.1, 8.1, 9.1** |

---

## 2. Repository Baseline & Environment Inspection

### 2.1 Workspace Identity
- **Repository Root:** `/Volumes/CodingVault/web/HackLeague`
- **Active Git Branch:** `v1` (Strictly verified via `git branch --show-current`)
- **Current HEAD Commit:** `8e09d017e61fa9564fb32f82a6b2289f81ca9532` (`feat(phase-3): add secure PostgreSQL schema and RLS`)
- **Working Tree State:** Clean of tracked modifications. Pre-existing untracked files (`public/nmit.jpeg`, `graphify-out/`, `hackleague_plan.md`) are strictly preserved.
- **Supabase Local State:** Docker container running PostgreSQL 17 engine on port `54322`, API gateway on port `54321`. Unlinked from hosted cloud (`"linked_project": null`). All 11 migrations applied; all 10 pgTAP test suites (101 tests) passing.

### 2.2 Actual Dependencies & Tooling
- **Next.js:** `^16.4.0` (App Router)
- **React / React DOM:** `^19.0.0`
- **TypeScript:** `^5.7.0`
- **Tailwind CSS:** `^4.0.0` (`@tailwindcss/postcss: ^4.0.0`)
- **Required New Dependencies:** `@supabase/ssr`, `@supabase/supabase-js`, `zod` (to be installed upon implementation authorization).

### 2.3 Actual Phase 3 Schema Objects Reused
1. **`public.profiles` Table:** Columns: `id`, `email`, `full_name`, `usn`, `phone`, `branch`, `academic_year`, `profile_photo_path`, `college_id_path`, `college_id_deleted_at`, `registration_status`, `rejection_reason`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`.
2. **`public.admin_profiles` & `public.admin_permissions` Tables:** Single Super Admin invariant; granular permissions `'verify_students'`, `'manage_students'`.
3. **Trigger `protect_profile_columns()` (`20261012000002_create_profiles_and_admin_tables.sql:153`):**
   - Blocks direct update of `id` and Auth-managed `email`.
   - Blocks non-admin modification of `registration_status`, `rejection_reason`, `reviewed_by`, `reviewed_at`, `college_id_deleted_at`.
   - Freezes approved student details (`usn`, `full_name`, `branch`, `academic_year`, `college_id_path`, `sex`, `date_of_birth`).
   - Validates that `college_id_path` and `profile_photo_path` reside within student's folder, exist in `storage.objects`, and match owner metadata.
4. **Storage Deletion Infrastructure (`20261012000008_create_storage_deletion_queue_table.sql` & `20261012000010_create_security_functions_and_rpc.sql`):**
   - Table `public.storage_deletion_queue`: `id`, `bucket_id`, `object_path`, `target_type`, `target_id`, `status`, `created_at`, `updated_at`.
   - RPC `enqueue_storage_deletion_job(bucket, path, target_type, target_id)`: Granted exclusively to `service_role`.
   - Unique partial index: `uq_storage_queue_active_job` on `(bucket_id, object_path)` WHERE `status IN ('pending', 'processing')`.

---

## 3. Architecture & Boundary Overview

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               NEXT.JS APPLICATION (VERCEL)                              │
│                                                                                        │
│  ┌────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────┐  │
│  │    Client Components   │   │     Server Actions       │   │    Route Handlers    │  │
│  │ (Forms, State, Upload) │──►│ (Validation, Guards,     │──►│ (/auth/callback,     │  │
│  │                        │   │  Rate Limiting, Auth)    │   │  /api/cron/...)      │  │
│  └────────────────────────┘   └──────────────────────────┘   └──────────────────────┘  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTPS / RPC / REST
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              SUPABASE POSTGRESQL & GOTRUE                              │
│                                                                                        │
│  ┌────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────┐  │
│  │     Supabase Auth      │   │  Phase 4 RPC Functions   │   │   Phase 3 Schema     │  │
│  │ (GoTrue Users, Tokens, │──►│ (submit_profile_for_     │──►│ (profiles,           │  │
│  │  Email Dispatch)       │   │  review, replace_id,     │   │  admin_profiles,     │  │
│  └────────────────────────┘   │  consume_rate_limit)     │   │  deletion_queue)     │  │
│                               └─────────────┬────────────┘   └──────────────────────┘  │
│                                             │ atomic token                             │
│                                             ▼                                          │
│                               ┌──────────────────────────┐                             │
│                               │ profile_action_          │                             │
│                               │ authorizations (private) │                             │
│                               └──────────────────────────┘                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Student Authentication & Registration Architecture

### 4.1 Registration Workflow: Atomic Trigger-Based Pattern

```
1. Student enters registration details (full_name, usn, email, phone, branch, academic_year, sex, date_of_birth, password).
2. Server Action validates inputs against Zod schema (checks age >= 15, valid sex enum, USN pattern).
3. Server Action checks rate limit: consume_rate_limit('signup', hmac(client_ip)) via service_role client.
4. Server Action executes supabase.auth.signUp() passing validated student fields in user_metadata.
5. In PostgreSQL:
   auth.users INSERT fires handle_new_auth_user() trigger.
   Trigger validates metadata, enforces minimum age 15, inserts atomic row into public.profiles:
   - registration_status = 'draft'
   - college_id_path = NULL
   - Demographics populated
6. Supabase Auth generates email verification OTP / link dispatched through Inbucket (local) / Resend (hosted).
7. If trigger fails (e.g. duplicate USN or underage):
   Transaction rolls back; auth.users row is NOT created; zero verification emails are dispatched.
```

### 4.2 Decoupled Verification & Profile State
- **Email Verification State (`auth.users.email_confirmed_at`):** Indicates solely that the student owns the supplied email address. Registration accepts any syntactically valid email address (including personal email addresses such as Gmail, Outlook, Yahoo, or personal domains); `@nmit.ac.in` or any other institutional domain is explicitly NOT required. Institutional eligibility is verified separately through compulsory College ID card upload and authorized administrator review.
- **Academic Verification State (`profiles.registration_status`):** Tracks verification of identity and College ID card.
- **Invariant:** Confirming email advances `email_confirmed_at`, but `registration_status` remains strictly `'draft'` until the student uploads their College ID and calls `submit_profile_for_review()`.

---

## 5. Demographics, ID Replacement & Transaction Authorization

### 5.1 Safe Demographics Migration & Registration-Status Constraint Evolution

#### A. Safe Demographics Addition
Phase 3 created `public.profiles` with existing student rows in `supabase/seed.sql`. Adding `NOT NULL` columns directly would fail on existing rows.
Phase 4 applies the following safe migration strategy:
1. Add columns `sex` and `date_of_birth` as **nullable**:
   ```sql
   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sex public.gender;
   ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
   ```
2. Add immutable validity constraint:
   ```sql
   ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_dob_valid CHECK (
     date_of_birth IS NULL OR (
       date_of_birth >= '1900-01-01'::date AND
       date_of_birth <= '2100-01-01'::date
     )
   );
   ```
3. Update `supabase/seed.sql` to populate synthetic demographics for seed students.
4. Enforce mandatory demographics presence and minimum age 15 on:
   - **Signup Trigger:** `handle_new_auth_user()` rejects new signups missing demographics or under 15.
   - **Profile Update Trigger:** `protect_profile_columns()` rejects profile updates setting an underage date.
   - **Submission RPC:** `submit_profile_for_review()` enforces presence of demographics and minimum age 15 before advancing status to `under_review`.

#### B. Registration-Status Constraint Resolution (`chk_profiles_status`)
Direct inspection of the actual Phase 3 baseline migration (`supabase/migrations/20261012000002_create_profiles_and_admin_tables.sql:124`) reveals the exact table constraint definition:
```sql
CONSTRAINT chk_profiles_status CHECK (registration_status IN ('draft', 'pending_verification', 'under_review', 'approved', 'rejected', 'suspended'))
```
- **Exact Constraint Name:** `chk_profiles_status` on `public.profiles`.
- **Existing Phase 3 Permitted Values (Before):** `'draft'`, `'pending_verification'`, `'under_review'`, `'approved'`, `'rejected'`, `'suspended'` (6 statuses).
- **The Defect:** In Phase 3, `'correction_required'` is **not** included in `chk_profiles_status`. If an administrator attempts to request corrections via `review_student_registration(p_student_id, 'correction_required', 'Please re-upload a clearer College ID')`, PostgreSQL throws an immediate runtime exception: `new row for relation "profiles" violates check constraint "chk_profiles_status"`.
- **Safe Phase 4 Replacement Migration (After):**
  To support the full Phase 4 workflow safely and idempotently without breaking clean `supabase db reset` runs, the Phase 4 migration explicitly replaces the constraint:
  ```sql
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_status;
  ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_status CHECK (
    registration_status IN (
      'draft',
      'pending_verification',
      'under_review',
      'approved',
      'rejected',
      'correction_required',
      'suspended'
    )
  );
  ```
- **Reset & Idempotency Guarantees:**
  1. `DROP CONSTRAINT IF EXISTS` ensures the migration applies cleanly whether run incrementally or during a complete `supabase db reset` where Phase 3 initially created the 6-status check constraint.
  2. `ADD CONSTRAINT` restores the check constraint under the exact canonical name `chk_profiles_status`, preventing duplicate-constraint errors or missing-constraint states.
  3. All 6 pre-existing statuses are strictly preserved, guaranteeing backward compatibility for legacy records in `'pending_verification'`, pre-existing seeds, and existing database queries.
  4. The newly permitted `'correction_required'` status enables the reviewer correction workflow, ID replacement via `replace_college_id()`, and seamless resubmission to `'under_review'`.

### 5.2 Dynamic Age & Leap-Day Date Validation
- Volatile expressions such as `CURRENT_DATE` are strictly excluded from table `CHECK` constraints.
- Dynamic age calculation is enforced inside PostgreSQL procedural functions:
  ```sql
  IF (v_date_of_birth + INTERVAL '15 years') > CURRENT_DATE THEN
    RAISE EXCEPTION 'Student must be at least 15 years of age to register.';
  END IF;
  ```
- **Leap-Day Behavior:** In PostgreSQL, adding `INTERVAL '15 years'` to a February 29 leap-day birthday (`'2008-02-29'::date + INTERVAL '15 years'`) deterministically evaluates to `'2023-02-28 00:00:00'`. Comparing against `CURRENT_DATE` ensures students born on leap days reach age 15 on February 28th of non-leap years, matching institutional VTU standards and Zod client validation.

### 5.3 Complete College ID Replacement Architecture

#### The Flaw in Timestamp-Based Checks
In Revision 1.4, the trigger checked `(q.created_at >= transaction_timestamp() OR q.updated_at >= transaction_timestamp())` on `storage_deletion_queue`. This approach was flawed:
1. `transaction_timestamp()` can match records created by concurrent transactions or pre-existing records sharing the same start timestamp.
2. `storage_deletion_queue` does not contain the `new_path`, so it could not verify that authorization was granted for transitioning from the specific `old_path` to the specific `new_path`.
3. It did not cryptographically bind the operation to the current transaction.

#### The Transaction-Bound Authorization Token Pattern (`profile_action_authorizations`)
Phase 4 implements a dedicated, private, ephemeral authorization table in PostgreSQL:

```sql
CREATE TABLE public.profile_action_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xact_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('replace_college_id', 'submit_profile_for_review')),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX idx_profile_action_auth_lookup
ON public.profile_action_authorizations (xact_id, student_id, action_type);

REVOKE ALL ON TABLE public.profile_action_authorizations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.profile_action_authorizations TO service_role;
ALTER TABLE public.profile_action_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_action_authorizations FORCE ROW LEVEL SECURITY;
```

#### Exact Operation Ordering in `replace_college_id()`:
1. **Pre-checks:** Validate authenticated caller (`v_user_id := auth.uid()`), lock profile row with `SELECT FOR UPDATE`, verify `registration_status = 'correction_required'`.
2. **Storage Object Verification:** Validate that `p_new_storage_path` resides in `${v_user_id}/`, exists in `storage.objects` (bucket `'college-ids'`), and matches student ownership metadata.
3. **Queue Superseded File:** Call `enqueue_storage_deletion_job('college-ids', v_old_path, 'profile_college_id_superseded', v_user_id::text)`.
4. **Issue Ephemeral Authorization:**
   Insert an authorization row bound to the current transaction ID:
   ```sql
   INSERT INTO public.profile_action_authorizations (
     xact_id, student_id, action_type, old_value, new_value
   ) VALUES (
     pg_current_xact_id()::text, v_user_id, 'replace_college_id', v_old_path, p_new_storage_path
   );
   ```
5. **Update Profile Path:**
   ```sql
   UPDATE public.profiles
   SET college_id_path = p_new_storage_path,
       updated_at = now()
   WHERE id = v_user_id;
   ```
6. **Trigger Validation & Atomic Token Consumption:**
   The trigger `protect_profile_columns()` fires BEFORE UPDATE:
   ```sql
   IF OLD.registration_status = 'correction_required' AND NOT v_is_admin_or_service THEN
     DELETE FROM public.profile_action_authorizations
     WHERE xact_id = pg_current_xact_id()::text
       AND student_id = OLD.id
       AND action_type = 'replace_college_id'
       AND old_value = OLD.college_id_path
       AND new_value = NEW.college_id_path
     RETURNING 1 INTO v_authorized;

     IF v_authorized IS NULL THEN
       RAISE EXCEPTION 'Direct update of college_id_path is blocked in correction_required status. Use the replace_college_id() RPC.';
     END IF;
   END IF;
   ```
7. **Audit Log & Commit:**
   Insert audit log (`college_id.replaced`). Transaction commits.

#### Why All Attack Vectors Fail:
- **Cross-Transaction Isolation:** In PostgreSQL, `pg_current_xact_id()` returns the top-level 64-bit transaction identifier (`xid8`). Every read-write transaction receives a globally unique, monotonically increasing ID. A record written in Transaction A has `xact_id = XA`. When Transaction B runs, its transaction ID is `XB != XA`. The trigger's `xact_id = pg_current_xact_id()::text` check can **never** match across transactions.
- **Stale Record Protection:** The trigger consumes the authorization row immediately on evaluation via `DELETE ... RETURNING 1`. It cannot be re-used.
- **Student & Path Tampering Protection:** The query checks `student_id = OLD.id`, `old_value = OLD.college_id_path`, and `new_value = NEW.college_id_path`. An authorization generated for Student A cannot authorize Student B; an authorization for `path_1 -> path_2` cannot authorize an update to `path_3`.
- **Direct Client Request Denial:** `REVOKE ALL ON TABLE public.profile_action_authorizations FROM PUBLIC, anon, authenticated;` is strictly enforced with RLS. Ordinary students cannot SELECT, INSERT, UPDATE, or DELETE from this table. Direct PostgREST calls or raw SQL cannot create authorization evidence.
- **Zero Client-Controlled State:** No request headers, URL parameters, body flags, or session variables (`SET LOCAL`) are trusted.
- **Rollback Atomicity:** If any part of the RPC fails (e.g. storage trigger checks on `NEW.college_id_path`), the transaction aborts. MVCC rolls back the profile update, the deletion queue insertion, and the authorization row insertion simultaneously.

### 5.4 Student Profile Submission Authorization
Applying the identical security contract to `submit_profile_for_review()`:

1. **Pre-checks:** Validate caller is authenticated, enforce rate limit `consume_rate_limit('submit_review')`, lock profile row, verify status is `('draft', 'correction_required')`, verify `college_id_path IS NOT NULL`, verify demographics and age >= 15.
2. **Issue Ephemeral Authorization:**
   ```sql
   INSERT INTO public.profile_action_authorizations (
     xact_id, student_id, action_type, old_value, new_value
   ) VALUES (
     pg_current_xact_id()::text, v_user_id, 'submit_profile_for_review', v_profile.registration_status, 'under_review'
   );
   ```
3. **Update Profile Status:**
   ```sql
   UPDATE public.profiles
   SET registration_status = 'under_review',
       rejection_reason = NULL,
       updated_at = now()
   WHERE id = v_user_id;
   ```
4. **Trigger Validation & Atomic Token Consumption:**
   In `protect_profile_columns()`:
   ```sql
   IF (OLD.registration_status IS DISTINCT FROM NEW.registration_status OR ...) THEN
     IF NOT v_is_admin_or_service THEN
       IF OLD.registration_status IN ('draft', 'correction_required')
          AND NEW.registration_status = 'under_review'
          AND NEW.rejection_reason IS NULL
          AND NEW.reviewed_by IS NOT DISTINCT FROM OLD.reviewed_by
          AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at
          AND NEW.college_id_deleted_at IS NOT DISTINCT FROM OLD.college_id_deleted_at THEN

         DELETE FROM public.profile_action_authorizations
         WHERE xact_id = pg_current_xact_id()::text
           AND student_id = OLD.id
           AND action_type = 'submit_profile_for_review'
           AND old_value = OLD.registration_status
           AND new_value = 'under_review'
         RETURNING 1 INTO v_authorized;

         IF v_authorized IS NULL THEN
           RAISE EXCEPTION 'Direct update of registration_status is blocked. Use the submit_profile_for_review() RPC.';
         END IF;
       ELSE
         RAISE EXCEPTION 'Unauthorized column modification: registration_status can only be updated via submit_profile_for_review() RPC or by authorized administrators.';
       END IF;
     END IF;
   END IF;
   ```
5. **Audit Log & Commit:**
   `submit_profile_for_review()` writes `student.submitted_for_review` to `audit_logs` and commits.
   Direct `UPDATE profiles SET registration_status = 'under_review'` by any student fails immediately because no authorization row exists for their transaction ID.

---

## 6. Administrative Review & Suspension Workflow

### 6.1 Review Decisions, Permitted Statuses & State Transition Matrix

#### A. The Seven Permitted Registration Statuses
To maintain mathematical consistency between application route guards, RPC functions, trigger checks, and the PostgreSQL database constraint `chk_profiles_status`, the system strictly defines exactly **seven permitted registration statuses**:

| Status Name | Category | Primary Meaning & Usage | Lifecycle Position | Deletion Queue Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **`draft`** | Initial | Initial status created automatically upon signup by `handle_new_auth_user()`. Student completes onboarding details and uploads ID card. | Pre-submission | No deletion queued |
| **`pending_verification`** | Legacy | Retained strictly for backward compatibility with Phase 3 records and seed data. Treated identically to `under_review` by reviewers and route guards. | Active review | No deletion queued |
| **`under_review`** | Active Review | Set when student completes onboarding and invokes `submit_profile_for_review()`, or resubmits after correction. Awaiting reviewer action. | Active review | No deletion queued |
| **`approved`** | Terminal (Active) | Reviewer accepts student registration via `review_student_registration('approved')`. Profile details are frozen; student portal unlocked. | Terminal | Active College ID enqueued (`profile_college_id`) |
| **`rejected`** | Terminal (Inactive) | Reviewer rejects registration with mandatory reason via `review_student_registration('rejected', reason)`. USN cannot re-register. | Terminal | Active College ID enqueued (`profile_college_id`) |
| **`correction_required`** | Actionable Feedback | Reviewer requests corrections with mandatory feedback via `review_student_registration('correction_required', reason)`. Profile remains editable. | Remediation | Active College ID **retained** (NOT enqueued until superseded) |
| **`suspended`** | Administrative Freeze | Student account suspended administratively. Access to portal, onboarding, and status pages is blocked. | Administrative | Dependent on administrative policy |

#### B. Complete State Machine & Transition Matrix
The table below specifies every legal status transition in the NMIT HackLeague system:

| Origin Status | Target Status | Executed Operation | Caller Authority | Prerequisites & Validations | Trigger / Constraint Invariant |
| :--- | :--- | :--- | :--- | :--- | :--- |
| *[None]* | `draft` | Signup insertion | Auth trigger (`handle_new_auth_user`) | Valid metadata, valid USN regex, demographics present, age >= 15 | Permitted by `chk_profiles_status`. Row created with `draft`. |
| `draft` | `under_review` | `submit_profile_for_review()` | `authenticated` student | Mandatory College ID uploaded; demographics present; age >= 15 | Ephemeral token issued; `protect_profile_columns()` consumes token; direct `UPDATE` blocked. |
| `under_review` | `approved` | `review_student_registration()` | `authenticated` admin (`verify_students`) | Active admin profile; rate limit OK | Permitted by `chk_profiles_status`; active ID enqueued for deletion; profile details frozen. |
| `under_review` | `rejected` | `review_student_registration()` | `authenticated` admin (`verify_students`) | Active admin profile; non-empty `rejection_reason` | Permitted by `chk_profiles_status`; active ID enqueued for deletion; status marked terminal. |
| `under_review` | `correction_required` | `review_student_registration()` | `authenticated` admin (`verify_students`) | Active admin profile; non-empty `rejection_reason` | Permitted by `chk_profiles_status`; active ID **retained**; student profile remains editable. |
| `pending_verification` *(legacy)* | `approved` / `rejected` / `correction_required` | `review_student_registration()` | `authenticated` admin (`verify_students`) | Active admin profile; same rules as `under_review` | Legacy compatibility preserved; transitions operate identically to `under_review`. |
| `correction_required` | `correction_required` | `replace_college_id(new_path)` | `authenticated` student | New storage object owned by student; differs from old ID | Superseded ID enqueued (`profile_college_id_superseded`); ephemeral token consumed; status remains `correction_required`. |
| `correction_required` | `under_review` | `submit_profile_for_review()` | `authenticated` student | Active ID present; demographics valid; age >= 15 | Ephemeral token issued; `rejection_reason` cleared to NULL; `protect_profile_columns()` consumes token; status becomes `under_review`. |
| *Any Status* | `suspended` | Administrative suspension | `service_role` / Super Admin | Administrative action | Account blocked from all mutations and authenticated routes. |

#### C. Cross-Verification of Functions and Route Guards
1. **`handle_new_auth_user()`:** Inserts `registration_status = 'draft'`. Fully permitted by `chk_profiles_status`.
2. **`protect_profile_columns()`:**
   - Validates that non-admin callers attempting to change status must be transitioning from `('draft', 'correction_required')` to `'under_review'`, must clear `rejection_reason` to NULL, and must possess a matching ephemeral transaction authorization token in `profile_action_authorizations`.
   - Validates that non-admin callers attempting to change `college_id_path` while in `'correction_required'` must possess a matching ephemeral transaction authorization token in `profile_action_authorizations`.
   - Freezes student attributes when status is `'approved'`.
   - All status comparisons match the 7 permitted statuses exactly.
3. **`submit_profile_for_review()`:**
   - Pre-check enforces `v_profile.registration_status IN ('draft', 'correction_required')`.
   - Updates `registration_status = 'under_review'` and `rejection_reason = NULL`.
   - Both the initial transition (`draft -> under_review`) and the correction return (`correction_required -> under_review`) are fully permitted by `chk_profiles_status` and trigger authorization.
4. **`replace_college_id()`:**
   - Pre-check enforces `v_profile.registration_status = 'correction_required'`.
   - Updates `college_id_path` without mutating `registration_status`.
   - Enqueues superseded ID to `storage_deletion_queue` atomically.
5. **`review_student_registration()`:**
   - Pre-check enforces `v_profile.registration_status IN ('under_review', 'pending_verification')`.
   - Decision validation enforces `p_decision IN ('approved', 'rejected', 'correction_required')`.
   - Target status updates (`approved`, `rejected`, `correction_required`) are fully permitted by `chk_profiles_status`.
6. **Application Route Guards & Status Pages:**
   - `/onboarding`: accessible when `registration_status = 'draft'`.
   - `/status/pending`: accessible when `registration_status IN ('under_review', 'pending_verification')`.
   - `/status/rejected`: serves dual mode:
     - When `registration_status = 'rejected'`: displays terminal rejection notice and admin feedback.
     - When `registration_status = 'correction_required'`: displays reviewer feedback, editable profile inputs, College ID replacement dropzone invoking `replace_college_id()`, and resubmission CTA invoking `submit_profile_for_review()`.
   - `/status/suspended`: accessible when `registration_status = 'suspended'`.
   - `/student/*`: accessible when `registration_status = 'approved'`.
   Every single route guard aligns with the 7 supported statuses. No undefined status exists in the routing tree.

### 6.2 Suspended-State Enforcement Matrix

| Entity & Role | Route Access | Mutation / RPC Permissions | Redirection / Response |
| :--- | :--- | :--- | :--- |
| **Suspended Student** (`registration_status = 'suspended'`) | Blocked from `/student/*`, `/onboarding`, `/status/pending`, `/status/rejected` | Blocked from `submit_profile_for_review()`, `replace_college_id()`, profile updates | Redirected to `/status/suspended`. Mutations throw `P0001: Account is suspended.` |
| **Suspended Admin** (`admin_profiles.is_active = false`) | Blocked from `/admin/*` | Blocked from `review_student_registration()`, ID view signed URLs | Redirected to `/login`. RPCs throw `P0001: Unauthorized or inactive administrator.` |

---

## 7. Security Architecture & Rate Limiting

### 7.1 Canonical Rate-Limiter Action Whitelist
To eliminate discrepancies between SQL definitions, RPC implementations, Server Actions, and test suites, exactly **5 canonical rate-limited actions** are defined:

| Action Name | Execution Authority | Identity Derivation in PostgreSQL | Window & Quota | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **`signup`** | `service_role` only | `anon:` \|\| `p_custom_key` (IP-HMAC from Server Action) | 5 requests / 3600s (1 hr) | Rate-limits unauthenticated signup attempts per client IP |
| **`submit_review`** | `authenticated` student | `user:` \|\| `auth.uid()::text` (Caller key ignored) | 5 requests / 900s (15 min) | Prevents rapid profile submission probing |
| **`replace_id`** | `authenticated` student | `user:` \|\| `auth.uid()::text` (Caller key ignored) | 10 requests / 3600s (1 hr) | Restricts College ID replacement uploads during correction |
| **`review_action`** | `authenticated` admin | `admin:` \|\| `auth.uid()::text` (Caller key ignored) | 120 requests / 300s (5 min) | Protects admin approval/rejection endpoints from abuse |
| **`view_college_id`** | `authenticated` admin | `admin:` \|\| `auth.uid()::text` (Caller key ignored) | 60 requests / 300s (5 min) | Limits signed URL generation for private College IDs |

- **Native Supabase Auth Limits:** Email OTP / magic link dispatch and resend verification rely natively on GoTrue's built-in email rate limiter (`rate_limit_email_sent` in `config.toml`, 30/hour, 1 per 60s per user).
- **Draft Profile Metadata Updates:** Standard profile field edits prior to submission rely on PostgREST session rate limits without custom bucket consumption.

### 7.2 Atomic Rate Limiter SQL Function (`consume_rate_limit`)

```sql
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket_key, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_prune
ON public.rate_limit_buckets (window_start);

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_action TEXT,
  p_custom_key TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_key TEXT;
  v_max_requests INT;
  v_window_seconds INT;
  v_count INT;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_role TEXT := COALESCE(auth.role(), 'none');
BEGIN
  -- 1. Determine key and fixed limits strictly based on server logic (NOT caller parameters)
  IF p_action = 'signup' THEN
    IF v_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Access denied: unauthenticated action rate-limiting requires service_role authority.';
    END IF;
    IF p_custom_key IS NULL OR length(trim(p_custom_key)) < 16 THEN
      RAISE EXCEPTION 'Valid client IP HMAC key required for unauthenticated signup limiting.';
    END IF;
    v_key := 'anon:' || trim(p_custom_key);
    v_max_requests := 5;      -- Max 5 signups per hour per IP
    v_window_seconds := 3600; -- 1 hour window

  ELSIF p_action = 'submit_review' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    v_key := 'user:' || auth.uid()::text;
    v_max_requests := 5;      -- Max 5 submissions
    v_window_seconds := 900;  -- per 15 mins

  ELSIF p_action = 'replace_id' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    v_key := 'user:' || auth.uid()::text;
    v_max_requests := 10;     -- Max 10 uploads
    v_window_seconds := 3600; -- per hour

  ELSIF p_action = 'review_action' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    v_key := 'admin:' || auth.uid()::text;
    v_max_requests := 120;    -- Max 120 review actions
    v_window_seconds := 300;  -- per 5 mins

  ELSIF p_action = 'view_college_id' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required.'; END IF;
    v_key := 'admin:' || auth.uid()::text;
    v_max_requests := 60;     -- Max 60 ID views
    v_window_seconds := 300;  -- per 5 mins

  ELSE
    RAISE EXCEPTION 'Unknown rate-limited action: %', p_action;
  END IF;

  -- 2. Concurrency-safe atomic upsert with row-level lock
  INSERT INTO public.rate_limit_buckets (bucket_key, action, window_start, request_count)
  VALUES (v_key, p_action, v_now, 1)
  ON CONFLICT (bucket_key, action) DO UPDATE
  SET request_count = CASE
        WHEN public.rate_limit_buckets.window_start < (v_now - (v_window_seconds || ' seconds')::interval) THEN 1
        ELSE public.rate_limit_buckets.request_count + 1
      END,
      window_start = CASE
        WHEN public.rate_limit_buckets.window_start < (v_now - (v_window_seconds || ' seconds')::interval) THEN v_now
        ELSE public.rate_limit_buckets.window_start
      END
  RETURNING request_count INTO v_count;

  -- 3. Evaluate threshold
  IF v_count > v_max_requests THEN
    RETURN false; -- Rate limit exceeded
  END IF;

  RETURN true; -- Allowed
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT) TO authenticated, service_role;
```

### 7.3 Client Identity Normalization & Dedicated HMAC Secret
In Server Actions running on Vercel:
```ts
// src/lib/auth/rate-limiter.ts
import { headers } from 'next/headers';
import crypto from 'crypto';

export async function getClientIpKey(): Promise<string> {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('OPERATIONAL_ERROR: RATE_LIMIT_HMAC_SECRET is missing or below 32 characters.');
  }

  const headerList = await headers();
  const forwardedFor = headerList.get('x-forwarded-for') || headerList.get('x-real-ip');

  if (!forwardedFor) {
    throw new Error('SECURITY_ERROR: Missing required client identification header.');
  }

  const rawIp = forwardedFor.split(',')[0].trim();
  const ipv4Regex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  const ipv6Regex = /^[a-fA-F0-9:]+$/;
  if (!ipv4Regex.test(rawIp) && !ipv6Regex.test(rawIp)) {
    throw new Error('SECURITY_ERROR: Malformed client IP header detected.');
  }

  return crypto.createHmac('sha256', secret).update(rawIp).digest('hex');
}
```

### 7.4 Rate-Limit Bucket & Authorization Table Maintenance
A server-only maintenance routine cleans up expired rate limits and any orphaned authorizations:

```sql
CREATE OR REPLACE FUNCTION public.prune_rate_limit_buckets(
  p_batch_size INT DEFAULT 1000
)
RETURNS INT AS $$
DECLARE
  v_deleted INT;
  v_cutoff TIMESTAMPTZ := clock_timestamp() - INTERVAL '24 hours';
BEGIN
  IF COALESCE(auth.role(), 'none') <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Access denied: bucket pruning requires service_role authority.';
  END IF;

  -- 1. Prune expired rate limit buckets
  WITH expired AS (
    SELECT bucket_key, action
    FROM public.rate_limit_buckets
    WHERE window_start < v_cutoff
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.rate_limit_buckets b
  USING expired e
  WHERE b.bucket_key = e.bucket_key AND b.action = e.action;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2. Defensive maintenance: purge any unconsumed authorizations older than 1 hour
  DELETE FROM public.profile_action_authorizations
  WHERE created_at < clock_timestamp() - INTERVAL '1 hour';

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.prune_rate_limit_buckets(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_rate_limit_buckets(INT) TO service_role;
```

---

## 8. Privileged PostgreSQL Functions Audit

The following table documents all privileged routines maintained or created in Phase 4:

| Function Name | Owner | Search Path | Execution Grants | Internal Identity & Auth Checks | Input Validation & State Transition | PostgREST Direct Call Defense |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`protect_profile_columns()`** | `postgres` | `public, pg_temp` | `authenticated` (Trigger only) | Validates caller role, admin permissions, or transaction token in `profile_action_authorizations` | Blocks direct path changes in `correction_required` and status changes without transaction token | Trigger function; cannot be called directly via PostgREST RPC |
| **`handle_new_auth_user()`** | `postgres` | `public, pg_temp` | Trigger only (No direct grant) | Executes via `AFTER INSERT ON auth.users` | Validates `full_name`, `usn` regex, `sex`, `date_of_birth` (age >= 15); inserts profile in `draft` | Trigger function; cannot be called directly via PostgREST RPC |
| **`submit_profile_for_review()`** | `postgres` | `public, pg_temp` | `authenticated` | `v_user_id := auth.uid()`; throws if null | Verifies status in `('draft', 'correction_required')`, `college_id_path IS NOT NULL`, `sex` & `dob` present. Writes transaction token. Advances to `under_review`. | Direct PostgREST RPC call by unauthenticated caller fails with `P0001` |
| **`replace_college_id(p_new_path)`**| `postgres` | `public, pg_temp` | `authenticated` | `v_user_id := auth.uid()`; throws if null | Verifies status is `correction_required`. Verifies new path exists in `college-ids` and is owned by caller. Queues old path, writes transaction token, updates profile. | Direct call validates caller ownership and `storage.objects` metadata |
| **`review_student_registration(...)`**| `postgres` | `public, pg_temp` | `authenticated` | Verifies `current_has_permission('verify_students')` OR `current_is_super_admin()` | Verifies student is `under_review` or `pending_verification`. Requires non-empty reason for rejection/correction. Atomic profile update + queue insertion. | Unauthorized caller raises `P0001: Access denied: requires verify_students` |
| **`consume_rate_limit(p_action, p_key)`**| `postgres` | `public, pg_temp` | `authenticated`, `service_role` | `signup` requires `auth.role() = 'service_role'`. Authenticated actions ignore `p_key` and derive key strictly from `auth.uid()`. | Validates `p_action` against canonical whitelist. Limits hardcoded inside function. Concurrency-safe atomic upsert. | Ordinary authenticated caller cannot use `signup` action or pass spoofed keys |
| **`prune_rate_limit_buckets(p_batch)`**| `postgres` | `public, pg_temp` | `service_role` | Requires `auth.role() = 'service_role'` | Deletes rows where `window_start < now() - 24 hours` using `SKIP LOCKED` | Direct call by `anon` or `authenticated` fails with `Access denied` |

### 8.1 SQL Definitions for Migration `20261013000001_phase4_onboarding_and_review.sql`

```sql
-- ============================================================================
-- Migration: 20261013000001_phase4_onboarding_and_review.sql
-- Phase 4: Demographics, Triggers, Review & Rate Limiting RPCs
-- ============================================================================

-- 1. Add demographic columns safely
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sex public.gender;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_dob_valid;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_dob_valid CHECK (
  date_of_birth IS NULL OR (
    date_of_birth >= '1900-01-01'::date AND
    date_of_birth <= '2100-01-01'::date
  )
);

-- 2. Safely replace registration status check constraint to include 'correction_required'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_status;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_status CHECK (
  registration_status IN (
    'draft',
    'pending_verification',
    'under_review',
    'approved',
    'rejected',
    'correction_required',
    'suspended'
  )
);

-- 3. Signup Trigger Function handle_new_auth_user()
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_usn TEXT;
  v_phone TEXT;
  v_branch TEXT;
  v_academic_year INT;
  v_sex public.gender;
  v_dob DATE;
BEGIN
  v_full_name := trim(COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  v_usn := upper(trim(COALESCE(NEW.raw_user_meta_data->>'usn', '')));
  v_phone := trim(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
  v_branch := trim(COALESCE(NEW.raw_user_meta_data->>'branch', ''));
  v_academic_year := (NEW.raw_user_meta_data->>'academic_year')::INT;
  v_sex := (NEW.raw_user_meta_data->>'sex')::public.gender;
  v_dob := (NEW.raw_user_meta_data->>'date_of_birth')::DATE;

  -- Validate mandatory registration fields
  IF v_full_name = '' OR v_usn = '' OR v_phone = '' OR v_branch = '' OR v_academic_year IS NULL OR v_sex IS NULL OR v_dob IS NULL THEN
    RAISE EXCEPTION 'Missing required registration details in user metadata.';
  END IF;

  -- Validate minimum age 15
  IF (v_dob + INTERVAL '15 years') > CURRENT_DATE THEN
    RAISE EXCEPTION 'Student must be at least 15 years of age to register.';
  END IF;

  -- Insert profile atomically in draft status
  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status
  ) VALUES (
    NEW.id, NEW.email, v_full_name, v_usn, v_phone, v_branch, v_academic_year, v_sex, v_dob, 'draft'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Create private transaction-authorization table
CREATE TABLE IF NOT EXISTS public.profile_action_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  xact_id TEXT NOT NULL,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('replace_college_id', 'submit_profile_for_review')),
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_profile_action_auth_lookup
ON public.profile_action_authorizations (xact_id, student_id, action_type);

REVOKE ALL ON TABLE public.profile_action_authorizations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.profile_action_authorizations TO service_role;
ALTER TABLE public.profile_action_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_action_authorizations FORCE ROW LEVEL SECURITY;

-- 5. Update trigger function protect_profile_columns()
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER AS $$
DECLARE
  v_is_super_or_service BOOLEAN;
  v_is_admin_or_service BOOLEAN;
  v_authorized INT;
BEGIN
  -- Primary key protection
  IF OLD.id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'Profile ID cannot be modified.';
  END IF;

  v_is_super_or_service := (
    (current_user IN ('postgres', 'supabase_admin') AND (auth.role() IS NULL OR auth.role() = 'service_role')) OR
    (auth.role() IS NOT NULL AND auth.role() = 'service_role') OR
    public.current_is_super_admin()
  );

  v_is_admin_or_service := (
    v_is_super_or_service OR
    public.current_has_permission('verify_students') OR
    public.current_has_permission('manage_students')
  );

  -- 1. Profile email protection (managed strictly by Supabase Auth)
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    IF NOT v_is_super_or_service THEN
      RAISE EXCEPTION 'Profile email is managed by authentication and cannot be updated directly.';
    END IF;
  END IF;

  -- 2. Administrative fields guarded from non-admin updates
  IF (OLD.registration_status IS DISTINCT FROM NEW.registration_status OR
      OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason OR
      OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by OR
      OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at OR
      OLD.college_id_deleted_at IS DISTINCT FROM NEW.college_id_deleted_at) THEN

    IF NOT v_is_admin_or_service THEN
      -- Verify ephemeral transaction authorization for submit_profile_for_review()
      IF OLD.registration_status IN ('draft', 'correction_required')
         AND NEW.registration_status = 'under_review'
         AND NEW.rejection_reason IS NULL
         AND NEW.reviewed_by IS NOT DISTINCT FROM OLD.reviewed_by
         AND NEW.reviewed_at IS NOT DISTINCT FROM OLD.reviewed_at
         AND NEW.college_id_deleted_at IS NOT DISTINCT FROM OLD.college_id_deleted_at THEN

        DELETE FROM public.profile_action_authorizations
        WHERE xact_id = pg_current_xact_id()::text
          AND student_id = OLD.id
          AND action_type = 'submit_profile_for_review'
          AND old_value = OLD.registration_status
          AND new_value = 'under_review'
        RETURNING 1 INTO v_authorized;

        IF v_authorized IS NULL THEN
          RAISE EXCEPTION 'Direct update of registration_status is blocked. Use the submit_profile_for_review() RPC.';
        END IF;
      ELSE
        RAISE EXCEPTION 'Unauthorized column modification: registration_status and review metadata can only be updated by authorized administrators.';
      END IF;
    END IF;
  END IF;

  -- 3. Approved student details frozen against direct modification
  IF OLD.registration_status = 'approved' AND NOT v_is_super_or_service THEN
    IF (OLD.usn IS DISTINCT FROM NEW.usn OR
        OLD.full_name IS DISTINCT FROM NEW.full_name OR
        OLD.branch IS DISTINCT FROM NEW.branch OR
        OLD.academic_year IS DISTINCT FROM NEW.academic_year OR
        OLD.college_id_path IS DISTINCT FROM NEW.college_id_path OR
        OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth OR
        OLD.sex IS DISTINCT FROM NEW.sex) THEN
      RAISE EXCEPTION 'Approved student details cannot be modified directly. Submit a profile change request.';
    END IF;
  END IF;

  -- 4. Date of birth validation on profile update
  IF (OLD.date_of_birth IS DISTINCT FROM NEW.date_of_birth) AND NEW.date_of_birth IS NOT NULL THEN
    IF (NEW.date_of_birth + INTERVAL '15 years') > CURRENT_DATE THEN
      RAISE EXCEPTION 'Invalid date of birth: student must be at least 15 years old.';
    END IF;
  END IF;

  -- 5. College ID storage path protection
  IF OLD.college_id_path IS DISTINCT FROM NEW.college_id_path THEN
    IF NOT v_is_admin_or_service THEN
      IF NEW.college_id_path IS NULL THEN
        IF OLD.registration_status IN ('under_review', 'approved') THEN
          RAISE EXCEPTION 'College ID cannot be removed while registration is under review or approved.';
        END IF;
      ELSE
        -- Verify ephemeral transaction authorization for replace_college_id()
        IF OLD.registration_status = 'correction_required' THEN
          DELETE FROM public.profile_action_authorizations
          WHERE xact_id = pg_current_xact_id()::text
            AND student_id = OLD.id
            AND action_type = 'replace_college_id'
            AND old_value = OLD.college_id_path
            AND new_value = NEW.college_id_path
          RETURNING 1 INTO v_authorized;

          IF v_authorized IS NULL THEN
            RAISE EXCEPTION 'Direct update of college_id_path is blocked in correction_required status. Use the replace_college_id() RPC.';
          END IF;
        ELSIF OLD.registration_status IN ('under_review', 'approved') THEN
          RAISE EXCEPTION 'College ID cannot be modified while registration is under review or approved.';
        END IF;

        -- Folder containment check
        IF NOT (NEW.college_id_path LIKE (NEW.id::text || '/%')) THEN
          RAISE EXCEPTION 'Unauthorized college_id_path: storage object path must reside in student folder.';
        END IF;

        -- Object existence and ownership check
        IF NOT EXISTS (
          SELECT 1 FROM storage.objects
          WHERE bucket_id = 'college-ids'
            AND name = NEW.college_id_path
            AND (storage.foldername(name))[1] = NEW.id::text
            AND (
              (owner = NEW.id AND (owner_id IS NULL OR owner_id = NEW.id::text))
              OR (owner IS NULL AND owner_id = NEW.id::text)
            )
        ) THEN
          RAISE EXCEPTION 'Invalid college_id_path: referenced object does not exist in college-ids storage or is not owned by the student.';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 6. Profile photo storage path protection
  IF OLD.profile_photo_path IS DISTINCT FROM NEW.profile_photo_path THEN
    IF NOT v_is_admin_or_service THEN
      IF NEW.profile_photo_path IS NOT NULL THEN
        IF NOT (NEW.profile_photo_path LIKE (NEW.id::text || '/%')) THEN
          RAISE EXCEPTION 'Unauthorized profile_photo_path: storage object path must reside in student folder.';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM storage.objects
          WHERE bucket_id = 'profile-photos'
            AND name = NEW.profile_photo_path
            AND (storage.foldername(name))[1] = NEW.id::text
            AND (
              (owner = NEW.id AND (owner_id IS NULL OR owner_id = NEW.id::text))
              OR (owner IS NULL AND owner_id = NEW.id::text)
            )
        ) THEN
          RAISE EXCEPTION 'Invalid profile_photo_path: referenced object does not exist in profile-photos storage or is not owned by the student.';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_profile_columns() TO authenticated;

-- 6. Student Profile Submission RPC
CREATE OR REPLACE FUNCTION public.submit_profile_for_review()
RETURNS jsonb AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Rate limit check
  IF NOT public.consume_rate_limit('submit_review') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many submission attempts. Please wait.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile record not found.';
  END IF;

  IF v_profile.registration_status NOT IN ('draft', 'correction_required') THEN
    RAISE EXCEPTION 'Profile cannot be submitted from status %.', v_profile.registration_status;
  END IF;

  -- Mandatory validation
  IF v_profile.college_id_path IS NULL THEN
    RAISE EXCEPTION 'Mandatory college ID card image must be uploaded before submitting.';
  END IF;
  IF v_profile.sex IS NULL OR v_profile.date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Demographics (sex and date of birth) are required before submitting.';
  END IF;
  IF (v_profile.date_of_birth + INTERVAL '15 years') > CURRENT_DATE THEN
    RAISE EXCEPTION 'Valid date of birth (minimum age 15) is required before submitting registration.';
  END IF;

  -- Step 1: Issue ephemeral transaction-scoped authorization token
  INSERT INTO public.profile_action_authorizations (
    xact_id, student_id, action_type, old_value, new_value
  ) VALUES (
    pg_current_xact_id()::text, v_user_id, 'submit_profile_for_review', v_profile.registration_status, 'under_review'
  );

  -- Step 2: Advance status (Trigger consumes token and verifies operation)
  UPDATE public.profiles
  SET registration_status = 'under_review',
      rejection_reason = NULL,
      updated_at = now()
  WHERE id = v_user_id;

  -- Step 3: Write audit log
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_user_id,
    'student',
    'student.submitted_for_review',
    'profile',
    v_user_id::text,
    jsonb_build_object('status', 'under_review', 'college_id_path', v_profile.college_id_path)
  );

  RETURN jsonb_build_object('success', true, 'status', 'under_review');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.submit_profile_for_review() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_profile_for_review() TO authenticated;

-- 7. Student College ID Replacement RPC
CREATE OR REPLACE FUNCTION public.replace_college_id(
  p_new_storage_path TEXT
)
RETURNS jsonb AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_old_path TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  -- Rate limit check
  IF NOT public.consume_rate_limit('replace_id') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many ID upload attempts.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found.'; END IF;

  IF v_profile.registration_status <> 'correction_required' THEN
    RAISE EXCEPTION 'ID replacement is only permitted while in correction_required status.';
  END IF;

  IF v_profile.college_id_path IS NULL THEN
    RAISE EXCEPTION 'Invalid profile state: active College ID is missing in correction_required status.';
  END IF;

  IF p_new_storage_path = v_profile.college_id_path THEN
    RAISE EXCEPTION 'Replacement storage path must differ from current college ID path.';
  END IF;

  -- Validate new storage object exists and is owned by student
  IF NOT (p_new_storage_path LIKE (v_user_id::text || '/%')) THEN
    RAISE EXCEPTION 'Unauthorized path: storage object must reside in user folder.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'college-ids'
      AND name = p_new_storage_path
      AND (storage.foldername(name))[1] = v_user_id::text
      AND (
        (owner = v_user_id AND (owner_id IS NULL OR owner_id = v_user_id::text))
        OR (owner IS NULL AND owner_id = v_user_id::text)
      )
  ) THEN
    RAISE EXCEPTION 'Invalid storage path: referenced object does not exist in college-ids or is not owned by user.';
  END IF;

  v_old_path := v_profile.college_id_path;

  -- Step A: Enqueue old path for deletion under superseded target_type
  PERFORM public.enqueue_storage_deletion_job(
    'college-ids', v_old_path, 'profile_college_id_superseded', v_user_id::text
  );

  -- Step B: Issue ephemeral transaction-scoped authorization token
  INSERT INTO public.profile_action_authorizations (
    xact_id, student_id, action_type, old_value, new_value
  ) VALUES (
    pg_current_xact_id()::text, v_user_id, 'replace_college_id', v_old_path, p_new_storage_path
  );

  -- Step C: Update profile with new path (Trigger consumes token and verifies operation)
  UPDATE public.profiles
  SET college_id_path = p_new_storage_path,
      updated_at = now()
  WHERE id = v_user_id;

  -- Step D: Audit log
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_user_id,
    'student',
    'college_id.replaced',
    'profile',
    v_user_id::text,
    jsonb_build_object('old_path', v_old_path, 'new_path', p_new_storage_path)
  );

  RETURN jsonb_build_object('success', true, 'new_path', p_new_storage_path);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.replace_college_id(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_college_id(TEXT) TO authenticated;

-- 8. Administrative Review RPC
CREATE OR REPLACE FUNCTION public.review_student_registration(
  p_student_id UUID,
  p_decision TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
BEGIN
  -- Strict permission check
  IF NOT (public.current_has_permission('verify_students') OR public.current_is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: requires verify_students permission or Super Admin authority.';
  END IF;

  -- Verify active admin profile
  IF NOT EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = v_admin_id AND is_active = true) THEN
    RAISE EXCEPTION 'Access denied: administrator account is inactive.';
  END IF;

  -- Rate limit check
  IF NOT public.consume_rate_limit('review_action') THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many review operations. Please wait.';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'correction_required') THEN
    RAISE EXCEPTION 'Invalid review decision: %.', p_decision;
  END IF;

  IF p_decision IN ('rejected', 'correction_required') AND (p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) = 0) THEN
    RAISE EXCEPTION 'A non-empty reason is required when rejecting or requesting correction.';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student profile not found.';
  END IF;

  IF v_profile.registration_status NOT IN ('under_review', 'pending_verification') THEN
    RAISE EXCEPTION 'Student is not currently under review (status: %).', v_profile.registration_status;
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.profiles
    SET registration_status = 'approved',
        rejection_reason = NULL,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_student_id;

    IF v_profile.college_id_path IS NOT NULL THEN
      PERFORM public.enqueue_storage_deletion_job(
        'college-ids', v_profile.college_id_path, 'profile_college_id', p_student_id::text
      );
    END IF;

  ELSIF p_decision = 'rejected' THEN
    UPDATE public.profiles
    SET registration_status = 'rejected',
        rejection_reason = trim(p_rejection_reason),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_student_id;

    IF v_profile.college_id_path IS NOT NULL THEN
      PERFORM public.enqueue_storage_deletion_job(
        'college-ids', v_profile.college_id_path, 'profile_college_id', p_student_id::text
      );
    END IF;

  ELSIF p_decision = 'correction_required' THEN
    UPDATE public.profiles
    SET registration_status = 'correction_required',
        rejection_reason = trim(p_rejection_reason),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_student_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_admin_id,
    'admin',
    'student.reviewed',
    'profile',
    p_student_id::text,
    jsonb_build_object('decision', p_decision, 'reason', p_rejection_reason)
  );

  RETURN jsonb_build_object('success', true, 'status', p_decision);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.review_student_registration(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_student_registration(UUID, TEXT, TEXT) TO authenticated;
```

---

## 9. Testing & Acceptance Matrix

### 9.1 Database pgTAP Test Matrix (`supabase/tests/11_ts_onb.sql`)

The test suite contains **30 automated tests** explicitly validating functional workflows, status constraints, adversarial attack attempts, and isolation guarantees:

| Test Code | Target Area | Test Scenario | Inputs & Executed Action | Expected Outcome & Assertion |
| :--- | :--- | :--- | :--- | :--- |
| `TS-ONB-01` | Auth Trigger | Missing demographic fields in signup | Insert into `auth.users` with `metadata->>'sex' = NULL` | Throws exception; transaction aborts; zero rows created |
| `TS-ONB-02` | Auth Trigger | Underage registration rejected | Insert into `auth.users` with `metadata->>'date_of_birth' = CURRENT_DATE - 10 yrs` | Throws exception; student must be at least 15 years old |
| `TS-ONB-03` | Auth Trigger | Valid signup creates matching profile | Insert into `auth.users` with complete valid metadata | Profile created atomically in `public.profiles` with `registration_status = 'draft'` |
| `TS-ONB-04` | Demographics | Immutability on approved profiles | Approved student executes `UPDATE profiles SET sex = 'Female'` | Throws `P0001: Approved student details cannot be modified directly.` |
| `TS-ONB-05` | Submission | Missing College ID rejected | Student calls `submit_profile_for_review()` with `college_id_path IS NULL` | Throws `P0001: Mandatory college ID card image must be uploaded` |
| `TS-ONB-06` | Submission | Valid onboarding submission succeeds | Student calls `submit_profile_for_review()` with valid ID | Status advances to `under_review`; authorization token consumed; audit log created |
| `TS-ONB-07` | Replacement | Legitimate ID replacement succeeds | Student in `correction_required` calls `replace_college_id(new_path)` | Profile updated to new path; old path enqueued as `profile_college_id_superseded`; token consumed |
| `TS-ONB-08` | Replacement | ID replacement blocked in other statuses | Student in `under_review` calls `replace_college_id(new_path)` | Throws `P0001: ID replacement is only permitted while in correction_required status.` |
| `TS-ONB-09` | Review | Non-admin caller rejected | Student calls `review_student_registration(...)` | Throws `P0001: Access denied: requires verify_students permission` |
| `TS-ONB-10` | Review | Approval queues College ID deletion | Verifier Admin approves student | Status becomes `approved`; job in `storage_deletion_queue` with `target_type='profile_college_id'` |
| `TS-ONB-11` | Review | Final rejection queues ID deletion | Verifier Admin rejects student with reason | Status becomes `rejected`; job in `storage_deletion_queue` with `target_type='profile_college_id'` |
| `TS-ONB-12` | Review | Correction required retains ID image | Verifier Admin requests correction with reason | Status becomes `correction_required`; zero jobs in `storage_deletion_queue` |
| `TS-ONB-13` | Rate Limiter | Concurrency-safe limit enforcement | Execute 6 rapid calls to `consume_rate_limit('submit_review')` | First 5 return `true`; 6th returns `false` |
| `TS-ONB-14` | Rate Limiter | Authenticated caller using signup action rejected | Ordinary authenticated caller calls `consume_rate_limit('signup', 'key')` | Throws exception: `Access denied: unauthenticated action rate-limiting requires service_role authority.` |
| `TS-ONB-15` | Rate Limiter | Authenticated caller custom key ignored | Authenticated caller calls `consume_rate_limit('submit_review', 'victim_key')` | Key derived strictly from `auth.uid()`; victim bucket untouched |
| `TS-ONB-16` | Rate Limiter | Anonymous direct PostgREST RPC call blocked | Anonymous caller calls `consume_rate_limit` | Throws `P0001` (REVOKE FROM anon) |
| `TS-ONB-17` | Demographics | Boundary age and leap-day validation | Student born on leap day 2008-02-29 tested at boundary | Allowed on 2023-02-28; rejected if under 15 |
| `TS-ONB-18` | Adversarial | Direct `college_id_path` update blocked | Student in `correction_required` executes direct `UPDATE profiles SET college_id_path = ...` | Throws `P0001: Direct update of college_id_path is blocked in correction_required status. Use the replace_college_id() RPC.` |
| `TS-ONB-19` | Adversarial | Foreign storage path rejected in replacement | Student in `correction_required` calls `replace_college_id('victim/id.png')` | Throws `P0001: Unauthorized path: storage object must reside in user folder.` |
| `TS-ONB-20` | Rate Limiter | Bucket pruning routine deletes expired rows | Call `prune_rate_limit_buckets()` with service_role | Expired rows deleted; active rows (< 24h) preserved; non-service-role caller rejected |
| `TS-ONB-21` | Suspended | Suspended student actions blocked | Suspended student calls `submit_profile_for_review()` or `replace_college_id()` | Throws `P0001: Profile cannot be submitted from status suspended.` |
| `TS-ONB-22` | Suspended | Deactivated administrator review blocked | Deactivated admin (`is_active = false`) calls `review_student_registration()` | Throws `P0001: Access denied: administrator account is inactive.` |
| `TS-ONB-23` | Adversarial | Direct access to authorization table blocked | Authenticated student attempts direct `INSERT/SELECT/DELETE` on `profile_action_authorizations` | Throws `permission denied` (strict grant revocation + RLS) |
| `TS-ONB-24` | Adversarial | Cross-transaction authorization rejected | Fake authorization row with mismatched `xact_id` inserted via superuser | Direct update still throws `P0001: Direct update of college_id_path is blocked` (cannot match current `pg_current_xact_id()`) |
| `TS-ONB-25` | Adversarial | Authorization student/path mismatch rejected | Authorization issued for `student_A` and `path_1 -> path_2`; `student_B` attempts update or update to `path_3` | Throws `P0001: Direct update of college_id_path is blocked` (exact parameters required) |
| `TS-ONB-26` | Adversarial | Pre-existing deletion job cannot authorize update | Active job in `storage_deletion_queue` exists for current ID | Direct `UPDATE profiles SET college_id_path = ...` still throws `P0001` (trigger does not inspect deletion queue) |
| `TS-ONB-27` | Adversarial | Stale audit-log entry cannot authorize status update | Pre-existing audit row `student.submitted_for_review` present in `audit_logs` | Direct `UPDATE profiles SET registration_status = 'under_review'` still throws `P0001` (trigger requires transaction token) |
| `TS-ONB-28` | Adversarial | Atomicity rollback on failed replacement | `replace_college_id` called with invalid storage object metadata | Profile path update, deletion queue insertion, and authorization row all roll back atomically; zero orphaned records |
| `TS-ONB-29` | Constraint | Registration status check constraint enforcement | Test inserting/updating profile with each of the 7 supported statuses (`draft`, `pending_verification`, `under_review`, `approved`, `rejected`, `correction_required`, `suspended`), then test invalid status `'bogus_status'` | All 7 valid statuses satisfy `chk_profiles_status`; invalid status throws check constraint violation `chk_profiles_status`; existing legacy statuses preserved |
| `TS-ONB-30` | Resubmission | Resubmission from correction required to review | Student in `correction_required` status with replaced College ID calls `submit_profile_for_review()` | Profile successfully transitions to `under_review`; ephemeral transaction token consumed; `rejection_reason` cleared to NULL; audit log `student.submitted_for_review` created |

### 9.1.1 Status-Constraint Test Coverage Mapping
The pgTAP suite explicitly covers all five mandatory registration-status consistency invariants:
1. **Migration preserves existing supported status values:** Covered by `TS-ONB-29`, which programmatically confirms that rows can exist in or transition to `'draft'`, `'pending_verification'`, `'under_review'`, `'approved'`, `'rejected'`, and `'suspended'`.
2. **Reviewer can transition an eligible student to `correction_required`:** Covered by `TS-ONB-12`, which verifies that an authorized Verifier Admin successfully sets `registration_status = 'correction_required'` with a mandatory reason, and verifies that the active College ID is retained in Storage.
3. **Student can submit corrected details and transition from `correction_required` to `under_review` through authorized RPC:** Covered by `TS-ONB-30`, which verifies that a student in `correction_required` status calls `submit_profile_for_review()`, passes validation, consumes an ephemeral authorization token, clears `rejection_reason`, and successfully enters `under_review`.
4. **Direct unauthorized status changes remain blocked:** Covered by `TS-ONB-27` (blocking direct student `UPDATE profiles SET registration_status = ...` due to missing transaction tokens) and `TS-ONB-09` (blocking unauthorized non-admin execution of `review_student_registration()`).
5. **Invalid status values remain rejected:** Covered by `TS-ONB-29`, which verifies that attempting to set `registration_status` to arbitrary strings (e.g., `'bogus_status'`, `'active'`, `'verified'`) is rejected immediately with a PostgreSQL `check_violation` on `chk_profiles_status`.

### 9.2 Local GoTrue & Application Integration Tests (`tests/integration/`)

| Test Code | Test File | Test Description | Execution Method | Verifiable Invariant |
| :--- | :--- | :--- | :--- | :--- |
| `IT-AUTH-01` | `auth-signup.test.ts` | Valid signup atomicity test | `supabase.auth.signUp()` with valid payload (accepting any syntactically valid personal or institutional email) against `http://127.0.0.1:54321` | Exactly 1 `auth.users` row, 1 `public.profiles` row, exactly 1 OTP email in Inbucket |
| `IT-AUTH-02` | `auth-signup.test.ts` | Malformed metadata rollback test | `signUp()` with invalid USN `INVALID_123` | Request returns error; 0 `auth.users` rows, 0 `profiles` rows, **0 emails in Inbucket** |
| `IT-AUTH-03` | `auth-signup.test.ts` | Concurrent duplicate USN race test | 2 concurrent `signUp()` requests with identical USN | Exactly 1 succeeds; 1 fails; DB has exactly 1 profile |
| `IT-AUTH-04` | `auth-signup.test.ts` | Decoupled verification test | Call `verifyOtp` for signed-up student | `auth.users.email_confirmed_at != null`, but `profiles.registration_status` remains strictly `'draft'` |
| `IT-AUTH-05` | `auth-signup.test.ts` | Retry after network timeout | Re-invoke `signUp()` with same email | GoTrue obfuscates or notifies existing user; zero duplicate profiles created |
| `IT-APP-01` | `onboarding.test.ts` | Storage upload & trigger ownership check | Upload image to `college-ids`, update profile | Storage RLS allows upload; profile trigger verifies object owner |
| `IT-APP-02` | `onboarding.test.ts` | Pending student route defense | Session in `under_review` visits `/student` | Server guard redirects to `/status/pending` |
| `IT-APP-03` | `onboarding.test.ts` | Reviewer short-lived signed URL | Admin visits `/admin/verifications`, opens ID | Signed URL returned (60s TTL); audit log created; URL omitted from logs |
| `IT-APP-04` | `onboarding.test.ts` | Worker cron queue processing | POST `/api/cron/process-deletions` with `CRON_SECRET` | Claims batch; removes file; marks job completed; updates `college_id_deleted_at` |
| `IT-APP-05` | `onboarding.test.ts` | Suspended student access denial | Suspended student session visits `/student` or `/onboarding` | Redirected immediately to `/status/suspended` |
| `IT-APP-06` | `onboarding.test.ts` | Missing HMAC secret fails closed | Invoke `getClientIpKey()` with missing secret | Throws `OPERATIONAL_ERROR`; mutation safely aborted |

---

## 10. File-by-File Implementation Plan

### 10.1 File Map

| File Path | Status | Primary Responsibility | Dependencies | Security Implications |
| :--- | :---: | :--- | :--- | :--- |
| `supabase/migrations/20261013000001_phase4_onboarding_and_review.sql` | **New** | Adds demographics, safely extends `chk_profiles_status` to include `correction_required`, `profile_action_authorizations`, updated triggers (`protect_profile_columns`, `handle_new_auth_user`), `submit_profile_for_review`, `replace_college_id`, `review_student_registration`, `rate_limit_buckets`, `consume_rate_limit`, and `prune_rate_limit_buckets` RPCs | PostgreSQL 17 | `SECURITY DEFINER` with search_path=public, pg_temp; audited grants |
| `supabase/tests/11_ts_onb.sql` | **New** | 30 pgTAP automated database tests covering Phase 4 migrations, status constraints, triggers, rollback atomicity, and RPCs | pgTAP | Verifies database security invariants directly in PostgreSQL |
| `tests/integration/auth-signup.test.ts` | **New** | GoTrue API integration tests verifying signup atomicity, rollback, and Inbucket emails | Node.js, `@supabase/supabase-js` | Verifies zero orphaned emails on rollback |
| `tests/integration/onboarding.test.ts` | **New** | Integration tests covering storage upload, reviewer signed URLs, and suspended redirects | Node.js, `@supabase/supabase-js` | Verifies route guards and worker processing |
| `src/types/database.ts` | **Regenerated**| Synchronized TypeScript types generated from local database | Supabase CLI | Synchronizes new columns, constraints, and RPC signatures |
| `src/types/auth.ts` | **New** | TypeScript interfaces for auth sessions, account states, and registration forms | TypeScript | Strict type safety for auth payloads |
| `src/lib/validation/auth-schemas.ts` | **New** | Zod schemas for signup, login, OTP, and profile updates | `zod` | Server-side validation; accepts any syntactically valid email (no domain restriction); regex checks on USN/phone/age |
| `src/lib/supabase/client.ts` | **New** | Browser-side Supabase client singleton | `@supabase/ssr` | Uses `NEXT_PUBLIC_` keys only; safe for browser |
| `src/lib/supabase/server.ts` | **New** | Server-side Supabase client with async `cookies()` | `@supabase/ssr`, `next/headers` | Asynchronous cookie handling; server-only |
| `src/lib/supabase/admin.ts` | **New** | Privileged Supabase client using Service Role Key | `@supabase/supabase-js`, `server-only` | Isolated; strictly never imported in client bundles |
| `src/lib/supabase/middleware.ts` | **New** | Session refresh helper for Next.js middleware | `@supabase/ssr` | Refreshes Auth tokens and passes refreshed cookies |
| `src/middleware.ts` | **New** | Next.js root middleware routing and preliminary session guard | Next.js | Early route redirection based on session existence |
| `src/lib/auth/guards.ts` | **New** | Server-side cryptographic route & action guards (`requireAuth`, `requireApprovedStudent`, `requirePermission`) | `src/lib/supabase/server.ts` | Validates session via `getUser()` and queries DB status |
| `src/lib/auth/rate-limiter.ts` | **New** | Server-side IP extraction, HMAC-SHA256 key derivation, and rate limit wrapper | `crypto`, `next/headers` | Enforces fail-closed rate limiting on Server Actions |
| `src/lib/storage/upload-service.ts` | **New** | Storage path generation, MIME validation, and upload helpers | `src/lib/supabase/client.ts` | Guarantees user-scoped paths `${user.id}/...` |
| `src/actions/auth-actions.ts` | **New** | Server Actions: `loginAction`, `signupAction`, `verifyOtpAction`, `forgotPasswordAction`, `resetPasswordAction`, `signOutAction` | `src/lib/supabase/server.ts`, `src/lib/validation/auth-schemas.ts` | Enforces rate limits, safe error messages |
| `src/actions/onboarding-actions.ts` | **New** | Server Actions: `submitProfileForReviewAction`, `replaceCollegeIdAction`, `getStudentStatusAction` | `src/lib/supabase/server.ts` | Verifies ownership before updating profile |
| `src/actions/admin-verification-actions.ts` | **New** | Server Actions: `listPendingVerificationsAction`, `getStudentIdSignedUrlAction`, `reviewStudentRegistrationAction` | `src/lib/supabase/server.ts`, `src/lib/auth/guards.ts` | Requires `verify_students` permission |
| `src/app/login/page.tsx` | **Modified** | Connect existing Phase 2 UI to `loginAction` | React, UI primitives | Replaces simulation with live Supabase Auth |
| `src/app/signup/page.tsx` | **New** | Student signup page capturing canonical demographics | React, UI primitives | Client-side validation; invokes `signupAction` |
| `src/app/verify/page.tsx` | **New** | 6-digit OTP email verification page | React, UI primitives | Invokes `verifyOtpAction` |
| `src/app/forgot-password/page.tsx` | **New** | Password recovery request page | React, UI primitives | Invokes `forgotPasswordAction` |
| `src/app/reset-password/page.tsx` | **New** | New password form page | React, UI primitives | Invokes `resetPasswordAction` |
| `src/app/auth/callback/route.ts` | **New** | Route Handler for OAuth, magic links, OTP, and recovery token exchanges | Next.js App Router | Secure token exchange via `exchangeCodeForSession` |
| `src/app/auth/signout/route.ts` | **New** | Route Handler for session signout and cookie clearing | Next.js App Router | Clears cookies and revokes token |
| `src/app/onboarding/page.tsx` | **New** | Profile completion and file upload page | React, UI primitives | Restricts access to `draft` students |
| `src/app/status/pending/page.tsx` | **New** | Application pending verification notice | React, UI primitives | Restricts access to `under_review` students |
| `src/app/status/rejected/page.tsx` | **New** | Application rejected / correction required notice (dual-mode) | React, UI primitives | Handles both correction editing and final rejection |
| `src/app/status/suspended/page.tsx` | **New** | Application suspended institutional notice | React, UI primitives | Displays suspension notice; signout only |
| `src/app/student/page.tsx` | **New** | Student portal hub landing page | React, `StudentShell` | Restricts access to `approved` students |
| `src/app/admin/verifications/page.tsx` | **New** | Reviewer verification queue and secure ID viewer | React, `AdminShell`, `Dialog` | Restricts access to `verify_students` admins |
| `src/app/api/cron/process-deletions/route.ts`| **New** | Storage deletion and rate limit pruning worker execution route handler | `src/lib/supabase/admin.ts` | Protected by `CRON_SECRET`; service_role execution |
| `.env.example` | **Modified** | Add Supabase URL/Key, Resend SMTP, CRON_SECRET, and RATE_LIMIT_HMAC_SECRET placeholders | — | Zero real credentials; documentation only |

---

## 11. Implementation Sequence

The work is organized into 6 strictly ordered, reviewable implementation units:

### Unit 1: Dependencies & Supabase SSR Infrastructure
- **Prerequisite:** Owner authorization of Phase 4 Revision 1.5.
- **Tasks:**
  1. Install dependencies: `npm install @supabase/ssr @supabase/supabase-js zod`.
  2. Implement `src/lib/supabase/client.ts` (browser client).
  3. Implement `src/lib/supabase/server.ts` (server client with async `cookies()`).
  4. Implement `src/lib/supabase/admin.ts` (isolated service role client with `import 'server-only'`).
  5. Implement `src/lib/supabase/middleware.ts` and `src/middleware.ts`.
  6. Implement `src/lib/auth/rate-limiter.ts` (IP extraction and HMAC hashing with zero predictable fallback).
- **Exit Criteria:** `npm run type-check` passes with exit code 0; middleware executes on local transitions.

### Unit 2: Database Migration & Security RPCs
- **Prerequisite:** Unit 1.
- **Tasks:**
  1. Create migration `supabase/migrations/20261013000001_phase4_onboarding_and_review.sql`.
  2. Implement nullable demographic columns, safe replacement of `chk_profiles_status` check constraint (adding `correction_required`), `profile_action_authorizations`, updated `protect_profile_columns()`, `handle_new_auth_user()`, `submit_profile_for_review()`, `replace_college_id()`, `review_student_registration()`, `consume_rate_limit()`, and `prune_rate_limit_buckets()` RPCs.
  3. Update `supabase/seed.sql` to populate synthetic demographics for the 4 student test accounts.
  4. Create pgTAP test suite `supabase/tests/11_ts_onb.sql` (30 tests).
  5. Run `npx supabase db reset` and `npx supabase test db`.
  6. Regenerate database types: `npx supabase gen types typescript --local > src/types/database.ts`.
- **Exit Criteria:** All 11 pgTAP test suites (131 tests) pass with 100% success; generated types have zero diffs against schema.

### Unit 3: Authentication Actions & Pages
- **Prerequisite:** Unit 2.
- **Tasks:**
  1. Implement `src/lib/validation/auth-schemas.ts` (Zod validation).
  2. Implement `src/actions/auth-actions.ts`.
  3. Upgrade `src/app/login/page.tsx` to live Supabase Auth.
  4. Create `src/app/signup/page.tsx`, `src/app/verify/page.tsx`, `src/app/forgot-password/page.tsx`, `src/app/reset-password/page.tsx`.
  5. Implement Route Handlers `src/app/auth/callback/route.ts` and `src/app/auth/signout/route.ts`.
  6. Implement automated GoTrue integration tests `tests/integration/auth-signup.test.ts` (5 tests).
- **Exit Criteria:** Student signup, rollback, duplicate detection, and email verification succeed against local GoTrue; zero emails dispatched on rollback.

### Unit 4: Onboarding, Storage Integration & Correction Workflow
- **Prerequisite:** Unit 3.
- **Tasks:**
  1. Implement `src/lib/storage/upload-service.ts`.
  2. Implement `src/actions/onboarding-actions.ts`.
  3. Implement pages: `src/app/onboarding/page.tsx`, `src/app/status/pending/page.tsx`, `src/app/status/rejected/page.tsx`, `src/app/status/suspended/page.tsx`.
  4. Implement `src/app/student/page.tsx`.
- **Exit Criteria:** End-to-end student onboarding passes: image upload, RPC submission, correction mode re-upload via `replace_college_id()`, and direct path modification defense.

### Unit 5: Administrative Verification Queue & Deletion Worker
- **Prerequisite:** Unit 4.
- **Tasks:**
  1. Implement `src/actions/admin-verification-actions.ts`.
  2. Implement reviewer dashboard at `src/app/admin/verifications/page.tsx` with secure ID preview modal.
  3. Implement worker route handler `src/app/api/cron/process-deletions/route.ts` calling both storage deletion and `prune_rate_limit_buckets()`.
  4. Implement automated integration tests `tests/integration/onboarding.test.ts` (6 tests).
- **Exit Criteria:** Administrator can view verification queue, inspect College ID via short-lived signed URL, and approve/reject/request corrections. Storage deletion worker clears approved/rejected/superseded images.

### Unit 6: End-to-End Verification & Pre-Commit Audit
- **Prerequisite:** Units 1–5.
- **Tasks:**
  1. Execute full pgTAP test suite: `npx supabase test db`.
  2. Execute application integration tests: `npx tsx tests/integration/auth-signup.test.ts` and `tests/integration/onboarding.test.ts`.
  3. Run full static verification: `npm run lint`, `npm run type-check`, `npm run build`.
  4. Audit git status: verify zero unapproved files or leaked secrets.
- **Exit Criteria:** All gates pass with exit code 0.

---

## 12. Definition of Done & Pre-Commit Verification Gate

The implementation of Phase 4 will be considered complete when all of the following verifiable conditions are met:

- [ ] **Zero Tracked Repository Changes Prior to Implementation:** Working tree clean on branch `v1`.
- [ ] **Database Schema Integrity:** Migration `20261013000001_phase4_onboarding_and_review.sql` applies cleanly on `supabase db reset`.
- [ ] **All pgTAP Tests Pass (131 Tests):** 10 Phase 3 suites (101 tests) + 1 Phase 4 suite `11_ts_onb.sql` (30 tests) pass with 100% success.
- [ ] **Registration-Status Constraint Consistency:** Constraint `chk_profiles_status` safely replaced to support all 7 statuses (`draft`, `pending_verification`, `under_review`, `approved`, `rejected`, `correction_required`, `suspended`), guaranteeing that reviewer decision to `correction_required` and student resubmission to `under_review` execute without check constraint violation on clean `supabase db reset`.
- [ ] **Atomic Signup Trigger:** Registration creates `auth.users` and `public.profiles` atomically; invalid metadata rolls back auth creation with zero orphaned Inbucket emails.
- [ ] **Dual-Mode Email Verification:** Student receives and successfully verifies email via 6-digit OTP or link dispatched through Inbucket/Resend SMTP. Registration accepts any syntactically valid email (personal or institutional); institutional eligibility is verified separately via mandatory College ID card upload and Admin review.
- [ ] **Correction Flow & Trigger Compatibility:** In `correction_required`, `replace_college_id()` enqueues the old ID into `storage_deletion_queue` and updates the profile path atomically; `protect_profile_columns()` verifies and consumes the transaction authorization token from `profile_action_authorizations`, blocking all direct student `UPDATE` attempts.
- [ ] **Submission Flow Authorization:** In `draft` and `correction_required`, `submit_profile_for_review()` issues a transaction authorization token before updating `registration_status`; `protect_profile_columns()` verifies and consumes the token, blocking direct status manipulation.
- [ ] **Storage Deletion Queueing:** Final `approved` and `rejected` decisions enqueue the active College ID for deletion; `correction_required` does not.
- [ ] **Concurrency-Safe Rate Limiting & Bucket Maintenance:** `consume_rate_limit()` enforces atomic limits across serverless instances using the canonical 5-action whitelist (`signup`, `submit_review`, `replace_id`, `review_action`, `view_college_id`); `prune_rate_limit_buckets()` deletes stale buckets.
- [ ] **Suspended-State Enforcement:** Suspended students are redirected to `/status/suspended` and blocked from all mutations; deactivated administrators are blocked from admin routes and RPCs.
- [ ] **Static Analysis & Build:** `npm run lint`, `npm run type-check`, and `npm run build` pass with zero errors.
