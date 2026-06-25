/**
 * Local fallback for race-plan settings the server schema may not store yet
 * (total_laps / safety_seconds, added by the race_settings migration).
 *
 * The database stays the source of truth whenever it actually has a value; this
 * cache only fills the gap so an admin's laps/safety edits don't snap back
 * before that migration is applied. Once the columns exist, the DB value takes
 * precedence (see resolveSetting) and the cache is simply ignored.
 */

const KEY = "vera-team:race-plan";

export interface CachedRacePlan {
  durationSeconds?: number;
  totalLaps?: number;
  safetySeconds?: number;
}

export function readRacePlanCache(): CachedRacePlan {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CachedRacePlan) : {};
  } catch {
    return {};
  }
}

export function writeRacePlanCache(patch: CachedRacePlan): void {
  try {
    if (typeof localStorage === "undefined") return;
    const next = { ...readRacePlanCache(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

/** DB value wins when present; otherwise the locally cached value; else the default. */
export function resolveSetting(
  dbValue: number | null | undefined,
  cachedValue: number | undefined,
  fallback: number,
): number {
  if (dbValue != null) return dbValue;
  if (cachedValue != null) return cachedValue;
  return fallback;
}
