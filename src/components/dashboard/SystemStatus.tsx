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

const SystemStatus = ({ xLogOnline, driverDisplayOnline, motorRunning, className }: SystemStatusProps) => {
  const allOnline = xLogOnline && driverDisplayOnline && motorRunning;
  
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
          label="X-Log" 
          isOnline={xLogOnline} 
          icon={<Wifi className="w-5 h-5" />} 
        />
        <StatusItem 
          label="Driver Display" 
          isOnline={driverDisplayOnline} 
          icon={<Monitor className="w-5 h-5" />} 
        />
        <StatusItem 
          label="Motor" 
          isOnline={motorRunning} 
          icon={<Zap className="w-5 h-5" />} 
        />
      </div>
    </div>
  );
};

export default SystemStatus;