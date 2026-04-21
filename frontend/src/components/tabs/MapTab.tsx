"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { Layers, Filter, Info, MapPin, Radar } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface PublicArticle {
  lga?: string;
  sentiment_score?: number;
}

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

export default function MapTab() {
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<LayerMode>("choropleth");
  const [stats, setStats] = useState<{ lgaCount: number; articleCount: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const geoRes = await fetch("/demo/sydney_lgas.json");
        if (!geoRes.ok) throw new Error("Missing sydney_lgas.json");
        const geo = await geoRes.json();

        const live: Record<string, { score: number; total_crimes: number }> = {};
        let articleCount = 0;

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
          console.warn("Live API unavailable; rendering static layer.", e);
        }

        const enriched: FeatureCollection = {
          ...geo,
          features: (geo as FeatureCollection).features.map((f) => {
            const p = (f.properties || {}) as Record<string, unknown>;
            const lgaName = typeof p.NSW_LGA__3 === "string" ? p.NSW_LGA__3.toUpperCase() : "";
            const ld = live[lgaName] || { score: 0, total_crimes: 0 };
            return {
              ...f,
              properties: { ...p, liveScore: ld.score, liveCrimes: ld.total_crimes },
            };
          }),
        };

        setGeoJsonData(enriched);
        setStats({ lgaCount: enriched.features.length, articleCount });
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

        {geoJsonData && <Map geoJsonData={geoJsonData} />}

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

        {/* Top-right: filter */}
        <GlassPanel className="top-4 right-4">
          <button className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px]"
            style={{ color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--line-2)" }}>
            <Filter size={12} strokeWidth={2} /> Crime
          </button>
          <button className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px]"
            style={{ color: "var(--text-3)", background: "var(--surface-2)", border: "1px solid var(--line-2)" }}>
            Last 30d
          </button>
        </GlassPanel>

        {/* Bottom-left: legend */}
        <GlassPanel className="bottom-4 left-4" stacked>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Info size={11} strokeWidth={2} style={{ color: "var(--text-3)" }} />
            <span className="text-[10.5px] uppercase tracking-[0.14em] font-semibold" style={{ color: "var(--text-3)" }}>
              Threat band
            </span>
          </div>
          <LegendRow color="var(--danger)" label="High risk" />
          <LegendRow color="var(--warn)"   label="Elevated" />
          <LegendRow color="var(--success)" label="Low risk" />
          <LegendRow color="var(--accent)" label="Standard" muted />
        </GlassPanel>
      </div>
    </div>
  );
}

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
