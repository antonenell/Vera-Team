import { Radio, Mic, MicOff, Volume2, Users, WifiOff, PhoneOff, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { VoiceParticipantRow } from "./VoiceParticipantRow";
import type { useVoiceChat } from "@/hooks/useVoiceChat";

type VoiceApi = ReturnType<typeof useVoiceChat>;

interface VoiceChatProps {
  api: VoiceApi;
  isAdmin: boolean;
  className?: string;
}

function statusBadge(state: VoiceApi["state"]) {
  switch (state) {
    case "idle":
    case "disconnected":
      return { label: "Frånkopplad", variant: "secondary" as const };
    case "fetching-token":
    case "connecting":
      return { label: "Ansluter…", variant: "secondary" as const };
    case "reconnecting":
      return { label: "Återansluter…", variant: "secondary" as const };
    case "connected":
      return { label: "Ansluten", variant: "default" as const };
    case "error":
      return { label: "Fel", variant: "destructive" as const };
  }
}

export function VoiceChat({ api, isAdmin, className }: VoiceChatProps) {
  const {
    state,
    isMuted,
    toggleMute,
    setVolume,
    volume,
    participants,
    activeSpeakerIdentities,
    canPublish,
    error,
    join,
    leave,
    room,
  } = api;

  const badge = statusBadge(state);
  const isConnected = state === "connected" || state === "reconnecting";
  const isOffline = state === "disconnected" || state === "idle" || state === "error";

  return (
    <div className={cn("glass-card relative rounded-2xl p-6 flex flex-col", className)}>
      {/* Header row: icon + label + status badge */}
      <div className="flex items-start justify-between mb-4">
        <Radio
          className={cn(
            "w-8 h-8",
            isConnected ? "text-racing-cyan" : "text-muted-foreground"
          )}
          strokeWidth={1.5}
        />
        <Badge variant={badge.variant} className="ml-2">
          {state === "reconnecting" && <WifiOff className="w-3 h-3 mr-1" />}
          {badge.label}
        </Badge>
      </div>

      <p className="text-muted-foreground text-sm font-medium mb-2 uppercase tracking-wide">
        Voice Chat
      </p>

      <div className="flex-1 flex flex-col gap-4">
        {/* Connect / Disconnect + Mute */}
        <div className="flex gap-2">
          {isOffline ? (
            <Button onClick={() => void join()} className="flex-1 gap-2" disabled={state === "fetching-token" || state === "connecting"}>
              <Phone className="w-4 h-4" />
              Anslut
            </Button>
          ) : (
            <>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex-1">
                      <Button
                        onClick={() => void toggleMute()}
                        variant={isMuted ? "secondary" : "default"}
                        className="w-full gap-2"
                        disabled={!canPublish || !isConnected}
                      >
                        {isMuted ? (
                          <>
                            <MicOff className="w-4 h-4" />
                            Unmute
                          </>
                        ) : (
                          <>
                            <Mic className="w-4 h-4" />
                            Mute
                          </>
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canPublish && (
                    <TooltipContent>Spectators kan endast lyssna</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              <Button
                onClick={() => void leave()}
                variant="outline"
                size="icon"
                title="Lämna"
              >
                <PhoneOff className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>

        {/* Volume slider — only when connected */}
        {isConnected && (
          <div className="flex items-center gap-3">
            <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <Slider
              value={[Math.round(volume * 100)]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setVolume((v[0] ?? 0) / 100)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground font-mono w-8 text-right">
              {Math.round(volume * 100)}
            </span>
          </div>
        )}

        {/* Participant list */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Deltagare {isConnected && `(${participants.length})`}
            </span>
          </div>
          <ScrollArea className="no-drag flex-1 min-h-[56px]">
            {participants.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                {isOffline ? "Anslut för att se vilka som är med" : "Inga andra deltagare"}
              </p>
            ) : (
              <div className="flex flex-col">
                {participants.map((p) => (
                  <VoiceParticipantRow
                    key={p.identity}
                    participant={p}
                    isSpeaking={activeSpeakerIdentities.has(p.identity)}
                    isSelf={p === room?.localParticipant}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-xs text-racing-red bg-racing-red/10 rounded px-2 py-1.5">
            {error}
          </p>
        )}

        {/* Role hint — only shown when the server actually denies publish */}
        {!canPublish && isConnected && (
          <p className="text-xs text-muted-foreground italic">
            Du kan lyssna men inte tala.
          </p>
        )}
      </div>
    </div>
  );
}
