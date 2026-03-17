"use client";

import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Re-importing Leaflet types for better TS support
import L from "leaflet";

interface MapProps {
  geoJsonData: any;
}

// Simple color helper for the demo
const getThreatColor = (name: string) => {
  const highRisk = ["SYDNEY", "BLACKTOWN"];
  if (highRisk.includes(name.toUpperCase())) return "#ef4444"; // Red
  return "#4f46e5"; // Indigo
};

export default function Map({ geoJsonData }: MapProps) {
  return (
    <div className="h-150 w-full relative">
      <MapContainer
        center={[-33.8688, 151.2093]}
        zoom={10}
        className="h-full w-full outline-none bg-zinc-950"
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />

        {geoJsonData && (
          <GeoJSON
            key={geoJsonData.features?.length || "loading"}
            data={geoJsonData}
            style={(feature) => {
              const name = feature?.properties?.NSW_LGA__3 || "";
              const isHigh = ["SYDNEY", "BLACKTOWN"].includes(name.toUpperCase());
              return {
                color: "#818cf8",
                weight: 1.5,
                fillColor: getThreatColor(name),
                fillOpacity: isHigh ? 0.4 : 0.1,
              };
            }}
            onEachFeature={(feature: any, layer: any) => {
              const name = feature.properties?.NSW_LGA__3 || "Unknown District";
              const council = feature.properties?.NSW_LGA__2 || "N/A";

              layer.bindPopup(`
                <div style="color: #18181b; font-family: sans-serif; min-width: 160px;">
                  <strong style="display: block; color: #4f46e5; font-size: 10px; text-transform: uppercase;">LGA Intelligence</strong>
                  <div style="font-size: 16px; font-weight: bold; margin-bottom: 2px;">${name}</div>
                  <div style="font-size: 11px; color: #71717a;">${council}</div>
                </div>
              `);

              layer.on({
                mouseover: (e: any) => {
                  e.target.setStyle({ fillOpacity: 0.6, weight: 3 });
                },
                mouseout: (e: any) => {
                  const name = feature.properties?.NSW_LGA__3 || "";
                  const isHigh = ["SYDNEY", "BLACKTOWN"].includes(name.toUpperCase());
                  e.target.setStyle({ fillOpacity: isHigh ? 0.4 : 0.1, weight: 1.5 });
                },
              });
            }}
          />
        )}
      </MapContainer>
      
      {/* Small Overlay Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-zinc-900/80 p-3 rounded-lg border border-zinc-800 backdrop-blur-sm text-[10px] text-zinc-400">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-red-500"></span> High Risk Area
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500"></span> Standard Monitoring
        </div>
      </div>
    </div>
  );
}