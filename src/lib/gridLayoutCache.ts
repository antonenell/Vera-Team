/**
 * Per-device persistence for the customizable dashboard layout.
 *
 * Mirrors raceSettingsCache.ts: localStorage only, every read defends against
 * SSR / corrupt JSON / version drift and returns null so the caller falls back
 * to DEFAULT_LAYOUTS. The stored blob is versioned — bump LAYOUT_SCHEMA_VERSION
 * whenever the default geometry or card ids change and an old blob is ignored
 * wholesale rather than half-applied.
 */
import type { Layout, Layouts } from "react-grid-layout";
import { BREAKPOINT_KEYS } from "./gridConfig";

export const GRID_LAYOUT_KEY = "vera-team:grid-layout";
export const LAYOUT_SCHEMA_VERSION = 1;

interface StoredLayout {
  version: number;
  layouts: Layouts;
}

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Keeps only well-formed items under known breakpoints; null if nothing usable. */
export function sanitizeLayouts(raw: unknown): Layouts | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const out: Layouts = {};
  for (const bp of BREAKPOINT_KEYS) {
    const arr = src[bp];
    if (!Array.isArray(arr)) continue;
    const items: Layout[] = [];
    for (const it of arr) {
      if (!it || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      if (typeof o.i !== "string") continue;
      if (!isFiniteNum(o.x) || !isFiniteNum(o.y) || !isFiniteNum(o.w) || !isFiniteNum(o.h)) continue;
      items.push({
        i: o.i,
        x: Math.max(0, Math.floor(o.x)),
        y: Math.max(0, Math.floor(o.y)),
        w: Math.max(1, Math.floor(o.w)),
        h: Math.max(1, Math.floor(o.h)),
      });
    }
    if (items.length) out[bp] = items;
  }
  return Object.keys(out).length ? out : null;
}

export function readGridLayout(): Layouts | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(GRID_LAYOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    if (!parsed || parsed.version !== LAYOUT_SCHEMA_VERSION) return null;
    return sanitizeLayouts(parsed.layouts);
  } catch {
    return null;
  }
}

export function writeGridLayout(layouts: Layouts): void {
  try {
    if (typeof localStorage === "undefined") return;
    const blob: StoredLayout = { version: LAYOUT_SCHEMA_VERSION, layouts };
    localStorage.setItem(GRID_LAYOUT_KEY, JSON.stringify(blob));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

export function clearGridLayout(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(GRID_LAYOUT_KEY);
  } catch {
    /* ignore */
  }
}
