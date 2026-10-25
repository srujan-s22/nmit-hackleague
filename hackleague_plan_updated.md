# NMIT HackLeague --- Development Phases

**Purpose:** This roadmap defines the recommended phases for building
NMIT HackLeague. Use it alongside the project's `rules.md`, which
remains the source of truth for requirements, architecture, security,
UI, and unresolved decisions.

**Total:** 13 primary phases plus Phase 2B architectural hardening, from project setup through launch.

**Current project status:** Phases 1–6 have previously been reported as implemented. Phase 2B (Admin Assignments, RBAC Hardening, and Scoped Navigation Workspaces) has been established to harden administrative governance, decouple review authority, and deliver role-tailored workspaces. Do not restart or rebuild completed phases from scratch. Before implementing the new requirements, audit the actual repository, migrations, tests, branch state, and current implementation. Apply only necessary, approved amendments to completed phases, add regression tests, and preserve working functionality and uncommitted user work.

**New requirements integration:** Six product updates and finalized Phase 2B administrative navigation and assignment requirements have been added to the project requirements. Their work is mapped into the roadmap below. This does not mean earlier phases are automatically reopened in full or that any changes are authorized without an implementation plan and owner approval.

## Mandatory rules before starting

-   Read `rules.md` before substantial work.
-   Build incrementally. Do not attempt to implement all phases in one
    prompt.
-   Inspect the existing repository and report the current state before
    making changes.
-   Identify dependencies, affected files, database changes, security
    implications, and tests before implementation.
-   Do not silently decide any item marked as an open decision in
    `rules.md`.
-   At the end of each phase, run relevant checks and report actual
    results before moving forward.
-   All initial development must be pushed to the GitHub **`v1` branch
    only**.
-   Never push development code to `main`.
-   Only when the owner explicitly starts the next version should future
    development move to **`v2`**.
-   Before each commit and push, verify the active branch and explicitly
    push to the intended branch.
-   Never claim tests, builds, deployments, or pushes succeeded unless
    verified.

------------------------------------------------------------------------

## Phase 1 --- Project foundation and GitHub setup

### Scope

-   Read `rules.md` and inspect the repository.
-   Initialize or verify Next.js, TypeScript, Tailwind CSS, linting, and
    project scripts.
-   Establish a clean, maintainable folder structure.
-   Configure environment-variable conventions and a safe
    `.env.example`.
-   Establish shared design tokens and foundational conventions.
-   Verify GitHub remotes, working tree, and branch history.
-   Create or use the `v1` branch safely.

### Completion criteria

-   The app runs locally.
-   Lint/type-check/build commands are understood and verified where
    available.
-   No secrets are committed.
-   Initial development is on `v1`; no development changes are pushed to
    `main`.

## Phase 2 --- UI design system and page shells

### Scope

-   Build a professional, restrained white-theme design system.
-   Use charcoal/black, grey, light green, and light red; no decorative
    colour gradients.
-   Establish typography, spacing, borders, buttons, inputs, tables,
    status badges, dialogs, and responsive layouts.
-   Create consistent student, admin, and Super Admin layout shells.
-   Prepare placeholders for official club and NMIT logos until the
    owner adds the assets.

### Completion criteria

-   Components look consistent across roles.
-   Layouts work on desktop and mobile.
-   Login and internal pages follow the approved visual direction.
-   No invented official logos or fake production data.

## Phase 2B --- Admin Assignments, RBAC Hardening, and Scoped Navigation Workspaces

### Scope & Architectural Objectives

Phase 2B establishes the authoritative administrative assignment architecture, decouples submission-review authority from global hackathon management, enforces multi-layered RBAC boundaries, and delivers dedicated navigation workspaces for administrators and reviewers.

### 1. Completed & Verified Work (Do Not Re-Implement)

