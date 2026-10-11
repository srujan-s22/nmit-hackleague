# NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN
## Project Foundation & GitHub Setup Baseline (Revised)

> **Document Type:** Technical Architecture & Implementation Plan  
> **Revision:** 2.1 (Finalized & Authorized for Implementation)  
> **Target Branch:** `v1` (Strictly enforced — development pushes to `main` are forbidden)  
> **Status:** AUTHORIZED FOR IMPLEMENTATION (Direct Execution Underway)  
> **Date:** October 11, 2026  
> **Repository:** `https://github.com/srujan-s22/nmit-hackleague.git`  
> **Workspace Root:** `/Volumes/CodingVault/web/HackLeague`  

---

## Document Revision History

| Version | Date | Author / Role | Summary of Changes |
| :--- | :--- | :--- | :--- |
| **1.0** | Oct 11, 2026 | Senior Architect & Planner | Initial Phase 1 foundation plan. |
| **1.1** | Oct 11, 2026 | Senior Architect & Planner | Addressed preliminary review: streamlined environment variables, corrected `.gitignore`, removed destructive git commands, and added roadmap sync check. |
| **1.2** | Oct 11, 2026 | Senior Architect & Planner | Next.js 16 Active LTS update, ESLint CLI command standardization, cryptographic checksum validation for `rules.md`, and Git recovery approval policy. |
| **1.3** | Oct 11, 2026 | Senior Architect & Planner | `next-env.d.ts` excluded from Git; live registry verification for primary packages; ESLint 9 standard flat config; initial audit policy harmonized; lockfile claims calibrated. |
| **1.4** | Oct 11, 2026 | Senior Architect & Planner | Robust `.gitignore` coverage (`.env*` with `!.env.example`); trustworthy `rules.md` baseline comparison against expected checksum; unified security audit acceptance policy; live registry verification expanded; temporary audit report lifecycle defined. |
| **1.5** | Oct 11, 2026 | Senior Architect & Planner | Complete 12-dependency registry verification (`npm view tailwindcss dist-tags.latest` added); non-destructive `.gitignore` testing via `git check-ignore -v`; strengthened staged diff inspection (`git diff --staged`); genuinely explicit file staging (`public/.gitkeep` placeholder, no directory staging). |
| **1.6** | Oct 11, 2026 | Senior Architect & Planner | Auditable dependency verification (`npm ls --depth=0` exit-code checking, post-install tree inspection); fail-closed staged manifest verification comparing against exact approved 18-file manifest; eliminated fragile chained grep pipeline. |
| **1.7** | Oct 11, 2026 | Senior Architect & Planner | Standards-Compliant Semver Validation & Installed Metadata Audit (`semver.satisfies` range enforcement, lower patch minimums, systematic installed metadata inspection). |
| **1.8** | Oct 11, 2026 | Senior Architect & Planner | Accurate Package-Context Peer Auditing & Dependable Resolution (`resolvePeerPackage`, scoped/nested resolution, truthful `engines.node`, strict `npm ls` diagnostics). |
| **1.9** | Oct 11, 2026 | Senior Architect & Planner | Chronological Dependency-Audit Sequence & Fail-Closed Security Audit Evaluation (pre-install queries separated from post-install lockfile audit; fail-closed audit shell capture with preserved exit status). |
| **2.0** | Oct 11, 2026 | Senior Architect & Planner | Strict Audit Exit-Code Enforcement, Comprehensive Report Schema Validation & Fail-Closed Security Policy Evaluator (parsed `AUDIT_EXIT`, non-negative integer metadata counts, exact category sum check, detailed consistency validation, truthful advisory ID/CVE reporting). |
| **2.1** | Oct 11, 2026 | Senior Architect & Planner | **Finalized for Direct Execution:** Separated stderr from JSON capture in `npm audit` (`> npm-audit-report.json 2> npm-audit-stderr.log`); calibrated fix compatibility assessment (no assuming non-major updates are automatically compatible); marked document fully authorized for immediate implementation. |

---

## 1. Executive Summary

### 1.1 Current Foundation
The NMIT HackLeague workspace is located at `/Volumes/CodingVault/web/HackLeague`. A verified, read-only system inspection confirms:
- The local Git repository was initialized with `git init`.
- The remote `origin` is configured to `https://github.com/srujan-s22/nmit-hackleague.git`.
- The repository currently resides on an unborn `main` branch with **zero local commits**.
- A query to the remote repository (`git ls-remote origin`) confirms the remote is completely empty (zero branches, tags, or commits).
- The only file currently inside the workspace root is the project source-of-truth document: `rules.md` (untracked, 30,203 bytes, 625 lines, SHA-256: `180e1b953e6bceb3177dfb5bd8bb54e1fd0dace8837c7a7aaa421b107b5acb7f`).
- The secondary source-of-truth document, `NMIT_HackLeague_Development_Phases.md` (378 lines, SHA-256: `eb76a4b7c2a47af67ae3b7ac767cfbfdc9363e68fc2995885190c114262edbc9`), was located externally at `/Users/srujan/Downloads/NMIT_HackLeague_Development_Phases.md` and is currently missing from the workspace root.
- The developer environment is macOS Darwin with verified active local runtimes: Node.js `v22.23.1` (Active LTS) and npm `10.9.8`. Neither `pnpm`, `yarn`, nor `bun` is installed globally.
- No application source code, `package.json`, build tooling, or folder structures currently exist in the repository.

### 1.2 Objective of Phase 1
Phase 1 establishes a clean, minimal, verifiable Next.js (App Router, TypeScript), React, and Tailwind CSS project foundation. It strictly adheres to the architecture, security constraints, institutional visual identity, and Git branch policies mandated by `rules.md` and `NMIT_HackLeague_Development_Phases.md`.

Specifically, Phase 1 achieves:
1. **Strict GitHub Branch Policy Compliance:** Pivoting to the `v1` branch before any commit is created, ensuring `main` remains untouched with zero development commits.
2. **Trustworthy Governance & Checksum Baseline:** Verifying the SHA-256 integrity of `rules.md` against its expected source-of-truth hash (`180e1b953e6bceb3177dfb5bd8bb54e1fd0dace8837c7a7aaa421b107b5acb7f`) prior to establishing the baseline, and safely synchronizing `NMIT_HackLeague_Development_Phases.md` into the workspace root using SHA-256 checksum validation without overwriting existing content.
3. **Robust Repository Hygiene & Non-Destructive Ignore Coverage:** Establishing a `.gitignore` that utilizes a robust wildcard rule (`.env*` with exception `!.env.example`) to catch all environment files (including `.env.staging`, `.env.production.local`, and local variants) while ensuring `.env.example` remains tracked. Excludes framework-generated declarations (`next-env.d.ts`), temporary diagnostic artifacts (`npm-audit-report.json`), build caches, and logs. Verified via non-destructive path inspection without touching user files.
4. **Complete & Standards-Compliant Pre- and Post-Installation Dependency Audit:** Performing live registry queries across all 12 proposed direct dependencies prior to installation; authoring `package.json` and generating `package-lock.json` via `npm install`; enforcing top-level tree resolution via `npm ls --depth=0` (exiting with code 0 and zero tree problems); using a standards-compliant semver range validator (`semver.satisfies`) to verify every installed package satisfies its declared range down to the patch level; systematically inspecting installed package metadata; validating `engines.node` when present and truthfully reporting when no engine constraint was declared; and auditing peer dependencies from each declaring package's filesystem context across nested and scoped `node_modules` without exports-restricted `require.resolve`, distinguishing required from optional peers per `peerDependenciesMeta`.
5. **Verified Next.js 16 Active LTS Framework Baseline:** Configuring a modern, security-patched baseline with Next.js 16 (Active LTS, `^16.4.0`), React 19 (`^19.0.0`), React DOM (`^19.0.0`), Tailwind CSS v3 stable (`^3.4.17`), PostCSS 8.4, Autoprefixer 10.4, TypeScript 5.7, ESLint 9 (`^9.21.0`), and `eslint-config-next` (`^16.4.0`) using npm. Premature utility abstractions (`clsx`, `tailwind-merge`) are deferred to Phase 2.
6. **Chronological & Fail-Closed Security Audit Policy:** Executing `npm audit` strictly post-installation against the generated lockfile and resolved dependency tree (never pre-installation); capturing JSON findings while preserving and strictly enforcing CLI exit status (`AUDIT_EXIT` parsed as a valid integer, where a nonzero exit can never result in an overall PASS); evaluating findings via an automated fail-closed audit evaluator that validates report schema integrity (finite non-negative integer counts, category sum verification, and detailed `vulnerabilities` consistency), distinguishes operational failures from vulnerability findings, extracts precise advisory IDs and separate CVE aliases (never mislabeling URLs/titles as CVEs), assesses fix compatibility against approved constraints, enforces zero unresolved High/Critical vulnerabilities before build verification or commit, mandates remediation of Low/Moderate advisories where compatible semver updates exist, strictly prohibits `--force`, `--legacy-peer-deps`, or unvetted bumps, halts on unresolvable findings or operational anomalies, requires a fresh re-audit after any remediation (prohibiting reuse of prior reports), and safely disposes of temporary report artifacts (`npm-audit-report.json`).
7. **Standardized ESLint 9 Flat Config Strategy:** Configuring `"lint": "eslint ."` and a standard flat config `eslint.config.mjs` incorporating `eslint-config-next/core-web-vitals` with global ignores (`.next/**`, `out/**`, `build/**`, `next-env.d.ts`), fully supported by ESLint 9 without relying on ESLint 10-specific APIs.
8. **Institutional Styling Baseline:** Configuring core institutional color tokens (`#FFFFFF`, `#F5F6F4`, `#252825`, `#E6E9E5`, `#E3F1E6`, `#F8E8E6`) in Tailwind CSS and CSS root variables, strictly avoiding flashy gradients, glowing effects, and generic SaaS styling.
9. **Lean Environment Configuration:** Providing a minimal `.env.example` that requires zero live service credentials to run, lint, type-check, or build the Phase 1 application.
10. **Developer Quality Scripts:** Configuring standard scripts (`dev`, `build`, `lint`, `type-check`) verified against local runtimes, with actual command outputs recorded.
11. **Truthful Documentation & CI:** Authoring an accurate `README.md` and a lean GitHub Actions CI workflow that validates lockfile-reproduced builds on `v1` without fake build secrets.
12. **Genuinely Explicit File Staging & Fail-Closed Diff Audit:** Staging only individually named file paths from the approved 18-file manifest (no directory arguments or `git add .`); executing a fail-closed staged manifest audit script that halts on any extra, missing, or disallowed file (e.g. `next-env.d.ts`, audit reports, real `.env`); reviewing the entire `git diff --staged` for secrets; rechecking branch invariants; and committing on `v1`.

### 1.3 Intended Outcome
At the conclusion of Phase 1 implementation, the repository will contain a clean application baseline committed and pushed exclusively to GitHub branch `v1`. The application will start locally, compile in production mode, pass linting and type-checking, satisfy the unified security audit policy, and contain zero live secrets or premature service integrations, creating an unencumbered foundation for Phase 2 (UI Design System and Page Shells).

---

## 2. Source-Document Compliance

### 2.1 Documents Inspected
Both canonical governance documents were inspected in full:
1. **`rules.md`**: Located at `/Volumes/CodingVault/web/HackLeague/rules.md`. Verified completely (625 lines, 30,203 bytes, SHA-256: `180e1b953e6bceb3177dfb5bd8bb54e1fd0dace8837c7a7aaa421b107b5acb7f`).
2. **`NMIT_HackLeague_Development_Phases.md`**: Located externally at `/Users/srujan/Downloads/NMIT_HackLeague_Development_Phases.md`. Verified completely (378 lines, SHA-256: `eb76a4b7c2a47af67ae3b7ac767cfbfdc9363e68fc2995885190c114262edbc9`).

### 2.2 Alignment and Scope Consistency
Both documents are fully aligned on the core architecture:
- **Framework:** Next.js (App Router), TypeScript, React, Tailwind CSS.
- **Database & Storage (Future Phases):** Supabase PostgreSQL, Supabase Auth, Supabase Storage.
- **Hosting & Email (Future Phases):** Vercel hosting, Resend transactional email.
- **Git Branch Policy:** All initial development belongs exclusively to `v1`. Development commits or pushes to `main` are strictly forbidden. `v2` is reserved for future versions upon explicit authorization.
- **Design Philosophy:** Restrained, professional, developer-focused institutional visual identity. White/off-white surfaces, charcoal typography, subtle green/red functional accents. No decorative multi-color gradients or glowing blobs.
- **Security Principles:** Server-side validation, PostgreSQL Row Level Security (RLS), private buckets for sensitive student records, and strict separation of public vs. secret variables.

### 2.3 Identified Discrepancies and Open Decisions
1. **Workspace Document Gap:** `NMIT_HackLeague_Development_Phases.md` resides in the user's Downloads directory and is missing from `/Volumes/CodingVault/web/HackLeague/`.
   - *Resolution:* Implementation Step 2 includes an explicit, non-destructive copy with SHA-256 verification. If the source file is missing, the destination already exists with differing content, or provenance is uncertain, execution will halt immediately for user clarification.
2. **Trustworthy Checksum Verification:** Step 2 computes the SHA-256 hash of `rules.md` and explicitly checks it against the recorded baseline (`180e1b953e6bceb3177dfb5bd8bb54e1fd0dace8837c7a7aaa421b107b5acb7f`) before accepting it. If different, execution halts immediately.
3. **Open Product Decisions (Deferred):** Section 18 of `rules.md` specifies seven open decisions requiring club lead consultation:
   - *Decision 1:* Exact rule for when a team becomes internally registered.
   - *Decision 2:* Exact external-registration proof workflow and whether Google Sheets reconciliation is possible.
   - *Decision 3:* Evidence retention and dispute window duration after verification.
   - *Decision 4:* Whether admin permissions are scoped to specific hackathons in addition to global feature permissions.
   - *Decision 5:* Which student profile fields may be edited directly versus requiring approval.
   - *Decision 6:* Exact definition of a "win" and eligible prize placements for points.
   - *Decision 7:* Final data retention policy and operational backup strategy.
   - *Compliance Confirmation:* **None of these open decisions are decided, assumed, or implemented in Phase 1.** All seven items remain explicitly deferred to their respective phases (Phases 3 through 12).

---

## 3. Verified Repository Baseline

### 3.1 Observed vs. Proposed State

