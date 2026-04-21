"use client";

import { Search, Bell } from "lucide-react";
import { useJob, timeframeLabel } from "@/lib/jobContext";
import { cn } from "@/lib/cn";

interface TopBarProps {
  userLabel: string;
  onOpenPalette: () => void;
  title: string;
  subtitle?: string;
}

export default function TopBar({ userLabel, onOpenPalette, title, subtitle }: TopBarProps) {
  const { job } = useJob();
  const chips = [
    { label: job.params.category, tone: "accent" as const },
    { label: job.params.location, tone: "neutral" as const },
    { label: timeframeLabel(job.params.timeFrame), tone: "neutral" as const },
    { label: job.params.mode === "ceims" ? "CEIMS · NSW" : "Global", tone: "neutral" as const },
  ];

  const initials = userLabel
    .split(" ")
    .map((s) => s.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header
      className="flex items-center gap-4 px-5 h-[52px] shrink-0 border-b"
      style={{
        borderColor: "var(--line-1)",
        background: "var(--surface-0)",
      }}
    >
      {/* Breadcrumb / title */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.16em]"
          style={{ color: "var(--text-3)" }}
        >
          Notiver
        </span>
        <span style={{ color: "var(--text-4)" }}>/</span>
        <h1
          className="text-[13.5px] font-semibold truncate"
          style={{ color: "var(--text-0)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <span className="text-[12px] truncate" style={{ color: "var(--text-3)" }}>
            · {subtitle}
          </span>
        )}
      </div>

      {/* Context chips */}
      <div className="hidden lg:flex items-center gap-1.5 overflow-hidden">
        {chips.map((chip, i) => (
          <span
            key={i}
            className={cn(
              "text-[11px] font-medium px-2 py-[3px] rounded-md capitalize truncate max-w-[160px]",
              chip.tone === "accent" && "text-[var(--accent)]",
            )}
            style={{
              background: chip.tone === "accent" ? "var(--accent-soft)" : "var(--surface-2)",
              color: chip.tone === "accent" ? undefined : "var(--text-2)",
              border: `1px solid ${chip.tone === "accent" ? "transparent" : "var(--line-2)"}`,
            }}
          >
            {chip.label}
          </span>
        ))}
      </div>

      <div className="flex-1" />

      {/* Search / command palette trigger */}
      <button
        onClick={onOpenPalette}
        className={cn(
          "hidden md:flex items-center gap-2 h-[32px] px-3 rounded-[10px] text-[12.5px]",
          "transition-colors min-w-[260px]",
        )}
        style={{
          background: "var(--surface-1)",
          color: "var(--text-3)",
          border: "1px solid var(--line-2)",
        }}
      >
        <Search size={13} strokeWidth={2} />
        <span className="flex-1 text-left">Search or jump to…</span>
        <kbd>⌘</kbd>
        <kbd>K</kbd>
      </button>

      <button
        aria-label="Notifications"
        className="relative w-8 h-8 rounded-[10px] grid place-items-center hover:bg-[var(--surface-2)] transition-colors"
      >
        <Bell size={16} strokeWidth={1.75} style={{ color: "var(--text-2)" }} />
        <span
          className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--accent)" }}
        />
      </button>

      <div
        className="h-8 px-2 pl-1 flex items-center gap-2 rounded-[10px]"
        style={{ background: "var(--surface-1)", border: "1px solid var(--line-2)" }}
      >
        <div
          className="w-6 h-6 rounded-md grid place-items-center text-[10.5px] font-semibold"
          style={{
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "white",
          }}
        >
          {initials || "U"}
        </div>
        <span
          className="text-[12px] font-medium hidden sm:inline pr-1"
          style={{ color: "var(--text-1)" }}
        >
          {userLabel}
        </span>
      </div>
    </header>
  );
}
