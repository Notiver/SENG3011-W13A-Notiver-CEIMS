"use client";

import { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";

const Map = dynamic(() => import("../components/Map"), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-zinc-900 animate-pulse flex items-center justify-center text-zinc-500">Mapping Crime Data...</div>
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

  const [isFallback, setIsFallback] = useState(false);
  const [fullFallbackUrls, setFullFallbackUrls] = useState<string[]>([]);
  const [visibleFallbackUrls, setVisibleFallbackUrls] = useState<string[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(0);

  const terminalEndRef = useRef<HTMLDivElement>(null);

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

  // Typewriter effect
  useEffect(() => {
    if (isFallback && visibleFallbackUrls.length < fullFallbackUrls.length) {
      const timer = setTimeout(() => {
        setVisibleFallbackUrls(prev => [...prev, fullFallbackUrls[prev.length]]);
      }, 170); 
      
      return () => clearTimeout(timer);
    }
  }, [isFallback, fullFallbackUrls, visibleFallbackUrls]);

  // Auto-scroll
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [visibleFallbackUrls]);

  const handleScrape = async () => {
    setLoading(true);
    setIsFallback(false);
    setIsProcessing(false);
    setProcessStep(0);
    setScrapedArticles([]);
    setVisibleFallbackUrls([]); 
    setFullFallbackUrls([]);    
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const API_BASE = process.env.NEXT_PUBLIC_API_GATEWAY_URL_FETCH_ARTICLES;

    try {
      const response = await fetch(`${API_BASE}/data-collection/collect-articles`);

      if (!response.ok) {
        throw new Error(`Service Error: ${response.status}`);
      }
      
      const data = await response.json();
      setScrapedArticles(data.articles || data); 

    } catch (error) {
      console.error("Scraper Error - Initiating Fallback Override:", error);
      
      try {
        const res = await fetch("/data/scraped_links.txt");
        if (res.ok) {
          const text = await res.text();
          const urls = text.split("\n").filter(url => url.trim() !== "");
          setFullFallbackUrls(urls);
          setIsFallback(true);
        }
      } catch (fallbackError) {
        console.error("Fallback also failed.", fallbackError);
      }

    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    setProcessStep(1);

    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    setProcessStep(2);

    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    setProcessStep(3);
  };


  type Category = {
  name: string;
  description: string;
};

const categories: Category[] = [
  {
    name: "crime",
    description: "Insights on Crime Articles related to LGA",
  },
  {
    name: "housing prices",
    description: "Investigates headlines about Property Prices",
  },
  {
    name: "lifestyle",
    description: "Distinguishes news trends for health and lifestyle in LGA",
  },
  {
    name: "job opportunities",
    description: "Heatmaps news of Job Oppurtunities",
  },
];

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
        <div className="bg-[#18181b] border border-zinc-800 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h1 className="text-3xl font-bold mb-2 text-center text-white">Notiver CEIMS</h1>
          <p className="text-zinc-500 text-sm mb-8 text-center uppercase tracking-widest">Crime Intelligence Portal</p>
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

      <main className="flex-1 p-8 overflow-y-auto">
        
        {activeTab === "scraper" && (
          <div className="max-w-4xl space-y-8 animate-in fade-in duration-500">
            <header>
              <h1 className="text-4xl font-extrabold text-white">Scraper Terminal</h1>
              <h2 className="text-l font-extrabold mt-1 text-yellow-400">Welcome Back, Jane!</h2>
              <p className="text-zinc-400 mt-2">Target news vectors for automated intelligence gathering.</p>
            </header>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={`p-6 rounded-2xl border text-center transition-all ${
                    selectedCategory === cat.name 
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg" 
                      : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  <div className="text-sm font-bold uppercase tracking-widest">
                    {cat.name}
                  </div>

                  <div
                    className={`mt-2 text-xs tracking-normal ${
                      selectedCategory === cat.name
                        ? "text-indigo-100"
                        : "text-zinc-400"
                    }`}
                  >
                    {cat.description}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-4 items-center">
              <button 
                onClick={handleScrape} 
                disabled={loading || isProcessing}
                className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-zinc-200 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? "Initialising..." : "Activate Scraper"}
              </button>
              
              {(scrapedArticles.length > 0 || (isFallback && fullFallbackUrls.length > 0)) && (
                <button 
                  onClick={handleProcess}
                  disabled={isProcessing}
                  className="bg-zinc-800 text-zinc-300 px-8 py-3 rounded-full font-bold hover:bg-zinc-700 transition-all disabled:opacity-50"
                >
                  {isProcessing ? "Processing Intelligence..." : "Process Intelligence"}
                </button>
              )}

              {isFallback && !isProcessing && (
                <div className="flex items-center gap-2 ml-auto text-emerald-400 text-[8px] font-bold tracking-widest uppercase animate-in fade-in">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  Live Feed Active
                </div>
              )}
            </div>

            {/* Hide normal API view if processing */}
            {!isFallback && !isProcessing && scrapedArticles.length > 0 && (
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

            {/* Hide the URL terminal if processing */}
            {isFallback && !isProcessing && visibleFallbackUrls.length > 0 && (
              <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest flex items-center gap-2">
                  Scraped News Articles
                  {visibleFallbackUrls.length < fullFallbackUrls.length && (
                    <span className="text-emerald-500 lowercase font-mono">...downloading</span>
                  )}
                </h3>
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 max-h-[400px] overflow-y-auto space-y-2 custom-scrollbar shadow-inner relative">
                  {visibleFallbackUrls.map((url, i) => (
                    <div key={i} className="p-2 bg-zinc-900/40 rounded text-[10px] md:text-xs font-mono text-zinc-500 truncate hover:text-emerald-400 hover:bg-zinc-900 transition-colors cursor-crosshair animate-in fade-in slide-in-from-left-2 duration-300">
                      <span className="text-zinc-700 mr-2">[{String(i + 1).padStart(2, '0')}]</span>
                      {url}
                    </div>
                  ))}
                  
                  {visibleFallbackUrls.length < fullFallbackUrls.length && (
                    <div className="h-4 w-2 bg-emerald-500 animate-pulse mt-2 ml-2 inline-block" />
                  )}
                  
                  <div ref={terminalEndRef} />
                </div>
              </div>
            )}

            {/* NEW: The Processing Status Terminal */}
            {isProcessing && (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
                <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Pipeline Status</h3>
                
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 font-mono text-sm space-y-4 shadow-inner">
                  <div className="text-zinc-600">
                    [System] Initialising data collection microservice...
                  </div>

                  {processStep >= 1 && (
                    <div className={`flex items-center gap-3 animate-in slide-in-from-left-2 duration-300 ${processStep >= 2 ? "text-zinc-400" : "text-yellow-400 animate-pulse"}`}>
                      <span className="text-lg">{processStep >= 2 ? "✅" : "⏳"}</span>
                      <span>Parsing BOSCAR DATA...</span>
                    </div>
                  )}

                  {processStep >= 2 && (
                    <div className={`flex items-center gap-3 animate-in slide-in-from-left-2 duration-300 ${processStep >= 3 ? "text-zinc-400" : "text-yellow-400 animate-pulse"}`}>
                      <span className="text-lg">{processStep >= 3 ? "✅" : "⏳"}</span>
                      <span>Uploading to S3...</span>
                    </div>
                  )}

                  {processStep >= 3 && (
                    <div className="text-emerald-500 font-bold mt-6 pt-4 border-t border-zinc-800/50 animate-in fade-in duration-500">
                      [Success] Intelligence compilation complete. Data is ready for geographic mapping.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2 & 3 remain exactly the same... */}
        {activeTab === "map" && (
          <div className="flex-1 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative h-[600px]">
            <Map geoJsonData={geoJsonData} />
          </div>
        )}

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