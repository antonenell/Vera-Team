-- Create a table to store the live race state
CREATE TABLE public.race_state (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    is_running boolean NOT NULL DEFAULT false,
    start_time timestamp with time zone,
    elapsed_seconds integer NOT NULL DEFAULT 0,
    current_lap integer NOT NULL DEFAULT 1,
    lap_times integer[] NOT NULL DEFAULT '{}',
    total_race_time integer NOT NULL DEFAULT 2100,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.race_state ENABLE ROW LEVEL SECURITY;

-- Anyone can read the race state (spectators need this)
CREATE POLICY "Anyone can read race state"
ON public.race_state
FOR SELECT
USING (true);

-- Only admins can modify race state
CREATE POLICY "Admins can update race state"
ON public.race_state
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert race state"
ON public.race_state
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Insert a default race state row
INSERT INTO public.race_state (id, is_running, elapsed_seconds, current_lap, lap_times, total_race_time)
VALUES ('00000000-0000-0000-0000-000000000001', false, 0, 1, '{}', 2100);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.race_state;

-- Create table for track flags state
CREATE TABLE public.track_flags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id text NOT NULL,
    flag_id text NOT NULL,
    color text NOT NULL DEFAULT 'grey',
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(track_id, flag_id)
);

-- Enable RLS
ALTER TABLE public.track_flags ENABLE ROW LEVEL SECURITY;

-- Anyone can read flags
CREATE POLICY "Anyone can read track flags"
ON public.track_flags
FOR SELECT
USING (true);

-- Only admins can modify flags
CREATE POLICY "Admins can update track flags"
ON public.track_flags
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert track flags"
ON public.track_flags
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Enable realtime for flags
ALTER PUBLICATION supabase_realtime ADD TABLE public.track_flags;