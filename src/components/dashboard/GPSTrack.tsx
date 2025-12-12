import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface GPSTrackProps {
  position: { x: number; y: number };
  className?: string;
}

const GPSTrack = ({ position, className }: GPSTrackProps) => {
  // Simple oval track representation
  const trackPath = "M 50,20 Q 90,20 90,50 Q 90,80 50,80 Q 10,80 10,50 Q 10,20 50,20";
  
  return (
    <div className={cn("bg-card rounded-2xl border border-border/50 p-6", className)}>
      <MapPin className="w-8 h-8 mb-4 text-racing-green" strokeWidth={1.5} />
      <p className="text-muted-foreground text-sm font-medium mb-4 uppercase tracking-wide">
        Track Position
      </p>
      <div className="relative aspect-[2/1] w-full">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {/* Track outline */}
          <path
            d={trackPath}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Track inner line */}
          <path
            d={trackPath}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="1"
            strokeLinecap="round"
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
            x1="50"
            y1="15"
            x2="50"
            y2="25"
            stroke="hsl(var(--foreground))"
            strokeWidth="2"
          />
        </svg>
      </div>
      <div className="mt-4 flex justify-between text-sm text-muted-foreground">
        <span>Lat: {(50.123 + position.x * 0.001).toFixed(4)}°</span>
        <span>Lon: {(8.234 + position.y * 0.001).toFixed(4)}°</span>
      </div>
    </div>
  );
};

export default GPSTrack;
