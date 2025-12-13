import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

const AnimatedNumber = ({ value, className }: AnimatedNumberProps) => {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const animationRef = useRef<number>();

  useEffect(() => {
    const startValue = previousValue.current;
    const endValue = value;
    const duration = 300; // ms
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = startValue + (endValue - startValue) * easeOut;
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        previousValue.current = endValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value]);

  // Format: show decimal only if needed, round to reasonable precision
  const formattedValue = Number.isInteger(value) 
    ? Math.round(displayValue).toString()
    : displayValue.toFixed(1);

  return <span className={className}>{formattedValue}</span>;
};

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

  const isNumeric = typeof value === "number";

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
          {isNumeric ? (
            <AnimatedNumber 
              value={value} 
              className={cn("font-bold tracking-tight font-mono", valueSizeClasses[size], valueColor)} 
            />
          ) : (
            <span className={cn("font-bold tracking-tight font-mono", valueSizeClasses[size], valueColor)}>
              {value}
            </span>
          )}
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
