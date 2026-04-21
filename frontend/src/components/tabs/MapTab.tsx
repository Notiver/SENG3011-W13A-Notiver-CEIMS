"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { FeatureCollection } from "geojson";
import "leaflet/dist/leaflet.css";
import { Layers, Info, MapPin, Radar, Home, ShieldAlert, Map as MapIcon, Table } from "lucide-react";
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

type Presentation = "map" | "table";

interface TableRow {
  lga: string;
  council: string;
  crimeScore: number;
  articleCount: number;
  housingStat: number | null;
  housingSentiment: number | null;
  housingPrice: number | null;
}

export default function MapTab() {
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<LayerMode>("choropleth");
  const [viewMode, setViewMode] = useState<MapViewMode>("crime");
  const [presentation, setPresentation] = useState<Presentation>("map");
  const [stats, setStats] = useState<{ lgaCount: number; articleCount: number; housingCount: number } | null>(null);
  const [tableRows, setTableRows] = useState<TableRow[]>([]);

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

        // Build an accessible table representation of the same dataset.
        const rows: TableRow[] = enriched.features
          .map((f) => {
            const p = f.properties as {
              NSW_LGA__3?: string;
              NSW_LGA__2?: string;
              cleanName?: string;
              liveScore?: number;
              liveCrimes?: number;
              housing?: HousingItem | null;
            };
            const lga = (p.NSW_LGA__3 || p.cleanName || "Unknown").toString();
            if (lga.toUpperCase().includes("UNINCORPORATED") || lga.toUpperCase().includes("WATER")) {
              return null;
            }
            const h = p.housing;
            const toNum = (v: number | string | undefined | null) =>
              v === undefined || v === null || v === "" ? null : Number(v);
            return {
              lga,
              council: p.NSW_LGA__2 || "",
              crimeScore: Number(p.liveScore ?? 0),
              articleCount: Number(p.liveCrimes ?? 0),
              housingStat: toNum(h?.statistical_score),
              housingSentiment: toNum(h?.sentiment_score),
              housingPrice: toNum(h?.mean_price),
            } as TableRow;
          })
          .filter((r): r is TableRow => r !== null)
          .sort((a, b) => a.lga.localeCompare(b.lga));
        setTableRows(rows);
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
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--text-3)" }}>
            Geospatial intelligence
          </p>
          <h1 className="text-[22px] font-semibold mt-0.5" style={{ color: "var(--text-0)", letterSpacing: "-0.01em" }}>
            NSW community map
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {stats && (
            <div className="flex items-center gap-2 text-[12px]">
              <Pill Icon={MapPin} label={`${stats.lgaCount} LGAs`} />
              <Pill Icon={Radar} label={`${stats.articleCount} articles`} />
              <Pill Icon={Home} label={`${stats.housingCount} housing`} />
            </div>
          )}
          <div
            role="group"
            aria-label="Presentation"
            className="inline-flex rounded-[10px] p-[3px]"
            style={{ background: "var(--surface-1)", border: "1px solid var(--line-2)" }}
          >
            <PresentationButton
              active={presentation === "map"}
              onClick={() => setPresentation("map")}
              Icon={MapIcon}
              label="Map"
            />
            <PresentationButton
              active={presentation === "table"}
              onClick={() => setPresentation("table")}
              Icon={Table}
              label="Table"
            />
          </div>
        </div>
      </header>

      {presentation === "table" ? (
        <MapTable rows={tableRows} viewMode={viewMode} onToggleMode={setViewMode} loading={loading} />
      ) : (
      <div
        className="relative flex-1 min-h-[540px] rounded-[14px] overflow-hidden"
        aria-busy={loading}
        role="region"
        aria-label={`Interactive map — ${viewMode} overlay of ${stats?.lgaCount ?? ""} NSW LGAs. For a keyboard-friendly view, use the Table presentation in the header.`}
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
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">Loading map…</span>
            <div className="skeleton w-[92%] h-[92%] rounded-[10px]" aria-hidden="true" />
          </div>
        )}

        {geoJsonData && <Map geoJsonData={geoJsonData} viewMode={viewMode} />}

        {/* Top-left: layers */}
        <GlassPanel className="top-4 left-4">
          <div className="flex items-center gap-1.5 px-1.5 py-1">
            <Layers size={12} strokeWidth={2} style={{ color: "var(--text-3)" }} />
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: "var(--text-3)" }}>
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
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: "var(--text-3)" }}>
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
      )}
    </div>
  );
}

