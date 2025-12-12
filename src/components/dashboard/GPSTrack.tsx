import { useState } from "react";
import { MapPin, Flag, RotateCcw } from "lucide-react";
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

interface TurnFlag {
  id: number;
  x: number;
  y: number;
  color: FlagColor;
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

const GPSTrack = ({ position, className }: GPSTrackProps) => {
  // Closed track with multiple turns
  const trackPath = "M 20,30 L 35,20 L 65,20 L 80,30 L 80,45 L 65,55 L 50,50 L 35,55 L 20,45 Z";
  
  // Turn positions for flags (percentages based on viewBox 100x70)
  // Track points: (35,20), (65,20), (80,30), (80,45), (65,55), (50,50), (35,55), (20,45), (20,30)
  const [flags, setFlags] = useState<TurnFlag[]>([
    { id: 1, x: 35, y: (20 / 70) * 100, color: "grey" },  // top-left turn
    { id: 2, x: 65, y: (20 / 70) * 100, color: "grey" },  // top-right turn
    { id: 3, x: 50, y: (50 / 70) * 100, color: "grey" },  // center turn
  ]);

  const updateFlagColor = (flagId: number, color: FlagColor) => {
    setFlags(prev => prev.map(flag => 
      flag.id === flagId ? { ...flag, color } : flag
    ));
  };

  const resetFlags = () => {
    setFlags(prev => prev.map(flag => ({ ...flag, color: "grey" as FlagColor })));
  };

  return (
    <div className={cn("bg-card rounded-2xl border border-border/50 p-4 flex flex-col", className)}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-racing-green" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
            Track Position
          </p>
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
            d={trackPath}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Track inner line */}
          <path
            d={trackPath}
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
            x1="20"
            y1="25"
            x2="20"
            y2="35"
            stroke="hsl(var(--foreground))"
            strokeWidth="2"
          />
        </svg>
        
        {/* Interactive Flags */}
        {flags.map((flag) => (
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
