import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  iconColor?: string;
  valueColor?: string;
  size?: "small" | "medium" | "large";
  className?: string;
  children?: React.ReactNode;
}

const StatCard = ({
  title,
  value,
  unit,
  icon: Icon,
  iconColor = "text-racing-blue",
  valueColor = "text-foreground",
  size = "medium",
  className,
  children,
}: StatCardProps) => {
  const sizeClasses = {
    small: "p-4",
    medium: "p-6",
    large: "p-8",
  };

  const valueSizeClasses = {
    small: "text-2xl",
    medium: "text-4xl",
    large: "text-5xl",
  };

  return (
    <div
      className={cn(
        "glass-card relative rounded-2xl transition-all duration-300 hover:border-border/50 flex flex-col",
        sizeClasses[size],
        className
      )}
    >
      <Icon className={cn("w-8 h-8 mb-4", iconColor)} strokeWidth={1.5} />
      <div className="flex-1 flex flex-col justify-end">
        <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">
          {title}
        </p>
        <div className="flex items-baseline gap-2">
          <span className={cn("font-bold tracking-tight font-mono", valueSizeClasses[size], valueColor)}>
            {value}
          </span>
          {unit && (
            <span className="text-muted-foreground text-lg">{unit}</span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
};

export default StatCard;
