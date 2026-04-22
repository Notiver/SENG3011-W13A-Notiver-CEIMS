"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Radar, Play, Download, Loader2, Globe, MapPin, Sparkles, ChevronDown, X,
  CheckCircle2, Circle, AlertCircle, Clock, FileText, ArrowRight, Save, Cpu,
} from "lucide-react";
import { api } from "@/lib/api";
import { MAJOR_CITIES } from "@/lib/majorCities";
import { CEIMS_CATEGORIES, INTEROP_CATEGORIES } from "@/lib/dataLabels";
import { useJob, expectedCount } from "@/lib/jobContext";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { cn } from "@/lib/cn";

type Stage = "scrape" | "nlp" | "enrich" | "publish";
type StageState = "pending" | "running" | "done" | "failed";

interface ArticleRecord {
  file_key?: string;
  title?: string;
  url?: string;
  content?: string;
  metadata?: { publish_date?: string };
}

const PRESETS = [
  { id: "today-crime-syd",  name: "Today · Sydney crime",  category: "crime",    location: "Sydney, Australia", timeFrame: "today",               mode: "global"  as const },
  { id: "sydney-crime-1y",  name: "Sydney · crime · 1y",   category: "crime",    location: "Sydney, Australia", timeFrame: "5_per_month_1_year",  mode: "global"  as const },
  { id: "nsw-crime-1mo",    name: "NSW · crime · 1mo",     category: "crime",    location: "Sydney, Australia", timeFrame: "1_per_day_1_month",   mode: "ceims"   as const },
  { id: "housing-5y",       name: "Housing · 5 years",     category: "housing",  location: "Sydney, Australia", timeFrame: "1_per_month_5_years", mode: "global"  as const },
];

const TIMEFRAMES = [
  { id: "today",               label: "Today",     hint: "latest",     density: "Live" },
  { id: "1_per_day_1_month",   label: "1 month",   hint: "1 / day",    density: "Dense" },
  { id: "5_per_month_1_year",  label: "1 year",    hint: "5 / month",  density: "Balanced" },
  { id: "1_per_month_5_years", label: "5 years",   hint: "1 / month",  density: "Shallow" },
];

