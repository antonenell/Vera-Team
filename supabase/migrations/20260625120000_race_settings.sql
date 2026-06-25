-- Admin-editable race settings: number of laps and a safety-time buffer.
-- The race duration already lives in race_state.total_race_time (seconds).
-- The per-lap time budget is derived as (total_race_time - safety_seconds) / total_laps.

ALTER TABLE public.race_state
  ADD COLUMN IF NOT EXISTS total_laps integer NOT NULL DEFAULT 11,
  ADD COLUMN IF NOT EXISTS safety_seconds integer NOT NULL DEFAULT 60;