-   **Database Migration (`20261029000001_phase2b_admin_assignment_and_rbac_hardening.sql`):**
    -   Applied to remote/hosted Supabase (`hmmhghnljaloipkkgeqj`) via non-destructive, fail-closed transaction.
    -   Table `public.hackathon_admin_assignments` created with columns `id`, `hackathon_id`, `admin_id`, `assigned_by`, `assigned_at`, `role`, `notes`, `created_at`, `updated_at`.
    -   Constraints: `uq_hackathon_admin_assignments (hackathon_id, admin_id)`, role check `chk_hackathon_admin_role (role IN ('in_charge', 'reviewer', 'coordinator'))`, and partial unique index `uq_hackathon_admin_assignments_in_charge` enforcing at most one in-charge admin per hackathon.
    -   Write-Privilege Revocation: `REVOKE INSERT, UPDATE, DELETE FROM authenticated` with defense-in-depth deny RLS policy `hackathon_admin_assignments_deny_direct_write`.
    -   Database RPCs: `assign_admin_to_hackathon`, `remove_admin_from_hackathon`, `reassign_hackathon_in_charge_admin`, `can_admin_manage_assignments`, `can_admin_manage_hackathon_config`, and `can_admin_review_hackathon`.
    -   Storage Path Safety: Helpers `can_view_registration_proof` and `can_view_team_round_evidence` bound to UUID paths and scoped through `can_admin_review_hackathon`.
-   **RBAC & Catalog Parity:**
    -   Expanded canonical permission catalog in `src/lib/auth/permissions.ts` to include `'assign_hackathons'` (13 canonical permissions, exact parity with database constraint `chk_admin_permissions_key`).
    -   Updated Zod schemas (`adminPermissionKeySchema`, `adminPermissionsArraySchema`, `adminCreationSchema`, `adminPermissionsUpdateSchema`).
-   **Scoped Review Authorization Guard:**
    -   Implemented `requireHackathonReviewScope` in `src/lib/auth/guards.ts` calling RPC `can_admin_review_hackathon`.
    -   Decoupled `/admin/hackathons/[id]/submissions` and review server actions (`reviewRoundSubmissionAction`, `reopenRejectedSubmissionAction`, `recordRoundWinnerPlacementAction`, `reviewRoundAdvancementAction`) from global `manage_hackathons`.
-   **Mandatory Creation External Registration URL:**
    -   Required external registration URL during hackathon creation in form and Zod schema with boundary regex matching `chk_hackathons_external_url`.
-   **Hackathons Table UI Polish:**
    -   Replaced crowded flex-wrapped action buttons on `/admin/hackathons` with a responsive secondary actions dropdown menu using `createPortal`, outside-click detection, and Escape key dismissal; eliminated nested scrolling.
-   **Automated Verification:**
    -   Unit test suite `tests/unit/phase2b-rbac-and-reviewer-scope.test.ts` (9 test cases) passing cleanly with 100% assertions satisfied.

### 2. Planned & Pending Scope Additions (Finalized Requirements)

#### A. Administrator Governance — Hackathon Assignment Management UI (`/admin/admins`)

-   **Access Authorization:**
    -   Update `/admin/admins/page.tsx` from `requireSuperAdmin()` to allow both the Super Admin (global scope) and administrators holding the `assign_hackathons` permission.
    -   Super Admin retains global management across all admin accounts, permissions, deactivations, and assignments.
    -   Administrators with `assign_hackathons` can access the governance interface to manage hackathon assignments, but are strictly prohibited from provisioning accounts, altering functional permissions, or deactivating accounts.
    -   Navigation: Render the Administrator Governance / Accounts link in `admin-shell.tsx` for administrators holding `assign_hackathons`.
-   **Assignment Interface & Capabilities:**
    -   Provide an assignment-management interface within Administrator Accounts / Governance.
    -   Enable authorized users to select a hackathon and assign one or more currently active administrators.
    -   Support multiple administrators per hackathon and multiple hackathons per administrator.
    -   Render existing assignments for the selected hackathon, displaying administrator name, email, assignment role (`reviewer` or `coordinator`), and assigned timestamp.
    -   Allow authorized assigners to unassign/remove an administrator assignment with a mandatory justification (minimum 10 characters), calling the `remove_admin_from_hackathon` RPC.
    -   Exclude inactive administrators (`is_active = false`) from new assignment selection.
    -   Ensure inactive administrators cannot retain effective review, assignment, or evidence access merely because an old assignment record exists in `hackathon_admin_assignments` (fail-closed check on `is_active = true` in `can_admin_review_hackathon`, `requireAdmin`, and storage policies).
    -   Reuse existing `public.hackathon_admin_assignments` table, supported assignment roles (`reviewer`, `coordinator`), RPCs, and RLS policies; do not create a duplicate assignment system.

#### B. Hackathons — Shared Browsing Interface (`/admin/hackathons`)

-   **Universal Administrator Visibility:**
    -   All active administrators must see the "Hackathons" menu item in the navigation sidebar (`admin-shell.tsx`).
