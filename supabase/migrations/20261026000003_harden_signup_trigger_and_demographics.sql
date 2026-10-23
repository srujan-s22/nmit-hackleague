-- ==============================================================================
-- NMIT HACKLEAGUE — FORWARD-ONLY MIGRATION
-- Migration: 20261026000003_harden_signup_trigger_and_demographics.sql
-- Purpose: Harden public.handle_new_auth_user() trigger function:
--          1. Case-insensitive normalization and mapping for gender enum.
--          2. Resilient date and integer parsing for demographics.
--          3. Explicit USN uniqueness guard with SQLSTATE 23505.
--          4. Safe execution search path and SECURITY DEFINER enforcement.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_usn TEXT;
  v_phone TEXT;
  v_branch TEXT;
  v_academic_year INT;
  v_raw_sex TEXT;
  v_sex public.gender;
  v_dob DATE;
BEGIN
  -- 1. If user has admin role metadata, skip student profile creation
  IF (NEW.raw_app_meta_data->>'claims_admin')::boolean IS TRUE
     OR NEW.raw_app_meta_data->>'role' = 'admin'
     OR NEW.raw_user_meta_data->>'role' = 'admin' THEN
    RETURN NEW;
  END IF;

  -- 2. Skip profile creation for direct raw SQL fixture/admin inserts without metadata
  IF NEW.raw_app_meta_data IS NULL AND NEW.raw_user_meta_data IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Extract and normalize input fields
  v_full_name := trim(COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  v_usn := upper(trim(COALESCE(NEW.raw_user_meta_data->>'usn', '')));
  v_phone := trim(COALESCE(NEW.raw_user_meta_data->>'phone', ''));
  v_branch := trim(COALESCE(NEW.raw_user_meta_data->>'branch', ''));

  -- Safe academic_year integer extraction
  BEGIN
    v_academic_year := (NEW.raw_user_meta_data->>'academic_year')::INT;
  EXCEPTION WHEN OTHERS THEN
    v_academic_year := NULL;
  END;

  -- Resilient gender enum mapping (case-insensitive)
  v_raw_sex := lower(trim(COALESCE(NEW.raw_user_meta_data->>'sex', '')));
  IF v_raw_sex = 'male' THEN
    v_sex := 'Male'::public.gender;
  ELSIF v_raw_sex = 'female' THEN
    v_sex := 'Female'::public.gender;
  ELSIF v_raw_sex = 'other' THEN
    v_sex := 'Other'::public.gender;
  ELSE
    v_sex := NULL;
  END IF;

  -- Safe date_of_birth extraction
  BEGIN
    v_dob := (NEW.raw_user_meta_data->>'date_of_birth')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
  END;

  -- 4. Validate mandatory registration fields
  IF v_full_name = '' OR v_usn = '' OR v_phone = '' OR v_branch = '' OR v_academic_year IS NULL OR v_sex IS NULL OR v_dob IS NULL THEN
    RAISE EXCEPTION 'Missing required registration details in user metadata.';
  END IF;

  -- 5. Validate academic year boundary (1 to 4)
  IF v_academic_year < 1 OR v_academic_year > 4 THEN
    RAISE EXCEPTION 'Academic year must be between 1 and 4.';
  END IF;

  -- 6. Validate minimum age 15
  IF (v_dob + INTERVAL '15 years') > CURRENT_DATE THEN
    RAISE EXCEPTION 'Student must be at least 15 years of age to register.';
  END IF;

  -- 7. Validate phone number regex format (+91 followed by 10 digits starting with 6-9)
  IF NOT (v_phone ~ '^\+91[6-9][0-9]{9}$') THEN
    RAISE EXCEPTION 'Phone number must follow +91XXXXXXXXXX format.';
  END IF;

  -- 8. Explicit uniqueness check on USN before insert
  IF EXISTS (SELECT 1 FROM public.profiles WHERE usn = v_usn AND id <> NEW.id) THEN
    RAISE EXCEPTION 'A student profile with USN % is already registered.', v_usn USING ERRCODE = '23505';
  END IF;

  -- 9. Insert profile atomically in draft status
  INSERT INTO public.profiles (
    id, email, full_name, usn, phone, branch, academic_year, sex, date_of_birth, registration_status
  ) VALUES (
    NEW.id, NEW.email, v_full_name, v_usn, v_phone, v_branch, v_academic_year, v_sex, v_dob, 'draft'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Ensure the trigger on auth.users is active and calls handle_new_auth_user()
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
