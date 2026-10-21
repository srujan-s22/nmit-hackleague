
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_permissions": {
                  Row: {
                    "admin_id": string,"granted_at": string,"granted_by": string,"id": string,"permission": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_id": string,"granted_at"?: string,"granted_by": string,"id"?: string,"permission": string
                  }
                  Update: {
                    "admin_id"?: string,"granted_at"?: string,"granted_by"?: string,"id"?: string,"permission"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_permissions_admin_id_fkey"
      columns: ["admin_id"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_permissions_granted_by_fkey"
      columns: ["granted_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_profiles": {
                  Row: {
                    "created_at": string,"created_by": string | null,"email": string,"full_name": string,"id": string,"is_active": boolean,"is_super_admin": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"email": string,"full_name": string,"id": string,"is_active"?: boolean,"is_super_admin"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"email"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"is_super_admin"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_profiles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"announcement_reads": {
                  Row: {
                    "announcement_id": string,"read_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "announcement_id": string,"read_at"?: string,"user_id": string
                  }
                  Update: {
                    "announcement_id"?: string,"read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcement_reads_announcement_id_fkey"
      columns: ["announcement_id"]
isOneToOne: false
      referencedRelation: "announcements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "announcement_reads_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"announcements": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string,"id": string,"push_dispatched_count": number,"push_failed_count": number,"target_role": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by": string,"id"?: string,"push_dispatched_count"?: number,"push_failed_count"?: number,"target_role"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"push_dispatched_count"?: number,"push_failed_count"?: number,"target_role"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "announcements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_role": string,"created_at": string,"details": NonNullable<Json>,"id": string,"ip_address": unknown,"target_id": string | null,"target_type": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_role": string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: string,"ip_address"?: unknown,"target_id"?: string | null,"target_type": string,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_role"?: string,"created_at"?: string,"details"?: NonNullable<Json>,"id"?: string,"ip_address"?: unknown,"target_id"?: string | null,"target_type"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"evidence_validation_intents": {
                  Row: {
                    "consumed_at": string | null,"created_at": string,"created_by": string,"expires_at": string,"file_size_bytes": number,"hackathon_id": string,"id": string,"mime_type": string,"object_path": string,"round_id": string,"sha256_hash": string,"status": string,"submission_id": string | null,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consumed_at"?: string | null,"created_at"?: string,"created_by": string,"expires_at"?: string,"file_size_bytes": number,"hackathon_id": string,"id"?: string,"mime_type": string,"object_path": string,"round_id": string,"sha256_hash": string,"status"?: string,"submission_id"?: string | null,"team_id": string
                  }
                  Update: {
                    "consumed_at"?: string | null,"created_at"?: string,"created_by"?: string,"expires_at"?: string,"file_size_bytes"?: number,"hackathon_id"?: string,"id"?: string,"mime_type"?: string,"object_path"?: string,"round_id"?: string,"sha256_hash"?: string,"status"?: string,"submission_id"?: string | null,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_validation_intents_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_validation_intents_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_validation_intents_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons_public_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_validation_intents_round_id_fkey"
      columns: ["round_id"]
isOneToOne: false
      referencedRelation: "hackathon_rounds"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_validation_intents_round_id_fkey"
      columns: ["round_id"]
isOneToOne: false
      referencedRelation: "hackathon_rounds_public_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_validation_intents_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_validation_intents_team_id_fkey"
      columns: ["team_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id"]
    }
                  ]
                },"hackathon_rounds": {
                  Row: {
                    "created_at": string,"description": string | null,"end_at": string,"hackathon_id": string,"id": string,"is_final_round": boolean,"name": string,"round_number": number,"start_at": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"end_at": string,"hackathon_id": string,"id"?: string,"is_final_round"?: boolean,"name": string,"round_number": number,"start_at": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"end_at"?: string,"hackathon_id"?: string,"id"?: string,"is_final_round"?: boolean,"name"?: string,"round_number"?: number,"start_at"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "hackathon_rounds_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hackathon_rounds_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons_public_view"
      referencedColumns: ["id"]
    }
                  ]
                },"hackathons": {
                  Row: {
                    "academic_term": string,"academic_year": string,"community_url": string | null,"created_at": string,"created_by": string,"description": string,"eligibility": string,"event_end_at": string,"event_start_at": string,"external_registration_url": string | null,"id": string,"in_charge_admin_id": string | null,"is_solo_allowed": boolean,"max_team_size": number,"min_team_size": number,"mode": string,"organizer": string,"prizes_detail": NonNullable<Json>,"prizes_summary": string | null,"registration_end_at": string,"registration_start_at": string,"slug": string,"status": string,"tagline": string | null,"timezone": string,"title": string,"updated_at": string,"venue": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_term"?: string,"academic_year"?: string,"community_url"?: string | null,"created_at"?: string,"created_by": string,"description": string,"eligibility"?: string,"event_end_at": string,"event_start_at": string,"external_registration_url"?: string | null,"id"?: string,"in_charge_admin_id"?: string | null,"is_solo_allowed"?: boolean,"max_team_size"?: number,"min_team_size"?: number,"mode": string,"organizer": string,"prizes_detail"?: NonNullable<Json>,"prizes_summary"?: string | null,"registration_end_at": string,"registration_start_at": string,"slug": string,"status"?: string,"tagline"?: string | null,"timezone"?: string,"title": string,"updated_at"?: string,"venue"?: string | null
                  }
                  Update: {
                    "academic_term"?: string,"academic_year"?: string,"community_url"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string,"eligibility"?: string,"event_end_at"?: string,"event_start_at"?: string,"external_registration_url"?: string | null,"id"?: string,"in_charge_admin_id"?: string | null,"is_solo_allowed"?: boolean,"max_team_size"?: number,"min_team_size"?: number,"mode"?: string,"organizer"?: string,"prizes_detail"?: NonNullable<Json>,"prizes_summary"?: string | null,"registration_end_at"?: string,"registration_start_at"?: string,"slug"?: string,"status"?: string,"tagline"?: string | null,"timezone"?: string,"title"?: string,"updated_at"?: string,"venue"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "hackathons_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hackathons_in_charge_admin_id_fkey"
      columns: ["in_charge_admin_id"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"point_configurations": {
                  Row: {
                    "id": string,"is_active": boolean,"milestone_type": string,"regular_member_points": number,"team_leader_points": number,"updated_at": string,"updated_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"is_active"?: boolean,"milestone_type": string,"regular_member_points": number,"team_leader_points": number,"updated_at"?: string,"updated_by": string
                  }
                  Update: {
                    "id"?: string,"is_active"?: boolean,"milestone_type"?: string,"regular_member_points"?: number,"team_leader_points"?: number,"updated_at"?: string,"updated_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "point_configurations_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"points_ledger": {
                  Row: {
                    "adjusted_entry_id": string | null,"awarded_by": string,"created_at": string,"hackathon_id": string,"id": string,"idempotency_key": string,"milestone_type": string,"points": number,"reason": string,"result_id": string | null,"reversal_of_id": string | null,"role_at_award": string,"round_id": string | null,"student_id": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adjusted_entry_id"?: string | null,"awarded_by": string,"created_at"?: string,"hackathon_id": string,"id"?: string,"idempotency_key": string,"milestone_type": string,"points": number,"reason": string,"result_id"?: string | null,"reversal_of_id"?: string | null,"role_at_award": string,"round_id"?: string | null,"student_id": string,"team_id": string
                  }
                  Update: {
                    "adjusted_entry_id"?: string | null,"awarded_by"?: string,"created_at"?: string,"hackathon_id"?: string,"id"?: string,"idempotency_key"?: string,"milestone_type"?: string,"points"?: number,"reason"?: string,"result_id"?: string | null,"reversal_of_id"?: string | null,"role_at_award"?: string,"round_id"?: string | null,"student_id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_points_ledger_team_member"
      columns: ["team_id","student_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["team_id","student_id","hackathon_id"]
    },{
      foreignKeyName: "fk_points_result_composite"
      columns: ["result_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "results"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "fk_points_round_composite"
      columns: ["round_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathon_rounds"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "fk_points_round_composite"
      columns: ["round_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathon_rounds_public_view"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "points_ledger_adjusted_entry_id_fkey"
      columns: ["adjusted_entry_id"]
isOneToOne: false
      referencedRelation: "points_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_awarded_by_fkey"
      columns: ["awarded_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons_public_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_reversal_of_id_fkey"
      columns: ["reversal_of_id"]
isOneToOne: false
      referencedRelation: "points_ledger"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "points_ledger_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_action_authorizations": {
                  Row: {
                    "action_type": string,"created_at": string,"id": string,"new_value": string | null,"old_value": string | null,"student_id": string,"xact_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_type": string,"created_at"?: string,"id"?: string,"new_value"?: string | null,"old_value"?: string | null,"student_id": string,"xact_id": string
                  }
                  Update: {
                    "action_type"?: string,"created_at"?: string,"id"?: string,"new_value"?: string | null,"old_value"?: string | null,"student_id"?: string,"xact_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_action_authorizations_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_change_requests": {
                  Row: {
                    "created_at": string,"field_name": string,"id": string,"new_value": string,"old_value": string,"reason": string,"rejection_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"student_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"field_name": string,"id"?: string,"new_value": string,"old_value": string,"reason": string,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"student_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"field_name"?: string,"id"?: string,"new_value"?: string,"old_value"?: string,"reason"?: string,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"student_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profile_change_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profile_change_requests_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "academic_year": number,"branch": string,"college_id_deleted_at": string | null,"college_id_path": string | null,"created_at": string,"date_of_birth": string | null,"email": string,"full_name": string,"id": string,"phone": string,"profile_photo_path": string | null,"registration_status": string,"rejection_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"sex": Database["public"]['Enums']["gender"] | null,"updated_at": string,"usn": string
                  }
                  ComputedFields: never
                  Insert: {
                    "academic_year": number,"branch": string,"college_id_deleted_at"?: string | null,"college_id_path"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"email": string,"full_name": string,"id": string,"phone": string,"profile_photo_path"?: string | null,"registration_status"?: string,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sex"?: Database["public"]['Enums']["gender"] | null,"updated_at"?: string,"usn": string
                  }
                  Update: {
                    "academic_year"?: number,"branch"?: string,"college_id_deleted_at"?: string | null,"college_id_path"?: string | null,"created_at"?: string,"date_of_birth"?: string | null,"email"?: string,"full_name"?: string,"id"?: string,"phone"?: string,"profile_photo_path"?: string | null,"registration_status"?: string,"rejection_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"sex"?: Database["public"]['Enums']["gender"] | null,"updated_at"?: string,"usn"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_buckets": {
                  Row: {
                    "action": string,"bucket_key": string,"request_count": number,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"bucket_key": string,"request_count"?: number,"window_start": string
                  }
                  Update: {
                    "action"?: string,"bucket_key"?: string,"request_count"?: number,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"results": {
                  Row: {
                    "created_at": string,"hackathon_id": string,"id": string,"is_published": boolean,"milestone_type": string,"notes": string | null,"placement": string | null,"round_id": string | null,"team_id": string,"updated_at": string,"verified_at": string,"verified_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"hackathon_id": string,"id"?: string,"is_published"?: boolean,"milestone_type": string,"notes"?: string | null,"placement"?: string | null,"round_id"?: string | null,"team_id": string,"updated_at"?: string,"verified_at"?: string,"verified_by": string
                  }
                  Update: {
                    "created_at"?: string,"hackathon_id"?: string,"id"?: string,"is_published"?: boolean,"milestone_type"?: string,"notes"?: string | null,"placement"?: string | null,"round_id"?: string | null,"team_id"?: string,"updated_at"?: string,"verified_at"?: string,"verified_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_results_round_composite"
      columns: ["round_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathon_rounds"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "fk_results_round_composite"
      columns: ["round_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathon_rounds_public_view"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "fk_results_team_composite"
      columns: ["team_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "results_verified_by_fkey"
      columns: ["verified_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"storage_deletion_queue": {
                  Row: {
                    "bucket_id": string,"completed_at": string | null,"cooldown_until": string | null,"created_at": string,"deletion_outcome": string | null,"dispatch_attempted_at": string | null,"event_id": string | null,"id": string,"last_error": string | null,"lease_token": string | null,"leased_by": string | null,"leased_until": string | null,"max_retries": number,"next_retry_at": string,"object_path": string,"retention_deadline_at": string | null,"retry_count": number,"status": string,"target_id": string,"target_type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket_id": string,"completed_at"?: string | null,"cooldown_until"?: string | null,"created_at"?: string,"deletion_outcome"?: string | null,"dispatch_attempted_at"?: string | null,"event_id"?: string | null,"id"?: string,"last_error"?: string | null,"lease_token"?: string | null,"leased_by"?: string | null,"leased_until"?: string | null,"max_retries"?: number,"next_retry_at"?: string,"object_path": string,"retention_deadline_at"?: string | null,"retry_count"?: number,"status"?: string,"target_id": string,"target_type": string,"updated_at"?: string
                  }
                  Update: {
                    "bucket_id"?: string,"completed_at"?: string | null,"cooldown_until"?: string | null,"created_at"?: string,"deletion_outcome"?: string | null,"dispatch_attempted_at"?: string | null,"event_id"?: string | null,"id"?: string,"last_error"?: string | null,"lease_token"?: string | null,"leased_by"?: string | null,"leased_until"?: string | null,"max_retries"?: number,"next_retry_at"?: string,"object_path"?: string,"retention_deadline_at"?: string | null,"retry_count"?: number,"status"?: string,"target_id"?: string,"target_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "storage_deletion_queue_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "hackathons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "storage_deletion_queue_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "hackathons_public_view"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_reviews": {
                  Row: {
                    "decision": string,"feedback": string | null,"id": string,"reviewed_at": string,"reviewer_id": string,"score": number | null,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "decision": string,"feedback"?: string | null,"id"?: string,"reviewed_at"?: string,"reviewer_id": string,"score"?: number | null,"submission_id": string
                  }
                  Update: {
                    "decision"?: string,"feedback"?: string | null,"id"?: string,"reviewed_at"?: string,"reviewer_id"?: string,"score"?: number | null,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_reviews_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submission_reviews_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "created_at": string,"demo_url": string | null,"description": string | null,"evidence_absence_recorded_at": string | null,"evidence_deleted_at": string | null,"evidence_lifecycle_state": string,"evidence_path": string | null,"evidence_sha256": string | null,"evidence_uploaded_at": string | null,"hackathon_id": string,"id": string,"is_current": boolean,"parent_submission_id": string | null,"repo_url": string | null,"round_id": string,"status": string,"submitted_by": string,"team_id": string,"title": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"demo_url"?: string | null,"description"?: string | null,"evidence_absence_recorded_at"?: string | null,"evidence_deleted_at"?: string | null,"evidence_lifecycle_state"?: string,"evidence_path"?: string | null,"evidence_sha256"?: string | null,"evidence_uploaded_at"?: string | null,"hackathon_id": string,"id"?: string,"is_current"?: boolean,"parent_submission_id"?: string | null,"repo_url"?: string | null,"round_id": string,"status"?: string,"submitted_by": string,"team_id": string,"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"demo_url"?: string | null,"description"?: string | null,"evidence_absence_recorded_at"?: string | null,"evidence_deleted_at"?: string | null,"evidence_lifecycle_state"?: string,"evidence_path"?: string | null,"evidence_sha256"?: string | null,"evidence_uploaded_at"?: string | null,"hackathon_id"?: string,"id"?: string,"is_current"?: boolean,"parent_submission_id"?: string | null,"repo_url"?: string | null,"round_id"?: string,"status"?: string,"submitted_by"?: string,"team_id"?: string,"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_submissions_round_composite"
      columns: ["round_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathon_rounds"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "fk_submissions_round_composite"
      columns: ["round_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathon_rounds_public_view"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "fk_submissions_team_composite"
      columns: ["team_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "submissions_parent_submission_id_fkey"
      columns: ["parent_submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "hackathon_id": string,"id": string,"joined_at": string,"role": string,"student_id": string,"team_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hackathon_id": string,"id"?: string,"joined_at"?: string,"role"?: string,"student_id": string,"team_id": string
                  }
                  Update: {
                    "hackathon_id"?: string,"id"?: string,"joined_at"?: string,"role"?: string,"student_id"?: string,"team_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_team_members_team_composite"
      columns: ["team_id","hackathon_id"]
isOneToOne: false
      referencedRelation: "teams"
      referencedColumns: ["id","hackathon_id"]
    },{
      foreignKeyName: "team_members_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"teams": {
                  Row: {
                    "cdc_declaration_accepted": boolean,"cdc_declaration_accepted_at": string | null,"cdc_declaration_text_version": string | null,"created_at": string,"external_proof_path": string | null,"external_proof_reviewed_at": string | null,"external_proof_reviewed_by": string | null,"external_proof_submitted_at": string | null,"external_status": string,"hackathon_id": string,"id": string,"internal_status": string,"invitation_code": string,"invitation_code_expires_at": string,"leader_id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cdc_declaration_accepted"?: boolean,"cdc_declaration_accepted_at"?: string | null,"cdc_declaration_text_version"?: string | null,"created_at"?: string,"external_proof_path"?: string | null,"external_proof_reviewed_at"?: string | null,"external_proof_reviewed_by"?: string | null,"external_proof_submitted_at"?: string | null,"external_status"?: string,"hackathon_id": string,"id"?: string,"internal_status"?: string,"invitation_code": string,"invitation_code_expires_at"?: string,"leader_id": string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "cdc_declaration_accepted"?: boolean,"cdc_declaration_accepted_at"?: string | null,"cdc_declaration_text_version"?: string | null,"created_at"?: string,"external_proof_path"?: string | null,"external_proof_reviewed_at"?: string | null,"external_proof_reviewed_by"?: string | null,"external_proof_submitted_at"?: string | null,"external_status"?: string,"hackathon_id"?: string,"id"?: string,"internal_status"?: string,"invitation_code"?: string,"invitation_code_expires_at"?: string,"leader_id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "fk_teams_leader_member"
      columns: ["id","leader_id"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["team_id","student_id"]
    },{
      foreignKeyName: "teams_external_proof_reviewed_by_fkey"
      columns: ["external_proof_reviewed_by"]
isOneToOne: false
      referencedRelation: "admin_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teams_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teams_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons_public_view"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "teams_leader_id_fkey"
      columns: ["leader_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_push_subscriptions": {
                  Row: {
                    "active": boolean,"auth": string,"created_at": string,"device_fingerprint": string,"endpoint": string,"id": string,"p256dh": string,"updated_at": string,"user_agent": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"auth": string,"created_at"?: string,"device_fingerprint": string,"endpoint": string,"id"?: string,"p256dh": string,"updated_at"?: string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"auth"?: string,"created_at"?: string,"device_fingerprint"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "hackathon_rounds_public_view": {
                  Row: {
                    "description": string | null,"end_at": string | null,"hackathon_id": string | null,"id": string | null,"is_final_round": boolean | null,"name": string | null,"round_number": number | null,"start_at": string | null,"status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "description"?: string | null,"end_at"?: string | null,"hackathon_id"?: string | null,"id"?: string | null,"is_final_round"?: boolean | null,"name"?: string | null,"round_number"?: number | null,"start_at"?: string | null,"status"?: never
                         }
                        Update: {
                           "description"?: string | null,"end_at"?: string | null,"hackathon_id"?: string | null,"id"?: string | null,"is_final_round"?: boolean | null,"name"?: string | null,"round_number"?: number | null,"start_at"?: string | null,"status"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "hackathon_rounds_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "hackathon_rounds_hackathon_id_fkey"
      columns: ["hackathon_id"]
isOneToOne: false
      referencedRelation: "hackathons_public_view"
      referencedColumns: ["id"]
    }
                  ]
                },"hackathons_public_view": {
                  Row: {
                    "community_url": string | null,"description": string | null,"eligibility": string | null,"event_end_at": string | null,"event_start_at": string | null,"external_registration_url": string | null,"id": string | null,"is_solo_allowed": boolean | null,"max_team_size": number | null,"min_team_size": number | null,"mode": string | null,"organizer": string | null,"prizes_detail": Json | null,"prizes_summary": string | null,"registration_end_at": string | null,"registration_start_at": string | null,"slug": string | null,"status": string | null,"tagline": string | null,"timezone": string | null,"title": string | null,"venue": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "community_url"?: string | null,"description"?: string | null,"eligibility"?: string | null,"event_end_at"?: string | null,"event_start_at"?: string | null,"external_registration_url"?: string | null,"id"?: string | null,"is_solo_allowed"?: boolean | null,"max_team_size"?: number | null,"min_team_size"?: number | null,"mode"?: string | null,"organizer"?: string | null,"prizes_detail"?: Json | null,"prizes_summary"?: string | null,"registration_end_at"?: string | null,"registration_start_at"?: string | null,"slug"?: string | null,"status"?: string | null,"tagline"?: string | null,"timezone"?: string | null,"title"?: string | null,"venue"?: string | null
                         }
                        Update: {
                           "community_url"?: string | null,"description"?: string | null,"eligibility"?: string | null,"event_end_at"?: string | null,"event_start_at"?: string | null,"external_registration_url"?: string | null,"id"?: string | null,"is_solo_allowed"?: boolean | null,"max_team_size"?: number | null,"min_team_size"?: number | null,"mode"?: string | null,"organizer"?: string | null,"prizes_detail"?: Json | null,"prizes_summary"?: string | null,"registration_end_at"?: string | null,"registration_start_at"?: string | null,"slug"?: string | null,"status"?: string | null,"tagline"?: string | null,"timezone"?: string | null,"title"?: string | null,"venue"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "adjust_points_ledger_entry":
{ Args: { "p_adjusted_entry_id"?: string,"p_hackathon_id": string,"p_idempotency_key": string,"p_override_negative_floor"?: boolean,"p_points": number,"p_reason": string,"p_student_id": string,"p_team_id": string }; Returns: Json
                           },
"adjust_student_points":
{ Args: { "p_hackathon_id": string,"p_points": number,"p_reason": string,"p_student_id": string,"p_team_id": string }; Returns: string
                           },
"audit_data_export":
{ Args: { "p_dataset": string,"p_filters"?: Json,"p_format": string,"p_hackathon_id"?: string }; Returns: undefined
                           },
"auto_pause_expired_rounds":
{ Args: { "p_hackathon_id"?: string }; Returns: number
                           },
"award_milestone_points":
{ Args: { "p_hackathon_id": string,"p_milestone_type": string,"p_reason": string,"p_result_id": string,"p_round_id": string,"p_student_id": string,"p_team_id": string }; Returns: string
                           },
"bootstrap_super_admin":
{ Args: { "p_auth_uid": string,"p_email": string,"p_full_name": string }; Returns: Json
                           },
"can_admin_manage_hackathon":
{ Args: { "p_hackathon_id": string,"p_permission_key": string }; Returns: boolean
                           },
"can_upload_registration_proof":
{ Args: { "p_team_id_text": string }; Returns: boolean
                           },
"can_upload_submission_evidence":
{ Args: { "p_hackathon_id": string,"p_submission_id": string }; Returns: boolean
                           },
"can_upload_team_round_evidence":
{ Args: { "p_round_id": string,"p_team_id": string }; Returns: boolean
                           },
"can_view_registration_proof":
{ Args: { "p_team_id_text": string }; Returns: boolean
                           },
"can_view_submission_evidence":
{ Args: { "p_submission_id": string }; Returns: boolean
                           },
"claim_reconciliation_batch":
{ Args: { "p_batch_size"?: number,"p_lease_seconds"?: number,"p_worker_id": string }; Returns: {
              "bucket_id": string,"event_id": string,"job_id": string,"lease_token": string,"leased_until": string,"object_path": string,"target_id": string
            }[]
                           },
"claim_storage_deletion_batch":
{ Args: { "p_batch_size"?: number,"p_lease_seconds"?: number,"p_worker_id": string }; Returns: {
              "bucket_id": string,"event_id": string,"job_id": string,"lease_token": string,"leased_until": string,"object_path": string,"target_id": string
            }[]
                           },
"claim_storage_deletion_jobs":
{ Args: { "p_batch_size": number,"p_lease_seconds": number,"p_worker_id": string }; Returns: {
              "bucket_id": string,"job_id": string,"lease_token": string,"leased_until": string,"object_path": string,"target_id": string,"target_type": string
            }[]
                           },
"complete_storage_deletion_job":
{ Args: { "p_job_id": string,"p_lease_token": string }; Returns: undefined
                           } |
{ Args: { "p_http_status": number,"p_job_id": string,"p_lease_token": string }; Returns: undefined
                           },
"compute_registration_state":
{ Args: { "p_now"?: string,"p_reg_end": string,"p_reg_start": string,"p_status": string }; Returns: string
                           },
"configure_hackathon_rounds":
{ Args: { "p_hackathon_id": string,"p_rounds": Json }; Returns: Json
                           },
"confirm_deletion_preflight":
{ Args: { "p_job_id": string,"p_lease_token": string }; Returns: {
              "bucket_id": string,"event_id": string,"job_id": string,"lease_token": string,"leased_until": string,"object_path": string,"target_id": string
            }[]
                           },
"consume_rate_limit":
{ Args: { "p_action": string,"p_custom_key"?: string }; Returns: boolean
                           },
"create_hackathon_draft":
{ Args: { "p_community_url"?: string,"p_description": string,"p_eligibility"?: string,"p_event_end_at": string,"p_event_start_at": string,"p_external_registration_url"?: string,"p_in_charge_admin_id"?: string,"p_is_solo_allowed"?: boolean,"p_max_team_size"?: number,"p_min_team_size"?: number,"p_mode": string,"p_organizer": string,"p_prizes_detail"?: Json,"p_prizes_summary"?: string,"p_registration_end_at": string,"p_registration_start_at": string,"p_slug": string,"p_tagline"?: string,"p_title": string,"p_venue": string }; Returns: Json
                           },
"create_team":
{ Args: { "p_hackathon_id": string,"p_team_name": string }; Returns: Json
                           },
"current_has_permission":
{ Args: { "p_permission_key": string }; Returns: boolean
                           },
"current_is_approved_student":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"current_is_super_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"current_is_team_member":
{ Args: { "p_team_id": string }; Returns: boolean
                           },
"deactivate_push_subscription":
{ Args: { "p_device_fingerprint": string }; Returns: Json
                           },
"enqueue_hackathon_evidence_retention":
{ Args: { "p_hackathon_id": string }; Returns: Json
                           },
"enqueue_storage_deletion_job":
{ Args: { "p_bucket_id": string,"p_object_path": string,"p_target_id": string,"p_target_type": string }; Returns: string
                           },
"extend_hackathon_event_deadline":
{ Args: { "p_hackathon_id": string,"p_new_event_end_at": string,"p_reason": string }; Returns: Json
                           },
"fail_storage_deletion_job":
{ Args: { "p_error": string,"p_job_id": string,"p_lease_token": string }; Returns: undefined
                           },
"finalize_submission_upload":
{ Args: { "p_object_path": string,"p_sha256": string,"p_submission_id": string }; Returns: Json
                           },
"get_platform_leaderboard":
{ Args: { "p_academic_year"?: number,"p_event_academic_year"?: string,"p_event_term"?: string,"p_limit"?: number,"p_offset"?: number }; Returns: {
              "academic_year": number,"branch": string,"full_name": string,"rank": number,"student_id": string,"total_points": number,"verified_qualifications_count": number
            }[]
                           },
"get_student_points_summary":
{ Args: { "p_student_id": string }; Returns: Json
                           },
"is_push_registered":
{ Args: { "p_user_id"?: string }; Returns: boolean
                           },
"join_team_with_code":
{ Args: { "p_invitation_code": string }; Returns: Json
                           },
"leave_team":
{ Args: { "p_team_id": string }; Returns: Json
                           },
"lock_team_roster":
{ Args: { "p_team_id": string }; Returns: undefined
                           },
"manage_admin_permissions":
{ Args: { "p_permissions": (string)[],"p_target_admin_id": string }; Returns: Json
                           },
"mark_announcement_read":
{ Args: { "p_announcement_id": string }; Returns: undefined
                           },
"override_hackathon_deadline":
{ Args: { "p_hackathon_id": string,"p_new_deadline": string,"p_reason": string }; Returns: Json
                           },
"override_round_schedule":
{ Args: { "p_new_end_at": string,"p_new_start_at": string,"p_reason": string,"p_round_id": string }; Returns: Json
                           },
"pause_hackathon_round":
{ Args: { "p_reason": string,"p_round_id": string }; Returns: Json
                           },
"provision_admin_profile":
{ Args: { "p_auth_uid": string,"p_email": string,"p_full_name": string,"p_permissions": (string)[] }; Returns: Json
                           },
"prune_rate_limit_buckets":
{ Args: { "p_batch_size"?: number }; Returns: number
                           },
"publish_announcement":
{ Args: { "p_body": string,"p_target_role"?: string,"p_title": string }; Returns: Json
                           },
"quarantine_expired_dispatches":
{ Args: { "p_batch_size"?: number,"p_cooldown_seconds"?: number }; Returns: {
              "quarantined_count": number
            }[]
                           },
"reassign_hackathon_in_charge_admin":
{ Args: { "p_hackathon_id": string,"p_justification": string,"p_new_admin_id": string }; Returns: Json
                           },
"record_round_winner_placement":
{ Args: { "p_notes"?: string,"p_placement": string,"p_submission_id": string }; Returns: Json
                           },
"regenerate_team_invitation_code":
{ Args: { "p_team_id": string }; Returns: Json
                           },
"register_push_subscription":
{ Args: { "p_auth": string,"p_device_fingerprint": string,"p_endpoint": string,"p_p256dh": string,"p_user_agent"?: string }; Returns: Json
                           },
"remove_team_member":
{ Args: { "p_student_id": string,"p_team_id": string }; Returns: Json
                           },
"reopen_rejected_submission":
{ Args: { "p_reason": string,"p_submission_id": string,"p_target_status": string }; Returns: Json
                           },
"replace_college_id":
{ Args: { "p_new_storage_path": string }; Returns: Json
                           },
"resolve_investigation_job":
{ Args: { "p_action": string,"p_job_id": string,"p_justification": string,"p_ticket_reference"?: string }; Returns: Json
                           },
"resolve_reconciliation_job":
{ Args: { "p_http_status": number,"p_job_id": string,"p_lease_token": string }; Returns: undefined
                           },
"resubmit_round_milestone":
{ Args: { "p_demo_url"?: string,"p_description"?: string,"p_evidence_path"?: string,"p_evidence_sha256"?: string,"p_prior_submission_id": string,"p_repo_url"?: string,"p_title": string }; Returns: Json
                           },
"resume_hackathon_round":
{ Args: { "p_new_end_at"?: string,"p_reason"?: string,"p_round_id": string }; Returns: Json
                           },
"reverse_points_award":
{ Args: { "p_original_ledger_id": string,"p_reason": string }; Returns: string
                           },
"reverse_points_ledger_entry":
{ Args: { "p_ledger_id": string,"p_reason": string }; Returns: Json
                           },
"review_round_advancement":
{ Args: { "p_decision": string,"p_feedback"?: string,"p_submission_id": string }; Returns: Json
                           },
"review_round_submission":
{ Args: { "p_decision": string,"p_feedback"?: string,"p_submission_id": string }; Returns: Json
                           },
"review_student_registration":
{ Args: { "p_decision": string,"p_rejection_reason"?: string,"p_student_id": string }; Returns: Json
                           },
"scan_and_enqueue_expired_hackathons_evidence":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"set_admin_active_status":
{ Args: { "p_is_active": boolean,"p_reason": string,"p_target_admin_id": string }; Returns: Json
                           },
"set_hackathon_academic_period":
{ Args: { "p_academic_term": string,"p_academic_year": string,"p_hackathon_id": string }; Returns: Json
                           },
"submit_profile_for_review":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"submit_registration_proof":
{ Args: { "p_cdc_declaration_accepted": boolean,"p_cdc_declaration_text": string,"p_proof_path": string,"p_team_id": string }; Returns: Json
                           },
"submit_round_milestone":
{ Args: { "p_demo_url"?: string,"p_description"?: string,"p_evidence_path"?: string,"p_evidence_sha256"?: string,"p_repo_url"?: string,"p_round_id": string,"p_team_id": string,"p_title": string }; Returns: Json
                           },
"transfer_team_leadership":
{ Args: { "p_new_leader_id": string,"p_team_id": string }; Returns: undefined
                           },
"transition_hackathon_lifecycle":
{ Args: { "p_hackathon_id": string,"p_reason"?: string,"p_target_status": string }; Returns: Json
                           },
"update_hackathon_metadata":
{ Args: { "p_community_url": string,"p_description": string,"p_eligibility": string,"p_event_end_at": string,"p_event_start_at": string,"p_external_registration_url": string,"p_hackathon_id": string,"p_is_solo_allowed": boolean,"p_max_team_size": number,"p_min_team_size": number,"p_mode": string,"p_organizer": string,"p_prizes_detail": Json,"p_prizes_summary": string,"p_registration_start_at": string,"p_slug": string,"p_tagline": string,"p_title": string,"p_venue": string }; Returns: Json
                           }
          }
          Enums: {
            "gender": "Male"|"Female"|"Other"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "gender": ["Male", "Female", "Other"]
          }
        }
} as const
