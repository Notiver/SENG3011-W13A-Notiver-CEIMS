"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { Layers, Info, MapPin, Radar, Home, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { MapViewMode } from "@/components/Map";

const Map = dynamic(() => import("../Map"), {
  ssr: false,
  loading: () => (
    <div
      className="h-full w-full grid place-items-center"
      style={{ background: "var(--surface-1)", color: "var(--text-3)" }}
    >
      <div className="skeleton w-[80%] h-[80%] rounded-[14px]" />
    </div>
  ),
});

type LayerMode = "choropleth" | "heat" | "markers";

interface PublicArticle {
  lga?: string;
  sentiment_score?: number;
}

interface HousingItem {
  lga?: string;
  statistical_score?: number | string;
  sentiment_score?: number | string;
  mean_price?: number | string;
}

/**
 * Normalise LGA names from the backend (which include prefixes like
 * "COUNCIL OF THE CITY OF ..." or suffixes like " SHIRE COUNCIL") to the
 * canonical LGA name used inside the GeoJSON properties.
 */
const normalizeLgaName = (name: string): string => {
  if (!name) return "";
  let n = name.toUpperCase();

  n = n.replace(
    /^(THE COUNCIL OF THE SHIRE OF |THE COUNCIL OF THE MUNICIPALITY OF |THE COUNCIL OF THE CITY OF |COUNCIL OF THE CITY OF |COUNCIL OF THE SHIRE OF |COUNCIL OF THE MUNICIPALITY OF |CITY OF |SHIRE OF |MUNICIPALITY OF )/g,
    "",
  );
  n = n.replace(
    /\s+(MUNICIPAL COUNCIL|SHIRE COUNCIL|CITY COUNCIL|REGIONAL COUNCIL|COUNCIL|SHIRE|CITY|MUNICIPALITY)$/g,
    "",
  );
  n = n.trim();

  if (n === "THE HILLS")     return "THE HILLS SHIRE";
  if (n === "SUTHERLAND")    return "SUTHERLAND SHIRE";
  if (n === "UPPER HUNTER")  return "UPPER HUNTER SHIRE";
  if (n === "GREATER HUME")  return "GREATER HUME SHIRE";

  return n;
};

