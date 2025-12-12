import { Clock, Play, Pause, Flag, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface RaceTimerProps {
  timeLeftSeconds: number;
  totalSeconds: number;
  isRunning: boolean;
  onStartStop: () => void;
  onLap: () => void;
  lapTimes: number[];
  targetLapTime: number;
  className?: string;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const RaceTimer = ({ 
  timeLeftSeconds, 
  totalSeconds, 
  isRunning,
  onStartStop,
  onLap,
  lapTimes,
  targetLapTime,
  className 
}: RaceTimerProps) => {
  const progress = (timeLeftSeconds / totalSeconds) * 100;
  const isLowTime = timeLeftSeconds < 300; // Less than 5 minutes
  const isCritical = timeLeftSeconds < 60; // Less than 1 minute
  
  // Calculate total cumulative delta from target pace
  const totalTimeUsed = lapTimes.reduce((a, b) => a + b, 0);
  const expectedTime = lapTimes.length * targetLapTime;
  const totalDelta = Math.round(totalTimeUsed - expectedTime);
  const isAhead = totalDelta < 0;
  const isBehind = totalDelta > 0;
  
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
      
      <div className="flex-1 flex flex-col justify-between">
        <span className={cn(
          "text-5xl font-bold font-mono tracking-tight mb-4",
          isCritical ? "text-racing-red" : isLowTime ? "text-racing-orange" : "text-foreground"
        )}>
          {formatTime(timeLeftSeconds)}
        </span>
        
        {/* Controls */}
        <div className="flex gap-2 mb-4">
          <Button
            onClick={onStartStop}
            variant={isRunning ? "destructive" : "default"}
            className="flex-1 gap-2"
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4" />
                Stop
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start
              </>
            )}
          </Button>
          <Button
            onClick={onLap}
            variant="secondary"
            className="flex-1 gap-2"
            disabled={!isRunning}
          >
            <Flag className="w-4 h-4" />
            Lap
          </Button>
        </div>
        
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
        <div className="flex justify-between items-center mt-2">
          <p className="text-muted-foreground text-xs">
            {Math.floor((totalSeconds - timeLeftSeconds) / 60)} min elapsed
          </p>
          {lapTimes.length > 0 && (
            <div className={cn(
              "flex items-center gap-1 text-sm font-mono font-bold",
              isAhead ? "text-racing-green" : isBehind ? "text-racing-red" : "text-muted-foreground"
            )}>
              {isAhead && <TrendingDown className="w-4 h-4" />}
              {isBehind && <TrendingUp className="w-4 h-4" />}
              <span>{totalDelta >= 0 ? "+" : ""}{totalDelta}s</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RaceTimer;
