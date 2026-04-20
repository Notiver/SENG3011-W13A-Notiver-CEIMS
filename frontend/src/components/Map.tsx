"use client";

import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

interface MapProps {
  geoJsonData: any;
  viewMode: "crime" | "housing";
}

const HIGH_RISK = ["SYDNEY", "BLACKTOWN", "PENRITH", "LIVERPOOL", "MOREE PLAINS", "WALGETT"];
const MEDIUM_RISK = ["PARRAMATTA", "CUMBERLAND", "NEWCASTLE", "CENTRAL COAST", "RANDWICK"];
const LOW_RISK = ["CANADA BAY", "GEORGES RIVER", "WILLOUGHBY", "RYDE", "KU-RING-GAI"];

const getThreatColor = (name: string) => {
  const upperName = name.toUpperCase();
  if (HIGH_RISK.includes(upperName)) return "#ef4444"; // Red
  if (MEDIUM_RISK.includes(upperName)) return "#f97316"; // Orange
  if (LOW_RISK.includes(upperName)) return "#22c55e"; // Green
  return "#4f46e5"; // Indigo (Standard)
};

const getThreatOpacity = (name: string) => {
  const upperName = name.toUpperCase();
  if (HIGH_RISK.includes(upperName)) return 0.5;
  if (MEDIUM_RISK.includes(upperName)) return 0.4;
  if (LOW_RISK.includes(upperName)) return 0.3;
  return 0.1;
};

const getScore = (lgaName: string, salt: string, min: number, max: number) => {
  const seedStr = lgaName + salt;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const normalized = Math.abs(Math.sin(hash)); 
  return (min + normalized * (max - min)).toFixed(2);
};

const getHousingColor = (score: number | null) => {
  if (score === null) return "#3f3f46"; // Sleek Dark Gray for Water / No Data
  if (score < 40) return "#ef4444"; 
  if (score < 70) return "#f97316"; 
  return "#22c55e"; 
};

const getHousingOpacity = (score: number | null) => {
  if (score === null) return 0.1; // Barely visible for water
  if (score < 40) return 0.4; 
  if (score < 70) return 0.3;
  return 0.2;
};

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(val);
}

