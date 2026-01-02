import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const GPS_TELEMETRY_ID = "00000000-0000-0000-0000-000000000002";

interface GpsTelemetry {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  accuracy: number;
  batteryLevel: number;
  signalStrength: number;
  isOnline: boolean;
  timestamp: string;
}

export const useGpsTelemetry = () => {
  const [telemetry, setTelemetry] = useState<GpsTelemetry>({
    latitude: 0,
    longitude: 0,
    speed: 0,
    heading: 0,
    accuracy: 0,
    batteryLevel: 100,
    signalStrength: 0,
    isOnline: false,
    timestamp: new Date().toISOString(),
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial state
  useEffect(() => {
    const fetchState = async () => {
      const { data, error } = await supabase
        .from("gps_telemetry")
        .select("*")
        .eq("id", GPS_TELEMETRY_ID)
        .single();

      if (data && !error) {
        setTelemetry({
          latitude: data.latitude,
          longitude: data.longitude,
          speed: data.speed,
          heading: data.heading,
          accuracy: data.accuracy,
          batteryLevel: data.battery_level,
          signalStrength: data.signal_strength,
          isOnline: data.is_online,
          timestamp: data.timestamp,
        });
      }
      setIsLoading(false);
    };

    fetchState();
  }, []);

  // Subscribe to real-time changes
  useEffect(() => {
    const channel = supabase
      .channel("gps_telemetry_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gps_telemetry",
          filter: `id=eq.${GPS_TELEMETRY_ID}`,
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData) {
            setTelemetry({
              latitude: newData.latitude,
              longitude: newData.longitude,
              speed: newData.speed,
              heading: newData.heading,
              accuracy: newData.accuracy,
              batteryLevel: newData.battery_level,
              signalStrength: newData.signal_strength,
              isOnline: newData.is_online,
              timestamp: newData.timestamp,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    position: { lat: telemetry.latitude, lng: telemetry.longitude },
    speed: telemetry.speed,
    heading: telemetry.heading,
    accuracy: telemetry.accuracy,
    batteryLevel: telemetry.batteryLevel,
    signalStrength: telemetry.signalStrength,
    isOnline: telemetry.isOnline,
    isLoading,
  };
};