export default function JobStudioTab() {
  const { job, setJob, resetJob } = useJob();

  const [selectedCategory, setSelectedCategory] = useState("crime");
  const [location, setLocation] = useState("Sydney, Australia");
  const [timeFrame, setTimeFrame] = useState("5_per_month_1_year");
  const [mode, setMode] = useState<"global" | "ceims">("global");
  const [allLgas, setAllLgas] = useState<string[]>([]);

  const [showInterop, setShowInterop] = useState(false);

  const [loading, setLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const [fullArticles, setFullArticles] = useState<ArticleRecord[]>([]);
  const [articles, setArticles] = useState<ArticleRecord[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<ArticleRecord | null>(null);
  const [scrapeComplete, setScrapeComplete] = useState(false);

  const [isFallback, setIsFallback] = useState(false);
  const [fallbackUrls, setFallbackUrls] = useState<string[]>([]);
  const [visibleFallback, setVisibleFallback] = useState<string[]>([]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(0); // 0..3
  const [processedIntelligence, setProcessedIntelligence] = useState<unknown>(null);

  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [processProgress, setProcessProgress] = useState(0);

  const streamEndRef = useRef<HTMLDivElement>(null);

  /* ----------------------- Load LGAs ----------------------- */
  useEffect(() => {
    api.getAllLgas()
      .then((data) => setAllLgas(data?.lgas || []))
      .catch(() => setAllLgas([]));
  }, []);

  /* ----------------------- Sync job context ----------------------- */
  useEffect(() => {
    setJob({
      params: { category: selectedCategory, location, timeFrame, mode },
    });
  }, [selectedCategory, location, timeFrame, mode, setJob]);

  /* ----------------------- Fake-progress tickers ----------------------- */
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPolling) {
      interval = setInterval(() => {
        setScrapeProgress((p) => (p >= 95 ? p : Math.min(p + Math.random() * 2 + 1, 95)));
      }, 500);
    } else if (!loading && fullArticles.length > 0) {
      setScrapeProgress(100);
    }
    return () => clearInterval(interval);
  }, [isPolling, loading, fullArticles.length]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing && processStep === 1) {
      interval = setInterval(() => {
        setProcessProgress((p) => (p >= 98 ? p : Math.min(p + Math.random() * 0.8 + 0.2, 98)));
      }, 500);
    } else if (processStep >= 2) {
      setProcessProgress(100);
    }
    return () => clearInterval(interval);
  }, [isProcessing, processStep]);

  useEffect(() => {
    setJob({ scrapeProgress, nlpProgress: processProgress });
  }, [scrapeProgress, processProgress, setJob]);

  /* ----------------------- Article reveal ----------------------- */
  useEffect(() => {
    if (!isFallback && !isProcessing && fullArticles.length > 0 && articles.length < fullArticles.length) {
      const t = setTimeout(() => {
        setArticles((prev) => [...prev, fullArticles[prev.length]]);
      }, 80);
      return () => clearTimeout(t);
    }
  }, [isFallback, isProcessing, fullArticles, articles]);

  useEffect(() => {
    if (isFallback && visibleFallback.length < fallbackUrls.length) {
      const t = setTimeout(() => {
        setVisibleFallback((prev) => [...prev, fallbackUrls[prev.length]]);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [isFallback, fallbackUrls, visibleFallback]);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [articles, visibleFallback]);

  /* ----------------------- Mode switching ----------------------- */
  const handleModeChange = (next: "global" | "ceims") => {
    setMode(next);
    if (next === "global") setLocation(MAJOR_CITIES[0]);
    else setLocation(allLgas[0] || "");
  };

  const applyPreset = (p: typeof PRESETS[number]) => {
    setSelectedCategory(p.category);
    setLocation(p.location);
    setTimeFrame(p.timeFrame);
    setMode(p.mode);
  };

  /* ----------------------- Fallback ----------------------- */
  const triggerFallback = async (err: unknown) => {
    console.error("Scraper error · using fallback", err);
    try {
      const res = await fetch("/demo/scraped_links.txt");
      if (res.ok) {
        const text = await res.text();
        const urls = text.split("\n").filter((u) => u.trim() !== "");
        setFallbackUrls(urls);
        setIsFallback(true);
      }
    } finally {
      setLoading(false);
      setIsPolling(false);
      setScrapeComplete(true);
      setJob({ stage: "ready" });
    }
  };

  const pollScrape = async (jobId: string) => {
    try {
      const data = await api.checkScrapeStatus(jobId);
      if (data.status === "complete") {
        // Handles both legacy (bare array) and current (worker-wrapped payload)
        // shapes returned by /data-collection/collect-articles/{job_id}.
        const nested = data.articles?.articles;
        const arr: ArticleRecord[] = Array.isArray(data.articles)
          ? data.articles
          : Array.isArray(nested)
            ? nested
            : [];
        setFullArticles(arr);
        setIsPolling(false);
        setLoading(false);
        setScrapeComplete(true);
        setJob({ stage: "ready", articlesCount: arr.length });
      } else if (data.status === "processing") {
        setTimeout(() => pollScrape(jobId), 5000);
      } else {
        throw new Error("Unexpected status");
      }
    } catch (e) {
      triggerFallback(e);
      setJob({ stage: "failed" });
    }
  };

  const pollProcess = async (jobId: string) => {
    try {
      const finalData = await api.getProcessedArticles(jobId);
      if (!finalData || finalData.error) {
        setTimeout(() => pollProcess(jobId), 5000);
        return;
      }
      setProcessStep(2);
      setProcessedIntelligence(finalData);
      await api.runRetrieval();
      setProcessStep(3);
      setIsProcessing(false);
      setJob({ stage: "ready", nlpProgress: 100 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found") || msg.includes("404")) {
        setTimeout(() => pollProcess(jobId), 5000);
      } else {
        setIsProcessing(false);
        setJob({ stage: "failed" });
      }
    }
  };

  /* ----------------------- Handlers ----------------------- */
  const handleScrape = async () => {
    setLoading(true);
    setIsPolling(false);
    setCurrentJobId(null);
    setIsFallback(false);
    setIsProcessing(false);
    setProcessStep(0);
    setScrapeProgress(0);
    setProcessProgress(0);
    setFullArticles([]);
    setArticles([]);
    setFallbackUrls([]);
    setVisibleFallback([]);
    setProcessedIntelligence(null);
    setScrapeComplete(false);

    setJob({
      stage: "queued",
      scrapeProgress: 0,
      nlpProgress: 0,
      articlesCount: 0,
      targetCount: expectedCount(timeFrame),
      startedAt: Date.now(),
      lastMessage: "Contacting API Gateway",
    });

    await new Promise((r) => setTimeout(r, 400));

    try {
      const data = await api.collectArticles({
        category: selectedCategory, location, timeFrame,
      });
      if (data.status === "processing" && data.job_id) {
        setCurrentJobId(data.job_id);
        setIsPolling(true);
        setJob({ id: data.job_id, stage: "scraping" });
        pollScrape(data.job_id);
      } else if (data.articles && data.articles.length > 0) {
        setFullArticles(data.articles);
        setLoading(false);
        setScrapeComplete(true);
        setJob({ stage: "ready", articlesCount: data.articles.length });
      } else {
        throw new Error("Zero articles returned");
      }
    } catch (err) {
      triggerFallback(err);
    }
  };

  const handleProcess = async () => {
    if (!currentJobId) return;
    setIsProcessing(true);
    setProcessStep(1);
    setProcessProgress(0);
    setJob({ stage: "processing" });

    try {
      const response = await api.processArticles(currentJobId, mode === "ceims");
      if (response.status === "processing") pollProcess(currentJobId);
      else throw new Error("Failed to queue NLP job");
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
      setJob({ stage: "failed" });
    }
  };

  const handleDownload = () => {
    const content = isFallback
      ? fallbackUrls.join("\n")
      : fullArticles.map((a) => a.url || a.file_key || "").join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedCategory}_articles_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadIntelligence = () => {
    if (!processedIntelligence) return;
    const blob = new Blob([JSON.stringify(processedIntelligence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `intelligence_${selectedCategory}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ----------------------- Derived ----------------------- */
  const stageStates: Record<Stage, StageState> = useMemo(() => {
    // Scrape is "done" once the pipeline has run to completion, even if zero
    // articles matched — that's a valid outcome, not a pending state.
    const scraped = scrapeComplete || fullArticles.length > 0 || isFallback;
    return {
      scrape:  loading || isPolling ? "running" : scraped ? "done" : "pending",
      nlp:     isProcessing && processStep === 1 ? "running" : processStep >= 2 ? "done" : "pending",
      enrich:  processStep === 2 ? "running" : processStep >= 3 ? "done" : "pending",
      publish: processStep === 3 ? "done" : "pending",
    };
  }, [loading, isPolling, scrapeComplete, fullArticles.length, isFallback, isProcessing, processStep]);

  const disabled = loading || isProcessing;

  /* ======================================================================= */
  return (
    <div className="max-w-[1400px] mx-auto px-8 py-6 animate-in fade-in duration-300">
      {/* Presets row */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto custom-scrollbar pb-1">
        <span className="text-[11px] uppercase tracking-[0.16em] font-semibold mr-1" style={{ color: "var(--text-4)" }}>
          Presets
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p)}
            disabled={disabled}
            className="text-[12px] h-7 px-3 rounded-lg whitespace-nowrap transition-colors"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-2)",
              border: "1px solid var(--line-2)",
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          className="text-[12px] h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 transition-colors"
          style={{
            background: "transparent",
            color: "var(--text-3)",
            border: "1px dashed var(--line-2)",
          }}
        >
          <Save size={12} strokeWidth={2} /> Save current
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6">
        {/* ======================== CONFIGURE ======================== */}
        <div
          className="rounded-[14px] p-6"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--line-1)",
            boxShadow: "var(--shadow-1)",
          }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-0)" }}>
                Configure
              </h2>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
                Define the scrape target. Job runs in your private pipeline.
              </p>
            </div>
            <span
              className="text-[11px] font-mono px-2 py-1 rounded-md"
              style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
            >
              3 steps
            </span>
          </div>

          {/* Step 1: Subject */}
          <Step num={1} label="Subject">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CEIMS_CATEGORIES.map((c) => (
                <CategoryChip
                  key={c.id}
                  selected={selectedCategory === c.id}
                  disabled={disabled}
                  onClick={() => setSelectedCategory(c.id)}
                  label={c.name}
                  hint={c.description}
                  tone="accent"
                />
              ))}
            </div>

            <button
              onClick={() => setShowInterop((v) => !v)}
              disabled={disabled}
              className="mt-3 inline-flex items-center gap-1.5 text-[11.5px]"
              style={{ color: "var(--text-3)" }}
            >
              <ChevronDown
                size={12}
                strokeWidth={2}
                style={{
                  transform: showInterop ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform .15s ease",
                }}
              />
              Interoperability suite ({INTEROP_CATEGORIES.length} more)
            </button>
            {showInterop && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 animate-in fade-in duration-200">
                {INTEROP_CATEGORIES.map((c) => (
                  <CategoryChip
                    key={c.id}
                    selected={selectedCategory === c.id}
                    disabled={disabled}
                    onClick={() => setSelectedCategory(c.id)}
                    label={c.name}
                    hint={c.description}
                    tone="success"
                  />
                ))}
              </div>
            )}
          </Step>

          {/* Step 2: Scope */}
          <Step num={2} label="Scope">
            <div className="inline-flex rounded-lg p-[3px] mb-3"
              style={{ background: "var(--surface-2)", border: "1px solid var(--line-2)" }}>
              <SegmentButton
                active={mode === "global"}
                disabled={disabled}
                onClick={() => handleModeChange("global")}
                Icon={Globe}
                label="Global"
              />
              <SegmentButton
                active={mode === "ceims"}
                disabled={disabled}
                onClick={() => handleModeChange("ceims")}
                Icon={MapPin}
                label="CEIMS · NSW"
              />
            </div>
            <SelectField
              value={location}
              onChange={setLocation}
              disabled={disabled}
              options={
                mode === "global"
                  ? MAJOR_CITIES.map((c) => ({ value: c, label: c }))
                  : allLgas.length
                    ? allLgas.map((l) => ({ value: l, label: l }))
                    : [{ value: "", label: "Loading LGAs…" }]
              }
            />
          </Step>

          {/* Step 3: Density */}
          <Step num={3} label="Density" last>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {TIMEFRAMES.map((tf) => {
                const active = timeFrame === tf.id;
                return (
                  <button
                    key={tf.id}
                    onClick={() => setTimeFrame(tf.id)}
                    disabled={disabled}
                    className={cn(
                      "text-left p-3 rounded-[10px] transition-all",
                      active && "ring-1",
                    )}
                    style={{
                      background: active ? "var(--accent-soft)" : "var(--surface-2)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--line-2)"}`,
                      color: active ? "var(--text-0)" : "var(--text-1)",
                    }}
                  >
                    <div className="text-[12.5px] font-semibold">{tf.label}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                      {tf.hint}
                    </div>
                    <div
                      className="text-[9.5px] uppercase tracking-[0.14em] mt-1.5 font-semibold"
                      style={{ color: active ? "var(--accent)" : "var(--text-4)" }}
                    >
                      {tf.density}
                    </div>
                  </button>
                );
              })}
            </div>
          </Step>

          {/* Run */}
          <div className="mt-6 flex items-center gap-2">
            <button
              onClick={handleScrape}
              disabled={disabled}
              className={cn(
                "h-10 px-5 rounded-[10px] text-[13.5px] font-semibold inline-flex items-center gap-2",
                "transition-transform disabled:opacity-60 disabled:cursor-not-allowed",
                !disabled && "hover:-translate-y-[1px]",
              )}
              style={{
                background: "var(--accent)",
                color: "white",
                boxShadow: "0 8px 20px -10px var(--accent-ring)",
              }}
            >
              {loading ? (
                <><Loader2 size={14} strokeWidth={2.25} className="animate-spin" /> Starting…</>
              ) : (
                <><Play size={13} strokeWidth={2.25} /> Run job</>
              )}
            </button>
            <button
              onClick={() => { resetJob(); }}
              disabled={disabled}
              className="h-10 px-4 rounded-[10px] text-[12.5px] font-medium transition-colors"
              style={{
                background: "transparent",
                color: "var(--text-2)",
                border: "1px solid var(--line-2)",
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {/* ======================== LIVE PIPELINE ======================== */}
        <div className="flex flex-col gap-6">
          {/* Stepper */}
          <div
            className="rounded-[14px]"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--line-1)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-0)" }}>
                  Pipeline
                </h2>
                <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-3)" }}>
                  {currentJobId
                    ? `#${currentJobId.substring(0, 8).toUpperCase()} · ${job.stage}`
                    : "Awaiting job"}
                </p>
              </div>
              {(fullArticles.length > 0 || isFallback) && !isProcessing && processStep < 1 && (
                <button
                  onClick={handleProcess}
                  className="h-8 px-3 rounded-[10px] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-0)",
                    border: "1px solid var(--line-2)",
                  }}
                >
                  <Cpu size={12} strokeWidth={2} /> Process intelligence
                </button>
              )}
            </div>

            <div className="px-5 pb-5 space-y-1">
              <StageRow
                label="Scrape articles"
                hint={
                  stageStates.scrape === "running"
                    ? `Target ${expectedCount(timeFrame)} · ${Math.round(scrapeProgress)}%`
                    : isFallback ? `${fallbackUrls.length} URLs recovered (fallback)`
                    : fullArticles.length > 0 ? `${fullArticles.length} articles captured`
                    : scrapeComplete ? "Completed · no articles matched"
                    : "Fetch from the target source"
                }
                state={stageStates.scrape}
                progress={stageStates.scrape === "running" ? scrapeProgress : undefined}
              />
              <StageRow
                label="NLP analysis"
                hint={
                  stageStates.nlp === "running"
                    ? `RoBERTa inference · ${Math.round(processProgress)}%`
                    : processStep >= 2 ? "Sentiment + entities extracted"
                    : "Runs after scraping"
                }
                state={stageStates.nlp}
                progress={stageStates.nlp === "running" ? processProgress : undefined}
              />
              <StageRow
                label="Enrich & upload"
                hint={
                  stageStates.enrich === "running" ? "Uploading to S3…" :
                  processStep >= 3 ? "Persisted to intelligence pool" :
                  "Pushed to S3 after NLP"
                }
                state={stageStates.enrich}
              />
              <StageRow
                label="Publish to map"
                hint={
                  stageStates.publish === "done" ? "Now visible to the network" :
                  "Indexed into LGA dataset"
                }
                state={stageStates.publish}
                last
              />
            </div>

            {(scrapeComplete || fullArticles.length > 0 || fallbackUrls.length > 0) && !isProcessing && (
              <div
                className="flex items-center gap-2 px-5 py-3 border-t"
                style={{ borderColor: "var(--line-1)", background: "var(--surface-1)" }}
              >
                {(fullArticles.length > 0 || fallbackUrls.length > 0) && (
                  <button
                    onClick={handleDownload}
                    className="h-8 px-3 rounded-[10px] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
                    style={{
                      background: "transparent",
                      color: "var(--text-2)",
                      border: "1px solid var(--line-2)",
                    }}
                  >
                    <Download size={12} strokeWidth={2} /> URLs
                  </button>
                )}
                {processStep >= 3 && !!processedIntelligence && (
                  <button
                    onClick={handleDownloadIntelligence}
                    className="h-8 px-3 rounded-[10px] text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                      border: "1px solid transparent",
                    }}
                  >
                    <Download size={12} strokeWidth={2} /> Intelligence JSON
                  </button>
                )}
                <span className="flex-1" />
                <span className="text-[11px] inline-flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                  <Sparkles size={11} strokeWidth={2} /> Pipeline healthy
                </span>
              </div>
            )}
          </div>

          {/* Article stream */}
          <div
            className="rounded-[14px] flex-1 min-h-[360px] flex flex-col"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--line-1)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-0)" }}>
                  {isFallback ? "Recovered URLs" : "Captured articles"}
                </h2>
                <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-3)" }}>
                  {isFallback
                    ? `${visibleFallback.length} / ${fallbackUrls.length} URLs`
                    : fullArticles.length > 0
                      ? `${articles.length} / ${fullArticles.length} streamed in`
                      : loading || isPolling
                        ? "Streaming as they arrive…"
                        : "Start a scrape to see results here"}
                </p>
              </div>
              {articles.length < fullArticles.length && !isFallback && (
                <span className="text-[11px] font-mono inline-flex items-center gap-1.5" style={{ color: "var(--success)" }}>
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--success)" }} />
                  streaming
                </span>
              )}
            </div>

            <div className="px-5 pb-5 flex-1 overflow-y-auto custom-scrollbar space-y-1.5">
              {/* Idle — never run */}
              {!loading && !isPolling && articles.length === 0 && !isFallback && !scrapeComplete && (
                <div className="h-full min-h-[240px] grid place-items-center">
                  <div className="text-center">
                    <div
                      className="w-10 h-10 grid place-items-center rounded-full mx-auto mb-3"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--line-2)" }}
                    >
                      <Radar size={16} strokeWidth={1.75} style={{ color: "var(--text-3)" }} />
                    </div>
                    <div className="text-[13.5px] font-medium" style={{ color: "var(--text-1)" }}>
                      Awaiting your first scrape
                    </div>
                    <div className="text-[11.5px] mt-1" style={{ color: "var(--text-3)" }}>
                      Configure on the left and hit <span className="font-mono" style={{ color: "var(--text-1)" }}>Run job</span>.
                    </div>
                  </div>
                </div>
              )}

              {/* Completed — zero matches */}
              {!loading && !isPolling && articles.length === 0 && !isFallback && scrapeComplete && (
                <div className="h-full min-h-[240px] grid place-items-center">
                  <div className="text-center max-w-[320px]">
                    <div
                      className="w-10 h-10 grid place-items-center rounded-full mx-auto mb-3"
                      style={{ background: "var(--warn-soft)", border: "1px solid var(--line-2)" }}
                    >
                      <CheckCircle2 size={16} strokeWidth={1.75} style={{ color: "var(--warn)" }} />
                    </div>
                    <div className="text-[13.5px] font-medium" style={{ color: "var(--text-1)" }}>
                      Scrape complete · no articles matched
                    </div>
                    <div className="text-[11.5px] mt-1 leading-relaxed" style={{ color: "var(--text-3)" }}>
                      The source returned zero results for{" "}
                      <span className="font-mono" style={{ color: "var(--text-2)" }}>
                        {selectedCategory}
                      </span>{" "}
                      in{" "}
                      <span className="font-mono capitalize" style={{ color: "var(--text-2)" }}>
                        {location.toLowerCase()}
                      </span>
                      . Try widening the timeframe or picking a different subject.
                    </div>
                  </div>
                </div>
              )}

              {/* Skeleton while waiting */}
              {(loading || isPolling) && articles.length === 0 && !isFallback && (
                <div aria-busy="true" aria-live="polite" className="space-y-1.5">
                  <span className="sr-only">Scraping in progress, articles will appear here…</span>
                  <div className="h-14 skeleton" aria-hidden="true" />
                  <div className="h-14 skeleton" aria-hidden="true" />
                  <div className="h-14 skeleton" aria-hidden="true" />
                  <div className="h-14 skeleton" aria-hidden="true" />
                </div>
              )}

              {/* Fallback URLs */}
              {isFallback && visibleFallback.map((url, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-[10px] animate-in fade-in slide-in-from-left-1 duration-200"
                  style={{ background: "var(--surface-2)", border: "1px solid var(--line-1)" }}
                >
                  <FileText size={13} strokeWidth={1.75} style={{ color: "var(--text-3)" }} />
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[12px] font-mono truncate flex-1 hover:underline"
                    style={{ color: "var(--text-1)" }}
                  >
                    {url}
                  </a>
                </div>
              ))}

              {/* Articles */}
              {!isFallback && articles.map((art, i) => {
                const fileName = art.file_key?.replace("users/", "").split("/").pop();
                const title = fileName
                  ? fileName.replace(".txt", "").replace(/_/g, " ")
                  : (art.title || "Untitled report");
                const publishDate = art.metadata?.publish_date
                  ? new Date(art.metadata.publish_date).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
                  : "—";
                const preview = art.content ? art.content.substring(0, 120).trim() + "…" : "";

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedArticle(art)}
                    className="w-full text-left p-3 rounded-[10px] animate-in fade-in slide-in-from-left-1 duration-200 transition-colors"
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--line-1)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium capitalize truncate" style={{ color: "var(--text-0)" }}>
                          {title}
                        </div>
                        {preview && (
                          <div className="text-[11.5px] mt-0.5 line-clamp-1" style={{ color: "var(--text-2)" }}>
                            {preview}
                          </div>
                        )}
                        <div className="text-[11px] mt-1 inline-flex items-center gap-1.5" style={{ color: "var(--text-4)" }}>
                          <Clock size={10} strokeWidth={2} /> {publishDate} · S3 extractor
                        </div>
                      </div>
                      <ArrowRight size={12} strokeWidth={2} style={{ color: "var(--text-3)" }} className="mt-1" />
                    </div>
                  </button>
                );
              })}
              <div ref={streamEndRef} />
            </div>
          </div>
        </div>
      </div>

      {/* Inspector modal */}
      {selectedArticle && (
        <ArticleModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------- Article modal ---------------------------- */

function ArticleModal({
  article,
  onClose,
}: {
  article: ArticleRecord;
  onClose: () => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title =
    article.file_key?.split("/").pop()?.replace(".txt", "").replace(/_/g, " ") ||
    "Viewer";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      style={{ background: "var(--overlay)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="rounded-[14px] w-full max-w-[760px] max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-150"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line-2)",
          boxShadow: "var(--shadow-3)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--line-1)" }}
        >
          <div className="min-w-0">
            <div
              className="text-[11px] uppercase tracking-[0.14em] font-semibold"
              style={{ color: "var(--text-3)" }}
            >
              Article
            </div>
            <h3
              id="article-modal-title"
              className="text-[15px] font-semibold truncate capitalize"
              style={{ color: "var(--text-0)" }}
            >
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close article"
            className="w-9 h-9 rounded-lg grid place-items-center hover:bg-[var(--surface-2)]"
          >
            <X size={16} strokeWidth={2} style={{ color: "var(--text-2)" }} aria-hidden="true" />
          </button>
        </div>
        <div
          className="overflow-y-auto custom-scrollbar p-5 text-[13.5px] leading-[1.65] whitespace-pre-wrap"
          style={{ color: "var(--text-1)" }}
        >
          {article.content || "No content available."}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Primitives ------------------------------ */

function Step({
  num, label, last, children,
}: { num: number; label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("relative pl-8", !last && "pb-6")}>
      <div
        className="absolute left-0 top-0 w-[22px] h-[22px] rounded-full grid place-items-center text-[11px] font-mono"
        style={{
          background: "var(--surface-2)",
          color: "var(--text-2)",
          border: "1px solid var(--line-2)",
        }}
      >
        {num}
      </div>
      {!last && (
        <div
          className="absolute left-[10.5px] top-[22px] bottom-0 w-px"
          style={{ background: "var(--line-1)" }}
        />
      )}
      <div className="text-[12.5px] font-semibold mb-2" style={{ color: "var(--text-1)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function SegmentButton({
  active, disabled, onClick, Icon, label,
}: {
  active: boolean; disabled?: boolean; onClick: () => void;
  Icon: typeof Globe; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-7 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 transition-all",
      )}
      style={{
        background: active ? "var(--surface-1)" : "transparent",
        color: active ? "var(--text-0)" : "var(--text-3)",
        boxShadow: active ? "var(--shadow-1)" : "none",
      }}
    >
      <Icon size={12} strokeWidth={2} /> {label}
    </button>
  );
}

function SelectField({
  value, onChange, disabled, options,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-10 pl-3 pr-9 rounded-[10px] text-[13px] appearance-none transition-colors"
        style={{
          background: "var(--surface-2)",
          color: "var(--text-0)",
          border: "1px solid var(--line-2)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={13} strokeWidth={2}
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: "var(--text-3)" }}
      />
    </div>
  );
}

function CategoryChip({
  selected, disabled, onClick, label, hint, tone,
}: {
  selected: boolean; disabled?: boolean; onClick: () => void;
  label: string; hint: string; tone: "accent" | "success";
}) {
  const accent = tone === "accent" ? "var(--accent)" : "var(--success)";
  const accentSoft = tone === "accent" ? "var(--accent-soft)" : "var(--success-soft)";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-left p-3 rounded-[10px] transition-all",
        disabled && "opacity-60 cursor-not-allowed",
      )}
      style={{
        background: selected ? accentSoft : "var(--surface-2)",
        border: `1px solid ${selected ? accent : "var(--line-2)"}`,
        color: selected ? "var(--text-0)" : "var(--text-1)",
      }}
    >
      <div className="text-[12.5px] font-semibold">{label}</div>
      <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--text-3)" }}>
        {hint}
      </div>
    </button>
  );
}

