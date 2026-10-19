# NMIT HackLeague --- Project Rules & Source of Truth

**Purpose:** This file is the canonical project context for NMIT
HackLeague. Keep it in the repository root as `rules.md` and provide it
to Antigravity (also called Gravity) whenever planning or implementing
the project.

**Status:** Architecture and core product direction are decided. Owner-confirmed
requirements in this document supersede earlier conflicting draft text. Items
explicitly marked **OPEN DECISION** must still be resolved before implementation;
do not silently invent a decision for those items. The six owner-approved update
areas are: stage deadline pausing, hackathon-specific Admin assignment, external
registration proof workflow, image limits and retention, mandatory browser push
notifications, and scoped Data & Reports.

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
`export_data` - `view_audit_logs` - `manage_points` -
`manage_notifications` (only when explicitly enabled). The implementation may
use additional narrowly scoped permission keys where required by the existing
permission model.

Examples: - One admin may verify student details and IDs. - Another may
create and manage hackathons. - Another may review round evidence and
results.

Rules:
- Enforce permissions on the server for every operation and in PostgreSQL/RLS
  where applicable. Hiding a button or page is not authorization.
- Admins must not access functions beyond their assigned permissions.
- Hackathon-scoped assignments are required. A designated in-charge Admin may
  access and act on the hackathon(s) assigned to them, within their feature
  permissions. A feature permission does not automatically grant access to all
  hackathons.
- The Super Admin can access all hackathons and manage assignments.
- Assignment changes and permission changes must be audited.
- Global export permission and hackathon-scoped access must remain distinct.

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
card image.

### Upload size and validation requirements

The owner has proposed these maximum file sizes; verify them against existing
bucket configuration, upload code, and storage policies before changing them:
- Profile photo: maximum 1 MB.
- College ID image: maximum 1.5 MB.
- Hackathon registration screenshot, round evidence, and winner evidence:
  maximum 1 MB per image.

The implementation plan must validate the chosen limits consistently in the
client for usability, on the server, and at the Storage bucket/policy level
where supported. Validate actual file signatures rather than trusting the
filename or browser MIME type. Allow only approved image formats (JPEG, PNG,
WebP), reject corrupt files and unreasonable dimensions, and consider safe
re-encoding/compression that preserves readable text. Store files in private
Supabase Storage; store paths and metadata in PostgreSQL, not image bytes.
Suggested compressed sizes are optimization targets, not acceptance criteria:
profile photos 150–300 KB, college IDs 300–600 KB, and hackathon evidence
250–500 KB, provided readability is preserved.

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
The responsible/in-charge Admin must be assigned to each hackathon by an
appropriately authorized Admin (normally the coordinator/Super Admin) during
creation or configuration. Assignment does not bypass feature permissions.
Registration deadlines must be enforced server-side, with any override
restricted and audited.

### Stage schedules and automatic pausing

- Configure the internal registration deadline and the dates/deadlines for
  every applicable round as part of hackathon setup; do not assume a fixed
  number of rounds.
- When a stage reaches its configured end timestamp, that stage must stop
  accepting the relevant submissions/operations and enter a paused/closed
  state until an authorized Admin manually changes its schedule and resumes it.
- Do not automatically extend a deadline or automatically resume a stage.
- Stages operate independently: pausing or rescheduling one stage must not
  implicitly pause, extend, or alter another stage.
- Enforce the effective stage state and deadline on the server/database, not
  only in the UI. A scheduled job may update display/status state if useful,
  but correctness must not depend solely on a job running at the exact deadline.
- Authorized manual schedule changes and resume actions must record the actor,
  timestamp, previous and new values, action, and reason in audit metadata.
- Define and test time-zone handling consistently; store timestamps safely and
  display them in the intended local time zone.

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

### Internal registration status

The exact minimum-team-size and confirmation rules must be checked against the
existing implementation and finalized if any details remain unresolved. Keep
team formation, internal registration, external registration submission, and
verified participation as distinct states. Do not mark a team internally
registered solely because a leader opened an external link.

### External registration proof workflow — owner decision recorded

- After forming a team and adding its members, the team leader uses the
  official external registration link displayed for the hackathon and
  completes registration on the organizer's platform.
- The team leader submits a registration screenshot in HackLeague and must
  accept the mandatory CDC declaration before submission.
- Required declaration text:

  > By submitting this screenshot, you confirm that it is genuine, unaltered,
  > and represents your team's actual registration on the official hackathon
  > platform. Submitting fake, manipulated, or misleading registration proof
  > may result in strict disciplinary action by the Career Development Centre
  > (CDC), including disqualification from the hackathon and other action under
  > applicable college rules. Your submission may be reviewed, and providing
  > proof does not guarantee acceptance.

- Initial registration screenshots do not require mandatory manual Admin
  review. Once the required submission and declaration are recorded, award the
  configured initial registration/participation points according to the
  approved points workflow. Make it clear in the UI and reports that the
  screenshot was submitted and the declaration accepted; do not label the
  external registration as independently verified when no review or external
  reconciliation occurred.
