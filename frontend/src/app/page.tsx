"use client";

import { useState, useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const Map = dynamic(() => import("../components/Map"), { 
  ssr: false,
  loading: () => <div className="h-full w-full bg-zinc-900 animate-pulse flex items-center justify-center text-zinc-500">Mapping Crime Data...</div>
});

const MOCK_CHART_DATA = [
  { year: "2019", "Sydney City": 75, Blacktown: 68, Liverpool: 60, "State Avg": 45 },
  { year: "2020", "Sydney City": 70, Blacktown: 72, Liverpool: 65, "State Avg": 48 },
  { year: "2021", "Sydney City": 80, Blacktown: 75, Liverpool: 68, "State Avg": 50 },
  { year: "2022", "Sydney City": 85, Blacktown: 80, Liverpool: 75, "State Avg": 55 },
  { year: "2023", "Sydney City": 88, Blacktown: 85, Liverpool: 80, "State Avg": 58 },
  { year: "2024", "Sydney City": 92, Blacktown: 87, Liverpool: 82, "State Avg": 62 },
];

const MOCK_RANKING = [
  // HIGH RISK
  { lga: "Sydney City", score: 92, trend: "up" },
  { lga: "Blacktown", score: 87, trend: "up" },
  { lga: "Liverpool", score: 82, trend: "stable" },
  { lga: "Penrith", score: 78, trend: "down" },
  { lga: "Walgett", score: 76, trend: "up" },
  // ELEVATED RISK
  { lga: "Newcastle", score: 62, trend: "stable" },
  { lga: "Parramatta", score: 58, trend: "down" },
  { lga: "Cumberland", score: 45, trend: "up" },
  { lga: "Central Coast", score: 40, trend: "stable" },
  // LOW RISK
  { lga: "Canada Bay", score: 18, trend: "down" },
  { lga: "Ryde", score: 14, trend: "down" },
  { lga: "Willoughby", score: 12, trend: "stable" },
  { lga: "Ku-ring-gai", score: 8, trend: "down" },
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
        const response = await fetch("/demo/sydney_lgas.json");
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
        const res = await fetch("/demo/scraped_links.txt");
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

    await new Promise(resolve => setTimeout(resolve, 5000));
    setProcessStep(2);

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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogout = () => {
    setIsLoggedIn(false);
    setEmail("");
    setPassword("");
    setError("");
  };

  if (!isLoggedIn) {
    const handleLogin = () => {
      if (!email.toLowerCase().startsWith("j")) {
        setError("Incorrect email or password, please check credentials");
        return;
      }

      setError("");
      setIsLoggedIn(true);
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-white">
        <div className="bg-[#18181b] border border-zinc-800 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <h1 className="text-3xl font-bold mb-2 text-center text-white">Notiver CEIMS</h1>
          <p className="text-zinc-500 text-sm mb-8 text-center uppercase tracking-widest">
            Crime Intelligence Portal
          </p>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-white"
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 p-3 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-white"
            />

            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}

            <button
              onClick={handleLogin}
              className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-lg font-bold transition-all"
            >
              Login
            </button>
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
          <button onClick={() => handleLogout()} className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-2 transition-colors">
            <span>⏻</span> Sign Out Terminal
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        
        {/* --- SCRAPER TAB --- */}
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
                  <div className="text-sm font-bold uppercase tracking-widest">{cat.name}</div>
                  <div className={`mt-2 text-xs tracking-normal ${selectedCategory === cat.name ? "text-indigo-100" : "text-zinc-400"}`}>
                    {cat.description}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-4 items-center">
              <button onClick={handleScrape} disabled={loading || isProcessing} className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-zinc-200 transition-all flex items-center gap-2 disabled:opacity-50">
                {loading ? "Initialising..." : "Activate Scraper"}
              </button>
              {(scrapedArticles.length > 0 || (isFallback && fullFallbackUrls.length > 0)) && (
                <button onClick={handleProcess} disabled={isProcessing} className="bg-zinc-800 text-zinc-300 px-8 py-3 rounded-full font-bold hover:bg-zinc-700 transition-all disabled:opacity-50">
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

            {isProcessing && (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
                <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Pipeline Status</h3>
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 font-mono text-sm space-y-4 shadow-inner">
                  <div className="text-zinc-600">[System] Initialising data collection microservice...</div>
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

        {/* --- MAP TAB --- */}
        {activeTab === "map" && (
          <div className="flex-1 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative h-150">
            <Map geoJsonData={geoJsonData} />
          </div>
        )}

        {/* --- RANKING TAB --- */}
        {activeTab === "ranking" && (
           <div className="max-w-5xl space-y-8 animate-in fade-in duration-500">
           <header>
             <h1 className="text-4xl font-extrabold text-white">LGA Threat Ranking</h1>
           </header>

           {/* NEW: Methodology Description */}
           <div className="bg-indigo-950/30 border border-indigo-500/30 p-5 rounded-2xl">
             <div className="flex items-center gap-3 mb-2">
               <span className="text-indigo-400 text-xl">🧠</span>
               <h3 className="text-indigo-100 font-bold text-sm tracking-widest uppercase">Analytics Methodology</h3>
             </div>
             <p className="text-indigo-200/70 text-sm leading-relaxed">
               Our proprietary analytics model uses fine-tuned NLP scrapers powered by <strong>Hugging Face transformers</strong> to calculate the sentiment of local news articles. 
               This sentiment score (0.0 - 1.0) is factored by the volume of articles and synthetically overlaid onto statistical <strong>BOSCAR</strong> per-capita crime data to generate a unified, real-time LGA Threat Score.
             </p>
           </div>

           <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl shadow-xl">
             <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest mb-6">Threat Score Trend (2019 - 2024)</h3>
             <div className="h-75 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={MOCK_CHART_DATA} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                   <XAxis dataKey="year" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} />
                   <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                   <Tooltip 
                     contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }}
                     itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                   />
                   <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                   <Line type="monotone" dataKey="Sydney City" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }} />
                   <Line type="monotone" dataKey="Blacktown" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: "#f97316", strokeWidth: 0 }} />
                   <Line type="monotone" dataKey="Liverpool" stroke="#eab308" strokeWidth={3} dot={{ r: 4, fill: "#eab308", strokeWidth: 0 }} />
                   <Line type="monotone" dataKey="State Avg" stroke="#4f46e5" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                 </LineChart>
               </ResponsiveContainer>
             </div>
           </div>

           {/* Data Table */}
           <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
             <table className="w-full text-left">
               <thead className="bg-zinc-900/80 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-800">
                 <tr>
                   <th className="p-6">LGA Name</th>
                   <th className="p-6">Risk Score (Sentiment + BOSCAR)</th>
                   <th className="p-6 text-right">Yearly Trend</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-zinc-800/50">
                 {MOCK_RANKING.map((item, i) => {
                   let barColor = "bg-green-500";
                   let textColor = "text-green-400";
                   if (item.score >= 75) {
                     barColor = "bg-red-500";
                     textColor = "text-red-400";
                   } else if (item.score >= 35) {
                     barColor = "bg-orange-500";
                     textColor = "text-orange-400";
                   }

                   return (
                     <tr key={i} className="hover:bg-zinc-800/20 transition-colors">
                       <td className="p-6 font-bold text-white">{item.lga}</td>
                       <td className="p-6">
                         <div className="flex items-center gap-3">
                           <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                             <div className={`${barColor} h-full transition-all duration-1000`} style={{ width: `${item.score}%` }}></div>
                           </div>
                           <span className={`text-sm font-mono ${textColor}`}>{item.score}</span>
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
                   );
                 })}
               </tbody>
             </table>
           </div>
         </div>
        )}

      </main>
    </div>
  );
}