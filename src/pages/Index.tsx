import { useState, useEffect } from "react";
import { Gauge, Thermometer, Activity, User, LogOut } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import GPSTrack from "@/components/dashboard/GPSTrack";
import SystemStatus from "@/components/dashboard/SystemStatus";
import LapTimes from "@/components/dashboard/LapTimes";
import RaceTimer from "@/components/dashboard/RaceTimer";
import { Button } from "@/components/ui/button";
import chalmersLogo from "@/assets/chalmersverateam.svg";

const TOTAL_LAPS = 11;
const RACE_DURATION_SECONDS = 35 * 60; // 35 minutes
const TARGET_RACE_TIME = 34 * 60; // 34 minutes (1 min safety margin)
const TARGET_LAP_TIME = TARGET_RACE_TIME / TOTAL_LAPS; // ~185.5 seconds per lap

const Index = () => {
  // Simulated telemetry data
  const [rpm, setRpm] = useState(4500);
  const [speed, setSpeed] = useState(42);
  const [temperature, setTemperature] = useState(78);
  const [motorRunning, setMotorRunning] = useState(true);
  const [xLogOnline, setXLogOnline] = useState(true);
  const [driverDisplayOnline, setDriverDisplayOnline] = useState(true);
  const [timeLeft, setTimeLeft] = useState(RACE_DURATION_SECONDS);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [lapStartTime, setLapStartTime] = useState(RACE_DURATION_SECONDS);
  const [currentLap, setCurrentLap] = useState(0);
  const [lapTimes, setLapTimes] = useState<number[]>([]);
  const [carPosition, setCarPosition] = useState({ x: 50, y: 20 });
  
  // Current lap elapsed time
  const currentLapElapsed = isTimerRunning && currentLap > 0 ? lapStartTime - timeLeft : 0;

  // Simulate live data updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate RPM fluctuation
      setRpm(prev => Math.max(0, Math.min(8000, prev + (Math.random() - 0.5) * 500)));
      
      // Simulate speed changes
      setSpeed(prev => Math.max(0, Math.min(80, prev + (Math.random() - 0.5) * 5)));
      
      // Simulate temperature
      setTemperature(prev => Math.max(60, Math.min(95, prev + (Math.random() - 0.5) * 2)));
      
      // Simulate car movement on track
      setCarPosition(prev => {
        const angle = Math.atan2(prev.y - 50, prev.x - 50) + 0.05;
        const radiusX = 40;
        const radiusY = 30;
        return {
          x: 50 + radiusX * Math.cos(angle),
          y: 50 + radiusY * Math.sin(angle)
        };
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Countdown timer - only runs when isTimerRunning is true
  useEffect(() => {
    if (!isTimerRunning) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [isTimerRunning]);

  const handleStartStop = () => {
    if (!isTimerRunning) {
      // Starting the timer
      setLapStartTime(timeLeft);
    }
    setIsTimerRunning(prev => !prev);
  };

  const handleLap = () => {
    const lapTime = lapStartTime - timeLeft;
    setLapTimes(prev => [...prev, lapTime]);
    setCurrentLap(prev => prev + 1);
    setLapStartTime(timeLeft);
  };

  const handleReset = () => {
    setTimeLeft(RACE_DURATION_SECONDS);
    setLapStartTime(RACE_DURATION_SECONDS);
    setCurrentLap(0);
    setLapTimes([]);
    setIsTimerRunning(false);
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
      {/* Header */}
      <header className="mb-8 flex items-center justify-between">
        <img src={chalmersLogo} alt="Chalmers Vera Team" className="h-12 w-auto" />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="w-5 h-5" />
            <span className="text-sm font-medium">Admin</span>
          </div>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 auto-rows-fr">
        {/* GPS Track - Large */}
        <GPSTrack 
          position={carPosition} 
          className="col-span-2 row-span-2" 
        />

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

        {/* Timer */}
        <RaceTimer
          timeLeftSeconds={timeLeft}
          totalSeconds={RACE_DURATION_SECONDS}
          isRunning={isTimerRunning}
          onStartStop={handleStartStop}
          onLap={handleLap}
          onReset={handleReset}
          lapTimes={lapTimes}
          targetLapTime={TARGET_LAP_TIME}
          className="col-span-2 row-span-2"
        />

        {/* Temperature */}
        <StatCard
          title="Motor Temp"
          value={Math.round(temperature)}
          unit="°C"
          icon={Thermometer}
          iconColor={temperature > 85 ? "text-racing-red" : "text-racing-green"}
          valueColor={temperature > 85 ? "text-racing-red" : "text-racing-green"}
          className="col-span-1"
        />

        {/* System Status */}
        <SystemStatus 
          xLogOnline={xLogOnline}
          driverDisplayOnline={driverDisplayOnline}
          motorRunning={motorRunning}
          className="col-span-1"
        />

        {/* Lap Times - Tall */}
        <LapTimes
          lapTimes={lapTimes}
          currentLap={currentLap}
          totalLaps={TOTAL_LAPS}
          targetLapTime={TARGET_LAP_TIME}
          currentLapElapsed={currentLapElapsed}
          className="col-span-2 md:col-span-2 row-span-2"
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
