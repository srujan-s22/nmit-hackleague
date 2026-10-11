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