| Category | Property | Observed Machine State (Verified) | Proposed Project Baseline | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Environment** | Operating System | macOS Darwin 24.x (Apple Silicon) | macOS Darwin (Development target) | Verified local runtime |
| **Environment** | Node.js Runtime | `v22.23.1` (Active LTS) | Node.js 22 LTS (Satisfies `>=20.9.0`) | Verified local runtime |
| **Environment** | Package Manager | `npm` `10.9.8` | `npm` (Using `package-lock.json`) | Verified local runtime |
| **Environment** | Alternative PMs | None installed (`pnpm`, `yarn`, `bun` absent) | npm only | Verified local runtime |
| **Git** | Repository Root | `/Volumes/CodingVault/web/HackLeague` | Same | Verified local state |
| **Git** | Current Branch | `main` (Unborn HEAD, initial state) | `v1` (Switch before first commit) | Verified local state |
| **Git** | Local Commits | 0 commits (`fatal: no commits yet`) | Initial commit created on `v1` | Verified local state |
| **Git** | Remote `origin` | `https://github.com/srujan-s22/nmit-hackleague.git` | Same | Verified local state |
| **Git** | Remote Refs | 0 refs (`git ls-remote origin` returned 0 refs) | `origin/v1` after push | Verified remote state |
| **Git** | Tracked Files | None | Phase 1 baseline files | Verified local state |
| **Git** | Untracked Files | `rules.md` (SHA-256: `180e1b95...`) | `rules.md` + roadmap + Phase 1 files | Verified local state |
| **Dependencies** | Framework | None installed | Next.js 16 Active LTS (`^16.4.0`), React 19 (`^19.0.0`), React DOM (`^19.0.0`) | **Proposed (Subject to standards-compliant semver & metadata audit)** |
| **Dependencies** | Language | None installed | TypeScript 5.7 (`^5.7.0`) | **Proposed (Subject to standards-compliant semver & metadata audit)** |
| **Dependencies** | Styling | None installed | Tailwind CSS v3 stable (`^3.4.17`), PostCSS 8.4 (`^8.4.49`), Autoprefixer 10.4 (`^10.4.20`) | **Proposed (Subject to standards-compliant semver & metadata audit)** |
| **Dependencies** | Linting | None installed | ESLint 9 (`^9.21.0`), eslint-config-next (`^16.4.0`) | **Proposed (Subject to standards-compliant semver & metadata audit)** |

### 3.2 Clear Boundary: Verified Facts vs. Assumptions
- **Verified Fact:** The repository has never had a commit. The initial commit has not yet occurred.
- **Verified Fact:** Remote origin is reachable and authenticated via osxkeychain.
- **Verified Fact:** npm is the sole globally available package manager on this system; npm lockfiles (`package-lock.json`) must be used for reproducible builds.
- **Assumption to Verify Immediately Before Implementation:** The observed baseline (unborn `main`, 0 local commits, 0 remote refs) must be reverified via read-only commands immediately before implementation begins. If any change is detected, execution halts for user instructions.

---

## 4. Gap Analysis

| Gap ID | Current Verified State | Desired Target State | Evidence | Proposed Resolution | Priority | Blocks Impl? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **GAP-01** | Git HEAD is on unborn branch `main`. | Git HEAD is on `v1` before any commit is created; `main` remains untouched. | `git status --branch` shows `# branch.head main` with zero commits. | Execute non-destructive `git checkout -b v1` before creating any files or commits. | **CRITICAL** | **YES** |
| **GAP-02** | `rules.md` baseline is untracked; `NMIT_HackLeague_Development_Phases.md` is in `/Users/srujan/Downloads/`. | `rules.md` integrity verified against recorded checksum (`180e1b95...`); roadmap synced to root with identical checksum (`eb76a4b7...`). | Verified via `shasum -a 256` against canonical documents. | Step 2 asserts `rules.md` matches expected checksum before setting baseline; copies roadmap non-destructively. Halts on mismatch. | **CRITICAL** | **YES** |
| **GAP-03** | `.gitignore` does not exist. | Robust `.gitignore` ignores `node_modules`, `.next`, `.env*` (with exception `!.env.example`), build logs, temporary audit artifacts (`npm-audit-report.json`), and generated `next-env.d.ts`. | `ls -la` shows only `.git` and `rules.md`. | Create `.gitignore` adhering to Next.js conventions with wildcard `.env*` rule. Verify non-destructively without creating or deleting user files. | **CRITICAL** | **YES** |
| **GAP-04** | No `package.json`, framework, or dependencies installed. | Next.js 16 Active LTS, React 19, TypeScript, Tailwind CSS v3 stable, and ESLint 9 installed via npm after live registry verification, standards-compliant semver/metadata/peer audit, and post-install fail-closed security audit. | `ls -la` shows no `package.json`. | Author compatible `package.json`; generate lockfile via `npm install`; verify tree via `npm ls --depth=0`; validate range satisfaction via `semver.satisfies`; truthfully inspect `engines.node`; resolve and validate peers from declaring package contexts (`resolvePeerPackage`); execute post-install fail-closed `npm audit` against lockfile; enforce strict exit-code enforcement, report schema validation, and unified security audit policy. | **CRITICAL** | **YES** |
| **GAP-05** | No TypeScript configuration (`tsconfig.json`). | Strict TypeScript configuration enabled (`strict: true`, path aliases `@/*`). | File does not exist. | Generate strict `tsconfig.json` referencing generated `next-env.d.ts`. | **HIGH** | **YES** |
| **GAP-06** | No design tokens or Tailwind configuration. | Tailwind v3 configured with institutional palette (`#FFFFFF`, `#F5F6F4`, `#252825`, `#E6E9E5`, `#E3F1E6`, `#F8E8E6`). | No Tailwind or CSS files exist. | Create `tailwind.config.ts`, `postcss.config.mjs`, and root CSS variables in `globals.css`. | **HIGH** | No |
| **GAP-07** | No folder structure for scalable development. | Minimal App Router structure: `src/app/` and `public/`. No speculative empty folders. | Workspace contains only root files. | Establish minimal `src/app/` layout. Defer `src/lib/utils.ts` and UI component folders to Phase 2. Stage files individually. | **MEDIUM** | No |
| **GAP-08** | No `.env.example` or environment guidelines. | Documented `.env.example` with zero required Phase 1 service credentials. | No `.env*` files exist. | Create minimal `.env.example` with clear Phase 1 vs. Future Phase separation. | **HIGH** | No |
| **GAP-09** | Missing developer verification scripts (e.g., `type-check`, `lint`). | `package.json` contains `dev`, `build`, `lint` (`eslint .`), and `type-check`. | No `package.json` exists. | Add `"type-check": "tsc --noEmit"` and `"lint": "eslint ."` to scripts. | **HIGH** | No |
| **GAP-10** | Missing project `README.md`. | Comprehensive `README.md` explaining architecture, setup, scripts, and strict `v1` branch policy. | No `README.md` exists. | Author detailed, truthful `README.md`. | **MEDIUM** | No |
| **GAP-11** | No CI automation workflow. | Minimal GitHub Actions CI checking lockfile install, build, types, and lint on push to `v1`. | `.github/workflows` does not exist. | Create `.github/workflows/ci.yml` targeting `v1` with zero fake secrets. | **MEDIUM** | No |

---

## 5. Phase 1 Scope and Exclusions

### 5.1 Strictly Included in Phase 1
- **Branch Management:** Non-destructive switch to `v1` on unborn HEAD; reverify that `main` has zero commits.
- **Trustworthy Document Integrity:** Compare `rules.md` SHA-256 against expected hash (`180e1b953e6bceb3177dfb5bd8bb54e1fd0dace8837c7a7aaa421b107b5acb7f`), halting on divergence; non-destructive copy of `NMIT_HackLeague_Development_Phases.md` from Downloads with SHA-256 checksum comparison (`eb76a4b7...`).
- **Robust Repository Hygiene & Safe Testing:** Create Next.js-aligned `.gitignore` with wildcard `.env*` rule and `!.env.example` exception, excluding `.env.staging`, `.env.production.local`, generated `next-env.d.ts`, and temporary audit reports (`npm-audit-report.json`). Test ignore behavior safely using `git check-ignore -v` without touching user files.
- **Pre-Installation Live Registry Verification (12 Packages):** Query live npm registry dist-tags, engines, and peerDependencies across all 12 proposed direct dependencies prior to installation. Clearly distinguish registry tags from declared ranges. (No `npm audit` is run at this stage).
- **Framework & Package Setup:** Scaffold `package.json` with the approved 12 direct dependencies; install verified Next.js 16 Active LTS (`^16.4.0`), React 19 (`^19.0.0`), React DOM (`^19.0.0`), TypeScript 5.7 (`^5.7.0`), Tailwind CSS v3 stable (`^3.4.17`), PostCSS 8.4 (`^8.4.49`), Autoprefixer 10.4 (`^10.4.20`), ESLint 9 (`^9.21.0`), and `eslint-config-next` (`^16.4.0`) using npm. Generate reproducible `package-lock.json`.
- **Post-Installation Dependency Tree & Standards-Compliant Semver/Peer Audit:** Post-installation, execute `npm ls --depth=0` and run an automated standards-compliant semver verification script (`semver.satisfies`) to capture exact resolved versions, assert range satisfaction (including patch minimums), systematically inspect installed package metadata with truthful `engines.node` reporting, and resolve/audit peer dependencies from declaring package contexts across nested and scoped `node_modules` layouts (verifying Node 22, React 19, ESLint 9, Tailwind v3). Fails closed if a standards-compliant validator or reliable package resolution is unavailable.
- **Post-Installation Fail-Closed Security Audit Policy:** Execute `npm audit` strictly post-installation against the resolved dependency tree and lockfile; capture machine-readable output while preserving and enforcing CLI exit status (`AUDIT_EXIT` parsed as valid integer, where nonzero can never PASS); evaluate findings via an automated fail-closed audit evaluator that validates report schema (finite non-negative integer counts, category sum consistency, and detailed findings validation), distinguishes operational failures from vulnerability findings, extracts precise advisory IDs and separate CVE aliases (never mislabeling URLs as CVEs), assesses fix compatibility against approved constraints, enforces zero unresolved High/Critical vulnerabilities before build verification or commit, remediates Low/Moderate advisories where compatible semver updates exist, strictly prohibits `--force`, `--legacy-peer-deps`, or unvetted bumps, halts on unresolvable findings, requires fresh re-audit after remediation without report reuse, and safely removes `npm-audit-report.json`.
- **Strict Typing:** Strict `tsconfig.json` configuration (`strict: true`, path alias `@/*`).
- **Standardized ESLint Strategy:** Author `eslint.config.mjs` using ESLint 9 standard flat config array with `eslint-config-next/core-web-vitals` and global ignores. Script: `"lint": "eslint ."`.
- **Institutional Styling:** Tailwind CSS v3 stable configuration with institutional tokens matching `rules.md` Section 15. Root CSS variables in `globals.css`.
- **Minimal Application Shell:** Root `layout.tsx` with semantic metadata, clean placeholder `page.tsx` describing Phase 1 baseline without false claims, and explicit `public/.gitkeep`.
- **Minimal Environment Template:** Non-sensitive `.env.example` requiring zero credentials to run locally or in CI.
- **Developer Scripts:** Add and execute `npm run dev`, `npm run build`, `npm run lint` (`eslint .`), and `npm run type-check`. Record actual results.
- **Documentation:** Create accurate `README.md`.
- **Continuous Integration:** Add minimal `.github/workflows/ci.yml` targeting `v1` running `npm ci`, `build`, `type-check`, and `lint`.
- **Fail-Closed Staging Audit & Full Diff Review:** Stage only individually verified files by path (strictly prohibiting `git add .`, `git add -A`, and whole-directory staging like `src/` or `public/`). Execute a fail-closed manifest comparison script that halts on any extra, missing, or disallowed files (e.g. `next-env.d.ts`, audit reports, real `.env`); inspect the full `git diff --staged` for secrets; recheck active branch; commit on `v1`; and push explicitly to `origin v1`.

### 5.2 Strictly Excluded from Phase 1 (Deferred to Later Phases)
- **Premature Utility Abstractions:** `clsx`, `tailwind-merge`, and `src/lib/utils.ts` (`cn()` helper) are deferred to Phase 2 when reusable components actually require them.
- **Component Libraries & UI Shells (Phase 2):** Buttons, modals, tables, navigation bars, student/admin layout sidebars.
- **Supabase Integration & Database (Phase 3):** Supabase client SDK (`@supabase/supabase-js`, `@supabase/ssr`), database tables, SQL migrations, RLS policies, storage bucket configurations, seed data scripts.
- **Authentication & Student Onboarding (Phase 4):** Supabase Auth, login/signup forms, college ID uploads, OTP flows, password recovery.
- **Role Authorization (Phase 5):** Super Admin assignment, admin permissions, route guards.
- **Business Logic (Phases 6–11):** Hackathons, teams, invitation codes, round submissions, evidence reviews, points ledger, leaderboards, student profiles, audit logs, CSV exports.
- **Email & Reliability (Phase 12):** Resend integration (`resend` SDK), email templates, backup scripts, Supabase health checks.
- **Production Deployment (Phase 13):** Vercel project linking, custom domains, production environment provisioning.

---

## 6. Proposed File-Change Manifest (Approved 18-File Manifest)

| # | File or Path | Action | Reason | Dependencies | Risk |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `rules.md` | **Retain** | Canonical project source of truth; verified against expected SHA-256 (`180e1b95...`). | None | None |
| 2 | `NMIT_HackLeague_Development_Phases.md` | **Create (Sync)** | Copy from `/Users/srujan/Downloads/` to root; verify via SHA-256 (`eb76a4b7...`). | Source file in Downloads | Low (Read-only copy with checksum) |
| 3 | `.gitignore` | **Create** | Ignore `node_modules`, `.next`, `.env*`, build logs, `npm-audit-report.json`, and `next-env.d.ts`; permit `.env.example`. | Git | Low |
| 4 | `package.json` | **Create** | Define project scripts, framework, and Next.js 16 Active LTS dependencies. | npm | Low |
| 5 | `package-lock.json` | **Create** | Lock dependency tree and integrity hashes via `npm install`. | npm | Low |
| 6 | `tsconfig.json` | **Create** | Enforce strict TypeScript compilation and `@/*` path mapping; references generated `next-env.d.ts`. | TypeScript | Low |
| 7 | `next.config.ts` | **Create** | Next.js configuration (reactStrictMode enabled). | Next.js | Low |
| 8 | `postcss.config.mjs` | **Create** | PostCSS configuration for Tailwind CSS v3 stable. | PostCSS, Tailwind | Low |
| 9 | `tailwind.config.ts` | **Create** | Define institutional color palette tokens and typography. | Tailwind CSS 3.4 | Low |
| 10 | `eslint.config.mjs` | **Create** | ESLint 9 standard flat config utilizing `eslint-config-next/core-web-vitals` with global ignores. | ESLint 9, eslint-config-next 16 | Low |
| 11 | `.env.example` | **Create** | Safe environment variable template with zero required Phase 1 credentials. | None | Low |
| 12 | `src/app/globals.css` | **Create** | CSS reset, Tailwind v3 directives (`@tailwind`), root theme CSS variables. | Tailwind CSS | Low |
| 13 | `src/app/layout.tsx` | **Create** | Root App Router layout with SEO metadata, semantic HTML, and font setup. | Next.js, React | Low |
| 14 | `src/app/page.tsx` | **Create** | Minimal institutional placeholder home page reflecting approved colors. | Next.js, React | Low |
| 15 | `public/.gitkeep` | **Create** | Explicit placeholder file preserving static asset directory in Git without directory staging. | Git | Low |
| 16 | `README.md` | **Create** | Project documentation: setup, scripts, architecture, Git branch policy. | None | Low |
| 17 | `.github/workflows/ci.yml` | **Create** | Automated CI pipeline running lockfile install, build, type-check, and lint on `v1`. | GitHub Actions | Low |
| 18 | `PHASE_01_IMPLEMENTATION_PLAN.md` | **Retain** | Implementation plan retained in workspace unless user explicitly authorizes removal. | None | None |

