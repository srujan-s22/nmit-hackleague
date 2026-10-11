# NMIT HackLeague --- Development Phases

**Purpose:** This roadmap defines the recommended phases for building
NMIT HackLeague. Use it alongside the project's `rules.md`, which
remains the source of truth for requirements, architecture, security,
UI, and unresolved decisions.

**Total:** 13 phases, from project setup through launch.

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

### Scope

-   Build professional login and signup pages.
-   Integrate Supabase Auth.
-   Implement email verification with short-lived, single-use
    verification.
-   Collect the approved student details.
-   Upload profile photos and mandatory college ID images securely.
-   Implement pending, approved, rejected, correction, and resubmission
    states.
-   Implement logout and self-service password recovery.

### Completion criteria

-   The signup-to-review journey works end to end.
-   Pending/rejected students cannot access protected student features.
-   Rate limits and safe error messages are implemented.
-   College IDs are private and accessible only to authorized verifiers.

## Phase 5 --- Role-based authorization and admin management

### Scope

-   Establish the single Super Admin.
-   Implement admin creation, deactivation, and granular permission
    assignment.
-   Protect pages, APIs, server actions, and data access.
-   Add role-aware navigation.
-   Test authorized and unauthorized operations.
-   Do not allow admins to grant themselves extra privileges.

### Completion criteria

-   Every protected server operation enforces the required permission.
-   RLS and application-level checks work together.
-   UI hiding is never treated as the only security control.

## Phase 6 --- Hackathon management

### Scope

-   Build create, edit, draft, publish, close, and archive workflows.
-   Store event descriptions, organizer, mode/venue, dates, deadlines,
    eligibility, official links, team-size rules, and prizes.
-   Support solo participation where enabled.
-   Configure event-specific round structures.
-   Enforce registration deadlines server-side and audit authorized
    overrides.

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

### Important dependency

The exact internal-registration completion rule and the
external-registration proof workflow are **open decisions** in
`rules.md`. Discuss these with the club leads before finalizing this
phase. Do not guess.

### Completion criteria

-   Duplicate membership is prevented at database and server levels.
-   Invitation codes are validated securely.
-   The approved internal/external registration workflows are
    implemented and tested.

## Phase 8 --- Round tracking and evidence review

### Scope

-   Configure round names, sequence, deadlines, and review assignments
    per event.
-   Allow team leaders to submit a milestone claim and supporting
    evidence/reference.
-   Implement admin approve, reject, and request-more-information flows.
-   Store verified results and review metadata.
-   Update each team member's history from verified results.
-   Implement the approved evidence-retention and deletion policy.

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
-   Award points only for verified milestones.
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

-   Build admin dashboard metrics.
-   Add filters and analytics for students, teams, events,
    registrations, rounds, and results.
-   Build permission-controlled CSV exports for relevant datasets.
-   Record important administrative and security actions.
-   Log export activity.
-   Keep logs lean and avoid logging passwords, OTPs, tokens, or
    sensitive image contents.

### Completion criteria

-   Metrics reconcile with source records.
-   Internal registrations, external verification, and actual
    participation are reported separately.
-   Export access is permission-controlled and auditable.

## Phase 12 --- Notifications and reliability

### Scope

-   Integrate Resend or another approved transactional email provider.
-   Implement approved emails for verification, recovery, account
    decisions, and relevant event/result updates.
-   Add safe failure handling and rate limits.
-   Implement independent database backup/export automation and test
    restoration.
-   Monitor database/file-storage usage and configure alerts where
    possible.
-   Test best-effort Supabase Free-plan health checks and recovery
    attempts.

### Important reliability note

Scheduled checks cannot guarantee that Supabase Free will never pause or
that automatic recovery will succeed every time. Do not claim 100%
availability. Supabase Pro is the intended straightforward upgrade when
funds are available.

### Completion criteria

-   Email flows are tested with the configured provider.
-   Backup restoration has been tested.
-   Failures are visible and recoverable where possible.
-   Known Free-plan limitations are documented.

## Phase 13 --- End-to-end QA, security, and launch

### Scope

-   Test student, admin, and Super Admin journeys.
-   Test role permissions and RLS policies, including unauthorized
    access attempts.
-   Test team capacity, duplicate membership, deadlines, and
    registration edge cases.
-   Test round verification, evidence retention/deletion, and points
    calculations.
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

## Standard workflow for every phase

1.  Read `rules.md` and this roadmap.
2.  Inspect the current implementation and branch state.
3.  Report relevant existing code, affected files, dependencies,
    database/RLS changes, risks, and unresolved decisions.
4.  Propose a small implementation plan and wait for approval before
    substantial work.
5.  Implement only the approved scope.
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

## Open decisions to settle with the club leads

Refer to `rules.md` for the current list. Key items include: 1. When a
team becomes internally registered. 2. How external organizer
registration is verified. 3. How long evidence files are retained after
verification. 4. Whether admin permissions are scoped to particular
hackathons. 5. Which student profile fields require approval to change.
6. What counts as a win/prize placement for points. 7. Final retention
and backup policies.

**This roadmap defines the build sequence; `rules.md` defines the
detailed project requirements. Both must be consulted before substantial
implementation.**
