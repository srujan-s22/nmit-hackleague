# Graph Report - HackLeague  (2026-10-12)

## Corpus Check
- 68 files · ~79,426 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 586 nodes · 703 edges · 47 communities (37 shown, 10 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f8bd43a9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- NMIT HackLeague --- Development Phases
- NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN
- NMIT HackLeague --- Project Rules & Source of Truth
- compilerOptions
- devDependencies
- NMIT HackLeague — Phase 3 Implementation Report
- 7. Detailed Implementation Sequence
- NMIT HackLeague
- NMIT HackLeague — Phase 2 Implementation Plan
- admin-shell.tsx
- E.3 Content, Status & Feedback Primitives
- layout.tsx
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- showcase/page.tsx
- tailwind.config.ts
- NMIT HackLeague --- Development Phases
- D.1 Color Token Architecture & Mathematically Verified Contrast Ratios
- 6. Table-by-Table Schema Specification
- preview/layout.tsx
- NMIT HackLeague — Phase 3 Implementation Plan
- 19.1 Structured Validation Suites (10 Suites)
- database.ts
- 2. Stage A Corrections Implemented
- 15.2 Parameterless Security Definer RLS Helper Definitions
- F. Shell and Route Architecture
- 16.1 Storage Deletion Queue Operational Lifecycle & Worker Trust Boundary
- B. Repository Baseline
- 11.1 Team Formation & Lifecycle Procedures
- 17. Migration Structure and Execution Strategy
- I. Responsive and Accessibility Matrix
- K. Verification and Visual QA Plan
- L. Graphify Update, Diff Inspection and Generated-File Safety
- 12.1 Additive Ledger Rules & Milestone Points
- A. Executive Summary
- N. Strict Scope Boundaries
- H. Official Branding Integration Specification
- 10. Admin, Super Admin, and Permission Model
- 14. Row-Level Security (RLS) Policy Matrix
- 1. Executive Summary
- 2. Repository and Architecture Findings
- 8. Constraint, Index, and Timestamp Strategy
- 18. Development Seed-Data Strategy
- 27. Final Approval Gate Before Implementation
- 4. Existing-State Inventory and Prerequisites
- 9. Student Registration and Approval Data Model

## God Nodes (most connected - your core abstractions)
1. `NMIT HackLeague — Phase 3 Implementation Plan` - 30 edges
2. `NMIT HackLeague --- Project Rules & Source of Truth` - 21 edges
3. `NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN` - 19 edges
4. `NMIT HackLeague --- Development Phases` - 18 edges
5. `NMIT HackLeague — Phase 2 Implementation Plan` - 18 edges
6. `NMIT HackLeague --- Development Phases` - 18 edges
7. `compilerOptions` - 16 edges
8. `6. Table-by-Table Schema Specification` - 16 edges
9. `7. Detailed Implementation Sequence` - 14 edges
10. `19.1 Structured Validation Suites (10 Suites)` - 11 edges

## Surprising Connections (you probably didn't know these)
- `ButtonLinkProps` --inherits--> `ButtonStyleOptions`  [EXTRACTED]
  src/components/ui/button-link.tsx → src/components/ui/button-styles.ts
- `ButtonProps` --inherits--> `ButtonStyleOptions`  [EXTRACTED]
  src/components/ui/button.tsx → src/components/ui/button-styles.ts
- `ButtonLink()` --calls--> `getButtonClasses()`  [EXTRACTED]
  src/components/ui/button-link.tsx → src/components/ui/button-styles.ts
- `Button` --calls--> `getButtonClasses()`  [EXTRACTED]
  src/components/ui/button.tsx → src/components/ui/button-styles.ts

## Import Cycles
- None detected.

## Communities (47 total, 10 thin omitted)

### Community 0 - "NMIT HackLeague --- Development Phases"
Cohesion: 0.04
Nodes (47): Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria (+39 more)

### Community 1 - "NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN"
Cohesion: 0.05
Nodes (43): 10.1 Verified Runtime Environment, 10.2 Proposed Dependency Compatibility Matrix (Complete Direct Dependency Set - All 12 Packages), 10.3 Explicit Deferrals & Omissions, 10.4 Clear Distinction: Registry Tags, Declared Ranges & Installed Versions, 10.5 Auditable Post-Installation Verification & Standards-Compliant Semver Strategy, 10. Dependency and Compatibility Assessment, 11. Validation and Testing Matrix, 12. Risks and Mitigations (+35 more)

### Community 2 - "NMIT HackLeague --- Project Rules & Source of Truth"
Cohesion: 0.05
Nodes (39): 10. Student profiles and participation history, 11. Points and leaderboard, 12. Profile change requests, 13. Admin dashboard, reports, and exports, 14. Audit logs and retention, 15. UI/UX design rules --- MUST FOLLOW, 16. Security and engineering standards, 17. Development workflow for Antigravity/Gravity (+31 more)

### Community 3 - "compilerOptions"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+19 more)

### Community 4 - "devDependencies"
Cohesion: 0.06
Nodes (35): eslint, eslint-config-next, next, dependencies, next, react, react-dom, devDependencies (+27 more)

### Community 5 - "NMIT HackLeague — Phase 3 Implementation Report"
Cohesion: 0.11
Nodes (17): 1. Executive Summary, 2.1 Supabase Configuration & Migrations, 2.2 TypeScript Type Definitions, 2.3 Automated pgTAP Test Suites, 2. Inventory of Implemented Files, 3.1 Migration Application & Reset Transcript, 3.2 pgTAP Test Suite Results, 3.3 Storage Confidentiality HTTP Verification (+9 more)

### Community 6 - "7. Detailed Implementation Sequence"
Cohesion: 0.14
Nodes (14): 7. Detailed Implementation Sequence, Step 10: Package Scripts and Tooling Execution, Step 11: Root `README.md` Creation, Step 12: Lean GitHub Actions CI Workflow, Step 13: Cryptographic Audit, Explicit File Staging, Fail-Closed Manifest Audit, Full Diff Inspection, Initial Commit, and Remote Push, Step 1: Reverify Baseline and Switch Non-Destructively to `v1`, Step 2: Establish Trustworthy `rules.md` Baseline & Cryptographic Roadmap Synchronization, Step 3: Robust `.gitignore` Creation and Safe Non-Destructive Verification (+6 more)

### Community 7 - "NMIT HackLeague"
Cohesion: 0.22
Nodes (8): Available Scripts, Branching Policy, Current Status: Phase 1 Baseline, Getting Started, Installation, NMIT HackLeague, Prerequisites, Project Overview

### Community 8 - "NMIT HackLeague — Phase 2 Implementation Plan"
Cohesion: 0.22
Nodes (8): C. Requirements Traceability Matrix, G. File-by-File Implementation Manifest, J. Acceptance Criteria, M. Risks, Dependencies, and Mitigations, NMIT HackLeague — Phase 2 Implementation Plan, O. Implementation Sequence (For Authorized Execution), P. Final Readiness Checklist, UI Design System, Branding Integration & Role-Based Page Shells

### Community 9 - "admin-shell.tsx"
Cohesion: 0.14
Nodes (16): AppHeader(), AppHeaderProps, NavItem, NavSection, SidebarNav(), SidebarNavProps, AdminShell(), AdminShellProps (+8 more)

### Community 10 - "E.3 Content, Status & Feedback Primitives"
Cohesion: 0.09
Nodes (22): 1. `Badge` (`src/components/ui/badge.tsx`), 1. `BrandLogo` (`src/components/ui/brand-logo.tsx`), 1. `Dialog` (`src/components/ui/dialog.tsx`), 1. `Input` (`src/components/ui/input.tsx`), 1. Shared Button Style Helper (`src/components/ui/button.tsx`), 2. `Button` Component (`src/components/ui/button.tsx`), 2. `Card` (`src/components/ui/card.tsx`), 2. `Textarea` (`src/components/ui/textarea.tsx`) (+14 more)

### Community 15 - "showcase/page.tsx"
Cohesion: 0.07
Nodes (44): metadata, metadata, metadata, BreadcrumbItem, PageHeader(), PageHeaderProps, Alert(), AlertProps (+36 more)

### Community 17 - "NMIT HackLeague --- Development Phases"
Cohesion: 0.04
Nodes (47): Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria (+39 more)

### Community 18 - "D.1 Color Token Architecture & Mathematically Verified Contrast Ratios"
Cohesion: 0.22
Nodes (9): 1. Core Surfaces & Backgrounds, 2. Borders & Interactive Boundaries (WCAG 2.1 SC 1.4.11 Non-Text Contrast $\ge$ 3.0:1), 3. Typography & Text Contrast (WCAG 2.1 SC 1.4.3 Contrast Minimum $\ge$ 4.5:1), 4. Semantic Status & Feedback Tokens (WCAG 2.1 SC 1.4.3 $\ge$ 4.5:1), 5. Institutional Identity Accents, D.1 Color Token Architecture & Mathematically Verified Contrast Ratios, D.2 Typography Scale, D.3 Spacing, Border Radii & Elevation Scales (+1 more)

### Community 19 - "6. Table-by-Table Schema Specification"
Cohesion: 0.12
Nodes (16): 6.10 Table: `public.results`, 6.11 Table: `public.points_ledger`, 6.12 Table: `public.point_configurations`, 6.13 Table: `public.audit_logs`, 6.14 Table: `public.profile_change_requests`, 6.15 Table: `public.storage_deletion_queue`, 6.1 Table: `public.profiles`, 6.2 Table: `public.admin_profiles` (+8 more)

### Community 21 - "NMIT HackLeague — Phase 3 Implementation Plan"
Cohesion: 0.13
Nodes (14): 13. Audit-Record Model, 20. Environment Configuration and Secret-Handling Requirements, 21. Phase Boundaries and Dependencies, 22. Risks, Trade-offs, and Mitigations, 23. Open Decisions and Recommended Defaults, 24. Ordered Implementation Checklist, 25. Acceptance Criteria and Evidence Required, 26. Rollback, Recovery, and Failure-Handling Strategy (+6 more)

### Community 22 - "19.1 Structured Validation Suites (10 Suites)"
Cohesion: 0.17
Nodes (12): 19.1 Structured Validation Suites (10 Suites), 19. Database, RLS, and Storage Test Plan, Suite 10: Migration Drift & Rerun Behavior (`TS-DFT`), Suite 1: Clean Migration Application & Reset (`TS-MIG`), Suite 2: Schema and Constraint Integrity (`TS-INT`), Suite 3: Row-Level Security & Privilege Boundaries (`TS-RLS`), Suite 4: `SECURITY DEFINER` Invocation Boundaries (`TS-SEC`), Suite 5: Super Admin Lifecycle and Disaster Recovery (`TS-ADM`) (+4 more)

### Community 23 - "database.ts"
Cohesion: 0.18
Nodes (10): CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables (+2 more)

### Community 24 - "2. Stage A Corrections Implemented"
Cohesion: 0.20
Nodes (9): 1. Executive Summary, 2. Stage A Corrections Implemented, 3. Stage A Acceptance Gate Verification, 4. Stage A Final Conclusion & Transition to Stage B, Fix 1 — Supported Execution Paths for PostgreSQL Routines, Fix 2 — Test Invocation Syntax Alignment, Fix 3 — RLS, Policy, and Grant Matrix Executability, Fix 4 — Whole-Document Consistency Sweep (+1 more)

### Community 25 - "15.2 Parameterless Security Definer RLS Helper Definitions"
Cohesion: 0.25
Nodes (8): 15.1 PostgreSQL Routine Architecture: Functions vs. Stored Procedures and PostgREST Interface Boundaries, 15.2 Parameterless Security Definer RLS Helper Definitions, 15. Privileged-Function, Procedure, and Grant Inventory, A. Super Admin Check (`public.current_is_super_admin`), B. Permission Check (`public.current_has_permission`), C. Approved Student Check (`public.current_is_approved_student`), D. Anti-Recursive Team Membership Check (`public.current_is_team_member`), E. Profile USN Normalization Trigger Function (`public.normalize_profile_usn`)

### Community 26 - "F. Shell and Route Architecture"
Cohesion: 0.29
Nodes (7): F.1 Architecture Philosophy & Preview-Route Exposure Policy, F.2 Shared Shell Foundations (`src/components/layout/`), F.3 Student Shell (`src/components/shells/student-shell.tsx`), F.4 Administrator Shell (`src/components/shells/admin-shell.tsx`), F.5 Super Admin Shell (`src/components/shells/super-admin-shell.tsx`), F. Shell and Route Architecture, Preview-Route Exposure Policy (Proportionate Isolation):

### Community 27 - "16.1 Storage Deletion Queue Operational Lifecycle & Worker Trust Boundary"
Cohesion: 0.29
Nodes (7): 16.1 Storage Deletion Queue Operational Lifecycle & Worker Trust Boundary, 16. Private Storage Bucket and Policy Design, A. Trusted Server-Side Worker Boundary & Lifecycle Edge Case Handling, B. Queue Enqueue Function (`public.enqueue_storage_deletion_job`), C. Job Claiming Function with Cryptographic Lease Token (`public.claim_storage_deletion_jobs`), D. Job Completion Function with Lease Token Validation (`public.complete_storage_deletion_job`), E. Job Failure Function with Lease Token Validation & Exponential Backoff (`public.fail_storage_deletion_job`)

### Community 28 - "B. Repository Baseline"
Cohesion: 0.33
Nodes (6): B.1 Verified Git & Repository State, B.2 Framework, Tooling & Dependency Baseline, B.3 Existing Application Source Files, B.4 Official Brand Assets in `public/`, B.5 Graphify Baseline & Workflow, B. Repository Baseline

### Community 29 - "11.1 Team Formation & Lifecycle Procedures"
Cohesion: 0.33
Nodes (6): 11.1 Team Formation & Lifecycle Procedures, 11. Hackathon, Team, Membership, and Round Model, A. Atomic Team Creation Procedure (`public.create_team`), B. Atomic Team Joining Procedure (`public.join_team_with_code`), C. Team Roster Locking Procedure (`public.lock_team_roster`), D. Atomic Leadership Transfer Procedure (`public.transfer_team_leadership`)

### Community 30 - "17. Migration Structure and Execution Strategy"
Cohesion: 0.40
Nodes (5): 17.1 Drift-Resistant Migration Layout (11 Migrations), 17.2 Topological Migration Dependency Mapping Table, 17.3 Clean-Database Validation Scenario, 17.4 Zero Schema-Drift Strategy, 17. Migration Structure and Execution Strategy

### Community 31 - "I. Responsive and Accessibility Matrix"
Cohesion: 0.50
Nodes (4): I.1 Breakpoint Strategy (Tailwind CSS v4 Standard), I.2 Viewport Behavior Specification, I.3 Accessibility Compliance (WCAG 2.1 AA), I. Responsive and Accessibility Matrix

### Community 32 - "K. Verification and Visual QA Plan"
Cohesion: 0.50
Nodes (4): K.1 Command-Line Quality Suite, K.2 Production Server Smoke Test, K.3 Visual QA & Accessibility Inspection Workflow, K. Verification and Visual QA Plan

### Community 33 - "L. Graphify Update, Diff Inspection and Generated-File Safety"
Cohesion: 0.50
Nodes (4): L.1 Workflow & Refresh Policy, L.2 Exact Refresh Command, L.3 Verification & Generated-File Safety Steps, L. Graphify Update, Diff Inspection and Generated-File Safety

### Community 34 - "12.1 Additive Ledger Rules & Milestone Points"
Cohesion: 0.50
Nodes (4): 12.1 Additive Ledger Rules & Milestone Points, 12. Submission, Evidence, Results, and Points Model, B. Manual Points Adjustment Procedure (`public.adjust_student_points`), C. Auditable Reversal Procedure (`public.reverse_points_award`)

### Community 35 - "A. Executive Summary"
Cohesion: 0.67
Nodes (3): A.1 Purpose and Objective, A.2 Phase Scope Boundaries & Guarantees, A. Executive Summary

### Community 36 - "N. Strict Scope Boundaries"
Cohesion: 0.67
Nodes (3): Explicitly Out of Scope for Phase 2 (Deferred to Later Phases):, In Scope for Phase 2:, N. Strict Scope Boundaries

### Community 37 - "H. Official Branding Integration Specification"
Cohesion: 0.67
Nodes (3): H.1 Asset Inventory & Technical Properties (Strictly 2 Official Logos), H.2 Sizing, Framing & Contrast Guidelines, H. Official Branding Integration Specification

### Community 38 - "10. Admin, Super Admin, and Permission Model"
Cohesion: 0.67
Nodes (3): 10.1 Administrative Hierarchy, 10.2 Canonical Administrator Permission Catalogue, 10. Admin, Super Admin, and Permission Model

### Community 39 - "14. Row-Level Security (RLS) Policy Matrix"
Cohesion: 0.67
Nodes (3): 14.1 Public Application Tables (15 Tables), 14.2 Supabase Storage Bucket Policies, 14. Row-Level Security (RLS) Policy Matrix

### Community 40 - "1. Executive Summary"
Cohesion: 0.67
Nodes (3): 1.1 Purpose and Architectural Objective, 1.2 Phase Scope Boundaries & Guarantees, 1. Executive Summary

### Community 41 - "2. Repository and Architecture Findings"
Cohesion: 0.67
Nodes (3): 2.1 Git & Branch Inspection, 2.2 Application Stack & Dependency Inspection, 2. Repository and Architecture Findings

### Community 42 - "8. Constraint, Index, and Timestamp Strategy"
Cohesion: 0.67
Nodes (3): 8.1 Database Constraints vs. Application Logic, 8.2 Timestamp Standardization, 8. Constraint, Index, and Timestamp Strategy

## Knowledge Gaps
- **378 isolated node(s):** `config`, `nextConfig`, `name`, `version`, `private` (+373 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `NMIT HackLeague — Phase 3 Implementation Plan` connect `NMIT HackLeague — Phase 3 Implementation Plan` to `12.1 Additive Ledger Rules & Milestone Points`, `10. Admin, Super Admin, and Permission Model`, `14. Row-Level Security (RLS) Policy Matrix`, `1. Executive Summary`, `2. Repository and Architecture Findings`, `8. Constraint, Index, and Timestamp Strategy`, `18. Development Seed-Data Strategy`, `27. Final Approval Gate Before Implementation`, `4. Existing-State Inventory and Prerequisites`, `9. Student Registration and Approval Data Model`, `6. Table-by-Table Schema Specification`, `19.1 Structured Validation Suites (10 Suites)`, `15.2 Parameterless Security Definer RLS Helper Definitions`, `16.1 Storage Deletion Queue Operational Lifecycle & Worker Trust Boundary`, `11.1 Team Formation & Lifecycle Procedures`, `17. Migration Structure and Execution Strategy`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `NMIT HackLeague — Phase 2 Implementation Plan` connect `NMIT HackLeague — Phase 2 Implementation Plan` to `K. Verification and Visual QA Plan`, `L. Graphify Update, Diff Inspection and Generated-File Safety`, `A. Executive Summary`, `N. Strict Scope Boundaries`, `H. Official Branding Integration Specification`, `E.3 Content, Status & Feedback Primitives`, `D.1 Color Token Architecture & Mathematically Verified Contrast Ratios`, `F. Shell and Route Architecture`, `B. Repository Baseline`, `I. Responsive and Accessibility Matrix`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN` connect `NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN` to `7. Detailed Implementation Sequence`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `config`, `nextConfig`, `name` to the rest of the system?**
  _378 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `NMIT HackLeague --- Development Phases` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `NMIT HackLeague --- Project Rules & Source of Truth` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._