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

const MAPBOX_TOKEN = "pk.eyJ1IjoiY2FybGJlcmdlIiwiYSI6ImNsMnh3OXZrYTBsNzUzaWp6NzlvdDM4bzgifQ.YiaCxeUA5RaJn7071yd42A";

interface GPSTrackProps {
  position: { x: number; y: number };
  className?: string;
}

type FlagColor = "grey" | "yellow" | "red" | "black";
type TrackName = "stora-holm" | "silesia-ring";

interface TurnFlag {
  id: number;
  coords: [number, number]; // [lng, lat]
  color: FlagColor;
}

interface TrackConfig {
  name: string;
  bounds: [[number, number], [number, number]]; // [[sw_lng, sw_lat], [ne_lng, ne_lat]]
  defaultFlags: Omit<TurnFlag, "color">[];
}


const tracks: Record<TrackName, TrackConfig> = {
  "stora-holm": {
    name: "Stora Holm",
    bounds: [[11.9127, 57.7745], [11.9228, 57.7779]],
    defaultFlags: [
      { id: 1, coords: [11.9141, 57.7771] }, // 57°46'37.5"N 11°54'50.8"E
      { id: 2, coords: [11.9220, 57.7765] }, // 57°46'35.4"N 11°55'19.3"E
      { id: 3, coords: [11.9196, 57.7751] }, // 57°46'30.5"N 11°55'10.6"E
      { id: 4, coords: [11.9165, 57.7760] }, // 57°46'33.7"N 11°54'59.4"E
    ],
  },
  "silesia-ring": {
    name: "Silesia Ring",
    bounds: [[18.0844, 50.5241], [18.1044, 50.5341]],
    defaultFlags: [],
  },
};

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

const GPSTrack = ({ position, className }: GPSTrackProps) => {
  const [selectedTrack, setSelectedTrack] = useState<TrackName>("stora-holm");
  const track = tracks[selectedTrack];
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [flags, setFlags] = useState<Record<TrackName, TurnFlag[]>>({
    "stora-holm": tracks["stora-holm"].defaultFlags.map(f => ({ ...f, color: "grey" as FlagColor })),
    "silesia-ring": tracks["silesia-ring"].defaultFlags.map(f => ({ ...f, color: "grey" as FlagColor })),
  });

  const currentFlags = flags[selectedTrack];

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/carlberge/cmj42ghcf009601r47hgyaiku",
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

    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, []);

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

    // Add new markers for current track
    currentFlags.forEach((flag) => {
      const el = document.createElement("div");
      el.className = "flag-marker";
      el.style.cssText = `
        cursor: pointer;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
      `;
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${getFlagColorHex(flag.color)}" stroke="${getFlagColorHex(flag.color)}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;
      
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
      
      colors.forEach(({ color, label }) => {
        const btn = document.createElement("button");
        btn.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: ${flag.color === color ? 'hsl(217.2 32.6% 17.5%)' : 'transparent'};
          border: none;
          border-radius: 4px;
          color: hsl(210 40% 98%);
          font-size: 12px;
          cursor: pointer;
          transition: background 0.2s;
        `;
        btn.innerHTML = `
          <span style="width: 12px; height: 12px; border-radius: 50%; background: ${getFlagColorHex(color)}; border: 1px solid rgba(255,255,255,0.2);"></span>
          ${label}
        `;
        btn.addEventListener("mouseenter", () => {
          btn.style.background = "hsl(217.2 32.6% 17.5%)";
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = flag.color === color ? "hsl(217.2 32.6% 17.5%)" : "transparent";
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          updateFlagColor(flag.id, color);
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
      
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        popup.setLngLat(flag.coords).addTo(map.current!);
      });
      
      markersRef.current.push(marker);
    });
  }, [currentFlags, selectedTrack]);

  // Update map when track changes
  useEffect(() => {
    if (map.current) {
      map.current.fitBounds(track.bounds, {
        padding: 10,
        duration: 1000,
      });
    }
  }, [selectedTrack, track.bounds]);

  const updateFlagColor = (flagId: number, color: FlagColor) => {
    setFlags(prev => ({
      ...prev,
      [selectedTrack]: prev[selectedTrack].map(flag => 
        flag.id === flagId ? { ...flag, color } : flag
      ),
    }));
  };

  const resetFlags = () => {
    setFlags(prev => ({
      ...prev,
      [selectedTrack]: prev[selectedTrack].map(flag => ({ ...flag, color: "grey" as FlagColor })),
    }));
  };

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
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={resetFlags}
          title="Reset all flags"
        >
          <RotateCcw className="w-3 h-3" />
        </Button>
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
        
        {/* Car position overlay - will be replaced with actual GPS marker later */}
        <div 
          className="absolute w-3 h-3 rounded-full bg-racing-green animate-pulse z-10 pointer-events-none"
          style={{ 
            left: `${position.x}%`, 
            top: `${position.y}%`,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 12px hsl(var(--racing-green))'
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-2">
        <span>Lat: {(50.123 + position.x * 0.001).toFixed(4)}°</span>
        <span>Lon: {(8.234 + position.y * 0.001).toFixed(4)}°</span>
      </div>
    </div>
  );
};

export default GPSTrack;
