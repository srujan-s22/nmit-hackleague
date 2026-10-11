# NMIT HackLeague --- Project Rules & Source of Truth

**Purpose:** This file is the canonical project context for NMIT
HackLeague. Keep it in the repository root as `rules.md` and provide it
to Antigravity (also called Gravity) whenever planning or implementing
the project.

**Status:** Architecture and core product direction are decided. Some
workflow details explicitly marked **OPEN DECISION** must be discussed
with the club leads before implementation. Do not silently invent a
decision for those items.

------------------------------------------------------------------------

## 1. How to use this file

1.  Read this file before proposing architecture, writing code, or
    modifying existing features.
2.  Treat the rules marked **MUST**, **MUST NOT**, and **SHOULD** as
    project requirements.
3.  Do not contradict an existing decision without explaining the
    trade-off and asking for approval.
4.  Do not implement unresolved decisions by guessing. List them clearly
    and ask concise questions.
5.  Work incrementally. Inspect the existing codebase first, summarize
    what exists, propose a plan, and wait for approval before
    substantial changes.
6.  After approval, make one coherent change at a time. Run relevant
    lint, type-check, tests, and build checks; report actual results and
    any remaining issues.
7.  Never claim that a feature, test, security property, backup, email,
    or deployment works unless it has actually been verified.
8.  Keep this file updated when the owner explicitly changes a decision.
    Do not rewrite the project rules based on assumptions.

## 2. Product purpose

NMIT HackLeague is a central portal for NMIT students and club
administrators to discover hackathons and track participation throughout
each event.

The portal should distinguish: - Internal team formation and
registration on HackLeague. - Registration on the external hackathon
organizer's platform. - Participation that has been verified. -
Qualification through each configured round. - Final outcomes,
placements, awards, and student achievements.

It should replace fragmented manual tracking with a reliable history of
students, teams, events, evidence, verified results, and points.

The external organizer remains responsible for its own registration
platform. HackLeague does not replace external Google Forms or other
official registration systems.

## 3. Locked technical architecture

-   **Framework:** Next.js with TypeScript and App Router.
-   **UI:** React and Tailwind CSS, with a shared reusable design
    system.
-   **Database:** Supabase PostgreSQL.
-   **Authentication:** Supabase Auth; do not build a custom
    password/session system without explicit approval.
-   **File storage:** Supabase Storage, with private buckets for
    sensitive evidence.
-   **Email:** Resend or another approved transactional email provider,
    configured through secure environment variables/custom SMTP as
    appropriate.
-   **Hosting:** Vercel.
-   **Database changes:** Version-controlled SQL migrations.
-   **Authorization:** Server-side checks for every protected operation,
    with PostgreSQL Row Level Security (RLS) as an additional layer.
-   **Integrity:** Use database constraints, transactions, and unique
    keys for critical rules; do not rely on client-side checks alone.

Do not switch to MongoDB or another database without explicit approval.
PostgreSQL was selected because students, teams, team memberships,
events, rounds, results, permissions, and reports are relational and
require reliable integrity.

### Free-plan constraints to plan around

Supabase Free has historically included 500 MB database storage and 1 GB
file storage, and projects with insufficient activity may be paused
after seven days. Limits and pricing can change; check official current
documentation before quoting exact figures or implementing
quota-dependent behavior.

-   Free-plan inactivity prevention is **not guaranteed** by scheduled
    pings.
-   A GitHub Actions or other independent scheduled workflow may check
    health and attempt recovery, but this is a best-effort workaround
    only.
-   Do not claim 100% uptime or guaranteed wake-up on Free.
-   When funds are available, upgrading to Supabase Pro is the intended
    straightforward solution for avoiding inactivity-based pausing.
-   During development, monitor usage and configure alerts where
    possible.
-   Backups must be planned independently for Free; test restoring them
    rather than assuming an export is usable.

## 4. Roles and authorization

### 4.1 Super Admin

There is exactly one Super Admin: the project owner.

The Super Admin can: - Access all platform functionality. - Create,
deactivate, and manage admin accounts. - Grant and revoke granular admin
permissions. - Manage students, hackathons, teams, registrations,
evidence, results, reports, and exports. - Configure point rules and
approved system settings. - Inspect audit logs and security-related
events. - Manage data retention and operational settings.

