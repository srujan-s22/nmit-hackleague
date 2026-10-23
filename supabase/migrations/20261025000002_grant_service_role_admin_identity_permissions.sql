-- Migration 26: Grant narrow table privileges to service_role for admin identity and collision verification
-- Schema: public
-- Security Posture: Preserves all existing RLS policies and restrictions for 'anon' and 'authenticated'

-- 1. Allow service_role to read student profiles for identity-collision checks
GRANT SELECT ON TABLE public.profiles TO service_role;

-- 2. Allow service_role to read admin profiles for administrative provisioning
GRANT SELECT ON TABLE public.admin_profiles TO service_role;

-- 3. Allow service_role to read administrative permissions
GRANT SELECT ON TABLE public.admin_permissions TO service_role;
