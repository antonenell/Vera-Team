/**
 * Race-plan math. Pure and side-effect free so it can be unit-tested.
 *
 * The admin sets a total race duration, a number of laps, and a safety-time
 * buffer. The buffer is subtracted from the duration first ("if something goes
 * wrong you still have that time to make it around"), and the remaining time is
 * split evenly across the laps to give the per-lap time budget.
 */

/** Time available for racing after the safety buffer is removed (never < 0). */
export function targetRaceTime(durationSeconds: number, safetySeconds: number): number {
  return Math.max(0, durationSeconds - safetySeconds);
}

/** Per-lap time budget in seconds: (duration - safety) / laps. 0 if no laps. */
export function targetLapTime(
  durationSeconds: number,
  safetySeconds: number,
  totalLaps: number,
): number {
  if (totalLaps <= 0) return 0;
  return targetRaceTime(durationSeconds, safetySeconds) / totalLaps;
}
