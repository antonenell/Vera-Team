import { useState } from "react";
import { MapPin, Flag, RotateCcw, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  path: string;
  startLine: { x1: number; y1: number; x2: number; y2: number };
  defaultFlags: Omit<TurnFlag, "color">[];
}

const tracks: Record<TrackName, TrackConfig> = {
  "stora-holm": {
    name: "Stora Holm",
    path: "M 20,30 L 35,20 L 65,20 L 80,30 L 80,45 L 65,55 L 50,50 L 35,55 L 20,45 Z",
    startLine: { x1: 20, y1: 25, x2: 20, y2: 35 },
    defaultFlags: [
      { id: 1, x: 35, y: (20 / 70) * 100 },
      { id: 2, x: 65, y: (20 / 70) * 100 },
      { id: 3, x: 50, y: (50 / 70) * 100 },
    ],
  },
  "silesia-ring": {
    name: "Silesia Ring",
    path: "M 15,35 L 30,15 L 70,15 L 85,25 L 85,40 L 70,50 L 85,60 L 70,70 L 30,70 L 15,55 Z",
    startLine: { x1: 15, y1: 30, x2: 15, y2: 40 },
    defaultFlags: [
      { id: 1, x: 30, y: (15 / 70) * 100 },
      { id: 2, x: 70, y: (15 / 70) * 100 },
      { id: 3, x: 70, y: (50 / 70) * 100 },
      { id: 4, x: 70, y: (70 / 70) * 100 },
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
  
  const [flags, setFlags] = useState<Record<TrackName, TurnFlag[]>>({
    "stora-holm": tracks["stora-holm"].defaultFlags.map(f => ({ ...f, color: "grey" as FlagColor })),
    "silesia-ring": tracks["silesia-ring"].defaultFlags.map(f => ({ ...f, color: "grey" as FlagColor })),
  });

  const currentFlags = flags[selectedTrack];

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
    <div className={cn("bg-card rounded-2xl border border-border/50 p-4 flex flex-col", className)}>
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
      <div className="relative flex-1 w-full min-h-0">
        <svg viewBox="0 0 100 70" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* Track outline */}
          <path
            d={track.path}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Track inner line */}
          <path
            d={track.path}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 4"
          />
          {/* Car position */}
          <circle
            cx={position.x}
            cy={position.y}
            r="4"
            className="fill-racing-green"
          >
            <animate
              attributeName="r"
              values="4;5;4"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Glow effect */}
          <circle
            cx={position.x}
            cy={position.y}
            r="8"
            className="fill-racing-green/30"
          >
            <animate
              attributeName="r"
              values="8;12;8"
              dur="1.5s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0.3;0.1;0.3"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </circle>
          {/* Start/Finish line */}
          <line
            x1={track.startLine.x1}
            y1={track.startLine.y1}
            x2={track.startLine.x2}
            y2={track.startLine.y2}
            stroke="hsl(var(--foreground))"
            strokeWidth="2"
          />
        </svg>
        
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
