import { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import { MapPin, Flag, RotateCcw, ChevronDown, Pencil, Check, Circle, Square, Route } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useTrackFlags, tracks, TrackName, FlagColor, FlagData } from "@/hooks/useTrackFlags";
import { useTrackPath, type LngLat } from "@/hooks/useTrackPath";
import { cleanTrack, type RawFix } from "@/lib/trackCleanup";

const MAPBOX_TOKEN = "pk.eyJ1IjoiY2FybGJlcmdlIiwiYSI6ImNsMnh3OXZrYTBsNzUzaWp6NzlvdDM4bzgifQ.YiaCxeUA5RaJn7071yd42A";

const SOURCE_ID = "flags-source";
const LAYER_ID = "flags-layer";
const TRACK_LINE_SOURCE = "track-line-source";
const TRACK_CASING_LAYER = "track-casing-layer";
const TRACK_LINE_LAYER = "track-line-layer";
const TRACK_VERTS_SOURCE = "track-verts-source";
const TRACK_VERTS_LAYER = "track-verts-layer";

interface GPSTrackProps {
  position: { lat: number; lng: number };
  className?: string;
  isAdmin?: boolean;
  isCarOnline?: boolean;
  /** True while the dashboard grid is in layout-edit mode — hides this card's own
   *  flag-editing controls so the only affordance is the grid Move/resize. */
  gridEditMode?: boolean;
  /** Live telemetry detail the track recorder needs (beyond position). */
  accuracy?: number;
  speed?: number;
  gpsTimestamp?: string;
}

/** Imperative handle so the grid can re-measure / re-frame the Mapbox canvas after a resize. */
export interface GPSTrackHandle {
  resizeMap: () => void;
  refitMap: () => void;
}

const flagColors: Record<FlagColor, string> = {
  grey: "hsl(var(--muted-foreground))",
  yellow: "hsl(45, 93%, 47%)",
  red: "hsl(0, 84%, 60%)",
  black: "hsl(0, 0%, 10%)",
};

const flagLabels: Record<FlagColor, string> = {
  grey: "Neutral",
  yellow: "Caution",
  red: "Danger",
  black: "Disqualified",
};

const getFlagColorHex = (color: FlagColor): string => {
  switch (color) {
    case "yellow": return "#EAB308";
    case "red": return "#DC2626";
    case "black": return "#1a1a1a";
    default: return "#71717A";
  }
};

