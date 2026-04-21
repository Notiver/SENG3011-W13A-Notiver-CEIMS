"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  LayoutDashboard,
  Radar,
  Map as MapIcon,
  BarChart3,
  LogOut,
  CornerDownLeft,
} from "lucide-react";
import type { NavKey } from "./LeftRail";
import { cn } from "@/lib/cn";

interface Action {
  id: string;
  label: string;
  hint?: string;
  section: "Navigate" | "Actions";
  Icon: typeof Radar;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (key: NavKey) => void;
  onLogout: () => void;
}

export default function CommandPalette(props: CommandPaletteProps) {
  if (!props.open) return null;
  return <PaletteInner {...props} />;
}

function PaletteInner({ onClose, onNavigate, onLogout }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const actions: Action[] = useMemo(
    () => [
      { id: "nav:dashboard", label: "Go to Overview",   section: "Navigate", Icon: LayoutDashboard, run: () => onNavigate("dashboard") },
      { id: "nav:scraper",   label: "Go to Job Studio", section: "Navigate", Icon: Radar,           run: () => onNavigate("scraper") },
      { id: "nav:map",       label: "Go to Map",        section: "Navigate", Icon: MapIcon,         run: () => onNavigate("map") },
      { id: "nav:ranking",   label: "Go to Ranking",    section: "Navigate", Icon: BarChart3,       run: () => onNavigate("ranking") },
      { id: "act:logout",    label: "Sign out",         section: "Actions",  Icon: LogOut,          run: onLogout },
    ],
    [onNavigate, onLogout],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [actions, query]);

  const grouped = useMemo(() => {
    const by: Record<string, Action[]> = {};
    for (const a of filtered) {
      by[a.section] = by[a.section] || [];
      by[a.section].push(a);
    }
    return by;
  }, [filtered]);

  // autofocus on first mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // keyboard handling — uses latest state via closure through deps
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter") {
        e.preventDefault();
        const a = filtered[cursor];
        if (a) { a.run(); onClose(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, cursor, onClose]);

  // keep cursor within range when query filters the list
  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1));
  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh] px-4 animate-in fade-in duration-150"
      style={{ background: "var(--overlay)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] rounded-[14px] overflow-hidden animate-in zoom-in-95 duration-150"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--line-2)",
          boxShadow: "var(--shadow-3)",
        }}
      >
        <div
          className="flex items-center gap-3 px-4 h-[48px] border-b"
          style={{ borderColor: "var(--line-1)" }}
        >
          <Search size={15} strokeWidth={2} style={{ color: "var(--text-3)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent outline-none text-[14px]"
            style={{ color: "var(--text-0)" }}
          />
          <kbd>ESC</kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto custom-scrollbar py-2">
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section} className="py-1">
              <div
                className="px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: "var(--text-4)" }}
              >
                {section}
              </div>
              {items.map((a) => {
                flatIndex += 1;
                const active = flatIndex === safeCursor;
                const idx = flatIndex;
                const Icon = a.Icon;
                return (
                  <button
                    key={a.id}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => { a.run(); onClose(); }}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                      active && "bg-[var(--surface-2)]",
                    )}
                  >
                    <Icon size={15} strokeWidth={1.75} style={{ color: active ? "var(--text-0)" : "var(--text-2)" }} />
                    <span className="text-[13px]" style={{ color: active ? "var(--text-0)" : "var(--text-1)" }}>
                      {a.label}
                    </span>
                    <div className="flex-1" />
                    {active && (
                      <CornerDownLeft size={12} strokeWidth={2} style={{ color: "var(--text-3)" }} />
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="py-10 text-center text-[13px]" style={{ color: "var(--text-3)" }}>
              No matches for <span style={{ color: "var(--text-1)" }}>&ldquo;{query}&rdquo;</span>
            </div>
          )}
        </div>

        <div
          className="flex items-center gap-4 px-4 h-[34px] border-t text-[10.5px]"
          style={{ borderColor: "var(--line-1)", color: "var(--text-3)" }}
        >
          <div className="flex items-center gap-1.5">
            <kbd>↑</kbd><kbd>↓</kbd><span>Navigate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd>↵</kbd><span>Select</span>
          </div>
          <div className="flex-1" />
          <span>Notiver Command</span>
        </div>
      </div>
    </div>
  );
}
