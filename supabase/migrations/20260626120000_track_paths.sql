-- Track maker: one recorded/cleaned path per track (silesia-ring, stora-holm, …).
-- path = ordered JSONB array of [lng, lat] pairs (Mapbox coordinate order).
-- Idempotent (Anton applies migrations by hand). Anyone can read; only admins write.

CREATE TABLE IF NOT EXISTS public.track_paths (
  track_id   text PRIMARY KEY,
  path       jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.track_paths ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read track paths" ON public.track_paths;
CREATE POLICY "Anyone can read track paths"
  ON public.track_paths FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can insert track paths" ON public.track_paths;
CREATE POLICY "Admins can insert track paths"
  ON public.track_paths FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update track paths" ON public.track_paths;
CREATE POLICY "Admins can update track paths"
  ON public.track_paths FOR UPDATE USING (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete track paths" ON public.track_paths;
CREATE POLICY "Admins can delete track paths"
  ON public.track_paths FOR DELETE USING (has_role(auth.uid(), 'admin'));

-- Realtime: payloads need the full row so all viewers get the new path.
ALTER TABLE public.track_paths REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.track_paths;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
