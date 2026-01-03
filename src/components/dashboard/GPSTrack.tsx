import { useState, useEffect, useRef } from "react";
import { MapPin, Flag, RotateCcw, ChevronDown } from "lucide-react";
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
import { useTrackFlags, tracks, TrackName, FlagColor } from "@/hooks/useTrackFlags";

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

const GPSTrack = ({ position, className, isAdmin = false, isCarOnline = false }: GPSTrackProps) => {
  const [selectedTrack, setSelectedTrack] = useState<TrackName>("stora-holm");
  const track = tracks[selectedTrack];
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  
  // Use the real-time synced flags hook
  const { getFlagColor, updateFlagColor, resetFlags } = useTrackFlags(isAdmin, selectedTrack);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/carlberge/cmj42ghcf009601r47hgyaiku/draft",
      bounds: track.bounds,
      fitBoundsOptions: { padding: 20 },
      attributionControl: false,
    });

    // Resize map when container size changes
    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize();
      map.current?.fitBounds(track.bounds, { padding: 20 });
    });
    
    resizeObserver.observe(mapContainer.current);

    // Create car marker - hidden by default until online
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
      .setLngLat([track.bounds[0][0], track.bounds[0][1]]) // Start at corner
      .addTo(map.current);

    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      carMarkerRef.current?.remove();
      carMarkerRef.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update car marker position when GPS data changes
  useEffect(() => {
    if (!carMarkerRef.current || !map.current) return;

    const el = carMarkerRef.current.getElement();
    if (!el) return;

    // Hide marker completely when offline
    if (!isCarOnline) {
      el.style.display = "none";
      return;
    }

    // Show marker and update position when online
    el.style.display = "block";
    if (position.lat !== 0 && position.lng !== 0) {
      carMarkerRef.current.setLngLat([position.lng, position.lat]);
    }
  }, [position, isCarOnline]);

  // Create flag color helper
  const getFlagColorHex = (color: FlagColor): string => {
    switch (color) {
      case "yellow": return "#EAB308";
      case "red": return "#DC2626";
      case "black": return "#1a1a1a";
      default: return "#71717A";
    }
  };

  // Update markers when flags or track changes
  useEffect(() => {
    if (!map.current) return;

    // Remove existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const currentFlags = track.defaultFlags;

    // Add new markers for current track
    currentFlags.forEach((flag) => {
      const color = getFlagColor(flag.id);
      
      const el = document.createElement("div");
      el.className = "flag-marker";
      el.style.cssText = `
        cursor: ${isAdmin ? 'pointer' : 'default'};
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
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${getFlagColorHex(color)}" stroke="${getFlagColorHex(color)}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;
      
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(flag.coords)
        .addTo(map.current!);
      
      // Create popup for color selection
      const popupContent = document.createElement("div");
      popupContent.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px;
      `;
      
      const colors: { color: FlagColor; label: string }[] = [
        { color: "grey", label: "Neutral" },
        { color: "yellow", label: "Caution" },
        { color: "red", label: "Danger" },
        { color: "black", label: "Disqualified" },
      ];
      
      colors.forEach(({ color: colorOption, label }) => {
        const btn = document.createElement("button");
        btn.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: ${color === colorOption ? 'hsl(217.2 32.6% 17.5%)' : 'transparent'};
          border: none;
          border-radius: 4px;
          color: hsl(210 40% 98%);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.2s;
        `;
        btn.innerHTML = `
          <span style="width: 12px; height: 12px; border-radius: 50%; background: ${getFlagColorHex(colorOption)}; border: 1px solid rgba(255,255,255,0.2);"></span>
          ${label}
        `;
        btn.addEventListener("mouseenter", () => {
          btn.style.background = "hsl(217.2 32.6% 17.5%)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = color === colorOption ? "hsl(217.2 32.6% 17.5%)" : "transparent";
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          updateFlagColor(flag.id, colorOption);
          popup.remove();
        });
        popupContent.appendChild(btn);
      });
      
      const popup = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: true,
        offset: 15,
        className: "flag-popup-custom",
      }).setDOMContent(popupContent);
      
      // Only allow click interaction for admins
      if (isAdmin) {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          popup.setLngLat(flag.coords).addTo(map.current!);
        });
      }
      
      markersRef.current.push(marker);
    });
  }, [selectedTrack, isAdmin, getFlagColor, updateFlagColor]);

  // Update map when track changes
  useEffect(() => {
    if (map.current) {
      map.current.fitBounds(track.bounds, {
        padding: 10,
        duration: 1000,
      });
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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={resetFlags}
            title="Reset all flags"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
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
      </div>
      {/* Flag legend with frosted glass effect */}
      <div className="mt-3 p-3 rounded-xl bg-background/30 backdrop-blur-md border border-border/30 shadow-lg">
        <div className="flex items-center gap-3 justify-center">
          {(["grey", "yellow", "red", "black"] as FlagColor[]).map((color) => (
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
