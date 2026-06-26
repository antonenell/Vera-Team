import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TrackName } from "./useTrackFlags";

export type LngLat = [number, number];

/**
 * The recorded + cleaned track polyline for one track, synced via the
 * `track_paths` table (one row per track). Admins record / tweak it; every viewer
 * sees the saved line and any change in realtime. If the migration isn't applied
 * yet the hook just renders no line instead of throwing.
 */
export const useTrackPath = (isAdmin: boolean, selectedTrack: TrackName) => {
  const [path, setPath] = useState<LngLat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Once a realtime event or a local save has touched the path, the in-flight
  // initial fetch must not clobber it with its older snapshot.
  const dirtyRef = useRef(false);

  // Fetch on track change. Clear first so a previous track's line never flashes.
  useEffect(() => {
    let cancelled = false;
    setPath([]);
    dirtyRef.current = false;
    setIsLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("track_paths")
        .select("path")
        .eq("track_id", selectedTrack)
        .maybeSingle();

      if (cancelled || dirtyRef.current) return;
      if (!error && data && Array.isArray(data.path)) {
        setPath(data.path as unknown as LngLat[]);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTrack]);

  // Realtime: reflect saves from any admin to every viewer.
  useEffect(() => {
    const channel = supabase
      .channel(`track_paths_${selectedTrack}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "track_paths", filter: `track_id=eq.${selectedTrack}` },
        (payload) => {
          dirtyRef.current = true;
          if (payload.eventType === "DELETE") {
            setPath([]);
            return;
          }
          const row = payload.new as { path?: unknown };
          if (Array.isArray(row.path)) setPath(row.path as LngLat[]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTrack]);

  // Admin-gated optimistic upsert (single row per track).
  const savePath = useCallback(
    async (points: LngLat[]) => {
      if (!isAdmin) return;
      let prev: LngLat[] = [];
      setPath((cur) => {
        prev = cur;
        return points;
      });
      dirtyRef.current = true;

      const { error } = await supabase.from("track_paths").upsert(
        {
          track_id: selectedTrack,
          path: points,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "track_id" }
      );

      if (error) {
        console.error("savePath failed:", error);
        // Only roll back if a realtime update hasn't superseded our optimistic value.
        setPath((cur) => (cur === points ? prev : cur));
      }
    },
    [isAdmin, selectedTrack]
  );

  // Delete the whole track (admin).
  const clearPath = useCallback(async () => {
    if (!isAdmin) return;
    let prev: LngLat[] = [];
    setPath((cur) => {
      prev = cur;
      return [];
    });
    dirtyRef.current = true;

    const { error } = await supabase.from("track_paths").delete().eq("track_id", selectedTrack);
    if (error) {
      console.error("clearPath failed:", error);
      setPath((cur) => (cur.length === 0 ? prev : cur));
    }
  }, [isAdmin, selectedTrack]);

  return { path, savePath, clearPath, isLoading };
};
