import { Wifi, Monitor, Thermometer, BatteryFull, BatteryLow } from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemStatusProps {
  driverDisplayOnline: boolean;
  batteryLevel?: number;
  batteryTemp?: number | null;
  className?: string;
}

interface StatusItemProps {
  label: string;
  isOnline: boolean;
  icon: React.ReactNode;
}

const StatusItem = ({ label, isOnline, icon }: StatusItemProps) => (
  <div className="flex items-center gap-3 group">
    <div
      className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500",
        isOnline 
          ? "bg-racing-green/10 text-racing-green" 
          : "bg-racing-red/10 text-racing-red"
      )}
    >
      {icon}
    </div>
    <div className="flex-1">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className={cn(
        "text-xs font-medium transition-colors",
        isOnline ? "text-racing-green" : "text-racing-red"
      )}>
        {isOnline ? "Online" : "Offline"}
      </p>
    </div>
    <div
      className={cn(
        "w-2 h-2 rounded-full transition-all duration-500",
        isOnline 
          ? "bg-racing-green animate-pulse" 
          : "bg-racing-red"
      )}
    />
  </div>
);

const SystemStatus = ({ driverDisplayOnline, batteryLevel, batteryTemp, className }: SystemStatusProps) => {
  const allOnline = driverDisplayOnline;

  // Phone readouts are only meaningful while the driver phone is live.
  const tempStr = driverDisplayOnline && batteryTemp != null && batteryTemp > 0
    ? `${Math.round(batteryTemp)}°C`
    : "—";
  const battStr = driverDisplayOnline && batteryLevel != null
    ? `${Math.round(batteryLevel)}%`
    : "—";
  const battLow = batteryLevel != null && batteryLevel <= 20;
  const tempHot = batteryTemp != null && batteryTemp >= 42;
  
  return (
    <div className={cn("glass-card relative rounded-2xl p-6 flex flex-col", className)}>
      <div className="flex items-center gap-3 mb-6">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-500",
          allOnline ? "bg-racing-green/10" : "bg-racing-orange/10"
        )}>
          <Wifi 
            className={cn(
              "w-5 h-5 transition-colors duration-500",
              allOnline ? "text-racing-green" : "text-racing-orange"
            )} 
          />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          System Status
        </p>
      </div>
      
      <div className="flex-1 flex flex-col justify-end gap-4">
        <StatusItem
          label="Driver Display"
          isOnline={driverDisplayOnline}
          icon={<Monitor className="w-5 h-5" />}
        />

        {/* Phone (driver display) readouts */}
        <div className="flex items-center gap-2 pt-3 mt-1 border-t border-border/40">
          <div className="flex-1 flex items-center gap-2">
            <Thermometer className={cn("w-4 h-4", tempHot ? "text-racing-red" : "text-racing-cyan")} />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Phone Temp</p>
              <p className={cn("text-base font-mono font-bold", tempHot ? "text-racing-red" : "text-foreground")}>{tempStr}</p>
            </div>
          </div>
          <div className="flex-1 flex items-center gap-2">
            {battLow ? <BatteryLow className="w-4 h-4 text-racing-red" /> : <BatteryFull className="w-4 h-4 text-racing-green" />}
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Battery</p>
              <p className={cn("text-base font-mono font-bold", battLow ? "text-racing-red" : "text-foreground")}>{battStr}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemStatus;