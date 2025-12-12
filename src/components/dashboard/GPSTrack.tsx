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
  x: number;
  y: number;
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
    // Upper left: 57°46'40.3"N 11°54'45.7"E, Lower right: 57°46'28.3"N 11°55'22.0"E
    bounds: [[11.9127, 57.7745], [11.9228, 57.7779]],
    defaultFlags: [
      { id: 1, x: 35, y: 28 },
      { id: 2, x: 65, y: 28 },
      { id: 3, x: 50, y: 71 },
    ],
  },
  "silesia-ring": {
    name: "Silesia Ring",
    bounds: [[18.91, 50.36], [18.93, 50.38]], // Silesia Ring, Poland (placeholder)
    defaultFlags: [
      { id: 1, x: 30, y: 21 },
      { id: 2, x: 70, y: 21 },
      { id: 3, x: 70, y: 71 },
      { id: 4, x: 70, y: 100 },
    ],
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
      style: "mapbox://styles/mapbox/satellite-v9",
      bounds: track.bounds,
      fitBoundsOptions: { padding: 10 },
      attributionControl: false,
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

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
        {/* Mapbox Map */}
        <div ref={mapContainer} className="absolute inset-0 [&_.mapboxgl-ctrl-logo]:hidden" />
        
        {/* Car position overlay */}
        <div 
          className="absolute w-3 h-3 rounded-full bg-racing-green animate-pulse z-10"
          style={{ 
            left: `${position.x}%`, 
            top: `${position.y}%`,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 12px hsl(var(--racing-green))'
          }}
        />
        
        {/* Interactive Flags */}
        {currentFlags.map((flag) => (
          <DropdownMenu key={flag.id}>
            <DropdownMenuTrigger asChild>
              <button
                className="absolute transform -translate-x-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted/50 transition-colors cursor-pointer"
                style={{ 
                  left: `${flag.x}%`, 
                  top: `${flag.y}%`,
                }}
              >
                <Flag 
                  className="w-4 h-4" 
                  fill={flagColors[flag.color]}
                  stroke={flag.color === "grey" ? "hsl(var(--muted-foreground))" : flagColors[flag.color]}
                  strokeWidth={1.5}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-card border-border z-50">
              {(Object.keys(flagColors) as FlagColor[]).map((color) => (
                <DropdownMenuItem
                  key={color}
                  onClick={() => updateFlagColor(flag.id, color)}
                  className={cn(
                    "flex items-center gap-2 cursor-pointer",
                    flag.color === color && "bg-muted"
                  )}
                >
                  <Flag 
                    className="w-4 h-4" 
                    fill={flagColors[color]}
                    stroke={flagColors[color]}
                    strokeWidth={1.5}
                  />
                  <span>{flagLabels[color]}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground mt-2">
        <span>Lat: {(50.123 + position.x * 0.001).toFixed(4)}°</span>
        <span>Lon: {(8.234 + position.y * 0.001).toFixed(4)}°</span>
      </div>
    </div>
  );
};

export default GPSTrack;