export default function Map({ geoJsonData, viewMode }: MapProps) {
  return (
    <div className="h-full w-full relative">
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
            key={`${viewMode}-${geoJsonData.features?.length || "loading"}`}
            data={geoJsonData}
            style={(feature) => {
              const name = feature?.properties?.NSW_LGA__3 || "";
              
              if (viewMode === "crime") {
                return {
                  color: "#818cf8",
                  weight: 1.5,
                  fillColor: getThreatColor(name),
                  fillOpacity: getThreatOpacity(name),
                };
              } else {
                const housingScore = feature?.properties?.housing?.statistical_score ?? null; 
                return {
                  color: housingScore === null ? "#27272a" : "#34d399", // Darker border for water
                  weight: 1.5,
                  fillColor: getHousingColor(housingScore),
                  fillOpacity: getHousingOpacity(housingScore),
                };
              }
            }}
            onEachFeature={(feature: any, layer: any) => {
              const name = feature.properties?.NSW_LGA__3 || "Unknown District";
              const council = feature.properties?.NSW_LGA__2 || "N/A";
              const upperName = name.toUpperCase();

              // Setup dynamic bounds for our data generation based on the risk tier
              let riskLabel = "STANDARD";
              let badgeColor = "#4f46e5";
              let minCrime = 0.1, maxCrime = 0.3;
              let minNews = 0.1, maxNews = 0.3;

              if (HIGH_RISK.includes(upperName)) {
                riskLabel = "HIGH RISK";
                badgeColor = "#ef4444";
                minCrime = 0.75; maxCrime = 0.99;
                minNews = 0.70; maxNews = 0.95;
              } else if (MEDIUM_RISK.includes(upperName)) {
                riskLabel = "ELEVATED RISK";
                badgeColor = "#f97316";
                minCrime = 0.35; maxCrime = 0.65;
                minNews = 0.35; maxNews = 0.65;
              } else if (LOW_RISK.includes(upperName)) {
                riskLabel = "LOW RISK";
                badgeColor = "#22c55e";
                minCrime = 0.00; maxCrime = 0.20;
                minNews = 0.00; maxNews = 0.20; 
              }

              const crimeScore = getScore(upperName, "_CRIME", minCrime, maxCrime);
              const newsSentiment = getScore(upperName, "_NEWS", minNews, maxNews);

              let popupHtml = "";

              if (viewMode === "crime") {
                // --- CRIME POPUP ---
                let riskLabel = "STANDARD";
                let badgeColor = "#4f46e5";
                let minCrime = 0.1, maxCrime = 0.3;
                let minNews = 0.1, maxNews = 0.3;

                if (HIGH_RISK.includes(upperName)) {
                  riskLabel = "HIGH RISK"; badgeColor = "#ef4444";
                  minCrime = 0.75; maxCrime = 0.99; minNews = 0.70; maxNews = 0.95;
                } else if (MEDIUM_RISK.includes(upperName)) {
                  riskLabel = "ELEVATED RISK"; badgeColor = "#f97316";
                  minCrime = 0.35; maxCrime = 0.65; minNews = 0.35; maxNews = 0.65;
                } else if (LOW_RISK.includes(upperName)) {
                  riskLabel = "LOW RISK"; badgeColor = "#22c55e";
                  minCrime = 0.00; maxCrime = 0.20; minNews = 0.00; maxNews = 0.20; 
                }

                const crimeScore = getScore(upperName, "_CRIME", minCrime, maxCrime);
                const newsSentiment = getScore(upperName, "_NEWS", minNews, maxNews);

                popupHtml = `
                  <div style="color: #18181b; font-family: sans-serif; min-width: 180px;">
                    <strong style="display: block; color: ${badgeColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 2px;">
                      ${riskLabel} ZONE
                    </strong>
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 2px; text-transform: capitalize;">
                      ${name.toLowerCase()}
                    </div>
                    <div style="font-size: 11px; color: #71717a; margin-bottom: 8px;">
                      ${council}
                    </div>
                    <div style="border-top: 1px solid #e4e4e7; padding-top: 8px; font-family: monospace; font-size: 11px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #52525b;">Crime Severity:</span>
                        <strong style="color: ${badgeColor};">${crimeScore}</strong>
                      </div>
                      <div style="display: flex; justify-content: space-between;">
                        <span style="color: #52525b;">News Sentiment:</span>
                        <strong style="color: ${badgeColor};">${newsSentiment}</strong>
                      </div>
                    </div>
                  </div>
                `;
              } else {
                // --- HOUSING POPUP ---
                const housing = feature.properties?.housing;
                
                const statScore = housing?.statistical_score ? parseFloat(housing.statistical_score).toFixed(1) : "N/A";
                const sentScore = housing?.sentiment_score ? parseFloat(housing.sentiment_score).toFixed(2) : "N/A";
                const meanPrice = housing?.mean_price ? formatCurrency(parseFloat(housing.mean_price)) : "Data Unavailable";
                
                const scoreNum = housing?.statistical_score || 50;
                const badgeColor = getHousingColor(scoreNum);
                const label = scoreNum < 40 ? "EXPENSIVE MARKET" : scoreNum < 70 ? "AVERAGE MARKET" : "AFFORDABLE MARKET";

                popupHtml = `
                  <div style="color: #18181b; font-family: sans-serif; min-width: 200px;">
                    <strong style="display: block; color: ${badgeColor}; font-size: 10px; text-transform: uppercase; margin-bottom: 2px;">
                      ${label}
                    </strong>
                    <div style="font-size: 16px; font-weight: bold; margin-bottom: 2px; text-transform: capitalize;">
                      ${name.toLowerCase()}
                    </div>
                    <div style="font-size: 18px; font-weight: bold; color: #10b981; margin-bottom: 8px;">
                      ${meanPrice}
                    </div>
                    <div style="border-top: 1px solid #e4e4e7; padding-top: 8px; font-family: monospace; font-size: 11px;">
                      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <span style="color: #52525b;">Statistical Score:</span>
                        <strong style="color: ${badgeColor};">${statScore}/100</strong>
                      </div>
                      <div style="display: flex; justify-content: space-between;">
                        <span style="color: #52525b;">NLP Sentiment:</span>
                        <strong style="color: ${badgeColor};">${sentScore}</strong>
                      </div>
                    </div>
                  </div>
                `;
              }

              layer.bindPopup(popupHtml);

              layer.on({
                mouseover: (e: any) => {
                  e.target.setStyle({ fillOpacity: 0.7, weight: 3 });
                },
                mouseout: (e: any) => {
                  const currentName = feature.properties?.NSW_LGA__3 || "";
                  if (viewMode === "crime") {
                    e.target.setStyle({ fillOpacity: getThreatOpacity(currentName), weight: 1.5 });
                  } else {
                    const hScore = feature.properties?.housing?.statistical_score || 50;
                    e.target.setStyle({ fillOpacity: getHousingOpacity(hScore), weight: 1.5 });
                  }
                },
              });
            }}
          />
        )}
      </MapContainer>
      
      {/* Dynamic Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 backdrop-blur-md text-[10px] text-zinc-400 shadow-2xl">
        <div className="font-bold text-white mb-2 uppercase tracking-widest text-[9px]">
          {viewMode === "crime" ? "Threat Matrix" : "Housing Market Matrix"}
        </div>
        
        {viewMode === "crime" ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span> 
              <span className="tracking-wide">High Risk Area</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]"></span> 
              <span className="tracking-wide">Elevated Risk</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3 h-3 rounded-full bg-indigo-500"></span> 
              <span className="tracking-wide">Standard Risk</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span> 
              <span className="tracking-wide">Low Risk</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span> 
              <span className="tracking-wide">Affordable (Score &gt; 70)</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]"></span> 
              <span className="tracking-wide">Average (Score 40 - 69)</span>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span> 
              <span className="tracking-wide">Expensive (Score &lt; 40)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}