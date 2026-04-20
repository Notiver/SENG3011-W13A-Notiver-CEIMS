"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";

const Map = dynamic(() => import("../Map"), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-zinc-900 animate-pulse flex items-center justify-center text-zinc-500">
      Mapping Live Crime Data...
    </div>
  )
});

const normalizeLgaName = (name: string) => {
  if (!name) return "";
  
  let cleanName = name.toUpperCase();

  cleanName = cleanName.replace(
    /^(THE COUNCIL OF THE SHIRE OF |THE COUNCIL OF THE MUNICIPALITY OF |THE COUNCIL OF THE CITY OF |COUNCIL OF THE CITY OF |COUNCIL OF THE SHIRE OF |COUNCIL OF THE MUNICIPALITY OF |CITY OF |SHIRE OF |MUNICIPALITY OF )/g, 
    ""
  );

  cleanName = cleanName.replace(
    /\s+(MUNICIPAL COUNCIL|SHIRE COUNCIL|CITY COUNCIL|REGIONAL COUNCIL|COUNCIL|SHIRE|CITY|MUNICIPALITY)$/g, 
    ""
  );

  cleanName = cleanName.trim();

  if (cleanName === "THE HILLS") return "THE HILLS SHIRE";
  if (cleanName === "SUTHERLAND") return "SUTHERLAND SHIRE";
  if (cleanName === "UPPER HUNTER") return "UPPER HUNTER SHIRE";
  if (cleanName === "GREATER HUME") return "GREATER HUME SHIRE";

  return cleanName;
};

export default function MapTab() {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"crime" | "housing">("crime");

  useEffect(() => {
    const fetchMapAndData = async () => {
      try {
        const geoResponse = await fetch("/demo/sydney_lgas.json");
        if (!geoResponse.ok) throw new Error("Local GeoJSON file not found");
        const geoData = await geoResponse.json();

        let liveStatsMap: Record<string, { score: number; total_crimes: number }> = {};
        let liveHousingMap: Record<string, any> = {};

        try {
          // Fetch the unified Community Intelligence Pool!
          const publicData = await api.getPublicCeimsMap();
          
          if (publicData.articles && publicData.articles.length > 0) {
            const lgaGroups: Record<string, { totalScore: number; count: number }> = {};
            
            publicData.articles.forEach((article: any) => {
              if (article.lga) {
                const cleanLga = article.lga.toUpperCase();
                if (!lgaGroups[cleanLga]) lgaGroups[cleanLga] = { totalScore: 0, count: 0 };
                
                lgaGroups[cleanLga].totalScore += article.sentiment_score;
                lgaGroups[cleanLga].count += 1;
              }
            });

            Object.keys(lgaGroups).forEach((lga) => {
              const avgSentiment = lgaGroups[lga].totalScore / lgaGroups[lga].count;
              liveStatsMap[lga] = {
                score: Math.round(avgSentiment * 100),
                total_crimes: lgaGroups[lga].count
              };
            });
          }
        } catch (apiError) {
          console.warn("Could not fetch live API data. Rendering base map.", apiError);
        }

        try {
          const housingData = await api.getAllHousing();
          if (Array.isArray(housingData)) {
            housingData.forEach((item: any) => {
              if (item.lga) {
                // Store by uppercase LGA name to match GeoJSON properties
                const cleanLga = normalizeLgaName(item.lga);
                liveHousingMap[cleanLga] = item;
              }
            });
          }
        } catch (apiError) {
          console.warn("Could not fetch live Housing data.", apiError);
        }

        const enrichedGeoJson = {
          ...geoData,
          features: geoData.features.map((feature: any) => {
            const rawLgaName = feature.properties.NSW_LGA__3 || ""; 
            const lgaName = normalizeLgaName(rawLgaName);
            
            const isInvalid = lgaName.includes("UNINCORPORATED") || lgaName.includes("WATER") || lgaName === "";
            
            const liveData = isInvalid ? { score: 0, total_crimes: 0 } : (liveStatsMap[lgaName] || { score: 0, total_crimes: 0 });
            const housingData = isInvalid ? null : (liveHousingMap[lgaName] || null);
            
            return {
              ...feature,
              properties: {
                ...feature.properties,
                cleanName: lgaName, 
                liveScore: liveData.score,        
                liveCrimes: liveData.total_crimes,
                housing: housingData 
              }
            };
          })
        };

        setGeoJsonData(enrichedGeoJson);
      } catch (e) {
        console.error("Map Data Load Error:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchMapAndData();
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full w-full">
      {/* Map Container */}
      <div className="flex-1 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative min-h-[500px] w-full">
        {loading && (
           <div className="absolute inset-0 z-50 bg-zinc-900/80 flex items-center justify-center text-emerald-400 font-mono text-sm animate-pulse">
             Connecting to AWS API and compiling geospatial data...
           </div>
        )}
        {/* Pass viewMode down so the map knows what to render */}
        {geoJsonData && <Map geoJsonData={geoJsonData} viewMode={viewMode} />}
      </div>

      {/* Mode Toggle Controls */}
      <div className="flex justify-center items-center gap-4 bg-zinc-900/50 p-2 rounded-2xl border border-zinc-800 w-fit mx-auto">
        <button 
          onClick={() => setViewMode("crime")}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
            viewMode === "crime" 
              ? "bg-red-500/20 text-red-400 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]" 
              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
          }`}
        >
          Crime Intelligence
        </button>
        <button 
          onClick={() => setViewMode("housing")}
          className={`px-6 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
            viewMode === "housing" 
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 shadow-[0_0_15px_rgba(34,197,94,0.2)]" 
              : "text-zinc-500 hover:text-zinc-300 border border-transparent"
          }`}
        >
          Housing Market
        </button>
      </div>
    </div>
  );
}