/* ------------------------------ Table view ------------------------------ */

const formatAUD = (v: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(v);

function MapTable({
  rows, viewMode, onToggleMode, loading,
}: {
  rows: TableRow[];
  viewMode: MapViewMode;
  onToggleMode: (m: MapViewMode) => void;
  loading: boolean;
}) {
  return (
    <div
      className="flex-1 min-h-[540px] rounded-[14px] overflow-hidden flex flex-col"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line-1)",
        boxShadow: "var(--shadow-2)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--line-1)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-[0.14em] font-semibold"
            style={{ color: "var(--text-3)" }}
          >
            Dataset
          </span>
          <div
            role="group"
            aria-label="Dataset"
            className="inline-flex rounded-md p-[2px]"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line-2)" }}
          >
            <button
              onClick={() => onToggleMode("crime")}
              aria-pressed={viewMode === "crime"}
              className="h-6 px-2 rounded text-[12px] inline-flex items-center gap-1.5"
              style={{
                background: viewMode === "crime" ? "var(--surface-1)" : "transparent",
                color: viewMode === "crime" ? "var(--text-0)" : "var(--text-3)",
                boxShadow: viewMode === "crime" ? "var(--shadow-1)" : "none",
              }}
            >
              <ShieldAlert size={11} strokeWidth={2} aria-hidden="true" /> Crime
            </button>
            <button
              onClick={() => onToggleMode("housing")}
              aria-pressed={viewMode === "housing"}
              className="h-6 px-2 rounded text-[12px] inline-flex items-center gap-1.5"
              style={{
                background: viewMode === "housing" ? "var(--surface-1)" : "transparent",
                color: viewMode === "housing" ? "var(--text-0)" : "var(--text-3)",
                boxShadow: viewMode === "housing" ? "var(--shadow-1)" : "none",
              }}
            >
              <Home size={11} strokeWidth={2} aria-hidden="true" /> Housing
            </button>
          </div>
        </div>
        <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>
          {rows.length} LGAs
        </span>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar" aria-busy={loading}>
        <table className="w-full text-left text-[12.5px]">
          <caption className="sr-only">
            NSW LGA {viewMode === "crime" ? "crime intelligence" : "housing market"} data table —
            keyboard and screen-reader accessible alternative to the interactive map.
          </caption>
          <thead
            className="sticky top-0 z-10 text-[11px] uppercase tracking-[0.14em] font-semibold"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-3)",
              boxShadow: "inset 0 -1px 0 var(--line-1)",
            }}
          >
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">LGA</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Council</th>
              {viewMode === "crime" ? (
                <>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Avg sentiment</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Articles</th>
                </>
              ) : (
                <>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Stat score</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Sentiment</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Mean price</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const color =
                viewMode === "crime"
                  ? r.crimeScore > 20 ? "var(--success)" : r.crimeScore < -20 ? "var(--danger)" : "var(--text-2)"
                  : r.housingStat === null
                    ? "var(--text-3)"
                    : r.housingStat >= 70
                      ? "var(--success)"
                      : r.housingStat < 40
                        ? "var(--danger)"
                        : "var(--warn)";
              return (
                <tr key={r.lga} style={{ boxShadow: "inset 0 -1px 0 var(--line-1)" }}>
                  <th scope="row" className="px-4 py-2.5 capitalize font-medium" style={{ color: "var(--text-1)" }}>
                    {r.lga.toLowerCase()}
                  </th>
                  <td className="px-4 py-2.5" style={{ color: "var(--text-3)" }}>
                    {r.council || "—"}
                  </td>
                  {viewMode === "crime" ? (
                    <>
                      <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color }}>
                        {r.articleCount > 0 ? r.crimeScore : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color: "var(--text-1)" }}>
                        {r.articleCount}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color }}>
                        {r.housingStat === null ? "—" : r.housingStat.toFixed(1)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color: "var(--text-1)" }}>
                        {r.housingSentiment === null ? "—" : r.housingSentiment.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color: "var(--text-1)" }}>
                        {r.housingPrice === null ? "—" : formatAUD(r.housingPrice)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresentationButton({
  active, onClick, Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof MapIcon;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="h-7 px-2.5 rounded-[7px] inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors"
      style={{
        background: active ? "var(--surface-2)" : "transparent",
        color: active ? "var(--text-0)" : "var(--text-3)",
        boxShadow: active ? "var(--shadow-1)" : "none",
      }}
    >
      <Icon size={12} strokeWidth={2} aria-hidden="true" /> {label}
    </button>
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
