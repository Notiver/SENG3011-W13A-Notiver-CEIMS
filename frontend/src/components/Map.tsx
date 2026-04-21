"use client";

import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { Layer, LeafletMouseEvent, Path } from "leaflet";
import "leaflet/dist/leaflet.css";

type LgaProperties = {
  NSW_LGA__3?: string;
  NSW_LGA__2?: string;
  liveScore?: number;
  liveCrimes?: number;
};

interface MapProps {
  geoJsonData: FeatureCollection;
}

const HIGH_RISK   = ["SYDNEY", "BLACKTOWN", "PENRITH", "LIVERPOOL", "MOREE PLAINS", "WALGETT"];
const MEDIUM_RISK = ["PARRAMATTA", "CUMBERLAND", "NEWCASTLE", "CENTRAL COAST", "RANDWICK"];
const LOW_RISK    = ["CANADA BAY", "GEORGES RIVER", "WILLOUGHBY", "RYDE", "KU-RING-GAI"];

const COLOR = {
  danger:  "#fb7185",
  warn:    "#fbbf24",
  success: "#34d399",
  accent:  "#6366f1",
};

const tierFor = (name: string) => {
  const n = name.toUpperCase();
  if (HIGH_RISK.includes(n))   return { label: "High risk",     color: COLOR.danger,  fillOpacity: 0.42, minC: 0.75, maxC: 0.99, minN: 0.70, maxN: 0.95 };
  if (MEDIUM_RISK.includes(n)) return { label: "Elevated",      color: COLOR.warn,    fillOpacity: 0.35, minC: 0.35, maxC: 0.65, minN: 0.35, maxN: 0.65 };
  if (LOW_RISK.includes(n))    return { label: "Low risk",      color: COLOR.success, fillOpacity: 0.28, minC: 0.00, maxC: 0.20, minN: 0.00, maxN: 0.20 };
  return                          { label: "Standard",         color: COLOR.accent,  fillOpacity: 0.14, minC: 0.1,  maxC: 0.3,  minN: 0.1,  maxN: 0.3  };
};

const seedScore = (name: string, salt: string, min: number, max: number) => {
  const s = name + salt;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const norm = Math.abs(Math.sin(h));
  return (min + norm * (max - min)).toFixed(2);
};

export default function Map({ geoJsonData }: MapProps) {
  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[-33.8688, 151.2093]}
        zoom={10}
        className="h-full w-full outline-none"
        style={{ background: "var(--surface-0)" }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution=""
        />

        {geoJsonData && (
          <GeoJSON
            key={geoJsonData.features?.length || "loading"}
            data={geoJsonData}
            style={(feature) => {
              const props = feature?.properties as LgaProperties | undefined;
              const name = props?.NSW_LGA__3 || "";
              const tier = tierFor(name);
              return {
                color: "#353846",
                weight: 1,
                fillColor: tier.color,
                fillOpacity: tier.fillOpacity,
              };
            }}
            onEachFeature={(feature: Feature, layer: Layer) => {
              const props = feature.properties as LgaProperties | undefined;
              const name = props?.NSW_LGA__3 || "Unknown";
              const council = props?.NSW_LGA__2 || "N/A";
              const tier = tierFor(name);

              const crimeScore = seedScore(name, "_CRIME", tier.minC, tier.maxC);
              const newsSentiment = seedScore(name, "_NEWS", tier.minN, tier.maxN);

              layer.bindPopup(`
                <div style="font-family: var(--font-geist-sans), system-ui; min-width: 200px;">
                  <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="width:6px; height:6px; border-radius:2px; background:${tier.color};"></span>
                    <span style="color:${tier.color}; font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:600;">
                      ${tier.label}
                    </span>
                  </div>
                  <div style="font-size:14px; font-weight:600; text-transform:capitalize; color:#f5f6f8;">
                    ${name.toLowerCase()}
                  </div>
                  <div style="font-size:11px; color:#9ea1ad; margin-bottom:10px;">
                    ${council}
                  </div>
                  <div style="border-top:1px solid #23262f; padding-top:8px; font-family: var(--font-geist-mono), ui-monospace; font-size:11px; display:grid; gap:4px;">
                    <div style="display:flex; justify-content:space-between;">
                      <span style="color:#686c78;">Crime severity</span>
                      <strong style="color:${tier.color}; font-weight:600;">${crimeScore}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                      <span style="color:#686c78;">News sentiment</span>
                      <strong style="color:${tier.color}; font-weight:600;">${newsSentiment}</strong>
                    </div>
                  </div>
                </div>
              `);

              layer.on({
                mouseover: (e: LeafletMouseEvent) => (e.target as Path).setStyle({ fillOpacity: Math.min(0.75, tier.fillOpacity + 0.25), weight: 2 }),
                mouseout:  (e: LeafletMouseEvent) => (e.target as Path).setStyle({ fillOpacity: tier.fillOpacity, weight: 1 }),
              });
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
