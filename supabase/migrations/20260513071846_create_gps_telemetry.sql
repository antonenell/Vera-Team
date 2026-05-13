-- Create gps_telemetry table
-- This table was missing from migrations (originally created via Supabase Studio).
-- Recovered from cluster backup db_cluster-28-01-2026@01-24-16.backup.

CREATE TABLE IF NOT EXISTS public.gps_telemetry (
    id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000002'::uuid,
    latitude double precision NOT NULL DEFAULT 0,
    longitude double precision NOT NULL DEFAULT 0,
    speed double precision DEFAULT 0,
    heading double precision DEFAULT 0,
    accuracy double precision DEFAULT 0,
    battery_level integer DEFAULT 100,
    signal_strength integer DEFAULT 0,
    is_online boolean DEFAULT false,
    "timestamp" timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.gps_telemetry ENABLE ROW LEVEL SECURITY;

-- Driver device (Android app, anon role) needs to write GPS; spectators (anon) need to read
CREATE POLICY "Anyone can view GPS telemetry"
ON public.gps_telemetry
FOR SELECT
TO authenticated, anon
USING (true);

CREATE POLICY "Anyone can update GPS telemetry"
ON public.gps_telemetry
FOR UPDATE
TO authenticated, anon
USING (true)
WITH CHECK (true);

-- Full row payloads in realtime updates (needed for accurate diffing on subscribers)
ALTER TABLE public.gps_telemetry REPLICA IDENTITY FULL;

-- Enable realtime subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.gps_telemetry;

-- Seed the single live-state row with the fixed id the Android app updates
INSERT INTO public.gps_telemetry (id) VALUES ('00000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;
