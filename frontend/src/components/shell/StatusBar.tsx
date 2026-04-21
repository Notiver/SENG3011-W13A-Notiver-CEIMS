"use client";

import { Activity, Clock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useJob } from "@/lib/jobContext";
import { cn } from "@/lib/cn";

function fmtElapsed(ms: number) {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function StatusBar() {
  const { job } = useJob();
  const [now, setNow] = useState(0);

  // keep a ticking clock only when a job is live
  useEffect(() => {
    const live = job.stage === "scraping" || job.stage === "processing" || job.stage === "queued";
    if (!live) return;
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick);
    const id = setInterval(tick, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(id); };
  }, [job.stage]);

  const stageLabel: Record<typeof job.stage, string> = {
    idle:       "Ready",
    queued:     "Queued",
    scraping:   "Scraping",
    processing: "NLP processing",
    ready:      "Intelligence ready",
    failed:     "Failed",
  };

  const stageIcon = {
    idle:       <Activity size={12} strokeWidth={2} style={{ color: "var(--text-3)" }} />,
    queued:     <Loader2 size={12} strokeWidth={2} className="animate-spin" style={{ color: "var(--warn)" }} />,
    scraping:   <Loader2 size={12} strokeWidth={2} className="animate-spin" style={{ color: "var(--accent)" }} />,
    processing: <Loader2 size={12} strokeWidth={2} className="animate-spin" style={{ color: "var(--accent)" }} />,
    ready:      <CheckCircle2 size={12} strokeWidth={2} style={{ color: "var(--success)" }} />,
    failed:     <AlertCircle size={12} strokeWidth={2} style={{ color: "var(--danger)" }} />,
  }[job.stage];

  const pct =
    job.stage === "scraping" ? job.scrapeProgress :
    job.stage === "processing" ? job.nlpProgress :
    job.stage === "ready" ? 100 : 0;

  const elapsed = fmtElapsed(job.startedAt && now ? now - job.startedAt : 0);

  return (
    <footer
      className="flex items-center gap-4 px-4 h-[28px] shrink-0 border-t text-[11px]"
      style={{
        borderColor: "var(--line-1)",
        background: "var(--surface-0)",
        color: "var(--text-3)",
      }}
      aria-label="Job status"
    >
      {/* Announce stage + article count changes politely to screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex items-center gap-1.5 font-medium"
        style={{ color: "var(--text-2)" }}
      >
        {stageIcon}
        <span>{stageLabel[job.stage]}</span>
        {job.stage === "scraping" && (
          <span className="sr-only">
            , {Math.round(job.scrapeProgress)} percent complete,
            {" "}{job.articlesCount} of {job.targetCount} articles
          </span>
        )}
        {job.stage === "processing" && (
          <span className="sr-only">
            , NLP inference {Math.round(job.nlpProgress)} percent complete
          </span>
        )}
      </div>

      {job.id && (
        <>
          <span aria-hidden="true" style={{ color: "var(--text-4)" }}>•</span>
          <span className="font-mono tabular-nums tracking-tight">
            <span className="sr-only">Job id </span>
            #{job.id.substring(0, 8).toUpperCase()}
          </span>
        </>
      )}

      {(job.stage === "scraping" || job.stage === "ready") && (
        <>
          <span aria-hidden="true" style={{ color: "var(--text-4)" }}>•</span>
          <span className="tabular-nums">
            {job.articlesCount}/{job.targetCount} <span className="sr-only">articles captured</span>
            <span aria-hidden="true">articles</span>
          </span>
        </>
      )}

      <div className="flex-1" />

      {(job.stage === "scraping" || job.stage === "processing") && (
        <div
          role="progressbar"
          aria-label={job.stage === "scraping" ? "Scraping progress" : "NLP inference progress"}
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="w-[140px] h-[3px] rounded-full overflow-hidden"
          style={{ background: "var(--surface-2)" }}
        >
          <div
            className={cn("h-full rounded-full transition-all duration-700")}
            style={{
              width: `${pct}%`,
              background: job.stage === "processing" ? "var(--accent)" : "var(--success)",
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-1 tabular-nums">
        <Clock size={11} strokeWidth={2} aria-hidden="true" />
        <span><span className="sr-only">Elapsed </span>{elapsed}</span>
      </div>
    </footer>
  );
}
