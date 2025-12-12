import { Wifi, Monitor, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemStatusProps {
  xLogOnline: boolean;
  driverDisplayOnline: boolean;
  motorRunning: boolean;
  className?: string;
}

interface StatusItemProps {
  label: string;
  isOnline: boolean;
  icon: React.ReactNode;
}

const StatusItem = ({ label, isOnline, icon }: StatusItemProps) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className={cn(
        "transition-colors",
        isOnline ? "text-racing-green" : "text-racing-red"
      )}>
        {icon}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "w-2.5 h-2.5 rounded-full transition-all duration-300",
          isOnline 
            ? "bg-racing-green shadow-[0_0_8px_hsl(var(--racing-green))]" 
            : "bg-racing-red shadow-[0_0_8px_hsl(var(--racing-red))]"
        )}
      />
      <span className={cn(
        "text-xs font-bold uppercase",
        isOnline ? "text-racing-green" : "text-racing-red"
      )}>
        {isOnline ? "Online" : "Offline"}
      </span>
    </div>
  </div>
);

const SystemStatus = ({ xLogOnline, driverDisplayOnline, motorRunning, className }: SystemStatusProps) => {
  return (
    <div className={cn("bg-card rounded-2xl border border-border/50 p-6 flex flex-col", className)}>
      <Wifi 
        className={cn(
          "w-8 h-8 mb-4 transition-colors duration-300",
          xLogOnline && driverDisplayOnline ? "text-racing-green" : "text-racing-orange"
        )} 
        strokeWidth={1.5} 
      />
      <p className="text-muted-foreground text-sm font-medium mb-4 uppercase tracking-wide">
        System Status
      </p>
      <div className="flex-1 flex flex-col justify-end gap-3">
        <StatusItem 
          label="X-Log" 
          isOnline={xLogOnline} 
          icon={<Wifi className="w-4 h-4" />} 
        />
        <StatusItem 
          label="Driver Display" 
          isOnline={driverDisplayOnline} 
          icon={<Monitor className="w-4 h-4" />} 
        />
        <StatusItem 
          label="Motor" 
          isOnline={motorRunning} 
          icon={<Zap className="w-4 h-4" />} 
        />
      </div>
    </div>
  );
};

export default SystemStatus;
