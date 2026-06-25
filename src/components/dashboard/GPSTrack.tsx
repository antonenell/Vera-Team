import { useState, useEffect, useRef } from "react";
import { MapPin, Flag, RotateCcw, ChevronDown, Pencil, Check } from "lucide-react";
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

const MAPBOX_TOKEN = "pk.eyJ1IjoiY2FybGJlcmdlIiwiYSI6ImNsMnh3OXZrYTBsNzUzaWp6NzlvdDM4bzgifQ.YiaCxeUA5RaJn7071yd42A";

const SOURCE_ID = "flags-source";
const LAYER_ID = "flags-layer";

interface GPSTrackProps {
  position: { lat: number; lng: number };
  className?: string;
  isAdmin?: boolean;
  isCarOnline?: boolean;
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

// A filled flag-on-a-pole, drawn so the pole base sits at the bottom edge (the
// icon is anchored 'bottom', so the base lands exactly on the coordinate).
const flagImageSvg = (hex: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48">
    <path d="M15 5 L15 45" fill="none" stroke="#0b0b12" stroke-width="3" stroke-linecap="round"/>
    <path d="M15 6 L37 6 L31.5 13.5 L37 21 L15 21 Z" fill="${hex}" stroke="#0b0b12" stroke-width="2.5" stroke-linejoin="round"/>
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

const GPSTrack = ({ position, className, isAdmin = false, isCarOnline = false }: GPSTrackProps) => {
  const [selectedTrack, setSelectedTrack] = useState<TrackName>("stora-holm");
  const [editMode, setEditMode] = useState(false);
  const track = tracks[selectedTrack];

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);

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

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const m = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/carlberge/cmj42ghcf009601r47hgyaiku/draft",
      bounds: track.bounds,
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
    });
    map.current = m;

    const resizeObserver = new ResizeObserver(() => m.resize());
    resizeObserver.observe(mapContainer.current);

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

    const editable = () => isAdminRef.current && editModeRef.current;

    const onLoad = async () => {
      await Promise.all([
        loadFlagImage(m, "flag-yellow", getFlagColorHex("yellow")),
        loadFlagImage(m, "flag-red", getFlagColorHex("red")),
        loadFlagImage(m, "flag-grey", getFlagColorHex("grey")),
        loadFlagImage(m, "flag-black", getFlagColorHex("black")),
      ]);
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
    };
    m.on("load", onLoad);

    // --- Click: open a flag's popup, or add a flag on empty map (edit mode) ---
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
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", onWinMove);
      window.removeEventListener("mouseup", onWinUp);
      readyRef.current = false;
      refreshSourceRef.current = () => {};
      colorPopupRef.current?.remove();
      colorPopupRef.current = null;
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

  // Crosshair cursor + no double-click-zoom while placing flags.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const placing = isAdmin && editMode;
    const canvas = m.getCanvas();
    if (canvas) canvas.style.cursor = placing ? "crosshair" : "";
    if (placing) m.doubleClickZoom.disable();
    else m.doubleClickZoom.enable();
  }, [editMode, isAdmin]);

  // Fit bounds when track changes.
  useEffect(() => {
    if (map.current) {
      map.current.fitBounds(track.bounds, { padding: 10, duration: 1000 });
    }
  }, [selectedTrack, track.bounds]);

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
        {isAdmin && (
          <div className="flex items-center gap-1">
            <Button
              variant={editMode ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => setEditMode((v) => !v)}
              title={editMode ? "Finish editing flags" : "Edit flag positions"}
            >
              {editMode ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              {editMode ? "Done" : "Edit"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={resetFlags}
              title="Set all flags to neutral"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
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
        <div ref={mapContainer} className="absolute inset-0 [&_.mapboxgl-ctrl-logo]:hidden" />
        {isAdmin && editMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-md border border-border/40 shadow-lg text-[11px] text-foreground whitespace-nowrap pointer-events-none">
            Click map to add · drag flag to move · click flag to recolour / delete
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
};

export default GPSTrack;
