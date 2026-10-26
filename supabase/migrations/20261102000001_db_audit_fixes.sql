-- Migration: 20261102000001_db_audit_fixes.sql
-- Task Alpha / Part 1: fixes from db-audit.md (2026-10-26).
--
-- 1. Grants made explicit and identical on every environment (M7). Local Supabase
--    granted ALL on every table/function to anon/authenticated/service_role by default;
--    hosted did not (local even let anon EXECUTE some admin functions). All privileges for
--    those roles are revoked and the exact intended set (captured from hosted, the
--    reviewed production state) is re-granted. Default privileges are removed so new
--    objects never receive implicit grants: every migration must grant explicitly.
-- 2. Hackathon lifecycle advances by date (H1, H2, H4) and only moves forward (H3).
-- 3. teams.external_status 'verified' removed entirely (H5, owner decision).
-- 4. (M1, direct admin UPDATE on profiles, deferred: protect_profile_columns guards it.)
-- 5. Dead / duplicate functions dropped (M2, M6, L).

BEGIN;

-- ===========================================================================
-- 1. EXPLICIT, IDENTICAL GRANTS
-- ===========================================================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated, service_role;
REVOKE ALL ON ALL PROCEDURES IN SCHEMA public FROM anon, authenticated, service_role;

-- Intended privilege set (identical to hosted as of 2026-11-02).
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
REVOKE ALL ON FUNCTION "public"."_export_authorize"("p_dataset" "text", "p_hackathon_id" "uuid", OUT "o_is_super" boolean, OUT "o_can_pii" boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."adjust_points_ledger_entry"("p_student_id" "uuid", "p_hackathon_id" "uuid", "p_team_id" "uuid", "p_points" integer, "p_reason" "text", "p_idempotency_key" "text", "p_adjusted_entry_id" "uuid", "p_override_negative_floor" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_points_ledger_entry"("p_student_id" "uuid", "p_hackathon_id" "uuid", "p_team_id" "uuid", "p_points" integer, "p_reason" "text", "p_idempotency_key" "text", "p_adjusted_entry_id" "uuid", "p_override_negative_floor" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_points_ledger_entry"("p_student_id" "uuid", "p_hackathon_id" "uuid", "p_team_id" "uuid", "p_points" integer, "p_reason" "text", "p_idempotency_key" "text", "p_adjusted_entry_id" "uuid", "p_override_negative_floor" boolean) TO "service_role";
REVOKE ALL ON FUNCTION "public"."adjust_student_points"("p_student_id" "uuid", "p_hackathon_id" "uuid", "p_team_id" "uuid", "p_points" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_student_points"("p_student_id" "uuid", "p_hackathon_id" "uuid", "p_team_id" "uuid", "p_points" integer, "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."approve_profile_change_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_profile_change_request"("p_request_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."assign_admin_to_hackathon"("p_hackathon_id" "uuid", "p_target_admin_id" "uuid", "p_role" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_admin_to_hackathon"("p_hackathon_id" "uuid", "p_target_admin_id" "uuid", "p_role" "text", "p_notes" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."audit_data_export"("p_dataset" "text", "p_format" "text", "p_hackathon_id" "uuid", "p_filters" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_data_export"("p_dataset" "text", "p_format" "text", "p_hackathon_id" "uuid", "p_filters" "jsonb") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."auto_pause_expired_rounds"("p_hackathon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_pause_expired_rounds"("p_hackathon_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."award_milestone_points"("p_student_id" "uuid", "p_hackathon_id" "uuid", "p_team_id" "uuid", "p_round_id" "uuid", "p_milestone_type" "text", "p_result_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_milestone_points"("p_student_id" "uuid", "p_hackathon_id" "uuid", "p_team_id" "uuid", "p_round_id" "uuid", "p_milestone_type" "text", "p_result_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_milestone_points"("p_student_id" "uuid", "p_hackathon_id" "uuid", "p_team_id" "uuid", "p_round_id" "uuid", "p_milestone_type" "text", "p_result_id" "uuid", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."bootstrap_super_admin"("p_auth_uid" "uuid", "p_email" "text", "p_full_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_super_admin"("p_auth_uid" "uuid", "p_email" "text", "p_full_name" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."broadcast_admin_access_changed"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."can_admin_manage_assignments"("p_hackathon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_admin_manage_assignments"("p_hackathon_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_admin_manage_hackathon"("p_hackathon_id" "uuid", "p_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_admin_manage_hackathon"("p_hackathon_id" "uuid", "p_permission_key" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_admin_manage_hackathon_config"("p_hackathon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_admin_manage_hackathon_config"("p_hackathon_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_admin_review_hackathon"("p_hackathon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_admin_review_hackathon"("p_hackathon_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_upload_registration_proof"("p_team_id_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_upload_registration_proof"("p_team_id_text" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_upload_submission_evidence"("p_hackathon_id" "uuid", "p_submission_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_upload_submission_evidence"("p_hackathon_id" "uuid", "p_submission_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_upload_team_round_evidence"("p_team_id" "uuid", "p_round_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_upload_team_round_evidence"("p_team_id" "uuid", "p_round_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_view_legacy_evidence"("p_hackathon_id_text" "text", "p_submission_id_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_legacy_evidence"("p_hackathon_id_text" "text", "p_submission_id_text" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_view_profile_photo"("p_student_id_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_profile_photo"("p_student_id_text" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_view_registration_proof"("p_team_id_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_registration_proof"("p_team_id_text" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_view_submission_evidence"("p_submission_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_submission_evidence"("p_submission_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."can_view_team_round_evidence"("p_team_id_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_team_round_evidence"("p_team_id_text" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."claim_reconciliation_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_reconciliation_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lease_seconds" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."claim_storage_deletion_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_storage_deletion_batch"("p_worker_id" "text", "p_batch_size" integer, "p_lease_seconds" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."claim_storage_deletion_jobs"("p_worker_id" "text", "p_batch_size" integer, "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_storage_deletion_jobs"("p_worker_id" "text", "p_batch_size" integer, "p_lease_seconds" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."complete_storage_deletion_job"("p_job_id" "uuid", "p_lease_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_storage_deletion_job"("p_job_id" "uuid", "p_lease_token" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."complete_storage_deletion_job"("p_job_id" "uuid", "p_lease_token" "uuid", "p_http_status" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_storage_deletion_job"("p_job_id" "uuid", "p_lease_token" "uuid", "p_http_status" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."configure_hackathon_rounds"("p_hackathon_id" "uuid", "p_rounds" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_hackathon_rounds"("p_hackathon_id" "uuid", "p_rounds" "jsonb") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."confirm_deletion_preflight"("p_job_id" "uuid", "p_lease_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_deletion_preflight"("p_job_id" "uuid", "p_lease_token" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."consume_rate_limit"("p_action" "text", "p_custom_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_rate_limit"("p_action" "text", "p_custom_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_rate_limit"("p_action" "text", "p_custom_key" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."create_hackathon_draft"("p_title" "text", "p_slug" "text", "p_description" "text", "p_organizer" "text", "p_mode" "text", "p_venue" "text", "p_registration_start_at" timestamp with time zone, "p_registration_end_at" timestamp with time zone, "p_event_start_at" timestamp with time zone, "p_event_end_at" timestamp with time zone, "p_min_team_size" integer, "p_max_team_size" integer, "p_is_solo_allowed" boolean, "p_eligibility" "text", "p_tagline" "text", "p_prizes_summary" "text", "p_prizes_detail" "jsonb", "p_external_registration_url" "text", "p_community_url" "text", "p_in_charge_admin_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_hackathon_draft"("p_title" "text", "p_slug" "text", "p_description" "text", "p_organizer" "text", "p_mode" "text", "p_venue" "text", "p_registration_start_at" timestamp with time zone, "p_registration_end_at" timestamp with time zone, "p_event_start_at" timestamp with time zone, "p_event_end_at" timestamp with time zone, "p_min_team_size" integer, "p_max_team_size" integer, "p_is_solo_allowed" boolean, "p_eligibility" "text", "p_tagline" "text", "p_prizes_summary" "text", "p_prizes_detail" "jsonb", "p_external_registration_url" "text", "p_community_url" "text", "p_in_charge_admin_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."create_team"("p_hackathon_id" "uuid", "p_team_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_team"("p_hackathon_id" "uuid", "p_team_name" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."current_has_permission"("p_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_has_permission"("p_permission_key" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."current_is_approved_student"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_is_approved_student"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."current_is_super_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_is_super_admin"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."current_is_team_member"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_is_team_member"("p_team_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."deactivate_push_subscription"("p_device_fingerprint" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."deactivate_push_subscription"("p_device_fingerprint" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."enqueue_hackathon_evidence_retention"("p_hackathon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_hackathon_evidence_retention"("p_hackathon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_hackathon_evidence_retention"("p_hackathon_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."enqueue_storage_deletion_job"("p_bucket_id" "text", "p_object_path" "text", "p_target_type" "text", "p_target_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_storage_deletion_job"("p_bucket_id" "text", "p_object_path" "text", "p_target_type" "text", "p_target_id" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."export_dataset_page"("p_dataset" "text", "p_hackathon_id" "uuid", "p_after" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."export_dataset_page"("p_dataset" "text", "p_hackathon_id" "uuid", "p_after" "uuid", "p_limit" integer) TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profile_change_requests" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."profile_change_requests" TO "authenticated";
REVOKE ALL ON FUNCTION "public"."export_profile_change_requests_report"("p_status_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."export_profile_change_requests_report"("p_status_filter" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."extend_hackathon_event_deadline"("p_hackathon_id" "uuid", "p_new_event_end_at" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."extend_hackathon_event_deadline"("p_hackathon_id" "uuid", "p_new_event_end_at" timestamp with time zone, "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."fail_storage_deletion_job"("p_job_id" "uuid", "p_lease_token" "uuid", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fail_storage_deletion_job"("p_job_id" "uuid", "p_lease_token" "uuid", "p_error" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."finalize_submission_upload"("p_submission_id" "uuid", "p_object_path" "text", "p_sha256" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_submission_upload"("p_submission_id" "uuid", "p_object_path" "text", "p_sha256" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_submission_upload"("p_submission_id" "uuid", "p_object_path" "text", "p_sha256" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_admin_dashboard_metrics"("p_hackathon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_metrics"("p_hackathon_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."get_admin_participation_analytics"("p_hackathon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_participation_analytics"("p_hackathon_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."get_export_capabilities"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_export_capabilities"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."get_export_dataset_counts"("p_hackathon_id" "uuid", "p_datasets" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_export_dataset_counts"("p_hackathon_id" "uuid", "p_datasets" "text"[]) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."get_exportable_hackathons"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_exportable_hackathons"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."get_platform_leaderboard"("p_academic_year" integer, "p_event_academic_year" "text", "p_event_term" "text", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_platform_leaderboard"("p_academic_year" integer, "p_event_academic_year" "text", "p_event_term" "text", "p_limit" integer, "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_leaderboard"("p_academic_year" integer, "p_event_academic_year" "text", "p_event_term" "text", "p_limit" integer, "p_offset" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_student_points_summary"("p_student_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_student_points_summary"("p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_points_summary"("p_student_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_system_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_system_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_health"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."get_team_roster"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_team_roster"("p_team_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."handle_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."is_push_registered"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_push_registered"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_push_registered"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_push_registered"("p_user_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."join_team_with_code"("p_invitation_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."join_team_with_code"("p_invitation_code" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."leave_team"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_team"("p_team_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_team"("p_team_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."lock_team_roster"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."lock_team_roster"("p_team_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."log_push_delivery_outcome"("p_announcement_id" "uuid", "p_subscription_id" "uuid", "p_user_id" "uuid", "p_endpoint" "text", "p_status" "text", "p_status_code" integer, "p_error_message" "text", "p_attempt_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_push_delivery_outcome"("p_announcement_id" "uuid", "p_subscription_id" "uuid", "p_user_id" "uuid", "p_endpoint" "text", "p_status" "text", "p_status_code" integer, "p_error_message" "text", "p_attempt_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_push_delivery_outcome"("p_announcement_id" "uuid", "p_subscription_id" "uuid", "p_user_id" "uuid", "p_endpoint" "text", "p_status" "text", "p_status_code" integer, "p_error_message" "text", "p_attempt_count" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."manage_admin_permissions"("p_target_admin_id" "uuid", "p_permissions" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."manage_admin_permissions"("p_target_admin_id" "uuid", "p_permissions" "text"[]) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."mark_announcement_read"("p_announcement_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_announcement_read"("p_announcement_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."normalize_profile_usn"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_profile_usn"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."override_hackathon_deadline"("p_hackathon_id" "uuid", "p_new_deadline" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."override_hackathon_deadline"("p_hackathon_id" "uuid", "p_new_deadline" timestamp with time zone, "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."override_round_schedule"("p_round_id" "uuid", "p_new_start_at" timestamp with time zone, "p_new_end_at" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."override_round_schedule"("p_round_id" "uuid", "p_new_start_at" timestamp with time zone, "p_new_end_at" timestamp with time zone, "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."pause_hackathon_round"("p_round_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pause_hackathon_round"("p_round_id" "uuid", "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."prevent_audit_log_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_audit_log_mutation"() TO "service_role";
GRANT ALL ON FUNCTION "public"."prevent_audit_log_mutation"() TO "supabase_auth_admin";
REVOKE ALL ON FUNCTION "public"."protect_profile_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."protect_submission_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_submission_columns"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."provision_admin_profile"("p_auth_uid" "uuid", "p_email" "text", "p_full_name" "text", "p_permissions" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_admin_profile"("p_auth_uid" "uuid", "p_email" "text", "p_full_name" "text", "p_permissions" "text"[]) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."provision_admin_profile"("p_user_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_department" "text", "p_is_super_admin" boolean, "p_initial_permissions" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."provision_admin_profile"("p_user_id" "uuid", "p_full_name" "text", "p_email" "text", "p_phone" "text", "p_department" "text", "p_is_super_admin" boolean, "p_initial_permissions" "text"[]) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."prune_rate_limit_buckets"("p_batch_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_rate_limit_buckets"("p_batch_size" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."publish_announcement"("p_title" "text", "p_body" "text", "p_target_role" "text", "p_hackathon_id" "uuid", "p_announcement_type" "text", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_announcement"("p_title" "text", "p_body" "text", "p_target_role" "text", "p_hackathon_id" "uuid", "p_announcement_type" "text", "p_metadata" "jsonb") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."publish_deadline_reminder"("p_hackathon_id" "uuid", "p_round_id" "uuid", "p_deadline" timestamp with time zone, "p_custom_message" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."publish_deadline_reminder"("p_hackathon_id" "uuid", "p_round_id" "uuid", "p_deadline" timestamp with time zone, "p_custom_message" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."quarantine_expired_dispatches"("p_batch_size" integer, "p_cooldown_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quarantine_expired_dispatches"("p_batch_size" integer, "p_cooldown_seconds" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."reassign_hackathon_in_charge_admin"("p_hackathon_id" "uuid", "p_new_admin_id" "uuid", "p_justification" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reassign_hackathon_in_charge_admin"("p_hackathon_id" "uuid", "p_new_admin_id" "uuid", "p_justification" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."record_data_export"("p_datasets" "text"[], "p_format" "text", "p_hackathon_id" "uuid", "p_outcome" "text", "p_row_counts" "jsonb", "p_failure_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_data_export"("p_datasets" "text"[], "p_format" "text", "p_hackathon_id" "uuid", "p_outcome" "text", "p_row_counts" "jsonb", "p_failure_category" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."record_round_winner_placement"("p_submission_id" "uuid", "p_placement" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_round_winner_placement"("p_submission_id" "uuid", "p_placement" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_round_winner_placement"("p_submission_id" "uuid", "p_placement" "text", "p_notes" "text") TO "service_role";
REVOKE ALL ON PROCEDURE "public"."recover_super_admin_identity"(IN "p_replacement_auth_uid" "uuid", IN "p_replacement_email" "text", IN "p_replacement_full_name" "text", IN "p_reason" "text") FROM PUBLIC;
GRANT ALL ON PROCEDURE "public"."recover_super_admin_identity"(IN "p_replacement_auth_uid" "uuid", IN "p_replacement_email" "text", IN "p_replacement_full_name" "text", IN "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."refresh_round_statuses"("p_hackathon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_round_statuses"("p_hackathon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_round_statuses"("p_hackathon_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."regenerate_team_invitation_code"("p_team_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."regenerate_team_invitation_code"("p_team_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."register_push_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_device_fingerprint" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_push_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_device_fingerprint" "text", "p_user_agent" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."reject_profile_change_request"("p_request_id" "uuid", "p_rejection_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_profile_change_request"("p_request_id" "uuid", "p_rejection_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."remove_admin_from_hackathon"("p_hackathon_id" "uuid", "p_target_admin_id" "uuid", "p_justification" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_admin_from_hackathon"("p_hackathon_id" "uuid", "p_target_admin_id" "uuid", "p_justification" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."remove_team_member"("p_team_id" "uuid", "p_student_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_team_member"("p_team_id" "uuid", "p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_team_member"("p_team_id" "uuid", "p_student_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."reopen_rejected_submission"("p_submission_id" "uuid", "p_target_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reopen_rejected_submission"("p_submission_id" "uuid", "p_target_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reopen_rejected_submission"("p_submission_id" "uuid", "p_target_status" "text", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."replace_college_id"("p_new_storage_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."replace_college_id"("p_new_storage_path" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."resolve_investigation_job"("p_job_id" "uuid", "p_action" "text", "p_justification" "text", "p_ticket_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_investigation_job"("p_job_id" "uuid", "p_action" "text", "p_justification" "text", "p_ticket_reference" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."resolve_reconciliation_job"("p_job_id" "uuid", "p_lease_token" "uuid", "p_http_status" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_reconciliation_job"("p_job_id" "uuid", "p_lease_token" "uuid", "p_http_status" integer) TO "service_role";
REVOKE ALL ON FUNCTION "public"."resubmit_round_milestone"("p_prior_submission_id" "uuid", "p_title" "text", "p_description" "text", "p_repo_url" "text", "p_demo_url" "text", "p_evidence_path" "text", "p_evidence_sha256" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resubmit_round_milestone"("p_prior_submission_id" "uuid", "p_title" "text", "p_description" "text", "p_repo_url" "text", "p_demo_url" "text", "p_evidence_path" "text", "p_evidence_sha256" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resubmit_round_milestone"("p_prior_submission_id" "uuid", "p_title" "text", "p_description" "text", "p_repo_url" "text", "p_demo_url" "text", "p_evidence_path" "text", "p_evidence_sha256" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."resume_hackathon_round"("p_round_id" "uuid", "p_new_end_at" timestamp with time zone, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resume_hackathon_round"("p_round_id" "uuid", "p_new_end_at" timestamp with time zone, "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."reverse_points_award"("p_original_ledger_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_points_award"("p_original_ledger_id" "uuid", "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."reverse_points_ledger_entry"("p_ledger_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reverse_points_ledger_entry"("p_ledger_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_points_ledger_entry"("p_ledger_id" "uuid", "p_reason" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."review_round_advancement"("p_submission_id" "uuid", "p_decision" "text", "p_feedback" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_round_advancement"("p_submission_id" "uuid", "p_decision" "text", "p_feedback" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."review_round_submission"("p_submission_id" "uuid", "p_decision" "text", "p_feedback" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_round_submission"("p_submission_id" "uuid", "p_decision" "text", "p_feedback" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_round_submission"("p_submission_id" "uuid", "p_decision" "text", "p_feedback" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."review_student_registration"("p_student_id" "uuid", "p_decision" "text", "p_rejection_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_student_registration"("p_student_id" "uuid", "p_decision" "text", "p_rejection_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."scan_and_enqueue_expired_hackathons_evidence"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."scan_and_enqueue_expired_hackathons_evidence"() TO "service_role";
REVOKE ALL ON FUNCTION "public"."set_admin_active_status"("p_target_admin_id" "uuid", "p_is_active" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_admin_active_status"("p_target_admin_id" "uuid", "p_is_active" boolean, "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."set_hackathon_academic_period"("p_hackathon_id" "uuid", "p_academic_year" "text", "p_academic_term" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_hackathon_academic_period"("p_hackathon_id" "uuid", "p_academic_year" "text", "p_academic_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_hackathon_academic_period"("p_hackathon_id" "uuid", "p_academic_year" "text", "p_academic_term" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."submit_profile_change_request"("p_field_name" "text", "p_new_value" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_profile_change_request"("p_field_name" "text", "p_new_value" "text", "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."submit_profile_for_review"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_profile_for_review"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."submit_registration_proof"("p_team_id" "uuid", "p_proof_path" "text", "p_cdc_declaration_accepted" boolean, "p_cdc_declaration_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_registration_proof"("p_team_id" "uuid", "p_proof_path" "text", "p_cdc_declaration_accepted" boolean, "p_cdc_declaration_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_registration_proof"("p_team_id" "uuid", "p_proof_path" "text", "p_cdc_declaration_accepted" boolean, "p_cdc_declaration_text" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."submit_round_milestone"("p_round_id" "uuid", "p_team_id" "uuid", "p_title" "text", "p_description" "text", "p_repo_url" "text", "p_demo_url" "text", "p_evidence_path" "text", "p_evidence_sha256" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_round_milestone"("p_round_id" "uuid", "p_team_id" "uuid", "p_title" "text", "p_description" "text", "p_repo_url" "text", "p_demo_url" "text", "p_evidence_path" "text", "p_evidence_sha256" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_round_milestone"("p_round_id" "uuid", "p_team_id" "uuid", "p_title" "text", "p_description" "text", "p_repo_url" "text", "p_demo_url" "text", "p_evidence_path" "text", "p_evidence_sha256" "text") TO "service_role";
REVOKE ALL ON FUNCTION "public"."transfer_team_leadership"("p_team_id" "uuid", "p_new_leader_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_team_leadership"("p_team_id" "uuid", "p_new_leader_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."transition_hackathon_lifecycle"("p_hackathon_id" "uuid", "p_target_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_hackathon_lifecycle"("p_hackathon_id" "uuid", "p_target_status" "text", "p_reason" "text") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."update_hackathon_metadata"("p_hackathon_id" "uuid", "p_title" "text", "p_slug" "text", "p_description" "text", "p_organizer" "text", "p_mode" "text", "p_venue" "text", "p_registration_start_at" timestamp with time zone, "p_event_start_at" timestamp with time zone, "p_event_end_at" timestamp with time zone, "p_min_team_size" integer, "p_max_team_size" integer, "p_is_solo_allowed" boolean, "p_eligibility" "text", "p_tagline" "text", "p_prizes_summary" "text", "p_prizes_detail" "jsonb", "p_external_registration_url" "text", "p_community_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_hackathon_metadata"("p_hackathon_id" "uuid", "p_title" "text", "p_slug" "text", "p_description" "text", "p_organizer" "text", "p_mode" "text", "p_venue" "text", "p_registration_start_at" timestamp with time zone, "p_event_start_at" timestamp with time zone, "p_event_end_at" timestamp with time zone, "p_min_team_size" integer, "p_max_team_size" integer, "p_is_solo_allowed" boolean, "p_eligibility" "text", "p_tagline" "text", "p_prizes_summary" "text", "p_prizes_detail" "jsonb", "p_external_registration_url" "text", "p_community_url" "text") TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."admin_permissions" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."admin_permissions" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."admin_profiles" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."admin_profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."announcement_reads" TO "anon";
GRANT ALL ON TABLE "public"."announcement_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."announcement_reads" TO "service_role";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";
GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."audit_logs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."email_delivery_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."email_delivery_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."email_delivery_logs" TO "service_role";
GRANT ALL ON TABLE "public"."evidence_validation_intents" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathon_admin_assignments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathon_admin_assignments" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathon_rounds" TO "service_role";
GRANT SELECT ON TABLE "public"."hackathon_rounds" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathons" TO "service_role";
GRANT SELECT ON TABLE "public"."hackathons" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathon_rounds_public_view" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathon_rounds_public_view" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathon_rounds_public_view" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathons_public_view" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathons_public_view" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."hackathons_public_view" TO "service_role";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."point_configurations" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."point_configurations" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."points_ledger" TO "service_role";
GRANT SELECT ON TABLE "public"."points_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_action_authorizations" TO "service_role";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."push_delivery_logs" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."push_delivery_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."push_delivery_logs" TO "service_role";
GRANT ALL ON TABLE "public"."rate_limit_buckets" TO "service_role";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."results" TO "service_role";
GRANT SELECT ON TABLE "public"."results" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."results" TO "authenticated";
GRANT ALL ON TABLE "public"."storage_deletion_queue" TO "service_role";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."submission_reviews" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."submission_reviews" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."submissions" TO "service_role";
GRANT SELECT ON TABLE "public"."submissions" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."team_members" TO "service_role";
GRANT SELECT ON TABLE "public"."team_members" TO "anon";
GRANT SELECT ON TABLE "public"."team_members" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."teams" TO "service_role";
GRANT SELECT ON TABLE "public"."teams" TO "anon";
GRANT SELECT ON TABLE "public"."teams" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_push_subscriptions" TO "service_role";

-- ===========================================================================
-- 2. 'verified' REGISTRATION STATUS REMOVED
-- ===========================================================================
UPDATE public.teams SET external_status = 'submitted' WHERE external_status = 'verified';

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS chk_teams_external_status;
ALTER TABLE public.teams ADD CONSTRAINT chk_teams_external_status
  CHECK (external_status IN ('not_submitted', 'submitted', 'rejected'));

-- Function bodies below are the current definitions with only the 'verified' branches
-- removed (submit_registration_proof, can_upload_registration_proof,
-- get_admin_dashboard_metrics, export_dataset_page) and forward-only lifecycle guards
-- added (transition_hackathon_lifecycle).
CREATE OR REPLACE FUNCTION public.submit_registration_proof(p_team_id uuid, p_proof_path text, p_cdc_declaration_accepted boolean, p_cdc_declaration_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_team RECORD;
  v_hackathon RECORD;
  v_member RECORD;
  v_leader_points INTEGER := 15;
  v_member_points INTEGER := 10;
  v_points_awarded INTEGER := 0;
  v_idempotency_key TEXT;
  v_team_size INTEGER;
  v_clean_path TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: team ID cannot be null.' USING ERRCODE = '22023';
  END IF;

  v_clean_path := trim(p_proof_path);
  IF v_clean_path IS NULL OR v_clean_path = '' THEN
    RAISE EXCEPTION 'Invalid argument: registration proof image path is mandatory.' USING ERRCODE = '22023';
  END IF;

  -- CDC Declaration Acceptance Validation
  IF p_cdc_declaration_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'Submission rejected: acceptance of the mandatory CDC declaration is required.';
  END IF;

  -- Validate mandatory CDC declaration text contents
  IF p_cdc_declaration_text IS NULL OR
     p_cdc_declaration_text NOT LIKE '%Career Development Centre (CDC)%' OR
     p_cdc_declaration_text NOT LIKE '%genuine, unaltered%' THEN
    RAISE EXCEPTION 'Submission rejected: invalid or forged CDC declaration text.';
  END IF;

  -- Storage path format check
  IF v_clean_path !~* ('^teams/' || p_team_id::text || '/registration/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$')
     AND v_clean_path !~* '^evidence/registration/[a-zA-Z0-9_\-\.]+$' THEN
    RAISE EXCEPTION 'Invalid registration proof path format.' USING ERRCODE = '22023';
  END IF;

  -- Level 1 Lock: Fetch and lock team
  SELECT * INTO v_team
  FROM public.teams
  WHERE id = p_team_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Caller must be the team leader
  IF v_team.leader_id <> v_caller_id THEN
    RAISE EXCEPTION 'Access denied: only the team leader can submit registration proof.' USING ERRCODE = '42501';
  END IF;

  -- Fetch hackathon
  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = v_team.hackathon_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_hackathon.status NOT IN ('published', 'ongoing') THEN
    RAISE EXCEPTION 'Cannot submit registration proof: hackathon is not published (status: %).', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  -- Enforce deadline
  IF now() > v_hackathon.registration_end_at THEN
    RAISE EXCEPTION 'Cannot submit registration proof: registration deadline has passed (ended %).', v_hackathon.registration_end_at USING ERRCODE = '55P03';
  END IF;

  -- Lifecycle consistency: check paused or expired round 1
  IF v_clean_path ~* '^teams/' THEN
    IF EXISTS (
      SELECT 1 FROM public.hackathon_rounds r
      WHERE r.hackathon_id = v_team.hackathon_id
        AND r.round_number = 1
        AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
    ) THEN
      RAISE EXCEPTION 'Cannot submit registration proof: registration stage is currently paused.' USING ERRCODE = '55P03';
    END IF;
  END IF;

  -- Storage Object Existence Check
  IF v_clean_path ~* '^teams/' THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'submission-evidence'
        AND name = v_clean_path
    ) THEN
      RAISE EXCEPTION 'Invalid proof path: object does not exist in storage.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Check team size
  SELECT COUNT(*) INTO v_team_size
  FROM public.team_members
  WHERE team_id = p_team_id;

  IF v_team_size < v_hackathon.min_team_size THEN
    RAISE EXCEPTION 'Team roster size (%) is below the minimum required (%) for this hackathon.',
      v_team_size, v_hackathon.min_team_size USING ERRCODE = '22023';
  END IF;

  IF NOT v_hackathon.is_solo_allowed AND v_team_size < 2 THEN
    RAISE EXCEPTION 'Solo participation is not permitted for this hackathon. Minimum team size is 2.' USING ERRCODE = '22023';
  END IF;

  -- Cleanup superseded evidence into storage_deletion_queue
  IF v_team.external_proof_path IS NOT NULL AND v_team.external_proof_path <> v_clean_path THEN
    INSERT INTO public.storage_deletion_queue (
      event_id,
      bucket_id,
      object_path,
      target_type,
      target_id,
      status,
      retention_deadline_at
    ) VALUES (
      v_team.hackathon_id,
      'submission-evidence',
      v_team.external_proof_path,
      'superseded_registration_proof',
      v_team.id::text,
      'pending',
      now() + interval '1 day'
    )
    ON CONFLICT (bucket_id, object_path)
    WHERE (status IN ('pending', 'claimed', 'dispatching', 'cooldown', 'reconciling', 'investigation_required'))
    DO NOTHING;
  END IF;

  -- Update team registration claim status
  UPDATE public.teams
  SET external_status = 'submitted',
      external_proof_path = v_clean_path,
      external_proof_submitted_at = now(),
      cdc_declaration_accepted = true,
      cdc_declaration_text_version = 'v1_cdc_mandatory',
      cdc_declaration_accepted_at = now(),
      internal_status = CASE WHEN internal_status = 'forming' THEN 'complete' ELSE internal_status END,
      updated_at = now()
  WHERE id = p_team_id;

  -- Level 2 Lock: deterministic student profile locks for entire roster
  PERFORM 1 FROM public.profiles
  WHERE id IN (
    SELECT student_id FROM public.team_members
    WHERE team_id = p_team_id AND hackathon_id = v_team.hackathon_id
  )
  ORDER BY id ASC
  FOR UPDATE;

  -- Read configured point values
  SELECT
    COALESCE(MAX(CASE WHEN milestone_type = 'participation' THEN team_leader_points END), 15),
    COALESCE(MAX(CASE WHEN milestone_type = 'participation' THEN regular_member_points END), 10)
  INTO v_leader_points, v_member_points
  FROM public.point_configurations
  WHERE is_active = true;

  -- Award initial registration points automatically to all team members
  FOR v_member IN
    SELECT student_id, role
    FROM public.team_members
    WHERE team_id = p_team_id AND hackathon_id = v_team.hackathon_id
  LOOP
    v_idempotency_key := 'participation_' || v_team.hackathon_id::text || '_' || v_member.student_id::text;

    INSERT INTO public.points_ledger (
      idempotency_key,
      student_id,
      hackathon_id,
      team_id,
      milestone_type,
      role_at_award,
      points,
      reason,
      awarded_by
    ) VALUES (
      v_idempotency_key,
      v_member.student_id,
      v_team.hackathon_id,
      p_team_id,
      'participation',
      v_member.role,
      CASE WHEN v_member.role = 'leader' THEN v_leader_points ELSE v_member_points END,
      'Initial registration proof submitted with accepted CDC declaration',
      COALESCE(v_hackathon.in_charge_admin_id, v_hackathon.created_by)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    v_points_awarded := v_points_awarded + 1;
  END LOOP;

  -- Audit log entry
  INSERT INTO public.audit_logs (
    actor_id,
    actor_role,
    action,
    target_type,
    target_id,
    details
  ) VALUES (
    v_caller_id,
    'student',
    'team.registration_proof_submitted',
    'team',
    p_team_id::text,
    jsonb_build_object(
      'proof_path', v_clean_path,
      'cdc_declaration_accepted', true,
      'cdc_declaration_version', 'v1_cdc_mandatory',
      'points_awarded_count', v_points_awarded
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_id', p_team_id,
    'external_status', 'submitted',
    'points_awarded_count', v_points_awarded
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_upload_registration_proof(p_team_id_text text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_team_id UUID;
BEGIN
  -- Safe regex UUID check prevents runtime 22P02 syntax cast crashes on malformed paths
  IF p_team_id_text IS NULL OR p_team_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  v_team_id := p_team_id_text::uuid;

  RETURN EXISTS (
    SELECT 1 FROM public.teams t
    JOIN public.hackathons h ON h.id = t.hackathon_id
    WHERE t.id = v_team_id
      AND t.leader_id = auth.uid()
      AND h.status IN ('published', 'ongoing')
      AND now() >= h.registration_start_at
      AND now() <= h.registration_end_at
      -- Lifecycle consistency: block uploads if Round 1 / registration stage is paused or expired
      AND NOT EXISTS (
        SELECT 1 FROM public.hackathon_rounds r
        WHERE r.hackathon_id = h.id
          AND r.round_number = 1
          AND (r.status = 'paused' OR (r.status = 'open' AND r.end_at <= now()))
      )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(p_hackathon_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_is_super BOOLEAN;
  v_is_active BOOLEAN;
  v_scope_hackathon_ids UUID[];
  
  -- Metrics variables
  v_students_approved BIGINT := 0;
  v_students_pending BIGINT := 0;
  v_students_rejected BIGINT := 0;
  v_students_total BIGINT := 0;

  v_hackathons_published BIGINT := 0;
  v_hackathons_draft BIGINT := 0;
  v_hackathons_archived BIGINT := 0;
  v_hackathons_total BIGINT := 0;

  v_teams_total BIGINT := 0;
  v_teams_internal_registered BIGINT := 0;
  v_teams_submitted_claims BIGINT := 0;
  v_teams_rejected_external BIGINT := 0;

  v_submissions_total BIGINT := 0;
  v_submissions_pending BIGINT := 0;
  v_submissions_accepted BIGINT := 0;
  v_submissions_rejected BIGINT := 0;

  v_results_verified BIGINT := 0;
  v_results_winners BIGINT := 0;

  v_points_total_awarded BIGINT := 0;
  v_points_tx_count BIGINT := 0;

  v_profile_changes_pending BIGINT := 0;
  v_profile_changes_approved BIGINT := 0;
  v_profile_changes_rejected BIGINT := 0;
BEGIN
  -- 1. Caller Authentication
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.';
  END IF;

  -- 2. Caller Administrative Identity Check
  SELECT is_super_admin, is_active
  INTO v_is_super, v_is_active
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  IF v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Access denied: caller is not an active administrator.';
  END IF;

  -- Homepage analytics are intentionally identical for every active admin:
  -- any active administrator receives the Super Admin (platform-wide) view.
  -- Operational authorization elsewhere (assignments, feature permissions,
  -- RLS) is untouched; this RPC only returns aggregate counts, never rows.
  v_is_super := TRUE;

  -- 3. Resolve Scope
  IF p_hackathon_id IS NOT NULL THEN
    -- Verify event existence
    IF NOT EXISTS (SELECT 1 FROM public.hackathons WHERE id = p_hackathon_id) THEN
      RAISE EXCEPTION 'Target hackathon not found.'
        USING ERRCODE = 'P0002';
    END IF;

    -- If ordinary admin, verify access to target event
    IF v_is_super IS NOT TRUE THEN
      IF NOT public.can_admin_manage_hackathon(p_hackathon_id, NULL) THEN
        RAISE EXCEPTION 'Access denied: not authorized for this hackathon.';
      END IF;
    END IF;

    v_scope_hackathon_ids := ARRAY[p_hackathon_id];
  ELSE
    -- p_hackathon_id IS NULL
    IF v_is_super IS TRUE THEN
      -- Super Admin has global scope
      SELECT ARRAY_AGG(id) INTO v_scope_hackathon_ids FROM public.hackathons;
    ELSE
      -- Ordinary Admin: scope to assigned events where in_charge_admin_id = caller
      SELECT ARRAY_AGG(id) INTO v_scope_hackathon_ids
      FROM public.hackathons
      WHERE in_charge_admin_id = v_caller_id;
    END IF;
  END IF;

  -- Handle case when no hackathons exist in scope
  IF v_scope_hackathon_ids IS NULL THEN
    v_scope_hackathon_ids := '{}'::UUID[];
  END IF;

  -- 4. Calculate Hackathons Metrics
  IF p_hackathon_id IS NOT NULL THEN
    SELECT
      COUNT(*) FILTER (WHERE status IN ('published', 'registration_closed', 'ongoing', 'completed')),
      COUNT(*) FILTER (WHERE status = 'draft'),
      COUNT(*) FILTER (WHERE status = 'archived'),
      COUNT(*)
    INTO v_hackathons_published, v_hackathons_draft, v_hackathons_archived, v_hackathons_total
    FROM public.hackathons
    WHERE id = p_hackathon_id;
  ELSE
    IF v_is_super IS TRUE THEN
      SELECT
        COUNT(*) FILTER (WHERE status IN ('published', 'registration_closed', 'ongoing', 'completed')),
        COUNT(*) FILTER (WHERE status = 'draft'),
        COUNT(*) FILTER (WHERE status = 'archived'),
        COUNT(*)
      INTO v_hackathons_published, v_hackathons_draft, v_hackathons_archived, v_hackathons_total
      FROM public.hackathons;
    ELSE
      SELECT
        COUNT(*) FILTER (WHERE status IN ('published', 'registration_closed', 'ongoing', 'completed')),
        COUNT(*) FILTER (WHERE status = 'draft'),
        COUNT(*) FILTER (WHERE status = 'archived'),
        COUNT(*)
      INTO v_hackathons_published, v_hackathons_draft, v_hackathons_archived, v_hackathons_total
      FROM public.hackathons
      WHERE id = ANY(v_scope_hackathon_ids);
    END IF;
  END IF;

  -- 5. Calculate Students Metrics
  IF p_hackathon_id IS NULL AND (v_is_super IS TRUE OR public.current_has_permission('verify_students') OR public.current_has_permission('manage_students')) THEN
    SELECT
      COUNT(*) FILTER (WHERE registration_status = 'approved'),
      COUNT(*) FILTER (WHERE registration_status IN ('pending_verification', 'under_review', 'correction_required')),
      COUNT(*) FILTER (WHERE registration_status = 'rejected'),
      COUNT(*) FILTER (WHERE registration_status <> 'draft')
    INTO v_students_approved, v_students_pending, v_students_rejected, v_students_total
    FROM public.profiles;
  ELSE
    -- Scoped to participants in the scoped events
    SELECT
      COUNT(DISTINCT p.id) FILTER (WHERE p.registration_status = 'approved'),
      COUNT(DISTINCT p.id) FILTER (WHERE p.registration_status IN ('pending_verification', 'under_review', 'correction_required')),
      COUNT(DISTINCT p.id) FILTER (WHERE p.registration_status = 'rejected'),
      COUNT(DISTINCT p.id)
    INTO v_students_approved, v_students_pending, v_students_rejected, v_students_total
    FROM public.profiles p
    JOIN public.team_members tm ON tm.student_id = p.id
    WHERE tm.hackathon_id = ANY(v_scope_hackathon_ids);
  END IF;

  -- 6. Calculate Teams & Registrations Metrics
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE internal_status IN ('complete', 'locked')),
    COUNT(*) FILTER (WHERE external_status = 'submitted'),
    COUNT(*) FILTER (WHERE external_status = 'rejected')
  INTO
    v_teams_total,
    v_teams_internal_registered,
    v_teams_submitted_claims,
    v_teams_rejected_external
  FROM public.teams
  WHERE hackathon_id = ANY(v_scope_hackathon_ids);

  -- 7. Calculate Submissions Metrics
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'submitted'),
    COUNT(*) FILTER (WHERE status = 'accepted'),
    COUNT(*) FILTER (WHERE status = 'rejected')
  INTO
    v_submissions_total,
    v_submissions_pending,
    v_submissions_accepted,
    v_submissions_rejected
  FROM public.submissions
  WHERE hackathon_id = ANY(v_scope_hackathon_ids);

  -- 8. Calculate Results & Outcomes Metrics
  SELECT
    COUNT(*) FILTER (WHERE is_published IS TRUE),
    COUNT(*) FILTER (WHERE is_published IS TRUE AND milestone_type = 'win_placement')
  INTO
    v_results_verified,
    v_results_winners
  FROM public.results
  WHERE hackathon_id = ANY(v_scope_hackathon_ids);

  -- 9. Calculate Points Metrics
  SELECT
    COALESCE(SUM(points), 0),
    COUNT(*)
  INTO
    v_points_total_awarded,
    v_points_tx_count
  FROM public.points_ledger
  WHERE hackathon_id = ANY(v_scope_hackathon_ids);

  -- 10. Calculate Profile Change Requests Metrics
  IF p_hackathon_id IS NULL AND (v_is_super IS TRUE OR public.current_has_permission('manage_students')) THEN
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending'),
      COUNT(*) FILTER (WHERE status = 'approved'),
      COUNT(*) FILTER (WHERE status = 'rejected')
    INTO
      v_profile_changes_pending,
      v_profile_changes_approved,
      v_profile_changes_rejected
    FROM public.profile_change_requests;
  ELSE
    SELECT
      COUNT(DISTINCT pcr.id) FILTER (WHERE pcr.status = 'pending'),
      COUNT(DISTINCT pcr.id) FILTER (WHERE pcr.status = 'approved'),
      COUNT(DISTINCT pcr.id) FILTER (WHERE pcr.status = 'rejected')
    INTO
      v_profile_changes_pending,
      v_profile_changes_approved,
      v_profile_changes_rejected
    FROM public.profile_change_requests pcr
    JOIN public.team_members tm ON tm.student_id = pcr.student_id
    WHERE tm.hackathon_id = ANY(v_scope_hackathon_ids);
  END IF;

  RETURN jsonb_build_object(
    'scope', jsonb_build_object(
      'is_global', (p_hackathon_id IS NULL AND v_is_super IS TRUE),
      'hackathon_id', p_hackathon_id,
      'events_count', cardinality(v_scope_hackathon_ids)
    ),
    'students', jsonb_build_object(
      'total', v_students_total,
      'approved', v_students_approved,
      'pending', v_students_pending,
      'rejected', v_students_rejected
    ),
    'hackathons', jsonb_build_object(
      'total', v_hackathons_total,
      'published', v_hackathons_published,
      'draft', v_hackathons_draft,
      'archived', v_hackathons_archived
    ),
    'teams', jsonb_build_object(
      'total', v_teams_total,
      'internal_registered', v_teams_internal_registered,
      'submitted_claims', v_teams_submitted_claims,
      'rejected_external', v_teams_rejected_external
    ),
    'submissions', jsonb_build_object(
      'total', v_submissions_total,
      'pending', v_submissions_pending,
      'accepted', v_submissions_accepted,
      'rejected', v_submissions_rejected
    ),
    'results', jsonb_build_object(
      'verified_outcomes', v_results_verified,
      'winners_count', v_results_winners
    ),
    'points', jsonb_build_object(
      'total_distributed', v_points_total_awarded,
      'transactions_count', v_points_tx_count
    ),
    'profile_changes', jsonb_build_object(
      'pending', v_profile_changes_pending,
      'approved', v_profile_changes_approved,
      'rejected', v_profile_changes_rejected
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_dataset_page(p_dataset text, p_hackathon_id uuid, p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 1000)
 RETURNS TABLE(row_id uuid, data jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
  v_is_super boolean;
  v_pii boolean;
BEGIN
  SELECT a.o_is_super, a.o_can_pii INTO v_is_super, v_pii
  FROM public._export_authorize(p_dataset, p_hackathon_id) a;

  IF p_dataset = 'students' THEN
    RETURN QUERY
    SELECT p.id,
      jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'usn', p.usn,
        'branch', p.branch, 'academic_year', p.academic_year,
        'registration_status', p.registration_status, 'created_at', p.created_at)
      || CASE WHEN v_pii THEN jsonb_build_object('email', p.email, 'phone', p.phone) ELSE '{}'::jsonb END
    FROM public.profiles p
    WHERE (p_after IS NULL OR p.id > p_after)
      AND (p_hackathon_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.student_id = p.id AND tm.hackathon_id = p_hackathon_id))
    ORDER BY p.id LIMIT v_limit;

  ELSIF p_dataset = 'team_members' THEN
    RETURN QUERY
    SELECT tm.id,
      jsonb_build_object(
        'student_name', s.full_name, 'usn', s.usn, 'branch', s.branch,
        'team_name', t.name, 'hackathon_title', h.title, 'role', tm.role,
        'joined_at', tm.joined_at, 'member_id', tm.id, 'student_id', tm.student_id,
        'team_id', tm.team_id, 'hackathon_id', tm.hackathon_id)
    FROM public.team_members tm
    LEFT JOIN public.profiles s ON s.id = tm.student_id
    LEFT JOIN public.teams t ON t.id = tm.team_id
    LEFT JOIN public.hackathons h ON h.id = tm.hackathon_id
    WHERE (p_after IS NULL OR tm.id > p_after)
      AND (p_hackathon_id IS NULL OR tm.hackathon_id = p_hackathon_id)
    ORDER BY tm.id LIMIT v_limit;

  ELSIF p_dataset = 'hackathons' THEN
    RETURN QUERY
    SELECT h.id,
      jsonb_build_object(
        'title', h.title, 'status', h.status, 'mode', h.mode, 'organizer', h.organizer,
        'registration_start_at', h.registration_start_at,
        'registration_end_at', h.registration_end_at,
        'event_start_at', h.event_start_at, 'event_end_at', h.event_end_at,
        'min_team_size', h.min_team_size, 'max_team_size', h.max_team_size,
        'is_solo_allowed', h.is_solo_allowed, 'slug', h.slug,
        'created_at', h.created_at, 'hackathon_id', h.id)
    FROM public.hackathons h
    WHERE (p_after IS NULL OR h.id > p_after)
      AND (p_hackathon_id IS NULL OR h.id = p_hackathon_id)
    ORDER BY h.id LIMIT v_limit;

  ELSIF p_dataset = 'teams' THEN
    RETURN QUERY
    SELECT t.id,
      jsonb_build_object(
        'team_name', t.name, 'hackathon_title', h.title,
        'leader_name', l.full_name, 'leader_usn', l.usn,
        'member_count', (SELECT count(*) FROM public.team_members m WHERE m.team_id = t.id),
        'internal_status', t.internal_status, 'external_status', t.external_status,
        'created_at', t.created_at, 'team_id', t.id,
        'hackathon_id', t.hackathon_id, 'leader_id', t.leader_id)
    FROM public.teams t
    LEFT JOIN public.hackathons h ON h.id = t.hackathon_id
    LEFT JOIN public.profiles l ON l.id = t.leader_id
    WHERE (p_after IS NULL OR t.id > p_after)
      AND (p_hackathon_id IS NULL OR t.hackathon_id = p_hackathon_id)
    ORDER BY t.id LIMIT v_limit;

  ELSIF p_dataset = 'registrations' THEN
    RETURN QUERY
    SELECT t.id,
      jsonb_build_object(
        'team_name', t.name, 'hackathon_title', h.title,
        'leader_name', l.full_name, 'leader_usn', l.usn,
        'registration_status', t.external_status,
        'proof_on_file', (t.external_proof_path IS NOT NULL),
        'proof_submitted_at', t.external_proof_submitted_at,
        'proof_reviewed_by', rv.full_name,
        'proof_reviewed_at', t.external_proof_reviewed_at,
        'cdc_declaration_accepted', t.cdc_declaration_accepted,
        'cdc_declaration_accepted_at', t.cdc_declaration_accepted_at,
        'cdc_declaration_version', t.cdc_declaration_text_version,
        'created_at', t.created_at, 'team_id', t.id, 'hackathon_id', t.hackathon_id)
    FROM public.teams t
    LEFT JOIN public.hackathons h ON h.id = t.hackathon_id
    LEFT JOIN public.profiles l ON l.id = t.leader_id
    LEFT JOIN public.admin_profiles rv ON rv.id = t.external_proof_reviewed_by
    WHERE (p_after IS NULL OR t.id > p_after)
      AND (p_hackathon_id IS NULL OR t.hackathon_id = p_hackathon_id)
    ORDER BY t.id LIMIT v_limit;

  ELSIF p_dataset IN ('round_results', 'winners') THEN
    RETURN QUERY
    SELECT r.id,
      jsonb_build_object(
        'hackathon_title', h.title, 'round_number', rd.round_number, 'round_name', rd.name,
        'team_name', t.name, 'leader_name', l.full_name, 'leader_usn', l.usn,
        'milestone_type', r.milestone_type, 'placement', r.placement,
        'is_published', r.is_published, 'notes', r.notes,
        'verified_by', vb.full_name, 'verified_at', r.verified_at,
        'created_at', r.created_at, 'result_id', r.id, 'hackathon_id', r.hackathon_id,
        'round_id', r.round_id, 'team_id', r.team_id)
    FROM public.results r
    LEFT JOIN public.hackathons h ON h.id = r.hackathon_id
    LEFT JOIN public.hackathon_rounds rd ON rd.id = r.round_id
    LEFT JOIN public.teams t ON t.id = r.team_id
    LEFT JOIN public.profiles l ON l.id = t.leader_id
    LEFT JOIN public.admin_profiles vb ON vb.id = r.verified_by
    WHERE (p_after IS NULL OR r.id > p_after)
      AND (p_hackathon_id IS NULL OR r.hackathon_id = p_hackathon_id)
      AND (p_dataset = 'round_results' OR r.milestone_type = 'win_placement')
    ORDER BY r.id LIMIT v_limit;

  ELSIF p_dataset = 'points' THEN
    RETURN QUERY
    SELECT l.id,
      jsonb_build_object(
        'student_name', s.full_name, 'usn', s.usn,
        'hackathon_title', h.title, 'team_name', t.name, 'round_name', rd.name,
        'milestone_type', l.milestone_type, 'role_at_award', l.role_at_award,
        'points', l.points, 'reason', l.reason, 'awarded_by', ab.full_name,
        'created_at', l.created_at, 'transaction_id', l.id, 'student_id', l.student_id,
        'hackathon_id', l.hackathon_id, 'team_id', l.team_id, 'round_id', l.round_id,
        'reversal_of_id', l.reversal_of_id)
    FROM public.points_ledger l
    LEFT JOIN public.profiles s ON s.id = l.student_id
    LEFT JOIN public.hackathons h ON h.id = l.hackathon_id
    LEFT JOIN public.teams t ON t.id = l.team_id
    LEFT JOIN public.hackathon_rounds rd ON rd.id = l.round_id
    LEFT JOIN public.admin_profiles ab ON ab.id = l.awarded_by
    WHERE (p_after IS NULL OR l.id > p_after)
      AND (p_hackathon_id IS NULL OR l.hackathon_id = p_hackathon_id)
    ORDER BY l.id LIMIT v_limit;

  ELSIF p_dataset = 'hackathon_summary' THEN
    RETURN QUERY
    SELECT h.id,
      jsonb_build_object(
        'hackathon_title', h.title, 'status', h.status, 'organizer', h.organizer,
        'event_start_at', h.event_start_at, 'event_end_at', h.event_end_at,
        'total_teams', (SELECT count(*) FROM public.teams t WHERE t.hackathon_id = h.id),
        'total_participants', (SELECT count(*) FROM public.team_members tm WHERE tm.hackathon_id = h.id),
        'total_submissions', (SELECT count(*) FROM public.submissions s WHERE s.hackathon_id = h.id),
        'total_reviews', (SELECT count(*) FROM public.submission_reviews sr
                          JOIN public.submissions s ON s.id = sr.submission_id
                          WHERE s.hackathon_id = h.id),
        'total_winners', (SELECT count(*) FROM public.results r
                          WHERE r.hackathon_id = h.id AND r.milestone_type = 'win_placement'),
        'net_points_awarded', COALESCE((SELECT sum(l.points) FROM public.points_ledger l
                                        WHERE l.hackathon_id = h.id), 0),
        'hackathon_id', h.id)
    FROM public.hackathons h
    WHERE (p_after IS NULL OR h.id > p_after)
      AND (p_hackathon_id IS NULL OR h.id = p_hackathon_id)
    ORDER BY h.id LIMIT v_limit;

  ELSIF p_dataset = 'submissions' THEN
    RETURN QUERY
    SELECT s.id,
      jsonb_build_object(
        'hackathon_title', h.title, 'round_number', rd.round_number, 'round_name', rd.name,
        'team_name', t.name, 'submitted_by', sb.full_name, 'submitted_by_usn', sb.usn,
        'title', s.title, 'description', s.description,
        'repo_url', s.repo_url, 'demo_url', s.demo_url,
        'review_status', s.status, 'version', s.version, 'is_current', s.is_current,
        'evidence_on_file', (s.evidence_path IS NOT NULL AND s.evidence_deleted_at IS NULL),
        'evidence_sha256', s.evidence_sha256,
        'created_at', s.created_at, 'updated_at', s.updated_at,
        'submission_id', s.id, 'hackathon_id', s.hackathon_id,
        'round_id', s.round_id, 'team_id', s.team_id)
    FROM public.submissions s
    LEFT JOIN public.hackathons h ON h.id = s.hackathon_id
    LEFT JOIN public.hackathon_rounds rd ON rd.id = s.round_id
    LEFT JOIN public.teams t ON t.id = s.team_id
    LEFT JOIN public.profiles sb ON sb.id = s.submitted_by
    WHERE (p_after IS NULL OR s.id > p_after)
      AND (p_hackathon_id IS NULL OR s.hackathon_id = p_hackathon_id)
    ORDER BY s.id LIMIT v_limit;

  ELSIF p_dataset = 'reviews' THEN
    RETURN QUERY
    SELECT sr.id,
      jsonb_build_object(
        'hackathon_title', h.title, 'round_number', rd.round_number, 'round_name', rd.name,
        'team_name', t.name, 'submission_title', s.title,
        'reviewer_name', rv.full_name, 'decision', sr.decision, 'score', sr.score,
        'feedback', sr.feedback, 'reviewed_at', sr.reviewed_at,
        'review_id', sr.id, 'submission_id', sr.submission_id,
        'hackathon_id', s.hackathon_id, 'team_id', s.team_id)
    FROM public.submission_reviews sr
    JOIN public.submissions s ON s.id = sr.submission_id
    LEFT JOIN public.hackathons h ON h.id = s.hackathon_id
    LEFT JOIN public.hackathon_rounds rd ON rd.id = s.round_id
    LEFT JOIN public.teams t ON t.id = s.team_id
    LEFT JOIN public.admin_profiles rv ON rv.id = sr.reviewer_id
    WHERE (p_after IS NULL OR sr.id > p_after)
      AND (p_hackathon_id IS NULL OR s.hackathon_id = p_hackathon_id)
    ORDER BY sr.id LIMIT v_limit;

  ELSIF p_dataset = 'audit_logs' THEN
    RETURN QUERY
    SELECT a.id,
      jsonb_build_object(
        'created_at', a.created_at, 'actor_name', ac.full_name, 'actor_role', a.actor_role,
        'action', a.action, 'target_type', a.target_type, 'target_id', a.target_id,
        'details', a.details, 'log_id', a.id, 'actor_id', a.actor_id)
    FROM public.audit_logs a
    LEFT JOIN public.admin_profiles ac ON ac.id = a.actor_id
    WHERE (p_after IS NULL OR a.id > p_after)
      AND (p_hackathon_id IS NULL OR a.target_id = p_hackathon_id::text)
    ORDER BY a.id LIMIT v_limit;

  ELSIF p_dataset = 'profile_change_requests' THEN
    RETURN QUERY
    SELECT c.id,
      jsonb_build_object(
        'student_name', s.full_name, 'usn', s.usn, 'field_name', c.field_name,
        'old_value', CASE WHEN v_pii OR lower(c.field_name) NOT IN ('email', 'phone')
                          THEN c.old_value ELSE '[restricted]' END,
        'new_value', CASE WHEN v_pii OR lower(c.field_name) NOT IN ('email', 'phone')
                          THEN c.new_value ELSE '[restricted]' END,
        'reason', c.reason, 'status', c.status, 'reviewed_by', rv.full_name,
        'reviewed_at', c.reviewed_at, 'rejection_reason', c.rejection_reason,
        'created_at', c.created_at, 'request_id', c.id, 'student_id', c.student_id)
    FROM public.profile_change_requests c
    LEFT JOIN public.profiles s ON s.id = c.student_id
    LEFT JOIN public.admin_profiles rv ON rv.id = c.reviewed_by
    WHERE (p_after IS NULL OR c.id > p_after)
      AND (p_hackathon_id IS NULL OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.student_id = c.student_id AND tm.hackathon_id = p_hackathon_id))
    ORDER BY c.id LIMIT v_limit;

  ELSIF p_dataset = 'storage_objects' THEN
    RETURN QUERY
    SELECT q.id,
      jsonb_build_object(
        'bucket_id', q.bucket_id, 'target_type', q.target_type, 'target_id', q.target_id,
        'event_id', q.event_id, 'status', q.status, 'deletion_outcome', q.deletion_outcome,
        'retention_deadline_at', q.retention_deadline_at, 'created_at', q.created_at,
        'completed_at', q.completed_at, 'job_id', q.id)
    FROM public.storage_deletion_queue q
    WHERE (p_after IS NULL OR q.id > p_after)
      AND (p_hackathon_id IS NULL OR q.event_id = p_hackathon_id)
    ORDER BY q.id LIMIT v_limit;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_hackathon_lifecycle(p_hackathon_id uuid, p_target_status text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_is_super BOOLEAN;
  v_hackathon RECORD;
  v_trimmed_reason TEXT;
  v_actor_role TEXT;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_admin_manage_hackathon_config(p_hackathon_id) THEN
    RAISE EXCEPTION 'Access denied: caller does not have configuration management authority for this hackathon.' USING ERRCODE = '42501';
  END IF;

  IF p_target_status IS NULL THEN
    RAISE EXCEPTION 'Invalid argument: target status cannot be null.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_hackathon
  FROM public.hackathons
  WHERE id = p_hackathon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hackathon not found.' USING ERRCODE = 'P0002';
  END IF;

  v_trimmed_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  IF p_target_status = 'archived'
     AND v_hackathon.event_end_at IS NOT NULL
     AND v_hackathon.event_end_at > now()
     AND LENGTH(COALESCE(v_trimmed_reason, '')) < 10 THEN
    RAISE EXCEPTION 'A reason of at least 10 characters is required to archive an event before it ends.' USING ERRCODE = '22023';
  END IF;

  IF v_hackathon.status IN ('archived', 'completed') AND p_target_status <> 'archived' THEN
    RAISE EXCEPTION 'Cannot transition hackathon: current status is % and terminal.', v_hackathon.status USING ERRCODE = '55P03';
  END IF;

  IF v_hackathon.status = 'draft' AND p_target_status NOT IN ('published', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from draft to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  IF v_hackathon.status = 'published' AND p_target_status NOT IN ('registration_closed', 'ongoing', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from published to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  -- Events only move forward once registration has closed or the event has started.
  IF v_hackathon.status = 'registration_closed' AND p_target_status NOT IN ('ongoing', 'completed', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from registration_closed to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  IF v_hackathon.status = 'ongoing' AND p_target_status NOT IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'Invalid lifecycle transition from ongoing to %.', p_target_status USING ERRCODE = '22023';
  END IF;

  IF p_target_status = 'published'
     AND NOT EXISTS (SELECT 1 FROM public.hackathon_rounds WHERE hackathon_id = p_hackathon_id) THEN
    RAISE EXCEPTION 'Configure at least one round before publishing.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hackathons
  SET status = p_target_status,
      updated_at = clock_timestamp()
  WHERE id = p_hackathon_id;

  SELECT (is_super_admin = true AND is_active = true) INTO v_caller_is_super
  FROM public.admin_profiles
  WHERE id = v_caller_id;

  v_actor_role := CASE WHEN v_caller_is_super IS TRUE THEN 'super_admin' ELSE 'admin' END;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    v_actor_role,
    'hackathon.lifecycle_transitioned',
    'hackathon',
    p_hackathon_id::text,
    jsonb_build_object(
      'from_status', v_hackathon.status,
      'to_status', p_target_status,
      'reason', v_trimmed_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'hackathon_id', p_hackathon_id,
    'status', p_target_status
  );
END;
$function$;


-- ===========================================================================
-- 3. HACKATHON STATUS ADVANCES BY DATE
-- ===========================================================================
-- published / registration_closed -> ongoing   at event_start_at
-- published / registration_closed / ongoing -> completed at event_end_at
-- Draft and archived events are never touched; manual archive still wins.
CREATE OR REPLACE FUNCTION public.refresh_hackathon_statuses(p_hackathon_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed integer := 0;
  v_count integer;
BEGIN
  UPDATE public.hackathons
  SET status = 'completed', updated_at = clock_timestamp()
  WHERE status IN ('published', 'registration_closed', 'ongoing')
    AND event_end_at <= clock_timestamp()
    AND (p_hackathon_id IS NULL OR id = p_hackathon_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_changed := v_changed + v_count;

  UPDATE public.hackathons
  SET status = 'ongoing', updated_at = clock_timestamp()
  WHERE status IN ('published', 'registration_closed')
    AND event_start_at <= clock_timestamp()
    AND event_end_at > clock_timestamp()
    AND (p_hackathon_id IS NULL OR id = p_hackathon_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_changed := v_changed + v_count;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_hackathon_statuses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_hackathon_statuses(uuid) TO authenticated, service_role;

-- The app already calls refresh_round_statuses before reading/submitting; it now also
-- advances the parent hackathons, so one call keeps both in step.
CREATE OR REPLACE FUNCTION public.refresh_round_statuses(p_hackathon_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed integer := 0;
  v_count integer;
BEGIN
  v_changed := public.refresh_hackathon_statuses(p_hackathon_id);

  UPDATE public.hackathon_rounds
  SET status = 'evaluation', updated_at = clock_timestamp()
  WHERE status IN ('scheduled', 'open')
    AND end_at <= clock_timestamp()
    AND (p_hackathon_id IS NULL OR hackathon_id = p_hackathon_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_changed := v_changed + v_count;

  UPDATE public.hackathon_rounds
  SET status = 'open', updated_at = clock_timestamp()
  WHERE status = 'scheduled'
    AND start_at <= clock_timestamp()
    AND end_at > clock_timestamp()
    AND (p_hackathon_id IS NULL OR hackathon_id = p_hackathon_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_changed := v_changed + v_count;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_round_statuses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_round_statuses(uuid) TO authenticated, service_role;

SELECT public.refresh_round_statuses(NULL);

-- ===========================================================================
-- 5. DEAD / DUPLICATE FUNCTIONS
-- ===========================================================================
DROP FUNCTION IF EXISTS public.review_round_advancement(uuid, text, text);          -- duplicate of review_round_submission
DROP FUNCTION IF EXISTS public.provision_admin_profile(uuid, text, text, text, text, boolean, text[]); -- legacy overload
DROP FUNCTION IF EXISTS public.adjust_student_points(uuid, uuid, uuid, integer, text); -- replaced by adjust_points_ledger_entry
DROP FUNCTION IF EXISTS public.resolve_investigation_job(uuid, text, text, text);    -- no caller
DROP FUNCTION IF EXISTS public.export_profile_change_requests_report(text);          -- replaced by reports hub
DROP FUNCTION IF EXISTS public.audit_data_export(text, text, uuid, jsonb);           -- replaced by record_data_export

-- RLS-on / no-policy tables are deliberate: only SECURITY DEFINER functions touch them.
COMMENT ON TABLE public.profile_action_authorizations IS 'Internal: per-transaction authorizations written/consumed by SECURITY DEFINER functions only. RLS on, no policies by design.';
COMMENT ON TABLE public.rate_limit_buckets IS 'Internal: rate limiter state, accessed only via consume_rate_limit / prune_rate_limit_buckets. RLS on, no policies by design.';
COMMENT ON TABLE public.evidence_validation_intents IS 'Internal: server-recorded evidence upload provenance, consumed by submit/resubmit_round_milestone. RLS on, no policies by design.';

COMMIT;
