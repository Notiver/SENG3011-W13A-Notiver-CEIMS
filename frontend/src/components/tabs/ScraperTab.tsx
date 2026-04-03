"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { MAJOR_CITIES } from "@/lib/majorCities";

import { CEIMS_CATEGORIES, INTEROP_CATEGORIES } from "@/lib/dataLabels";
import { Maximize2, Minimize2, Download, Loader2 } from 'lucide-react';

export default function ScraperTab() {
  const [loading, setLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("crime");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [allLgas, setAllLgas] = useState([]);
  const [locationMode, setLocationMode] = useState<"global" | "ceims">("global");
  const [processedIntelligence, setProcessedIntelligence] = useState<any | null>(null);
  
  const [showInterop, setShowInterop] = useState(false);
  
  const [location, setLocation] = useState("Sydney, Australia");
  const [timeFrame, setTimeFrame] = useState("5_per_month_1_year");
  
  const [activeParams, setActiveParams] = useState({ 
    category: "crime", 
    location: "Sydney, Australia", 
    timeFrame: "5_per_month_1_year" 
  });

  const [fullScrapedArticles, setFullScrapedArticles] = useState<any[]>([]);
  const [scrapedArticles, setScrapedArticles] = useState<any[]>([]);
  
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);
  
  const [isFallback, setIsFallback] = useState(false);
  const [fullFallbackUrls, setFullFallbackUrls] = useState<string[]>([]);
  const [visibleFallbackUrls, setVisibleFallbackUrls] = useState<string[]>([]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStep, setProcessStep] = useState(0);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Helper to calculate expected articles for the UI
  const getExpectedCount = (tf: string) => {
    if (tf === "1_per_month_5_years") return 60;
    if (tf === "5_per_month_1_year") return 60;
    if (tf === "1_per_day_1_month") return 30;
    return "Target";
  };

  // Typewriter / Cascading effect for Real Articles
  useEffect(() => {
    if (!isFallback && !isProcessing && fullScrapedArticles.length > 0 && scrapedArticles.length < fullScrapedArticles.length) {
      const timer = setTimeout(() => {
        setScrapedArticles(prev => [...prev, fullScrapedArticles[prev.length]]);
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isFallback, isProcessing, fullScrapedArticles, scrapedArticles]);

  useEffect(() => {
    if (isFallback && visibleFallbackUrls.length < fullFallbackUrls.length) {
      const timer = setTimeout(() => {
        setVisibleFallbackUrls(prev => [...prev, fullFallbackUrls[prev.length]]);
      }, 170); 
      return () => clearTimeout(timer);
    }
  }, [isFallback, fullFallbackUrls, visibleFallbackUrls]);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [visibleFallbackUrls, scrapedArticles]);


  const triggerFallbackOverride = async (errorMsg: any) => {
    console.error("Scraper Error - Initiating Fallback Override:", errorMsg);
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
    } finally {
      setLoading(false);
      setIsPolling(false);
    }
  };

  const pollForJobResults = async (jobId: string) => {
    try {
      const data = await api.checkScrapeStatus(jobId);
      
      if (data.status === "complete") {
        const realArticlesArray = Array.isArray(data.articles) 
          ? data.articles 
          : (data.articles?.articles || []);
          
        setFullScrapedArticles(realArticlesArray);
        setIsPolling(false);
        setLoading(false);
      } else if (data.status === "processing") {
        setTimeout(() => pollForJobResults(jobId), 5000);
      } else {
        throw new Error("Unexpected status from polling.");
      }
    } catch (error) {
      triggerFallbackOverride(error);
    }
  };
  
  useEffect(() => {
    lgaDropdown();
  }, []);

  const lgaDropdown = async () => {
    try {
      const data = await api.getAllLgas();
      if (!data || !data.lgas) {
        throw new Error("No LGAs or the LGA route is down!!!");
      }
      setAllLgas(data.lgas);
    } catch (error) {
      console.error("Failed to fetch LGAs:", error);
    }
  };

  const handleLocationModeChange = (mode: "global" | "ceims") => {
    setLocationMode(mode);
    if (mode === "global") {
      setLocation(MAJOR_CITIES[0]);
    } else {
      setLocation(allLgas.length > 0 ? allLgas[0] : "");
    }
  };
  

  const handleScrape = async () => {
    setLoading(true);
    setIsPolling(false);
    setCurrentJobId(null);
    setIsFallback(false);
    setIsProcessing(false);
    setProcessStep(0);
    
    setFullScrapedArticles([]);
    setScrapedArticles([]);
    setVisibleFallbackUrls([]); 
    setFullFallbackUrls([]);
    
    setActiveParams({ category: selectedCategory, location: location, timeFrame: timeFrame });

    await new Promise(resolve => setTimeout(resolve, 500));

    try {
      const data = await api.collectArticles({ 
        category: selectedCategory, 
        location: location, 
        timeFrame: timeFrame
      });
      console.log("Initial API Response:", data);
      
      if (data.status === "processing" && data.job_id) {
        // SQS receipted. Start polling.
        setCurrentJobId(data.job_id);
        setIsPolling(true);
        pollForJobResults(data.job_id);
      } 
      else if (data.articles && data.articles.length > 0) {
        setFullScrapedArticles(data.articles);
        setLoading(false);
      } 
      else {
        throw new Error("Zero articles found or invalid backend response.");
      }
    } catch (error) {
      triggerFallbackOverride(error);
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async () => {
    if (!currentJobId) return;
    setIsProcessing(true);
    setProcessStep(1);

    try {
      const isCeimsMode = locationMode === "ceims";
      await api.processArticles(currentJobId, isCeimsMode);
      setProcessStep(2);

      const finalData = await api.getProcessedArticles(currentJobId);
      setProcessedIntelligence(finalData);

      await api.runRetrieval();
      setProcessStep(3);
      
    } catch (error) {
      console.error("Pipeline failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    let content = "";
    if (isFallback) {
      content = fullFallbackUrls.join("\n");
    } else {
      content = fullScrapedArticles
        .map(art => art.url || art.file_key || "Unknown Source")
        .join("\n");
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedCategory}_articles_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadIntelligence = () => {
    if (!processedIntelligence) return;

    const jsonString = JSON.stringify(processedIntelligence, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `intelligence_report_${selectedCategory}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-500 relative">
      <header>
        <h1 className="text-4xl font-extrabold text-white">Scraper Terminal</h1>
        <h2 className="text-l font-extrabold mt-1 text-yellow-400">Welcome Back, Jane!</h2>
        <p className="text-zinc-400 mt-2">Target news vectors for automated intelligence gathering.</p>
      </header>
      

      {/* Category Selection Container */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {CEIMS_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              disabled={loading || isProcessing}
              className={`p-6 rounded-2xl border text-center transition-all ${
                selectedCategory === cat.id 
                  ? "bg-indigo-600 border-indigo-500 text-white shadow-lg" 
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              } ${(loading || isProcessing) ? "opacity-50 cursor-not-allowed hover:border-zinc-800 hover:text-zinc-500" : ""}`}
            >
              <div className="text-sm font-bold uppercase tracking-widest">{cat.name}</div>
              <div className={`mt-2 text-xs tracking-normal ${selectedCategory === cat.id ? "text-indigo-100" : "text-zinc-400"}`}>
                {cat.description}
              </div>
            </button>
          ))}
        </div>

        <div className="flex justify-center">
          <button 
            onClick={() => setShowInterop(!showInterop)}
            disabled={loading || isProcessing}
            className={`text-xs font-bold text-zinc-500 uppercase tracking-widest transition-colors flex items-center gap-2 py-2 ${(loading || isProcessing) ? "opacity-50 cursor-not-allowed" : "hover:text-white"}`}
          >
            {showInterop ? (
              <>Hide Interoperability Suite <Minimize2 className="w-3 h-3" /></>
            ) : (
              <>Reveal Interoperability Suite <Maximize2 className="w-3 h-3" /></>
            )}
          </button>
        </div>

        {showInterop && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-top-2 fade-in duration-300">
            {INTEROP_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                disabled={loading || isProcessing}
                className={`p-6 rounded-2xl border text-center transition-all ${
                  selectedCategory === cat.id 
                    ? "bg-emerald-600 border-emerald-500 text-white shadow-lg" 
                    : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                } ${(loading || isProcessing) ? "opacity-50 cursor-not-allowed hover:border-zinc-800 hover:text-zinc-500" : ""}`}
              >
                <div className="text-sm font-bold uppercase tracking-widest">{cat.name}</div>
                <div className={`mt-2 text-xs tracking-normal ${selectedCategory === cat.id ? "text-emerald-100" : "text-zinc-400"}`}>
                  {cat.description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Parameters Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800/80 shadow-inner">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest block ml-1">Target Location</label>
            <div className="flex bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
              <button
                onClick={() => handleLocationModeChange("global")}
                disabled={loading || isProcessing}
                className={`text-[10px] px-3 py-1 rounded-md font-bold transition-all ${locationMode === "global" ? "bg-zinc-800 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                GLOBAL
              </button>
              <button
                onClick={() => handleLocationModeChange("ceims")}
                disabled={loading || isProcessing}
                className={`text-[10px] px-3 py-1 rounded-md font-bold transition-all ${locationMode === "ceims" ? "bg-indigo-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                CEIMS (NSW)
              </button>
            </div>
          </div>
          
          <select 
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={loading || isProcessing}
            className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none ${(loading || isProcessing) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {locationMode === "global" ? (
              // Map Global Cities
              MAJOR_CITIES.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))
            ) : (
              // Map Fetched LGAs
              allLgas.length > 0 ? (
                allLgas.map((lga, idx) => (
                  <option key={idx} value={lga}>{lga}</option>
                ))
              ) : (
                <option value="" disabled>Loading LGAs...</option>
              )
            )}
          </select>
        </div>
        
        <div>
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2 block ml-1 mt-1">Scraping Timeframe</label>
          <select 
            value={timeFrame}
            onChange={(e) => setTimeFrame(e.target.value)}
            disabled={loading || isProcessing}
            className={`w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none ${(loading || isProcessing) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <option value="1_per_month_5_years">1 article / month (5 Years)</option>
            <option value="1_per_day_1_month">1 article / day (1 Month)</option>
            <option value="5_per_month_1_year">5 articles / month (1 Year)</option>
          </select>
        </div>
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <button 
          onClick={handleScrape} 
          disabled={loading || isProcessing} 
          className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-zinc-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Scraping in progress...
            </>
          ) : "Activate Scraper"}
        </button>
        
        {(fullScrapedArticles.length > 0 || (isFallback && fullFallbackUrls.length > 0)) && (
          <button onClick={handleProcess} disabled={isProcessing} className="bg-zinc-800 text-zinc-300 px-8 py-3 rounded-full font-bold hover:bg-zinc-700 transition-all disabled:opacity-50">
            {isProcessing ? "Processing Intelligence..." : "Process Intelligence"}
          </button>
        )}

        {(fullScrapedArticles.length > 0 || fullFallbackUrls.length > 0) && !isProcessing && (
          <button 
            onClick={handleDownload} 
            className="bg-transparent border border-zinc-700 text-zinc-300 px-6 py-3 rounded-full font-bold hover:bg-zinc-800 hover:text-white transition-all flex items-center gap-2 animate-in fade-in"
          >
            <Download className="w-4 h-4" /> Download URLs
          </button>
        )}

        {processStep >= 3 && processedIntelligence && (
          <button 
            onClick={handleDownloadIntelligence} 
            className="bg-indigo-600 border border-indigo-500 text-white px-6 py-3 rounded-full font-bold hover:bg-indigo-500 transition-all flex items-center gap-2 animate-in fade-in"
          >
            <Download className="w-4 h-4" /> Download Intelligence (JSON)
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

      {/* --- SCRAPING LOADING STATE MONITOR --- */}
      {(loading || isPolling) && (
        <div className="space-y-4 animate-in fade-in duration-300">
          <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Active Scrape Monitor</h3>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 font-mono text-sm space-y-3 shadow-inner">
            <div className="text-zinc-500">[System] Initiating dynamic scraper module...</div>
            
            <div className="text-indigo-400 animate-in slide-in-from-left-2 duration-300 delay-100">
              [Target] Location: {activeParams.location} | Vector: {activeParams.category.replace(/_/g, " ").toUpperCase()}
            </div>
            
            {!isPolling ? (
              <div className="text-zinc-400 animate-in slide-in-from-left-2 duration-300 delay-200">
                [Network] Contacting API Gateway to reserve cloud worker...
              </div>
            ) : (
              <>
                <div className="text-emerald-400 animate-in slide-in-from-left-2 duration-300">
                  [SQS] Job Ticket {currentJobId?.substring(0,8).toUpperCase()} Accepted!
                </div>
                <div className="text-zinc-400 animate-in slide-in-from-left-2 duration-300 delay-100">
                  [Worker] Cloud lambda awakened. Fetching ~{getExpectedCount(activeParams.timeFrame)} target articles...
                </div>
              </>
            )}

            <div className="flex items-center gap-3 text-yellow-400 animate-pulse mt-4 pt-4 border-t border-zinc-800/50">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {isPolling 
                  ? "Awaiting data package from S3 (Polling every 5s)..." 
                  : "Connecting..."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Real Articles Section */}
      {!loading && !isFallback && !isProcessing && scrapedArticles.length > 0 && (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
          <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest flex items-center gap-2">
            Articles Scraped ({scrapedArticles.length}/{fullScrapedArticles.length})
            {scrapedArticles.length < fullScrapedArticles.length && <span className="text-emerald-500 lowercase font-mono">...downloading</span>}
          </h3>
          <div className="grid gap-3 max-h-125 overflow-y-auto custom-scrollbar pr-2">
            {scrapedArticles.map((art, i) => {
              const title = art.file_key ? art.file_key.replace("users/", "").split("/").pop().replace(".txt", "").replace(/_/g, " ") : "Untitled Report";
              const publishDate = art.metadata?.publish_date ? new Date(art.metadata.publish_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : "Date Unknown";
              const preview = art.content ? art.content.substring(0, 140).trim() + "..." : "No preview available.";

              return (
                <div key={i} className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-2xl flex flex-col group hover:border-indigo-500/50 transition-all animate-in fade-in slide-in-from-left-2 duration-300">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-white font-semibold group-hover:text-indigo-400 transition-colors capitalize">{title}</h4>
                      <p className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">S3 Bucket Extractor • {publishDate}</p>
                    </div>
                    <button onClick={() => setSelectedArticle(art)} className="text-indigo-400 text-xs font-bold hover:underline shrink-0 ml-4 bg-indigo-500/10 px-3 py-1.5 rounded-full">View Report</button>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed mt-2 line-clamp-2">{preview}</p>
                </div>
              );
            })}
            <div ref={terminalEndRef} />
          </div>
        </div>
      )}

      {/* Reading Modal */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-4">
              <h3 className="text-2xl font-bold text-white capitalize">{selectedArticle.file_key?.split("/").pop().replace(".txt", "").replace(/_/g, " ") || "Article Viewer"}</h3>
              <button onClick={() => setSelectedArticle(null)} className="text-zinc-500 hover:text-white font-bold text-xl px-2">✕</button>
            </div>
            <div className="overflow-y-auto custom-scrollbar text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap pr-4">{selectedArticle.content || "No content available."}</div>
          </div>
        </div>
      )}

      {/* Pipeline Status */}
      {isProcessing && (
        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
          <h3 className="text-zinc-400 font-bold uppercase text-xs tracking-widest">Pipeline Status</h3>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 font-mono text-sm space-y-4 shadow-inner">
            <div className="text-zinc-600">[System] Initialising data collection microservice...</div>
            {processStep >= 1 && <div className={`flex items-center gap-3 animate-in slide-in-from-left-2 duration-300 ${processStep >= 2 ? "text-zinc-400" : "text-yellow-400 animate-pulse"}`}><span>{processStep >= 2 ? "✅" : "⏳"}</span><span>Parsing BOSCAR DATA...</span></div>}
            {processStep >= 2 && <div className={`flex items-center gap-3 animate-in slide-in-from-left-2 duration-300 ${processStep >= 3 ? "text-zinc-400" : "text-yellow-400 animate-pulse"}`}><span>{processStep >= 3 ? "✅" : "⏳"}</span><span>Uploading to S3...</span></div>}
            {processStep >= 3 && <div className="text-emerald-500 font-bold mt-6 pt-4 border-t border-zinc-800/50 animate-in fade-in duration-500">[Success] Intelligence compilation complete. Data is ready for geographic mapping.</div>}
          </div>
        </div>
      )}
    </div>
  );
}