Do not let ordinary admins grant themselves permissions or elevate their
own access.

### 4.2 Admins

There can be multiple admins. Permissions are individually assigned by
the Super Admin; do not assume every admin has the same access.

Possible permission keys include: - `verify_students` -
`manage_password_resets` - `manage_hackathons` - `manage_teams` -
`manage_followups` - `manage_students` - `view_analytics` -
`export_data` - `view_audit_logs` - `manage_points` (only if explicitly
enabled)

Examples: - One admin may verify student details and IDs. - Another may
create and manage hackathons. - Another may review round evidence and
results.

Rules: - Enforce permissions on the server for every operation and in
the database where applicable. - Hiding a button or page is not
authorization. - Admins must not access functions beyond their assigned
permissions. - Event-scoped admin access is an **OPEN DECISION**; do not
assume it is required or not required.

### 4.3 Students

Students can register themselves and access the portal only after
required verification and admin approval. Student accounts must not be
able to access admin functions or other students' private data unless
explicitly required.

## 5. Student signup and approval

Signup fields planned: - Full name - Email address (any email address is
allowed; do not restrict signup to NMIT email domains) - Password,
managed by Supabase Auth - Phone number - USN - Branch - Academic year -
Sex - Date of birth - Profile photo/face image - Mandatory college ID
card image

Flow: 1. Student submits signup details. 2. System sends an expiring,
single-use email OTP/link to verify email ownership. 3. Student uploads
a college ID image and profile photo. 4. Account remains pending until
an authorized admin checks the details and ID. 5. Admin approves or
rejects the application. 6. Approved students receive access to the full
student portal. 7. Rejected students see a reason, correct the relevant
details, and resubmit for review.

Use rate limits and single-use, short-lived verification codes. Do not
log OTPs, passwords, session tokens, or reset tokens.

### College ID privacy

College IDs are highly sensitive: - Store IDs in a private bucket, never
at a public URL. - Permit access only to admins with the
student-verification permission. - Use short-lived authorized access and
server-side checks. - Do not offer a download button in the UI; disable
casual right-click/download affordances where practical. - A restricted
viewer and watermark can reduce casual misuse, but **cannot guarantee
prevention of screenshots, browser capture, or photographing the
screen**. Never promise screenshot-proof protection. - Log authorized
viewing events without storing the image in the audit log. - Delete the
original ID image after the verification decision is finalized, subject
to the platform's actual deletion behavior and any backup/retention
constraints. - Keep only the verification outcome, reviewer, timestamp,
and necessary audit metadata---not the ID image itself. - Avoid storing
duplicate or temporary copies longer than necessary.

Profile photos may remain on the student's profile, subject to the
privacy and retention policy.

### Student data privacy

Restrict phone numbers, DOB, profile images, and other personal details
to people who need them. Do not expose all student records to all
students or all admins by default.

## 6. Account recovery and email

-   Use Supabase Auth and a secure self-service email-based recovery
    flow where supported.
-   The student receives a short-lived, single-use verification/recovery
    code or link and chooses their own new password.
-   Admins may assist with exceptional recovery requests only if
    permission is granted.
-   Admins must never view, assign, or send a student's actual password.
-   Never store plaintext passwords or expose password-reset tokens.
-   Rate-limit requests and log safe audit metadata.
-   Essential emails: email verification, password recovery, account
    approval/rejection, and relevant registration/result notifications.
-   Use a transactional provider such as Resend when needed; do not rely
    on a default test sender for production delivery.
-   Keep provider keys and SMTP credentials in environment variables,
    never in source control.

## 7. Hackathon management

Hackathon records may include: - Title and description - Organizer -
Mode and venue - Start/end dates and deadlines - Eligibility -
Minimum/maximum team size - Whether solo participation is allowed -
Official external registration URL - Optional community/WhatsApp link -
Prizes and benefits - Configurable round structure - Internal
registration deadline - Status: draft, published, closed, archived (or a
carefully defined equivalent)

