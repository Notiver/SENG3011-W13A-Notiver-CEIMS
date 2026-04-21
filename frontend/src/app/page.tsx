"use client";

import { useEffect, useState } from "react";
import { AuthUser, getCurrentUser, signOut } from "aws-amplify/auth";
import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";
import LoginForm from "@/components/auth/LoginForm";
import AppShell from "@/components/shell/AppShell";
import type { NavKey } from "@/components/shell/LeftRail";
import DashboardTab from "@/components/tabs/DashboardTab";
import JobStudioTab from "@/components/tabs/JobStudioTab";
import MapTab from "@/components/tabs/MapTab";
import RankingTab from "@/components/tabs/RankingTab";
import { Loader2 } from "lucide-react";

Amplify.configure(outputs);

const TAB_META: Record<NavKey, { title: string; subtitle?: string }> = {
  dashboard: { title: "Overview",   subtitle: "Intelligence workspace" },
  scraper:   { title: "Job Studio", subtitle: "Configure & run a scrape" },
  map:       { title: "Map",        subtitle: "Geospatial intelligence" },
  ranking:   { title: "Ranking",    subtitle: "LGA threat leaderboard" },
};

export default function MainPage() {
  const [active, setActive] = useState<NavKey>("dashboard");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { checkUser(); }, []);

  async function checkUser() {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string } | null;
      if (err?.name !== "UserUnAuthenticatedException") {
        console.error("Auth details:", err?.name, err?.message);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await signOut();
    setUser(null);
    setActive("dashboard");
  }

  if (loading) {
    return (
      <div
        className="notiver-canvas min-h-screen flex items-center justify-center gap-3"
        style={{ background: "var(--surface-0)", color: "var(--text-3)" }}
      >
        <Loader2 size={16} strokeWidth={2} className="animate-spin" />
        <span className="text-[13px]">Loading workspace…</span>
      </div>
    );
  }

  if (!user) return <LoginForm onLogin={checkUser} />;

  const label = user.username || user.signInDetails?.loginId || "Jane Doe";
  const meta = TAB_META[active];

  return (
    <AppShell
      active={active}
      onChange={setActive}
      onLogout={handleLogout}
      userLabel={String(label).split("@")[0]}
      title={meta.title}
      subtitle={meta.subtitle}
    >
      {active === "dashboard" && <DashboardTab onNavigate={setActive} />}
      {active === "scraper"   && <JobStudioTab />}
      {active === "map"       && <MapTab />}
      {active === "ranking"   && <RankingTab />}
    </AppShell>
  );
}
