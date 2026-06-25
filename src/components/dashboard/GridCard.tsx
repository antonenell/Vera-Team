import { GripHorizontal } from "lucide-react";
import type { ReactNode } from "react";

interface GridCardProps {
  editMode: boolean;
  children: ReactNode;
}

/**
 * Wraps each dashboard card inside a grid cell. In edit mode it renders the
 * dedicated ".drag-handle" grip — the ONLY place a drag starts (react-grid-layout
 * draggableHandle), so every button/slider/map inside the card keeps working with
 * a normal click. The card fills the cell; resizing is the corner handle that
 * react-grid-layout injects on the parent grid item.
 */
const GridCard = ({ editMode, children }: GridCardProps) => (
  // overflow-hidden + matching radius clips a card's content when it's shrunk below
  // its natural height, so nothing bleeds onto neighbours (internal scroll regions
  // keep working inside the clip).
  <div className="relative h-full w-full overflow-hidden rounded-2xl">
    {children}
    {editMode && (
      <div
        className="drag-handle absolute top-1.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full bg-racing-blue/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-lg cursor-grab active:cursor-grabbing select-none"
        title="Drag to move this box"
      >
        <GripHorizontal className="h-3.5 w-3.5" />
        Move
      </div>
    )}
  </div>
);

export default GridCard;