-   **Presentation Parity:**
    -   Adopt the same general hackathon browsing presentation as the student-facing catalog (`/student/hackathons`), reusing/adapting `EventCard` and catalog grid components where practical.
    -   Display useful hackathon details: mode (`online`, `offline`, `hybrid`), venue, event dates, registration deadlines, registration state badge, and external registration information.
-   **Strict Separation of Management Actions:**
    -   The shared admin browsing page must not expose management actions to ordinary administrators, including those with `manage_hackathons` or `assign_hackathons`.
    -   **Only the Super Admin sees hackathon management actions in the Hackathons menu.**
    -   Super Admin retains complete existing management controls: `+ New Hackathon` button, `Edit Details`, `Configure Rounds`, `Override Deadline`, `Publish Hackathon`, `Close Registration`, `Reopen Registration`, and `Archive Event`.
    -   Ordinary administrators browse read-only on `/admin/hackathons` without management buttons or secondary dropdown actions.
    -   Do not expose student-only registration actions (e.g., "Register Team", "Join Team") to administrator accounts.
    -   Keep browsing visibility strictly separate from management authorization.

#### C. My Assigned Hackathons — Dedicated Administrator Workspace (`/admin/assigned-hackathons`)

-   **Dedicated Navigation Menu:**
    -   Introduce a dedicated navigation sidebar menu item named **"My Assigned Hackathons"** in `admin-shell.tsx`.
    -   Conditionally display this item **only** to administrators who currently hold active assignments in `hackathon_admin_assignments` (or in-charge designation).
    -   Do not expose the "My Assigned Hackathons" menu item to ordinary administrators who have no relevant assignments.
-   **Dedicated Workspace Page:**
    -   Create `/admin/assigned-hackathons` listing only hackathons assigned to the currently authenticated administrator.
    -   Provide a prominent, dedicated entry point linking directly to the assigned hackathon's authorized review workspace (`/admin/hackathons/[id]/submissions`).
    -   Display the administrator's assignment role (`reviewer`, `coordinator`, `in_charge`) alongside key event schedule details.
-   **Authorized Review Operations & Tracking:**
    -   Assigned administrators can view and evaluate submissions for their assigned hackathons via `requireHackathonReviewScope(hackathonId)`, executing `reviewRoundSubmissionAction`, `reopenRejectedSubmissionAction`, `recordRoundWinnerPlacementAction`, and `reviewRoundAdvancementAction` within their permitted scope.
    -   Registration proofs must be visible to authorized assigned administrators for tracking purposes. Do not introduce a mandatory registration-proof approval workflow (initial registration points remain automated upon proof upload and CDC declaration acceptance).
    -   Assigned administrators access relevant proof screenshots and round evidence only when authorized via path-bound storage policies (`can_view_registration_proof`, `can_view_team_round_evidence`).
-   **Fail-Closed Defense-in-Depth:**
    -   Hiding navigation is not security: direct route URLs, server actions, APIs, database queries, and storage access must enforce identical authorization.
    -   Super Admin retains global access and does not require an explicit assignment record to access or review any hackathon.
    -   `manage_hackathons` alone must never grant global submission-review access.

#### D. Permission Boundaries & Invariants

Maintain these four strictly decoupled capabilities:

1.  **`assign_hackathons`:** Authorizes assignment management within the permitted scope; does not grant event editing, round configuration, or global submission review.
2.  **`manage_hackathons`:** Authorizes hackathon creation, editing, round configuration, and lifecycle transitions as defined by the existing permission system; does not grant global submission-review access.
3.  **Assignment Membership & Role (`hackathon_admin_assignments`):** Authorizes scoped access to the assigned hackathon's review queue and evidence artifacts.
4.  **Super Admin (`is_super_admin = true`):** Retains global access across all governance, event management, assignment, and review operations.

Do not weaken existing RLS, storage policies, audit logging, or server-side permission checks.

### Completion Criteria

-   Admins with `assign_hackathons` and Super Admin can manage assignments via `/admin/admins`.
-   Multiple admins can be assigned per hackathon; multiple hackathons per admin.
-   Inactive admins cannot be newly assigned and cannot retain effective access from past assignments.
-   All admins can browse hackathons on `/admin/hackathons` with student-parity presentation; only Super Admin sees management controls.
-   "My Assigned Hackathons" appears in navigation only for admins with active assignments, providing direct entry to `/admin/hackathons/[id]/submissions`.
-   Registration proofs are visible for tracking without mandatory approval workflow.
-   `manage_hackathons` alone never grants review access; all permissions remain strictly decoupled.
-   All automated tests, type-check, and lint pass with zero errors.

