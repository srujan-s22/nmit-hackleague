# NMIT HackLeague

A hackathon management platform for **Nitte Meenakshi Institute of Technology (NMIT), Bengaluru**. HackLeague gives students, club administrators and the institution one verified place to run campus hackathons: registration, teams, round-by-round submissions, reviews, winners and an institution-wide points leaderboard.

## Why it exists

Hackathon participation used to be scattered across external registration links, forms and chat groups. HackLeague replaces that with a single record the institution can trust:

- who actually took part, not just who signed up
- how teams were formed, by year and department
- how far each team progressed through multi-round events
- verified winners and a cumulative points leaderboard

## How a hackathon runs

1. **Team formation:** a student creates a team, shares an invitation code, and the leader locks the roster.
2. **External registration (required):** the team registers on the organiser's own portal (Devpost, Unstop, Google Forms and similar) and the leader uploads a screenshot as proof, together with the Career Development Centre declaration. Teams that miss the registration deadline without proof are marked *not registered* and cannot continue.
3. **Rounds:** teams submit work for each round (title, links, evidence screenshot). Assigned reviewers accept, reject or request a revision, and accepted teams qualify for the next round.
4. **Results:** reviewers record placements on the final round, and points are written to an append-only ledger that feeds the leaderboard.

## Features by role

**Students**
- Email-verified registration with College ID verification
- Browse events, create or join teams, submit registration proof and round work
- Points ledger, profile, correction requests and a public leaderboard

**Administrators** (permission based)
- Student verification and profile correction review
- Hackathon authoring: details, rounds, publishing, pause / resume / reschedule
- Reviewer assignments per hackathon and a submissions review queue
- Points adjustments, broadcast announcements with Web Push, and data exports
- Student directory, analytics dashboard and audit trail

**Super Admin**
- A single account with implicit authority over everything, including administrator accounts and permissions

## Technology

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Database and auth | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Email | Resend |
| Notifications | Web Push (VAPID) with a service worker |
| Exports | ExcelJS and JSZip, streamed from a route handler |
| Validation | Zod |
| Tests | `node:test` and plain `tsx` suites, pgTAP for the database |

## Architecture in brief

- **Rules live in the database.** Server actions validate input and call a single Postgres function. Capacity limits, deadlines, duplicate prevention, points idempotency and authorization are enforced by `SECURITY DEFINER` functions and row-level security in `supabase/migrations/`, so no client or server bug can bypass them.
- **Three tiers of access:** Student, Admin (granular permissions plus per-hackathon assignments) and a single Super Admin.
- **Private storage.** College IDs, profile photos and submission evidence sit in private buckets and are served through short-lived signed URLs.
- **Auditability.** Sensitive actions write immutable audit entries, including every data export.

## Getting started

### Prerequisites

- Node.js 22 (20.9 or newer works)
- npm 10 or newer
- [Docker](https://www.docker.com/) and the [Supabase CLI](https://supabase.com/docs/guides/cli) for a local database

### Install

```bash
git clone https://github.com/srujan-s22/nmit-hackleague.git
cd nmit-hackleague
git checkout v1
npm ci
```

### Configure

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project (local or hosted) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key. Never expose it to the browser |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app |
| `RATE_LIMIT_HMAC_SECRET` | Secret (32+ characters) for unauthenticated rate limiting |
| `CRON_SECRET` | Shared secret for the scheduled maintenance endpoint |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Transactional email (locally, mail goes to Inbucket) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push public key |

Real secrets must never be committed.

### Run locally

```bash
supabase start              # local Postgres, Auth and Storage
supabase migration up --local
npm run dev                 # http://localhost:3000
```

Notification permission is granted per browser address, so allow notifications once for each address you use (`localhost`, `127.0.0.1`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript check |
| `npm test` | All unit tests |
| `supabase test db --local` | Database (pgTAP) tests |

Integration and concurrency tests in `tests/` need a local Supabase stack and are not part of `npm test`.

## Project structure

```
src/app/            Pages and route handlers (student, admin, auth, API)
src/actions/        Server actions: validation, then one database call
src/components/     UI components and shells
src/lib/            Auth guards, storage, reports, email, push, utilities
supabase/           Migrations, seed data and pgTAP tests
tests/              Unit, integration and concurrency tests
scripts/            Operator scripts (Super Admin bootstrap, backups)
```

## Database changes

- Migrations are additive. Never edit one that has been applied.
- Test locally first, then apply to hosted with `supabase db push --linked`. Always pass `--local` or `--linked` explicitly so a command never hits the wrong database.
- Check that nothing unexpected is pending with `supabase migration list --linked`.

## Administration

### Creating the Super Admin

Exactly one active Super Admin exists. It is created out of band with the service-role key:

```bash
# Verify the environment first (changes nothing)
npx tsx scripts/provision-super-admin.ts --email=owner@nmit.ac.in --name="Full Name" --dry-run

# Create the account
npx tsx scripts/provision-super-admin.ts --email=owner@nmit.ac.in --name="Full Name"
```

- Running it again for the same active Super Admin is safe and changes nothing.
- It refuses to elevate an existing ordinary administrator.
- If the auth user is created but the database step fails, the script removes the user. If that clean-up also fails it prints `[CRITICAL_AUTH_ORPHAN]`; delete that user in the Supabase dashboard or re-run the script.

### Recovering a lost Super Admin

If Super Admin credentials are lost, a database administrator runs:

```sql
CALL public.recover_super_admin_identity(
  p_replacement_auth_uid := '<new-auth-user-uuid>'::uuid,
  p_replacement_email := 'replacement@nmit.ac.in',
  p_replacement_full_name := 'Replacement Name',
  p_reason := 'Reason for recovery'
);
```

This demotes the previous Super Admin, promotes the replacement and writes an immutable audit record, keeping exactly one active Super Admin.

## Scheduled maintenance

`/api/cron/process-deletions` (protected by `CRON_SECRET`) advances hackathon and round statuses by date, removes expired evidence after the retention period, and prunes rate-limit data. Schedule it to run regularly in production.

## Contributing

- Work on the `v1` branch. Direct pushes to `main` are not allowed.
- CI runs type-check, lint, unit tests and a production build on every push and pull request to `v1`.
- Run `npm run type-check`, `npm run lint` and `npm test` before opening a pull request.