Authorized admins can create, edit, publish, close, and archive events.
Registration deadlines must be enforced server-side, with any override
restricted and audited.

Round structure must be configurable per hackathon. Do not hardcode a
fixed number of rounds. Some events may have multiple rounds; others may
use direct selection, a presentation, or a single-stage result.

## 8. Teams and registration

-   A student may belong to **only one team per hackathon**.
-   The same student may participate in different teams for different
    hackathons.
-   A team belongs to a specific hackathon.
-   Team leader creates the team and receives an invitation code to
    share with members.
-   Invitation codes must be sufficiently hard to guess, unique within
    the relevant scope, revocable/regeneratable, and validated
    server-side.
-   Enforce team capacity, eligibility, deadlines, and
    duplicate-membership rules on the server and with database
    constraints.
-   A student must not bypass the one-team-per-hackathon rule by
    creating another account or making direct requests.
-   Team leader/member role must be recorded per event/team, not as a
    global student role.
-   Keep a clear distinction between an incomplete team, an internally
    registered team, an externally registered team, and a team whose
    participation has been verified.

### Internal registration status --- OPEN DECISION

The exact point at which a team becomes internally registered is not yet
finalized. A proposed flow is: leader creates team → members join → team
meets configured minimum size → leader confirms details → internal
registration becomes complete. Discuss this with the club leads before
implementation.

### External registration proof --- OPEN DECISION

Clicking an external Google Form or website is not proof of
registration. The external registration workflow is not finalized and
must be discussed with the club leads.

Options previously considered: - Team leader submits a confirmation
screenshot/email or official registration reference. - Authorized admin
verifies it and approves, rejects, or requests more information. - If
organizers provide authorized access to a response sheet, an
integration/reconciliation workflow could be considered.

Do not implement one option as final without approval. Internal and
external registrations must remain distinct regardless of the selected
proof method. Reports must distinguish internal teams from externally
verified teams.

Possible statuses include internal registration complete, external proof
pending, proof submitted, awaiting verification, externally verified,
rejected/needs correction. Final status design awaits approval.

## 9. Round tracking and results

-   Admin configures round names, sequence, dates/deadlines, notes, and
    relevant review assignments per event.
-   Team leader submits a claimed milestone and supporting evidence or
    reference, subject to the final evidence policy.
-   An authorized admin reviews and approves, rejects, or requests more
    information.
-   A claim or uploaded screenshot must never automatically become a
    verified result.
-   Verified results update the team history and each member's
    participation history.
-   Store who reviewed a result and when.
-   Support outcomes such as qualified for next round, finalist,
    winner/placement, eliminated, withdrawn, and completed, as
    appropriate.
-   Direct-selection and nonstandard event formats must be supported
    through configuration rather than hardcoded assumptions.

### Evidence storage policy

-   Store uploaded evidence in private object storage, not as binary
    data in PostgreSQL.
-   Validate file type and size; use safe, unguessable storage paths and
    authorized access.
-   Retain only what is needed for verification and the agreed
    dispute/audit window.
-   After a result is verified and any agreed review window expires,
    delete the evidence file according to the retention policy while
    preserving the verified result record.
-   Avoid duplicate uploads and unnecessary versions.
-   Keep metadata such as event, team, round, submission time, review
    outcome, reviewer, and evidence-deletion timestamp.
-   Evidence retention duration is an **OPEN DECISION** for the club
    leads. Do not invent a permanent-retention policy or delete evidence
    immediately without an approved policy.
-   Do not put sensitive evidence images into audit logs or public
    links.

## 10. Student profiles and participation history

A student profile should show: - Total points and achievements -
Hackathons participated in - Teams and teammates for each event - The
student's role in each team - Internal/external registration status -
Verified round progression - Final outcomes and placements -
Participation statistics and leaderboard position, where applicable

Clearly distinguish registration from verified participation. Do not
count a student as having participated merely because they created an
account or joined a team.

## 11. Points and leaderboard

Initial proposed values, pending final implementation approval:

  Verified milestone                    Regular member   Team leader
  ----------------------------------- ---------------- -------------
  Participation                                    +10           +15
  Each distinct round qualification                +20           +25
  Win/verified prize placement                     +30           +35

