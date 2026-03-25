"use client";

import { useEffect, useState } from "react";
import LoginForm from "@/components/auth/LoginForm";
import Sidebar from "@/components/layout/Sidebar";
import ScraperTab from "@/components/tabs/ScraperTab";
import MapTab from "@/components/tabs/MapTab";
import RankingTab from "@/components/tabs/RankingTab";
import { AuthUser, getCurrentUser, signOut } from 'aws-amplify/auth';
import { Amplify } from "aws-amplify";
import outputs from '@/amplify_outputs.json';

Amplify.configure(outputs);

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState("scraper");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // so reload doesn't log out
  useEffect(() => {
    checkUser();
  }, []);

  // check existing user logged in before rendering page 
  async function checkUser() {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (e: any) {
      // case of not logged in yet
      if (e.name !== 'UserUnAuthenticatedException') {
        console.error("Auth  Details:", e.name, e.message);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  // handle logout
  async function handleLogout() {
    await signOut();
    setUser(null);
  }

  // show loading state while checking auth status
  if (loading) return <div>Loading...</div>;

  // if no user, show login form
  if (!user) {
    return <LoginForm onLogin={checkUser} />;
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col md:flex-row">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLogout={handleLogout} 
      />

      <main className="flex-1 p-8 overflow-y-auto">
        {activeTab === "scraper" && <ScraperTab />}
        {activeTab === "map" && <MapTab />}
        {activeTab === "ranking" && <RankingTab />}
      </main>
    </div>
  );
}