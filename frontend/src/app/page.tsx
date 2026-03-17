"use client";

import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";

const Map = dynamic(() => import("../components/Map"), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-zinc-900 animate-pulse flex items-center justify-center text-zinc-500">Initializing Satellite Link...</div>
});

const MOCK_RANKING = [
  { lga: "Sydney City", score: 88, trend: "up" },
  { lga: "Blacktown", score: 72, trend: "down" },
  { lga: "Parramatta", score: 65, trend: "stable" },
];

export default function DemoPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState("scraper");
  const [loading, setLoading] = useState(false);
  
  const [selectedCategory, setSelectedCategory] = useState("crime");
  const [scrapedArticles, setScrapedArticles] = useState<any[]>([]);
  const [geoJsonData, setGeoJsonData] = useState<any>(null);

  useEffect(() => {
    const fetchMap = async () => {
      try {
        const response = await fetch("/data/sydney_lgas.json");
        if (!response.ok) throw new Error("Local file not found");
        const data = await response.json();
        setGeoJsonData(data);
      } catch (e) {
        console.error("Map Load Error:", e);
      }
    };
    fetchMap();
  }, []);

  const handleScrape = async () => {
    setLoading(true);
    const API_BASE = process.env.NEXT_PUBLIC_API_GATEWAY_URL_FETCH_ARTICLES;

    try {
      const response = await fetch(`${API_BASE}/data-collection/collect-articles`);

      console.log("Status Code:", response.status); // CHECK THIS IN BROWSER CONSOLE

      if (response.status === 429) {
        alert("Throttle Limit: Please wait.");
        return;
      }

      if (!response.ok) {
        const errorMsg = await response.text();
        console.error("AWS Error Message:", errorMsg);
        throw new Error(`Service Error: ${response.status}`);
      }
      
      const data = await response.json();
      setScrapedArticles(data.articles || data); 

    } catch (error) {
      console.error("Scraper Error:", error);
      alert(`Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
        <div className="bg-[#18181b] border border-zinc-800 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h1 className="text-3xl font-bold mb-2 text-center text-white">Notiver CEIMS</h1>
          <p className="text-zinc-500 text-sm mb-8 text-center uppercase tracking-widest">Intelligence Portal</p>
          <div className="space-y-4">
            <input type="email" placeholder="Email" className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-white" />
            <input type="password" placeholder="Password" className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-white" />
            <button onClick={() => setIsLoggedIn(true)} className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-lg font-bold transition-all">Login</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col md:flex-row">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 border-r border-zinc-800 bg-zinc-950/50 p-6 flex flex-col">
        <div className="mb-10">
          <h2 className="text-xl font-bold text-white tracking-tight italic">NOTIVER</h2>
          <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-tighter block">CRIME EVENT INTELLIGENCE MICROSERVICE SUITE</span>
        </div>
        
        <nav className="flex-1 space-y-2">
          {["scraper", "map", "ranking"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-3 rounded-xl capitalize transition-all border ${
                activeTab === tab 
                ? "bg-indigo-600/10 border-indigo-500 text-white shadow-[0_0_15px_rgba(79,70,229,0.1)]" 
                : "border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              {tab === "scraper" && "📡 "}
              {tab === "map" && "🗺️ "}
              {tab === "ranking" && "📊 "}
              {tab}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-zinc-800">
          <button onClick={() => setIsLoggedIn(false)} className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-2 transition-colors">
            <span>⏻</span> Sign Out Terminal
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {activeTab === "scraper" && (
          <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
            <header>
              <h1 className="text-4xl font-extrabold text-white">Scraper Terminal</h1>
              <h2 className="text-l font-extrabold mt-1 text-yellow-400">Welcome Back, Jane!</h2>
              <p className="text-zinc-400 mt-2">Target news vectors for automated intelligence gathering.</p>
            </header>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {["crime", "housing prices", "lifestyle", "job opportunities"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`p-6 rounded-2xl border text-center transition-all ${
                    selectedCategory === cat 
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-lg" 
                    : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  <div className="text-sm font-bold uppercase tracking-widest">{cat}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={handleScrape} 
                disabled={loading}
                className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-zinc-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? "Initialising..." : "Activate Scraper"}
              </button>
              {scrapedArticles.length > 0 && (
                <button className="bg-zinc-800 text-zinc-300 px-8 py-3 rounded-full font-bold hover:bg-zinc-700 transition-all">
                  Process Intelligence
                </button>
              )}
            </div>

            {scrapedArticles.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Articles Scraped</h3>
                <div className="grid gap-3">
                  {scrapedArticles.map((art, i) => (
                    <div key={i} className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl flex justify-between items-center group hover:border-indigo-500/50 transition-all">
                      <div>
                        <h4 className="text-white font-semibold group-hover:text-indigo-400 transition-colors">{art.title || "Untitled Report"}</h4>
                        <p className="text-xs text-zinc-500 mt-1">{art.source || "Unknown Source"} • {art.date || "N/A"}</p>
                      </div>
                      <button className="text-indigo-400 text-sm font-bold hover:underline">View</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "map" && (
          <div className="flex-1 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative h-[600px]">
            <Map geoJsonData={geoJsonData} />
          </div>
        )}

        {/* ... Tab 3 remains the same ... */}
        {activeTab === "ranking" && (
           <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
           <header>
             <h1 className="text-4xl font-extrabold text-white">LGA Ranking</h1>
             <p className="text-zinc-400 mt-2">Statistical severity index by Local Government Area.</p>
           </header>

           <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
             <table className="w-full text-left">
               <thead className="bg-zinc-900/80 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-800">
                 <tr>
                   <th className="p-6">LGA Name</th>
                   <th className="p-6">Risk Score</th>
                   <th className="p-6 text-right">Weekly Trend</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-zinc-800/50">
                 {MOCK_RANKING.map((item, i) => (
                   <tr key={i} className="hover:bg-zinc-800/20 transition-colors">
                     <td className="p-6 font-bold text-white">{item.lga}</td>
                     <td className="p-6">
                       <div className="flex items-center gap-3">
                         <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                           <div className="bg-indigo-500 h-full" style={{ width: `${item.score}%` }}></div>
                         </div>
                         <span className="text-sm font-mono text-indigo-400">{item.score}</span>
                       </div>
                     </td>
                     <td className="p-6 text-right">
                       <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                         item.trend === 'up' ? 'bg-red-500/10 text-red-500' : 
                         item.trend === 'down' ? 'bg-green-500/10 text-green-500' : 'bg-zinc-700 text-zinc-400'
                       }`}>
                         {item.trend}
                       </span>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         </div>
        )}
      </main>
    </div>
  );
}