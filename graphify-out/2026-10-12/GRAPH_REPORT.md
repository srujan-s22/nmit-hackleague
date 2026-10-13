# Graph Report - HackLeague  (2026-10-12)

## Corpus Check
- 42 files · ~42,761 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 451 nodes · 572 edges · 21 communities (15 shown, 6 thin omitted)
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
- package.json
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
- select.tsx
- preview/layout.tsx

## God Nodes (most connected - your core abstractions)
1. `NMIT HackLeague --- Project Rules & Source of Truth` - 21 edges
2. `NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN` - 19 edges
3. `NMIT HackLeague --- Development Phases` - 18 edges
4. `NMIT HackLeague — Phase 2 Implementation Plan` - 18 edges
5. `NMIT HackLeague --- Development Phases` - 18 edges
6. `compilerOptions` - 16 edges
7. `7. Detailed Implementation Sequence` - 14 edges
8. `Badge()` - 9 edges
9. `Button` - 7 edges
10. `E.3 Content, Status & Feedback Primitives` - 7 edges

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

## Communities (21 total, 6 thin omitted)

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
Cohesion: 0.11
Nodes (19): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, postcss, tailwindcss, @tailwindcss/postcss (+11 more)

### Community 5 - "package.json"
Cohesion: 0.12
Nodes (16): next, dependencies, next, react, react-dom, name, private, scripts (+8 more)

### Community 6 - "7. Detailed Implementation Sequence"
Cohesion: 0.14
Nodes (14): 7. Detailed Implementation Sequence, Step 10: Package Scripts and Tooling Execution, Step 11: Root `README.md` Creation, Step 12: Lean GitHub Actions CI Workflow, Step 13: Cryptographic Audit, Explicit File Staging, Fail-Closed Manifest Audit, Full Diff Inspection, Initial Commit, and Remote Push, Step 1: Reverify Baseline and Switch Non-Destructively to `v1`, Step 2: Establish Trustworthy `rules.md` Baseline & Cryptographic Roadmap Synchronization, Step 3: Robust `.gitignore` Creation and Safe Non-Destructive Verification (+6 more)

### Community 7 - "NMIT HackLeague"
Cohesion: 0.22
Nodes (8): Available Scripts, Branching Policy, Current Status: Phase 1 Baseline, Getting Started, Installation, NMIT HackLeague, Prerequisites, Project Overview

### Community 8 - "NMIT HackLeague — Phase 2 Implementation Plan"
Cohesion: 0.05
Nodes (42): A.1 Purpose and Objective, A.2 Phase Scope Boundaries & Guarantees, A. Executive Summary, B.1 Verified Git & Repository State, B.2 Framework, Tooling & Dependency Baseline, B.3 Existing Application Source Files, B.4 Official Brand Assets in `public/`, B.5 Graphify Baseline & Workflow (+34 more)

### Community 9 - "admin-shell.tsx"
Cohesion: 0.13
Nodes (18): AppHeader(), AppHeaderProps, NavItem, NavSection, SidebarNav(), SidebarNavProps, AdminShell(), AdminShellProps (+10 more)

### Community 10 - "E.3 Content, Status & Feedback Primitives"
Cohesion: 0.09
Nodes (22): 1. `Badge` (`src/components/ui/badge.tsx`), 1. `BrandLogo` (`src/components/ui/brand-logo.tsx`), 1. `Dialog` (`src/components/ui/dialog.tsx`), 1. `Input` (`src/components/ui/input.tsx`), 1. Shared Button Style Helper (`src/components/ui/button.tsx`), 2. `Button` Component (`src/components/ui/button.tsx`), 2. `Card` (`src/components/ui/card.tsx`), 2. `Textarea` (`src/components/ui/textarea.tsx`) (+14 more)

### Community 15 - "showcase/page.tsx"
Cohesion: 0.08
Nodes (39): metadata, metadata, metadata, BreadcrumbItem, PageHeader(), PageHeaderProps, Alert(), AlertProps (+31 more)

### Community 17 - "NMIT HackLeague --- Development Phases"
Cohesion: 0.04
Nodes (47): Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria, Completion criteria (+39 more)

### Community 18 - "D.1 Color Token Architecture & Mathematically Verified Contrast Ratios"
Cohesion: 0.22
Nodes (9): 1. Core Surfaces & Backgrounds, 2. Borders & Interactive Boundaries (WCAG 2.1 SC 1.4.11 Non-Text Contrast $\ge$ 3.0:1), 3. Typography & Text Contrast (WCAG 2.1 SC 1.4.3 Contrast Minimum $\ge$ 4.5:1), 4. Semantic Status & Feedback Tokens (WCAG 2.1 SC 1.4.3 $\ge$ 4.5:1), 5. Institutional Identity Accents, D.1 Color Token Architecture & Mathematically Verified Contrast Ratios, D.2 Typography Scale, D.3 Spacing, Border Radii & Elevation Scales (+1 more)

### Community 19 - "select.tsx"
Cohesion: 0.50
Nodes (3): Select, SelectOption, SelectProps

## Knowledge Gaps
- **276 isolated node(s):** `config`, `nextConfig`, `name`, `version`, `private` (+271 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `NMIT HackLeague — Phase 2 Implementation Plan` connect `NMIT HackLeague — Phase 2 Implementation Plan` to `D.1 Color Token Architecture & Mathematically Verified Contrast Ratios`, `E.3 Content, Status & Feedback Primitives`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN` connect `NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN` to `7. Detailed Implementation Sequence`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `E. Component Inventory, API Contracts & Server/Client Boundaries` connect `E.3 Content, Status & Feedback Primitives` to `NMIT HackLeague — Phase 2 Implementation Plan`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `config`, `nextConfig`, `name` to the rest of the system?**
  _276 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `NMIT HackLeague --- Development Phases` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `NMIT HACKLEAGUE — PHASE 1 IMPLEMENTATION PLAN` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._
- **Should `NMIT HackLeague --- Project Rules & Source of Truth` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._