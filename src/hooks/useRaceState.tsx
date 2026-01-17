import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const RACE_STATE_ID = "00000000-0000-0000-0000-000000000001";
const TOTAL_RACE_TIME_MS = 35 * 60 * 1000; // 35 minutes in milliseconds

/**
 * Server-Authoritative Timer Implementation
 *
 * PRINCIPLE: "Send timestamps, not ticks. Calculate time, don't count it."
 *
 * How it works:
 * 1. Server stores `started_at_ms` (server timestamp when race started)
 * 2. On connect, client fetches server time and calculates `clockOffset`
 * 3. Client calculates remaining time using:
 *    elapsedMs = correctedNow - startedAtMs - pausedOffsetMs
 *    where correctedNow = Date.now() + clockOffset
 *
 * Why this avoids drift:
 * - All clients derive time from the SAME server timestamp
 * - Clock offset compensates for local clock differences
 * - No per-second server broadcasts (only state changes: start, stop, lap, reset)
 * - Late joiners immediately see correct time
 */

interface RaceState {
  isRunning: boolean;
  startedAtMs: number | null;  // Server timestamp when race started (milliseconds)
  pausedOffsetMs: number;      // Accumulated pause time (milliseconds)
  currentLap: number;
  lapTimes: number[];          // Lap times in seconds
  totalRaceTimeMs: number;     // Total race duration in milliseconds
}

interface DbRaceState {
  id: string;
  is_running: boolean;
  started_at_ms: number | null;
  paused_offset_ms: number;
  elapsed_seconds: number; // Legacy field, kept for backwards compatibility
  start_time: string | null; // Legacy field
  lap_times: number[];
  total_race_time: number;
  updated_at: string;
}