function StageRow({
  label, hint, state, progress, last,
}: {
  label: string;
  hint: string;
  state: StageState;
  progress?: number;
  last?: boolean;
}) {
  const icon = {
    pending: <Circle size={14} strokeWidth={1.75} style={{ color: "var(--text-4)" }} />,
    running: <Loader2 size={14} strokeWidth={2} className="animate-spin" style={{ color: "var(--accent)" }} />,
    done:    <CheckCircle2 size={14} strokeWidth={2} style={{ color: "var(--success)" }} />,
    failed:  <AlertCircle size={14} strokeWidth={2} style={{ color: "var(--danger)" }} />,
  }[state];

  return (
    <div
      className="relative flex items-start gap-3 py-3"
      style={last ? {} : { boxShadow: "inset 0 -1px 0 var(--line-1)" }}
    >
      <div className="mt-[1px]">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4">
          <span
            className="text-[12.5px] font-medium"
            style={{ color: state === "pending" ? "var(--text-3)" : "var(--text-1)" }}
          >
            {label}
          </span>
          {state === "running" && progress !== undefined && (
            <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--text-3)" }}>
              {Math.round(progress)}%
            </span>
          )}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
          {hint}
        </div>
        {state === "running" && progress !== undefined && (
          <div
            role="progressbar"
            aria-label={`${label} progress`}
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-[3px] rounded-full overflow-hidden"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: "var(--accent)" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
