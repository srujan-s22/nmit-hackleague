# NMIT HackLeague

Institutional Hackathon Management & Team Collaboration Platform for Nitte Meenakshi Institute of Technology (NMIT).

## Project Overview
NMIT HackLeague provides a unified, structured platform for managing campus hackathons, student registrations, team formations, project submissions, judging evaluations, and institutional leaderboards.

## Current Status: Phase 1 Baseline
This repository is currently at the **Phase 1 Baseline** (Project Foundation & GitHub Setup).
- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v3 stable with institutional color tokens
- **Linting:** ESLint 9 Flat Config with Next.js Core Web Vitals
- **Target Branch:** `v1` (Active development branch)

## Getting Started

### Prerequisites
- Node.js `>=20.9.0` (Recommended: Node.js 22 Active LTS)
- npm `>=10.0.0`

### Installation
```bash
# Clone the repository
git clone https://github.com/srujan-s22/nmit-hackleague.git
cd nmit-hackleague

# Ensure you are on branch v1
git checkout v1

# Install exact dependencies
npm ci
```

### Available Scripts
- `npm run dev` — Starts local development server at `http://localhost:3000`
- `npm run build` — Compiles production Next.js application
- `npm run start` — Starts compiled production application
- `npm run lint` — Runs ESLint 9 validation across all project files
- `npm run type-check` — Executes TypeScript compiler validation (`tsc --noEmit`)

## Branching Policy
In accordance with project governance:
- All feature and development work commits strictly to `v1`.
- Direct pushes to `main` are strictly forbidden.

## Operational Procedures & Administration (Phase 5)

### Out-of-Band Super Admin Bootstrap CLI

The platform requires exactly one active Super Admin who possesses implicit operational authority (zero explicit rows in `public.admin_permissions`). Initial provisioning is performed out-of-band using `scripts/provision-super-admin.ts` with service-role authority.

#### Environment Prerequisites
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: Service-role key with administrative privileges.

> **Local Development vs Hosted Production:**
> - In **local development**, these are read automatically from `.env.local` or environment defaults (`http://127.0.0.1:54321` and the local test service key).
> - In **hosted environments / production**, secrets must be injected strictly out-of-band into the operator terminal environment and NEVER committed to source control or logged.

#### Safe Execution & Dry-Run
Always validate environment connectivity and target account availability first:
```bash
# Dry run verification (does not create users or mutate database)
npx tsx scripts/provision-super-admin.ts --email=owner@nmit.ac.in --name="Dr. Nagaraj" --dry-run

# Live initial provisioning (invites user via GoTrue, calls bootstrap_super_admin RPC)
npx tsx scripts/provision-super-admin.ts --email=owner@nmit.ac.in --name="Dr. Nagaraj"
```

#### Idempotent Retry & Elevation Prevention
- **Safe Retry:** Re-executing the script with matching active Super Admin credentials returns `already_bootstrapped` safely with zero database mutations and zero redundant audit logs.
- **Elevation Prevention:** Attempting to bootstrap an existing ordinary administrator fails closed with `'Privilege escalation blocked...'`. Ordinary admins cannot be elevated via bootstrap.
- **Demoted/Inactive Super Admin:** If an inactive or demoted Super Admin exists, bootstrap fails closed. Procedural recovery via `recover_super_admin_identity` is required.

#### Cross-System Failure & Quarantined Orphan Cleanup
If GoTrue user creation succeeds but database RPC provisioning fails, the script automatically attempts a compensating deletion:
```ts
await adminClient.auth.admin.deleteUser(authUid);
```
If network partition or API failure prevents automatic deletion, the script logs:
```
[CRITICAL_AUTH_ORPHAN] Operator remediation required for auth ID <uuid>
```
**Operator Cleanup Action:**
1. The orphaned identity has zero database rows in `public.profiles` and zero rows in `public.admin_profiles`, leaving them quarantined with zero operational access.
2. In Supabase Dashboard or via Supabase Admin API, delete the orphaned user from Authentication, or re-run `scripts/provision-super-admin.ts` which will reconcile the pre-existing unassigned Auth identity.

#### Out-of-Band Disaster Recovery
If the active Super Admin's hardware credentials or identity are compromised/lost, emergency recovery must be performed via direct SQL procedure by an authorized database administrator:
```sql
CALL public.recover_super_admin_identity(
  p_replacement_auth_uid := '<new-auth-uuid>'::uuid,
  p_replacement_email := 'replacement.owner@nmit.ac.in',
  p_replacement_full_name := 'Replacement Owner',
  p_reason := 'Hardware token loss replacement'
);
```
This procedure atomically demotes the previous Super Admin, promotes the replacement, writes an immutable audit record (`actor_role = 'system_recovery'`), and maintains the invariant of exactly one active Super Admin.
