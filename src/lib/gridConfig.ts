/**
 * Single source of truth for the customizable dashboard grid.
 *
 * The DEFAULT_LAYOUTS are derived from the cards' original Tailwind spans so the
 * dashboard looks the same until an admin rearranges it. CARD_REGISTRY is the
 * canonical list of cards — mergeWithRegistry() always iterates it (never the
 * saved blob), so a card added in a future release shows up automatically and a
 * removed/renamed card can never strand a saved layout.
 */
import type { Layout, Layouts } from "react-grid-layout";

export const BREAKPOINT_KEYS = ["lg", "md", "base"] as const;
export type BreakpointKey = (typeof BREAKPOINT_KEYS)[number];

// Match the previous Tailwind grid: sm/md/lg → 2/4/6 columns.
export const BREAKPOINTS: Record<BreakpointKey, number> = { lg: 1024, md: 768, base: 0 };
export const COLS: Record<BreakpointKey, number> = { lg: 6, md: 4, base: 2 };
export const ROW_HEIGHT = 116;
export const GRID_MARGIN: [number, number] = [16, 16];
export const CONTAINER_PADDING: [number, number] = [0, 0];

interface Pos {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CardDef {
  i: string;
  /** Minimum size in grid units — kept permissive so reshaping is flexible. */
  min: { w: number; h: number };
  /** Maximum size in grid units (clamped to the breakpoint's column count). */
  max: { w: number; h: number };
  lg: Pos;
  md: Pos;
  base: Pos;
}

/**
 * Card order here is also the fallback stacking order (a brand-new card is
 * appended at the bottom). Positions are non-overlapping; compactType="vertical"
 * floats everything up so small gaps close on their own.
 */
export const CARD_REGISTRY: CardDef[] = [
  {
    i: "gps",
    min: { w: 2, h: 2 }, // the map is unusable below 2×2
    max: { w: 6, h: 4 },
    lg: { x: 0, y: 0, w: 3, h: 3 },
    md: { x: 0, y: 0, w: 2, h: 3 },
    base: { x: 0, y: 0, w: 2, h: 2 },
  },
  {
    i: "speed",
    min: { w: 1, h: 1 },
    max: { w: 3, h: 2 },
    lg: { x: 3, y: 0, w: 1, h: 1 },
    md: { x: 2, y: 0, w: 1, h: 1 },
    base: { x: 0, y: 2, w: 1, h: 1 },
  },
  {
    i: "targetAvg",
    min: { w: 1, h: 1 },
    max: { w: 3, h: 2 },
    lg: { x: 4, y: 0, w: 1, h: 1 },
    md: { x: 3, y: 0, w: 1, h: 1 },
    base: { x: 1, y: 2, w: 1, h: 1 },
  },
  {
    i: "systemStatus",
    min: { w: 1, h: 2 }, // status row + phone temp/battery strip need ~2 rows
    max: { w: 3, h: 3 },
    lg: { x: 5, y: 0, w: 1, h: 2 },
    md: { x: 2, y: 1, w: 2, h: 2 },
    base: { x: 0, y: 3, w: 2, h: 2 },
  },
  {
    i: "raceTimer",
    min: { w: 2, h: 3 },
    max: { w: 6, h: 5 },
    lg: { x: 3, y: 2, w: 3, h: 4 }, // tall enough for the admin Race Plan inputs
    md: { x: 2, y: 3, w: 2, h: 4 },
    base: { x: 0, y: 5, w: 2, h: 4 },
  },
  {
    i: "lapTimes",
    min: { w: 1, h: 1 },
    max: { w: 6, h: 4 },
    lg: { x: 0, y: 3, w: 3, h: 2 },
    md: { x: 0, y: 3, w: 2, h: 2 },
    base: { x: 0, y: 9, w: 2, h: 2 },
  },
  {
    i: "voiceChat",
    min: { w: 2, h: 2 },
    max: { w: 6, h: 4 },
    lg: { x: 3, y: 6, w: 3, h: 2 },
    md: { x: 2, y: 7, w: 2, h: 2 },
    base: { x: 0, y: 11, w: 2, h: 2 },
  },
  {
    i: "raceProgress",
    min: { w: 1, h: 2 },
    max: { w: 6, h: 4 },
    lg: { x: 0, y: 5, w: 3, h: 2 },
    md: { x: 0, y: 5, w: 2, h: 2 },
    base: { x: 0, y: 13, w: 2, h: 2 },
  },
  {
    i: "bestLap",
    min: { w: 1, h: 1 },
    max: { w: 3, h: 2 },
    lg: { x: 3, y: 8, w: 3, h: 1 },
    md: { x: 2, y: 9, w: 2, h: 1 },
    base: { x: 0, y: 15, w: 2, h: 1 },
  },
];

export const CARD_IDS = CARD_REGISTRY.map((c) => c.i);

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Builds a react-grid-layout item from a registry card for one breakpoint. */
function toLayoutItem(card: CardDef, bp: BreakpointKey, pos: Pos): Layout {
  const cols = COLS[bp];
  const maxW = Math.min(card.max.w, cols);
  const minW = Math.min(card.min.w, maxW);
  const w = clamp(pos.w, minW, maxW);
  return {
    i: card.i,
    x: clamp(pos.x, 0, Math.max(0, cols - w)),
    y: Math.max(0, pos.y),
    w,
    h: clamp(pos.h, card.min.h, card.max.h),
    minW,
    minH: card.min.h,
    maxW,
    maxH: card.max.h,
  };
}

export const DEFAULT_LAYOUTS: Layouts = BREAKPOINT_KEYS.reduce((acc, bp) => {
  acc[bp] = CARD_REGISTRY.map((card) => toLayoutItem(card, bp, card[bp]));
  return acc;
}, {} as Layouts);

/** Deep clone so callers can mutate without touching the shared default. */
export function defaultLayoutsClone(): Layouts {
  return BREAKPOINT_KEYS.reduce((acc, bp) => {
    acc[bp] = DEFAULT_LAYOUTS[bp].map((it) => ({ ...it }));
    return acc;
  }, {} as Layouts);
}

/**
 * Reconciles a (possibly stale / partial) saved layout with the registry:
 *  - every registry card is present (missing ones backfill from defaults),
 *  - any saved id not in the registry is dropped,
 *  - min/max are always re-stamped from the registry (a stale blob can't pin a
 *    card below usable size or above the column count).
 */
export function mergeWithRegistry(saved: Layouts | null | undefined): Layouts {
  return BREAKPOINT_KEYS.reduce((acc, bp) => {
    const savedItems = saved?.[bp] ?? [];
    acc[bp] = CARD_REGISTRY.map((card) => {
      const hit = savedItems.find((it) => it && it.i === card.i);
      const pos: Pos = hit
        ? { x: hit.x, y: hit.y, w: hit.w, h: hit.h }
        : card[bp];
      return toLayoutItem(card, bp, pos);
    });
    return acc;
  }, {} as Layouts);
}