*Important Manifest Exclusions & Staging Invariants:*
- `next-env.d.ts` is explicitly excluded from the manifest and from Git staging because it is generated automatically by Next.js during build/dev and is ignored by Git.
- `npm-audit-report.json` is a temporary diagnostic artifact generated during Step 4 audit analysis; it is excluded from Git by `.gitignore` and removed immediately after findings are recorded.
- Every file in the manifest will be staged **strictly by its exact file path** (e.g., `src/app/globals.css`, `public/.gitkeep`). Staging directory arguments (e.g. `src/` or `public/`) or blanket commands (`git add .`, `git add -A`) is strictly forbidden.
- The Step 13 fail-closed verification script enforces that **exactly these 18 paths**—and no others—are present in the staged index.

---

## 7. Detailed Implementation Sequence

### Step 1: Reverify Baseline and Switch Non-Destructively to `v1`
- **Objective:** Reverify the observed repository baseline immediately before execution, and switch the repository from the default unborn `main` branch to the designated initial development branch `v1`.
- **Prerequisites:** Workspace verified at `/Volumes/CodingVault/web/HackLeague`.
- **Files Affected:** `.git/HEAD`.
- **Verification Commands:**
  ```bash
  # 1. Reverify observed baseline
  git status --short --branch
  git remote -v
  git ls-remote origin

  # 2. Assert baseline invariants:
  # Expected: ## No commits yet on main, origin pointing to expected repo, 0 remote refs.
  # If ANY unexpected local commit or remote ref exists, STOP immediately and consult user.

  # 3. Switch unborn HEAD to v1
  git checkout -b v1
  git status --short --branch
  ```
- **Expected Result:** `git status` reports `## No commits yet on v1`. `main` remains unborn with zero commits.
- **Failure Handling:** If `git status` shows any unexpected commits, remote refs, or divergence, **STOP immediately**. Perform read-only inspection, report state to user, and request explicit direction.
- **Completion Criteria:** Active branch is verified as `v1`.

### Step 2: Establish Trustworthy `rules.md` Baseline & Cryptographic Roadmap Synchronization
- **Objective:** Verify the SHA-256 checksum of `rules.md` against its expected source-of-truth hash before establishing the baseline, safely copy `NMIT_HackLeague_Development_Phases.md` from the user's Downloads directory to the workspace root without overwriting existing files, and verify 100% byte fidelity via SHA-256.
- **Prerequisites:** Step 1 completed.
- **Files Affected:** `NMIT_HackLeague_Development_Phases.md`.
- **Proposed Commands:**
  ```bash
  # 1. Verify rules.md against recorded source-of-truth checksum BEFORE establishing baseline
  EXPECTED_RULES_HASH="180e1b953e6bceb3177dfb5bd8bb54e1fd0dace8837c7a7aaa421b107b5acb7f"
  CALCULATED_RULES_HASH=$(shasum -a 256 rules.md | awk '{print $1}')

  if [ "$CALCULATED_RULES_HASH" != "$EXPECTED_RULES_HASH" ]; then
    echo "CRITICAL ERROR: rules.md checksum does not match expected source of truth!"
    echo "Expected:   $EXPECTED_RULES_HASH"
    echo "Calculated: $CALCULATED_RULES_HASH"
    echo "HALTING IMMEDIATELY. Do not proceed without explicit user authorization."
    exit 1
  fi

  # Record verified baseline hash for subsequent pre-commit checks
  RULES_BASE_HASH="$CALCULATED_RULES_HASH"
  echo "rules.md verified baseline SHA-256: $RULES_BASE_HASH"

  # 2. Verify source roadmap exists and destination does not exist
  EXPECTED_ROADMAP_HASH="eb76a4b7c2a47af67ae3b7ac767cfbfdc9363e68fc2995885190c114262edbc9"
  test -f /Users/srujan/Downloads/NMIT_HackLeague_Development_Phases.md || { echo "Source roadmap missing in Downloads"; exit 1; }
  test ! -f ./NMIT_HackLeague_Development_Phases.md || { echo "Destination roadmap already exists in workspace"; exit 1; }

  # 3. Copy file non-destructively
  cp /Users/srujan/Downloads/NMIT_HackLeague_Development_Phases.md ./NMIT_HackLeague_Development_Phases.md

  # 4. Compute and compare SHA-256 checksums
  SOURCE_HASH=$(shasum -a 256 /Users/srujan/Downloads/NMIT_HackLeague_Development_Phases.md | awk '{print $1}')
  DEST_HASH=$(shasum -a 256 ./NMIT_HackLeague_Development_Phases.md | awk '{print $1}')

  if [ "$DEST_HASH" != "$EXPECTED_ROADMAP_HASH" ] || [ "$SOURCE_HASH" != "$DEST_HASH" ]; then
    echo "CRITICAL ERROR: Roadmap checksum mismatch!"
    echo "Expected: $EXPECTED_ROADMAP_HASH, Got: $DEST_HASH"
    exit 1
  fi
  echo "Roadmap verified and synchronized: $DEST_HASH"
  ```
- **Expected Result:** `rules.md` is strictly verified against `180e1b95...` and recorded as `RULES_BASE_HASH`; roadmap file is copied cleanly and verified against `eb76a4b7...`.
- **Failure Handling:** If `rules.md` does not match the expected hash, **stop immediately**. Do not accept an altered file as a new baseline. If source roadmap is missing or destination already exists with different contents, stop immediately and ask user for instructions. Never overwrite an altered file.
- **Completion Criteria:** Checksums match expected values exactly; both source-of-truth markdown files verified intact.

### Step 3: Robust `.gitignore` Creation and Safe Non-Destructive Verification
- **Objective:** Create a robust `.gitignore` tailored to Next.js and TypeScript conventions that ignores all local environment variants via a blanket `.env*` rule while explicitly permitting `.env.example`, ignores build outputs, caches, framework-generated declarations (`next-env.d.ts`), and temporary audit reports (`npm-audit-report.json`). Verify coverage safely without creating dummy files that could overwrite or delete pre-existing user files.
- **Prerequisites:** Steps 1–2 completed.
- **Files Affected:** `.gitignore`.
- **Proposed `.gitignore` Content:**
  ```gitignore
  # Dependencies
  /node_modules
  /.pnp
  .pnp.js

  # Environment files (Ignore all environment variants; explicitly allow .env.example)
  .env*
  !.env.example

  # Next.js Build Output & Cache
  /.next/
  /out/
  /build
  /dist
  .vercel

  # TypeScript Build Info & Generated Declarations
  *.tsbuildinfo
  next-env.d.ts

  # Security & Diagnostic Reports (Temporary artifacts)
  npm-audit-report.json
  *-audit-report.json

  # Logs
  npm-debug.log*
  yarn-debug.log*
  yarn-error.log*
  .pnpm-debug.log*

  # OS and Editor Artifacts
  .DS_Store
  *.pem
  .vscode/
  .idea/
  *.swp
  *.swo
  ```
- **Non-Destructive Verification Commands:**
  ```bash
  # Git's ignore engine tests pathnames against .gitignore rules directly via git check-ignore.
  # This verification requires NO file creation on disk, ensuring zero risk to pre-existing user files.

  # 1. Test that .env.example is NOT ignored and remains trackable
  # git check-ignore returns exit code 1 when a path is NOT ignored, and 0 when ignored.
  git check-ignore -v .env.example > /dev/null 2>&1
  status=$?
  if [ $status -eq 1 ]; then
    echo "PASS: .env.example is not ignored (correctly trackable per !.env.example exception)"
  elif [ $status -eq 0 ]; then
    echo "CRITICAL FAILURE: .env.example is ignored by .gitignore!"
    exit 1
  else
    echo "CRITICAL FAILURE: git check-ignore failed with unexpected exit code $status"
    exit 1
  fi

  # 2. Test that environment variants, generated declarations, and temporary audit reports ARE ignored
  # git check-ignore must return exit code 0 for every ignored path.
  TEST_IGNORED_PATHS=(
    ".env"
    ".env.local"
    ".env.staging"
    ".env.production.local"
    "next-env.d.ts"
    "npm-audit-report.json"
  )

  for path in "${TEST_IGNORED_PATHS[@]}"; do
    git check-ignore -v "$path" > /dev/null 2>&1
    status=$?
    if [ $status -eq 0 ]; then
      echo "PASS: $path is correctly ignored"
    elif [ $status -eq 1 ]; then
      echo "CRITICAL FAILURE: $path is NOT ignored by .gitignore!"
      exit 1
    else
      echo "CRITICAL FAILURE: git check-ignore failed on $path with unexpected exit code $status"
      exit 1
    fi
  done
  ```
- **Completion Criteria:** `.gitignore` active and tested non-destructively. All environment variants are ignored; `.env.example` is confirmed eligible for tracking; zero pre-existing user files or paths were touched or deleted. Note: `.gitignore` does not retroactively remove tracked files and is not a substitute for pre-commit secret review.

### Step 4: Comprehensive Live Registry Verification, Auditable Post-Install Inspection & Unified Security Audit
- **Objective:** Enforce the strict chronological dependency verification workflow: (1) Query live npm registry metadata across the **complete proposed direct dependency set** (all 12 packages) to inspect published stable releases, engine constraints, and peer dependencies prior to installation (without running `npm audit`); (2) Scaffold `package.json` and generate `package-lock.json` via `npm install`; (3) Verify complete tree resolution via `npm ls --depth=0` exit-code checking and execute an automated standards-compliant semver and package-context peer/metadata audit script; (4) Execute post-installation `npm audit` against the resolved lockfile and tree, capture findings while preserving CLI exit status, validate report schema integrity, enforce strict exit-code rules where nonzero can never pass, extract precise advisory IDs/CVE aliases and fix compatibility, and evaluate the fail-closed security audit policy before proceeding to build verification; (5) Safely dispose of temporary audit report artifacts.
- **Comprehensive Live Registry Verification Commands:**
  ```bash
  echo "--- 1. Querying latest stable release tags from npm registry (All 12 Packages) ---"
  # Note: dist-tags.latest reports the registry's current top-level tag (e.g. Tailwind v4 or ESLint v10).
  # It demonstrates package existence and active publication, but does not by itself prove range compatibility.
  npm view next dist-tags.latest
  npm view react dist-tags.latest
  npm view react-dom dist-tags.latest
  npm view typescript dist-tags.latest
  npm view tailwindcss dist-tags.latest
  npm view postcss dist-tags.latest
  npm view autoprefixer dist-tags.latest
  npm view eslint dist-tags.latest
  npm view eslint-config-next dist-tags.latest
  npm view @types/node dist-tags.latest
  npm view @types/react dist-tags.latest
  npm view @types/react-dom dist-tags.latest

  echo "--- 2. Inspecting version resolution, engine constraints, and peerDependencies for proposed packages ---"
  # Verifies that proposed ranges resolve to published stable releases (not canaries/prereleases) and satisfy Node 22 LTS.

  # Core Framework & React (Production Dependencies - 3)
  npm view "next@^16.4.0" version engines peerDependencies
  npm view "react@^19.0.0" version engines peerDependencies
  npm view "react-dom@^19.0.0" version engines peerDependencies

  # Styling Toolchain (Development Dependencies - 3)
  npm view "tailwindcss@^3.4.17" version engines peerDependencies
  npm view "postcss@^8.4.49" version engines peerDependencies
  npm view "autoprefixer@^10.4.20" version engines peerDependencies

  # Linting & TypeScript Toolchain (Development Dependencies - 3)
  npm view "eslint@^9.21.0" version engines peerDependencies
  npm view "eslint-config-next@^16.4.0" version engines peerDependencies
  npm view "typescript@^5.7.0" version engines peerDependencies

  # Type Definitions (Development Dependencies - 3)
  npm view "@types/node@^22.10.0" version engines
  npm view "@types/react@^19.0.0" version engines
  npm view "@types/react-dom@^19.0.0" version engines
  ```
  *Registry Verification Halt Conditions:*
  - If the registry is unreachable, a proposed version range is invalid, unpublished, or resolves to an unstable/prerelease tag, or if any peer-dependency incompatibility is detected with Node 22 or framework peers, the implementation agent must **HALT IMMEDIATELY** and report the issue to the user.
  - The agent must **never guess or silently alter dependency versions**.
- **Proposed `package.json` Content:**
  ```json
  {
    "name": "nmit-hackleague",
    "version": "0.1.0",
    "private": true,
    "scripts": {
      "dev": "next dev",
      "build": "next build",
      "start": "next start",
      "lint": "eslint .",
      "type-check": "tsc --noEmit"
    },
    "dependencies": {
      "next": "^16.4.0",
      "react": "^19.0.0",
      "react-dom": "^19.0.0"
    },
    "devDependencies": {
      "@types/node": "^22.10.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "typescript": "^5.7.0",
      "tailwindcss": "^3.4.17",
      "postcss": "^8.4.49",
      "autoprefixer": "^10.4.20",
      "eslint": "^9.21.0",
      "eslint-config-next": "^16.4.0"
    }
  }
  ```