- Record the submitting user, team, hackathon, timestamp, declaration version
  or text identifier, and evidence metadata. Apply server-side file validation
  and reasonable duplicate detection where feasible. A disclaimer is a
  deterrent, not proof that the screenshot is genuine.
- Round 2 and later advancement claims still require review by the authorized
  in-charge Admin. The result and associated advancement points must not update
  until that claim is approved.
- Internal registration, external proof submitted, and externally verified
  status must remain distinguishable. If a future organizer integration
  independently confirms external registration, represent that separately.
- This approved workflow supersedes earlier draft text that required manual
  Admin approval of every initial registration screenshot.

## 9. Round tracking and results

-   The authorized Admin configures round names, sequence, dates/deadlines,
    notes, and relevant review assignments per event.
-   Team leader submits a claimed milestone and supporting evidence or
    reference, subject to the final evidence policy.
-   The in-charge Admin assigned to the hackathon, or another explicitly
    authorized reviewer, reviews and approves, rejects, or requests more
    information for Round 2 and later advancement claims.
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

### Evidence storage and retention policy

- Store uploaded evidence in private object storage, not as binary data in
  PostgreSQL. Validate file type, signature, size, dimensions, and ownership;
  use safe, unguessable storage paths and authorized access.
- Registration screenshots, round evidence, and winner evidence become
  eligible for deletion at **seven days after the hackathon's configured end
  timestamp**. This is based on the event end timestamp, not on an Admin
  manually marking the event complete.
- Reuse and extend the existing Phase 4 deletion queue/worker. Do not create a
  competing deletion worker. Deletion must be scoped to the relevant event and
  evidence object, idempotent, retryable, and auditable; it must never delete
  another event's files. Record deletion outcome and timestamp where feasible.
- Preserve verified result, review, points, and audit metadata after deleting
  evidence files. Do not retain the image itself in logs.
- College ID images follow their separate policy: delete the original after
  the verification decision is finalized, subject to actual deletion and
  backup behavior. Profile photos follow the account/profile lifecycle.
- Avoid duplicate uploads and unnecessary versions. Keep metadata such as
  event, team, round, submission time, review outcome, reviewer, and evidence
  deletion timestamp.
- Explain and test the actual behavior of backups and storage deletion; do not
  claim deletion from all backups unless that has been verified.

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

## 13. Admin dashboard, Data & Reports, and exports

Admin dashboard sections should include relevant subsets of: Overview and
analytics; hackathon management; student and team management; registration
monitoring; round/evidence review; results and points; audit logs; and
**Data & Reports**. The Data & Reports page must be visible only to Admins who
have the relevant export/report permission. The Super Admin can access all
reports and manage permissions.

### Report scope and permissions

- Support two scopes: (1) global/platform-wide reports for Admins explicitly
granted global export permission, and (2) hackathon-scoped reports for Admins
assigned to those hackathons and granted the relevant export permission.
- A hackathon-assigned Admin may view/export only records belonging to the
assigned hackathon(s), including contact details only for students in that
scope. Assignment to one hackathon does not grant access to all student
records or other events.
- Global export permission must be a separate explicit permission. Do not infer
global access merely from `manage_hackathons`, `view_analytics`, or an event
assignment.
- Enforce all scopes server-side and through PostgreSQL/RLS where applicable.
Do not rely on hidden navigation, client filters, or supplied hackathon IDs.
- Revoking permission or assignment must immediately revoke future access.
Audit permission/assignment changes and export activity.

### Report data and exports

Provide filters, search, pagination, and CSV exports for relevant datasets,
such as: students; admins and permissions (only for suitably authorized
roles); hackathons; teams; team memberships; internal/external registration
records; round submissions and verified results; winners/placements; points
ledger; profile change requests; safe password-recovery request metadata
(never passwords, OTPs, or tokens); and audit logs, subject to permission and
privacy policy.

The student dataset may include name, email, phone number, USN, branch,
academic year, and other specifically approved reporting fields. Email and
phone number are included in the authorized master export. Avoid exporting
DOB, sex, images, college ID contents, authentication identifiers/tokens, or
other sensitive fields unless separately justified and explicitly authorized.

The master export must be available to globally authorized Admins as:
- A structured Excel workbook (`.xlsx`) with separate sheets for Students,
  Hackathons, Teams, Registrations, Round Results, Winners, and Summary (and
  other sheets only where useful and authorized).
- A ZIP package containing separate, properly structured CSV files for the
  datasets in scope.
- Individual CSV downloads for selected datasets and filters.

A CSV file is one flat table; do not simulate multiple independent spreadsheet
tabs inside one CSV. Each row must have consistent columns, stable identifiers,
and clear relationships (for example, hackathon ID, team ID, student ID, and
round ID). Each hackathon must be identifiable by its own stable ID. Reports
must clearly distinguish student counts from team counts and registration
submission from verified advancement/winning.

