"use client";

import { useState } from "react";
import LoginForm from "@/components/auth/LoginForm";
import Sidebar from "@/components/layout/Sidebar";
import ScraperTab from "@/components/tabs/ScraperTab";
import MapTab from "@/components/tabs/MapTab";
import RankingTab from "@/components/tabs/RankingTab";

export default function DemoPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState("scraper");

  if (!isLoggedIn) {
    return <LoginForm onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col md:flex-row">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={() => setIsLoggedIn(false)} 
      />

      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === "scraper" && <ScraperTab />}
        {activeTab === "map" && <MapTab />}
        {activeTab === "ranking" && <RankingTab />}
      </main>
    </div>
  );
}