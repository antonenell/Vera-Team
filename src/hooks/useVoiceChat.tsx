import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  ConnectionState,
  RemoteParticipant,
  type LocalParticipant,
  type Participant,
} from "livekit-client";
import { supabase } from "@/integrations/supabase/client";

type VoiceState =
  | "idle"
  | "fetching-token"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

interface TokenResponse {
  token: string;
  url: string;
  room: string;
  canPublish: boolean;
  identity: string;
}

interface VoiceChatApi {
  room: Room | null;
  state: VoiceState;
  isMuted: boolean;
  toggleMute: () => Promise<void>;
  setVolume: (v: number) => void;
  volume: number;
  participants: Participant[];
  activeSpeakerIdentities: Set<string>;
  canPublish: boolean;
  error: string | null;
  join: () => Promise<void>;
  leave: () => Promise<void>;
}

/**
 * Manages a single LiveKit voice-chat session for the current Supabase user.
 *
 * Auth: pulls the user's access_token via supabase.auth.getSession(), POSTs to
 * /api/livekit-token, then connects to the room returned by the endpoint. The
 * `canPublish` flag is server-decided based on the user's admin role.
 *
 * The hook keeps a single Room instance alive across re-renders via a ref.
 * Reconnects are handled by the SDK; we surface state transitions.
 */
export function useVoiceChat(): VoiceChatApi {
  const roomRef = useRef<Room | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<VoiceState>("idle");
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolumeState] = useState(1);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeSpeakerIdentities, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [canPublish, setCanPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshParticipants = useCallback((r: Room) => {
    const local = r.localParticipant as LocalParticipant | undefined;
    const remotes = Array.from(r.remoteParticipants.values()) as RemoteParticipant[];
    const all: Participant[] = local ? [local, ...remotes] : remotes;
    setParticipants(all);
  }, []);

  const join = useCallback(async () => {
    if (roomRef.current && roomRef.current.state !== ConnectionState.Disconnected) {
      return;
    }
    setError(null);
    setState("fetching-token");

    try {
      // Auth is optional — if the user happens to be signed in, send the token
      // so the server can use their email as the display name. Anonymous joins
      // are allowed too.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const resp = await fetch("/api/livekit-token", {
        method: "POST",
        headers,
        body: JSON.stringify({ kind: "web" }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(body.error ?? `Token endpoint returned ${resp.status}`);
      }
      const data = (await resp.json()) as TokenResponse;
      setCanPublish(data.canPublish);

      // Trim — Vercel sometimes preserves trailing newlines from env-var paste.
      const url = ((import.meta.env.VITE_LIVEKIT_URL as string | undefined) || data.url).trim();

      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      r.on(RoomEvent.ConnectionStateChanged, (cs) => {
        switch (cs) {
          case ConnectionState.Connecting:
            setState("connecting");
            break;
          case ConnectionState.Connected:
            setState("connected");
            break;
          case ConnectionState.Reconnecting:
            setState("reconnecting");
            break;
          case ConnectionState.Disconnected:
            setState("disconnected");
            break;
        }
      });

      const refresh = () => refreshParticipants(r);
      r.on(RoomEvent.ParticipantConnected, refresh);
      r.on(RoomEvent.ParticipantDisconnected, refresh);
      r.on(RoomEvent.TrackMuted, refresh);
      r.on(RoomEvent.TrackUnmuted, refresh);

      r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        setActiveSpeakers(new Set(speakers.map((s) => s.identity)));
      });

      setState("connecting");
      await r.connect(url, data.token, { autoSubscribe: true });

      roomRef.current = r;
      setRoom(r);
      refreshParticipants(r);
      setIsMuted(true); // start muted to avoid surprise hot mics
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Voice join failed:", message);
      setError(message);
      setState("error");
    }
  }, [refreshParticipants]);

  const leave = useCallback(async () => {
    const r = roomRef.current;
    if (r) {
      await r.disconnect();
      roomRef.current = null;
      setRoom(null);
    }
    setParticipants([]);
    setActiveSpeakers(new Set());
    setIsMuted(true);
    setState("idle");
  }, []);

  const toggleMute = useCallback(async () => {
    const r = roomRef.current;
    if (!r || !canPublish) return;
    try {
      const enable = isMuted; // currently muted → want to unmute
      await r.localParticipant.setMicrophoneEnabled(enable);
      setIsMuted(!enable);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Mic toggle failed:", message);
      setError(message);
    }
  }, [isMuted, canPublish]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    const r = roomRef.current;
    if (!r) return;
    r.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        pub.track?.setVolume(clamped);
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
    };
  }, []);

  return {
    room,
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
  };
}
