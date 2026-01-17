-- Migration: Server-Authoritative Timer
--
-- This migration changes the timer from a "ticking counter" model to a "timestamp" model.
-- Instead of storing elapsed_seconds that gets updated every second, we store:
--   - started_at_ms: Server timestamp (in milliseconds) when race was started
--   - paused_offset_ms: Accumulated milliseconds spent paused (for pause/resume support)
--
-- Clients calculate remaining time using:
--   remainingMs = durationMs - (correctedNow - startedAtMs - pausedOffsetMs)
--
-- This avoids clock drift because all clients derive time from the same server timestamp.

-- Add new columns for timestamp-based timer
ALTER TABLE public.race_state
ADD COLUMN IF NOT EXISTS started_at_ms BIGINT,
ADD COLUMN IF NOT EXISTS paused_offset_ms BIGINT NOT NULL DEFAULT 0;

-- Create a function to get server time in milliseconds
-- This allows clients to calculate their clock offset
CREATE OR REPLACE FUNCTION public.get_server_time_ms()
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT
$$;

-- Grant execute permission to anonymous and authenticated users
GRANT EXECUTE ON FUNCTION public.get_server_time_ms() TO anon, authenticated;