export default function MapTab() {
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<LayerMode>("choropleth");
  const [viewMode, setViewMode] = useState<MapViewMode>("crime");
  const [stats, setStats] = useState<{ lgaCount: number; articleCount: number; housingCount: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const geoRes = await fetch("/demo/sydney_lgas.json");
        if (!geoRes.ok) throw new Error("Missing sydney_lgas.json");
        const geo = await geoRes.json();

        const live: Record<string, { score: number; total_crimes: number }> = {};
        const housing: Record<string, HousingItem> = {};
        let articleCount = 0;
        let housingCount = 0;

        // --- Community intelligence (crime) ---
        try {
          const pub = await api.getPublicCeimsMap();
          articleCount = pub?.articles?.length || 0;
          if (pub?.articles?.length) {
            const groups: Record<string, { totalScore: number; count: number }> = {};
            (pub.articles as PublicArticle[]).forEach((a) => {
              if (!a.lga) return;
              const key = a.lga.toUpperCase();
              groups[key] = groups[key] || { totalScore: 0, count: 0 };
              groups[key].totalScore += Number(a.sentiment_score ?? 0);
              groups[key].count += 1;
            });
            Object.keys(groups).forEach((k) => {
              const g = groups[k];
              live[k] = { score: Math.round((g.totalScore / g.count) * 100), total_crimes: g.count };
            });
          }
        } catch (e) {
          console.warn("Live crime API unavailable.", e);
        }

        // --- Housing intelligence ---
        try {
          const housingData = (await api.getAllHousing()) as HousingItem[] | undefined;
          if (Array.isArray(housingData)) {
            housingCount = housingData.length;
            housingData.forEach((item) => {
              if (!item.lga) return;
              housing[normalizeLgaName(item.lga)] = item;
            });
          }
        } catch (e) {
          console.warn("Live housing API unavailable.", e);
        }

        const enriched: FeatureCollection = {
          ...geo,
          features: (geo as FeatureCollection).features.map((f) => {
            const p = (f.properties || {}) as Record<string, unknown>;
            const rawName = typeof p.NSW_LGA__3 === "string" ? p.NSW_LGA__3 : "";
            const cleanName = normalizeLgaName(rawName);
            const isInvalid =
              cleanName.includes("UNINCORPORATED") || cleanName.includes("WATER") || cleanName === "";

            const ld = isInvalid ? { score: 0, total_crimes: 0 } : (live[cleanName] || { score: 0, total_crimes: 0 });
            const hd = isInvalid ? null : (housing[cleanName] || null);

            return {
              ...f,
              properties: {
                ...p,
                cleanName,
                liveScore: ld.score,
                liveCrimes: ld.total_crimes,
                housing: hd,
              },
            };
          }),
        };

        setGeoJsonData(enriched);
        setStats({ lgaCount: enriched.features.length, articleCount, housingCount });
      } catch (e) {
        console.error("Map load error", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="h-full w-full px-6 py-6 flex flex-col gap-4">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--text-3)" }}>
            Geospatial intelligence
          </p>
          <h1 className="text-[22px] font-semibold mt-0.5" style={{ color: "var(--text-0)", letterSpacing: "-0.01em" }}>
            NSW community map
          </h1>
        </div>
        {stats && (
          <div className="flex items-center gap-2 text-[11.5px]">
            <Pill Icon={MapPin} label={`${stats.lgaCount} LGAs`} />
            <Pill Icon={Radar} label={`${stats.articleCount} articles`} />
            <Pill Icon={Home} label={`${stats.housingCount} housing`} />
          </div>
        )}
      </header>

      <div
        className="relative flex-1 min-h-[540px] rounded-[14px] overflow-hidden"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line-1)",
          boxShadow: "var(--shadow-2)",
        }}
      >
        {loading && (
          <div
            className="absolute inset-0 z-[600] grid place-items-center"
            style={{ background: "var(--surface-1)" }}
          >
            <div className="skeleton w-[92%] h-[92%] rounded-[10px]" />
          </div>
        )}

        {geoJsonData && <Map geoJsonData={geoJsonData} viewMode={viewMode} />}

        {/* Top-left: layers */}
        <GlassPanel className="top-4 left-4">
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <Layers size={12} strokeWidth={2} style={{ color: "var(--text-3)" }} />
            <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold" style={{ color: "var(--text-3)" }}>
              Layer
            </span>
          </div>
          <div className="inline-flex rounded-md p-[2px]"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line-2)" }}
          >
            {(["choropleth", "heat", "markers"] as LayerMode[]).map((k) => (
              <button
                key={k}
                onClick={() => setLayer(k)}
                className="h-6 px-2 rounded text-[11px] capitalize transition-colors"
                style={{
                  background: layer === k ? "var(--surface-1)" : "transparent",
                  color: layer === k ? "var(--text-0)" : "var(--text-3)",
                  boxShadow: layer === k ? "var(--shadow-1)" : "none",
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </GlassPanel>

        {/* Top-right: dataset toggle (crime / housing) */}
        <GlassPanel className="top-4 right-4">
          <div className="inline-flex rounded-md p-[2px]"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line-2)" }}
          >
            <ModeButton
              active={viewMode === "crime"}
              onClick={() => setViewMode("crime")}
              Icon={ShieldAlert}
              label="Crime"
              accent="var(--danger)"
            />
            <ModeButton
              active={viewMode === "housing"}
              onClick={() => setViewMode("housing")}
              Icon={Home}
              label="Housing"
              accent="var(--success)"
            />
          </div>
        </GlassPanel>

        {/* Bottom-left: legend (mode-aware) */}
        <GlassPanel className="bottom-4 left-4" stacked>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Info size={11} strokeWidth={2} style={{ color: "var(--text-3)" }} />
            <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold" style={{ color: "var(--text-3)" }}>
              {viewMode === "crime" ? "Threat band" : "Housing market"}
            </span>
          </div>
          {viewMode === "crime" ? (
            <>
              <LegendRow color="var(--danger)"  label="High risk" />
              <LegendRow color="var(--warn)"    label="Elevated" />
              <LegendRow color="var(--success)" label="Low risk" />
              <LegendRow color="var(--accent)"  label="Standard" muted />
            </>
          ) : (
            <>
              <LegendRow color="var(--success)" label="Affordable (≥ 70)" />
              <LegendRow color="var(--warn)"    label="Average (40–69)" />
              <LegendRow color="var(--danger)"  label="Expensive (< 40)" />
              <LegendRow color="#3f3f46"         label="No data" muted />
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

/* ------------------------------ Primitives ------------------------------ */

function GlassPanel({
  children, className, stacked,
}: { children: React.ReactNode; className?: string; stacked?: boolean }) {
  return (
    <div
      className={cn(
        "absolute z-[500] rounded-[10px] p-2",
        stacked ? "flex flex-col gap-1" : "flex items-center gap-1.5",
        className,
      )}
      style={{
        background: "rgba(16, 17, 24, 0.82)",
        border: "1px solid var(--line-2)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: "var(--shadow-2)",
      }}
    >
      {children}
    </div>
  );
}

function ModeButton({
  active, onClick, Icon, label, accent,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Home;
  label: string;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className="h-6 px-2 rounded inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors"
      style={{
        background: active ? "var(--surface-1)" : "transparent",
        color: active ? "var(--text-0)" : "var(--text-3)",
        boxShadow: active ? "var(--shadow-1)" : "none",
      }}
    >
      <Icon size={11} strokeWidth={2} style={{ color: active ? accent : "var(--text-3)" }} />
      {label}
    </button>
  );
}

function LegendRow({ color, label, muted }: { color: string; label: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color, opacity: muted ? 0.6 : 1 }} />
      <span style={{ color: muted ? "var(--text-3)" : "var(--text-1)" }}>{label}</span>
    </div>
  );
}

function Pill({ Icon, label }: { Icon: typeof MapPin; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg"
      style={{
        background: "var(--surface-1)",
        color: "var(--text-2)",
        border: "1px solid var(--line-1)",
      }}
    >
      <Icon size={11} strokeWidth={2} style={{ color: "var(--text-3)" }} />
      {label}
    </span>
  );
}
