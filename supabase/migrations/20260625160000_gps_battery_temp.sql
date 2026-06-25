-- Phone/cabin temperature: the driver phone reports its battery temperature
-- (the only thermometer accessible on a normal Android device) so the web
-- dashboard can show how hot the phone/cabin is getting.
ALTER TABLE public.gps_telemetry
  ADD COLUMN IF NOT EXISTS battery_temp double precision;
