-- Make track flags fully position-aware so admins can place / relocate / delete
-- them directly on the map. Previously flag positions were hardcoded in the web
-- client and only the flag colour lived in the database.

-- 1. Add position columns. Nullable so legacy colour-only rows don't break the
--    migration; the web client only renders flags that have coordinates.
ALTER TABLE public.track_flags
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS lat double precision;

-- 2. Allow admins to delete flags. Previously only SELECT / INSERT / UPDATE
--    policies existed, so deletes were silently blocked by RLS.
DROP POLICY IF EXISTS "Admins can delete track flags" ON public.track_flags;
CREATE POLICY "Admins can delete track flags"
ON public.track_flags
FOR DELETE
USING (has_role(auth.uid(), 'admin'));

-- 3. Emit the full old row on DELETE/UPDATE via realtime so the client receives
--    flag_id (the default replica identity only ships the primary key `id`).
ALTER TABLE public.track_flags REPLICA IDENTITY FULL;

-- 4. Seed the four historical Stora Holm flags with their positions so nothing
--    disappears for existing deployments. This is a one-time backfill: the
--    WHERE guard fills positions only for rows that don't have them yet, so a
--    re-run never overwrites a position an admin has since dragged.
INSERT INTO public.track_flags (track_id, flag_id, color, lng, lat)
VALUES
  ('stora-holm', '1', 'grey', 11.9141, 57.7771),
  ('stora-holm', '2', 'grey', 11.9220, 57.7765),
  ('stora-holm', '3', 'grey', 11.9196, 57.7751),
  ('stora-holm', '4', 'grey', 11.9165, 57.7760)
ON CONFLICT (track_id, flag_id)
DO UPDATE SET lng = EXCLUDED.lng, lat = EXCLUDED.lat
WHERE track_flags.lng IS NULL OR track_flags.lat IS NULL;
