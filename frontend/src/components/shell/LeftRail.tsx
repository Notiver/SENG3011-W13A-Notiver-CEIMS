"use client";

import {
  LayoutDashboard,
  Radar,
  Map as MapIcon,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type NavKey = "dashboard" | "scraper" | "map" | "ranking";

const NAV: { key: NavKey; label: string; Icon: typeof Radar; hint: string }[] = [
  { key: "dashboard", label: "Overview",   Icon: LayoutDashboard, hint: "G D" },
  { key: "scraper",   label: "Job Studio", Icon: Radar,           hint: "G J" },
  { key: "map",       label: "Map",        Icon: MapIcon,         hint: "G M" },
  { key: "ranking",   label: "Ranking",    Icon: BarChart3,       hint: "G R" },
];

interface LeftRailProps {
  active: NavKey;
  onChange: (key: NavKey) => void;
  onLogout: () => void;
}

export default function LeftRail({ active, onChange, onLogout }: LeftRailProps) {
  return (
    <aside
      className="flex flex-col items-center justify-between py-4 shrink-0 w-[60px] border-r"
      style={{ borderColor: "var(--line-1)", background: "var(--surface-0)" }}
    >
      {/* Brand */}
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-8 h-8 rounded-[10px] grid place-items-center text-[13px] font-semibold tracking-tight"
          style={{
            background: "linear-gradient(145deg, var(--accent) 0%, #4f46e5 100%)",
            color: "white",
            boxShadow: "0 4px 14px -4px var(--accent-ring), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
          aria-label="Notiver"
        >
          N
        </div>

        <div className="h-px w-5" style={{ background: "var(--line-2)" }} />

        <nav className="flex flex-col items-center gap-1.5">
          {NAV.map(({ key, label, Icon, hint }) => {
            const isActive = active === key;
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                aria-label={label}
                className={cn(
                  "group relative w-9 h-9 rounded-[10px] grid place-items-center transition-all",
                  "hover:bg-[var(--surface-2)]",
                  isActive && "bg-[var(--surface-2)]",
                )}
              >
                {/* Active indicator bar */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[-16px] top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r transition-all",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                  )}
                  style={{ background: "var(--accent)" }}
                />
                <Icon
                  size={17}
                  strokeWidth={1.75}
                  style={{
                    color: isActive ? "var(--text-0)" : "var(--text-3)",
                    transition: "color .15s ease",
                  }}
                  className="group-hover:!text-[var(--text-1)]"
                />

                {/* Tooltip */}
                <span
                  role="tooltip"
                  className={cn(
                    "pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2",
                    "flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs",
                    "opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0",
                    "transition-all duration-150 z-50",
                  )}
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-1)",
                    border: "1px solid var(--line-2)",
                    boxShadow: "var(--shadow-2)",
                  }}
                >
                  {label}
                  <kbd>{hint}</kbd>
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <button
          aria-label="Settings"
          className="w-9 h-9 rounded-[10px] grid place-items-center hover:bg-[var(--surface-2)] transition-colors"
        >
          <Settings size={17} strokeWidth={1.75} style={{ color: "var(--text-3)" }} />
        </button>
        <button
          onClick={onLogout}
          aria-label="Sign out"
          className="w-9 h-9 rounded-[10px] grid place-items-center hover:bg-[var(--danger-soft)] transition-colors group"
        >
          <LogOut
            size={17}
            strokeWidth={1.75}
            style={{ color: "var(--text-3)" }}
            className="group-hover:!text-[var(--danger)]"
          />
        </button>
      </div>
    </aside>
  );
}
