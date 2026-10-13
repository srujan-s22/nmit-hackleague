-- ============================================================================
-- NMIT HackLeague — Phase 3 Local Synthetic Development Seed Data
-- ============================================================================

DO $$
BEGIN
  -- Strict Production Safeguard
  IF current_setting('app.environment', true) = 'production' 
     OR current_database() LIKE '%prod%' THEN
    RAISE EXCEPTION 'SEED SCRIPT CANNOT RUN IN PRODUCTION';
  END IF;
END $$;

BEGIN;

-- 1. Deterministic Synthetic Auth Fixtures in auth.users
-- Password for all synthetic accounts: password123
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'superadmin@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"NMIT Super Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'verifier.admin@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Verifier Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'student1@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Aarav Sharma"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'student2@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Diya Patel"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'pending@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Rohan Verma"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rejected@nmit-dev.local',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Kavya Nair"}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- 2. Admin Profiles
INSERT INTO public.admin_profiles (id, email, full_name, is_super_admin, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'superadmin@nmit-dev.local', 'NMIT Super Admin', true, true),
  ('00000000-0000-0000-0000-000000000002', 'verifier.admin@nmit-dev.local', 'Verifier Admin', false, true)
ON CONFLICT (id) DO UPDATE SET
  is_super_admin = EXCLUDED.is_super_admin,
  is_active = EXCLUDED.is_active;

-- 3. Granular Admin Permissions for Verifier Admin
INSERT INTO public.admin_permissions (admin_id, permission, granted_by)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'verify_students', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002', 'manage_students', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (admin_id, permission) DO NOTHING;

-- 4. Student Profiles
INSERT INTO public.profiles (
  id, email, full_name, usn, phone, branch, academic_year, registration_status, rejection_reason, reviewed_by, reviewed_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000003',
    'student1@nmit-dev.local',
    'Aarav Sharma',
    '1NT21CS001',
    '+919876543210',
    'CSE',
    4,
    'approved',
    NULL,
    '00000000-0000-0000-0000-000000000002',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'student2@nmit-dev.local',
    'Diya Patel',
    '1NT21CS002',
    '+919876543211',
    'CSE',
    4,
    'approved',
    NULL,
    '00000000-0000-0000-0000-000000000002',
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'pending@nmit-dev.local',
    'Rohan Verma',
    '1NT22IS050',
    '+919876543212',
    'ISE',
    3,
    'under_review',
    NULL,
    NULL,
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    'rejected@nmit-dev.local',
    'Kavya Nair',
    '1NT23EC099',
    '+919876543213',
    'ECE',
    2,
    'rejected',
    'Invalid ID card image: text unreadable',
    '00000000-0000-0000-0000-000000000002',
    now()
  )
ON CONFLICT (id) DO NOTHING;

-- 5. Milestone Point Configurations
INSERT INTO public.point_configurations (
  milestone_type, regular_member_points, team_leader_points, is_active, updated_by
)
VALUES
  ('participation', 10, 15, true, '00000000-0000-0000-0000-000000000001'),
  ('round_qualification', 20, 25, true, '00000000-0000-0000-0000-000000000001'),
  ('win_placement', 30, 35, true, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (milestone_type) DO UPDATE SET
  regular_member_points = EXCLUDED.regular_member_points,
  team_leader_points = EXCLUDED.team_leader_points,
  is_active = EXCLUDED.is_active;

-- 6. Sample Hackathon & Round
INSERT INTO public.hackathons (
  id, title, slug, description, organizer, mode, venue,
  registration_start_at, registration_end_at, event_start_at, event_end_at,
  timezone, min_team_size, max_team_size, is_solo_allowed, status, created_by
)
VALUES
  (
    '00000000-0000-0000-0000-000000000010',
    'NMIT Hacks 2026',
    'nmit-hacks-2026',
    'Annual Flagship Inter-College Hackathon at NMIT Bangalore',
    'Department of Computer Science & Engineering',
    'offline',
    'Main Auditorium, NMIT Campus',
    now() - interval '2 days',
    now() + interval '10 days',
    now() + interval '12 days',
    now() + interval '14 days',
    'Asia/Kolkata',
    1,
    4,
    true,
    'published',
    '00000000-0000-0000-0000-000000000001'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.hackathon_rounds (
  id, hackathon_id, round_number, name, description, start_at, end_at, is_final_round, status
)
VALUES
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000010',
    1,
    'Round 1: Problem Formulation & Architecture',
    'Initial presentation and repository submission',
    now() - interval '1 day',
    now() + interval '5 days',
    false,
    'open'
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;
