import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { targetRaceTime, targetLapTime } from "@/lib/raceMath";

const RACE_STATE_ID = "00000000-0000-0000-0000-000000000001";
const TOTAL_RACE_TIME_MS = 35 * 60 * 1000; // 35 minutes in milliseconds
const DEFAULT_TOTAL_LAPS = 11;
const DEFAULT_SAFETY_SECONDS = 60;

/**
 * Server-Authoritative Timer with Sub-100ms Synchronization
 *
 * PRINCIPLE: "Send timestamps, not ticks. Calculate time, don't count it."
 *
 * Key synchronization techniques:
 * 1. High-resolution clock sync with RTT compensation
 * 2. Multiple sync attempts for accuracy
 * 3. Resync on visibility change and state updates
 * 4. All time stored in milliseconds, rounded only at display
 * 5. remainingMs recalculated on EVERY frame, never stored/incremented
 *
 * Formula (computed every frame):
 *   remainingMs = durationMs - (correctedNow - startedAtMs - pausedOffsetMs)
 *   where correctedNow = Date.now() + clockOffset
 */

interface RaceState {
  isRunning: boolean;
  startedAtMs: number | null;
  pausedAtMs: number | null;
  pausedOffsetMs: number;
  lapTimes: number[];
  totalRaceTimeMs: number;
  totalLaps: number;
  safetySeconds: number;
}

interface DbRaceState {
  id: string;
  is_running: boolean;
  started_at_ms: number | null;
  paused_at_ms: number | null;
  paused_offset_ms: number;
  elapsed_seconds: number;
  start_time: string | null;
  lap_times: number[];
  total_race_time: number;
  total_laps: number | null;
  safety_seconds: number | null;
  updated_at: string;
}

/**
 * Perform a single clock sync measurement with RTT compensation.
 * Returns the calculated offset or null on error.
 */
async function measureClockOffset(): Promise<{ offset: number; rtt: number } | null> {
  try {
    const localBefore = Date.now();
    const { data, error } = await supabase.rpc("get_server_time_ms");
    const localAfter = Date.now();

    if (error || data === null) return null;

    const rtt = localAfter - localBefore;
    // Server time at midpoint of request (compensates for network latency)
    const localMidpoint = localBefore + rtt / 2;
    const serverTimeMs = Number(data);
    const offset = serverTimeMs - localMidpoint;

    return { offset, rtt };
  } catch {
    return null;
  }
}

/**
 * Perform multiple clock sync measurements and use the one with lowest RTT
 * for highest accuracy.
 */
