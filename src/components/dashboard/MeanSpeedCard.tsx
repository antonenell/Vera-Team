import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WebMeanSpeedTarget } from "@/hooks/useTargetMeanSpeed";

interface MeanSpeedCardProps {
  target: WebMeanSpeedTarget;
  className?: string;
}

/** Mirrors the Android driver display's "Target Avg" panel on the web dashboard. */
const MeanSpeedCard = ({ target, className }: MeanSpeedCardProps) => {
  const accent = target.onPace ? "text-racing-green" : "text-racing-red";
  const arrow = target.currentKmh >= target.targetKmh ? "▲" : "▼";

  return (
    <div className={cn("glass-card relative rounded-2xl p-6 flex flex-col", className)}>
      <Target className={cn("w-8 h-8 mb-4", target.calibrating ? "text-muted-foreground" : accent)} strokeWidth={1.5} />
      <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">
        Target Avg
      </p>

      <div className="flex-1 flex flex-col justify-end">
        {target.finished ? (
          <span className="text-4xl font-bold font-mono text-racing-green">DONE</span>
        ) : target.calibrating ? (
          <>
            <span className="text-5xl font-bold font-mono text-muted-foreground">--</span>
            <span className="text-xs text-muted-foreground mt-1">calibrating…</span>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className={cn("text-5xl font-bold font-mono", accent)}>
                {Math.round(target.targetKmh)}
              </span>
              <span className="text-sm text-muted-foreground">km/h</span>
            </div>
            <span className={cn("text-xs font-mono font-bold mt-1", accent)}>
              you {Math.round(target.currentKmh)} {arrow}
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default MeanSpeedCard;
