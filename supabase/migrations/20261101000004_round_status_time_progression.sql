-- Migration: 20261101000004_round_status_time_progression.sql
-- Rounds are created as 'scheduled' and submit_round_milestone requires status 'open',
-- but nothing ever advanced a round's status with time (only pause/resume touched it).
-- Result: no team could ever submit round work.
--
-- refresh_round_statuses advances rounds strictly by their own schedule:
--   scheduled -> open        once start_at has passed (and end_at has not)
--   scheduled/open -> evaluation once end_at has passed
-- Paused and completed rounds are never touched, so manual pause/finalize still win.
-- It is idempotent and only moves forward, so it is safe for any signed-in user to
-- trigger (pages and submission actions call it before reading/submitting).

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

-- Bring existing rounds up to date.
SELECT public.refresh_round_statuses(NULL);
