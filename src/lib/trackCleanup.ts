/**
 * Pure GPS track-cleanup pipeline for the track maker.
 *
 * Takes the raw fixes recorded while the driver drove the circuit and returns a
 * clean, simplified (optionally closed) polyline ready to draw + save. No React /
 * Mapbox imports so it is unit-testable.
 *
 * Order matters: gate/filter BEFORE simplifying — RDP only deletes points, it
 * never moves one off a spike, so a bad fix must be removed first.
 */
import CheapRuler from "cheap-ruler";
import simplify from "simplify-js";

export interface RawFix {
  lng: number;
  lat: number;
  accuracy: number; // metres (1σ); large = unreliable
  speed: number; // m/s (<0 if unknown)
  t: number; // epoch ms
}

export type LngLat = [number, number];

export const TRACK_CLEANUP = {
  MAX_ACCURACY_M: 15, // drop fixes worse than this
  MAX_JUMP_M: 150, // jump between consecutive fixes above this = GPS teleport, drop
  MIN_STEP_M: 2, // keep at most one point per ~2 m (kills standstill jitter)
  SMOOTH_WINDOW: 5, // centred moving-average window
  LOOP_CLOSE_M: 20, // snap end→start if within this…
  MIN_LOOP_LENGTH_M: 300, // …and the lap is at least this long
  SIMPLIFY_TOLERANCE_M: 2, // RDP tolerance (honest metres)
} as const;

/** Whether the cleaned ring came out closed (a real lap was detected). */
export interface CleanResult {
  points: LngLat[];
  closed: boolean;
}

export function cleanTrack(raw: RawFix[], lat0: number): CleanResult {
  const C = TRACK_CLEANUP;
  const ruler = new CheapRuler(lat0, "meters");

  // 1) Validity + accuracy gate + consecutive de-dupe (the phone overwrites one
  //    row ~5 Hz so realtime can re-deliver the same fix).
  const gated: RawFix[] = [];
  for (const f of raw) {
    if (!Number.isFinite(f.lng) || !Number.isFinite(f.lat)) continue;
    if (f.lng === 0 && f.lat === 0) continue;
    if (f.accuracy > C.MAX_ACCURACY_M) continue;
    const prev = gated[gated.length - 1];
    if (prev && prev.lng === f.lng && prev.lat === f.lat) continue; // re-delivered fix
    gated.push(f);
  }
  if (gated.length < 2) return { points: gated.map((f) => [f.lng, f.lat]), closed: false };

  // 2) Spike reject (distance-based — fix timestamps aren't reliable) + 3) min-step gate.
  const kept: RawFix[] = [gated[0]];
  for (let i = 1; i < gated.length; i++) {
    const f = gated[i];
    const last = kept[kept.length - 1];
    const d = ruler.distance([last.lng, last.lat], [f.lng, f.lat]);
    if (d > C.MAX_JUMP_M) {
      // The anchor itself is unverified — a teleported first fix must be dropped,
      // not allowed to reject the whole lap. Re-anchor if it's the only kept point.
      if (kept.length === 1) kept[0] = f;
      continue;
    }
    if (d < C.MIN_STEP_M) continue; // too close / standstill jitter
    kept.push(f);
  }
  if (kept.length < 2) return { points: kept.map((f) => [f.lng, f.lat]), closed: false };

  // 4) Light moving-average smooth (lng/lat separately, ends clamped).
  let pts: LngLat[] = movingAverage(kept.map((f) => [f.lng, f.lat] as LngLat), C.SMOOTH_WINDOW);

  // 5) Loop close: snap end→start for a real lap.
  const totalLen = polylineLength(pts, ruler);
  const closed = ruler.distance(pts[0], pts[pts.length - 1]) < C.LOOP_CLOSE_M && totalLen > C.MIN_LOOP_LENGTH_M;
  if (closed) pts[pts.length - 1] = [pts[0][0], pts[0][1]];

  // 6) Simplify in honest metres (degrees would make ε anisotropic at high latitude).
  pts = simplifyMetres(pts, ruler, lat0, C.SIMPLIFY_TOLERANCE_M);
  if (closed && pts.length > 2) pts[pts.length - 1] = [pts[0][0], pts[0][1]];

  return { points: pts, closed };
}

function movingAverage(pts: LngLat[], window: number): LngLat[] {
  if (pts.length <= window || window < 2) return pts.map((p) => [p[0], p[1]]);
  const half = Math.floor(window / 2);
  const out: LngLat[] = [];
  for (let i = 0; i < pts.length; i++) {
    const lo = Math.max(0, i - half);
    const hi = Math.min(pts.length - 1, i + half);
    let sx = 0;
    let sy = 0;
    for (let j = lo; j <= hi; j++) {
      sx += pts[j][0];
      sy += pts[j][1];
    }
    const n = hi - lo + 1;
    out.push([sx / n, sy / n]);
  }
  return out;
}

function polylineLength(pts: LngLat[], ruler: CheapRuler): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += ruler.distance(pts[i - 1], pts[i]);
  return len;
}

function simplifyMetres(pts: LngLat[], ruler: CheapRuler, lat0: number, tolM: number): LngLat[] {
  // metres per degree at this latitude (translation-invariant for RDP)
  const kx = ruler.distance([0, lat0], [1, lat0]);
  const ky = ruler.distance([0, lat0], [0, lat0 + 1]);
  const metric = pts.map((p, idx) => ({ x: p[0] * kx, y: p[1] * ky, idx }));
  const out = simplify(metric, tolM, true) as Array<{ x: number; y: number; idx: number }>;
  return out.map((m) => pts[m.idx]);
}
