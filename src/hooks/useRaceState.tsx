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

        setDisplayElapsed(data.elapsed_seconds);

        if (data.is_running && data.start_time) {
          startTimeRef.current = new Date(data.start_time).getTime();
          baseElapsedRef.current = data.elapsed_seconds;
        }
      }
      setIsLoading(false);
    };

    fetchState();
  }, []);

  // Subscribe to real-time changes (for non-admin to receive updates, and for state sync)
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

            // For non-admin: sync display to server value
            if (!isAdmin) {
              setDisplayElapsed(newData.elapsed_seconds);
            }

            // When race starts, store the start time
            if (newData.is_running && newData.start_time) {
              startTimeRef.current = new Date(newData.start_time).getTime();
              baseElapsedRef.current = newData.elapsed_seconds;
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

  // Main timer effect - handles both display updates and admin broadcasts
  useEffect(() => {
    if (!raceState.isRunning) {
      // Clear all timers when stopped
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

    // Wait for startTime to be set
    if (!startTimeRef.current) {
      return;
    }

    const startTime = startTimeRef.current;
    const baseElapsed = baseElapsedRef.current;

    // Update display every second
    const updateDisplay = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000) + baseElapsed;
      setDisplayElapsed(elapsed);
    };

    // Initial update
    updateDisplay();

    // Update display every second
    timerRef.current = setInterval(updateDisplay, 1000);

    // Admin also broadcasts to database
    if (isAdmin) {
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

      // Broadcast every second (offset by 500ms from display updates to reduce conflicts)
      setTimeout(() => {
        broadcast();
        broadcastRef.current = setInterval(broadcast, 1000);
      }, 500);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (broadcastRef.current) {
        clearInterval(broadcastRef.current);
        broadcastRef.current = null;
      }
    };
  }, [raceState.isRunning, isAdmin]);

  // Admin actions
  const startStop = useCallback(async () => {
    if (!isAdmin) return;

    const newIsRunning = !raceState.isRunning;

    if (newIsRunning) {
      // Starting - use server function to set start_time with server's NOW()
      baseElapsedRef.current = raceState.elapsedSeconds;
      await supabase.rpc("start_race");
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
  }, [isAdmin, raceState.isRunning, raceState.elapsedSeconds]);

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
