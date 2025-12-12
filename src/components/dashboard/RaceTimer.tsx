import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface RaceTimerProps {
  timeLeftSeconds: number;
  totalSeconds: number;
  className?: string;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const RaceTimer = ({ timeLeftSeconds, totalSeconds, className }: RaceTimerProps) => {
  const progress = (timeLeftSeconds / totalSeconds) * 100;
  const isLowTime = timeLeftSeconds < 300; // Less than 5 minutes
  const isCritical = timeLeftSeconds < 60; // Less than 1 minute
  
  return (
    <div className={cn("bg-card rounded-2xl border border-border/50 p-6 flex flex-col", className)}>
      <Clock 
        className={cn(
          "w-8 h-8 mb-4",
          isCritical ? "text-racing-red" : isLowTime ? "text-racing-orange" : "text-racing-cyan"
        )} 
        strokeWidth={1.5} 
      />
      <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">
        Time Remaining
      </p>
      
      <div className="flex-1 flex flex-col justify-end">
        <span className={cn(
          "text-5xl font-bold font-mono tracking-tight mb-4",
          isCritical ? "text-racing-red" : isLowTime ? "text-racing-orange" : "text-foreground"
        )}>
          {formatTime(timeLeftSeconds)}
        </span>
        
        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-1000 rounded-full",
              isCritical 
                ? "bg-racing-red" 
                : isLowTime 
                  ? "bg-racing-orange" 
                  : "bg-racing-cyan"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-muted-foreground text-xs mt-2">
          {Math.floor((totalSeconds - timeLeftSeconds) / 60)} min elapsed
        </p>
      </div>
    </div>
  );
};

export default RaceTimer;
