import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FlagColor = "grey" | "yellow" | "red" | "black";
export type TrackName = "stora-holm" | "silesia-ring";

/** A flag as the dashboard renders it: position + colour, sourced from the DB. */
export interface FlagData {
  flagId: string;
  lng: number;
  lat: number;
  color: FlagColor;
}

interface TrackConfig {
  name: string;
  bounds: [[number, number], [number, number]];
  /**
   * Historical seed positions. The database is now the source of truth for flag
   * positions (see migration 20260624090000); these stay only as documentation
   * of the originally-seeded Stora Holm flags.
   */
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

/**
 * Live track-flag state for one track. Positions and colours both live in the
 * `track_flags` table and sync in realtime. Admins can place, relocate, recolour
 * and delete flags; every mutation writes through to the DB (optimistically) and
 * is echoed back to every connected client.
 */
export const useTrackFlags = (isAdmin: boolean, selectedTrack: TrackName) => {
  const [flags, setFlags] = useState<Record<string, FlagData>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Flag ids that have been mutated locally (optimistic ops or realtime events)
  // since the in-flight initial fetch started. The fetch must not clobber these
  // with its older snapshot. Reset whenever a new fetch begins.
  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const markDirty = useCallback((id: string) => {
    dirtyIdsRef.current.add(id);
  }, []);

  // Fetch flags for the selected track. Clear first so flags from a previously
  // selected track never flash on the new track's map.
  useEffect(() => {
    let cancelled = false;
    setFlags({});
    dirtyIdsRef.current = new Set();
    setIsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("track_flags")
        .select("*")
        .eq("track_id", selectedTrack);

      if (cancelled) return;
      if (data && !error) {
        const withCoords: Record<string, FlagData> = {};
        const colorOnly: Record<string, FlagColor> = {};
        data.forEach((f) => {
          if (f.lng != null && f.lat != null) {
            withCoords[f.flag_id] = {
              flagId: f.flag_id,
              lng: f.lng,
              lat: f.lat,
              color: f.color as FlagColor,
            };
          } else {
            colorOnly[f.flag_id] = f.color as FlagColor;
          }
        });

        // The DB is the source of truth. But if the position columns haven't
        // been migrated yet (no row has coordinates), fall back to the hardcoded
        // default positions so flags still render — coloured by whatever colour
        // rows exist. This keeps the live dashboard working before the
        // flag-positions migration is applied; once it's applied (which seeds
        // coordinates) the DB becomes fully authoritative and editing works.
        let base = withCoords;
        if (Object.keys(withCoords).length === 0) {
          base = {};
          tracks[selectedTrack].defaultFlags.forEach((df) => {
            const id = String(df.id);
            base[id] = {
              flagId: id,
              lng: df.coords[0],
              lat: df.coords[1],
              color: colorOnly[id] ?? "grey",
            };
          });
        }

        // Merge: this snapshot is the base, but any flag touched locally (by a
        // realtime event or an optimistic op) while the fetch was in flight is
        // newer — keep the live value, or drop it if it was deleted locally.
        setFlags((prev) => {
          const merged = { ...base };
          dirtyIdsRef.current.forEach((id) => {
            if (prev[id]) merged[id] = prev[id];
            else delete merged[id];
          });
          return merged;
        });
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTrack]);

  // Subscribe to realtime changes for this track.
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
          if (payload.eventType === "DELETE") {
            const old = payload.old as { flag_id?: string };
            if (!old?.flag_id) return;
            markDirty(old.flag_id);
            setFlags((prev) => {
              const next = { ...prev };
              delete next[old.flag_id!];
              return next;
            });
            return;
          }

          const row = payload.new as {
            flag_id: string;
            color: string;
            lng: number | null;
            lat: number | null;
          };
          markDirty(row.flag_id);
          if (row.lng != null && row.lat != null) {
            setFlags((prev) => ({
              ...prev,
              [row.flag_id]: {
                flagId: row.flag_id,
                lng: row.lng as number,
                lat: row.lat as number,
                color: row.color as FlagColor,
              },
            }));
          } else {
            // Legacy colour-only row: only touch a flag we already track.
            setFlags((prev) =>
              prev[row.flag_id]
                ? { ...prev, [row.flag_id]: { ...prev[row.flag_id], color: row.color as FlagColor } }
                : prev
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTrack, markDirty]);

  const addFlag = useCallback(
    async (lng: number, lat: number) => {
      if (!isAdmin) return;
      const flagId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `flag-${Date.now()}-${Math.round(lng * 1e5)}`;

      // Optimistic insert.
      markDirty(flagId);
      setFlags((prev) => ({
        ...prev,
        [flagId]: { flagId, lng, lat, color: "grey" },
      }));

      const { error } = await supabase.from("track_flags").insert({
        track_id: selectedTrack,
        flag_id: flagId,
        color: "grey",
        lng,
        lat,
      });

      if (error) {
        console.error("addFlag failed:", error);
        setFlags((prev) => {
          const next = { ...prev };
          delete next[flagId];
          return next;
        });
      }
    },
    [isAdmin, selectedTrack, markDirty]
  );

  const moveFlag = useCallback(
    async (flagId: string, lng: number, lat: number) => {
      if (!isAdmin) return;

      // Optimistic move so the marker doesn't snap back while the round-trip
      // completes. Capture the prior position so we can roll back on failure.
      markDirty(flagId);
      let prev: FlagData | undefined;
      setFlags((cur) => {
        prev = cur[flagId];
        return cur[flagId] ? { ...cur, [flagId]: { ...cur[flagId], lng, lat } } : cur;
      });

      const { error } = await supabase
        .from("track_flags")
        .update({ lng, lat, updated_at: new Date().toISOString() })
        .eq("track_id", selectedTrack)
        .eq("flag_id", flagId);

      if (error && prev) {
        console.error("moveFlag failed:", error);
        const { lng: pLng, lat: pLat } = prev;
        setFlags((cur) =>
          cur[flagId] ? { ...cur, [flagId]: { ...cur[flagId], lng: pLng, lat: pLat } } : cur
        );
      }
    },
    [isAdmin, selectedTrack, markDirty]
  );

  const deleteFlag = useCallback(
    async (flagId: string) => {
      if (!isAdmin) return;

      markDirty(flagId);
      let removed: FlagData | undefined;
      setFlags((prev) => {
        removed = prev[flagId];
        const next = { ...prev };
        delete next[flagId];
        return next;
      });

      const { error } = await supabase
        .from("track_flags")
        .delete()
        .eq("track_id", selectedTrack)
        .eq("flag_id", flagId);

      if (error) {
        console.error("deleteFlag failed:", error);
        if (removed) {
          const restored = removed;
          setFlags((prev) => ({ ...prev, [flagId]: restored }));
        }
      }
    },
    [isAdmin, selectedTrack, markDirty]
  );

  const updateFlagColor = useCallback(
    async (flagId: string, color: FlagColor) => {
      if (!isAdmin) return;

      markDirty(flagId);
      let prevColor: FlagColor | undefined;
      setFlags((cur) => {
        prevColor = cur[flagId]?.color;
        return cur[flagId] ? { ...cur, [flagId]: { ...cur[flagId], color } } : cur;
      });

      const { error } = await supabase
        .from("track_flags")
        .update({ color, updated_at: new Date().toISOString() })
        .eq("track_id", selectedTrack)
        .eq("flag_id", flagId);

      if (error && prevColor) {
        console.error("updateFlagColor failed:", error);
        const restore = prevColor;
        setFlags((cur) =>
          cur[flagId] ? { ...cur, [flagId]: { ...cur[flagId], color: restore } } : cur
        );
      }
    },
    [isAdmin, selectedTrack, markDirty]
  );

  const resetFlags = useCallback(async () => {
    if (!isAdmin) return;

    let snapshot: Record<string, FlagData> = {};
    setFlags((prev) => {
      snapshot = prev;
      const next: Record<string, FlagData> = {};
      Object.values(prev).forEach((f) => {
        markDirty(f.flagId);
        next[f.flagId] = { ...f, color: "grey" };
      });
      return next;
    });

    const { error } = await supabase
      .from("track_flags")
      .update({ color: "grey", updated_at: new Date().toISOString() })
      .eq("track_id", selectedTrack);

    if (error) {
      console.error("resetFlags failed:", error);
      // Restore each still-present flag's prior colour.
      setFlags((cur) => {
        const next: Record<string, FlagData> = {};
        Object.values(cur).forEach((f) => {
          next[f.flagId] = { ...f, color: snapshot[f.flagId]?.color ?? f.color };
        });
        return next;
      });
    }
  }, [isAdmin, selectedTrack, markDirty]);

  const getFlagColor = useCallback(
    (flagId: string): FlagColor => flags[flagId]?.color ?? "grey",
    [flags]
  );

  return {
    flags,
    getFlagColor,
    addFlag,
    moveFlag,
    deleteFlag,
    updateFlagColor,
    resetFlags,
    isLoading,
  };
};