// A map pin filled with the status colour (so a red full-course condition is
// unmistakable) with a small white flag glyph. The tip is at the bottom of the
// viewBox; the icon is anchored 'bottom', so the tip lands on the coordinate.
const flagImageSvg = (hex: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48">
    <path d="M24 2 C 15.16 2 8 9.16 8 18 C 8 29.5 24 47 24 47 C 24 47 40 29.5 40 18 C 40 9.16 32.84 2 24 2 Z" fill="${hex}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
    <rect x="20" y="10.5" width="1.7" height="14.5" rx="0.85" fill="#ffffff"/>
    <path d="M21.7 11 L30.5 11 L28 14.4 L30.5 17.8 L21.7 17.8 Z" fill="#ffffff"/>
  </svg>`;

const loadFlagImage = (map: mapboxgl.Map, name: string, hex: string): Promise<void> =>
  new Promise((resolve) => {
    if (map.hasImage(name)) return resolve();
    const img = new Image(96, 96);
    img.onload = () => {
      if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 });
      resolve();
    };
    img.onerror = () => resolve();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(flagImageSvg(hex));
  });

// Keeps the colour popup glued to the flag whichever side Mapbox opens it.
const FLAG_POPUP_OFFSET: Record<string, [number, number]> = {
  top: [0, 0],
  bottom: [0, -46],
  left: [20, -24],
  right: [-20, -24],
  center: [0, -24],
  "top-left": [12, 0],
  "top-right": [-12, 0],
  "bottom-left": [12, -46],
  "bottom-right": [-12, -46],
};

const FLAG_OPTIONS: { color: FlagColor; label: string }[] = [
  { color: "grey", label: "Neutral" },
  { color: "yellow", label: "Caution" },
  { color: "red", label: "Danger" },
];

type LngLatTuple = [number, number];

/** Pixel distance from point (px,py) to segment (ax,ay)-(bx,by) — for line-insert. */
const distPointToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const GPSTrack = forwardRef<GPSTrackHandle, GPSTrackProps>(({ position, className, isAdmin = false, isCarOnline = false, gridEditMode = false, accuracy = 0, speed = 0, gpsTimestamp }, ref) => {
  const [selectedTrack, setSelectedTrack] = useState<TrackName>("silesia-ring");
  const [editMode, setEditMode] = useState(false);
  const [recordMode, setRecordMode] = useState(false);
  const [trackEditMode, setTrackEditMode] = useState(false);
  const track = tracks[selectedTrack];

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const trackBoundsRef = useRef(track.bounds);
  useEffect(() => { trackBoundsRef.current = track.bounds; }, [track.bounds]);

  // rAF-debounced, zero-size-guarded Mapbox re-measure (shared by the ResizeObserver,
  // the window resize, and the grid's drag/resize stops). When `refit` is set it also
  // re-frames the whole track, so reshaping the card to a new aspect ratio after a
  // grid resize doesn't crop the circuit out of view.
  const runResize = useCallback((refit: boolean) => {
    if (resizeRafRef.current != null) cancelAnimationFrame(resizeRafRef.current);
    resizeRafRef.current = requestAnimationFrame(() => {
      resizeRafRef.current = null;
      const m = map.current;
      const el = mapContainer.current;
      if (!m || !el || el.clientWidth === 0 || el.clientHeight === 0) return;
      m.resize();
      if (refit) m.fitBounds(trackBoundsRef.current, { padding: 10, duration: 0 });
    });
  }, []);

  // Plain (no-refit) re-measure with a stable identity for listeners/observers.
  const scheduleResize = useCallback(() => runResize(false), [runResize]);

  useImperativeHandle(ref, () => ({
    resizeMap: () => runResize(false),
    refitMap: () => runResize(true),
  }), [runResize]);

  // While the grid is being rearranged, suppress this card's own flag-edit mode so it
  // doesn't compete with the grid's Move/resize affordances.
  useEffect(() => {
    if (gridEditMode && editMode) setEditMode(false);
  }, [gridEditMode, editMode]);

  const { flags, addFlag, moveFlag, deleteFlag, updateFlagColor, resetFlags } =
    useTrackFlags(isAdmin, selectedTrack);

  // Refs so the once-attached Mapbox event handlers always see current values.
  const flagsRef = useRef(flags);
  const isAdminRef = useRef(isAdmin);
  const editModeRef = useRef(editMode);
  const addFlagRef = useRef(addFlag);
  const moveFlagRef = useRef(moveFlag);
  const deleteFlagRef = useRef(deleteFlag);
  const updateFlagColorRef = useRef(updateFlagColor);

  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { addFlagRef.current = addFlag; }, [addFlag]);
  useEffect(() => { moveFlagRef.current = moveFlag; }, [moveFlag]);
  useEffect(() => { deleteFlagRef.current = deleteFlag; }, [deleteFlag]);
  useEffect(() => { updateFlagColorRef.current = updateFlagColor; }, [updateFlagColor]);

  // Drag state for moving a flag.
  const draggingIdRef = useRef<string | null>(null);
  const dragLngLatRef = useRef<LngLatTuple | null>(null);
  const dragMovedRef = useRef(false);
  const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  // Pushes the current flags (with any live drag override) into the GL source.
  const refreshSourceRef = useRef<() => void>(() => {});
  const readyRef = useRef(false);
  const colorPopupRef = useRef<mapboxgl.Popup | null>(null);
  const popupFlagIdRef = useRef<string | null>(null);

  // ===== Track maker =====
  const { path, savePath, clearPath } = useTrackPath(isAdmin, selectedTrack);

  const trackPointsRef = useRef<LngLat[]>([]);     // the saved/edited track (working copy)
  const recordedRef = useRef<RawFix[]>([]);         // live recording buffer
  const recordModeRef = useRef(recordMode);
  const trackEditModeRef = useRef(trackEditMode);
  const savePathRef = useRef(savePath);
  const refreshTrackSourceRef = useRef<() => void>(() => {});
  const vertPopupRef = useRef<mapboxgl.Popup | null>(null);
  // Vertex drag state (mirrors the flag drag refs).
  const vDragIdxRef = useRef<number | null>(null);
  const vDragLngLatRef = useRef<LngLat | null>(null);
  const vDragMovedRef = useRef(false);
  const vDragStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { recordModeRef.current = recordMode; }, [recordMode]);
  useEffect(() => { trackEditModeRef.current = trackEditMode; }, [trackEditMode]);
  useEffect(() => { savePathRef.current = savePath; }, [savePath]);

  // Mirror the saved path into the working copy + redraw (unless mid-recording,
  // when the live breadcrumb owns the line). Never swap the array out from under
  // an in-flight vertex drag — the drag holds a positional index committed only on
  // release, so a concurrent realtime update would otherwise move the wrong vertex.
  useEffect(() => {
    if (vDragIdxRef.current != null) return;
    trackPointsRef.current = path;
    if (readyRef.current && !recordModeRef.current) refreshTrackSourceRef.current();
  }, [path]);

  // Only one map-edit mode at a time; none survive losing admin or grid-edit mode.
  useEffect(() => {
    if ((!isAdmin || gridEditMode) && recordMode) setRecordMode(false);
    if ((!isAdmin || gridEditMode) && trackEditMode) setTrackEditMode(false);
  }, [isAdmin, gridEditMode, recordMode, trackEditMode]);

  useEffect(() => {
    if (!isAdmin && editMode) setEditMode(false);
  }, [isAdmin, editMode]);

  // Colour/Delete popup, anchored to the flag's coordinate so it stays locked
  // to that flag while the map zooms or pans.
  const openFlagPopup = (flagId: string, coord: LngLatTuple, editable: boolean) => {
    const m = map.current;
    if (!m) return;
    colorPopupRef.current?.remove();

    const content = document.createElement("div");
    content.style.cssText = "display:flex;flex-direction:column;gap:2px;padding:6px;min-width:120px;";

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: true,
      offset: FLAG_POPUP_OFFSET,
      className: "flag-popup-custom",
    });

    FLAG_OPTIONS.forEach(({ color, label }) => {
      const btn = document.createElement("button");
      btn.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;background:transparent;border:none;border-radius:4px;color:hsl(210 40% 98%);font-size:12px;cursor:pointer;width:100%;text-align:left;";
      btn.innerHTML = `<span style="width:12px;height:12px;border-radius:50%;background:${getFlagColorHex(color)};border:1px solid rgba(255,255,255,0.2);"></span>${label}`;
      btn.addEventListener("mouseenter", () => { btn.style.background = "hsl(217.2 32.6% 17.5%)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "transparent"; });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        updateFlagColorRef.current(flagId, color);
        popup.remove();
      });
      content.appendChild(btn);
    });

    if (editable) {
      const sep = document.createElement("div");
      sep.style.cssText = "height:1px;background:hsl(217.2 32.6% 17.5%);margin:2px 0;";
      content.appendChild(sep);

      const del = document.createElement("button");
      del.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;background:transparent;border:none;border-radius:4px;color:#f87171;font-size:12px;cursor:pointer;width:100%;text-align:left;";
      del.innerHTML = `<span style="font-size:14px;line-height:1;">&times;</span> Delete flag`;
      del.addEventListener("mouseenter", () => { del.style.background = "hsl(217.2 32.6% 17.5%)"; });
      del.addEventListener("mouseleave", () => { del.style.background = "transparent"; });
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteFlagRef.current(flagId);
        popup.remove();
      });
      content.appendChild(del);
    }

    popup.setDOMContent(content).setLngLat(coord).addTo(m);
    colorPopupRef.current = popup;
    popupFlagIdRef.current = flagId;
    popup.on("close", () => {
      if (colorPopupRef.current === popup) {
        colorPopupRef.current = null;
        popupFlagIdRef.current = null;
      }
    });
  };

  // Initialize map once.
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Guards the async onLoad continuation against the map being removed (e.g. the
    // user navigates away) while the flag images are still decoding.
    let disposed = false;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/carlberge/cmj42ghcf009601r47hgyaiku/draft",
      bounds: track.bounds,
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
    });
    map.current = m;

    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(mapContainer.current);
    window.addEventListener("resize", scheduleResize);

    const canvas = () => m.getCanvas();

    const buildFeatureCollection = (): GeoJSON.FeatureCollection => ({
      type: "FeatureCollection",
      features: Object.values(flagsRef.current).map((f) => {
        const dragging = draggingIdRef.current === f.flagId && dragLngLatRef.current;
        const coordinates: LngLatTuple = dragging ? (dragLngLatRef.current as LngLatTuple) : [f.lng, f.lat];
        return {
          type: "Feature",
          properties: { flagId: f.flagId, color: f.color },
          geometry: { type: "Point", coordinates },
        };
      }),
    });

    const refreshSource = () => {
      const src = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(buildFeatureCollection());
    };
    refreshSourceRef.current = refreshSource;

    // ===== Track line + vertices =====
    const trackEditable = () => isAdminRef.current && trackEditModeRef.current;
    const isClosed = (pts: LngLat[]) =>
      pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];

    const buildTrackLine = (): GeoJSON.FeatureCollection => {
      let coords: LngLat[];
      if (recordModeRef.current) {
        coords = recordedRef.current.map((f) => [f.lng, f.lat]);
      } else {
        const pts = trackPointsRef.current;
        coords = pts.map((p, i) => (vDragIdxRef.current === i && vDragLngLatRef.current ? vDragLngLatRef.current : p));
        // A closed ring duplicates the start at the end; keep both ends together
        // so the loop doesn't visibly tear open while dragging the start vertex.
        if (isClosed(pts) && vDragIdxRef.current === 0 && vDragLngLatRef.current && coords.length > 1) {
          coords[coords.length - 1] = vDragLngLatRef.current;
        }
      }
      if (coords.length < 2) return { type: "FeatureCollection", features: [] };
      return {
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }],
      };
    };

    const buildVerts = (): GeoJSON.FeatureCollection => {
      if (!trackEditModeRef.current || recordModeRef.current) return { type: "FeatureCollection", features: [] };
      const pts = trackPointsRef.current;
      const n = isClosed(pts) ? pts.length - 1 : pts.length; // skip the duplicate closing vertex
      const features: GeoJSON.Feature[] = [];
      for (let i = 0; i < n; i++) {
        const coords = vDragIdxRef.current === i && vDragLngLatRef.current ? vDragLngLatRef.current : pts[i];
        features.push({ type: "Feature", properties: { vertIndex: i }, geometry: { type: "Point", coordinates: coords } });
      }
      return { type: "FeatureCollection", features };
    };

    const refreshTrackSource = () => {
      (m.getSource(TRACK_LINE_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(buildTrackLine());
      (m.getSource(TRACK_VERTS_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(buildVerts());
    };
    refreshTrackSourceRef.current = refreshTrackSource;

    const commitTrackPoints = (next: LngLat[]) => {
      trackPointsRef.current = next;
      refreshTrackSource();
      savePathRef.current(next);
    };

    const moveVertex = (vi: number, lng: number, lat: number) => {
      const pts = trackPointsRef.current;
      if (vi < 0 || vi >= pts.length) return;
      const closed = isClosed(pts);
      const next = pts.map((p) => [p[0], p[1]] as LngLat);
      next[vi] = [lng, lat];
      if (closed && vi === 0) next[next.length - 1] = [lng, lat]; // keep the ring closed
      commitTrackPoints(next);
    };

    const deleteVertex = (vi: number) => {
      const pts = trackPointsRef.current;
      if (vi < 0 || vi >= pts.length) return;
      const closed = isClosed(pts);
      const next = pts.map((p) => [p[0], p[1]] as LngLat);
      next.splice(vi, 1);
      if (closed && vi === 0 && next.length > 1) next[next.length - 1] = [next[0][0], next[0][1]];
      commitTrackPoints(next.length >= 2 ? next : []);
    };

    const insertVertex = (lngLat: mapboxgl.LngLat) => {
      const pts = trackPointsRef.current;
      if (pts.length < 2) {
        commitTrackPoints([...pts.map((p) => [p[0], p[1]] as LngLat), [lngLat.lng, lngLat.lat]]);
        return;
      }
      const click = m.project(lngLat);
      let bestI = 0;
      let bestD = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = m.project(pts[i] as [number, number]);
        const b = m.project(pts[i + 1] as [number, number]);
        const d = distPointToSegment(click.x, click.y, a.x, a.y, b.x, b.y);
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      const next = pts.map((p) => [p[0], p[1]] as LngLat);
      next.splice(bestI + 1, 0, [lngLat.lng, lngLat.lat]);
      commitTrackPoints(next);
    };

    const openVertPopup = (vi: number, coord: LngLat) => {
      vertPopupRef.current?.remove();
      const content = document.createElement("div");
      content.style.cssText = "padding:6px;min-width:110px;";
      const del = document.createElement("button");
      del.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 10px;background:transparent;border:none;border-radius:4px;color:#f87171;font-size:12px;cursor:pointer;width:100%;text-align:left;";
      del.innerHTML = `<span style="font-size:14px;line-height:1;">&times;</span> Delete point`;
      del.addEventListener("mouseenter", () => { del.style.background = "hsl(217.2 32.6% 17.5%)"; });
      del.addEventListener("mouseleave", () => { del.style.background = "transparent"; });
      const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: true, offset: 12, className: "flag-popup-custom" });
      del.addEventListener("click", (ev) => {
        ev.stopPropagation();
        deleteVertex(vi);
        popup.remove();
      });
      content.appendChild(del);
      popup.setDOMContent(content).setLngLat(coord).addTo(m);
      vertPopupRef.current = popup;
    };

    const editable = () => isAdminRef.current && editModeRef.current;

    const onLoad = async () => {
      await Promise.all([
        loadFlagImage(m, "flag-yellow", getFlagColorHex("yellow")),
        loadFlagImage(m, "flag-red", getFlagColorHex("red")),
        loadFlagImage(m, "flag-grey", getFlagColorHex("grey")),
        loadFlagImage(m, "flag-black", getFlagColorHex("black")),
      ]);
      // Bail if the map was removed while the images were decoding — touching a
      // removed map's style throws and would corrupt readyRef.
      if (disposed || map.current !== m) return;

      // Track line (+ dark casing) BELOW the flags so flags always sit on top.
      if (!m.getSource(TRACK_LINE_SOURCE)) {
        m.addSource(TRACK_LINE_SOURCE, { type: "geojson", data: buildTrackLine() });
      }
      if (!m.getLayer(TRACK_CASING_LAYER)) {
        m.addLayer({
          id: TRACK_CASING_LAYER,
          type: "line",
          source: TRACK_LINE_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "hsl(160, 84%, 10%)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 12, 5, 17, 10],
            "line-opacity": 0.85,
          },
        });
      }
      if (!m.getLayer(TRACK_LINE_LAYER)) {
        m.addLayer({
          id: TRACK_LINE_LAYER,
          type: "line",
          source: TRACK_LINE_SOURCE,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "hsl(142, 71%, 45%)",
            "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 17, 6],
          },
        });
      }
      if (!m.getSource(TRACK_VERTS_SOURCE)) {
        m.addSource(TRACK_VERTS_SOURCE, { type: "geojson", data: buildVerts() });
      }
      if (!m.getLayer(TRACK_VERTS_LAYER)) {
        m.addLayer({
          id: TRACK_VERTS_LAYER,
          type: "circle",
          source: TRACK_VERTS_SOURCE,
          paint: {
            "circle-radius": 5,
            "circle-color": "#ffffff",
            "circle-stroke-color": "hsl(142, 71%, 45%)",
            "circle-stroke-width": 2,
          },
        });
      }

      if (!m.getSource(SOURCE_ID)) {
        m.addSource(SOURCE_ID, { type: "geojson", data: buildFeatureCollection() });
      }
      if (!m.getLayer(LAYER_ID)) {
        m.addLayer({
          id: LAYER_ID,
          type: "symbol",
          source: SOURCE_ID,
          layout: {
            "icon-image": [
              "match",
              ["get", "color"],
              "red", "flag-red",
              "grey", "flag-grey",
              "black", "flag-black",
              "flag-yellow",
            ],
            "icon-size": 0.92,
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,   // flags may sit on top of each other
            "icon-ignore-placement": true,
          },
        });
      }
      readyRef.current = true;
      refreshSource();
      refreshTrackSource();
    };
    m.on("load", onLoad);

    // --- Click: flags (popup/add), or track editing (vertex delete / insert / append) ---
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: [LAYER_ID] });
      if (feats.length) {
        if (!isAdminRef.current) return;
        const f = feats[0];
        const flagId = (f.properties as { flagId?: string })?.flagId;
        if (!flagId) return;
        const coord = (f.geometry as GeoJSON.Point).coordinates as LngLatTuple;
        openFlagPopup(flagId, coord, editable());
        return;
      }

      if (trackEditable()) {
        const box: [mapboxgl.PointLike, mapboxgl.PointLike] = [
          [e.point.x - 8, e.point.y - 8],
          [e.point.x + 8, e.point.y + 8],
        ];
        const vFeats = m.queryRenderedFeatures(box, { layers: [TRACK_VERTS_LAYER] });
        if (vFeats.length) {
          const vi = (vFeats[0].properties as { vertIndex?: number })?.vertIndex;
          const coord = (vFeats[0].geometry as GeoJSON.Point).coordinates as LngLat;
          if (typeof vi === "number") openVertPopup(vi, coord);
          return;
        }
        const lFeats = m.queryRenderedFeatures(box, { layers: [TRACK_LINE_LAYER] });
        if (lFeats.length) {
          insertVertex(e.lngLat);
          return;
        }
        // empty map → append a point to the end of the track
        commitTrackPoints([...trackPointsRef.current.map((p) => [p[0], p[1]] as LngLat), [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }

      if (!editable()) return;
      addFlagRef.current(e.lngLat.lng, e.lngLat.lat);
    };
    m.on("click", onClick);

    // --- Hover cursor over flags ---
    const onEnter = () => { canvas().style.cursor = editable() ? "move" : isAdminRef.current ? "pointer" : ""; };
    const onLeave = () => { canvas().style.cursor = editable() ? "crosshair" : ""; };
    m.on("mouseenter", LAYER_ID, onEnter);
    m.on("mouseleave", LAYER_ID, onLeave);

    // --- Drag a flag to move it. Move/up are bound on `window`, not the
    // canvas-only public map events, so releasing the mouse OUTSIDE the map
    // still ends the drag (otherwise the flag stays stuck to the cursor). A 3px
    // threshold (matching Mapbox's clickTolerance) keeps a jittery click from
    // being treated as a move. ---
    const DRAG_THRESHOLD = 3;
    const clientToLngLat = (clientX: number, clientY: number): LngLatTuple => {
      const rect = m.getCanvasContainer().getBoundingClientRect();
      const ll = m.unproject([clientX - rect.left, clientY - rect.top]);
      return [ll.lng, ll.lat];
    };
    const onWinUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onWinMove);
      window.removeEventListener("mouseup", onWinUp);
      const id = draggingIdRef.current;
      const moved = dragMovedRef.current;
      const last = dragLngLatRef.current;
      draggingIdRef.current = null;
      dragLngLatRef.current = null;
      dragMovedRef.current = false;
      dragStartPointRef.current = null;
      canvas().style.cursor = editable() ? "crosshair" : "";
      if (id && moved && last) moveFlagRef.current(id, last[0], last[1]);
      else refreshSource();
    };
    const onWinMove = (ev: MouseEvent) => {
      if (!draggingIdRef.current) return;
      if (ev.buttons === 0) { onWinUp(ev); return; } // released somewhere we missed
      const start = dragStartPointRef.current;
      if (!dragMovedRef.current) {
        if (start && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        dragMovedRef.current = true;
      }
      dragLngLatRef.current = clientToLngLat(ev.clientX, ev.clientY);
      refreshSource();
    };
    const onDragStart = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!editable() || !e.features?.length) return;
      e.preventDefault(); // stop the map from panning
      const flagId = (e.features[0].properties as { flagId?: string })?.flagId;
      if (!flagId) return;
      draggingIdRef.current = flagId;
      dragMovedRef.current = false;
      dragLngLatRef.current = null;
      dragStartPointRef.current = { x: e.originalEvent.clientX, y: e.originalEvent.clientY };
      canvas().style.cursor = "grabbing";
      window.addEventListener("mousemove", onWinMove);
      window.addEventListener("mouseup", onWinUp);
    };
    m.on("mousedown", LAYER_ID, onDragStart);

    // --- Touch drag (tablets). touchend reliably reaches the canvas (implicit
    // target capture), so map events are fine here; same 3px threshold. ---
    const onTouchMove = (e: mapboxgl.MapTouchEvent) => {
      if (!draggingIdRef.current) return;
      e.preventDefault();
      const start = dragStartPointRef.current;
      if (!dragMovedRef.current) {
        if (start && Math.hypot(e.point.x - start.x, e.point.y - start.y) < DRAG_THRESHOLD) return;
        dragMovedRef.current = true;
      }
      dragLngLatRef.current = [e.lngLat.lng, e.lngLat.lat];
      refreshSource();
    };
    const onTouchEnd = () => {
      m.off("touchmove", onTouchMove);
      const id = draggingIdRef.current;
      const moved = dragMovedRef.current;
      const last = dragLngLatRef.current;
      draggingIdRef.current = null;
      dragLngLatRef.current = null;
      dragMovedRef.current = false;
      dragStartPointRef.current = null;
      if (id && moved && last) moveFlagRef.current(id, last[0], last[1]);
      else refreshSource();
    };
    const onTouchStart = (e: mapboxgl.MapLayerTouchEvent) => {
      if (!editable() || !e.features?.length || e.points.length !== 1) return;
      e.preventDefault();
      const flagId = (e.features[0].properties as { flagId?: string })?.flagId;
      if (!flagId) return;
      draggingIdRef.current = flagId;
      dragMovedRef.current = false;
      dragLngLatRef.current = null;
      dragStartPointRef.current = { x: e.point.x, y: e.point.y };
      m.on("touchmove", onTouchMove);
      m.once("touchend", onTouchEnd);
    };
    m.on("touchstart", LAYER_ID, onTouchStart);

    // --- Track vertex drag (mirrors the flag drag exactly, with its own state) ---
    const onVertWinUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onVertWinMove);
      window.removeEventListener("mouseup", onVertWinUp);
      const vi = vDragIdxRef.current;
      const moved = vDragMovedRef.current;
      const last = vDragLngLatRef.current;
      vDragIdxRef.current = null;
      vDragLngLatRef.current = null;
      vDragMovedRef.current = false;
      vDragStartRef.current = null;
      canvas().style.cursor = trackEditable() ? "crosshair" : "";
      if (vi != null && moved && last) moveVertex(vi, last[0], last[1]);
      else refreshTrackSource();
    };
    const onVertWinMove = (ev: MouseEvent) => {
      if (vDragIdxRef.current == null) return;
      if (ev.buttons === 0) { onVertWinUp(ev); return; }
      const start = vDragStartRef.current;
      if (!vDragMovedRef.current) {
        if (start && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        vDragMovedRef.current = true;
      }
      vDragLngLatRef.current = clientToLngLat(ev.clientX, ev.clientY);
      refreshTrackSource();
    };
    const onVertDragStart = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!trackEditable() || !e.features?.length) return;
      e.preventDefault();
      const vi = (e.features[0].properties as { vertIndex?: number })?.vertIndex;
      if (typeof vi !== "number") return;
      vDragIdxRef.current = vi;
      vDragMovedRef.current = false;
      vDragLngLatRef.current = null;
      vDragStartRef.current = { x: e.originalEvent.clientX, y: e.originalEvent.clientY };
      canvas().style.cursor = "grabbing";
      window.addEventListener("mousemove", onVertWinMove);
      window.addEventListener("mouseup", onVertWinUp);
    };
    m.on("mousedown", TRACK_VERTS_LAYER, onVertDragStart);

    const onVertTouchMove = (e: mapboxgl.MapTouchEvent) => {
      if (vDragIdxRef.current == null) return;
      e.preventDefault();
      const start = vDragStartRef.current;
      if (!vDragMovedRef.current) {
        if (start && Math.hypot(e.point.x - start.x, e.point.y - start.y) < DRAG_THRESHOLD) return;
        vDragMovedRef.current = true;
      }
      vDragLngLatRef.current = [e.lngLat.lng, e.lngLat.lat];
      refreshTrackSource();
    };
    const onVertTouchEnd = () => {
      m.off("touchmove", onVertTouchMove);
      const vi = vDragIdxRef.current;
      const moved = vDragMovedRef.current;
      const last = vDragLngLatRef.current;
      vDragIdxRef.current = null;
      vDragLngLatRef.current = null;
      vDragMovedRef.current = false;
      vDragStartRef.current = null;
      if (vi != null && moved && last) moveVertex(vi, last[0], last[1]);
      else refreshTrackSource();
    };
    const onVertTouchStart = (e: mapboxgl.MapLayerTouchEvent) => {
      if (!trackEditable() || !e.features?.length || e.points.length !== 1) return;
      e.preventDefault();
      const vi = (e.features[0].properties as { vertIndex?: number })?.vertIndex;
      if (typeof vi !== "number") return;
      vDragIdxRef.current = vi;
      vDragMovedRef.current = false;
      vDragLngLatRef.current = null;
      vDragStartRef.current = { x: e.point.x, y: e.point.y };
      m.on("touchmove", onVertTouchMove);
      m.once("touchend", onVertTouchEnd);
    };
    m.on("touchstart", TRACK_VERTS_LAYER, onVertTouchStart);

    const onVertEnter = () => { canvas().style.cursor = trackEditable() ? "move" : ""; };
    const onVertLeave = () => { canvas().style.cursor = trackEditable() ? "crosshair" : ""; };
    m.on("mouseenter", TRACK_VERTS_LAYER, onVertEnter);
    m.on("mouseleave", TRACK_VERTS_LAYER, onVertLeave);

    // Car marker — plain HTML marker (inherits Mapbox's absolute positioning,
    // so it tracks the map correctly). Hidden until the car is online.
    const carEl = document.createElement("div");
    carEl.className = "car-marker";
    carEl.style.cssText = `
      width: 16px; height: 16px; background: hsl(142, 71%, 45%);
      border-radius: 50%; border: 2px solid white;
      box-shadow: 0 0 12px hsl(142, 71%, 45%); animation: pulse 2s infinite; display: none;
    `;
    carMarkerRef.current = new mapboxgl.Marker({ element: carEl })
      .setLngLat([track.bounds[0][0], track.bounds[0][1]])
      .addTo(m);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleResize);
      if (resizeRafRef.current != null) cancelAnimationFrame(resizeRafRef.current);
      window.removeEventListener("mousemove", onWinMove);
      window.removeEventListener("mouseup", onWinUp);
      window.removeEventListener("mousemove", onVertWinMove);
      window.removeEventListener("mouseup", onVertWinUp);
      readyRef.current = false;
      refreshSourceRef.current = () => {};
      refreshTrackSourceRef.current = () => {};
      colorPopupRef.current?.remove();
      colorPopupRef.current = null;
      vertPopupRef.current?.remove();
      vertPopupRef.current = null;
      carMarkerRef.current?.remove();
      carMarkerRef.current = null;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push flag changes into the GL source, and keep an open popup locked to its
  // flag if that flag is moved or deleted concurrently by another client.
  useEffect(() => {
    flagsRef.current = flags;
    if (readyRef.current) refreshSourceRef.current();

    const popup = colorPopupRef.current;
    const id = popupFlagIdRef.current;
    if (popup && id) {
      const f = flags[id];
      if (!f) {
        popup.remove();
      } else {
        const cur = popup.getLngLat();
        if (cur.lng !== f.lng || cur.lat !== f.lat) popup.setLngLat([f.lng, f.lat]);
      }
    }
  }, [flags]);

  // Car marker position.
  useEffect(() => {
    if (!carMarkerRef.current || !map.current) return;
    const el = carMarkerRef.current.getElement();
    if (!el) return;
    if (!isCarOnline) { el.style.display = "none"; return; }
    el.style.display = "block";
    if (position.lat !== 0 && position.lng !== 0) {
      carMarkerRef.current.setLngLat([position.lng, position.lat]);
    }
  }, [position, isCarOnline]);

  // Crosshair cursor + no double-click-zoom while placing flags or editing the track.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const placing = isAdmin && (editMode || trackEditMode);
    const canvas = m.getCanvas();
    if (canvas) canvas.style.cursor = placing ? "crosshair" : "";
    if (placing) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
  }, [editMode, trackEditMode, isAdmin]);

  // Fit bounds when track changes.
  useEffect(() => {
    if (map.current) {
      map.current.fitBounds(track.bounds, { padding: 10, duration: 1000 });
    }
  }, [selectedTrack, track.bounds]);

  // Record each new phone fix into the buffer while recording, drawing the live
  // breadcrumb. Heavy cleanup happens on Done; here we only drop obvious junk.
  // De-dupe on POSITION, not the telemetry timestamp (that column is frozen — the
  // phone only updates updated_at), and stamp receipt time as the fix time.
  useEffect(() => {
    if (!recordMode || !isCarOnline) return;
    if (position.lat === 0 && position.lng === 0) return;
    if (accuracy > 20) return; // momentary bad fix (cleanup re-gates at 15 m)
    const prev = recordedRef.current[recordedRef.current.length - 1];
    if (prev && prev.lng === position.lng && prev.lat === position.lat) return; // re-delivered fix
    recordedRef.current.push({ lng: position.lng, lat: position.lat, accuracy, speed, t: Date.now() });
    if (readyRef.current) refreshTrackSourceRef.current();
  }, [position, recordMode, isCarOnline, accuracy, speed]);

  // Show/hide the vertex handles when entering/leaving track-edit mode.
  useEffect(() => {
    if (readyRef.current) refreshTrackSourceRef.current();
  }, [trackEditMode]);

  const fitToTrack = (pts: LngLat[]) => {
    const m = map.current;
    if (!m || pts.length < 2) return;
    const b = new mapboxgl.LngLatBounds();
    pts.forEach((p) => b.extend(p as [number, number]));
    m.fitBounds(b, { padding: 30, duration: 800 });
  };

  const startRecording = () => {
    if (!isAdmin) return;
    setEditMode(false);
    setTrackEditMode(false);
    recordedRef.current = [];
    trackPointsRef.current = [];
    refreshTrackSourceRef.current();
    setRecordMode(true);
  };

  const stopRecording = () => {
    setRecordMode(false);
    const lat0 = (track.bounds[0][1] + track.bounds[1][1]) / 2;
    const { points } = cleanTrack(recordedRef.current, lat0);
    recordedRef.current = [];
    // Too few usable fixes (no GPS lock / mis-tap): keep any previously-saved track
    // instead of overwriting it with nothing. trackPointsRef still holds it.
    if (points.length < 2) {
      refreshTrackSourceRef.current();
      return;
    }
    trackPointsRef.current = points;
    refreshTrackSourceRef.current();
    savePath(points);
    fitToTrack(points);
  };

  const toggleTrackEdit = () => {
    if (!isAdmin) return;
    setTrackEditMode((v) => {
      const next = !v;
      if (next) {
        setEditMode(false);
        setRecordMode(false);
      }
      return next;
    });
  };

  const deleteTrack = () => {
    if (!isAdmin) return;
    setTrackEditMode(false);
    trackPointsRef.current = [];
    refreshTrackSourceRef.current();
    clearPath();
  };

  const handleTrackChange = (trackName: TrackName) => setSelectedTrack(trackName);

  return (
    <div className={cn("glass-card relative rounded-2xl p-4 flex flex-col", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-racing-green" strokeWidth={1.5} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-muted-foreground text-sm font-medium uppercase tracking-wide hover:text-foreground transition-colors">
                {track.name}
                <ChevronDown className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-card border-border z-50">
              {(Object.keys(tracks) as TrackName[]).map((trackKey) => (
                <DropdownMenuItem
                  key={trackKey}
                  onClick={() => handleTrackChange(trackKey)}
                  className={cn("cursor-pointer", selectedTrack === trackKey && "bg-muted")}
                >
                  {tracks[trackKey].name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isAdmin && !gridEditMode && (
          <div className="flex items-center gap-1">
            {recordMode ? (
              <Button
                variant="destructive"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={stopRecording}
                title="Stop recording, clean up and save the track"
              >
                <Square className="w-3 h-3" />
                Stop
              </Button>
            ) : trackEditMode ? (
              <>
                <Button
                  variant="default"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={toggleTrackEdit}
                  title="Finish editing the track"
                >
                  <Check className="w-3 h-3" />
                  Done
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-racing-red"
                  onClick={deleteTrack}
                  title="Delete this track"
                >
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant={editMode ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setEditMode((v) => !v)}
                  title={editMode ? "Finish editing flags" : "Edit flag positions"}
                >
                  {editMode ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                  {editMode ? "Done" : "Flags"}
                </Button>
                {editMode && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={resetFlags}
                    title="Set all flags to neutral"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                )}
                {!editMode && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs gap-1"
                      onClick={startRecording}
                      title="Record a new track by driving the circuit"
                    >
                      <Circle className="w-3 h-3 fill-racing-red text-racing-red" />
                      Record
                    </Button>
                    {path.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={toggleTrackEdit}
                        title="Tweak the track shape"
                      >
                        <Route className="w-3 h-3" />
                        Track
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className="relative flex-1 w-full min-h-0 rounded-lg overflow-hidden">
        <style>{`
          .flag-popup-custom .mapboxgl-popup-content {
            background: hsl(222.2 47.4% 11.2%);
            border-radius: 8px;
            border: 1px solid hsl(217.2 32.6% 17.5%);
            padding: 0;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          }
          .flag-popup-custom .mapboxgl-popup-tip {
            border-top-color: hsl(222.2 47.4% 11.2%);
            border-bottom-color: hsl(222.2 47.4% 11.2%);
          }
        `}</style>
        <div ref={mapContainer} className="no-drag absolute inset-0 [&_.mapboxgl-ctrl-logo]:hidden" />
        {isAdmin && (editMode || recordMode || trackEditMode) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-md border border-border/40 shadow-lg text-[11px] text-foreground whitespace-nowrap pointer-events-none flex items-center gap-2">
            {recordMode && (
              <>
                <span className="w-2 h-2 rounded-full bg-racing-red animate-pulse" />
                Recording — drive the circuit, then press Stop
              </>
            )}
            {trackEditMode && "Drag a point to move · click the line to add · click a point to delete"}
            {editMode && "Click map to add · drag flag to move · click flag to recolour / delete"}
          </div>
        )}
      </div>
      <div className="mt-3 p-3 rounded-xl bg-background/30 backdrop-blur-md border border-border/30 shadow-lg">
        <div className="flex items-center gap-3 justify-center">
          {(["grey", "yellow", "red"] as FlagColor[]).map((color) => (
            <div key={color} className="flex items-center gap-1.5">
              <Flag className="w-4 h-4" style={{ fill: flagColors[color], color: flagColors[color] }} />
              <span className="text-xs text-muted-foreground">{flagLabels[color]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-2">
        <span>Lat: {position.lat !== 0 ? position.lat.toFixed(5) : "--"}°</span>
        <span className={cn(
          "px-1.5 py-0.5 rounded text-xs",
          isCarOnline ? "bg-racing-green/20 text-racing-green" : "bg-muted text-muted-foreground"
        )}>
          {isCarOnline ? "LIVE" : "OFFLINE"}
        </span>
        <span>Lng: {position.lng !== 0 ? position.lng.toFixed(5) : "--"}°</span>
      </div>
    </div>
  );
});

GPSTrack.displayName = "GPSTrack";

export default GPSTrack;
