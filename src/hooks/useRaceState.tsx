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
  const [displayElapsed, setDisplayElapsed] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const broadcastRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const baseElapsedRef = useRef<number>(0);

  // For spectator interpolation
  const spectatorBaseElapsedRef = useRef<number>(0);
  const spectatorBaseTimeRef = useRef<number>(Date.now());

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

        // Set display to current DB value
        // For spectators: add 1 second to compensate for network delay
        const displayValue = !isAdmin && data.is_running
          ? data.elapsed_seconds + 1
          : data.elapsed_seconds;
        setDisplayElapsed(displayValue);

        // Set spectator base for interpolation
        if (!isAdmin) {
          spectatorBaseElapsedRef.current = displayValue;
          spectatorBaseTimeRef.current = Date.now();
        }

        // Only admin needs to track start time for local calculation
        if (isAdmin && data.is_running && data.start_time) {
          startTimeRef.current = new Date(data.start_time).getTime();
          baseElapsedRef.current = 0; // Admin calculates from start_time, not from elapsed_seconds
        }
      }
      setIsLoading(false);
    };

    fetchState();
  }, [isAdmin]);

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

            // NON-ADMIN: Set base for interpolation (add 1 second to compensate for network delay)
            if (!isAdmin) {
              const compensatedElapsed = newData.elapsed_seconds + 1;
              spectatorBaseElapsedRef.current = compensatedElapsed;
              spectatorBaseTimeRef.current = Date.now();
              setDisplayElapsed(compensatedElapsed);
            }

            // ADMIN: Update start time ref when race starts
            if (isAdmin && newData.is_running && newData.start_time) {
              startTimeRef.current = new Date(newData.start_time).getTime();
              baseElapsedRef.current = 0;
            } else if (!newData.is_running) {
              startTimeRef.current = null;
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  // SPECTATOR ONLY: Local interpolation timer between server updates
  useEffect(() => {
    if (isAdmin) return;
    if (!raceState.isRunning) {
      return;
    }

    // Interpolate locally between server updates
    const interpolate = () => {
      const now = Date.now();
      const timeSinceUpdate = Math.floor((now - spectatorBaseTimeRef.current) / 1000);
      const interpolatedElapsed = spectatorBaseElapsedRef.current + timeSinceUpdate;
      setDisplayElapsed(interpolatedElapsed);
    };

    // Update display every second
    const intervalId = setInterval(interpolate, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isAdmin, raceState.isRunning]);

  // ADMIN ONLY: Timer for display updates and database broadcasts
  useEffect(() => {
    // Only admin runs local timer
    if (!isAdmin) {
      return;
    }

    if (!raceState.isRunning) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (broadcastRef.current) {
        clearInterval(broadcastRef.current);
        broadcastRef.current = null;
      }
      return;
    }

    if (!startTimeRef.current) {
      return;
    }

    const startTime = startTimeRef.current;

    // Update display every second
    const updateDisplay = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      setDisplayElapsed(elapsed);
    };

    // Initial update
    updateDisplay();

    // Update display every second
    timerRef.current = setInterval(updateDisplay, 1000);

    // Broadcast to database every second
    const broadcast = async () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);

      await supabase
        .from("race_state")
        .update({
          elapsed_seconds: elapsed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", RACE_STATE_ID);
    };

    // Start broadcasting (offset by 500ms)
    const broadcastTimeout = setTimeout(() => {
      broadcast();
      broadcastRef.current = setInterval(broadcast, 1000);
    }, 500);

    return () => {
      clearTimeout(broadcastTimeout);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (broadcastRef.current) {
        clearInterval(broadcastRef.current);
        broadcastRef.current = null;
      }
    };
  }, [isAdmin, raceState.isRunning]);

  // Admin actions
  const startStop = useCallback(async () => {
    if (!isAdmin) return;

    const newIsRunning = !raceState.isRunning;

    if (newIsRunning) {
      // Starting - reset and start the race
      const now = new Date().toISOString();
      await supabase
        .from("race_state")
        .update({
          is_running: true,
          start_time: now,
          elapsed_seconds: 0,
          lap_times: [],
          updated_at: now,
        })
        .eq("id", RACE_STATE_ID);
    } else {
      // Stopping
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

    const totalElapsed = displayElapsed;
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
  }, [isAdmin, raceState.isRunning, raceState.lapTimes, displayElapsed]);

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

    baseElapsedRef.current = 0;
    startTimeRef.current = null;
    setDisplayElapsed(0);
  }, [isAdmin]);

  const timeLeft = Math.max(0, raceState.totalRaceTime - displayElapsed);
  const previousLapsTotal = raceState.lapTimes.reduce((a, b) => a + b, 0);
  const currentLapElapsed = displayElapsed - previousLapsTotal;

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