Rules: - These are additive milestone rewards. A student may earn
participation points, qualification points for each qualifying round,
and a separate win bonus. - Award points only after the corresponding
milestone is verified by an authorized admin. - Do not award points for
merely clicking a link, registering externally without verification, or
uploading unreviewed evidence. - Award each milestone at most once per
eligible student/team/event/milestone. - Enforce uniqueness and
transaction safety in the database to prevent duplicate points. - Role
is event/team-specific. A student who leads one event and is a member in
another earns the appropriate role-specific amount for each event. -
Maintain an auditable points ledger: student, event, team, milestone,
amount, reason, timestamp, and verifying actor/source. - Never silently
overwrite point history. Corrections should be recorded as auditable
adjustments. - Keep verified achievement history separate from the
points ledger. - Provide student totals, achievement summaries, and
leaderboards; possible filters include academic year and semester. -
Point values should be configurable rather than hardcoded so the Super
Admin can change them through an authorized setting or configuration. -
Define what counts as a "win" (e.g., verified prize placements) before
implementation. - OPEN DECISION: Confirm whether the win bonus applies
to all prize placements or only specified placements, and finalize
configurable award categories with club leads.

Example: a regular member who participates, qualifies through two
rounds, and then wins earns 10 + 20 + 20 + 30 = 80 points. A leader in
the same team earns 15 + 25 + 25 + 35 = 100 points.

## 12. Profile change requests

After approval, protected fields such as name, USN, branch, and academic
year should not be changed silently.

-   Student submits the requested field, new value, and reason.
-   Authorized admin approves or rejects it.
-   Store before/after values, requester, reviewer, timestamps, and
    decision.
-   Restrict access to sensitive requests.
-   Define which noncritical fields can be edited directly and which
    require approval before implementing.

## 13. Admin dashboard, reports, and exports

Admin dashboard sections should include relevant subsets of: - Overview
and analytics - Hackathon management - Student and team management -
Registration monitoring - Round/evidence review - Results and points -
Audit logs - Reports and CSV exports

The Super Admin sees all sections plus admin/permission management and
approved system settings.

Provide separate CSV exports for relevant datasets, such as: -
Students - Admins and permissions - Hackathons - Teams - Team
memberships - Internal/external registration records - Round submissions
and verified results - Points ledger - Profile change requests -
Password recovery request metadata (never passwords or OTPs) - Audit
logs, subject to permission and privacy policy

Exports must support relevant filters where appropriate and require an
explicit permission. Log export events, actor, timestamp, dataset, and
filters without unnecessarily duplicating sensitive data.

Reports must use verified data and clearly label counts. Do not mix
internal registrations with externally verified registrations or confuse
registrations with actual participation.

## 14. Audit logs and retention

Log important security and business events, such as: - Login/security
events where appropriate - Student approval/rejection - ID viewer
access - Admin creation, deactivation, and permission changes -
Hackathon changes and deadline overrides - Team/registration changes -
Evidence review and result decisions - Point awards and adjustments -
Profile changes - Exports - Recovery assistance

Audit logs should capture actor, action, target, timestamp, outcome, and
limited before/after metadata where appropriate.

-   Never log passwords, OTPs, session tokens, recovery tokens, or
    unnecessary sensitive image contents.
-   Ordinary users must not silently rewrite or delete audit history.
-   Avoid noisy page-view logs.
-   Keep indexes and log records lean.
-   Proposed starting retention: routine audit logs 90 days;
    security-sensitive logs 12 months; participation/result history
    retained long-term subject to legitimate purpose and periodic
    review. These are proposed operational defaults, not legal advice,
    and should be reviewed.
-   College ID images are deleted after verification is finalized,
    subject to the actual deletion/backup behavior and policy.

## 15. UI/UX design rules --- MUST FOLLOW

The product should look like a polished, professional college technology
platform---not a generic AI-generated SaaS template.

### Visual direction

-   White and off-white foundation.
-   Charcoal/black typography and restrained grey shades.
-   Light green for positive/verified/success states.
-   Light red for rejected/error/destructive states.
-   Avoid multiple colour gradients entirely.
-   No glowing effects, decorative gradient blobs, excessive
    glassmorphism, or flashy background treatments.
