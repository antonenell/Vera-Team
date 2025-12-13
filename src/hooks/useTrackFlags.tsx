import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FlagColor = "grey" | "yellow" | "red" | "black";
export type TrackName = "stora-holm" | "silesia-ring";

interface TrackFlag {
  id: string;
  flagId: string;
  color: FlagColor;
}

interface TrackConfig {
  name: string;
  bounds: [[number, number], [number, number]];
  defaultFlags: { id: number; coords: [number, number] }[];
}

export const tracks: Record<TrackName, TrackConfig> = {
  "stora-holm": {
    name: "Stora Holm",
    bounds: [[11.9127, 57.7745], [11.9228, 57.7779]],
    defaultFlags: [
      { id: 1, coords: [11.9141, 57.7771] },
      { id: 2, coords: [11.9220, 57.7765] },
      { id: 3, coords: [11.9196, 57.7751] },
      { id: 4, coords: [11.9165, 57.7760] },
    ],
  },
  "silesia-ring": {
    name: "Silesia Ring",
    bounds: [[18.0844, 50.5241], [18.1044, 50.5341]],
    defaultFlags: [],
  },
};

export const useTrackFlags = (isAdmin: boolean, selectedTrack: TrackName) => {
  const [flags, setFlags] = useState<Record<string, FlagColor>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch initial flags for track
  useEffect(() => {
    const fetchFlags = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("track_flags")
        .select("*")
        .eq("track_id", selectedTrack);

      if (data && !error) {
        const flagMap: Record<string, FlagColor> = {};
        data.forEach((f) => {
          flagMap[f.flag_id] = f.color as FlagColor;
        });
        setFlags(flagMap);
      }
      setIsLoading(false);
    };

    fetchFlags();
  }, [selectedTrack]);

  // Subscribe to real-time changes
  useEffect(() => {
    const channel = supabase
      .channel(`track_flags_${selectedTrack}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "track_flags",
          filter: `track_id=eq.${selectedTrack}`,
        },
        (payload) => {
          console.log("Flag updated:", payload);
          const newData = payload.new as any;
          if (newData && payload.eventType !== "DELETE") {
            setFlags((prev) => ({
              ...prev,
              [newData.flag_id]: newData.color as FlagColor,
            }));
          } else if (payload.eventType === "DELETE") {
            const oldData = payload.old as any;
            setFlags((prev) => {
              const next = { ...prev };
              delete next[oldData.flag_id];
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTrack]);

  const updateFlagColor = useCallback(
    async (flagId: number, color: FlagColor) => {
      if (!isAdmin) return;

      const flagIdStr = String(flagId);
      const now = new Date().toISOString();

      // Upsert the flag
      await supabase.from("track_flags").upsert(
        {
          track_id: selectedTrack,
          flag_id: flagIdStr,
          color,
          updated_at: now,
        },
        {
          onConflict: "track_id,flag_id",
        }
      );
    },
    [isAdmin, selectedTrack]
  );

  const resetFlags = useCallback(async () => {
    if (!isAdmin) return;

    const trackConfig = tracks[selectedTrack];
    const now = new Date().toISOString();

    // Reset all flags to grey
    const promises = trackConfig.defaultFlags.map((flag) =>
      supabase.from("track_flags").upsert(
        {
          track_id: selectedTrack,
          flag_id: String(flag.id),
          color: "grey",
          updated_at: now,
        },
        {
          onConflict: "track_id,flag_id",
        }
      )
    );

    await Promise.all(promises);
  }, [isAdmin, selectedTrack]);

  // Get flag color with default fallback
  const getFlagColor = (flagId: number): FlagColor => {
    return flags[String(flagId)] || "grey";
  };

  return {
    flags,
    getFlagColor,
    updateFlagColor,
    resetFlags,
    isLoading,
  };
};