## Phase 3 --- Supabase setup and database design

### Scope

-   Configure Supabase project integration.
-   Design version-controlled SQL migrations.
-   Define tables, relations, constraints, indexes, and timestamps.
-   Plan RLS policies and server-side authorization.
-   Configure private storage buckets and upload metadata.
-   Prepare safe development seed data.
-   Model students, admins, permissions, hackathons, teams, memberships,
    rounds, evidence metadata, results, points, and audit records.

### Completion criteria

-   Schema and migrations are reproducible.
-   Important integrity rules are enforced by the database where
    possible.
-   RLS policies are tested against relevant roles.
-   No real student data is used for development.

## Phase 4 --- Authentication and student onboarding

### Original scope

-   Build professional login and signup pages.
-   Integrate Supabase Auth.
-   Implement email verification with short-lived, single-use
    verification.
-   Collect the approved student details.
-   Upload profile photos and mandatory college ID images securely.
-   Implement pending, approved, rejected, correction, and resubmission
    states.
-   Implement logout and self-service password recovery.

### New-requirement revision tasks

-   Audit existing upload validation and Supabase Storage bucket limits before changing any limits.
-   Proposed maximum file sizes for review: profile photo 1 MB; college ID 1.5 MB; registration screenshot 1 MB; round/final evidence 1 MB per image. Treat these as proposed until the owner explicitly confirms them against actual upload/storage behavior.
-   Enforce limits server-side and at the storage layer where supported. Validate actual file signatures, allowed image formats, image dimensions, and decode/re-encode safely where appropriate.
-   Integrate the mandatory browser-push-notification permission gate into the authenticated dashboard access flow for Students, Admins, and the Super Admin. Do not rebuild authentication to add this; integrate with the existing session/guard architecture.
-   Keep login, logout, account recovery, and notification setup/help routes accessible as needed so users can resolve permission problems. Do not treat browser permission as proof that delivery is guaranteed.
-   Unsupported browsers, denied permissions, and revoked permissions require a clearly defined recovery/setup flow. The exact blocking behavior for unsupported browsers remains an open decision until approved by the owner.

### Completion criteria

-   The signup-to-review journey works end to end.
-   Pending/rejected students cannot access protected student features.
-   Rate limits and safe error messages are implemented.
-   College IDs are private and accessible only to authorized verifiers.

## Phase 5 --- Role-based authorization and admin management

### Original scope

-   Establish the single Super Admin.
-   Implement admin creation, deactivation, and granular permission
    assignment.
-   Protect pages, APIs, server actions, and data access.
-   Add role-aware navigation.
-   Test authorized and unauthorized operations.
-   Do not allow admins to grant themselves extra privileges.

### New-requirement revision tasks

-   Audit current admin permission keys and add explicit permissions as needed for global data export and notification management.
-   Implement hackathon-scoped assignments so the coordinator/Super Admin can assign an in-charge Admin to each hackathon.
-   Keep feature permissions and event assignment as separate authorization dimensions: having `export_data` alone must not grant access to every hackathon; being assigned to an event must not automatically grant unrelated permissions.
-   Define server-side authorization and database/RLS enforcement for each combination of permission and hackathon scope.
-   Require browser push notification permission for dashboard access for Students, Admins, and the Super Admin, subject to the approved unsupported-browser recovery policy.
-   Test revoked permissions, deactivated Admins, changed assignments, direct API calls, and attempts to access another hackathon by changing IDs or request parameters.

### Completion criteria

-   Every protected server operation enforces the required permission.
-   RLS and application-level checks work together.
-   UI hiding is never treated as the only security control.

## Phase 6 --- Hackathon management

### Original scope

-   Build create, edit, draft, publish, close, and archive workflows.
-   Store event descriptions, organizer, mode/venue, dates, deadlines,
    eligibility, official links, team-size rules, and prizes.
-   Support solo participation where enabled.
-   Configure event-specific round structures.
-   Enforce registration deadlines server-side and audit authorized
    overrides.

### New-requirement revision tasks

