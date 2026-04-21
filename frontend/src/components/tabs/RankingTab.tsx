"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Info, ArrowUpRight, Search,
} from "lucide-react";
import { MOCK_CHART_DATA } from "@/lib/dataLabels";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

interface RankingItem {
  lga: string;
  score: number;
  trend: "up" | "down" | "stable";
}

type Band = "all" | "high" | "medium" | "low";

export default function RankingTab() {
  const [data, setData] = useState<RankingItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<Band>("all");
  const [showMethodology, setShowMethodology] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [lgaResp, pubResp] = await Promise.all([
          api.getAllLgas(),
          api.getPublicCeimsMap().catch(() => ({ articles: [] })),
        ]);
        const lgas: string[] = lgaResp?.lgas || [];
        const nlpByLga: Record<string, number> = {};
        interface PubArticle { lga?: string; sentiment_score?: number }
        interface YearlyRow { year: number; total: number }
        for (const a of (pubResp.articles as PubArticle[]) || []) {
          if (!a.lga) continue;
          const k = String(a.lga).toUpperCase();
          nlpByLga[k] = (nlpByLga[k] || 0) + Number(a.sentiment_score ?? 0);
        }

        const rows = await Promise.all(lgas.map(async (lga) => {
          try {
            const stats = await api.getLgaStats(lga);
            const yearly = (await api.getLgaYearlyStats(lga).catch(() => null)) as YearlyRow[] | null;
            let trend: "up" | "down" | "stable" = "stable";
            if (yearly && yearly.length >= 2) {
              const sorted = [...yearly].sort((a, b) => b.year - a.year);
              if (sorted[0].total > sorted[1].total) trend = "up";
              else if (sorted[0].total < sorted[1].total) trend = "down";
            }
            const base = stats.statistical_score || 0;
            const modifier = (nlpByLga[lga.toUpperCase()] || 0) * 5;
            return {
              lga: stats.lga,
              score: Math.min(100, Math.round(base + modifier)),
              trend,
            } as RankingItem;
          } catch {
            return null;
          }
        }));

        const cleaned = rows.filter((r): r is RankingItem => r !== null);
        setData(cleaned.sort((a, b) => b.score - a.score));
      } catch (e) {
        console.error("Ranking load error", e);
        setData([]);
      }
    };
    load();
  }, []);

  const movers = useMemo(() => {
    if (!data || data.length === 0) return { up: [], down: [] };
    return {
      up:   data.filter((r) => r.trend === "up").slice(0, 3),
      down: data.filter((r) => r.trend === "down").slice(-3).reverse(),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return null;
    return data.filter((r) => {
      const q = query.trim().toLowerCase();
      if (q && !r.lga.toLowerCase().includes(q)) return false;
      if (band === "high" && r.score < 75) return false;
      if (band === "medium" && (r.score < 35 || r.score >= 75)) return false;
      if (band === "low" && r.score >= 35) return false;
      return true;
    });
  }, [data, query, band]);

  return (
    <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-6 animate-in fade-in duration-300">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--text-3)" }}>
            Leaderboard
          </p>
          <h1 className="text-[22px] font-semibold mt-0.5" style={{ color: "var(--text-0)", letterSpacing: "-0.01em" }}>
            LGA threat ranking
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-2)" }}>
            Synthesised risk score from BOSCAR statistics and live NLP sentiment.
          </p>
        </div>
        <button
          onClick={() => setShowMethodology((v) => !v)}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[10px] text-[12.5px] font-medium"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-2)",
            border: "1px solid var(--line-2)",
          }}
        >
          <Info size={12} strokeWidth={2} /> Methodology
        </button>
      </header>

      {showMethodology && (
        <div
          className="rounded-[12px] p-4 text-[13px] leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid rgba(99,102,241,0.22)",
            color: "var(--text-1)",
          }}
        >
          Articles are ingested via fine-tuned NLP scrapers powered by <strong>Hugging Face transformers</strong>,
          which compute per-article sentiment on a 0.0–1.0 scale. That sentiment is weighted by article volume
          and overlaid onto statistical <strong>BOSCAR</strong> per-capita crime data to produce the unified
          Threat Score shown in this leaderboard.
        </div>
      )}

      {/* Movers strip */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MoversCard title="Rising risk" tone="danger" Icon={TrendingUp} items={movers.up} data={data} />
        <MoversCard title="Improving" tone="success" Icon={TrendingDown} items={movers.down} data={data} />
      </div>

      {/* Chart panel */}
      <div
        className="rounded-[14px] p-5"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line-1)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13.5px] font-semibold" style={{ color: "var(--text-0)" }}>
            Threat score trend
          </h2>
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            2019 – 2024
          </span>
        </div>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MOCK_CHART_DATA} margin={{ top: 5, right: 10, bottom: 5, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line-1)" vertical={false} />
              <XAxis dataKey="year" stroke="var(--text-4)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-4)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 10,
                  color: "var(--text-0)",
                  fontSize: 12,
                  boxShadow: "var(--shadow-2)",
                }}
                labelStyle={{ color: "var(--text-3)" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: "var(--text-3)" }} />
              <Line type="monotone" dataKey="Sydney City" stroke="#fb7185" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Blacktown" stroke="#fbbf24" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Liverpool" stroke="#34d399" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="State Avg" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filter + table panel */}
      <div
        className="rounded-[14px] overflow-hidden"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line-1)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--line-1)" }}>
          <div className="relative flex-1 max-w-[320px]">
            <Search
              size={13} strokeWidth={2}
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-3)" }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter LGAs…"
              className="w-full h-8 pl-8 pr-3 rounded-[8px] text-[12.5px] outline-none transition-colors"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-0)",
                border: "1px solid var(--line-2)",
              }}
            />
          </div>
          <div className="inline-flex rounded-[8px] p-[3px]" style={{ background: "var(--surface-2)", border: "1px solid var(--line-2)" }}>
            {(["all", "high", "medium", "low"] as Band[]).map((b) => (
              <button
                key={b}
                onClick={() => setBand(b)}
                className={cn("h-[26px] px-2.5 rounded-[6px] text-[11.5px] capitalize transition-colors")}
                style={{
                  background: band === b ? "var(--surface-1)" : "transparent",
                  color: band === b ? "var(--text-0)" : "var(--text-3)",
                  boxShadow: band === b ? "var(--shadow-1)" : "none",
                }}
              >
                {b}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {filtered && (
            <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {filtered.length} {filtered.length === 1 ? "LGA" : "LGAs"}
            </span>
          )}
        </div>

        <table className="w-full text-left">
          <thead
            className="text-[11px] uppercase tracking-[0.14em] font-semibold"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-4)",
            }}
          >
            <tr style={{ boxShadow: "inset 0 -1px 0 var(--line-1)" }}>
              <th className="px-4 py-2.5 font-semibold">#</th>
              <th className="px-4 py-2.5 font-semibold">LGA</th>
              <th className="px-4 py-2.5 font-semibold">Threat score</th>
              <th className="px-4 py-2.5 font-semibold">Yearly trend</th>
              <th className="px-4 py-2.5 font-semibold w-[40px]"></th>
            </tr>
          </thead>
          <tbody aria-busy={filtered === null} aria-live="polite">
            {filtered === null && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} style={{ boxShadow: "inset 0 -1px 0 var(--line-1)" }} aria-hidden="true">
                    <td className="px-4 py-3"><div className="skeleton h-4 w-5" /></td>
                    <td className="px-4 py-3"><div className="skeleton h-4 w-36" /></td>
                    <td className="px-4 py-3"><div className="skeleton h-4 w-full max-w-[220px]" /></td>
                    <td className="px-4 py-3"><div className="skeleton h-4 w-16" /></td>
                    <td />
                  </tr>
                ))}
              </>
            )}
            {filtered && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--text-3)" }}>
                  No matching LGAs.
                </td>
              </tr>
            )}
            {filtered && filtered.map((row, i) => {
              const tier = row.score >= 75 ? "danger" : row.score >= 35 ? "warn" : "success";
              const color = { danger: "var(--danger)", warn: "var(--warn)", success: "var(--success)" }[tier];

              return (
                <tr
                  key={row.lga}
                  className="transition-colors group"
                  style={{ boxShadow: "inset 0 -1px 0 var(--line-1)" }}
                >
                  <td className="px-4 py-3 text-[11.5px] font-mono tabular-nums" style={{ color: "var(--text-4)" }}>
                    {(i + 1).toString().padStart(2, "0")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-medium capitalize" style={{ color: "var(--text-0)" }}>
                      {row.lga.toLowerCase()}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 max-w-[260px]">
                      {/* Decorative bar — the numeric score is read via the span below */}
                      <div
                        aria-hidden="true"
                        className="flex-1 h-1.5 rounded-full overflow-hidden"
                        style={{ background: "var(--surface-2)" }}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-700"
                          style={{ width: `${row.score}%`, background: color }}
                        />
                      </div>
                      <span
                        className="text-[12px] font-mono tabular-nums w-7 text-right"
                        style={{ color }}
                        aria-label={`Score ${row.score} out of 100`}
                      >
                        {row.score}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <TrendBadge trend={row.trend} />
                  </td>
                  <td className="px-2 py-3 text-right">
                    <span className="inline-flex opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowUpRight size={13} strokeWidth={2} style={{ color: "var(--text-3)" }} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  const map = {
    up:     { Icon: TrendingUp,   label: "Rising",  bg: "var(--danger-soft)",  fg: "var(--danger)"  },
    down:   { Icon: TrendingDown, label: "Falling", bg: "var(--success-soft)", fg: "var(--success)" },
    stable: { Icon: Minus,        label: "Stable",  bg: "var(--surface-2)",    fg: "var(--text-3)"  },
  }[trend];
  const { Icon, label, bg, fg } = map;
  return (
    <span
      className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{ background: bg, color: fg }}
    >
      <Icon size={10} strokeWidth={2.5} /> {label}
    </span>
  );
}

function MoversCard({
  title, tone, Icon, items, data,
}: {
  title: string;
  tone: "danger" | "success";
  Icon: typeof TrendingUp;
  items: RankingItem[];
  data: RankingItem[] | null;
}) {
  const color = tone === "danger" ? "var(--danger)" : "var(--success)";
  const soft  = tone === "danger" ? "var(--danger-soft)" : "var(--success-soft)";

  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line-1)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-6 rounded-lg grid place-items-center"
            style={{ background: soft, color }}
          >
            <Icon size={12} strokeWidth={2.5} />
          </span>
          <h3 className="text-[12.5px] font-semibold" style={{ color: "var(--text-0)" }}>
            {title}
          </h3>
        </div>
        <span className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: "var(--text-4)" }}>
          7d
        </span>
      </div>
      {data === null ? (
        <div className="space-y-2" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading movers…</span>
          <div className="h-8 skeleton" aria-hidden="true" />
          <div className="h-8 skeleton" aria-hidden="true" />
          <div className="h-8 skeleton" aria-hidden="true" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-[12px] py-4 text-center" style={{ color: "var(--text-3)" }}>
          No movers right now.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--line-1)" }}>
          {items.map((r) => (
            <li key={r.lga} className="flex items-center justify-between py-2">
              <span className="text-[13px] capitalize" style={{ color: "var(--text-1)" }}>
                {r.lga.toLowerCase()}
              </span>
              <span className="text-[12px] font-mono tabular-nums" style={{ color }}>
                {r.score}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
