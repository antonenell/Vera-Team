import { useEffect, useRef, useState } from "react";

export interface WebMeanSpeedTarget {
  /** Average speed (km/h) the driver must hold over the remaining laps to make target. */
  targetKmh: number;
  /** The car's actual mean speed so far (km/h). */
  currentKmh: number;
  /** True until we have ≥1 completed lap + enough speed samples to give a number. */
  calibrating: boolean;
  /** True once all laps are done. */
  finished: boolean;
  /** True while the driver is at or ahead of the per-lap budget. */
  onPace: boolean;
}

/**
 * Computes the same "Target Avg" the Android driver display shows, but on the web,
 * from the telemetry the dashboard already receives.
 *
 * Math mirrors the app's PaceCalculator:
 *   lapDistance ≈ meanSpeed × avgLapTime           (we never need the raw distance)
 *   requiredLapTime = (budget − timeUsed) / lapsLeft
 *   targetAvg = lapDistance / requiredLapTime = meanSpeed × avgLapTime / requiredLapTime
 *
 * meanSpeed is the car's actual average speed, sampled at 1 Hz from the live
 * telemetry speed while the race runs (stops included, matching the app).
 */
export function useTargetMeanSpeed(args: {
  speedKmh: number;
  isOnline: boolean;
  isRunning: boolean;
  lapTimes: number[];
  totalLaps: number;
  /** Race budget in seconds (duration − safety). */
  targetRaceTimeSec: number;
  /** Per-lap budget in seconds. */
  targetLapTimeSec: number;
}): WebMeanSpeedTarget {
  const {
    speedKmh,
    isOnline,
    isRunning,
    lapTimes,
    totalLaps,
    targetRaceTimeSec,
    targetLapTimeSec,
  } = args;

  const sumRef = useRef(0);
  const countRef = useRef(0);
  const speedRef = useRef(0);
  const onlineRef = useRef(false);
  const [meanKmh, setMeanKmh] = useState(0);

  // Keep refs current so the 1 Hz sampler reads the latest values.
  speedRef.current = speedKmh;
  onlineRef.current = isOnline;

  // Reset the running mean when the race is idle / has been reset.
  const idle = !isRunning && lapTimes.length === 0;
  useEffect(() => {
    if (idle) {
      sumRef.current = 0;
      countRef.current = 0;
      setMeanKmh(0);
    }
  }, [idle]);

  // Sample the actual speed at 1 Hz while running → time-mean speed.
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      if (!onlineRef.current) return; // don't count gaps where the phone is offline
      sumRef.current += speedRef.current;
      countRef.current += 1;
      setMeanKmh(sumRef.current / countRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const lapsCompleted = lapTimes.length;
  const lapsRemaining = Math.max(0, totalLaps - lapsCompleted);
  const completedLapsSec = lapTimes.reduce((a, b) => a + b, 0);
  const onPace = lapsCompleted * targetLapTimeSec - completedLapsSec >= 0;

  if (lapsCompleted > 0 && lapsRemaining === 0) {
    return { targetKmh: 0, currentKmh: meanKmh, calibrating: false, finished: true, onPace };
  }
  // Need a completed lap and a real speed average before a target is meaningful.
  if (lapsCompleted < 1 || meanKmh <= 0 || countRef.current < 5) {
    return { targetKmh: 0, currentKmh: meanKmh, calibrating: true, finished: false, onPace };
  }

  const avgLapTime = completedLapsSec / lapsCompleted;
  const requiredLapTime = (targetRaceTimeSec - completedLapsSec) / lapsRemaining;
  const targetKmh = requiredLapTime > 0 ? meanKmh * (avgLapTime / requiredLapTime) : 999;

  return { targetKmh, currentKmh: meanKmh, calibrating: false, finished: false, onPace };
}