Generate exports on demand from the current authorized PostgreSQL records
rather than maintaining a stale second master dataset. Use server-side
pagination/streaming or a safe export job for large datasets. Protect against
formula injection in spreadsheet/CSV cells and ensure correct encoding and
escaping.

Every export must log actor, timestamp, dataset, scope/hackathon IDs, applied
filters, outcome, and safe metadata without copying unnecessary personal data
into audit logs. Never export passwords, OTPs, session/recovery tokens, raw
college ID images, or private storage URLs. Reports must clearly label
unreviewed registration screenshots as submitted claims rather than
independently verified external registrations.

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
-   College ID images are deleted after verification is finalized, subject to
    the actual deletion/backup behavior. Hackathon evidence is eligible for
    deletion seven days after the configured hackathon end timestamp, using the
    existing deletion worker and retaining necessary result/audit metadata.

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

## 16. Website notifications

### Mandatory browser push notifications

- Browser push notifications are a mandatory access requirement for all
  authenticated roles: Students, Admins, and the Super Admin.
- Before a user can access their protected dashboard, the app must establish
  that browser push permission is granted and that a valid push subscription
  is registered for that browser/device. A granted browser permission alone
  does not prove that a subscription exists or that delivery will succeed.
- If permission is denied or blocked, keep the dashboard locked and show clear
  instructions for changing the browser/site permission in settings. Do not
  attempt to bypass browser permission controls or repeatedly trigger prompts.
- Request permission in response to a clear user action after explaining why
  notifications are required. Browser rules may prevent the site from showing
  the native prompt again after a denial; provide platform/browser-specific
  recovery guidance.
- If a browser/device does not support the required push capability, clearly
  explain the limitation and provide supported setup guidance. Do not falsely
  mark push as enabled. The product owner requires mandatory access; any
  exception policy for unsupported devices must be explicitly approved rather
  than silently invented.
- Recheck permission/subscription state when the user returns and handle
  revoked permissions, expired/invalid subscriptions, service-worker failures,
  and delivery failures. Do not claim that permission guarantees delivery or
  that the user saw a notification.
- Web Push requires secure deployment (HTTPS), a service worker, supported
  browser APIs, and secure server-side push sending. Keep VAPID/private keys
  and provider secrets server-side in environment variables.

### Notification administration and delivery

- Provide an in-app notification centre for all registered users, including
  Students, Admins, and the Super Admin. It must retain announcement history
  and read/unread state according to the approved retention policy.
- Provide a dedicated `manage_notifications` permission (or an equivalent
  narrowly scoped permission in the existing model) for the designated
  Notification Admin. Only authorized users can compose, preview, publish, or
  manage announcements.
- A published global announcement is addressed to all registered users,
  including Admins and the Super Admin. Browser push delivery reaches only
  devices with valid, active subscriptions; in-app announcements remain
  available in the portal.
- Store notification records and delivery/subscription metadata in
  PostgreSQL. Users may manage only their own push subscription records and
  view their own notification/read state. Use RLS and server-side checks.
- Track sender, publish timestamp, target scope, delivery attempts/results,
  invalid subscriptions, and read state as appropriate. Remove or deactivate
  invalid subscriptions safely; use retries and rate limits where appropriate.
- Notification delivery must not expose private student information or leak
  secrets in payloads/logs. Keep push payloads concise and send users to an
  authenticated page for sensitive details.
- Browser push is the primary announcement delivery channel for this product;
  do not make email or WhatsApp a dependency for the website notification
  feature. Existing transactional email flows for authentication/recovery
  remain separate.

## 17. Security and engineering standards

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

## 18. Development workflow for Antigravity/Gravity

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

## 19. Open decisions to resolve before implementation

1. Confirm any remaining exact internal-registration completion criteria
   against the existing implementation and club process.
2. Decide whether future organizer-side reconciliation (for example,
   authorized Google Sheets access) is feasible; it is not required for the
   current disclaimer-based initial submission workflow.
3. Which profile fields students may edit directly versus by approval request.
4. Exact definition of a "win" and eligible prize placements for points.
5. Final operational backup strategy and how backup retention interacts with
   deletion guarantees.
6. Confirm the proposed image upload maximums against actual implementation
   and bucket configuration before changing them.
7. Decide how mandatory notification access should handle users on browsers or
   devices that cannot support Web Push; do not silently exempt or block them
   differently from the approved policy.

## 20. Official documentation references

Check current documentation before relying on plan limits or API
behavior: - Supabase pricing: https://supabase.com/pricing - Supabase
Free project pausing:
https://supabase.com/docs/guides/platform/free-project-pausing -
Supabase Auth: https://supabase.com/docs/guides/auth - Supabase Storage:
https://supabase.com/docs/guides/storage - Supabase Row Level Security:
https://supabase.com/docs/guides/database/postgres/row-level-security -
Vercel documentation: https://vercel.com/docs - Resend documentation:
https://resend.com/docs



## 21. Mandatory GitHub Branch and Versioning Policy

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