- **Installation, Lockfile Generation & Standards-Compliant Semver/Metadata Audit:**
  ```bash
  # 1. Install dependencies and generate package-lock.json
  npm install

  # 2. Verify complete top-level dependency tree resolution and check exit code
  npm ls --depth=0 || {
    echo "CRITICAL ERROR: npm ls reported missing packages, invalid tree, or peer dependency conflicts!"
    exit 1
  }

  # 3. Standards-Compliant Semver Range Validation, Truthful Engine Audit & Package-Context Peer Resolution
  node -e '
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");

    // Standards-compliant semver loader (fails closed if unavailable)
    function loadSemver() {
      const candidates = [
        () => require("semver"),
        () => {
          const npmRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
          return require(path.join(npmRoot, "npm", "node_modules", "semver"));
        },
        () => require(path.resolve("node_modules/semver"))
      ];
      for (const fn of candidates) {
        try {
          const s = fn();
          if (s && typeof s.satisfies === "function") return s;
        } catch (_) {}
      }
      return null;
    }

    const semver = loadSemver();
    if (!semver) {
      console.error("CRITICAL ERROR: Standards-compliant semver validator could not be loaded. Halting.");
      process.exit(1);
    }

    // Resolves a package directory and its package.json from a declaring package context,
    // walking directory hierarchy up to handle scoped packages and nested node_modules layouts.
    // Avoids require.resolve("pkg/package.json") which fails under package exports restrictions.
    function resolvePeerPackage(fromDir, peerName) {
      const peerParts = peerName.startsWith("@") ? peerName.split("/") : [peerName];
      let currentDir = path.resolve(fromDir);

      while (true) {
        const candidate = path.join(currentDir, "node_modules", ...peerParts, "package.json");
        if (fs.existsSync(candidate)) {
          try {
            const meta = JSON.parse(fs.readFileSync(candidate, "utf8"));
            if (meta.version) {
              return { version: meta.version, location: candidate, pkgJson: meta };
            }
          } catch (e) {
            return { error: `Unreadable package.json at ${candidate}: ${e.message}`, location: candidate };
          }
        }
        const parent = path.dirname(currentDir);
        if (!parent || parent === currentDir) break;
        currentDir = parent;
      }
      return null;
    }

    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const declared = { ...pkg.dependencies, ...pkg.devDependencies };

    let lsOutput;
    try {
      lsOutput = JSON.parse(execSync("npm ls --depth=0 --json", { encoding: "utf8" }));
    } catch (err) {
      console.error("CRITICAL ERROR: Failed to execute npm ls --json. npm reported dependency diagnostics or invalid tree:");
      if (err.stdout) console.error(err.stdout.toString());
      if (err.stderr) console.error(err.stderr.toString());
      process.exit(1);
    }

    // Respect npm own diagnostics: fail if problems are reported
    if (lsOutput.problems && lsOutput.problems.length > 0) {
      console.error("CRITICAL ERROR: npm ls reported tree problems/diagnostics:");
      for (const p of lsOutput.problems) {
        console.error(` - ${p}`);
      }
      process.exit(1);
    }

    const installed = lsOutput.dependencies || {};

    const targetPackages = [
      "next", "react", "react-dom",
      "typescript", "tailwindcss", "postcss", "autoprefixer",
      "eslint", "eslint-config-next",
      "@types/node", "@types/react", "@types/react-dom"
    ];

    console.log("================================================================================");
    console.log("STANDARDS-COMPLIANT POST-INSTALL DEPENDENCY & PACKAGE-CONTEXT AUDIT");
    console.log("================================================================================");
    let hasError = false;

    // A. Standards-Compliant Semver Range Validation (All 12 Direct Packages)
    console.log("\n--- A. Top-Level Direct Dependency Satisfaction (via semver.satisfies) ---");
    for (const name of targetPackages) {
      const declaredRange = declared[name];
      if (!declaredRange) {
        console.error(`FAIL: ${name} is in target audit list but missing from package.json!`);
        hasError = true;
        continue;
      }
      const info = installed[name];
      if (!info || !info.version) {
        console.error(`FAIL: ${name} is missing or has no version in top-level installed dependencies!`);
        hasError = true;
        continue;
      }
      if (info.missing) {
        console.error(`FAIL: ${name} is marked as missing by npm ls!`);
        hasError = true;
        continue;
      }
      if (info.invalid) {
        console.error(`FAIL: ${name} is marked as invalid by npm ls!`);
        hasError = true;
        continue;
      }
      const resolvedVersion = info.version;
      const isSatisfied = semver.satisfies(resolvedVersion, declaredRange);
      console.log(`Package: ${name.padEnd(20)} Declared: ${declaredRange.padEnd(12)} Resolved: ${resolvedVersion.padEnd(12)} Satisfied: ${isSatisfied ? "YES" : "NO"}`);
      if (!isSatisfied) {
        console.error(`CRITICAL FAIL: Resolved version ${resolvedVersion} does not satisfy declared range ${declaredRange} (patch minimum or boundary violation)!`);
        hasError = true;
      }
    }

    // B. Systematic Installed Package Metadata & Truthful Node Engine Verification
    console.log("\n--- B. Installed Package Metadata & Node Engine Verification ---");
    const currentActiveNode = process.version;
    console.log(`Active Local Node Runtime: ${currentActiveNode}`);

    for (const name of targetPackages) {
      const pkgJsonPath = path.join("node_modules", ...name.split("/"), "package.json");
      if (!fs.existsSync(pkgJsonPath)) {
        console.error(`FAIL: Cannot locate package.json in node_modules for ${name}!`);
        hasError = true;
        continue;
      }
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      } catch (err) {
        console.error(`CRITICAL FAIL: Could not parse package.json for ${name}: ${err.message}`);
        hasError = true;
        continue;
      }
      if (meta.engines && meta.engines.node) {
        const engineSatisfied = semver.satisfies(currentActiveNode, meta.engines.node);
        console.log(`Package: ${name.padEnd(20)} engines.node: ${meta.engines.node.padEnd(25)} Compatible with Node ${currentActiveNode}: ${engineSatisfied ? "YES" : "NO"}`);
        if (!engineSatisfied) {
          console.error(`CRITICAL FAIL: Package ${name} engine requirement (${meta.engines.node}) is incompatible with active Node runtime ${currentActiveNode}!`);
          hasError = true;
        }
      } else {
        console.log(`Package: ${name.padEnd(20)} engines.node: None declared in package.json (no explicit Node engine constraint enforced)`);
      }
    }

    // C. Package-Context Peer Dependencies Audit (Distinguishing Required vs Optional Peers)
    console.log("\n--- C. Package-Context Peer Dependencies Audit ---");
    for (const declaringName of targetPackages) {
      const declaringDir = path.resolve("node_modules", ...declaringName.split("/"));
      const pkgJsonPath = path.join(declaringDir, "package.json");
      if (!fs.existsSync(pkgJsonPath)) continue;

      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      } catch (err) {
        console.error(`CRITICAL FAIL: Unreadable package.json for ${declaringName}: ${err.message}`);
        hasError = true;
        continue;
      }
      if (!meta.peerDependencies) continue;

      const peerMeta = meta.peerDependenciesMeta || {};
      for (const [peerName, peerRange] of Object.entries(meta.peerDependencies)) {
        const isOptional = peerMeta[peerName] && peerMeta[peerName].optional === true;
        const resolved = resolvePeerPackage(declaringDir, peerName);

        if (!resolved) {
          if (isOptional) {
            console.log(`[OPTIONAL PEER (ABSENT)] Declaring: ${declaringName.padEnd(20)} Peer: ${peerName.padEnd(18)} Range: ${peerRange.padEnd(16)} Status: Not resolved from package context (permitted per peerDependenciesMeta).`);
          } else {
            console.error(`CRITICAL FAIL: Declaring: ${declaringName} requires peerDependency ${peerName} (${peerRange}) but it could not be resolved from ${declaringDir}!`);
            hasError = true;
          }
        } else if (resolved.error) {
          console.error(`CRITICAL FAIL: Error inspecting peer ${peerName} from declaring context ${declaringName}: ${resolved.error}`);
          hasError = true;
        } else {
          const peerSatisfied = semver.satisfies(resolved.version, peerRange);
          const peerTypeLabel = isOptional ? "[OPTIONAL PEER (PRESENT)]" : "[REQUIRED PEER]";
          console.log(`${peerTypeLabel} Declaring: ${declaringName.padEnd(20)} Peer: ${peerName.padEnd(18)} Range: ${peerRange.padEnd(16)} Resolved: ${resolved.version.padEnd(10)} Satisfied: ${peerSatisfied ? "YES" : "NO"} Location: ${resolved.location}`);
          if (!peerSatisfied) {
            console.error(`CRITICAL FAIL: Resolved peer ${peerName}@${resolved.version} at ${resolved.location} violates ${declaringName} peer constraint ${peerRange}!`);
            hasError = true;
          }
        }
      }
    }

    // D. Strict React and React DOM Version Alignment
    console.log("\n--- D. Strict Core Alignments ---");
    if (installed["react"] && installed["react-dom"]) {
      const match = installed["react"].version === installed["react-dom"].version;
      console.log(`React (${installed["react"].version}) and React DOM (${installed["react-dom"].version}) Alignment: ${match ? "MATCHED" : "MISMATCH"}`);
      if (!match) {
        console.error("CRITICAL FAIL: React and React DOM versions must be identical!");
        hasError = true;
      }
    }

    if (hasError) {
      console.error("\nCRITICAL ERROR: Dependency verification, semver validation, engine compatibility, or package-context peer check failed!");
      process.exit(1);
    }
    console.log("\nPASS: All 12 direct dependencies verified with standards-compliant semver, engines audited truthfully, and package-context peer requirements fulfilled.");
  ' || { echo "Dependency verification script failed! Halting."; exit 1; }
  ```