-   Do not use colourful gradients to make pages appear "premium."
-   Use accent colours only when they communicate meaning.

Suggested starting tokens (adjust only consistently through the design
system): - White: `#FFFFFF` - Off-white: `#F5F6F4` - Charcoal:
`#252825` - Soft grey: `#E6E9E5` - Light green: `#E3F1E6` - Light red:
`#F8E8E6`

### Layout and components

-   Professional, restrained Material Design principles; do not blindly
    copy default Material UI components.
-   Use consistent spacing, typography hierarchy, thin borders, readable
    contrast, and carefully aligned layouts.
-   Use cards only where they provide grouping; do not put every item
    inside a floating card.
-   Prefer well-designed tables, filters, pagination, section dividers,
    clear empty states, and purposeful forms.
-   Use restrained corner radii and subtle shadows only where they
    improve hierarchy.
-   No excessive rounded containers, random icons, decorative charts, or
    oversized hero areas in internal dashboards.
-   Use meaningful labels and clear validation/error messages.
-   Add accessible focus states, keyboard navigation, semantic markup,
    and responsive layouts.
-   Keep student, admin, and Super Admin screens consistent while
    exposing only the relevant functions for each role.
-   Avoid fake metrics and invented production data. Use clearly labeled
    demo/empty states in development.

### Login and signup

-   Login must be deliberately designed, professional, and consistent
    with the portal---not a generic template.
-   Use a white/neutral background, charcoal typography, restrained
    green accent, well-designed fields, clear errors, and appropriate
    loading states.
-   Signup and pending/rejected/approved states must be clear and
    accessible.
-   Do not invent club or college logos. Use temporary text/placeholders
    until real assets are provided.

### Motion

-   Use only purposeful, subtle transitions for hover, dropdowns,
    dialogs, and loading states.
-   Avoid unnecessary entrance animations, parallax, bouncing elements,
    and motion that slows down administrative workflows.

### Assets

The owner will add official logo files to `public/` after the
boilerplate is created. Likely paths may include: -
`public/images/hackleague-logo.svg` - `public/images/nmit-logo.png` -
`public/images/hackleague-mark.svg`

These are examples, not guaranteed existing filenames. Inspect the
actual `public/` directory and use the real paths. Do not create or
imply that official logos already exist.

## 16. Security and engineering standards

-   Validate all input on the server, including uploaded file types,
    size, and ownership.
-   Use least privilege for database access, storage access, admin
    permissions, and secrets.
-   Apply RLS policies to relevant tables and test them using different
    roles.
-   Keep privileged Supabase service-role keys on the server only; never
    expose them to the browser.
-   Keep secrets in environment variables; provide a safe `.env.example`
    with placeholders only.
-   Never commit `.env`, production secrets, personal data, or real
    student IDs.
-   Use database constraints and transactions for team membership, event
    registration, result verification, and points awards.
-   Add rate limits to authentication, OTP, recovery, invitation-code,
    and sensitive endpoints.
-   Avoid leaking whether a particular email or account exists where
    that would create a security risk.
-   Use safe error messages; do not return stack traces or secrets to
    clients.
-   Do not rely on UI hiding as a security measure.
-   Implement loading, error, empty, success, and unauthorized states.
-   Keep code modular, typed, maintainable, and consistent with existing
    project conventions.
-   Avoid unnecessary dependencies and premature abstraction.
-   Do not use real student personal data for development or
    screenshots.

## 17. Development workflow for Antigravity/Gravity

For every task:

1.  Read this `rules.md` and inspect the relevant code before changing
    anything.
2.  Summarize current implementation and identify affected files,
    routes, database tables, RLS policies, storage buckets, and tests.
3.  State assumptions and any unresolved product/security decisions.
4.  Propose a small implementation plan before substantial coding.
5.  Do not make unrelated changes or rewrite working components without
    a reason.
6.  Make changes incrementally and preserve established design
    tokens/components.
7.  Add or update migrations, RLS policies, validation, and tests
    alongside feature code.
8.  Test permissions for each relevant role, including unauthorized
    cases.
