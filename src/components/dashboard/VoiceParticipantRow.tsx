import type { Participant } from "livekit-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceParticipantRowProps {
  participant: Participant;
  isSpeaking: boolean;
  isSelf: boolean;
}

function isMicMuted(p: Participant): boolean {
  const audioPubs = Array.from(p.audioTrackPublications.values());
  if (audioPubs.length === 0) return true;
  return audioPubs.every((pub) => pub.isMuted);
}

function displayName(p: Participant): string {
  if (p.name && p.name.length > 0) return p.name;
  // Fall back to identity, stripping our `web-` / `driver-` prefixes
  return p.identity.replace(/^(web|driver)-/, "");
}

export function VoiceParticipantRow({ participant, isSpeaking, isSelf }: VoiceParticipantRowProps) {
  const name = displayName(participant);
  const muted = isMicMuted(participant);

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className={cn(
          "rounded-full p-0.5 transition-shadow",
          isSpeaking && "ring-2 ring-racing-green ring-offset-2 ring-offset-background"
        )}
      >
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-muted text-xs">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
      <span className="flex-1 text-sm font-medium truncate">
        {name}
        {isSelf && <span className="ml-2 text-muted-foreground text-xs">(du)</span>}
      </span>
      {muted ? (
        <MicOff className="w-4 h-4 text-muted-foreground" />
      ) : (
        <Mic
          className={cn(
            "w-4 h-4 transition-colors",
            isSpeaking ? "text-racing-green" : "text-foreground"
          )}
        />
      )}
    </div>
  );
}
