# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Source of truth — read first

`rules.md` is the canonical, owner-maintained requirements/architecture/security document for this project. `hackleague_plan.md` is the canonical phased roadmap and current implementation status. Both supersede anything in this file if they conflict. Read `rules.md` before proposing architecture or making non-trivial changes.

Note: `rules_updated.md` and `hackleague_plan_updated.md` also exist in the repo root but, despite the "_updated" name, are the **older** committed baseline (predate `rules.md`/`hackleague_plan.md`, which are the current working copies). Don't treat the "_updated" files as current.

`README.md` is stale (still says Phase 1 / Tailwind v3) except for its "Operational Procedures & Administration" section (Super Admin bootstrap/recovery CLI), which is accurate — see Scripts below.

## Commands

```bash
npm run dev            # dev server at localhost:3000, against whatever Supabase .env.local points at
npm run build           # next build (Turbopack)
npm run lint             # eslint .
npm run type-check      # tsc --noEmit
npm test                 # npm run test:node && npm run test:legacy — all of tests/unit/*.test.ts
npm run test:node        # just the 8 node:test-based files, via `tsx --test <files>`
npm run test:legacy      # just the 8 hand-rolled assert-based files, run individually via `tsx <file>` (no --test flag — these don't register with node:test)
```

Run a single unit test file directly:
```bash
npx tsx tests/unit/<file>.test.ts                 # hand-rolled files: self-contained, prints its own pass/fail, exits non-zero on failure
npx tsx --test tests/unit/<file>.test.ts          # node:test files: describe/it-based, reports via Node's test runner
```

`tests/integration/*.test.ts` and `tests/concurrency/*.test.ts` are **not** part of `npm test` and need a running local Supabase stack (`tests/concurrency/*` additionally need Docker + a `supabase_db_hackleague` container exposing `psql`, since they open raw concurrent Postgres sessions via `docker exec`). Run them individually with `npx tsx <file>` once `supabase start` is up; they're excluded from CI deliberately.

### Database (pgTAP + migrations)

```bash
supabase start                              # bring up local stack (Docker required)
supabase migration up --local               # apply pending migrations to LOCAL db only, non-destructive
supabase db reset --local                   # full reset + replay + seed — destructive to local data, don't reach for this by default
supabase test db --local                                   # full pgTAP suite, local only
supabase test db --local supabase/tests/NN_xxx.sql          # one suite
```

**Never run any `supabase` command without `--local` (or an explicit local `--db-url`) unless intentionally targeting hosted** — the CLI is `linked` to the hosted project ref, so an unscoped command can silently hit it. To check hosted state or push, use `--linked` explicitly: `supabase migration list --linked`, `supabase db push --linked`.

**This project's hosted Supabase project is the main/production database** (not local Docker Supabase) — `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL` points there and every app client (browser/server/middleware/admin) reads that same var, so `npm run dev` always talks to hosted. The owner wants new migrations pushed to hosted promptly after local verification (`supabase db push --linked`), not left local-only — check `supabase migration list --linked` first to confirm only the intended migration(s) are pending before pushing.

New migrations must be **additive** — never edit an already-applied migration (local or hosted). `supabase/tests/*.sql` are pgTAP, numbered sequentially (`NN_ts_<slug>.sql`); several rely on a shared seed baseline from `supabase/seed.sql` and fixed UUID fixtures (`00000000-...-0000000XXX` convention) rather than being fully self-contained — be careful reusing those UUID ranges in a new test file.

### Super Admin bootstrap / recovery

```bash
npx tsx scripts/provision-super-admin.ts --email=<e> --name="<n>" --dry-run   # initial provisioning, dry run
npx tsx scripts/provision-super-admin.ts --email=<e> --name="<n>"            # live, idempotent, elevation-blocked
```
Disaster recovery (lost Super Admin credentials) is a direct SQL call to `public.recover_super_admin_identity(...)`, not an app action — see README.md for the exact signature. There is always exactly one active Super Admin (`uq_single_super_admin` partial unique index).

## Architecture

**Stack:** Next.js 16 (App Router, TypeScript), React 19, Tailwind CSS v4 (CSS-first `@theme` in `src/app/globals.css` — not the legacy `tailwind.config.ts` JS config, which no longer carries any color overrides), Supabase (Postgres + Auth + Storage), Resend for transactional email.

**Authority lives in Postgres, not in TypeScript.** Server actions (`src/actions/*.ts`) are the mutation boundary, but they're mostly thin validation + a single RPC call — the real business-rule enforcement (capacity limits, deadlines, duplicate prevention, points idempotency, one-team-per-hackathon, lock ordering) is in `SECURITY DEFINER` Postgres functions in `supabase/migrations/`. When tracing a bug or adding a feature, find the RPC the action calls and read its *current* (last `CREATE OR REPLACE`, not first) definition — migrations are additive, so a function's authoritative body may be several files later than where it was first created.

**Three-tier auth, enforced at multiple layers** (`src/lib/auth/guards.ts`):
- Student: `requireApprovedStudent()` — gates on `profiles.registration_status`.
- Admin: `requireAdmin(permission?)` — checks `admin_permissions`; a 13-key canonical catalog (`src/lib/auth/permissions.ts`), mirrored independently in a SQL CHECK constraint and in RPC bodies — keep all three in sync by hand when the catalog changes.
- Super Admin: bypasses all permission checks (`is_super_admin` short-circuit, present in every authorization helper).
- **Hackathon review authority is a separate, decoupled dimension** from feature permissions: `requireHackathonReviewScope()` checks `hackathon_admin_assignments` via `can_admin_review_hackathon`, not the `manage_hackathons` permission. An admin can hold `manage_hackathons` globally and still have zero review authority on a specific hackathon unless explicitly assigned.
- Mandatory browser push-notification gate (`requirePushSubscription`) sits in front of every authenticated dashboard for students and admins alike — an approved/active user with no push subscription gets redirected to `/enable-push`, not into the app.

**Storage**: three private buckets (`college-ids`, `profile-photos`, `submission-evidence`), path conventions in `src/lib/storage/paths.ts` (e.g. `{userId}/{random}.{ext}` for college-ID/profile-photo, `teams/{teamId}/registration/{random}.{ext}` for registration proof, `evidence/{hackathonId}/{submissionId}/{uniqueId}_{name}` for round evidence). Deletion goes through the existing `storage_deletion_queue` worker (`enqueue_storage_deletion_job` → `src/app/api/cron/process-deletions/route.ts`) — don't build a second deletion path.

**Workflow separation that's easy to miss:** external hackathon registration claims (`teams.external_status`/`external_proof_path`) and round-milestone deliverables (`submissions`/`submission_reviews`) are deliberately separate workflows with separate review requirements (initial registration proof auto-awards points on submission + CDC declaration, no mandatory review; Round 2+ always requires an assigned reviewer's approval). Don't conflate "team has no round submissions yet" with "team never registered."

CI (`.github/workflows/ci.yml`) runs type-check, lint, build, and `npm test` (unit only) on push/PR to `v1`. `main` is protected — never push development work there (see `rules.md` §21 for the full branch policy).
