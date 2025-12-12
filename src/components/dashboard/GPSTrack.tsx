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
  center: [number, number]; // [lng, lat]
  zoom: number;
  radius: number; // in meters
  defaultFlags: Omit<TurnFlag, "color">[];
}

// Helper to create a circle polygon for Mapbox
const createCirclePolygon = (center: [number, number], radiusMeters: number, points = 64) => {
  const coords: [number, number][] = [];
  const km = radiusMeters / 1000;
  
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = km * Math.cos(angle);
    const dy = km * Math.sin(angle);
    const lat = center[1] + (dy / 110.574);
    const lng = center[0] + (dx / (111.320 * Math.cos(center[1] * Math.PI / 180)));
    coords.push([lng, lat]);
  }
  coords.push(coords[0]); // Close the polygon
  
  return {
    type: "Feature" as const,
    geometry: {
      type: "Polygon" as const,
      coordinates: [coords],
    },
    properties: {},
  };
};

const tracks: Record<TrackName, TrackConfig> = {
  "stora-holm": {
    name: "Stora Holm",
    center: [11.9181, 57.7764], // Stora Holm trafikövningsplats, Gothenburg (57°46'35.2"N 11°55'05.1"E)
    zoom: 15.5,
    radius: 330, // meters
    defaultFlags: [
      { id: 1, x: 35, y: 28 },
      { id: 2, x: 65, y: 28 },
      { id: 3, x: 50, y: 71 },
    ],
  },
  "silesia-ring": {
    name: "Silesia Ring",
    center: [18.9167, 50.3667], // Silesia Ring, Poland
    zoom: 14,
    radius: 500, // meters
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
      center: track.center,
      zoom: track.zoom,
      interactive: false, // Lock the map
    });

    map.current.on("load", () => {
      if (!map.current) return;
      
      // Add circle source and layer
      map.current.addSource("radius-circle", {
        type: "geojson",
        data: createCirclePolygon(track.center, track.radius),
      });

      map.current.addLayer({
        id: "radius-circle-fill",
        type: "fill",
        source: "radius-circle",
        paint: {
          "fill-color": "#22c55e",
          "fill-opacity": 0.15,
        },
      });

      map.current.addLayer({
        id: "radius-circle-outline",
        type: "line",
        source: "radius-circle",
        paint: {
          "line-color": "#22c55e",
          "line-width": 2,
          "line-opacity": 0.8,
        },
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update map when track changes
  useEffect(() => {
    if (map.current) {
      map.current.flyTo({
        center: track.center,
        zoom: track.zoom,
        duration: 1000,
      });

      // Update circle for new track
      const source = map.current.getSource("radius-circle") as mapboxgl.GeoJSONSource;
      if (source) {
        source.setData(createCirclePolygon(track.center, track.radius));
      }
    }
  }, [selectedTrack, track.center, track.zoom, track.radius]);

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
        <div ref={mapContainer} className="absolute inset-0" />
        
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
