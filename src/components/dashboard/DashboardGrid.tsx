import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Responsive, WidthProvider, type Layout, type Layouts } from "react-grid-layout";
import { cn } from "@/lib/utils";
import {
  BREAKPOINTS,
  COLS,
  ROW_HEIGHT,
  GRID_MARGIN,
  CONTAINER_PADDING,
  DEFAULT_LAYOUTS,
  defaultLayoutsClone,
  mergeWithRegistry,
  type BreakpointKey,
} from "@/lib/gridConfig";
import { readGridLayout, writeGridLayout, clearGridLayout } from "@/lib/gridLayoutCache";
import type { GPSTrackHandle } from "./GPSTrack";

// Composed ONCE at module scope — recreating WidthProvider(Responsive) inside the
// component would remount the grid on every render and drop drag state.
const ResponsiveGridLayout = WidthProvider(Responsive);

export interface DashboardGridHandle {
  reset: () => void;
}

interface DashboardGridProps {
  editMode: boolean;
  isAdmin: boolean;
  gpsRef: RefObject<GPSTrackHandle>;
  children: ReactNode;
}

const DashboardGrid = forwardRef<DashboardGridHandle, DashboardGridProps>(
  ({ editMode, isAdmin, gpsRef, children }, ref) => {
    const [layouts, setLayouts] = useState<Layouts>(() => mergeWithRegistry(readGridLayout()));
    const [breakpoint, setBreakpoint] = useState<BreakpointKey>("lg");

    // Editing is a desktop affordance; below the base breakpoint the grid is static.
    const interactive = isAdmin && editMode && breakpoint !== "base";

    // Keep the latest layout + persist-permission for the debounce/flush closures.
    const latestLayoutsRef = useRef(layouts);
    latestLayoutsRef.current = layouts;
    const canPersistRef = useRef(false);
    canPersistRef.current = isAdmin && editMode;
    const persistTimer = useRef<number | null>(null);

    const flushPersist = useCallback(() => {
      if (persistTimer.current != null) {
        clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
      if (canPersistRef.current) writeGridLayout(latestLayoutsRef.current);
    }, []);

    const schedulePersist = useCallback(() => {
      if (persistTimer.current != null) clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(() => {
        persistTimer.current = null;
        if (canPersistRef.current) writeGridLayout(latestLayoutsRef.current);
      }, 500);
    }, []);

    // Always keep the in-memory layout live so the UI tracks; only WRITE when the
    // admin is actively editing — this single guard also stops react-grid-layout's
    // synthetic first-mount onLayoutChange from clobbering a saved layout.
    const handleLayoutChange = useCallback(
      (_current: Layout[], all: Layouts) => {
        setLayouts(all);
        latestLayoutsRef.current = all;
        schedulePersist();
      },
      [schedulePersist],
    );

    // On drop, commit immediately. A move only needs the map to re-measure; a resize
    // also re-frames the track so a new aspect ratio doesn't crop it.
    const handleDragStop = useCallback(() => {
      flushPersist();
      gpsRef.current?.resizeMap();
    }, [flushPersist, gpsRef]);

    const handleResizeStop = useCallback(() => {
      flushPersist();
      gpsRef.current?.refitMap();
    }, [flushPersist, gpsRef]);

    // Don't lose an in-flight edit if the tab is hidden or the page unmounts.
    useEffect(() => {
      const onHide = () => {
        if (document.visibilityState === "hidden") flushPersist();
      };
      document.addEventListener("visibilitychange", onHide);
      return () => {
        document.removeEventListener("visibilitychange", onHide);
        if (persistTimer.current != null) clearTimeout(persistTimer.current);
      };
    }, [flushPersist]);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          const fresh = defaultLayoutsClone();
          setLayouts(fresh);
          latestLayoutsRef.current = fresh;
          clearGridLayout();
          writeGridLayout(DEFAULT_LAYOUTS); // make the cleared state durable
          requestAnimationFrame(() => gpsRef.current?.resizeMap());
        },
      }),
      [gpsRef],
    );

    return (
      <div className={cn(interactive && "grid-editing")}>
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          margin={GRID_MARGIN}
          containerPadding={CONTAINER_PADDING}
          isDraggable={interactive}
          isResizable={interactive}
          draggableHandle=".drag-handle"
          draggableCancel=".no-drag"
          resizeHandles={interactive ? ["se"] : []}
          compactType="vertical"
          preventCollision={false}
          onLayoutChange={handleLayoutChange}
          onBreakpointChange={(bp) => setBreakpoint(bp as BreakpointKey)}
          onDragStop={handleDragStop}
          onResizeStop={handleResizeStop}
        >
          {children}
        </ResponsiveGridLayout>
      </div>
    );
  },
);

DashboardGrid.displayName = "DashboardGrid";

export default DashboardGrid;