export const useRaceState = (isAdmin: boolean) => {
  const [raceState, setRaceState] = useState<RaceState>({
    isRunning: false,
    startedAtMs: null,
    pausedOffsetMs: 0,
    currentLap: 0,
    lapTimes: [],
    totalRaceTimeMs: TOTAL_RACE_TIME_MS,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Clock offset: serverTime - localTime
  // To get server-corrected time: Date.now() + clockOffset
  const clockOffsetRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Sync clock with server on initial load
   * This establishes the offset between local clock and server clock
   */
  useEffect(() => {
    const syncClock = async () => {
      try {
        const localBefore = Date.now();

        // Call server function to get server time in milliseconds
        const { data, error } = await supabase.rpc("get_server_time_ms");

        const localAfter = Date.now();

        if (error) {
          console.warn("Failed to sync clock with server:", error);
          return;
        }

        // Estimate server time at the midpoint of our request
        const roundTripTime = localAfter - localBefore;
        const localMidpoint = localBefore + roundTripTime / 2;
        const serverTimeMs = Number(data);

        // clockOffset = serverTime - localTime
        // To get corrected time: Date.now() + clockOffset
        clockOffsetRef.current = serverTimeMs - localMidpoint;

        console.log(`Clock synced: offset=${clockOffsetRef.current}ms, RTT=${roundTripTime}ms`);
      } catch (err) {
        console.warn("Clock sync error:", err);
      }
    };

    syncClock();
  }, []);

  /**
   * Fetch initial state from database
   */
  useEffect(() => {
    const fetchState = async () => {
      const { data, error } = await supabase
        .from("race_state")
        .select("*")
        .eq("id", RACE_STATE_ID)
        .single();

      if (data && !error) {
        const dbData = data as DbRaceState;
        const lapTimesArray = Array.isArray(dbData.lap_times) ? dbData.lap_times : [];

        setRaceState({
          isRunning: dbData.is_running,
          startedAtMs: dbData.started_at_ms,
          pausedOffsetMs: dbData.paused_offset_ms ?? 0,
          currentLap: lapTimesArray.length,
          lapTimes: lapTimesArray,
          totalRaceTimeMs: dbData.total_race_time * 1000,
        });
      }
      setIsLoading(false);
    };

    fetchState();
  }, []);

  /**
   * Subscribe to real-time state changes
   * Only state CHANGES are broadcast (start, stop, lap, reset)
   * NOT per-second tick updates
   */
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
          const dbData = payload.new as DbRaceState;
          if (dbData) {
            const lapTimesArray = Array.isArray(dbData.lap_times) ? dbData.lap_times : [];

            setRaceState({
              isRunning: dbData.is_running,
              startedAtMs: dbData.started_at_ms,
              pausedOffsetMs: dbData.paused_offset_ms ?? 0,
              currentLap: lapTimesArray.length,
              lapTimes: lapTimesArray,
              totalRaceTimeMs: dbData.total_race_time * 1000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /**
   * Calculate elapsed time locally using server timestamp
   *
   * This runs on every animation frame when the race is running.
   * All time calculation is derived from the server's started_at_ms timestamp.
   *
   * Formula: elapsedMs = correctedNow - startedAtMs - pausedOffsetMs
   * where correctedNow = Date.now() + clockOffset
   */
  useEffect(() => {
    if (!raceState.isRunning || raceState.startedAtMs === null) {
      // Race not running - stop animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const updateElapsed = () => {
      // Get server-corrected current time
      const correctedNow = Date.now() + clockOffsetRef.current;

      // Calculate elapsed time from server timestamp
      const elapsed = correctedNow - raceState.startedAtMs! - raceState.pausedOffsetMs;

      setElapsedMs(Math.max(0, elapsed));

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(updateElapsed);
    };

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(updateElapsed);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [raceState.isRunning, raceState.startedAtMs, raceState.pausedOffsetMs]);

  /**
   * Admin action: Start or Stop the race
   * Only updates server state - all clients receive via realtime subscription
   */
  const startStop = useCallback(async () => {
    if (!isAdmin) return;

    const newIsRunning = !raceState.isRunning;

    if (newIsRunning) {
      // Starting race - set server timestamp
      // Use server function to ensure we get server time, not client time
      const { data: serverTimeMs } = await supabase.rpc("get_server_time_ms");

      await supabase
        .from("race_state")
        .update({
          is_running: true,
          started_at_ms: Number(serverTimeMs),
          paused_offset_ms: 0,
          elapsed_seconds: 0, // Reset legacy field
          lap_times: [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", RACE_STATE_ID);
    } else {
      // Stopping race
      await supabase
        .from("race_state")
        .update({
          is_running: false,
          started_at_ms: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", RACE_STATE_ID);
    }
  }, [isAdmin, raceState.isRunning]);

  /**
   * Admin action: Record a lap
   */
  const recordLap = useCallback(async () => {
    if (!isAdmin || !raceState.isRunning) return;

    const totalElapsedSec = Math.floor(elapsedMs / 1000);
    const previousLapsTotal = raceState.lapTimes.reduce((a, b) => a + b, 0);
    const currentLapTime = totalElapsedSec - previousLapsTotal;

    const newLapTimes = [...raceState.lapTimes, currentLapTime];

    await supabase
      .from("race_state")
      .update({
        lap_times: newLapTimes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", RACE_STATE_ID);
  }, [isAdmin, raceState.isRunning, raceState.lapTimes, elapsedMs]);

  /**
   * Admin action: Reset the race
   */
  const reset = useCallback(async () => {
    if (!isAdmin) return;

    await supabase
      .from("race_state")
      .update({
        is_running: false,
        started_at_ms: null,
        paused_offset_ms: 0,
        elapsed_seconds: 0,
        lap_times: [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", RACE_STATE_ID);

    setElapsedMs(0);
  }, [isAdmin]);

  // Convert elapsed milliseconds to seconds for display
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const timeLeft = Math.max(0, Math.floor(raceState.totalRaceTimeMs / 1000) - elapsedSeconds);
  const previousLapsTotal = raceState.lapTimes.reduce((a, b) => a + b, 0);
  const currentLapElapsed = elapsedSeconds - previousLapsTotal;

  return {
    timeLeft,
    isRunning: raceState.isRunning,
    currentLap: raceState.lapTimes.length,
    lapTimes: raceState.lapTimes,
    currentLapElapsed,
    totalRaceTime: Math.floor(raceState.totalRaceTimeMs / 1000),
    isLoading,
    startStop,
    recordLap,
    reset,
  };
};
