import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Gauge, Activity, User, LogOut, LogIn, Pencil, Check, RotateCcw } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import GPSTrack, { type GPSTrackHandle } from "@/components/dashboard/GPSTrack";
import SystemStatus from "@/components/dashboard/SystemStatus";
import MeanSpeedCard from "@/components/dashboard/MeanSpeedCard";
import LapTimes from "@/components/dashboard/LapTimes";
import RaceTimer from "@/components/dashboard/RaceTimer";
import { VoiceChat } from "@/components/dashboard/VoiceChat";
import { LiveKitAudioMount } from "@/components/voice/LiveKitAudioMount";
import DashboardGrid, { type DashboardGridHandle } from "@/components/dashboard/DashboardGrid";
import GridCard from "@/components/dashboard/GridCard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useRaceState } from "@/hooks/useRaceState";
import { useGpsTelemetry } from "@/hooks/useGpsTelemetry";
import { useTargetMeanSpeed } from "@/hooks/useTargetMeanSpeed";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import chalmersLogo from "@/assets/chalmersverateam.svg";

const Index = () => {
  const { user, isAdmin, signOut } = useAuth();
  const { toast } = useToast();

  // Real-time synced race state + admin-editable race plan
  const {
    timeLeft,
    isRunning,
    isPaused,
    currentLap,
    lapTimes,
    currentLapElapsed,
    durationSeconds,
    totalLaps,
    safetySeconds,
    targetRaceTime,
    targetLapTime,
    isLoading,
    startStop,
    recordLap,
    reset,
    updateSettings,
  } = useRaceState(isAdmin);

  // GPS telemetry from driver's phone
  const {
    position: carPosition,
    speed: gpsSpeed,
    isOnline: driverDisplayOnline,
    batteryLevel,
    batteryTemp,
  } = useGpsTelemetry();

  // Voice chat — single Room instance shared between the card and the audio mount
  const voice = useVoiceChat();

  // Target average speed needed over the remaining laps (same figure as the app)
  const meanSpeedTarget = useTargetMeanSpeed({
    speedKmh: gpsSpeed,
    isOnline: driverDisplayOnline,
    isRunning,
    lapTimes,
    totalLaps,
    targetRaceTimeSec: targetRaceTime,
    targetLapTimeSec: targetLapTime,
  });

  const speed = gpsSpeed; // Use GPS speed from phone

  // ---- Customizable grid (admin drag/resize) ----
  const [editMode, setEditMode] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const gpsRef = useRef<GPSTrackHandle>(null);
  const gridRef = useRef<DashboardGridHandle>(null);
  const hintShownRef = useRef(false);

  // Non-admins can never be in edit mode.
  useEffect(() => {
    if (!isAdmin && editMode) setEditMode(false);
  }, [isAdmin, editMode]);

  const toggleEdit = () => {
    setEditMode((on) => {
      const next = !on;
      if (next && !hintShownRef.current) {
        hintShownRef.current = true;
        toast({
          title: "Customize your dashboard",
          description: "Drag the “Move” grip to reposition a box, and drag its bottom-right corner to resize. Press Done when finished.",
        });
      }
      return next;
    });
  };

  const handleReset = () => {
    gridRef.current?.reset();
    setResetOpen(false);
    toast({ title: "Layout reset", description: "The dashboard is back to its default arrangement." });
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8 relative overflow-hidden">
      {/* Gradient mesh background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[30%] left-1/4 w-[600px] h-[600px] rounded-full bg-orange-500/10 blur-[150px]" />
        <div className="absolute -top-[20%] right-1/4 w-[500px] h-[500px] rounded-full bg-amber-500/8 blur-[120px]" />
        <div className="absolute top-1/4 -left-[10%] w-[400px] h-[400px] rounded-full bg-blue-900/10 blur-[100px]" />
        <div className="absolute top-[60%] right-[10%] w-[300px] h-[300px] rounded-full bg-indigo-900/8 blur-[80px]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
      <LiveKitAudioMount room={voice.room} />
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <img src={chalmersLogo} alt="Chalmers Vera Team" className="h-12 w-auto" />
        <div className="flex items-center gap-3">
          {user ? (
            <>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <Button
                    variant={editMode ? "default" : "ghost"}
                    size="sm"
                    className="gap-2"
                    onClick={toggleEdit}
                    title={editMode ? "Finish customizing the dashboard" : "Rearrange and resize the dashboard boxes"}
                  >
                    {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    <span className="hidden sm:inline">{editMode ? "Done" : "Edit layout"}</span>
                  </Button>
                  {editMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-muted-foreground hover:text-foreground"
                      onClick={() => setResetOpen(true)}
                      title="Reset the dashboard to its default layout"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="hidden sm:inline">Reset</span>
                    </Button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-5 h-5" />
                <span className="text-sm font-medium">
                  {isAdmin ? "Admin" : "Spectator"}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-muted-foreground/70 hover:bg-muted/50"
                onClick={() => signOut()}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-muted-foreground/70 hover:bg-muted/50"
              asChild
            >
              <Link to="/auth">
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Admin Sign In</span>
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Main Grid — admin-customizable (drag to move, drag corner to resize) */}
      <DashboardGrid ref={gridRef} editMode={editMode} isAdmin={isAdmin} gpsRef={gpsRef}>
        <div key="gps">
          <GridCard editMode={editMode}>
            <GPSTrack
              ref={gpsRef}
              position={carPosition}
              className="h-full"
              isAdmin={isAdmin}
              isCarOnline={driverDisplayOnline}
              gridEditMode={editMode}
            />
          </GridCard>
        </div>

        <div key="speed">
          <GridCard editMode={editMode}>
            <StatCard
              title="Speed"
              value={Math.round(speed)}
              unit="km/h"
              icon={Gauge}
              iconColor="text-racing-blue"
              valueColor="text-racing-blue"
              className="h-full"
            />
          </GridCard>
        </div>

        <div key="targetAvg">
          <GridCard editMode={editMode}>
            <MeanSpeedCard target={meanSpeedTarget} className="h-full" />
          </GridCard>
        </div>

        <div key="systemStatus">
          <GridCard editMode={editMode}>
            <SystemStatus
              driverDisplayOnline={driverDisplayOnline}
              batteryLevel={batteryLevel}
              batteryTemp={batteryTemp}
              className="h-full"
            />
          </GridCard>
        </div>

        <div key="raceTimer">
          <GridCard editMode={editMode}>
            <RaceTimer
              timeLeftSeconds={timeLeft}
              durationSeconds={durationSeconds}
              isRunning={isRunning}
              isPaused={isPaused}
              onStartStop={startStop}
              onLap={recordLap}
              onReset={reset}
              lapTimes={lapTimes}
              targetLapTime={targetLapTime}
              targetRaceTime={targetRaceTime}
              totalLaps={totalLaps}
              safetySeconds={safetySeconds}
              onUpdateSettings={updateSettings}
              className="h-full"
              isAdmin={isAdmin}
            />
          </GridCard>
        </div>

        <div key="lapTimes">
          <GridCard editMode={editMode}>
            <LapTimes
              lapTimes={lapTimes}
              currentLap={currentLap + (isRunning ? 1 : 0)}
              totalLaps={totalLaps}
              targetLapTime={targetLapTime}
              currentLapElapsed={currentLapElapsed}
              className="h-full"
            />
          </GridCard>
        </div>

        <div key="voiceChat">
          <GridCard editMode={editMode}>
            <VoiceChat api={voice} isAdmin={isAdmin} className="h-full" />
          </GridCard>
        </div>

        <div key="raceProgress">
          <GridCard editMode={editMode}>
            <div className="glass-card relative rounded-2xl p-6 h-full overflow-hidden flex flex-col">
              <Activity className="w-8 h-8 mb-4 text-racing-blue shrink-0" strokeWidth={1.5} />
              <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide shrink-0">
                Race Progress
              </p>
              <div className="flex-1 flex items-end min-h-0">
                <div className="w-full">
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-5xl font-bold text-racing-blue font-mono">
                      {currentLap}
                    </span>
                    <span className="text-2xl text-muted-foreground">/ {totalLaps}</span>
                    <span className="text-muted-foreground ml-2">laps</span>
                  </div>
                  {/* Lap progress dots */}
                  <div className="flex gap-2 flex-wrap">
                    {Array.from({ length: totalLaps }, (_, i) => (
                      <div
                        key={i}
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          i < currentLap
                            ? "bg-racing-blue text-background"
                            : i === currentLap
                              ? "bg-racing-orange text-background ring-2 ring-racing-orange ring-offset-2 ring-offset-card"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </GridCard>
        </div>

        <div key="bestLap">
          <GridCard editMode={editMode}>
            <div className="glass-card relative rounded-2xl p-6 h-full overflow-hidden flex flex-col">
              <Activity className="w-8 h-8 mb-4 text-racing-green shrink-0" strokeWidth={1.5} />
              <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide shrink-0">
                Best Lap (Target: {Math.floor(targetLapTime / 60)}:{Math.round(targetLapTime % 60).toString().padStart(2, "0")})
              </p>
              <div className="flex-1 flex items-end min-h-0">
                <span className="text-4xl font-bold text-racing-green font-mono">
                  {lapTimes.length > 0
                    ? (() => {
                        const bestLap = lapTimes.reduce((best, time) =>
                          Math.abs(time - targetLapTime) < Math.abs(best - targetLapTime) ? time : best
                        );
                        return `${Math.floor(bestLap / 60)}:${(bestLap % 60).toString().padStart(2, "0")}`;
                      })()
                    : "--:--"
                  }
                </span>
              </div>
            </div>
          </GridCard>
        </div>
      </DashboardGrid>
    </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset dashboard layout?</AlertDialogTitle>
            <AlertDialogDescription>
              This puts every box back to its default position and size. Your current arrangement on this device will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset layout</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
