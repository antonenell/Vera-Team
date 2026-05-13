-- Add paused_at_ms column to support true pause/resume on the race timer.
-- When the race is paused, the timer freezes at (paused_at_ms - started_at_ms - paused_offset_ms).
-- When resumed, paused_offset_ms is incremented by (now - paused_at_ms) and paused_at_ms is cleared.

ALTER TABLE public.race_state
ADD COLUMN IF NOT EXISTS paused_at_ms BIGINT;
