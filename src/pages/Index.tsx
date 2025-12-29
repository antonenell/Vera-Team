import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Gauge, Thermometer, Activity, User, LogOut, LogIn, MapPin } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import SystemStatus from "@/components/dashboard/SystemStatus";

// Lazy load the map component (it's heavy due to Mapbox)
const GPSTrack = lazy(() => import("@/components/dashboard/GPSTrack"));
import LapTimes from "@/components/dashboard/LapTimes";
import RaceTimer from "@/components/dashboard/RaceTimer";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useRaceState } from "@/hooks/useRaceState";
import chalmersLogo from "@/assets/chalmersverateam.svg";

const TOTAL_LAPS = 11;
const RACE_DURATION_SECONDS = 35 * 60; // 35 minutes
const TARGET_RACE_TIME = 34 * 60; // 34 minutes (1 min safety margin)
const TARGET_LAP_TIME = TARGET_RACE_TIME / TOTAL_LAPS; // ~185.5 seconds per lap

const Index = () => {
  const { user, isAdmin, signOut } = useAuth();
  
  // Real-time synced race state
  const {
    timeLeft,
    isRunning,
    currentLap,
    lapTimes,
    currentLapElapsed,
    isLoading,
    startStop,
    recordLap,
    reset,
  } = useRaceState(isAdmin);
  
  // Telemetry data - defaults for when not connected
  const rpm = 0;
  const speed = 0;
  const temperature = null; // null = not connected
  const motorRunning = false;
  const xLogOnline = false;
  const driverDisplayOnline = false;
  
  // Static GPS position - will be connected to real data later
  const carPosition = { x: 50, y: 50 };

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
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <img src={chalmersLogo} alt="Chalmers Vera Team" className="h-12 w-auto" />
        <div className="flex items-center gap-4">
          {user ? (
            <>
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

      {/* Main Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 auto-rows-fr">
        {/* GPS Track - Large (lazy loaded) */}
        <Suspense fallback={
          <div className="glass-card relative rounded-2xl p-6 col-span-2 md:col-span-3 row-span-2 flex flex-col items-center justify-center">
            <MapPin className="w-12 h-12 text-muted-foreground mb-4 animate-pulse" />
            <p className="text-muted-foreground text-sm">Loading map...</p>
          </div>
        }>
          <GPSTrack
            position={carPosition}
            className="col-span-2 md:col-span-3 row-span-2"
            isAdmin={isAdmin}
          />
        </Suspense>

        {/* Speed */}
        <StatCard
          title="Speed"
          value={Math.round(speed)}
          unit="km/h"
          icon={Gauge}
          iconColor="text-racing-blue"
          valueColor="text-racing-blue"
          className="col-span-1"
        />

        {/* RPM */}
        <StatCard
          title="Motor RPM"
          value={Math.round(rpm).toLocaleString()}
          icon={Activity}
          iconColor="text-racing-orange"
          valueColor="text-racing-orange"
          className="col-span-1"
        />

        {/* Temperature */}
        <StatCard
          title="Motor Temp"
          value={temperature !== null ? Math.round(temperature) : "--"}
          unit={temperature !== null ? "°C" : ""}
          icon={Thermometer}
          iconColor={temperature !== null && temperature > 85 ? "text-racing-red" : "text-muted-foreground"}
          valueColor={temperature !== null && temperature > 85 ? "text-racing-red" : "text-muted-foreground"}
          className="col-span-1"
        />

        {/* System Status */}
        <SystemStatus 
          xLogOnline={xLogOnline}
          driverDisplayOnline={driverDisplayOnline}
          motorRunning={motorRunning}
          className="col-span-1"
        />

        {/* Timer */}
        <RaceTimer
          timeLeftSeconds={timeLeft}
          totalSeconds={RACE_DURATION_SECONDS}
          isRunning={isRunning}
          onStartStop={startStop}
          onLap={recordLap}
          onReset={reset}
          lapTimes={lapTimes}
          targetLapTime={TARGET_LAP_TIME}
          className="col-span-2 row-span-2"
          isAdmin={isAdmin}
        />

        {/* Lap Times - Tall */}
        <LapTimes
          lapTimes={lapTimes}
          currentLap={currentLap + (isRunning ? 1 : 0)}
          totalLaps={TOTAL_LAPS}
          targetLapTime={TARGET_LAP_TIME}
          currentLapElapsed={currentLapElapsed}
          className="col-span-2 row-span-2"
        />

        {/* Laps Progress */}
        <div className="glass-card relative rounded-2xl p-6 col-span-2 md:col-span-2 flex flex-col">
          <Activity className="w-8 h-8 mb-4 text-racing-blue" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">
            Race Progress
          </p>
          <div className="flex-1 flex items-end">
            <div className="w-full">
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-5xl font-bold text-racing-blue font-mono">
                  {currentLap}
                </span>
                <span className="text-2xl text-muted-foreground">/ {TOTAL_LAPS}</span>
                <span className="text-muted-foreground ml-2">laps</span>
              </div>
              {/* Lap progress dots */}
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: TOTAL_LAPS }, (_, i) => (
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

        {/* Best Lap (Closest to Target) */}
        <div className="glass-card relative rounded-2xl p-6 col-span-2 flex flex-col">
          <Activity className="w-8 h-8 mb-4 text-racing-green" strokeWidth={1.5} />
          <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">
            Best Lap (Target: {Math.floor(TARGET_LAP_TIME / 60)}:{Math.round(TARGET_LAP_TIME % 60).toString().padStart(2, "0")})
          </p>
          <div className="flex-1 flex items-end">
            <span className="text-4xl font-bold text-racing-green font-mono">
              {lapTimes.length > 0 
                ? (() => {
                    const bestLap = lapTimes.reduce((best, time) => 
                      Math.abs(time - TARGET_LAP_TIME) < Math.abs(best - TARGET_LAP_TIME) ? time : best
                    );
                    return `${Math.floor(bestLap / 60)}:${(bestLap % 60).toString().padStart(2, "0")}`;
                  })()
                : "--:--"
              }
            </span>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default Index;
