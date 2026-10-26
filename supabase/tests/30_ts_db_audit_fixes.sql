-- Suite 30: Task Alpha database audit fixes (TS-DBA)
-- 20261102000001_db_audit_fixes.sql + 20261102000002_db_rule_gaps.sql
BEGIN;
SELECT plan(14);

DO $$
DECLARE
  v_super UUID := '00000000-0000-0000-0000-000000000001';
  v_h_live UUID := 'e0300000-0000-0000-0000-000000000001';
  v_h_ended UUID := 'e0300000-0000-0000-0000-000000000002';
  v_h_other UUID := 'e0300000-0000-0000-0000-000000000003';
BEGIN
  INSERT INTO public.hackathons (id, title, slug, description, organizer, mode, venue, status,
    registration_start_at, registration_end_at, event_start_at, event_end_at, created_by, external_registration_url)
  VALUES
    (v_h_live, 'DBA Live', 'dba-live', 'd', 'NMIT', 'online', NULL, 'published',
     now() - interval '5 days', now() - interval '2 days', now() - interval '1 day', now() + interval '3 days', v_super, 'https://example.com/r'),
    (v_h_ended, 'DBA Ended', 'dba-ended', 'd', 'NMIT', 'online', NULL, 'registration_closed',
     now() - interval '10 days', now() - interval '8 days', now() - interval '7 days', now() - interval '1 day', v_super, 'https://example.com/r'),
    (v_h_other, 'DBA Other', 'dba-other', 'd', 'NMIT', 'online', NULL, 'published',
     now() - interval '1 day', now() + interval '5 days', now() + interval '6 days', now() + interval '9 days', v_super, 'https://example.com/r');
  INSERT INTO public.hackathon_rounds (id, hackathon_id, round_number, name, start_at, end_at, status)
  VALUES ('e0300000-0000-0000-0000-000000000010', v_h_other, 1, 'Other round', now() + interval '6 days', now() + interval '7 days', 'scheduled');
END $$;

-- Grants: identical explicit model
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
              WHERE n.nspname = 'public' AND d.defaclrole = 'postgres'::regrole
                AND array_to_string(d.defaclacl, ',') ~ '(anon|authenticated|service_role)='),
  'TS-DBA-01: no implicit default privileges for API roles in public');
SELECT ok(NOT has_function_privilege('anon', 'public.adjust_points_ledger_entry(uuid,uuid,uuid,integer,text,text,uuid,boolean)', 'EXECUTE'),
  'TS-DBA-02: anon cannot execute admin points functions');
SELECT ok(NOT has_table_privilege('anon', 'public.profiles', 'SELECT'), 'TS-DBA-03: anon cannot read profiles');
SELECT ok(has_table_privilege('service_role', 'public.points_ledger', 'SELECT'), 'TS-DBA-04: server reads used by the app are granted');

-- 'verified' registration status removed
SELECT ok((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_teams_external_status') !~ 'verified',
  'TS-DBA-05: external_status no longer allows verified');

-- Lifecycle advances by date
SELECT public.refresh_hackathon_statuses(NULL);
SELECT is((SELECT status FROM public.hackathons WHERE slug = 'dba-live'), 'ongoing', 'TS-DBA-06: started event becomes ongoing');
SELECT is((SELECT status FROM public.hackathons WHERE slug = 'dba-ended'), 'completed', 'TS-DBA-07: finished event becomes completed');
SELECT is((SELECT status FROM public.hackathons WHERE slug = 'dba-other'), 'published', 'TS-DBA-08: future event untouched');

-- Forward-only transitions and archive rule
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001"}';
SELECT throws_ok($$ SELECT public.transition_hackathon_lifecycle('e0300000-0000-0000-0000-000000000001', 'published', NULL) $$,
  '22023', NULL, 'TS-DBA-09: ongoing cannot go back to published');
SELECT is((public.transition_hackathon_lifecycle('e0300000-0000-0000-0000-000000000001', 'ongoing', NULL) ->> 'noop')::boolean, true,
  'TS-DBA-10: repeating the current status is a no-op');
SELECT throws_ok($$ SELECT public.transition_hackathon_lifecycle('e0300000-0000-0000-0000-000000000001', 'archived', 'short') $$,
  '22023', NULL, 'TS-DBA-11: early archive needs a 10+ character reason');

-- Round configuration integrity
SELECT throws_ok($$ SELECT public.configure_hackathon_rounds('e0300000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object(
    'id', 'e0300000-0000-0000-0000-000000000010', 'round_number', 1, 'name', 'Stolen',
    'start_at', now() - interval '1 day', 'end_at', now() + interval '1 day', 'is_final_round', true))) $$,
  '22023', 'A round in the configuration does not belong to this hackathon.', 'TS-DBA-12: foreign round id rejected');
SELECT throws_ok($$ SELECT public.manage_admin_permissions('00000000-0000-0000-0000-000000000002', ARRAY['export_data', NULL]) $$,
  '22023', NULL, 'TS-DBA-13: NULL permission element rejected');

RESET ROLE;
SELECT is((SELECT name FROM public.hackathon_rounds WHERE id = 'e0300000-0000-0000-0000-000000000010'), 'Other round',
  'TS-DBA-14: the other hackathon''s round was not modified');

SELECT * FROM finish();
ROLLBACK;