- **Post-Installation Fail-Closed Security Audit Policy & Execution:**
  ```bash
  # 1. Execute npm audit strictly post-installation against resolved lockfile, preserving CLI exit status and keeping stderr separate
  AUDIT_EXIT=0
  npm audit --json > npm-audit-report.json 2> npm-audit-stderr.log || AUDIT_EXIT=$?
  export AUDIT_EXIT

  # 2. Run human-readable npm audit (display diagnostics in terminal)
  echo "--- Human-Readable npm audit inspection (CLI Exit Code: ${AUDIT_EXIT}) ---"
  npm audit || echo "Note: npm audit returned nonzero status (${AUDIT_EXIT}); detailed evaluation proceeds below."

  # 3. Fail-Closed Security Audit Evaluator (Strict Schema Validation & Policy Enforcement)
  node -e '
    const fs = require("fs");

    // A. Enforce audit exit status explicitly: must be a valid integer exit status [0-255]
    const rawAuditExit = process.env.AUDIT_EXIT;
    if (rawAuditExit === undefined || rawAuditExit === "" || !/^-?\d+$/.test(rawAuditExit.trim())) {
      console.error(`CRITICAL FAIL: AUDIT_EXIT environment variable is missing or not a valid integer: "${rawAuditExit}". Halting.`);
      process.exit(1);
    }
    const auditExit = parseInt(rawAuditExit.trim(), 10);
    if (auditExit < 0 || auditExit > 255) {
      console.error(`CRITICAL FAIL: AUDIT_EXIT is out of valid process exit code range [0-255]: ${auditExit}. Halting.`);
      process.exit(1);
    }

    const reportFile = "npm-audit-report.json";
    if (!fs.existsSync(reportFile)) {
      console.error(`CRITICAL FAIL: npm audit report (${reportFile}) was not generated! CLI Exit Code: ${auditExit}. Halting.`);
      process.exit(1);
    }

    let report;
    try {
      const raw = fs.readFileSync(reportFile, "utf8");
      report = JSON.parse(raw);
    } catch (err) {
      console.error(`CRITICAL FAIL: npm audit output is malformed or invalid JSON (CLI Exit Code: ${auditExit}): ${err.message}`);
      process.exit(1);
    }

    // B. Distinguish operational failures (e.g. registry offline, ENOLOCK, timeout) from vulnerability reports
    if (report && typeof report === "object" && report.error) {
      const errCode = report.error.code || "OPERATIONAL_ERROR";
      const errSummary = report.error.summary || report.error.detail || JSON.stringify(report.error);
      console.error(`CRITICAL FAIL: npm audit encountered operational failure [${errCode}]: ${errSummary} (CLI Exit Code: ${auditExit}). Halting.`);
      process.exit(1);
    }

    // C. Validate complete report schema and required structures
    if (!report || typeof report !== "object" || Array.isArray(report)) {
      console.error(`CRITICAL FAIL: npm audit output is not a valid JSON object (CLI Exit Code: ${auditExit})!`);
      process.exit(1);
    }
    if (!report.metadata || typeof report.metadata !== "object" || Array.isArray(report.metadata)) {
      console.error(`CRITICAL FAIL: npm audit report missing required "metadata" object (CLI Exit Code: ${auditExit})!`);
      process.exit(1);
    }
    if (!report.metadata.vulnerabilities || typeof report.metadata.vulnerabilities !== "object" || Array.isArray(report.metadata.vulnerabilities)) {
      console.error(`CRITICAL FAIL: npm audit report missing required "metadata.vulnerabilities" object (CLI Exit Code: ${auditExit})!`);
      process.exit(1);
    }

    const vulns = report.metadata.vulnerabilities;
    const requiredSeverities = ["info", "low", "moderate", "high", "critical"];

    function isValidCount(val) {
      return typeof val === "number" && Number.isInteger(val) && Number.isFinite(val) && val >= 0;
    }

    for (const sev of requiredSeverities) {
      if (!isValidCount(vulns[sev])) {
        console.error(`CRITICAL FAIL: Invalid or missing vulnerability count for severity "${sev}": ${vulns[sev]} (CLI Exit Code: ${auditExit})!`);
        process.exit(1);
      }
    }

    if (!isValidCount(vulns.total)) {
      console.error(`CRITICAL FAIL: Invalid or missing "metadata.vulnerabilities.total": ${vulns.total} (CLI Exit Code: ${auditExit})!`);
      process.exit(1);
    }

    const sumCategories = requiredSeverities.reduce((acc, s) => acc + vulns[s], 0);
    if (vulns.total !== sumCategories) {
      console.error(`CRITICAL FAIL: Report metadata inconsistency: total (${vulns.total}) does not equal category sum (${sumCategories}) (CLI Exit Code: ${auditExit})!`);
      process.exit(1);
    }

    if (report.vulnerabilities === null || typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities)) {
      console.error(`CRITICAL FAIL: npm audit report missing valid "vulnerabilities" map (CLI Exit Code: ${auditExit})!`);
      process.exit(1);
    }

    const detailEntries = Object.entries(report.vulnerabilities);
    if (vulns.total === 0 && detailEntries.length > 0) {
      console.error(`CRITICAL FAIL: Report inconsistency: metadata.total is 0 but vulnerabilities map contains ${detailEntries.length} entries (CLI Exit Code: ${auditExit})!`);
      process.exit(1);
    }
    if (vulns.total > 0 && detailEntries.length === 0) {
      console.error(`CRITICAL FAIL: Report inconsistency: metadata.total is ${vulns.total} but vulnerabilities map is empty (CLI Exit Code: ${auditExit})!`);
      process.exit(1);
    }

    for (const [pkg, item] of detailEntries) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        console.error(`CRITICAL FAIL: Malformed vulnerability entry for package "${pkg}" (CLI Exit Code: ${auditExit})!`);
        process.exit(1);
      }
      if (typeof item.name !== "string" || !item.name) {
        console.error(`CRITICAL FAIL: Vulnerability entry for "${pkg}" missing valid "name" field (CLI Exit Code: ${auditExit})!`);
        process.exit(1);
      }
      if (typeof item.severity !== "string" || !requiredSeverities.includes(item.severity.toLowerCase())) {
        console.error(`CRITICAL FAIL: Vulnerability entry for "${pkg}" has invalid severity: "${item.severity}" (CLI Exit Code: ${auditExit})!`);
        process.exit(1);
      }
      if (typeof item.range !== "string") {
        console.error(`CRITICAL FAIL: Vulnerability entry for "${pkg}" missing valid "range" string (CLI Exit Code: ${auditExit})!`);
        process.exit(1);
      }
      if (!Array.isArray(item.via)) {
        console.error(`CRITICAL FAIL: Vulnerability entry for "${pkg}" has non-array "via" field (CLI Exit Code: ${auditExit})!`);
        process.exit(1);
      }
      const sevKey = item.severity.toLowerCase();
      if (vulns[sevKey] === 0) {
        console.error(`CRITICAL FAIL: Consistency error: package "${pkg}" has severity "${item.severity}" but metadata.${sevKey} is 0 (CLI Exit Code: ${auditExit})!`);
        process.exit(1);
      }
    }

    console.log("================================================================================");
    console.log("FAIL-CLOSED SECURITY AUDIT EVALUATION");
    console.log("================================================================================");
    console.log(`npm audit CLI Exit Status: ${auditExit}`);
    console.log(`Vulnerability Counts: Total: ${vulns.total} | Info: ${vulns.info} | Low: ${vulns.low} | Moderate: ${vulns.moderate} | High: ${vulns.high} | Critical: ${vulns.critical}`);

    // D. Extract and Truthfully Report Findings Breakdown
    const findings = [];
    for (const [pkg, item] of detailEntries) {
      const viaList = Array.isArray(item.via) ? item.via : [];
      const advisories = [];
      for (const v of viaList) {
        if (typeof v === "object" && v !== null) {
          let advisoryId = "N/A";
          if (typeof v.source === "string") {
            advisoryId = v.source;
          } else if (typeof v.source === "number") {
            advisoryId = `npm-${v.source}`;
          } else if (v.url && v.url.includes("GHSA-")) {
            const m = v.url.match(/GHSA-[a-z0-9-]+/i);
            if (m) advisoryId = m[0];
          }

          let cveAlias = "None / Not provided in advisory metadata";
          if (v.cve && typeof v.cve === "string") {
            cveAlias = v.cve;
          } else if (Array.isArray(v.cve) && v.cve.length > 0) {
            cveAlias = v.cve.join(", ");
          } else {
            const cveMatch = `${v.title || ""} ${v.url || ""}`.match(/CVE-\d{4}-\d{4,}/i);
            if (cveMatch) {
              cveAlias = cveMatch[0].toUpperCase();
            }
          }

          advisories.push({
            advisoryId,
            cveAlias,
            title: v.title || "No title provided",
            url: v.url || "No URL provided",
            range: v.range || item.range || "N/A"
          });
        } else if (typeof v === "string") {
          advisories.push({
            advisoryId: `transitive via ${v}`,
            cveAlias: "N/A (dependency chain)",
            title: `Transitive dependency chain through ${v}`,
            url: "N/A",
            range: item.range || "N/A"
          });
        }
      }

      let fixSummary = "NO (No automated fix published)";
      let fixCompatible = "N/A";
      if (item.fixAvailable) {
        if (typeof item.fixAvailable === "object") {
          const isMajor = item.fixAvailable.isSemVerMajor === true;
          fixSummary = `YES (${item.fixAvailable.name}@${item.fixAvailable.version})`;
          fixCompatible = isMajor ? "NO (Breaking major upgrade; broad unvetted bumps prohibited)" : "POTENTIAL (Non-major semver update available; requires compatibility verification)";
        } else if (item.fixAvailable === true) {
          fixSummary = "YES (Fix indicated by npm)";
          fixCompatible = "POTENTIAL (Requires compatibility verification)";
        }
      }

      findings.push({
        package: pkg,
        severity: item.severity.toUpperCase(),
        range: item.range,
        fixSummary,
        fixCompatible,
        advisories
      });
    }

    if (findings.length > 0) {
      console.log("\nDetailed Findings Breakdown:");
      for (const f of findings) {
        console.log(`\n- Affected Package: ${f.package} (Severity: ${f.severity})`);
        console.log(`  Vulnerable Range: ${f.range}`);
        console.log(`  Fix Available:    ${f.fixSummary}`);
        console.log(`  Fix Compatible:   ${f.fixCompatible}`);
        for (const adv of f.advisories) {
          console.log(`  Advisory ID:      ${adv.advisoryId}`);
          console.log(`  CVE Alias:        ${adv.cveAlias}`);
          console.log(`  Advisory Title:   ${adv.title}`);
          console.log(`  Advisory URL:     ${adv.url}`);
        }
      }
    } else {
      console.log("\nZero known vulnerabilities detected across the resolved dependency tree.");
    }

    // E. Acceptance Policy Enforcement
    let policyFailed = false;

    // Rule 1: Zero unresolved High or Critical vulnerabilities
    if (vulns.high > 0 || vulns.critical > 0) {
      console.error(`\nCRITICAL FAIL: Policy violation! Found ${vulns.high} High and ${vulns.critical} Critical vulnerabilities.`);
      console.error("Zero unresolved High/Critical vulnerabilities are permitted before staging, commit, or push.");
      policyFailed = true;
    }

    // Rule 2: Low and Moderate advisories must be remediated or explicitly reviewed
    const lowModCount = vulns.low + vulns.moderate;
    if (lowModCount > 0) {
      console.warn(`\nWARNING: Found ${lowModCount} Low/Moderate advisories in resolved dependency tree.`);
      console.warn("Policy mandates remediation of Low/Moderate advisories where compatible semver updates exist without breaking framework constraints.");
      console.warn("If remediation requires --force, --legacy-peer-deps, or unreviewed broad upgrades, or if no safe fix exists, execution must HALT before staging or committing and request user review.");
      policyFailed = true;
    }

    // Rule 3: Strict Exit Status Enforcement: A nonzero audit exit can NEVER result in an overall PASS
    if (auditExit !== 0) {
      if (vulns.total === 0) {
        console.error(`\nCRITICAL FAIL: npm audit returned nonzero exit status (${auditExit}) despite reporting 0 vulnerabilities! Operational anomaly detected. Halting.`);
      } else {
        console.error(`\nCRITICAL FAIL: npm audit exited with nonzero status (${auditExit}) reflecting unresolved vulnerability findings. Halting.`);
      }
      policyFailed = true;
    }

    if (policyFailed) {
      console.error("\nCRITICAL HALT: Security audit acceptance threshold unmet or inconclusive. Execution stopped before build verification, staging, commit, or push.");
      console.error("Remediation Requirement: If dependencies are updated, rerun tree verification (npm ls --depth=0), generate fresh npm-audit-report.json, and re-evaluate. A previous report cannot be reused.");
      process.exit(1);
    }

    console.log("\nPASS: Security audit acceptance criteria verified (CLI Exit Code: 0, 0 High, 0 Critical, 0 Moderate, 0 Low, 0 Info). Resolved dependency tree is clean of known advisories in npm registry database.");
  ' || {
    echo "CRITICAL ERROR: Security audit acceptance evaluation failed! Halting before build or staging."
    rm -f npm-audit-report.json npm-audit-stderr.log
    exit 1
  }

  # 4. Safely remove temporary report artifacts (never commit to git)
  rm -f npm-audit-report.json npm-audit-stderr.log
  ```
  *Unified Security Audit Acceptance Rules:*
  1. **Strict Chronological Sequence:** Security audit executes strictly post-installation against the resolved dependency tree and lockfile (`package-lock.json`), never pre-installation.
  2. **Strict Exit Status Enforcement:** A nonzero `npm audit --json` exit status (`AUDIT_EXIT`) can **never** result in an overall PASS, regardless of vulnerability counts. The CLI exit code is parsed as a valid integer in `[0, 255]`. A nonzero exit code distinguishes operational failures (e.g. network failure, unreadable output, `report.error`) from vulnerability findings, but neither permits the workflow to continue when acceptance criteria are unmet.
  3. **Comprehensive Report Schema & Integrity Validation:** Before reading values, the evaluator validates that `metadata.vulnerabilities` exists with finite, non-negative integer counts for `info`, `low`, `moderate`, `high`, `critical`, and `total` (rejecting missing, malformed, negative, or non-integer values rather than substituting zero). Enforces `total === sum(categories)` and validates the detailed `vulnerabilities` map and entry fields. If the report is internally inconsistent, malformed, or follows an unknown schema, the evaluator fails closed and halts immediately.
  4. **Precise Advisory Identification & Truthful Evidence:** For each finding, report the affected package, severity, vulnerable range, primary advisory ID (numeric npm advisory ID or GHSA identifier), separate CVE alias (only when explicitly provided, never mislabeling arbitrary URLs or titles as CVE IDs), advisory title, URL, fix availability, and constraint compatibility analysis. Record these details and the real CLI exit status in the Implementation Completion Report.
  5. **Strict Acceptance Threshold:** **Zero unresolved High or Critical vulnerabilities**, and mandatory remediation of all Low or Moderate advisories where compatible semver updates exist without breaking Next.js 16/React 19/Node 22 compatibility.
  6. **Prohibited Remediation Methods:** Strictly prohibit `npm audit fix --force`, `--legacy-peer-deps`, and unreviewed broad version upgrades.
  7. **Mandatory Halt on Unresolvable Advisories:** If any advisory cannot be safely resolved without breaking framework compatibility or semver constraints, the agent must **halt immediately**, record the affected package, CVE ID, severity, and trade-offs, and request user review before proceeding to build verification, staging, or committing.
  8. **Fresh Re-Audit Mandate After Remediation:** After any dependency remediation, rerun `npm ls --depth=0`, the standards-compliant semver/peer audit, and the security audit evaluator against the updated lockfile and dependency tree. Reusing a previous report or assuming a past pass is strictly prohibited; only the current passing audit may authorize subsequent steps.
  9. **Truthful Evidence & Calibrated Claims:** No audit check may be marked passed prior to actual execution and recording of verifiable terminal evidence. A clean audit confirms zero known advisories in the active npm registry database for the resolved dependency tree; it is never described as proof of absolute security.
- **Completion Criteria:** All 12 packages verified; clean `package-lock.json` generated; resolved tree verified via `npm ls --depth=0` (zero problems, exit code 0); standards-compliant semver compliance confirmed; installed package metadata inspected with truthful engine reporting; peer dependencies resolved from declaring package contexts and audited; post-installation `npm audit` executed against lockfile, exit status preserved and verified as 0, complete report schema validated, findings itemized with truthful advisory IDs and CVE aliases, evaluated fail-closed with zero unresolved High/Critical vulnerabilities and acceptance policy satisfied before build verification; temporary `npm-audit-report.json` safely deleted.