-   Audit the existing lifecycle, round configuration, deadline enforcement, and override RPCs before modifying them.
-   Allow the authorized coordinator/Admin to assign the responsible Admin when creating or configuring a hackathon.
-   Ensure registration and each round have their own configured start/end timestamps and lifecycle state where the existing model supports it.
-   At a stage's configured end timestamp, the stage must become closed/paused for new actions. It stays paused until an authorized Admin changes the schedule and manually resumes it. Do not automatically extend a deadline.
-   Enforce deadlines server-side/database-side on each relevant operation; do not rely only on a scheduled job or client-side countdown. A background job may update display/status records if needed, but must not be the sole enforcement mechanism.
-   Pausing one stage must not implicitly pause or extend other stages.
-   Record schedule changes, actor, timestamp, prior/new values, reason where required, and resume/override actions in the audit trail.
-   Use the hackathon's configured end timestamp as the anchor for evidence retention: event-specific registration, round, and winner evidence becomes eligible for deletion at `hackathon end timestamp + 7 days`. Coordinate actual deletion with Phase 8's existing deletion worker.
-   Do not duplicate or replace the existing deletion worker without an audited technical reason.

### Completion criteria

-   Authorized admins can manage the event lifecycle.
-   Students see published events and accurate registration states.
-   Event-specific rules are validated server-side.

## Phase 7 --- Team formation and registration

### Scope

-   Allow students to create teams for a specific hackathon.
-   Generate secure, event-specific invitation codes.
-   Allow members to join using a valid code.
-   Enforce team capacity, eligibility, deadlines, and duplicate
    membership rules.
-   Enforce one team per student per hackathon while allowing different
    teams across different hackathons.
-   Distinguish incomplete teams, internal registration, external
    registration, and verified participation.
-   Display the official external registration link configured for the hackathon.
-   Allow the team leader to submit an external-registration screenshot and accept a mandatory CDC declaration.
-   Do not require mandatory manual Admin review for the initial registration screenshot under the newly approved workflow. Record the submitter, team/event association, timestamp, declaration version/acceptance, and file-validation outcome.
-   Do not label a screenshot-only submission as independently verified by the external organizer.
-   Keep initial registration handling separate from later round advancement claims, which require authorized review in Phase 8.
-   Enforce the configured registration deadline server-side, including the stage pause/resume behavior from Phase 6.

### Confirmed workflow

1. The student creates a team and adds members according to the event's rules.
2. HackLeague displays the official external registration link.
3. The team leader registers through the external organizer's platform.
4. The team leader uploads a screenshot and accepts the mandatory CDC disclaimer.
5. HackLeague records the submitted registration claim and awards the configured initial-registration points according to the approved point policy in Phase 9, without mandatory manual screenshot approval.
6. Round 2 and later advancement claims require Admin approval under Phase 8.

The declaration is a deterrent and an acknowledgement, not technical proof that the external registration is genuine. Implement reasonable file validation and duplicate detection without claiming that these establish external authenticity.

### Completion criteria

-   Duplicate membership is prevented at database and server levels.
-   Invitation codes are validated securely.
-   The approved internal/external registration workflows are
    implemented and tested.

## Phase 8 --- Round tracking and evidence review

### Original scope

-   Configure round names, sequence, deadlines, and review assignments
    per event.
-   Allow team leaders to submit a milestone claim and supporting
    evidence/reference.
-   Implement admin approve, reject, and request-more-information flows.
-   Store verified results and review metadata.
-   Update each team member's history from verified results.
-   Implement the approved evidence-retention and deletion policy.

### New-requirement revision tasks

-   Require the assigned and appropriately permissioned Admin to review Round 2 and later advancement claims and final winner evidence.
-   Only update verified round outcomes and any dependent points after the authorized approval decision is committed successfully.
-   Enforce independent stage deadlines and manual resume rules defined in Phase 6. Closed/paused stages must reject relevant submissions and decisions that are no longer allowed by the approved workflow.
-   Reuse and extend the existing Phase 4 deletion queue/worker; do not create a competing worker.
-   Event-specific registration screenshots, round evidence, and winner evidence become eligible for deletion seven days after the hackathon's configured end timestamp, regardless of whether an Admin manually marks the event completed.
-   Make deletion idempotent, scoped to the exact event/evidence object, retryable, and auditable. Record deletion outcomes and preserve necessary result/audit metadata after file deletion.
-   Keep college ID image deletion separate: delete the original after the student verification decision is finalized, subject to actual storage/backup behavior. Profile photos follow account/profile retention rules.
-   Apply approved file-size/type validation and private-storage access rules. Do not put image bytes or public storage URLs in PostgreSQL/audit logs.

