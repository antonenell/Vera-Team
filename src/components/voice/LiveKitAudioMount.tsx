import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";
import type { Room } from "livekit-client";

/**
 * Mounts the LiveKit audio renderer for a Room. Mounted high in the tree so
 * audio doesn't get unmounted when the VoiceChat card re-renders.
 */
export function LiveKitAudioMount({ room }: { room: Room | null }) {
  if (!room) return null;
  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer />
    </RoomContext.Provider>
  );
}
