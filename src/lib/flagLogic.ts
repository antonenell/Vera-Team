export type FlagColor = "grey" | "yellow" | "red" | "black";

/**
 * Decide how a flag colour change applies across the track.
 *
 * Red is a full-course condition:
 *  - setting ANY flag to red turns them ALL red;
 *  - changing a red flag to anything else stands the whole course back down,
 *    resetting ALL flags to neutral grey.
 * Any other change (grey <-> yellow) affects only the one flag.
 *
 * Pure and side-effect free so it can be unit-tested in isolation.
 */
export function resolveFlagColorChange(
  currentColor: FlagColor | undefined,
  requested: FlagColor,
): { scope: "all" | "one"; color: FlagColor } {
  if (requested === "red") return { scope: "all", color: "red" };
  if (currentColor === "red") return { scope: "all", color: "grey" };
  return { scope: "one", color: requested };
}