### Completion criteria

-   Evidence never automatically becomes a verified result.
-   Evidence is private and access-controlled.
-   Verified results remain in the database after evidence files are
    deleted.
-   Evidence retention duration is approved rather than invented.

## Phase 9 --- Points, achievements, and leaderboard

### Initial proposed point values

  Verified milestone                    Regular member   Team leader
  ----------------------------------- ---------------- -------------
  Participation                                    +10           +15
  Each distinct round qualification                +20           +25
  Win/verified prize placement                     +30           +35

These are additive milestone rewards, pending final implementation
approval.

### Scope

-   Make point values configurable rather than hardcoded.
-   Award points only according to the approved milestone policy, with authorized review required for Round 2 onward and final outcomes.
-   Initial external-registration screenshot submissions do not require manual Admin review under the updated workflow. Record the claim and CDC declaration, and apply the explicitly approved initial-registration award rule without describing the screenshot as externally verified.
-   Enforce one award per eligible student/team/event/milestone.
-   Keep an auditable points ledger.
-   Record corrections as adjustments instead of silently rewriting
    history.
-   Build student totals, achievement summaries, and leaderboards.
-   Make leader points depend on the student's role for that particular
    team/event.

### Completion criteria

-   Duplicate points cannot be awarded by retries or duplicate admin
    actions.
-   Totals reconcile with ledger entries.
-   The definition of eligible wins/prize placements is approved.

## Phase 10 --- Student profiles and dashboards

### Scope

-   Build upcoming hackathons and personal event views.
-   Show teams, teammates, and event-specific role.
-   Show internal/external registration status.
-   Show verified round progression and final outcomes.
-   Show points, achievements, leaderboard position, and participation
    history.
-   Implement protected profile-change requests for sensitive fields.

### Completion criteria

-   Students see accurate, authorized information.
-   Registration is not confused with verified participation.
-   Protected profile changes follow the approved review workflow.

## Phase 11 --- Analytics, audit logs, and exports

### Scope

-   Build the dedicated **Data & Reports** page in the Admin dashboard. Show it only to Admins with the appropriate export/report permission.
-   Build admin dashboard metrics and filters for students, teams, events, registrations, rounds, results, and winners.
-   Provide platform-wide reports for appropriately authorized global export Admins.
-   Provide hackathon-scoped reports only for events assigned to the requesting Admin, unless the Admin has an explicitly granted global scope.
-   Include student records with approved academic details, email address, and phone number, along with teams, registrations, round advancement, verified outcomes, winners, and summary statistics.
-   Provide individual CSV exports for relevant datasets.
-   Provide a complete ZIP package containing structured CSV files.
-   Provide a master Excel workbook (`.xlsx`) with separate, clearly named sheets such as Students, Hackathons, Teams, Team Members, Registrations, Round Results, Points, Winners, and Hackathon Summary. Use stable IDs to relate records between sheets.
-   A CSV is a single flat table; do not pretend a single CSV can contain multiple independent spreadsheet tabs. If a single CSV is offered, define its row grain and columns explicitly.
-   Generate exports on demand from the authorized current data, rather than relying on a manually maintained master file that can become stale.
-   Record important administrative and security actions and log export activity.
-   Keep logs lean and avoid logging passwords, OTPs, tokens, or sensitive image contents.

### Completion criteria

-   Metrics reconcile with source records.
-   Internal registrations, submitted external-registration claims, externally verified registrations, and actual participation are reported separately.
-   Global and hackathon-scoped export access is enforced server-side and tested with unauthorized requests.
-   The workbook sheets and CSV package use consistent source data and stable identifiers.
-   Email, phone, and other personal fields are included only for authorized report scopes.
-   Export events record actor, timestamp, dataset/scope, and safe filter metadata.

## Phase 12 --- Notifications and reliability

### Scope

