"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, TrendingUp, TrendingDown, ArrowRight, Gauge, Radar, MapPin, Clock, Activity } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { MOCK_CHART_DATA } from "@/lib/dataLabels";
import type { NavKey } from "@/components/shell/LeftRail";
import { useJob } from "@/lib/jobContext";
import { cn } from "@/lib/cn";

interface DashboardProps {
  onNavigate: (key: NavKey) => void;
}

interface FeedItem {
  title: string;
  lga: string;
  publishedAt: string;
  sentiment: number;
  category?: string;
}

export default function DashboardTab({ onNavigate }: DashboardProps) {
  const { job } = useJob();
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [topLgas, setTopLgas] = useState<{ lga: string; count: number; score: number }[] | null>(null);

  useEffect(() => {
    interface PubArticle {
      title?: string;
      file_key?: string;
      lga?: string;
      publish_date?: string;
      metadata?: { publish_date?: string };
      sentiment_score?: number;
      category?: string;
    }

    const load = async () => {
      try {
        const pub = await api.getPublicCeimsMap();
        const arr: PubArticle[] = (pub?.articles as PubArticle[]) || [];

        const items: FeedItem[] = arr
          .slice(-12)
          .reverse()
          .map((a) => ({
            title: a.title || a.file_key?.split("/").pop()?.replace(".txt", "").replace(/_/g, " ") || "Untitled",
            lga: (a.lga || "—").toString(),
            publishedAt: a.publish_date || a.metadata?.publish_date || new Date().toISOString(),
            sentiment: Number(a.sentiment_score ?? 0),
            category: a.category,
          }));
        setFeed(items);

        const groups: Record<string, { count: number; total: number }> = {};
        for (const a of arr) {
          if (!a.lga) continue;
          const key = String(a.lga).toUpperCase();
          groups[key] = groups[key] || { count: 0, total: 0 };
          groups[key].count += 1;
          groups[key].total += Number(a.sentiment_score ?? 0);
        }
        const ranked = Object.entries(groups)
          .map(([lga, v]) => ({
            lga,
            count: v.count,
            score: Math.round((v.total / Math.max(1, v.count)) * 100),
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        setTopLgas(ranked);
      } catch {
        setFeed([]);
        setTopLgas([]);
      }
    };
    load();
  }, []);

  const sentimentSpark = useMemo(
    () => MOCK_CHART_DATA.map((d) => ({ x: d.year, y: d["State Avg"] })),
    [],
  );

  return (
    <div className="max-w-[1200px] mx-auto px-8 py-8 space-y-6 animate-in fade-in duration-300">
      {/* Greeting */}
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--text-3)" }}>
            Overview
          </p>
          <h1 className="text-[26px] font-semibold mt-1" style={{ color: "var(--text-0)", letterSpacing: "-0.01em" }}>
            Good morning, Jane
          </h1>
          <p className="text-[13.5px] mt-1" style={{ color: "var(--text-2)" }}>
            Here&apos;s what your intelligence network picked up.
          </p>
        </div>
        <button
          onClick={() => onNavigate("scraper")}
          className="h-9 px-4 rounded-[10px] text-[13px] font-medium inline-flex items-center gap-2 transition-transform hover:-translate-y-[1px]"
          style={{
            background: "var(--accent)",
            color: "white",
            boxShadow: "0 6px 20px -8px var(--accent-ring)",
          }}
        >
          <Radar size={14} strokeWidth={2} /> New scrape
        </button>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          title="Active job"
          label={job.id ? `#${job.id.substring(0, 8).toUpperCase()}` : "No job running"}
          value={
            job.stage === "scraping" ? `${Math.round(job.scrapeProgress)}%` :
            job.stage === "processing" ? `${Math.round(job.nlpProgress)}%` :
            job.stage === "ready" ? "Ready" :
            "Idle"
          }
          hint={job.stage === "scraping" ? "Scraping" : job.stage === "processing" ? "NLP inference" : job.stage === "ready" ? "Intelligence compiled" : "Start a new scrape to begin"}
          Icon={Activity}
          onClick={() => onNavigate("scraper")}
        />
        <KpiCard
          title="Top LGA today"
          label={topLgas?.[0]?.lga.toLowerCase() || "—"}
          value={topLgas?.[0]?.count ? String(topLgas[0].count) : "—"}
          hint="articles captured"
          Icon={MapPin}
          trend="up"
          onClick={() => onNavigate("ranking")}
        />
        <KpiCard
          title="Avg sentiment"
          label="Last 24 hours"
          value={feed && feed.length ? (feed.reduce((a, b) => a + b.sentiment, 0) / feed.length).toFixed(2) : "—"}
          hint="−1.0 negative · +1.0 positive"
          Icon={Gauge}
          spark={sentimentSpark}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live Article Stream */}
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Live article stream"
            subtitle={feed?.length ? `${feed.length} items from the community pool` : "Streaming from the community pool"}
            action={
              <button
                onClick={() => onNavigate("scraper")}
                className="text-[12px] font-medium inline-flex items-center gap-1"
                style={{ color: "var(--text-2)" }}
              >
                Open Studio <ArrowRight size={12} strokeWidth={2} />
              </button>
            }
          />
          <div className="px-5 pb-5 space-y-1">
            {feed === null && (
              <>
                <div className="h-12 skeleton" />
                <div className="h-12 skeleton" />
                <div className="h-12 skeleton" />
              </>
            )}
            {feed && feed.length === 0 && (
              <EmptyState
                title="No articles yet"
                hint="Run a scrape in the Job Studio to populate this feed."
                actionLabel="Start scrape"
                onAction={() => onNavigate("scraper")}
              />
            )}
            {feed && feed.length > 0 && (
              <ul className="divide-y" style={{ borderColor: "var(--line-1)" }}>
                {feed.slice(0, 8).map((item, i) => (
                  <li key={i} className="py-2.5 flex items-center gap-3 group">
                    <span
                      className="w-1 h-8 rounded-full shrink-0"
                      style={{
                        background:
                          item.sentiment < -0.15 ? "var(--danger)" :
                          item.sentiment > 0.15 ? "var(--success)" :
                          "var(--line-3)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium truncate capitalize" style={{ color: "var(--text-0)" }}>
                        {item.title}
                      </div>
                      <div className="text-[11.5px] flex items-center gap-2 mt-0.5" style={{ color: "var(--text-3)" }}>
                        <span className="capitalize">{item.lga.toLowerCase()}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10} strokeWidth={2} />
                          {relativeTime(item.publishedAt)}
                        </span>
                      </div>
                    </div>
                    <Chip tone={item.sentiment < -0.15 ? "danger" : item.sentiment > 0.15 ? "success" : "neutral"}>
                      {item.sentiment.toFixed(2)}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Risk leaderboard */}
        <Panel>
          <PanelHeader
            title="Risk leaderboard"
            subtitle="By article volume (7 days)"
            action={
              <button
                onClick={() => onNavigate("ranking")}
                className="text-[12px] font-medium inline-flex items-center gap-1"
                style={{ color: "var(--text-2)" }}
              >
                All LGAs <ArrowRight size={12} strokeWidth={2} />
              </button>
            }
          />
          <div className="px-5 pb-5">
            {topLgas === null && (
              <div className="space-y-2">
                <div className="h-10 skeleton" />
                <div className="h-10 skeleton" />
                <div className="h-10 skeleton" />
                <div className="h-10 skeleton" />
              </div>
            )}
            {topLgas && topLgas.length === 0 && (
              <EmptyState title="Quiet across the network" hint="Nothing trending." />
            )}
            {topLgas && topLgas.length > 0 && (
              <ol className="space-y-1">
                {topLgas.map((row, i) => {
                  const max = topLgas[0].count;
                  const pct = Math.max(6, (row.count / max) * 100);
                  return (
                    <li key={row.lga} className="group">
                      <div className="flex items-center gap-3 py-1.5">
                        <span
                          className="w-5 text-[11px] font-mono tabular-nums text-center"
                          style={{ color: "var(--text-4)" }}
                        >
                          {(i + 1).toString().padStart(2, "0")}
                        </span>
                        <span className="text-[12.5px] capitalize flex-1 truncate" style={{ color: "var(--text-1)" }}>
                          {row.lga.toLowerCase()}
                        </span>
                        <span className="text-[11.5px] tabular-nums" style={{ color: "var(--text-3)" }}>
                          {row.count}
                        </span>
                      </div>
                      <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${pct}%`,
                            background:
                              row.score > 20 ? "var(--success)" :
                              row.score < -20 ? "var(--danger)" :
                              "var(--accent)",
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </Panel>
      </div>

      {/* Sentiment pulse chart */}
      <Panel>
        <PanelHeader
          title="Sentiment pulse"
          subtitle="State average · synthesized from BOSCAR + NLP"
          action={
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
              <Sparkles size={12} strokeWidth={2} />
              <span>Updated just now</span>
            </div>
          }
        />
        <div className="px-5 pb-5 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MOCK_CHART_DATA} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.7} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="year" stroke="var(--text-4)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="var(--text-4)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} width={30} />
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
              <Line type="monotone" dataKey="Sydney City" stroke="#fb7185" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Blacktown" stroke="#fbbf24" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Liverpool" stroke="#34d399" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="State Avg" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ Primitives ------------------------------ */

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("rounded-[14px] overflow-hidden", className)}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line-1)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-3 gap-3">
      <div>
        <h2 className="text-[13.5px] font-semibold" style={{ color: "var(--text-0)" }}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-3)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

function KpiCard({
  title, label, value, hint, Icon, trend, spark, onClick,
}: {
  title: string;
  label: string;
  value: string;
  hint: string;
  Icon: typeof Radar;
  trend?: "up" | "down";
  spark?: { x: string; y: number }[];
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-[14px] p-4 transition-transform hover:-translate-y-[1px]"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--line-1)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10.5px] uppercase tracking-[0.16em] font-semibold"
          style={{ color: "var(--text-3)" }}
        >
          {title}
        </span>
        <Icon size={14} strokeWidth={1.75} style={{ color: "var(--text-3)" }} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className="text-[22px] font-semibold capitalize"
          style={{ color: "var(--text-0)", letterSpacing: "-0.01em" }}
        >
          {value}
        </span>
        {trend === "up" && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--success)" }}>
            <TrendingUp size={11} strokeWidth={2} /> +14%
          </span>
        )}
        {trend === "down" && (
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--danger)" }}>
            <TrendingDown size={11} strokeWidth={2} /> −8%
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between">
        <div>
          <div className="text-[12.5px] capitalize" style={{ color: "var(--text-1)" }}>
            {label}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
            {hint}
          </div>
        </div>
        {spark && (
          <div className="w-[90px] h-[32px] -my-2">
            <ResponsiveContainer>
              <LineChart data={spark} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
                <Line type="monotone" dataKey="y" stroke="#6366f1" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </button>
  );
}

function Chip({ tone, children }: { tone: "success" | "danger" | "neutral"; children: React.ReactNode }) {
  const map = {
    success: { bg: "var(--success-soft)", fg: "var(--success)" },
    danger:  { bg: "var(--danger-soft)",  fg: "var(--danger)"  },
    neutral: { bg: "var(--surface-2)",    fg: "var(--text-2)"  },
  }[tone];
  return (
    <span
      className="text-[11px] font-mono tabular-nums px-1.5 py-[1px] rounded"
      style={{ background: map.bg, color: map.fg }}
    >
      {children}
    </span>
  );
}

function EmptyState({
  title, hint, actionLabel, onAction,
}: { title: string; hint: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="py-10 text-center">
      <div className="text-[13.5px] font-medium" style={{ color: "var(--text-1)" }}>{title}</div>
      <div className="text-[12px] mt-1" style={{ color: "var(--text-3)" }}>{hint}</div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-3 h-8 px-3 rounded-lg text-[12px] font-medium transition-colors"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-0)",
            border: "1px solid var(--line-2)",
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
