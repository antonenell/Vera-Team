import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface MotorStatusProps {
  isRunning: boolean;
  className?: string;
}

const MotorStatus = ({ isRunning, className }: MotorStatusProps) => {
  return (
    <div className={cn("bg-card rounded-2xl border border-border/50 p-6 flex flex-col", className)}>
      <Zap 
        className={cn(
          "w-8 h-8 mb-4 transition-colors duration-300",
          isRunning ? "text-racing-green" : "text-racing-red"
        )} 
        strokeWidth={1.5} 
      />
      <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">
        Motor Status
      </p>
      <div className="flex-1 flex items-end">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-4 h-4 rounded-full transition-all duration-300",
              isRunning 
                ? "bg-racing-green shadow-[0_0_12px_hsl(var(--racing-green))]" 
                : "bg-racing-red shadow-[0_0_12px_hsl(var(--racing-red))]"
            )}
          >
            {isRunning && (
              <div className="w-full h-full rounded-full bg-racing-green animate-ping" />
            )}
          </div>
          <span className={cn(
            "text-2xl font-bold",
            isRunning ? "text-racing-green" : "text-racing-red"
          )}>
            {isRunning ? "RUNNING" : "STOPPED"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MotorStatus;