-   Integrate Resend or another approved transactional email provider for essential transactional email flows.
-   Implement approved emails for verification, recovery, account decisions, and other explicitly retained email flows.
-   Build the browser push-notification system and in-app notification centre.
-   Create a dedicated notification-management permission/role for authorized Admins who compose and publish announcements.
-   Allow authorized announcement publishers to send an announcement to all registered users, including Students, Admins, and the Super Admin.
-   Store announcement content, publication metadata, recipient/read state, push subscriptions, and delivery outcomes in an appropriately secured PostgreSQL schema.
-   Use a service worker and Web Push on supported browsers; protect VAPID private keys and sending credentials on the server.
-   Track permission state, subscription state, send attempts, failures, and invalid subscriptions separately. A granted browser permission does not guarantee successful delivery or that a user sees the notification.
-   Mandatory-access rule: Students, Admins, and the Super Admin must enable browser push notifications to access their dashboards. If permission is denied/revoked or a subscription is missing, show a blocking setup/help screen instead of dashboard content. Keep login and setup/help routes available so users can recover.
-   Do not request browser permission in a way that assumes the site can force the browser to grant it. The exact handling for browsers/devices that cannot support Web Push remains an open decision for the owner; do not silently treat unsupported devices as enabled or claim delivery is guaranteed.
-   In-app announcements remain available in the notification centre, but do not count in-app visibility as proof that a push notification was delivered.
-   Add safe failure handling and rate limits.
-   Implement independent database backup/export automation and test restoration.
-   Monitor database/file-storage usage and configure alerts where possible.
-   Test best-effort Supabase Free-plan health checks and recovery attempts.

### Important reliability note

Scheduled checks cannot guarantee that Supabase Free will never pause or
that automatic recovery will succeed every time. Do not claim 100%
availability. Supabase Pro is the intended straightforward upgrade when
funds are available.

### Completion criteria

-   Email flows are tested with the configured provider.
-   Push subscription, permission denial/revocation, supported-browser delivery, invalid subscriptions, and failure handling are tested.
-   All three roles (Student, Admin, Super Admin) are tested against the mandatory dashboard-access gate.
-   Announcement publishing is permission-controlled and audited; announcements reach all registered recipients through the in-app centre, while push delivery is attempted only for valid subscriptions.
-   Backup restoration has been tested.
-   Failures are visible and recoverable where possible.
-   Known Free-plan and browser/platform limitations are documented.

## Phase 13 --- End-to-end QA, security, and launch

### Scope

-   Test student, admin, and Super Admin journeys.
-   Test role permissions and RLS policies, including unauthorized
    access attempts.
-   Test team capacity, duplicate membership, deadlines, and
    registration edge cases.
-   Test round verification, independent stage deadlines, manual resumption, evidence retention/deletion, and points calculations.
-   Test initial registration screenshot submission and mandatory CDC declaration without manual approval, while confirming Round 2 onward still requires Admin review.
-   Test notification permission and dashboard blocking for Students, Admins, and the Super Admin across supported and unsupported browsers/devices.
-   Test global versus hackathon-scoped reports, CSV/workbook consistency, personal-field access, and export audit events.
-   Test email verification and password recovery.
-   Test mobile responsiveness, loading states, empty states, errors,
    and accessibility.
-   Run lint, type checks, tests, and production build.
-   Configure production environment variables and Vercel deployment.
-   Verify that deployment follows the intended branch.
-   Perform a controlled launch and document operational procedures.

### Completion criteria

-   Critical user journeys pass.
-   Security-sensitive paths are tested.
-   Build and deployment results are verified.
-   Backups and recovery procedures are documented.
-   Known issues and limitations are recorded.
-   No development work is pushed to `main`.

------------------------------------------------------------------------

## Standard workflow for every phase and revision

1.  Read `rules.md` and this roadmap.
2.  Inspect the current implementation and branch state.
3.  For already-completed phases, audit the actual code, migrations, tests, and Git history before proposing changes. Do not assume the implementation is missing or rebuild a completed phase from scratch.
4.  Report relevant existing code, affected files, dependencies, database/RLS changes, storage settings, risks, and unresolved decisions.
5.  Propose a small implementation plan and wait for approval before substantial work.
6.  For a revision to a completed phase, identify the smallest safe amendment and required regression tests; preserve unrelated working functionality and uncommitted work.
7.  Implement only the approved scope.
6.  Add/update tests, migrations, RLS policies, and documentation as
    needed.
7.  Run relevant lint, type checks, tests, and build.
8.  Review actual results and fix issues before declaring completion.
9.  Verify the current Git branch.
10. Commit and explicitly push to `v1` during initial development, or
    `v2` only after the owner authorizes the next version.