async function syncClock(attempts: number = 3): Promise<number> {
  const results: { offset: number; rtt: number }[] = [];

  for (let i = 0; i < attempts; i++) {
    const result = await measureClockOffset();
    if (result) {
      results.push(result);
    }
    // Small delay between attempts
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  if (results.length === 0) {
    console.warn("Clock sync failed, using local time");
    return 0;
  }

  // Use the measurement with lowest RTT (most accurate)
  const best = results.reduce((a, b) => (a.rtt < b.rtt ? a : b));
  console.log(
    `Clock synced: offset=${best.offset}ms, RTT=${best.rtt}ms (${results.length} samples)`
  );
  return best.offset;
}

export const useRaceState = (isAdmin: boolean) => {
  // Race state from server (immutable between updates)
  const raceStateRef = useRef<RaceState>({
    isRunning: false,
    startedAtMs: null,
    pausedAtMs: null,
    pausedOffsetMs: 0,
    lapTimes: [],
    totalRaceTimeMs: TOTAL_RACE_TIME_MS,
    totalLaps: DEFAULT_TOTAL_LAPS,
    safetySeconds: DEFAULT_SAFETY_SECONDS,
  });

  const [isLoading, setIsLoading] = useState(true);

  // Clock offset for synchronization
  const clockOffsetRef = useRef<number>(0);
  const lastSyncTimeRef = useRef<number>(0);

  // Force re-render trigger (for time display updates)
  const [, forceUpdate] = useState(0);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Calculate remaining time in milliseconds.
   * This is the AUTHORITATIVE formula - called on every render frame.
   * Never stores the result, always recalculates from timestamps.
   */
  const getRemainingMs = useCallback((): number => {
    const state = raceStateRef.current;
    if (state.startedAtMs === null) {
      // Idle: full duration shown
      return state.totalRaceTimeMs;
    }

    // While paused we freeze "now" at the pause timestamp so the timer doesn't tick down.
    const referenceNow = state.isRunning
      ? Date.now() + clockOffsetRef.current
      : state.pausedAtMs ?? state.startedAtMs;

    const elapsedMs = referenceNow - state.startedAtMs - state.pausedOffsetMs;
    const remainingMs = state.totalRaceTimeMs - elapsedMs;

    return Math.max(0, remainingMs);
  }, []);

  /**
   * Calculate elapsed time in milliseconds.
   */
  const getElapsedMs = useCallback((): number => {
    const state = raceStateRef.current;
    if (state.startedAtMs === null) {
      return 0;
    }

    const referenceNow = state.isRunning
      ? Date.now() + clockOffsetRef.current
      : state.pausedAtMs ?? state.startedAtMs;

    const elapsedMs = referenceNow - state.startedAtMs - state.pausedOffsetMs;

    return Math.max(0, elapsedMs);
  }, []);

  /**
   * Perform clock synchronization.
   * Called on mount, visibility change, and periodically.
   */
  const performClockSync = useCallback(async () => {
    const offset = await syncClock(3);
    clockOffsetRef.current = offset;
    lastSyncTimeRef.current = Date.now();
  }, []);

  /**
   * Update race state from database data.
   * Completely replaces local state - no deltas preserved.
   */
  const updateRaceState = useCallback((dbData: DbRaceState) => {
    const lapTimesArray = Array.isArray(dbData.lap_times) ? dbData.lap_times : [];

    raceStateRef.current = {
      isRunning: dbData.is_running,
      startedAtMs: dbData.started_at_ms,
      pausedAtMs: dbData.paused_at_ms ?? null,
      pausedOffsetMs: dbData.paused_offset_ms ?? 0,
      lapTimes: lapTimesArray,
      totalRaceTimeMs: dbData.total_race_time * 1000,
      totalLaps: dbData.total_laps ?? DEFAULT_TOTAL_LAPS,
      safetySeconds: dbData.safety_seconds ?? DEFAULT_SAFETY_SECONDS,
    };

    // Trigger immediate re-render
    forceUpdate((n) => n + 1);
  }, []);

  /**
   * Initial setup: sync clock, then fetch state.
   * Clock sync MUST complete before state is used.
   */
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      // Step 1: Sync clock first (critical for accuracy)
      await performClockSync();

      if (!mounted) return;

      // Step 2: Fetch initial state
      const { data, error } = await supabase
        .from("race_state")
        .select("*")
        .eq("id", RACE_STATE_ID)
        .single();

      if (data && !error && mounted) {
        updateRaceState(data as DbRaceState);
      }

      if (mounted) {
        setIsLoading(false);
      }

      // Step 3: Second sync after a short delay for improved accuracy
      setTimeout(async () => {
        if (mounted) {
          await performClockSync();
        }
      }, 1000);
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, [performClockSync, updateRaceState]);

  /**
   * Subscribe to real-time state changes.
   * On EVERY state change, completely replace local state and resync if needed.
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
        async (payload) => {
          const dbData = payload.new as DbRaceState;
          if (dbData) {
            // Check if this is a significant state change (start/stop)
            const wasRunning = raceStateRef.current.isRunning;
            const isNowRunning = dbData.is_running;
            const stateChanged = wasRunning !== isNowRunning;

            // Completely replace local state
            updateRaceState(dbData);

            // Resync clock on significant state changes
            if (stateChanged) {
              await performClockSync();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [updateRaceState, performClockSync]);

  /**
   * Visibility change handler: resync when tab becomes visible.
   */
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        // Tab became visible - resync clock
        const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;

        // Always resync if more than 10 seconds since last sync
        if (timeSinceLastSync > 10000) {
          await performClockSync();
        }

        // Force re-render to update display immediately
        forceUpdate((n) => n + 1);
      }
    };

    const handleFocus = async () => {
      // Window regained focus - check if resync needed
      const timeSinceLastSync = Date.now() - lastSyncTimeRef.current;
      if (timeSinceLastSync > 30000) {
        await performClockSync();
      }
      forceUpdate((n) => n + 1);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [performClockSync]);

  /**
   * Animation loop: triggers re-render every frame when race is running.
   * Does NOT calculate or store time - just triggers React to re-render,
   * and the render will call getRemainingMs() which recalculates.
   */
  useEffect(() => {
    const state = raceStateRef.current;

    if (!state.isRunning || state.startedAtMs === null) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    let lastUpdateTime = 0;

    const tick = (timestamp: number) => {
      // Update display approximately 10 times per second (every ~100ms)
      // This is enough for smooth display while avoiding excessive re-renders
      if (timestamp - lastUpdateTime >= 100) {
        forceUpdate((n) => n + 1);
        lastUpdateTime = timestamp;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [raceStateRef.current.isRunning, raceStateRef.current.startedAtMs]);

  // Admin actions
  const startStop = useCallback(async () => {
    if (!isAdmin) return;

    const state = raceStateRef.current;
    const { data: serverTimeMs } = await supabase.rpc("get_server_time_ms");
    const nowMs = Number(serverTimeMs);

    if (state.isRunning) {
      // Running → Pause: freeze the timer at this server timestamp.
      await supabase
        .from("race_state")
        .update({
          is_running: false,
          paused_at_ms: nowMs,
          updated_at: new Date().toISOString(),
        })
        .eq("id", RACE_STATE_ID);
    } else if (state.startedAtMs !== null && state.pausedAtMs !== null) {
      // Paused → Resume: add the pause duration to the accumulated offset.
      const pauseDuration = nowMs - state.pausedAtMs;
      await supabase
        .from("race_state")
        .update({
          is_running: true,
          paused_at_ms: null,
          paused_offset_ms: state.pausedOffsetMs + pauseDuration,
          updated_at: new Date().toISOString(),
        })
        .eq("id", RACE_STATE_ID);
    } else {
      // Idle → Start: fresh race from zero.
      await supabase
        .from("race_state")
        .update({
          is_running: true,
          started_at_ms: nowMs,
          paused_at_ms: null,
          paused_offset_ms: 0,
          elapsed_seconds: 0,
          lap_times: [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", RACE_STATE_ID);
    }
  }, [isAdmin]);

  const recordLap = useCallback(async () => {
    if (!isAdmin || !raceStateRef.current.isRunning) return;

    const elapsedMs = getElapsedMs();
    const totalElapsedSec = Math.floor(elapsedMs / 1000);
    const previousLapsTotal = raceStateRef.current.lapTimes.reduce((a, b) => a + b, 0);
    const currentLapTime = totalElapsedSec - previousLapsTotal;

    const newLapTimes = [...raceStateRef.current.lapTimes, currentLapTime];

    await supabase
      .from("race_state")
      .update({
        lap_times: newLapTimes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", RACE_STATE_ID);
  }, [isAdmin, getElapsedMs]);

  const reset = useCallback(async () => {
    if (!isAdmin) return;

    await supabase
      .from("race_state")
      .update({
        is_running: false,
        started_at_ms: null,
        paused_at_ms: null,
        paused_offset_ms: 0,
        elapsed_seconds: 0,
        lap_times: [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", RACE_STATE_ID);
  }, [isAdmin]);

  // Admin: edit the race plan (duration / laps / safety buffer). Optimistic so
  // the timer + target lap update instantly; reverts if the write fails.
  const updateSettings = useCallback(
    async (settings: {
      durationSeconds?: number;
      totalLaps?: number;
      safetySeconds?: number;
    }) => {
      if (!isAdmin) return;

      const prev = raceStateRef.current;
      raceStateRef.current = {
        ...prev,
        totalRaceTimeMs:
          settings.durationSeconds != null ? settings.durationSeconds * 1000 : prev.totalRaceTimeMs,
        totalLaps: settings.totalLaps != null ? settings.totalLaps : prev.totalLaps,
        safetySeconds: settings.safetySeconds != null ? settings.safetySeconds : prev.safetySeconds,
      };
      forceUpdate((n) => n + 1);

      const dbUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (settings.durationSeconds != null) dbUpdate.total_race_time = settings.durationSeconds;
      if (settings.totalLaps != null) dbUpdate.total_laps = settings.totalLaps;
      if (settings.safetySeconds != null) dbUpdate.safety_seconds = settings.safetySeconds;

      const { error } = await supabase
        .from("race_state")
        .update(dbUpdate)
        .eq("id", RACE_STATE_ID);

      if (error) {
        console.error("updateSettings failed:", error);
        raceStateRef.current = prev;
        forceUpdate((n) => n + 1);
      }
    },
    [isAdmin]
  );

  // Calculate display values on every render (not stored)
  const state = raceStateRef.current;
  const remainingMs = getRemainingMs();
  const elapsedMs = getElapsedMs();

  // Round to seconds only at display time
  const timeLeft = Math.floor(remainingMs / 1000);
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const previousLapsTotal = state.lapTimes.reduce((a, b) => a + b, 0);
  const currentLapElapsed = Math.max(0, elapsedSeconds - previousLapsTotal);

  const isPaused = !state.isRunning && state.startedAtMs !== null;

  const durationSeconds = Math.floor(state.totalRaceTimeMs / 1000);
  const targetRace = targetRaceTime(durationSeconds, state.safetySeconds);
  const targetLap = targetLapTime(durationSeconds, state.safetySeconds, state.totalLaps);

  return {
    timeLeft,
    isRunning: state.isRunning,
    isPaused,
    currentLap: state.lapTimes.length,
    lapTimes: state.lapTimes,
    currentLapElapsed,
    totalRaceTime: durationSeconds,
    durationSeconds,
    totalLaps: state.totalLaps,
    safetySeconds: state.safetySeconds,
    targetRaceTime: targetRace,
    targetLapTime: targetLap,
    isLoading,
    startStop,
    recordLap,
    reset,
    updateSettings,
  };
};
