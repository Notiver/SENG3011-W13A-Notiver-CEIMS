"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PipelineStage = "idle" | "queued" | "scraping" | "processing" | "ready" | "failed";

export interface JobParams {
  category: string;
  location: string;
  timeFrame: string;
  mode: "global" | "ceims";
}

export interface JobSnapshot {
  id: string | null;
  stage: PipelineStage;
  scrapeProgress: number;   // 0..100
  nlpProgress: number;      // 0..100
  articlesCount: number;
  targetCount: number;
  params: JobParams;
  startedAt: number | null;
  lastMessage: string | null;
}

const DEFAULT_PARAMS: JobParams = {
  category: "crime",
  location: "Sydney, Australia",
  timeFrame: "5_per_month_1_year",
  mode: "global",
};

const DEFAULT_JOB: JobSnapshot = {
  id: null,
  stage: "idle",
  scrapeProgress: 0,
  nlpProgress: 0,
  articlesCount: 0,
  targetCount: 60,
  params: DEFAULT_PARAMS,
  startedAt: null,
  lastMessage: null,
};

type JobUpdater = Partial<JobSnapshot> | ((prev: JobSnapshot) => Partial<JobSnapshot>);

interface JobContextValue {
  job: JobSnapshot;
  setJob: (updater: JobUpdater) => void;
  resetJob: () => void;
}

const JobCtx = createContext<JobContextValue | null>(null);

export function JobProvider({ children }: { children: ReactNode }) {
  const [job, setJobState] = useState<JobSnapshot>(DEFAULT_JOB);

  const setJob = useCallback<JobContextValue["setJob"]>((updater) => {
    setJobState((prev) => {
      const patch = typeof updater === "function" ? updater(prev) : updater;
      return { ...prev, ...patch };
    });
  }, []);

  const resetJob = useCallback(() => setJobState(DEFAULT_JOB), []);

  const value = useMemo<JobContextValue>(
    () => ({ job, setJob, resetJob }),
    [job, setJob, resetJob],
  );

  return <JobCtx.Provider value={value}>{children}</JobCtx.Provider>;
}

export function useJob() {
  const ctx = useContext(JobCtx);
  if (!ctx) throw new Error("useJob must be used inside JobProvider");
  return ctx;
}

export function timeframeLabel(tf: string): string {
  switch (tf) {
    case "1_per_month_5_years": return "5 years · monthly";
    case "5_per_month_1_year":  return "1 year · 5 / month";
    case "1_per_day_1_month":   return "1 month · daily";
    default: return tf;
  }
}

export function expectedCount(tf: string): number {
  if (tf === "1_per_month_5_years") return 60;
  if (tf === "5_per_month_1_year") return 60;
  if (tf === "1_per_day_1_month") return 30;
  return 60;
}