11. Report the commit hash, push result, checks run, known gaps, and
    remaining tasks.
12. Wait for the owner's review before proceeding to the next phase.

## GitHub branch policy summary

-   Initial website development: **`v1` only**.
-   Future version work: **`v2` only**, after explicit owner
    authorization and based on the approved `v1` baseline.
-   Development pushes to **`main` are forbidden**.
-   Never force-push or rewrite shared history without explicit owner
    approval.
-   Inspect and preserve uncommitted user work.
-   If the branch or repository state is ambiguous, stop and ask before
    publishing.

## New-requirements implementation map

This map integrates the owner-requested updates and Phase 2B architectural requirements into the existing roadmap. It does not automatically reopen completed phases in full.

| Update | Primary phases | Related phases |
|---|---|---|
| 1. Automatic round/stage pausing | Phase 6 (schedule/lifecycle) and Phase 8 (round enforcement) | Phase 7 (registration deadline), Phase 13 (regression tests) |
| 2. Hackathon-specific Admin assignment | Phase 2B (assignments UI & workspaces) and Phase 5/6 | Phase 8 (review responsibility), Phase 9 (points approval), Phase 11 (report scope) |
| 3. Initial registration screenshot + CDC declaration | Phase 7 | Phase 8 (later-round reviews), Phase 9 (points) |
| 4. Upload limits and scheduled evidence deletion | Phase 4 (profile/ID uploads), Phase 8 (event evidence deletion) | Phase 6 (event-end anchor), Phase 13 (retention tests) |
| 5. Mandatory browser push notifications | Phase 12 | Phase 4 (authenticated setup flow), Phase 5 (dashboard authorization), Phase 13 (cross-role/browser tests) |
| 6. Data & Reports and master exports | Phase 11 | Phase 5 (permission model), Phases 6–9 (source data and scope), Phase 13 (security tests) |
| 7. Multi-Admin Assignment & Navigation Workspaces | Phase 2B (Administrator Governance, Hackathons Browsing, My Assigned Hackathons) | Phase 5 (RBAC), Phase 6 (Hackathons), Phase 8 (Review Queue) |

### Revision strategy for completed phases

- Phases 1–3 remain unchanged unless the audit finds a concrete dependency or defect requiring an owner-approved change.
- Phase 2B incorporates hackathon assignment management in Administrator Governance (`/admin/admins`), shared student-parity browsing for all admins with Super-Admin-only management controls on `/admin/hackathons`, dedicated "My Assigned Hackathons" navigation workspace (`/admin/assigned-hackathons`), and strict RBAC decoupling without requiring additional database migrations.
- Phase 4 receives only necessary changes for upload limits and notification access gating.
- Phase 5 receives only necessary changes for notification/export permissions and hackathon-scoped authorization.
- Phase 6 receives only necessary changes for assigned Admins, stage schedules, and event-end retention integration.
- After the targeted revisions are planned and approved, continue with Phases 7–13 in dependency order.
- Use additive, version-controlled migrations where appropriate. Do not edit already-applied migrations in a way that makes environments unreproducible; inspect the actual migration state first.
- Run focused tests and regression tests for affected completed phases. Do not declare completion until actual commands/results have been verified.
- All work remains on `v1` unless the owner explicitly authorizes version-two development. Preserve uncommitted work and never push development code to `main`.

## Open decisions and confirmations required

Refer to `rules.md` for the authoritative current list. Do not silently invent a decision.

Items that still require confirmation or implementation-plan review include:

1. The exact internal-registration completion rule.
2. The initial-registration points rule and how it fits the existing verified-milestone ledger without incorrectly describing a screenshot-only claim as externally verified.
3. The proposed image-size limits (profile 1 MB, college ID 1.5 MB, hackathon evidence 1 MB) against actual bucket and upload implementation.
4. The exact dashboard behavior for browsers/devices that do not support Web Push or where permission cannot be granted. The owner has required notifications for all roles, but a browser cannot be forced to grant permission.
5. Which profile fields students may edit directly versus by approval request.
6. What counts as a win/prize placement for points.
7. Final operational backup policy and any retention rules not already explicitly set.
8. Before revising completed Phases 4–6, audit the repository and prepare a targeted plan. Do not rebuild those phases from scratch or make changes before the owner approves the plan.

**This roadmap defines the build sequence; `rules.md` defines the
detailed project requirements. Both must be consulted before substantial
implementation.**
