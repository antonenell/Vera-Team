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
  const [activeFlagId, setActiveFlagId] = useState<number | null>(null);
  const track = tracks[selectedTrack];
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const [flags, setFlags] = useState<Record<TrackName, TurnFlag[]>>({
    "stora-holm": tracks["stora-holm"].defaultFlags.map(f => ({ ...f, color: "grey" as FlagColor })),
    "silesia-ring": tracks["silesia-ring"].defaultFlags.map(f => ({ ...f, color: "grey" as FlagColor })),
  });

  const currentFlags = flags[selectedTrack];
  const activeFlag = currentFlags.find(f => f.id === activeFlagId);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/satellite-v9",
      bounds: track.bounds,
      fitBoundsOptions: { padding: 10 },
      attributionControl: false,
    });

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Create flag color helper
  const getFlagColorHex = (color: FlagColor): string => {
    switch (color) {
      case "yellow": return "#FACC15";
      case "red": return "#EF4444";
      case "black": return "#171717";
      default: return "#FFFFFF"; // White for inactive/grey - more visible
    }
  };

  const getFlagStrokeHex = (color: FlagColor): string => {
    switch (color) {
      case "yellow": return "#A16207";
      case "red": return "#991B1B";
      case "black": return "#000000";
      default: return "#71717A"; // Grey stroke for inactive
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
        filter: drop-shadow(0 0 6px rgba(255,255,255,0.8)) drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        transition: transform 0.2s ease;
      `;
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${getFlagColorHex(flag.color)}" stroke="${getFlagStrokeHex(flag.color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;
      
      el.addEventListener("mouseenter", () => {
        el.style.transform = "scale(1.2)";
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "scale(1)";
      });
      
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(flag.coords)
        .addTo(map.current!);
      
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setActiveFlagId(prev => prev === flag.id ? null : flag.id);
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
    setActiveFlagId(null);
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
      <div className="relative flex-1 w-full min-h-0 rounded-lg overflow-hidden" onClick={() => setActiveFlagId(null)}>
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

        {/* Flag color picker popup */}
        {activeFlag && (
          <div className="absolute top-2 left-2 z-20 bg-card border border-border rounded-lg p-2 shadow-lg">
            <div className="text-xs text-muted-foreground mb-2">Flag {activeFlag.id}</div>
            <div className="flex gap-1">
              {(Object.keys(flagColors) as FlagColor[]).map((color) => (
                <button
                  key={color}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateFlagColor(activeFlag.id, color);
                  }}
                  className={cn(
                    "w-8 h-8 rounded flex items-center justify-center border-2 transition-all",
                    activeFlag.color === color ? "border-foreground scale-110" : "border-transparent hover:border-muted-foreground"
                  )}
                  title={flagLabels[color]}
                >
                  <Flag 
                    className="w-5 h-5" 
                    fill={color === "grey" ? "#FFFFFF" : flagColors[color]}
                    stroke={color === "grey" ? "#71717A" : flagColors[color]}
                    strokeWidth={2}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-2">
        <span>Lat: {(50.123 + position.x * 0.001).toFixed(4)}°</span>
        <span>Lon: {(8.234 + position.y * 0.001).toFixed(4)}°</span>
      </div>
    </div>
  );
};

export default GPSTrack;
