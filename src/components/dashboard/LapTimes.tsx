import { Timer, Flag, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LapTimesProps {
  lapTimes: number[];
  currentLap: number;
  totalLaps: number;
  targetLapTime: number; // in seconds
  currentLapElapsed?: number; // live elapsed time for current lap
  className?: string;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatDelta = (delta: number): string => {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta}s`;
};

const LapTimes = ({ lapTimes, currentLap, totalLaps, targetLapTime, currentLapElapsed = 0, className }: LapTimesProps) => {
  const bestLap = lapTimes.length > 0 ? Math.min(...lapTimes) : 0;
  
  // Calculate cumulative delta from target pace
  const getCumulativeDelta = (index: number): number => {
    const totalTimeUsed = lapTimes.slice(0, index + 1).reduce((a, b) => a + b, 0);
    const expectedTime = (index + 1) * targetLapTime;
    return Math.round(totalTimeUsed - expectedTime);
  };
  
  return (
    <div className={cn("bg-card rounded-2xl border border-border/50 p-6 flex flex-col", className)}>
      <Timer className="w-8 h-8 mb-4 text-racing-purple" strokeWidth={1.5} />
      <div className="flex items-center justify-between mb-2">
        <p className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
          Lap Times
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Flag className="w-4 h-4 text-racing-orange" />
          <span className="text-racing-orange font-bold">{currentLap}</span>
          <span className="text-muted-foreground">/ {totalLaps}</span>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground mb-4">
        Target: {formatTime(Math.round(targetLapTime))} per lap
      </p>
      
      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="space-y-2">
          {/* Current lap indicator */}
          {currentLap > lapTimes.length && currentLapElapsed > 0 && (
            <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-racing-cyan/20 border border-racing-cyan/30 animate-pulse">
              <span className="text-racing-cyan font-medium">
                Lap {lapTimes.length + 1}
              </span>
              <span className="font-mono font-bold text-racing-cyan">
                {formatTime(currentLapElapsed)}
                <span className="ml-2 text-xs">LIVE</span>
              </span>
            </div>
          )}
          {lapTimes.map((time, index) => {
            const cumulativeDelta = getCumulativeDelta(index);
            const isAhead = cumulativeDelta < 0;
            const isBehind = cumulativeDelta > 0;
            
            return (
              <div
                key={index}
                className={cn(
                  "flex justify-between items-center py-2 px-3 rounded-lg transition-colors",
                  time === bestLap 
                    ? "bg-racing-purple/20 border border-racing-purple/30" 
                    : "bg-muted/30"
                )}
              >
                <span className="text-muted-foreground font-medium">
                  Lap {index + 1}
                </span>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-xs font-mono font-bold flex items-center gap-1",
                    isAhead ? "text-racing-green" : isBehind ? "text-racing-red" : "text-muted-foreground"
                  )}>
                    {isAhead && <TrendingDown className="w-3 h-3" />}
                    {isBehind && <TrendingUp className="w-3 h-3" />}
                    {formatDelta(cumulativeDelta)}
                  </span>
                  <span className={cn(
                    "font-mono font-bold",
                    time === bestLap ? "text-racing-purple" : "text-foreground"
                  )}>
                    {formatTime(time)}
                    {time === bestLap && (
                      <span className="ml-2 text-xs text-racing-purple">BEST</span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
          {lapTimes.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-4">
              No laps completed yet
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LapTimes;
