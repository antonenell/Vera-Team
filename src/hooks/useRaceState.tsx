import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const RACE_STATE_ID = "00000000-0000-0000-0000-000000000001";
const TOTAL_RACE_TIME = 35 * 60; // 35 minutes

interface RaceState {
  isRunning: boolean;
  startTime: string | null;
  elapsedSeconds: number;
  currentLap: number;
  lapTimes: number[];
  totalRaceTime: number;
}

export const useRaceState = (isAdmin: boolean) => {
  const [raceState, setRaceState] = useState<RaceState>({
    isRunning: false,
    startTime: null,
    elapsedSeconds: 0,
    currentLap: 0,
    lapTimes: [],
    totalRaceTime: TOTAL_RACE_TIME,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());
  const [lastElapsedFromServer, setLastElapsedFromServer] = useState<number>(0);
  const [tick, setTick] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastRef = useRef<NodeJS.Timeout | null>(null);
  const initialElapsedRef = useRef<number>(0); // Store elapsed at start time

  // Fetch initial state
  useEffect(() => {
    const fetchState = async () => {
      const { data, error } = await supabase
        .from("race_state")
        .select("*")
        .eq("id", RACE_STATE_ID)
        .single();

      if (data && !error) {
        const lapTimesArray = Array.isArray(data.lap_times)
          ? data.lap_times
          : [];

        setRaceState({
          isRunning: data.is_running,
          startTime: data.start_time,
          elapsedSeconds: data.elapsed_seconds,
          currentLap: lapTimesArray.length,
          lapTimes: lapTimesArray,
          totalRaceTime: data.total_race_time,
        });

        if (data.is_running) {
          initialElapsedRef.current = data.elapsed_seconds;
          setLastElapsedFromServer(data.elapsed_seconds);
          setLastUpdateTime(Date.now());
        }
      }
      setIsLoading(false);
    };

    fetchState();
  }, []);

  // Subscribe to real-time changes
  useEffect(() => {
    const channel = supabase
      .channel("race_state_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "race_state",
          filter: `id=eq.${RACE_STATE_ID}`,
        },
        (payload) => {
          const newData = payload.new as any;
          if (newData) {
            const lapTimesArray = Array.isArray(newData.lap_times)
              ? newData.lap_times
              : [];

            setRaceState({
              isRunning: newData.is_running,
              startTime: newData.start_time,
              elapsedSeconds: newData.elapsed_seconds,
              currentLap: lapTimesArray.length,
              lapTimes: lapTimesArray,
              totalRaceTime: newData.total_race_time,
            });

            // Track when we received an update and what value (for interpolation)
            setLastUpdateTime(Date.now());
            setLastElapsedFromServer(newData.elapsed_seconds);

            // Store initial elapsed when race starts
            if (newData.is_running && newData.start_time) {
              initialElapsedRef.current = newData.elapsed_seconds;
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Admin: Broadcast elapsed seconds to database every second while running
  useEffect(() => {
    if (!isAdmin || !raceState.isRunning || !raceState.startTime) {
      if (broadcastRef.current) {
        clearInterval(broadcastRef.current);
        broadcastRef.current = null;
      }
      return;
    }

    const startTime = new Date(raceState.startTime).getTime();
    const baseElapsed = initialElapsedRef.current;

    // Broadcast immediately, then every second
    const broadcast = async () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000) + baseElapsed;

      await supabase
        .from("race_state")
        .update({
          elapsed_seconds: elapsed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", RACE_STATE_ID);
    };

    broadcast(); // Initial broadcast
    broadcastRef.current = setInterval(broadcast, 1000);

    return () => {
      if (broadcastRef.current) {
        clearInterval(broadcastRef.current);
        broadcastRef.current = null;
      }
    };
  }, [isAdmin, raceState.isRunning, raceState.startTime]);

  // Local tick for smooth display (both admin and non-admin need this)
  useEffect(() => {
    if (!raceState.isRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Force re-render every second for smooth countdown display
    timerRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [raceState.isRunning]);

  // Admin actions
  const startStop = useCallback(async () => {
    if (!isAdmin) return;

    const newIsRunning = !raceState.isRunning;

    if (newIsRunning) {
      // Starting - use server function to set start_time with server's NOW()
      await supabase.rpc("start_race");
    } else {
      // Stopping - elapsed_seconds is already being updated by broadcast
      // Just stop the race and clear start_time
      const now = new Date().toISOString();
      await supabase
        .from("race_state")
        .update({
          is_running: false,
          start_time: null,
          updated_at: now,
        })
        .eq("id", RACE_STATE_ID);
    }
  }, [isAdmin, raceState.isRunning]);

  const recordLap = useCallback(async () => {
    if (!isAdmin || !raceState.isRunning) return;

    // Use the current elapsed_seconds from state (which is being broadcast)
    const totalElapsed = raceState.elapsedSeconds;
    const previousLapsTotal = raceState.lapTimes.reduce((a, b) => a + b, 0);
    const currentLapTime = totalElapsed - previousLapsTotal;

    const newLapTimes = [...raceState.lapTimes, currentLapTime];
    const now = new Date().toISOString();

    await supabase
      .from("race_state")
      .update({
        lap_times: newLapTimes,
        updated_at: now,
      })
      .eq("id", RACE_STATE_ID);
  }, [isAdmin, raceState.isRunning, raceState.lapTimes, raceState.elapsedSeconds]);

  const reset = useCallback(async () => {
    if (!isAdmin) return;

    const now = new Date().toISOString();
    await supabase
      .from("race_state")
      .update({
        is_running: false,
        start_time: null,
        elapsed_seconds: 0,
        lap_times: [],
        updated_at: now,
      })
      .eq("id", RACE_STATE_ID);

    initialElapsedRef.current = 0;
  }, [isAdmin]);

  // Calculate elapsed seconds for display
  const getDisplayElapsed = (): number => {
    if (!raceState.isRunning) {
      return raceState.elapsedSeconds;
    }

    if (isAdmin && raceState.startTime) {
      // Admin calculates locally (is the source of truth)
      const now = Date.now();
      const startTime = new Date(raceState.startTime).getTime();
      return Math.floor((now - startTime) / 1000) + initialElapsedRef.current;
    }

    // Non-admin: interpolate from last server value for smooth counting
    const timeSinceUpdate = Math.floor((Date.now() - lastUpdateTime) / 1000);

    // Add seconds since last update to the last known server value
    // This creates smooth 1-second counting between server updates
    return lastElapsedFromServer + timeSinceUpdate;
  };

  const totalElapsed = getDisplayElapsed();
  const timeLeft = Math.max(0, raceState.totalRaceTime - totalElapsed);

  // Calculate current lap elapsed time
  const previousLapsTotal = raceState.lapTimes.reduce((a, b) => a + b, 0);
  const currentLapElapsed = totalElapsed - previousLapsTotal;

  return {
    timeLeft,
    isRunning: raceState.isRunning,
    currentLap: raceState.lapTimes.length,
    lapTimes: raceState.lapTimes,
    currentLapElapsed,
    totalRaceTime: raceState.totalRaceTime,
    isLoading,
    startStop,
    recordLap,
    reset,
  };
};
