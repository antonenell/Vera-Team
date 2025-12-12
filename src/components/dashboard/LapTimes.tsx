import { Timer, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LapTimesProps {
  lapTimes: number[];
  currentLap: number;
  totalLaps: number;
  className?: string;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const LapTimes = ({ lapTimes, currentLap, totalLaps, className }: LapTimesProps) => {
  const bestLap = lapTimes.length > 0 ? Math.min(...lapTimes) : 0;
  
  return (
    <div className={cn("bg-card rounded-2xl border border-border/50 p-6 flex flex-col", className)}>
      <Timer className="w-8 h-8 mb-4 text-racing-purple" strokeWidth={1.5} />
      <div className="flex items-center justify-between mb-4">
        <p className="text-muted-foreground text-sm font-medium uppercase tracking-wide">
          Lap Times
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Flag className="w-4 h-4 text-racing-orange" />
          <span className="text-racing-orange font-bold">{currentLap}</span>
          <span className="text-muted-foreground">/ {totalLaps}</span>
        </div>
      </div>
      
      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="space-y-2">
          {lapTimes.map((time, index) => (
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
          ))}
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