### Step 5: Strict TypeScript Configuration (`tsconfig.json`)
- **Objective:** Establish strict TypeScript compilation settings referencing the generated `next-env.d.ts`.
- **Files Affected:** `tsconfig.json`.
- **Proposed Configuration:**
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["dom", "dom.iterable", "esnext"],
      "allowJs": true,
      "skipLibCheck": true,
      "strict": true,
      "noEmit": true,
      "esModuleInterop": true,
      "module": "esnext",
      "moduleResolution": "bundler",
      "resolveJsonModule": true,
      "isolatedModules": true,
      "jsx": "preserve",
      "incremental": true,
      "plugins": [
        {
          "name": "next"
        }
      ],
      "paths": {
        "@/*": ["./src/*"]
      }
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
  }
  ```
- **Verification Method:** Ensure file is syntactically valid JSON. Next.js will populate `next-env.d.ts` on build/dev.
- **Completion Criteria:** `tsconfig.json` enforces `strict: true` and path alias `@/*`.

### Step 6: Pure Tailwind CSS v3 Styling Configuration
- **Objective:** Configure Tailwind CSS v3 stable and PostCSS with the institutional design tokens mandated by `rules.md` Section 15.
- **Files Affected:** `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css`.
- **Proposed `tailwind.config.ts`:**
  ```ts
  import type { Config } from 'tailwindcss';

  const config: Config = {
    content: [
      './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
      './src/components/**/*.{js,ts,jsx,tsx,mdx}',
      './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
      extend: {
        colors: {
          brand: {
            white: '#FFFFFF',
            offwhite: '#F5F6F4',
            charcoal: '#252825',
            grey: '#E6E9E5',
            green: '#E3F1E6',
            'green-text': '#1B5E20',
            red: '#F8E8E6',
            'red-text': '#B71C1C',
          },
        },
      },
    },
    plugins: [],
  };
  export default config;
  ```
- **Proposed `postcss.config.mjs`:**
  ```js
  const config = {
    plugins: {
      tailwindcss: {},
      autoprefixer: {},
    },
  };
  export default config;
  ```
- **Proposed `src/app/globals.css`:**
  ```css
  @tailwind base;
  @tailwind components;
  @tailwind utilities;

  :root {
    --bg-page: #F5F6F4;
    --bg-surface: #FFFFFF;
    --text-primary: #252825;
    --border-subtle: #E6E9E5;
    --state-success-bg: #E3F1E6;
    --state-success-text: #1B5E20;
    --state-error-bg: #F8E8E6;
    --state-error-text: #B71C1C;
  }

  body {
    background-color: var(--bg-page);
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
  }
  ```
- **Verification Method:** Inspect CSS compilation during build; confirm institutional hex values match `rules.md`. Zero multi-color gradients.
- **Completion Criteria:** Tailwind v3 configured cleanly with PostCSS.

### Step 7: Standard ESLint 9 Flat Configuration (`eslint.config.mjs`)
- **Objective:** Configure ESLint using standard ESLint 9 flat configuration array syntax fully supported by the declared minimum ESLint version (`^9.21.0`), incorporating `eslint-config-next/core-web-vitals` with global ignores.
- **Files Affected:** `eslint.config.mjs`.
- **Proposed `eslint.config.mjs` Content:**
  ```js
  import nextVitals from 'eslint-config-next/core-web-vitals';

  const eslintConfig = [
    ...nextVitals,
    {
      ignores: [
        '.next/**',
        'out/**',
        'build/**',
        'next-env.d.ts',
        'npm-audit-report.json',
      ],
    },
  ];

  export default eslintConfig;
  ```
- **Verification Method:** Run `npx eslint .` to verify that linting parses source files without checking `.next` or declaration files, and without missing module errors.
- **Completion Criteria:** Linter configuration is valid, standard across all ESLint 9.x releases, and supported.

### Step 8: Minimal Application Shell (`layout.tsx`, `page.tsx`, `public/.gitkeep`)
- **Objective:** Create the minimal App Router shell representing the Phase 1 development baseline without premature features or misleading claims, and establish an explicit `public/.gitkeep` placeholder for static assets.
- **Files Affected:** `src/app/layout.tsx`, `src/app/page.tsx`, `public/.gitkeep`, `next.config.ts`.
- **Proposed `next.config.ts`:**
  ```ts
  import type { NextConfig } from 'next';

  const nextConfig: NextConfig = {
    reactStrictMode: true,
  };

  export default nextConfig;
  ```
- **Proposed `src/app/layout.tsx`:**
  ```tsx
  import type { Metadata } from 'next';
  import './globals.css';

  export const metadata: Metadata = {
    title: 'NMIT HackLeague — Hackathon Management Portal',
    description: 'Central portal for NMIT students and club administrators to track hackathons, teams, and milestones.',
  };

  export default function RootLayout({
    children,
  }: Readonly<{
    children: React.ReactNode;
  }>) {
    return (
      <html lang="en">
        <body className="min-h-screen antialiased bg-[#F5F6F4] text-[#252825]">
          {children}
        </body>
      </html>
    );
  }
  ```
- **Proposed `src/app/page.tsx`:**
  ```tsx
  export default function HomePage() {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-md border border-[#E6E9E5] bg-[#FFFFFF] p-8 rounded-lg shadow-sm">
          <span className="inline-block px-3 py-1 text-xs font-medium rounded bg-[#E3F1E6] text-[#1B5E20] mb-4">
            Phase 1 Baseline
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-[#252825] mb-2">
            NMIT HackLeague
          </h1>
          <p className="text-sm text-[#252825]/80 mb-6">
            Institutional Hackathon Management & Milestone Tracking Portal
          </p>
          <div className="text-xs text-left text-[#252825]/70 border-t border-[#E6E9E5] pt-4 space-y-1">
            <p><strong>Status:</strong> Project Foundation &amp; GitHub Setup</p>
            <p><strong>Branch:</strong> v1 (Initial Development)</p>
            <p className="text-[11px] text-[#252825]/60 mt-2">
              Student onboarding, hackathons, team tracking, and admin features activate in subsequent phases.
            </p>
          </div>
        </div>
      </main>
    );
  }
  ```
- **Proposed `public/.gitkeep`:** Create empty placeholder file `public/.gitkeep` to allow Git to track the directory explicitly without whole-directory staging.
- **Verification Method:** Inspect for semantic HTML, accessibility tags, and restrained styling. No claims of full verification or production readiness.
- **Completion Criteria:** Shell compiles cleanly.

### Step 9: Minimal Environment Variable Template (`.env.example`)
- **Objective:** Provide a lean `.env.example` requiring zero live service credentials to run Phase 1 locally or in CI, with future-phase variables clearly separated as an informational blueprint.
- **Files Affected:** `.env.example`.
- **Proposed `.env.example` Content:**
  ```env
  # ==============================================================================
  # NMIT HackLeague — Environment Variables Template (.env.example)
  # ==============================================================================
  # This repository does NOT require live service credentials for Phase 1.
  # The foundation runs, lints, and builds locally and in CI without external keys.
  # DO NOT commit real secrets or local credentials to source control.
  # ==============================================================================

  # ------------------------------------------------------------------------------
  # Phase 1: Local Development Configuration (Optional)
  # ------------------------------------------------------------------------------
  # Application Base URL (Defaults to http://localhost:3000 if unset)
  NEXT_PUBLIC_APP_URL="http://localhost:3000"

  # ==============================================================================
  # FUTURE PHASE BLUEPRINT (REFERENCE ONLY — NOT REQUIRED IN PHASE 1)
  # ==============================================================================
  # The following variables will be introduced during later roadmap phases.
  # Do not provision, configure, or depend on these during Phase 1.
  #
  # --- Phase 3 & 4: Supabase Database, Auth & Storage ---
  # NEXT_PUBLIC_SUPABASE_URL="https://your-project-id.supabase.co"
  # NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key-placeholder"
  # SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-placeholder" # Server-only!
  # DATABASE_URL="postgresql://postgres:password@db.your-project.supabase.co:5432/postgres"
  #
  # --- Phase 12: Transactional Email & Reliability ---
  # RESEND_API_KEY="re_placeholder" # Server-only!
  # EMAIL_FROM_ADDRESS="notifications@approved-domain.ac.in" # Configuration
  # CRON_SECRET="placeholder-cron-secret" # Server-only!
  # ==============================================================================
  ```
- **Verification Method:** Confirm `.env.example` contains zero live credentials and that all future-phase variables are commented out.
- **Completion Criteria:** Template clearly distinguishes Phase 1 requirements from future roadmap configurations.

### Step 10: Package Scripts and Tooling Execution
- **Objective:** Execute each developer script, verify framework support, and record actual execution output.
- **Proposed Verification Commands:**
  ```bash
  # 1. Production build (Generates .next/ and next-env.d.ts automatically)
  npm run build

  # 2. Type check (Validates strict types against generated declarations)
  npm run type-check

  # 3. Lint check (runs eslint .)
  npm run lint

  # 4. Dev server check (launch, test HTTP response, terminate cleanly)
  npm run dev &
  DEV_PID=$!
  sleep 3
  curl -I http://localhost:3000 || echo "Dev server startup check failed"
  kill $DEV_PID
  ```
- **Evidence Requirement:** Command outputs and exit codes must be recorded in the Phase 1 completion report. Do not assert "zero errors" prior to running.
- **Failure Handling:** If any check fails, inspect terminal trace and fix root cause. Do not disable checks or bypass errors.
- **Completion Criteria:** All four commands exit with code 0.

### Step 11: Root `README.md` Creation
- **Objective:** Create an accurate, factual `README.md` reflecting the actual repository baseline, setup instructions, developer scripts, and mandatory Git branch policy.
- **Files Affected:** `README.md`.
- **Required Sections:**
  1. Project Title & Overview (NMIT HackLeague).
  2. Technical Architecture (Next.js 16 Active LTS, React 19, Tailwind CSS v3 stable, TypeScript 5.7).
  3. Prerequisites (Node.js 22 LTS, npm 10+).
  4. Local Getting Started (`git checkout v1`, `npm install`, `npm run dev`).
  5. Available Scripts (`npm run dev`, `npm run build`, `npm run lint` [runs `eslint .`], `npm run type-check`).
  6. Git Branch Policy (Strict `v1` initial branch requirement; `main` protection; never push development code to `main`).
  7. Directory Structure.
  8. Troubleshooting Local Setup.
- **Completion Criteria:** `README.md` describes only implemented capabilities; no aspirational claims presented as completed work.

### Step 12: Lean GitHub Actions CI Workflow
- **Objective:** Configure a minimal CI workflow targeting `v1` that verifies lockfile installation, building, type-checking, and linting without requiring fake build secrets.
- **Files Affected:** `.github/workflows/ci.yml`.
- **Proposed Workflow Content:**
  ```yaml
  name: CI - Code Quality & Build

  on:
    push:
      branches: [ v1 ]
    pull_request:
      branches: [ v1 ]

  jobs:
    verify:
      runs-on: ubuntu-latest
      steps:
        - name: Checkout Repository
          uses: actions/checkout@v4

        - name: Setup Node.js 22
          uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: 'npm'

        - name: Install Dependencies
          run: npm ci

        - name: Production Build
          run: npm run build

        - name: TypeScript Type-Check
          run: npm run type-check

        - name: ESLint Check
          run: npm run lint
  ```
- **Key Properties:**
  - Uses `npm ci` to reproduce dependencies from `package-lock.json` under Node 22.
  - Builds first to generate framework declarations (`next-env.d.ts`), ensuring subsequent type-checking succeeds without git tracking.
  - Zero fake secrets injected; Phase 1 builds statically without external credentials.
  - Restricted strictly to `v1`; does not publish or deploy.
- **Completion Criteria:** Syntactically valid YAML created in `.github/workflows/ci.yml`.

### Step 13: Cryptographic Audit, Explicit File Staging, Fail-Closed Manifest Audit, Full Diff Inspection, Initial Commit, and Remote Push
- **Objective:** Verify SHA-256 checksums of governance files, perform secret review, stage **only explicitly reviewed individual files by path** (strictly avoiding whole directories like `src/` or `public/` and avoiding `git add .`), execute a **fail-closed staged manifest verification**, inspect the full staged diff, recheck active branch, commit on `v1`, and push explicitly to `origin v1`.
- **Files Affected:** Git index and remote ref `refs/heads/v1`.
- **Proposed Commands:**
  ```bash
  # 1. Assert branch invariant before staging
  CURRENT_BRANCH=$(git branch --show-current)
  if [ "$CURRENT_BRANCH" != "v1" ]; then
    echo "CRITICAL ERROR: Active branch is '$CURRENT_BRANCH', expected 'v1'! Halting."
    exit 1
  fi

  # 2. Recompute and verify SHA-256 of rules.md against verified baseline recorded in Step 2
  RULES_CURRENT_HASH=$(shasum -a 256 rules.md | awk '{print $1}')
  [ "$RULES_CURRENT_HASH" = "$RULES_BASE_HASH" ] || { echo "rules.md has been modified! Halting."; exit 1; }

  # 3. Recompute and verify SHA-256 of NMIT_HackLeague_Development_Phases.md
  ROADMAP_CURRENT_HASH=$(shasum -a 256 NMIT_HackLeague_Development_Phases.md | awk '{print $1}')
  [ "$ROADMAP_CURRENT_HASH" = "$DEST_HASH" ] || { echo "Roadmap has been modified! Halting."; exit 1; }

  # 4. Secret review across repository
  grep -rn "SUPABASE_SERVICE_ROLE_KEY" . --exclude-dir=node_modules --exclude-dir=.git --exclude=".env.example" || true
  grep -rn "RESEND_API_KEY" . --exclude-dir=node_modules --exclude-dir=.git --exclude=".env.example" || true

  # 5. Confirm temporary audit report is not on disk
  test ! -f npm-audit-report.json || { echo "WARNING: npm-audit-report.json still on disk; removing"; rm -f npm-audit-report.json; }

  # 6. Genuinely explicit file staging: Stage ONLY explicitly reviewed files by exact path.
  # NEVER stage entire directories (e.g. NEVER run 'git add src/' or 'git add public/').
  # NEVER use 'git add .' or 'git add -A'.
  git add \
    .gitignore \
    package.json \
    package-lock.json \
    tsconfig.json \
    next.config.ts \
    postcss.config.mjs \
    tailwind.config.ts \
    eslint.config.mjs \
    .env.example \
    README.md \
    .github/workflows/ci.yml \
    src/app/globals.css \
    src/app/layout.tsx \
    src/app/page.tsx \
    public/.gitkeep \
    rules.md \
    NMIT_HackLeague_Development_Phases.md \
    PHASE_01_IMPLEMENTATION_PLAN.md

  # 7. Strengthened Fail-Closed Staged-Content Review:
  # A. Capture git diff --staged --name-only and explicitly verify the command succeeded
  STAGED_FILES=$(git diff --staged --name-only)
  cmd_exit=$?
  if [ $cmd_exit -ne 0 ]; then
    echo "CRITICAL ERROR: 'git diff --staged --name-only' failed with exit code $cmd_exit! Halting."
    exit 1
  fi

  if [ -z "$STAGED_FILES" ]; then
    echo "CRITICAL ERROR: Staged index is completely empty! Halting."
    exit 1
  fi

  # B. Strict, fail-closed comparison against the exact 18-file approved manifest
  node -e '
    const { execSync } = require("child_process");

    const expectedManifest = [
      ".github/workflows/ci.yml",
      ".gitignore",
      ".env.example",
      "NMIT_HackLeague_Development_Phases.md",
      "PHASE_01_IMPLEMENTATION_PLAN.md",
      "README.md",
      "eslint.config.mjs",
      "next.config.ts",
      "package-lock.json",
      "package.json",
      "postcss.config.mjs",
      "public/.gitkeep",
      "rules.md",
      "src/app/globals.css",
      "src/app/layout.tsx",
      "src/app/page.tsx",
      "tailwind.config.ts",
      "tsconfig.json"
    ].sort();

    let stagedOutput = "";
    try {
      stagedOutput = execSync("git diff --staged --name-only", { encoding: "utf8" }).trim();
    } catch (err) {
      console.error("CRITICAL ERROR: Failed to read staged paths:", err.message);
      process.exit(1);
    }

    const stagedFiles = stagedOutput.split("\n").map(f => f.trim()).filter(Boolean).sort();

    console.log("================================================================================");
    console.log("FAIL-CLOSED STAGED FILE MANIFEST AUDIT");
    console.log("================================================================================");
    console.log(`Approved Manifest Count: ${expectedManifest.length}`);
    console.log(`Actually Staged Count:   ${stagedFiles.length}`);

    let hasError = false;

    // 1. Check for any unexpected or disallowed staged file
    for (const file of stagedFiles) {
      if (!expectedManifest.includes(file)) {
        console.error(`\nCRITICAL ERROR: Disallowed or unexpected file staged: "${file}"`);
        if (file === "next-env.d.ts") {
          console.error("  -> REASON: next-env.d.ts is a generated declaration and must never be staged.");
        } else if (file === "npm-audit-report.json" || file.endsWith("-audit-report.json")) {
          console.error("  -> REASON: Audit reports are temporary diagnostic artifacts and must never be staged.");
        } else if (file.startsWith(".env") && file !== ".env.example") {
          console.error("  -> REASON: Real environment file staged! Real secrets or local environments are forbidden in git.");
        } else {
          console.error("  -> REASON: File is not in the approved Phase 1 file manifest.");
        }
        hasError = true;
      }
    }

    // 2. Check for missing approved files
    for (const file of expectedManifest) {
      if (!stagedFiles.includes(file)) {
        console.error(`\nCRITICAL ERROR: Approved file missing from staging: "${file}"`);
        hasError = true;
      }
    }

    if (hasError) {
      console.error("\nSTAGING AUDIT FAILED: The staged index does not strictly match the approved manifest.");
      process.exit(1);
    }

    console.log("\nPASS: All 18 staged files exactly match the approved manifest with zero extra, missing, or disallowed files.");
  ' || { echo "Staged file verification failed! Halting before commit."; exit 1; }

  # C. Inspect FULL staged diff (Summary commands like --stat are strictly insufficient)
  echo "--- Full Staged Diff Inspection (git diff --staged) ---"
  git diff --staged || { echo "git diff --staged failed!"; exit 1; }

  # 8. Recheck active branch immediately before committing
  FINAL_BRANCH=$(git branch --show-current)
  if [ "$FINAL_BRANCH" != "v1" ]; then
    echo "CRITICAL ERROR: Branch switched unexpectedly to '$FINAL_BRANCH'! Aborting commit.";
    exit 1;
  fi

  # 9. Create initial commit strictly on v1
  git commit -m "chore(foundation): initialize Phase 1 project foundation on v1"

  # 10. Verify commit details
  git log -1 --stat

  # 11. Push explicitly to origin v1 (NEVER push to main)
  git push -u origin v1

  # 12. Verify remote reference
  git ls-remote origin
  ```
- **Completion Criteria:** Foundational commit exists exclusively on `v1`. Full diff inspected and verified. Staged manifest exactly matched 18 approved files. `origin/v1` confirmed via `git ls-remote`. The `main` branch remains untouched and unborn.

---

## 8. Git and GitHub Execution Plan

### 8.1 Observed Branch State & Analysis
- **Observed State:** Local HEAD is on unborn `main` (`# branch.head main`, `# branch.oid (initial)`). Commit history is empty (`fatal: no commits yet`). Remote `origin` has zero references (`git ls-remote origin` returned 0 refs).
- **Execution Path:** Reverify this state immediately before execution. Running `git checkout -b v1` sets HEAD to unborn `refs/heads/v1`. The very first commit is created on `v1`. `main` is never born, never committed to, and never pushed.

### 8.2 Git Recovery Approval Policy (Non-Destructive & Authorization-Governed)
For **any unexpected Git state** detected before or during implementation, the following strict protocol applies:
1. **Immediate Halt:** Stop immediately before switching branches, creating commits, staging files, or pushing.
2. **Preserve Work:** Do not run `git reset`, `git clean`, or any command that could modify the working tree.
3. **Read-Only Inspection:** Execute read-only diagnostics:
   ```bash
   git status --short --branch
   git log --oneline --decorate -n 5 2>&1 || true
   git remote -v
   git ls-remote origin 2>&1 || true
   ```
4. **Report & Request Direction:** Present the observed state and safe alternatives to the user. **Wait for explicit user instruction before proceeding.**

| Unexpected Condition | Prohibited Action | Mandatory Approval Procedure |
| :--- | :--- | :--- |
| **Remote has commits on `main`** | **Do NOT automatically branch `v1` from `origin/main`**; do NOT reset or pull into `main`. | Halt. Report `origin/main` commit history to user. Request direction on whether `v1` should branch from `origin/main` or an empty baseline. |
| **Remote has commits on `v1`** | **Do NOT overwrite remote `v1`**; do NOT force-push. | Halt. Report `origin/v1` commit history. Request direction on whether to rebase or merge user work onto `origin/v1`. |
| **Local `main` has unexpected commits** | **Do NOT run `git branch -D main`**; do NOT reset `main`. | Halt. Report local commit log to user. Request direction on baseline selection. |
| **Remote URL is altered or inaccessible** | Do NOT modify remote configuration. | Halt. Report remote configuration to user and request verified remote URL. |
| **Branch history or state is ambiguous** | Do NOT guess baseline or force commit. | Halt. Report diagnostic outputs to user and await explicit command. |

### 8.3 Git Safety Rules
1. **Never Commit to `main`:** Working on or committing to `main` is strictly forbidden.
2. **Never Push to `main`:** Pushing development code to `main` is strictly forbidden.
3. **Explicit Destination:** Every push command must explicitly designate the branch: `git push origin v1`.
4. **No Destructive Commands:** `git branch -D`, `git reset --hard`, `git push --force`, and `git clean -fd` are prohibited as routine recovery methods.
5. **No Blanket or Directory Staging:** Blanket staging (`git add .`, `git add -A`) and whole-directory staging (e.g. `git add src/`, `git add public/`) are strictly prohibited. Every file must be staged by its exact file path. Pre-existing untracked files must not be touched or swept into the commit.
6. **Mandatory Fail-Closed Staged Manifest Audit:** The implementation agent must verify that the staged file list strictly matches the approved 18-file manifest before committing. Summary commands (`--stat`) or fail-open chained logic (`grep || echo PASS`) are strictly prohibited.
7. **Mandatory Full Staged Diff Inspection:** The implementation agent must run `git diff --staged` to inspect the complete staged content for secrets or unintended alterations before committing.
8. **Future `v2` Policy:** The `v2` branch is reserved for a future version and may only be created or used upon separate explicit user authorization.

---

## 9. Environment and Security Plan

### 9.1 Environment Variable Scope by Phase

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       NMIT HackLeague Environment Boundaries                │
├─────────────────────────────────────────────────────────────────────────────┤
│ PHASE 1 SCOPE (Current Baseline):                                           │
│ - NEXT_PUBLIC_APP_URL: Optional client/server baseline URL.                 │
│ - Zero live credentials required for local dev, linting, or CI builds.      │
├─────────────────────────────────────────────────────────────────────────────┤
│ FUTURE PHASES SCOPE (Informational Blueprint — Not in Phase 1):             │
│ Public / Client:                                                            │
│ - NEXT_PUBLIC_SUPABASE_URL (Phase 3/4)                                       │
│ - NEXT_PUBLIC_SUPABASE_ANON_KEY / PUBLISHABLE_KEY (Phase 3/4)                │
│ Server-Only Secrets:                                                        │
│ - SUPABASE_SERVICE_ROLE_KEY (Phase 3/4)                                      │
│ - DATABASE_URL (Phase 3)                                                    │
│ - RESEND_API_KEY (Phase 12)                                                 │
│ - CRON_SECRET (Phase 12)                                                    │
│ Configuration (Non-secret):                                                 │
│ - EMAIL_FROM_ADDRESS (Phase 12)                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Secret Boundary Rules
1. **Zero Phase 1 Service Secrets:** Phase 1 requires no live Supabase, Resend, or database credentials.
2. **No Privileged Keys in Client Bundles:** Variables bypassing RLS (`SUPABASE_SERVICE_ROLE_KEY`) or authorizing administrative APIs must never have a `NEXT_PUBLIC_` prefix.
3. **Accurate Classification:** `EMAIL_FROM_ADDRESS` is application configuration, not a secret. It will be configured when email integration is introduced in Phase 12.
4. **No Fake Build Secrets in CI:** The build must succeed without injecting dummy API keys. If a future phase requires build-time variables, they must be validated through explicit environment schemas.
5. **Supabase Key Naming Conventions:** When Supabase is integrated in Phase 3/4, the public key naming convention will follow current official Supabase documentation (`NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
6. **Layered Secret Protection:** `.gitignore` does not guarantee secret immunity. Staged diffs must be visually reviewed (`git diff --staged`), and files already tracked by Git cannot be protected by `.gitignore` alone.

---

## 10. Dependency and Compatibility Assessment

### 10.1 Verified Runtime Environment
- **Node.js:** `v22.23.1` (Active LTS). Verified locally via `node -v`. Meets Next.js 16 engine requirement (`>=20.9.0`).
- **npm:** `10.9.8`. Verified locally via `npm -v`.

### 10.2 Proposed Dependency Compatibility Matrix (Complete Direct Dependency Set - All 12 Packages)

| Package | Proposed Range | Role | Compatibility & Selection Rationale | Auditable Standards-Compliant Verification Rule |
| :--- | :--- | :--- | :--- | :--- |
| `next` | `^16.4.0` | Core Framework | **Next.js 16 Active LTS.** Fully supported per official policy (`https://nextjs.org/support-policy`, Active LTS Oct 2025). Fully patched against RSC CVE-2025-55184, CVE-2025-55183, and CVE-2025-67779. Compatible with Node 22 LTS (`>=20.9.0`). | `semver.satisfies(version, '^16.4.0')` must be true; verify installed `engines.node` (`>=20.9.0`); verify required peers `react` and `react-dom` resolved from `next` package context. |
| `react` | `^19.0.0` | UI Library | React 19 is officially paired with Next.js 16. | `semver.satisfies(version, '^19.0.0')` must be true. |
| `react-dom` | `^19.0.0` | DOM Renderer | React 19 DOM renderer (aligned strictly with `react`). | `semver.satisfies(version, '^19.0.0')` must be true; version must strictly match installed `react` version; required peer `react` satisfied in package context. |
| `typescript` | `^5.7.0` | Language | TypeScript 5.7 provides strict type checking compatible with Next.js 16. | `semver.satisfies(version, '^5.7.0')` must be true. |
| `tailwindcss` | `^3.4.17` | Styling Engine | **Tailwind CSS v3 stable release line.** Selected for stable PostCSS integration and `tailwind.config.ts` conventions without Tailwind v4 migration overhead. (Not labeled LTS). | `semver.satisfies(version, '^3.4.17')` must be true; verify PostCSS 8 compatibility. |
| `postcss` | `^8.4.49` | CSS Processor | Required for Tailwind CSS v3 pipeline. | `semver.satisfies(version, '^8.4.49')` must be true. |
| `autoprefixer` | `^10.4.20` | Vendor Prefixes | Standard pairing with Tailwind CSS v3 and PostCSS. | `semver.satisfies(version, '^10.4.20')` must be true; verify required peer `postcss` satisfied in package context. |
| `eslint` | `^9.21.0` | Linter | ESLint 9 is officially supported by `eslint-config-next` 16 peer dependencies (`eslint: '>=9.0.0'`). | `semver.satisfies(version, '^9.21.0')` must be true; verify `engines.node` satisfied by Node 22. |
| `eslint-config-next` | `^16.4.0` | Next.js Lint Rules | Core Web Vitals and App Router rules. Supports ESLint 9 flat configuration. | `semver.satisfies(version, '^16.4.0')` must be true; verify required peer `eslint` satisfied in package context. |
| `@types/node` | `^22.10.0` | TypeScript Types | Node 22 LTS type definitions matching verified runtime. | `semver.satisfies(version, '^22.10.0')` must be true. |
| `@types/react` | `^19.0.0` | TypeScript Types | React 19 type definitions. | `semver.satisfies(version, '^19.0.0')` must be true. |
| `@types/react-dom` | `^19.0.0` | TypeScript Types | React 19 DOM type definitions. | `semver.satisfies(version, '^19.0.0')` must be true. |

### 10.3 Explicit Deferrals & Omissions
- **`clsx` & `tailwind-merge`:** Deferred to Phase 2. Phase 1 placeholder components use static utility strings; dynamic class merging (`cn()`) is not required until multi-variant UI components are built.
- **Component Libraries:** Radix UI, shadcn/ui, and Material UI are excluded from Phase 1.
- **Service SDKs:** `@supabase/supabase-js`, `@supabase/ssr`, and `resend` are excluded from Phase 1.

### 10.4 Clear Distinction: Registry Tags, Declared Ranges & Installed Versions
To ensure complete technical clarity and auditability during implementation, three distinct version concepts are maintained:
1. **Registry `dist-tags.latest`:** This is metadata published by package maintainers on the npm registry pointing to their newest release channel (for example, `tailwindcss` `dist-tags.latest` points to `4.x`, and `eslint` points to `10.x`). Querying this tag demonstrates registry reachability and general package publication status, but **does not by itself prove that our proposed dependency range is compatible or resolvable**.
2. **Declared `package.json` Ranges:** These are our architectural specifications (e.g. `tailwindcss: ^3.4.17`, `eslint: ^9.21.0`), intentionally chosen to ensure toolchain stability, PostCSS compatibility, and official peer dependency support without unreviewed major-version breaking changes.
3. **Actual Installed / Resolved Versions:** These are the concrete, immutable versions resolved by npm during `npm install` and recorded in `package-lock.json` and `node_modules` (e.g. `tailwindcss@3.4.17`, `eslint@9.21.0`).

### 10.5 Auditable Post-Installation Verification & Standards-Compliant Semver Strategy
- **Exit-Code Tree Resolution & npm Diagnostics:** Immediately following `npm install`, the implementation agent must run `npm ls --depth=0` and verify that the command succeeds with exit code 0. Any reported missing packages, invalid dependencies, or conflicting peers halt execution immediately. Diagnostics reported in `npm ls --depth=0 --json` (including the `problems` array) must be investigated and resolved; real dependency errors must never be suppressed.
- **Standards-Compliant Semver Validation (`semver.satisfies`):** The automated Step 4 verification script uses an official semver range validator to evaluate every installed direct dependency against its exact declared range. It enforces both upper major bounds and lower patch minimums (e.g. rejecting `3.4.16` for `^3.4.17`), preventing naive major/minor truncation bugs. If a standards-compliant validator cannot be loaded, execution fails closed and halts.
- **Truthful Installed Package Metadata & Engine Auditing:** The script directly inspects `node_modules/<pkg>/package.json` for all 12 direct packages. If `engines.node` is declared, it verifies whether the active local Node runtime (`v22.23.1`) satisfies the constraint using `semver.satisfies`. If `engines.node` is absent, the script truthfully reports that no engine constraint was declared rather than labeling absence as proof of compatibility.
- **Package-Context Peer Resolution (`resolvePeerPackage`):** Peers are evaluated from the context of each declaring package directory (`node_modules/<declaringPkg>`), rather than assuming all peers exist in the top-level dependency map. The resolution algorithm walks up the directory hierarchy from the declaring package's location, correctly handling scoped packages (`@scope/pkg`) and nested `node_modules` trees without relying on `require.resolve("pkg/package.json")` (which fails when package exports restrict access). Fails closed if a peer cannot be resolved or its `package.json` cannot be parsed.
- **Optional vs. Required Peer Handling:** Evaluates `peerDependenciesMeta[peerName].optional === true`. Required peers must resolve and satisfy declared ranges. Absent optional peers are permitted; present optional peers must satisfy their declared ranges. An absent required peer or range violation immediately halts execution.
- **Core Alignments:** Verifies strict version matching between `react` and `react-dom`.
- **Post-Installation Fail-Closed Security Audit Evaluation & Chronological Sequence:**
  1. *Sequence:* (1) Pre-installation registry verification via `npm view` (no `npm audit` pre-install); (2) `package.json` creation and `npm install` (lockfile generation); (3) `npm ls --depth=0` and standards-compliant semver/peer auditing; (4) Post-install `npm audit` against the resolved lockfile and dependency tree; (5) Subsequent build and quality verification (`npm run build`, `lint`, `type-check`, etc.) strictly gated behind passing security audit.
  2. *Fail-Closed Evaluation & Strict Exit-Code Enforcement:* Output is captured while preserving CLI exit status (`AUDIT_EXIT`), which is validated as a non-negative integer. A nonzero exit code can **never** result in an overall PASS, regardless of reported vulnerability counts. The dedicated Node.js evaluator validates the report schema (requiring finite non-negative integer counts for all severity categories and total, sum equality, and consistency with detailed vulnerability entries), distinguishes operational failures (`report.error`, network timeouts) from vulnerability findings, extracts precise advisory IDs (npm numeric / GHSA) and separate CVE aliases (without mislabeling URLs or titles as CVEs), assesses fix compatibility against approved constraints, enforces zero unresolved High or Critical vulnerabilities, mandates remediation of Low and Moderate advisories where compatible semver updates exist without `--force` or unvetted bumps, and halts immediately if acceptance criteria are unmet.
  3. *Remediation Re-Audit Mandate:* If any advisory is remediated, the dependency tree verification, lockfile generation, and security audit must be re-executed in full against the updated tree. Reusing a prior report is strictly prohibited; only the current passing audit authorizes progression.
- **Completion Reporting & Strict Halt:** All actual resolved versions, declared ranges, engine findings, peer findings, audit metrics, advisory IDs, CVE aliases, and warnings must be recorded directly into the Implementation Completion Report. If any dependency resolution, version-range compliance, registry access, peer compatibility, or the agreed security acceptance criteria cannot be verified, execution must **STOP IMMEDIATELY**. Bypassing checks via `--force` or `--legacy-peer-deps` is strictly prohibited.

---

## 11. Validation and Testing Matrix

| Check ID | Verification Focus | Exact Command / Method | Expected Result | Required Evidence | Actual Result (To Record) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VAL-01** | Git Branch | `git status --short --branch` | `## No commits yet on v1` | Active branch is `v1`; `main` not active. | *To record during implementation* |
| **VAL-02** | Checksum Baselines | `shasum -a 256 rules.md NMIT_HackLeague_Development_Phases.md` | SHA-256 matches expected baselines | `rules.md` strictly verified against `180e1b95...` before baseline set; roadmap matches `eb76a4b7...`. | *To record during implementation* |
| **VAL-03** | Git Ignore Coverage | Non-destructive `git check-ignore -v` on test paths | `.env*`, `next-env.d.ts`, and audit report ignored (exit 0); `.env.example` not ignored (exit 1) | Command exit codes strictly validated; zero user files created, modified, or deleted. | *To record during implementation* |
| **VAL-04** | Clean Install, Semver/Peer Audit & Fail-Closed Security Audit | `npm install && npm ls --depth=0` + Node.js semver/peer audit script, followed by `npm audit` + Node.js fail-closed audit evaluator script | Exit code 0 across each sequential step | Exact lockfile generated; `npm ls --depth=0` exits 0 with zero tree problems; all 12 direct packages satisfy declared ranges per `semver.satisfies`; `engines.node` validated when declared (truthfully reported when absent); required peers resolved from declaring package contexts and satisfied; optional peers evaluated per `peerDependenciesMeta`; post-install security audit executed against resolved lockfile with exit status preserved and verified as 0, complete report schema validated, findings itemized with truthful advisory IDs and CVE aliases, zero unresolved High/Critical vulnerabilities, and acceptance policy satisfied before build verification. | *To record during implementation* |
| **VAL-05** | Production Build | `npm run build` | Exit code 0 | Next.js build generates static route (`/`) and `next-env.d.ts` without external keys. | *To record during implementation* |
| **VAL-06** | Type Check | `npm run type-check` | Exit code 0 | `tsc --noEmit` completes with zero type errors against generated `next-env.d.ts`. | *To record during implementation* |
| **VAL-07** | ESLint | `npm run lint` | Exit code 0 | `eslint .` completes without errors or unhandled warnings. | *To record during implementation* |
| **VAL-08** | Dev Server | `npm run dev` (curl `http://localhost:3000`) | HTTP 200 OK | HTML response contains "NMIT HackLeague". | *To record during implementation* |
| **VAL-09** | Fail-Closed Staged Manifest Audit & Secret Review | `git diff --staged --name-only` verified against approved 18-file manifest + full `git diff --staged` inspection + secret grep | Exit code 0 | Exact 18 files staged; 0 extra/missing files; 0 secrets; summary stats not relied upon. | *To record during implementation* |
| **VAL-10** | Push to `origin v1`| `git push -u origin v1` | Push succeeded | `refs/heads/v1` confirmed via `git ls-remote origin`. Active branch verified as `v1`. | *To record during implementation* |

*Note: No check may be marked passed until executed during implementation and supported by actual terminal evidence.*

---

## 12. Risks and Mitigations

| Risk | Impact | Probability | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Accidental Commit to `main`** | High | Low | Reverify baseline; switch to `v1` on unborn HEAD in Step 1. Recheck branch immediately before committing via `git branch --show-current`. |
| **Fail-Open Staging Validation** | High | Low | Replaced chained grep pipeline with fail-closed manifest comparison script in Step 13 that halts on any extra, missing, or disallowed files. |
| **Blanket or Directory Staging Leaks** | High | Low | Strictly prohibit `git add .`, `git add -A`, and whole-directory staging (`src/`, `public/`). Stage only explicitly named individual files from the approved manifest. |
| **Silent Modification of `rules.md`** | High | Low | In Step 2, assert SHA-256 matches expected `180e1b95...` BEFORE establishing baseline hash. Recompute and verify before staging and committing. Halt if altered. |
| **Incomplete Semver Range Validation** | High | Low | Use standards-compliant semver range validator (`semver.satisfies`) in Step 4. Enforce exact patch minimums and boundary semantics; fail closed if validator is unavailable. |
| **Unchecked or Inaccurately Resolved Peer Incompatibilities** | High | Low | Resolve peer dependencies from the declaring package's filesystem location (`node_modules/<declaringPkg>`) walking up directory hierarchies to support scoped and nested packages without exports restrictions. Evaluate `peerDependencies` with `peerDependenciesMeta`, permitting absent optional peers while enforcing range compliance on all present peers. Evaluate `engines.node` against Node 22 when declared, reporting truthfully when undeclared. Respect `npm ls` exit codes and diagnostics. |
| **Destructive Ignore Testing** | Medium | Low | Execute non-destructive `git check-ignore -v` on paths without touching or deleting pre-existing files on disk. Validate shell exit codes explicitly. |
| **Unexpected Remote History Divergence** | High | Low | Follow Git Recovery Approval Policy: halt immediately, inspect read-only, report to user, request explicit direction. |
| **Unresolved Security Advisories or Inconclusive Audit** | High | Low | Run `npm audit` against the resolved lockfile strictly post-installation, capturing JSON output while preserving CLI exit status (`AUDIT_EXIT`). Execute fail-closed Node.js evaluator enforcing that a nonzero exit can never pass, validating report schema (finite non-negative integer counts and category sum consistency), detecting operational failures, reporting vulnerabilities by severity/ID/CVE-alias, assessing fix compatibility, and enforcing zero unresolved High/Critical vulnerabilities before build, staging, or commit. Prohibit `--force` or unvetted bumps. Mandate fresh re-audit after any remediation without report reuse. Pause for review if remediation breaks compatibility or audit is inconclusive. |
| **Incomplete Environment Ignore Coverage** | High | Low | Use `.env*` wildcard with explicit exception `!.env.example`. Test path matching non-destructively for `.env.staging`, `.env.production.local`, etc. |
| **ESLint 9 Flat-Config Incompatibilities** | Medium | Low | Use standard ESLint 9 array flat config with `{ ignores: [...] }`. Avoid ESLint 10 `eslint/config` imports. Run `eslint .`. |
| **CI Build Failure Without Credentials** | Medium | Low | Build Phase 1 application completely statically. Do not introduce build-time service dependencies or fake CI secrets. |
| **Accidental Secret Tracking** | Critical | Low | Comprehensive `.gitignore` combined with visual full staged diff inspection (`git diff --staged`) and keyword grep. |
| **Premature Scope Bloat** | Medium | Low | Strictly exclude Supabase SDKs, database migrations, authentication, UI components, and email utilities. |

---

## 13. Rollback and Recovery Plan

### 13.1 Non-Destructive Principles
1. **No Destructive Branch Deletions:** Never run `git branch -D main` or similar commands.
2. **Preserve Untracked Governance Files:** Never run `git clean -fd` or `git reset --hard` indiscriminately, which would destroy untracked `rules.md` or local user files.
3. **Safe Local File Cleanup:** If dependency scaffolding fails, remove only generated files (`node_modules/`, `package.json`, `package-lock.json`, temporary `npm-audit-report.json`) while keeping `rules.md` and documentation intact.
4. **Pre-Push Staging Abort:** If an error is detected before pushing:
   ```bash
   # Unstage files without discarding local work
   git restore --staged <file>
   ```
5. **No Force-Pushing:** If a remote push fails, fetch and inspect the remote state (`git fetch origin`, `git log origin/v1`). Never use `--force` or `--force-with-lease`.
6. **Stop on Divergence:** If any Git operation encounters an unexpected state or ambiguity, stop immediately and seek user instruction.

---

## 14. Phase 1 Completion Checklist

- [ ] **Baseline Reverification:** Repository baseline reverified prior to execution; active branch is `v1`. The `main` branch has zero commits.
- [ ] **Trustworthy Governance Baselines:** `rules.md` verified against recorded source-of-truth checksum (`180e1b95...`) before baseline establishment; `NMIT_HackLeague_Development_Phases.md` (SHA-256: `eb76a4b7...`) synchronized to workspace root and verified.
- [ ] **Repository Hygiene & Non-Destructive Ignore Coverage:** `.gitignore` uses `.env*` wildcard with `!.env.example` exception; tested non-destructively to verify that `.env`, `.env.local`, `.env.staging`, `.env.production.local`, generated `next-env.d.ts`, and `npm-audit-report.json` are ignored while `.env.example` is trackable; zero pre-existing user files touched.
- [ ] **Complete Live Registry Verification (12 Packages):** Live registry queried across all 12 proposed direct dependencies (`dist-tags.latest`, `engines`, `peerDependencies`) prior to package installation; stable releases and Node 22 compatibility verified.
- [ ] **Framework Foundation & Dependency Installation:** `package.json` authored with the approved 12 direct dependencies; Next.js 16 Active LTS (`^16.4.0`), React 19 (`^19.0.0`), React DOM (`^19.0.0`), TypeScript 5.7, and Tailwind CSS v3 stable (`^3.4.17`) installed via npm; reproducible lockfile `package-lock.json` generated.
- [ ] **Auditable Dependency Tree, Standards-Compliant Semver & Package-Context Peer Audit:**
  - [ ] `npm ls --depth=0` exited with code 0 (zero tree problems reported by npm).
  - [ ] Standards-compliant semver range validator (`semver.satisfies`) verified all 12 direct dependencies satisfy declared ranges down to patch level.
  - [ ] Installed `package.json` metadata inspected (`engines.node` evaluated when present; truthfully reported when absent).
  - [ ] Peer dependencies resolved from declaring package contexts (`resolvePeerPackage`) across nested/scoped `node_modules` without exports-restricted `require.resolve`.
  - [ ] Required peers satisfied; optional peers distinguished and evaluated per `peerDependenciesMeta`.
  - [ ] Exact resolved versions, locations, and metadata findings recorded in completion report.
- [ ] **Post-Installation Fail-Closed Security Audit:** `npm audit` executed strictly post-installation against the resolved lockfile and tree; CLI exit status preserved and verified (`AUDIT_EXIT === 0` required to pass); report schema validated (finite non-negative integers for all categories, sum equality, detailed findings consistency); operational errors distinguished from vulnerability findings; itemized findings breakdown (advisory IDs, separate CVE aliases, titles, URLs, fix compatibility) recorded in completion report; zero unresolved High or Critical vulnerabilities confirmed; Low/Moderate advisories evaluated and remediated where compatible updates exist; no destructive `--force` flags used; fresh re-audit required after any remediation (no report reuse); policy verified before build; temporary `npm-audit-report.json` safely removed.
- [ ] **Strict Typing:** `tsconfig.json` enforces `strict: true` and `@/*` path mapping; references generated `next-env.d.ts`.
- [ ] **Standardized Linting:** `eslint.config.mjs` configured with standard ESLint 9 array syntax, `eslint-config-next/core-web-vitals`, and global ignores. Script: `"lint": "eslint ."`.
- [ ] **Institutional Styling:** Tailwind CSS v3 stable configured with institutional color tokens (`#FFFFFF`, `#F5F6F4`, `#252825`, `#E6E9E5`, `#E3F1E6`, `#F8E8E6`). Zero multi-color gradients.
- [ ] **Minimal Shell & Explicit Placeholders:** Clean `layout.tsx`, honest placeholder `page.tsx`, and explicit `public/.gitkeep`. Zero premature utilities or component libraries.
- [ ] **Lean Environment Template:** `.env.example` requires zero live credentials for Phase 1; future roadmap variables clearly separated.
- [ ] **Developer Quality Verification (Executed & Recorded):**
  - [ ] `npm run build` executed and output recorded (generates `.next/` and `next-env.d.ts`).
  - [ ] `npm run type-check` executed and output recorded.
  - [ ] `npm run lint` (`eslint .`) executed and output recorded.
  - [ ] `npm run dev` executed and local HTTP 200 response recorded.
- [ ] **Secret Hygiene:** Full staged diff inspected; zero live credentials committed.
- [ ] **CI Pipeline:** `.github/workflows/ci.yml` created targeting `v1` with lockfile-based `npm ci` build.
- [ ] **Documentation:** `README.md` created with accurate setup, scripts, and branch policies.
- [ ] **Fail-Closed Staging & Review:** Files staged strictly individually by path from the approved 18-file manifest (no directory arguments; no `git add .`); fail-closed audit script verified exact 18-file match (zero extra/missing/disallowed files); full content inspected via `git diff --staged`; active branch verified on `v1`. Initial commit created on `v1` and pushed to `origin v1`. Remote verified via `git ls-remote`.
- [ ] **Plan Document Retention:** `PHASE_01_IMPLEMENTATION_PLAN.md` retained in workspace root unless user explicitly authorizes deletion.

---

## 15. Dependencies, Blockers, and Open Decisions

### 15.1 Strict Chronological Verification Sequence Before and After Installation
1. **Pre-Installation Registry & Metadata Verification:** Run live `npm view` queries for `dist-tags.latest`, `engines`, and `peerDependencies` across all 12 proposed direct dependencies. Confirm registry availability, published stable releases, Node 22 runtime compatibility, and framework peer requirements. Do NOT run `npm audit` at this stage, as no package manifest or lockfile exists yet.
2. **Package Manifest Creation & Dependency Installation:** Author `package.json` with the approved 12 direct dependencies and execute `npm install` to generate the initial `package-lock.json`.
3. **Post-Installation Dependency Tree & Standards-Compliant Semver/Peer Audit:** Run `npm ls --depth=0` (assert exit code 0 and zero reported problems) and execute the Node.js standards-compliant semver range validator and package-context peer/metadata audit script (`semver.satisfies`, truthful `engines.node`, package-context `peerDependencies`, `peerDependenciesMeta`) to confirm all 12 direct dependencies satisfy declared ranges down to the patch level, engine constraints are verified, and peers resolve correctly from package contexts.
4. **Post-Installation Security Audit & Fail-Closed Policy Enforcement:** Execute `npm audit` strictly post-installation against the resolved dependency tree and lockfile, capture machine-readable JSON output while preserving exit status (`AUDIT_EXIT`), evaluate findings via the fail-closed Node.js audit evaluator (enforcing that nonzero exit can never pass, validating report schema integrity and category count consistency, reporting truthful advisory IDs and CVE aliases, assessing fix compatibility, enforcing zero unresolved High/Critical vulnerabilities, and remediating Low/Moderate advisories where compatible semver updates exist), and remove temporary report artifacts. After any remediation, rerun tree verification and audit against the updated lockfile (no report reuse).
5. **Subsequent Build, Quality & Staging Verification:** Only after the dependency tree, semver constraints, package-context peers, and security audit have fully passed (with exit code 0 and validated clean report) may execution proceed to build verification (`npm run build`), type-checking, linting, local server testing, staged manifest auditing, commit, and push.

### 15.2 Blockers
- **Independent Plan Review:** In accordance with non-negotiable workflow rules, all implementation is paused pending independent review and explicit user approval.

### 15.3 Deferred Product Decisions (From `rules.md` Section 18)
The following seven open product decisions remain explicitly deferred:
1. *Internal Registration Completion Rule* -> Deferred to Phase 7.
2. *External Registration Verification Proof* -> Deferred to Phase 7.
3. *Evidence Retention & Dispute Window* -> Deferred to Phase 8.
4. *Hackathon-Scoped Admin Permissions* -> Deferred to Phase 5.
5. *Direct vs. Approved Profile Field Edits* -> Deferred to Phase 10.
6. *Eligible Win & Prize Placement Definitions* -> Deferred to Phase 9.
7. *Operational Backup & Data Retention Policy* -> Deferred to Phase 12.

---

## 16. Handoff to Implementation

### Recommended Next Action
1. The user explicitly authorized Phase 1 implementation in prompt directive.
2. The implementation agent executes Steps 1 through 13 sequentially, records observable command outputs in the completion report, and halts before starting Phase 2.
3. The plan document `PHASE_01_IMPLEMENTATION_PLAN.md` is retained in the workspace root as project reference.
