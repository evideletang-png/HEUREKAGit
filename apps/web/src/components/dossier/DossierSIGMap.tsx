import { MapContainer, TileLayer, Polygon, Marker, Popup, LayersControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Landmark, ShieldAlert, Map as MapIcon } from "lucide-react";
import { SHARED_MAP_CONTAINER_OPTIONS, SHARED_MAP_TILE_LAYERS } from "@/lib/mapTiles";

interface DossierSIGMapProps {
  centroid: [number, number];
  parcelShape?: number[][][];
  isAbfConcerned?: boolean;
  constraints?: any[];
}

export function DossierSIGMap({ centroid, parcelShape, isAbfConcerned, constraints = [] }: DossierSIGMapProps) {
  // Convert [lng, lat] to [lat, lng] for Leaflet
  const formatCoords = (coords: number[][]) => coords.map(c => [c[1], c[0]] as [number, number]);

  return (
    <Card className="h-[500px] w-full rounded-2xl overflow-hidden border-none shadow-xl relative ring-1 ring-slate-200">
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        <Badge className="bg-white/90 backdrop-blur-md text-slate-900 border-slate-200 shadow-lg px-3 py-1.5 flex items-center gap-2">
          <MapIcon className="w-3.5 h-3.5 text-primary" />
          <span className="font-bold text-[10px] uppercase tracking-widest">Vue SIG Expert</span>
        </Badge>
        {isAbfConcerned && (
          <Badge className="bg-amber-500/90 backdrop-blur-md text-white border-none shadow-lg px-3 py-1.5 flex items-center gap-2 animate-pulse">
            <Landmark className="w-3.5 h-3.5" />
            <span className="font-bold text-[10px] uppercase tracking-widest">Périmètre ABF (SPR/MH)</span>
          </Badge>
        )}
      </div>

      <MapContainer
        center={centroid}
        zoom={19}
        maxZoom={SHARED_MAP_CONTAINER_OPTIONS.maxZoom}
        zoomSnap={SHARED_MAP_CONTAINER_OPTIONS.zoomSnap}
        zoomDelta={SHARED_MAP_CONTAINER_OPTIONS.zoomDelta}
        wheelPxPerZoomLevel={SHARED_MAP_CONTAINER_OPTIONS.wheelPxPerZoomLevel}
        zoomAnimation={false}
        fadeAnimation={false}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Plan">
            <TileLayer
              url={SHARED_MAP_TILE_LAYERS.plan.url}
              attribution={SHARED_MAP_TILE_LAYERS.plan.attribution}
              {...SHARED_MAP_TILE_LAYERS.plan.tileOptions}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite HD (IGN)">
            <TileLayer
              url={SHARED_MAP_TILE_LAYERS.satellite.url}
              attribution={SHARED_MAP_TILE_LAYERS.satellite.attribution}
              {...SHARED_MAP_TILE_LAYERS.satellite.tileOptions}
            />
          </LayersControl.BaseLayer>

          {/* Parcel Polygon */}
          {parcelShape && (
            <Polygon 
              positions={parcelShape.map(formatCoords)} 
              pathOptions={{ 
                color: '#6366f1', 
                fillColor: '#6366f1', 
                fillOpacity: 0.2,
                weight: 3
              }} 
            />
          )}

          {/* Marker at centroid */}
          <Marker position={centroid}>
            <Popup>
              <div className="p-2">
                <p className="font-bold text-sm mb-1">Parcelle d'intérêt</p>
                {isAbfConcerned && <p className="text-xs text-amber-600 font-medium">Attention : Zone protégée ABF</p>}
              </div>
            </Popup>
          </Marker>

          {/* ABF Constraints visualization (Mock circles or buffers) */}
          {isAbfConcerned && (
             <Polygon 
               positions={[centroid]} // Simplified for now
               pathOptions={{ color: '#b45309', dashArray: '5, 10', fillOpacity: 0 }}
             />
          )}
        </LayersControl>
      </MapContainer>

      <div className="absolute bottom-4 right-4 z-[1000] space-y-2">
         {constraints.map((c, i) => (
           <div key={i} className="bg-white/95 backdrop-blur shadow-lg border border-slate-100 p-3 rounded-xl flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <ShieldAlert className="w-4 h-4 text-amber-700" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-tighter text-slate-800">{c.type}</p>
                <p className="text-[9px] text-slate-500 font-medium">{c.distance}m de distance</p>
              </div>
           </div>
         ))}
      </div>
    </Card>
  );
}
