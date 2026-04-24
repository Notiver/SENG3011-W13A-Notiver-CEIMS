"use client";

import { useEffect, useState, type ReactNode } from "react";
import LeftRail, { type NavKey } from "./LeftRail";
import TopBar from "./TopBar";
import StatusBar from "./StatusBar";
import CommandPalette from "./CommandPalette";
import { JobProvider } from "@/lib/jobContext";

interface AppShellProps {
  active: NavKey;
  onChange: (key: NavKey) => void;
  onLogout: () => void;
  userLabel: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function AppShell({
  active,
  onChange,
  onLogout,
  userLabel,
  title,
  subtitle,
  children,
}: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      // ⌘K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      if (inField || e.metaKey || e.ctrlKey || e.altKey) return;

      // Vim-style: g d / g j / g m / g r
      if (e.key === "g") {
        const second = (ev: KeyboardEvent) => {
          if (ev.key === "d") onChange("dashboard");
          if (ev.key === "j") onChange("scraper");
          if (ev.key === "m") onChange("map");
          if (ev.key === "r") onChange("ranking");
          window.removeEventListener("keydown", second);
        };
        window.addEventListener("keydown", second);
        setTimeout(() => window.removeEventListener("keydown", second), 900);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChange]);

  return (
    <JobProvider>
      <a href="#main" className="skip-link">Skip to main content</a>
      <div
        className="h-screen w-screen flex flex-col overflow-hidden"
        style={{ background: "var(--surface-0)", color: "var(--text-1)" }}
      >
        <div className="flex flex-1 min-h-0">
          <LeftRail active={active} onChange={onChange} onLogout={onLogout} />
          <div className="flex flex-col flex-1 min-w-0">
            <TopBar
              userLabel={userLabel}
              onOpenPalette={() => setPaletteOpen(true)}
              title={title}
              subtitle={subtitle}
            />
            <main
              id="main"
              tabIndex={-1}
              className="notiver-canvas flex-1 overflow-y-auto custom-scrollbar"
            >
              {children}
            </main>
          </div>
        </div>
        <StatusBar />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={(k) => onChange(k)}
          onLogout={onLogout}
        />
      </div>
    </JobProvider>
  );
}
