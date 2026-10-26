# Database Audit — 2026-10-26

Scope: all 45 files in `supabase/migrations/` (21,724 lines), `supabase/seed.sql`, the live
hosted catalog (functions, grants, RLS policies, storage policies, check constraints) and
every `rpc(...)` / table call in `src/`. Read-only: nothing below has been changed yet.

Severity: **H** = broken behaviour or data/retention risk · **M** = security/consistency gap ·
**L** = dead code / clutter.

## H — fix first

| # | Finding | Evidence | Proposed fix |
|---|---|---|---|
| H1 | Hackathons never reach `ongoing` or `completed` automatically. Nothing sets `completed` at all, and the lifecycle dialog only offers publish / close registration / archive. | No function updates `hackathons.status` to `completed`; `transition_hackathon_lifecycle` is the only writer. | Time-based progression like `refresh_round_statuses`: `published`/`registration_closed` → `ongoing` at `event_start_at`, → `completed` at `event_end_at`. Call it from the same pages and the cron. |
| H2 | Evidence retention never runs for most events. `scan_and_enqueue_expired_hackathons_evidence` only scans `status IN ('ongoing','completed','archived')`, so an event that ends while still `published`/`registration_closed` keeps every screenshot and registration proof forever. | Function WHERE clause. | Fixed by H1, plus include `published`/`registration_closed` with `event_end_at` in the past. |
| H3 | `transition_hackathon_lifecycle` does not guard transitions out of `registration_closed` or `ongoing`. Those states can go back to `draft` or `published`. | Only `draft` and `published` have guard blocks. | Add the allowed-transition table: `registration_closed` → `ongoing`/`archived`, `ongoing` → `completed`/`archived`, `completed` → `archived`. |
| H4 | `team_members_select_completed` (public visibility of finished events' rosters) can never apply, because no event becomes `completed`. | Policy depends on `h.status = 'completed'`. | Fixed by H1. Confirm that this public visibility is wanted. |
| H5 | `teams.external_status = 'verified'` is effectively unreachable since the registration proof stopped needing review. The dashboard "Verified External", the summary "verified_registrations" and the reports column are always 0. | Live data and the current flow (proof → `submitted`). | **Decided (owner, 2026-10-26): remove `verified` entirely.** Migrate any existing `verified` rows to `submitted`. Narrow `chk_teams_external_status` to `not_submitted`/`submitted`/`rejected`. Drop the `verified` branches in `submit_registration_proof`, `get_admin_dashboard_metrics` (Verified External) and `export_dataset_page` (`verified_registrations`). Remove the matching UI counters, badges and filters (dashboard card, submissions "VERIFIED" filter, reports catalog column) and the tests that reference them. |

## M — security / consistency

| # | Finding | Evidence | Proposed fix |
|---|---|---|---|
| M1 | `profiles_update_admin` lets any admin with `verify_students`/`manage_students` UPDATE profiles directly, including `registration_status` (WITH CHECK `true`). This bypasses `review_student_registration` and its audit trail. The app never does a direct admin update. | Hosted policy; `protect_profile_columns` allows admins. | Drop the policy. Admin changes go only through the existing review/approval RPCs. |
| M2 | Two different `provision_admin_profile` overloads exist (a 4-arg one used by the app and an old 7-arg one with `p_is_super_admin`). The unused one takes an `is_super_admin` flag and is granted to `authenticated`. | `pg_proc` overloads. | Drop the 7-arg overload after verifying that its internal guard can't elevate. Even unused, it is attack surface. |
| M3 | `complete_storage_deletion_job` has two overloads (2-arg and 3-arg). The function was redefined 5 times. | `pg_proc`. | Keep the one the cron uses and drop the other. |
| M4 | Tables with RLS enabled but no policies: `profile_action_authorizations`, `rate_limit_buckets`, `evidence_validation_intents`. This is correct (server/definer only), but they are undocumented. | Catalog. | Add a comment per table. No behaviour change. |
| M5 | `rls_auto_enable()` is SECURITY DEFINER, has EXECUTE granted to PUBLIC, and nothing calls it. | `pg_proc` grants. | Revoke from PUBLIC or drop it. Verify first whether it is a Supabase platform helper. |
| M6 | `review_round_advancement` is a second, older review RPC alongside `review_round_submission`. Its server action `reviewRoundAdvancementAction` is not used by any screen. | `src/actions/registration-proof-actions.ts`; no UI reference. | Drop the action and the RPC. One review path only. |
| M7 | `hosted service_role` lacked default table grants (fixed today for the tables the server reads). Local Supabase probably still has the defaults, so local and hosted behave differently. | Today's bug B8. | Make grants explicit and identical in one migration, then diff local against hosted. |

## L — dead / duplicate code (not called by the app, any trigger or any other SQL)

| Function | Note |
|---|---|
| `award_milestone_points`, `adjust_student_points`, `reverse_points_award` | Superseded by the `submit_registration_proof`/review award paths, `adjust_points_ledger_entry` and `reverse_points_ledger_entry`. |
| `claim_storage_deletion_jobs`, `fail_storage_deletion_job` | Superseded by `claim_storage_deletion_batch` / reconciliation flow. |
| `compute_registration_state` | Unused helper. |
| `extend_hackathon_event_deadline` | No caller. `override_hackathon_deadline` is used instead. |
| `resolve_investigation_job` | No caller or UI. |
| `audit_data_export` | Replaced by `record_data_export` (still referenced by old pgTAP suites 16/21). |
| `export_profile_change_requests_report` | Replaced by the reports hub. |

The functions below are referenced by server actions but have **no screen**. Keep them and
build a UI, or remove them: `pause_hackathon_round`, `resume_hackathon_round`,
`override_round_schedule`, `auto_pause_expired_rounds` (called only by cron).

Clutter, not wrong: 16 functions were redefined 3–5 times across migrations, and 12 policies
were recreated 3–5 times. Only the last definition matters. A schema squash is optional and
risky, so I don't recommend it.

## Local ↔ hosted sync gaps

1. Today's 6 migrations (`20261101000001`–`06`) are on hosted only. Docker was down, so they have never run locally.
2. `seed.sql` holds required configuration (point values) that hosted never received. Fixed for point values; check that nothing else in the seed is required.
3. `src/types/database.ts` is stale: it has no new RPCs (`refresh_round_statuses`, export RPCs, etc.). Regenerate it from hosted.
4. pgTAP suites 07, 12, 13, 15–19 and 21 were already failing before today. Re-baseline them after the sync.

## Plan for the next session (Docker running)

1. `supabase start` → `supabase migration up --local` (applies today's 6). Run the full pgTAP suite for a baseline.
2. Run `supabase db diff --linked` (and a catalog comparison of grants and policies) to prove local = hosted.
3. One migration `…_db_audit_fixes.sql`: H1–H5, M1–M3, M5–M7 and the L drops. Add pgTAP coverage for the lifecycle, retention, grants and the narrowed external_status values.
4. Fix or retire the stale pgTAP suites. Regenerate types. Run `npm test`, type-check and the build.
5. `supabase db push --linked`, then re-run the hosted smoke tests (submit, review, export, verification).

### H5 removal — app files that reference `verified` (update in the same change)
`src/app/student/teams/teams-client.tsx`, `src/app/student/hackathons/[slug]/page.tsx`,
`src/app/admin/hackathons/[id]/submissions/submissions-client.tsx`,
`src/app/admin/hackathons/[id]/teams/teams-client.tsx`, `src/components/students/student-detail-shared.tsx`,
`src/components/teams/team-status-banner.tsx`, `src/components/teams/registration-proof-card.tsx`,
`src/lib/student/queries.ts`, `src/app/admin/admin-dashboard-client.tsx` (Verified External),
`src/lib/reports/dataset-catalog.ts` (Verified Registrations column), `src/types/database.ts` (regenerate).

## Task Alpha — Part 2 decision (owner, 2026-10-26)
**Round controls: Option A — build the UI.** On each round in the admin Submissions page add
"Pause", "Resume" and "Change dates" actions (each requires a reason; audited), wired to the
existing `pauseRoundAction` / `resumeRoundAction` / `overrideRoundScheduleAction` and RPCs
`pause_hackathon_round` / `resume_hackathon_round` / `override_round_schedule`. Visible only to
admins with config authority for that hackathon. Keep `auto_pause_expired_rounds` (cron).
Verify the RPCs' reason length (10) matches the dialogs, and that paused rounds are skipped by
`refresh_round_statuses` (already the case).

## Task Alpha — parallel browser testing (owner-approved)
Owner allows multiple Claude tab groups / subagents in Chrome. Constraint: tabs in one Chrome
profile share cookies per host, so use separate hosts for separate signed-in users:
`http://localhost:3000`, `http://127.0.0.1:3000`, `http://[::1]:3000` (3 independent sessions).
Notification permission must be granted once per host by the owner (push gate), before testing.
Use parallel agents for Part 2/3 browser flows only; Part 1 (DB) stays sequential.

## Task Alpha — Part 1 STATUS: DONE (2026-11-02)
Migrations (local + hosted): `20261102000001_db_audit_fixes.sql`, `20261102000002_db_rule_gaps.sql`.
- Grants explicit and identical; default privileges for anon/authenticated/service_role removed (M7).
- `verified` removed (H5): data migrated, CHECK narrowed, 4 functions + 10 app files updated.
- Lifecycle by date (H1/H2/H4): `refresh_hackathon_statuses` (called via `refresh_round_statuses`, pages, cron); forward-only transitions (H3).
- Dropped: review_round_advancement (+ unused action), provision_admin_profile 7-arg, adjust_student_points, resolve_investigation_job, export_profile_change_requests_report, audit_data_export.
- Rule gaps found while re-baselining tests: NULL permission element; round override past event end; deadline override on draft / unchanged / reopen; venue required to publish in-person/hybrid; repeat status = no-op; pause on paused = no-op; early archive Super Admin only; round config deletes removed rounds (unless referenced) and rejects foreign/duplicate ids.
- M1 (direct admin UPDATE on profiles) **deferred**: dropping it breaks the trigger-guard design tested by suite 20; protect_profile_columns still guards protected fields.
- Kept on purpose: rls_auto_enable (Supabase platform, hosted-only), award_milestone_points / claim_storage_deletion_jobs / fail_storage_deletion_job / complete_storage_deletion_job(2-arg) / compute_registration_state / extend_hackathon_event_deadline (service-role only or referenced by tests).
- Tests: pgTAP 30 suites / 704 assertions PASS (all 9 stale suites repaired; new suite 30). Unit tests, type-check, lint, build PASS. `src/types/database.ts` regenerated.
- Sync proof: `supabase db dump` public schema hosted vs local differ only by rls_auto_enable.

## Task Alpha — Parts 2 & 3 STATUS: DONE (2026-11-02)
- Migration `20261102000003_hackathon_edit_round_window.sql` (local + hosted): editing a hackathon no longer fails when round 1 runs during registration.
- Round Pause / Resume / Change dates UI: `src/components/hackathons/round-controls-panel.tsx` on the admin Submissions page (config-authority admins only).
- UI/copy: audit log shows names and readable action labels; accepted/rejected submissions no longer show review buttons; rank hidden at 0 points; emojis and jargon removed; deactivate/permissions dialogs simplified; push gate times out with a clear error; sign-out stays on the same host; dev origins 127.0.0.1 / [::1] allowed.
- Parallel browser agents: student flows 7/7 pass; admin flows 6/7 pass (the failure was the edit bug above, now fixed).
- Final verification: pgTAP 30 suites / 704 PASS; unit tests 101 + legacy suites PASS; type-check, lint, build PASS; hosted vs local public schema identical (only rls_auto_enable differs).
- Still open: re-check the hackathon edit fix in the browser; "Test Hackathon 1" fixture data; push-notification permission is per browser host (testing aid only).
