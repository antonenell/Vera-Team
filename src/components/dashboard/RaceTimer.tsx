import { useEffect, useRef, useState } from "react";
import { Clock, Play, Pause, Flag, TrendingUp, TrendingDown, RotateCcw, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface RaceTimerProps {
  timeLeftSeconds: number;
  durationSeconds: number;
  isRunning: boolean;
  isPaused: boolean;
  onStartStop: () => void;
  onLap: () => void;
  onReset: () => void;
  lapTimes: number[];
  targetLapTime: number;
  targetRaceTime: number;
  totalLaps: number;
  safetySeconds: number;
  onUpdateSettings?: (s: { durationSeconds?: number; totalLaps?: number; safetySeconds?: number }) => void;
  className?: string;
  isAdmin?: boolean;
}

const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

/** A compact, inline-editable (admin) stat chip used by the Race Plan panel. */
function SettingField({
  label,
  value,
  unit,
  editable,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  unit: string;
  editable: boolean;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const focusedRef = useRef(false);

  // Keep in sync with realtime updates, but never yank the field mid-edit.
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value));
  }, [value]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      setDraft(String(clamped));
      if (clamped !== value) onCommit(clamped);
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div className="flex-1 rounded-xl bg-background/40 border border-border/40 px-2 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
      {editable ? (
        <input
          type="number"
          inputMode="numeric"
          value={draft}
          min={min}
          max={max}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            focusedRef.current = false;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          className="w-full bg-transparent text-center text-xl font-bold font-mono text-foreground outline-none focus:text-racing-cyan [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      ) : (
        <div className="text-xl font-bold font-mono text-foreground">{value}</div>
      )}
      <div className="text-[10px] text-muted-foreground">{unit}</div>
    </div>
  );
}

const RaceTimer = ({
  timeLeftSeconds,
  durationSeconds,
  isRunning,
  isPaused,
  onStartStop,
  onLap,
  onReset,
  lapTimes,
  targetLapTime,
  targetRaceTime,
  totalLaps,
  safetySeconds,
  onUpdateSettings,
  className,
  isAdmin = false,
}: RaceTimerProps) => {
  const progress = durationSeconds > 0 ? (timeLeftSeconds / durationSeconds) * 100 : 0;
  const isLowTime = timeLeftSeconds < 300; // Less than 5 minutes
  const isCritical = timeLeftSeconds < 60; // Less than 1 minute

  // Cumulative pace delta vs the per-lap budget (negative = ahead, positive = behind).
  const totalTimeUsed = lapTimes.reduce((a, b) => a + b, 0);
  const expectedTime = lapTimes.length * targetLapTime;
  const totalDelta = Math.round(totalTimeUsed - expectedTime);
  const isAhead = totalDelta < 0;
  const isBehind = totalDelta > 0;

  return (
    <div className={cn("glass-card relative rounded-2xl p-6 flex flex-col", className)}>
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
        <span
          className={cn(
            "text-5xl font-bold font-mono tracking-tight mb-4",
            isCritical ? "text-racing-red" : isLowTime ? "text-racing-orange" : "text-foreground"
          )}
        >
          {formatTime(timeLeftSeconds)}
        </span>

        {/* Controls - Only visible for admins */}
        {isAdmin && (
          <div className="flex gap-2 mb-4">
            <Button
              onClick={onStartStop}
              variant={isRunning ? "destructive" : "default"}
              className="flex-1 gap-2"
            >
              {isRunning ? (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              ) : isPaused ? (
                <>
                  <Play className="w-4 h-4" />
                  Resume
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start
                </>
              )}
            </Button>
            <Button onClick={onLap} variant="secondary" className="flex-1 gap-2" disabled={!isRunning}>
              <Flag className="w-4 h-4" />
              Lap
            </Button>
            <Button onClick={onReset} variant="outline" size="icon" disabled={isRunning}>
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Progress bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-1000 rounded-full",
              isCritical ? "bg-racing-red" : isLowTime ? "bg-racing-orange" : "bg-racing-cyan"
            )}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-2">
          <p className="text-muted-foreground text-xs">
            {Math.floor((durationSeconds - timeLeftSeconds) / 60)} min elapsed
          </p>
          {lapTimes.length > 0 && (
            <div
              className={cn(
                "flex items-center gap-1 text-sm font-mono font-bold",
                isAhead ? "text-racing-green" : isBehind ? "text-racing-red" : "text-muted-foreground"
              )}
            >
              {isAhead && <TrendingDown className="w-4 h-4" />}
              {isBehind && <TrendingUp className="w-4 h-4" />}
              <span>
                {totalDelta >= 0 ? "+" : ""}
                {totalDelta}s
              </span>
            </div>
          )}
        </div>

        {/* Race plan */}
        <div className="mt-4 pt-4 border-t border-border/40">
          <div className="flex items-center justify-between mb-3">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Race Plan
            </p>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-racing-cyan/15 border border-racing-cyan/30">
              <Target className="w-3.5 h-3.5 text-racing-cyan" />
              <span className="text-[11px] text-muted-foreground">Target / lap</span>
              <span className="text-sm font-bold font-mono text-racing-cyan">
                {formatTime(targetLapTime)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <SettingField
              label="Duration"
              value={Math.round(durationSeconds / 60)}
              unit="min"
              editable={isAdmin}
              min={1}
              max={300}
              onCommit={(v) => onUpdateSettings?.({ durationSeconds: v * 60 })}
            />
            <SettingField
              label="Laps"
              value={totalLaps}
              unit="laps"
              editable={isAdmin}
              min={1}
              max={99}
              onCommit={(v) => onUpdateSettings?.({ totalLaps: v })}
            />
            <SettingField
              label="Safety"
              value={safetySeconds}
              unit="sec"
              editable={isAdmin}
              min={0}
              max={1800}
              onCommit={(v) => onUpdateSettings?.({ safetySeconds: v })}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            {formatTime(targetRaceTime)} racing time / {totalLaps} laps
            <span className="opacity-60"> · {formatTime(safetySeconds)} safety buffer</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default RaceTimer;
