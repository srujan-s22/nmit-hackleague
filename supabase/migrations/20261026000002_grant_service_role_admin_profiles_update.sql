-- ==============================================================================
-- NMIT HACKLEAGUE — FORWARD-ONLY MIGRATION
-- Migration: 20261026000002_grant_service_role_admin_profiles_update.sql
-- Purpose: Grant UPDATE privilege on public.admin_profiles to service_role
--          to enable administrative onboarding and setup completion lifecycle transitions.
-- ==============================================================================

GRANT UPDATE ON TABLE public.admin_profiles TO service_role;
