// Run: node --experimental-strip-types --test src/lib/trackCleanup.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTrack, type RawFix } from "./trackCleanup.ts";

const LAT0 = 50.53; // Silesia Ring-ish latitude
const LNG0 = 18.09;

/** Build a noisy ~closed circular lap (radius ~120 m) of `n` fixes. */
function syntheticLap(n: number, opts: { noise?: number; close?: boolean } = {}): RawFix[] {
  const noise = opts.noise ?? 0; // degrees of jitter
  const rLat = 0.0011; // ~120 m
  const rLng = 0.0017;
  const fixes: RawFix[] = [];
  const span = opts.close === false ? Math.PI * 1.6 : Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = (span * i) / (n - 1);
    fixes.push({
      lng: LNG0 + rLng * Math.cos(a) + (Math.random() - 0.5) * noise,
      lat: LAT0 + rLat * Math.sin(a) + (Math.random() - 0.5) * noise,
      accuracy: 5,
      speed: 8,
      t: i * 200, // 5 Hz
    });
  }
  return fixes;
}

test("a clean lap simplifies but keeps its shape and closes the loop", () => {
  const raw = syntheticLap(400);
  const { points, closed } = cleanTrack(raw, LAT0);
  assert.ok(points.length < 400, "should simplify down from 400 points");
  assert.ok(points.length > 8, "should keep enough points to trace a circle");
  assert.ok(closed, "a full lap should be detected as closed");
  assert.deepEqual(points[0], points[points.length - 1], "closed ring: first == last");
});

test("an open path (not a full lap) stays open", () => {
  const raw = syntheticLap(300, { close: false });
  const { closed } = cleanTrack(raw, LAT0);
  assert.equal(closed, false);
});

test("low-accuracy fixes are dropped", () => {
  const raw = syntheticLap(200);
  // wreck a chunk with terrible accuracy + a wild position
  for (let i = 50; i < 70; i++) {
    raw[i].accuracy = 40;
    raw[i].lng += 0.01; // ~700 m off
  }
  const { points } = cleanTrack(raw, LAT0);
  // none of the cleaned points should be near the garbage longitude
  const maxLng = Math.max(...points.map((p) => p[0]));
  assert.ok(maxLng < LNG0 + 0.01, "garbage off-track points must be gated out");
});

test("a single teleport spike is rejected", () => {
  const raw = syntheticLap(200);
  raw[100] = { ...raw[100], lng: LNG0 + 5, lat: LAT0 + 5 }; // 500+ km jump, good accuracy
  const { points } = cleanTrack(raw, LAT0);
  assert.ok(points.every((p) => Math.abs(p[0] - LNG0) < 0.1), "spike must be rejected");
});

test("a teleported FIRST fix (cold start) does not anchor the track", () => {
  const raw = syntheticLap(200);
  raw[0] = { ...raw[0], lng: LNG0 + 5, lat: LAT0 + 5, accuracy: 12 }; // bad cold fix, low accuracy
  const { points } = cleanTrack(raw, LAT0);
  assert.ok(points.length > 8, "the real lap should survive after re-anchoring");
  assert.ok(points.every((p) => Math.abs(p[0] - LNG0) < 0.1 && Math.abs(p[1] - LAT0) < 0.1), "cold-start teleport must not appear in the track");
});

test("near-duplicate standstill points collapse", () => {
  // 100 identical parked fixes then a short move
  const raw: RawFix[] = [];
  for (let i = 0; i < 100; i++) raw.push({ lng: LNG0, lat: LAT0, accuracy: 5, speed: 0, t: i * 200 });
  for (let i = 0; i < 20; i++) raw.push({ lng: LNG0 + 0.0003 * i, lat: LAT0, accuracy: 5, speed: 8, t: (100 + i) * 200 });
  const { points } = cleanTrack(raw, LAT0);
  assert.ok(points.length < 25, `standstill should collapse, got ${points.length}`);
});

test("empty / tiny input does not throw", () => {
  assert.doesNotThrow(() => cleanTrack([], LAT0));
  assert.doesNotThrow(() => cleanTrack([{ lng: LNG0, lat: LAT0, accuracy: 5, speed: 0, t: 0 }], LAT0));
});
