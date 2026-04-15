import type L from "leaflet";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type MapZoomButtonsProps = {
  map: L.Map | null;
  className?: string;
};

export function MapZoomButtons({ map, className = "" }: MapZoomButtonsProps) {
  return (
    <div className={`absolute bottom-4 left-4 z-[1000] flex flex-col gap-2 ${className}`.trim()}>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-11 w-11 rounded-2xl border border-slate-200 bg-white/92 shadow-lg backdrop-blur"
        onClick={() => map?.zoomIn()}
      >
        <Plus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="h-11 w-11 rounded-2xl border border-slate-200 bg-white/92 shadow-lg backdrop-blur"
        onClick={() => map?.zoomOut()}
      >
        <Minus className="h-4 w-4" />
      </Button>
    </div>
  );
}
