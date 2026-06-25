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

const flagSvg = (hex: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${hex}" stroke="${hex}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;

/** DOM for a single flag marker: a frosted box holding the flag icon plus a
 *  delete badge that is only revealed in edit mode. */
const createFlagElement = (color: FlagColor) => {
  const el = document.createElement("div");
  el.className = "flag-marker";
  el.style.cssText = `
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: rgba(30, 30, 40, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  `;

  const icon = document.createElement("div");
  icon.style.cssText = "display:flex;align-items:center;justify-content:center;pointer-events:none;";
  icon.innerHTML = flagSvg(getFlagColorHex(color));
  el.appendChild(icon);

  const del = document.createElement("button");
  del.className = "flag-delete";
  del.setAttribute("aria-label", "Delete flag");
  del.innerHTML = "&times;";
  del.style.cssText = `
    position: absolute;
    top: -8px;
    right: -8px;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid white;
    border-radius: 50%;
    background: #DC2626;
    color: white;
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
    display: none;
    align-items: center;
    justify-content: center;
  `;
  // Stop a press on the badge from entering Mapbox's marker-drag state — the
  // map-level mousedown/touchstart handler only checks element.contains(target),
  // so without this a slightly-dragged delete press relocates the flag instead.
  del.addEventListener("mousedown", (e) => e.stopPropagation());
  del.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
  el.appendChild(del);

  return { el, icon, del };
};

interface MarkerRefs {
  marker: mapboxgl.Marker;
  icon: HTMLDivElement;
  del: HTMLButtonElement;
}

// Flags are anchored at their base (bottom-centre) on the click point. This
// offset keeps the colour popup glued to the flag no matter which side Mapbox
// auto-picks to keep it in view, so it never drifts off to the side.
const FLAG_POPUP_OFFSET: Record<string, [number, number]> = {
  top: [0, 0],
  bottom: [0, -46],
  left: [22, -24],
  right: [-22, -24],
  center: [0, -24],
  "top-left": [14, 0],
  "top-right": [-14, 0],
  "bottom-left": [14, -46],
  "bottom-right": [-14, -46],
};

// The only flag colours the marshals use.
const FLAG_OPTIONS: { color: FlagColor; label: string }[] = [
  { color: "yellow", label: "Caution" },
  { color: "red", label: "Danger" },
];

const GPSTrack = ({ position, className, isAdmin = false, isCarOnline = false }: GPSTrackProps) => {
  const [selectedTrack, setSelectedTrack] = useState<TrackName>("stora-holm");
  const [editMode, setEditMode] = useState(false);
  const track = tracks[selectedTrack];

  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, MarkerRefs>>(new Map());
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  // Flag currently being dragged — its position must not be reconciled from
  // under the cursor if a realtime update arrives mid-drag.
  const draggingIdRef = useRef<string | null>(null);
  // The single open colour popup, so opening another doesn't stack them.
  const colorPopupRef = useRef<mapboxgl.Popup | null>(null);
  // Timestamp of the last placed flag, to swallow the 2nd click of a double-click.
  const lastAddRef = useRef(0);

  const { flags, addFlag, moveFlag, deleteFlag, updateFlagColor, resetFlags } =
    useTrackFlags(isAdmin, selectedTrack);

  // Refs so the long-lived marker/map event handlers always see current values.
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

  // Leaving admin (e.g. sign-out) must also leave edit mode.
  useEffect(() => {
    if (!isAdmin && editMode) setEditMode(false);
  }, [isAdmin, editMode]);

  // Open the colour picker popup for a flag (admin, non-edit mode).
  const openColorPopup = (flagId: string, lngLat: [number, number]) => {
    if (!map.current) return;
    // Close any popup already open — marker clicks stopPropagation, which defeats
    // Mapbox's own closeOnClick, so we manage single-popup ourselves.
    colorPopupRef.current?.remove();
    const content = document.createElement("div");
    content.style.cssText = "display:flex;flex-direction:column;gap:4px;padding:8px;";

    const popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: true,
      offset: FLAG_POPUP_OFFSET,
      className: "flag-popup-custom",
    });

    FLAG_OPTIONS.forEach(({ color, label }) => {
      const btn = document.createElement("button");
      btn.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 12px;background:transparent;border:none;border-radius:4px;color:hsl(210 40% 98%);font-size:12px;cursor:pointer;transition:background 0.2s;`;
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

    popup.setDOMContent(content).setLngLat(lngLat).addTo(map.current);
    colorPopupRef.current = popup;
    popup.on("close", () => {
      if (colorPopupRef.current === popup) colorPopupRef.current = null;
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

    const resizeObserver = new ResizeObserver(() => {
      m.resize();
    });
    resizeObserver.observe(mapContainer.current);

    // Click on empty map (edit mode + admin) places a new flag. Mapbox fires a
    // `click` for each half of a double-click, so swallow a 2nd click that lands
    // within 300ms to avoid placing two stacked flags.
    const onMapClick = (e: mapboxgl.MapMouseEvent) => {
      if (!isAdminRef.current || !editModeRef.current) return;
      const now = Date.now();
      if (now - lastAddRef.current < 300) return;
      lastAddRef.current = now;
      addFlagRef.current(e.lngLat.lng, e.lngLat.lat);
    };
    m.on("click", onMapClick);

    // Car marker - hidden until online.
    const carEl = document.createElement("div");
    carEl.className = "car-marker";
    carEl.style.cssText = `
      width: 16px;
      height: 16px;
      background: hsl(142, 71%, 45%);
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 0 12px hsl(142, 71%, 45%);
      animation: pulse 2s infinite;
      display: none;
    `;
    carMarkerRef.current = new mapboxgl.Marker({ element: carEl })
      .setLngLat([track.bounds[0][0], track.bounds[0][1]])
      .addTo(m);

    return () => {
      resizeObserver.disconnect();
      m.off("click", onMapClick);
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      carMarkerRef.current?.remove();
      carMarkerRef.current = null;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update car marker position when GPS data changes.
  useEffect(() => {
    if (!carMarkerRef.current || !map.current) return;
    const el = carMarkerRef.current.getElement();
    if (!el) return;

    if (!isCarOnline) {
      el.style.display = "none";
      return;
    }
    el.style.display = "block";
    if (position.lat !== 0 && position.lng !== 0) {
      carMarkerRef.current.setLngLat([position.lng, position.lat]);
    }
  }, [position, isCarOnline]);

  // Reconcile flag markers with the live flag set + edit mode.
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;
    const editable = isAdmin && editMode;
    const seen = new Set<string>();

    Object.values(flags).forEach((flag: FlagData) => {
      seen.add(flag.flagId);
      let refs = markersRef.current.get(flag.flagId);

      if (!refs) {
        const { el, icon, del } = createFlagElement(flag.color);
        const marker = new mapboxgl.Marker({ element: el, draggable: false, anchor: "bottom" })
          .setLngLat([flag.lng, flag.lat])
          .addTo(m);

        // Click → colour popup (admin, non-edit mode only).
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!isAdminRef.current || editModeRef.current) return;
          const ll = marker.getLngLat();
          openColorPopup(flag.flagId, [ll.lng, ll.lat]);
        });

        // Drag → persist new position.
        marker.on("dragstart", () => {
          draggingIdRef.current = flag.flagId;
        });
        marker.on("dragend", () => {
          draggingIdRef.current = null;
          const ll = marker.getLngLat();
          moveFlagRef.current(flag.flagId, ll.lng, ll.lat);
        });

        // Delete badge.
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteFlagRef.current(flag.flagId);
        });

        refs = { marker, icon, del };
        markersRef.current.set(flag.flagId, refs);
      } else {
        // Don't fight an in-progress drag; otherwise keep position in sync.
        const cur = refs.marker.getLngLat();
        if (
          draggingIdRef.current !== flag.flagId &&
          (cur.lng !== flag.lng || cur.lat !== flag.lat)
        ) {
          refs.marker.setLngLat([flag.lng, flag.lat]);
        }
      }

      refs.icon.innerHTML = flagSvg(getFlagColorHex(flag.color));
      refs.marker.setDraggable(editable);
      refs.del.style.display = editable ? "flex" : "none";
      refs.marker.getElement().style.cursor = editable
        ? "move"
        : isAdmin
          ? "pointer"
          : "default";
    });

    // Remove markers whose flag is gone.
    markersRef.current.forEach((refs, id) => {
      if (!seen.has(id)) {
        refs.marker.remove();
        markersRef.current.delete(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags, editMode, isAdmin]);

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

  const handleTrackChange = (trackName: TrackName) => {
    setSelectedTrack(trackName);
  };

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
                  className={cn(
                    "cursor-pointer",
                    selectedTrack === trackKey && "bg-muted"
                  )}
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
              title="Set all flags to yellow"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
      <div className="relative flex-1 w-full min-h-0 rounded-lg overflow-hidden">
        {/* Custom popup styles */}
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
        {/* Mapbox Map */}
        <div ref={mapContainer} className="absolute inset-0 [&_.mapboxgl-ctrl-logo]:hidden" />
        {/* Edit-mode hint */}
        {isAdmin && editMode && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-md border border-border/40 shadow-lg text-[11px] text-foreground whitespace-nowrap pointer-events-none">
            Click map to add · drag to move · × to delete
          </div>
        )}
      </div>
      {/* Flag legend with frosted glass effect */}
      <div className="mt-3 p-3 rounded-xl bg-background/30 backdrop-blur-md border border-border/30 shadow-lg">
        <div className="flex items-center gap-3 justify-center">
          {(["yellow", "red"] as FlagColor[]).map((color) => (
            <div key={color} className="flex items-center gap-1.5">
              <Flag
                className="w-4 h-4"
                style={{
                  fill: flagColors[color],
                  color: flagColors[color]
                }}
              />
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