9.  Run available lint, type checks, tests, and production build.
10. Report exact commands run, actual outcomes, known gaps, and any
    manual steps needed.
11. Do not say "complete" if the build, tests, security rules, or
    deployment have not been verified.
12. Never disable security checks or weaken types just to make a build
    pass.
13. If the requested change conflicts with this file, explain the
    conflict and ask before proceeding.
14. When a product decision is explicitly deferred to club leads, do not
    silently finalize it.

## 18. Open decisions to resolve before implementation

1.  Exact rule for when a team becomes internally registered.
2.  Exact external-registration proof workflow and whether authorized
    Google Sheets reconciliation is possible.
3.  Evidence retention/dispute window after verification.
4.  Whether admins can be restricted to assigned hackathons as well as
    feature permissions.
5.  Which profile fields students may edit directly versus by approval
    request.
6.  Exact definition of a "win" and eligible prize placements for
    points.
7.  Final retention policy and operational backup strategy.

## 19. Official documentation references

Check current documentation before relying on plan limits or API
behavior: - Supabase pricing: https://supabase.com/pricing - Supabase
Free project pausing:
https://supabase.com/docs/guides/platform/free-project-pausing -
Supabase Auth: https://supabase.com/docs/guides/auth - Supabase Storage:
https://supabase.com/docs/guides/storage - Supabase Row Level Security:
https://supabase.com/docs/guides/database/postgres/row-level-security -
Vercel documentation: https://vercel.com/docs - Resend documentation:
https://resend.com/docs



## 20. Mandatory GitHub Branch and Versioning Policy

This policy is mandatory and takes precedence over any default Git workflow suggested by Antigravity (Gravity).

### Branches

- **`v1` — Initial development:** All initial implementation, bug fixes, refactoring, tests, documentation, and launch preparation for the first complete version of NMIT HackLeague must be committed and pushed to the `v1` branch.
- **`v2` — Future development:** When the owner explicitly starts the next version, create or use the `v2` branch based on the approved `v1` baseline. All subsequent version-two features, enhancements, and fixes must be committed and pushed to `v2`, unless the owner explicitly specifies another branch.
- **`main` — Protected from development:** Gravity MUST NOT push commits to `main`, commit directly on `main`, merge development work into `main`, or modify `main` as part of this project's normal development workflow.

### Mandatory instructions for Gravity

1. Before running Git commands that change branches or publish code, inspect the current branch, working tree, remotes, and relevant recent history.
2. At the beginning of initial development, ensure the project is on `v1`. If `v1` does not exist, create it from the correct project baseline. Do not assume that the current branch is safe.
3. Before every commit or push, verify the active branch. During initial development, it must be `v1`; during version-two development, it must be `v2`.
4. Push to the explicit branch name, for example `git push origin v1` or `git push origin v2`. Never use an ambiguous push command when the destination could be unclear.
5. Never use `git push --force` or rewrite shared branch history unless the owner explicitly authorizes it.
6. Never discard, overwrite, reset, or delete the owner's uncommitted work. Inspect and preserve existing changes.
7. Do not create a pull request into `main`, merge into `main`, or change repository default-branch settings without the owner's explicit approval.
8. Do not assume that `main` must receive the latest code for deployment. Follow the owner's selected branch and hosting configuration.
9. If the current branch, baseline, remote, or repository state is ambiguous, stop before publishing and ask the owner for clarification.
10. After pushing, report the branch name, commit hash, push result, tests run, and any uncommitted changes. Never claim that a push succeeded without verifying the result.

### Version transition

The owner must explicitly authorize the start of v2 development. Before starting v2, verify that the v1 baseline is committed and pushed. Create `v2` from the approved `v1` commit or baseline unless the owner specifies otherwise. Keep v1 intact; do not repurpose it for version-two work.

### Safety rule

**Default destination for initial development: `v1`. Default destination for authorized future-version development: `v2`. Never push development code to `main`.** If a requested task appears to conflict with this policy, stop and ask before proceeding.

------------------------------------------------------------------------

**End of project rules.** This document is the baseline; the owner's
explicit later decisions supersede it and should be reflected here.
