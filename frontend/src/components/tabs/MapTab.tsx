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

export default function MapTab() {
  const [geoJsonData, setGeoJsonData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMapAndData = async () => {
      try {
        const geoResponse = await fetch("/demo/sydney_lgas.json");
        if (!geoResponse.ok) throw new Error("Local GeoJSON file not found");
        const geoData = await geoResponse.json();

        let liveStatsMap: Record<string, { score: number; total_crimes: number }> = {};

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

        const enrichedGeoJson = {
          ...geoData,
          features: geoData.features.map((feature: any) => {
            const lgaName = feature.properties.NSW_LGA__3?.toUpperCase(); 
            const liveData = liveStatsMap[lgaName] || { score: 0, total_crimes: 0 };
            
            return {
              ...feature,
              properties: {
                ...feature.properties,
                liveScore: liveData.score,        
                liveCrimes: liveData.total_crimes 
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
    <div className="flex-1 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative h-150 w-full">
      {loading && (
         <div className="absolute inset-0 z-50 bg-zinc-900/80 flex items-center justify-center text-emerald-400 font-mono text-sm animate-pulse">
           Connecting to AWS API and compiling geospatial data...
         </div>
      )}
      {geoJsonData && <Map geoJsonData={geoJsonData} />}
    </div>
  );
}