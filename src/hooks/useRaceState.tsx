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
  const [tick, setTick] = useState(0); // Forces re-render every second
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const serverStartTime = useRef<Date | null>(null);

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
        
        if (data.is_running && data.start_time) {
          serverStartTime.current = new Date(data.start_time);
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
          console.log("Race state updated:", payload);
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
            
            if (newData.is_running && newData.start_time) {
              serverStartTime.current = new Date(newData.start_time);
            } else {
              serverStartTime.current = null;
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Local timer for smooth countdown when running
  useEffect(() => {
    if (raceState.isRunning) {
      timerRef.current = setInterval(() => {
        setTick(t => t + 1); // Force re-render every second
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [raceState.isRunning]);

  // Admin actions
  const startStop = useCallback(async () => {
    if (!isAdmin) return;

    const newIsRunning = !raceState.isRunning;
    const now = new Date().toISOString();

    if (newIsRunning) {
      // Starting - set start time
      await supabase
        .from("race_state")
        .update({
          is_running: true,
          start_time: now,
          updated_at: now,
        })
        .eq("id", RACE_STATE_ID);
    } else {
      // Stopping - calculate elapsed and clear start time
      const elapsed = serverStartTime.current
        ? Math.floor((new Date().getTime() - serverStartTime.current.getTime()) / 1000)
        : 0;
      
      await supabase
        .from("race_state")
        .update({
          is_running: false,
          elapsed_seconds: raceState.elapsedSeconds + elapsed,
          start_time: null,
          updated_at: now,
        })
        .eq("id", RACE_STATE_ID);
    }
  }, [isAdmin, raceState.isRunning, raceState.elapsedSeconds]);

  const recordLap = useCallback(async () => {
    if (!isAdmin || !raceState.isRunning) return;

    // Calculate current lap time
    const totalElapsed = serverStartTime.current
      ? Math.floor((new Date().getTime() - serverStartTime.current.getTime()) / 1000) + raceState.elapsedSeconds
      : raceState.elapsedSeconds;
    
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
  }, [isAdmin]);

  // Calculate time left based on total race time and elapsed
  const totalElapsed = raceState.isRunning && serverStartTime.current
    ? Math.floor((new Date().getTime() - serverStartTime.current.getTime()) / 1000) + raceState.elapsedSeconds
    : raceState.elapsedSeconds;
  
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
