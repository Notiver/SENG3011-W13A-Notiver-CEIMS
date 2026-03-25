"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { MOCK_CHART_DATA } from "@/lib/mockData";
import { api } from "@/lib/api";

interface RankingItem {
  lga: string;
  score: number;
  trend: string;
}

export default function RankingTab() {
  const [rankingData, setRankingData] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRankingData = async () => {
      try {
        console.log("1. Requesting LGAs from API...");
        const response = await api.getAllLgas();
        console.log("2. LGA Response received:", response);
        
        const lgas = response.lgas || [];
        if (lgas.length === 0) {
           console.warn("API returned empty LGA list!");
        }

        const statsPromises = lgas.map(async (lga: string) => {
          try {
            const stats = await api.getLgaStats(lga);
            const yearly = await api.getLgaYearlyStats(lga).catch(() => null);
            
            let trend = "stable";
            
            if (yearly && yearly.length >= 2) {
              const sortedYears = yearly.sort((a: any, b: any) => b.year - a.year);
              const latestTotal = sortedYears[0].total;
              const previousTotal = sortedYears[1].total;
              
              if (latestTotal > previousTotal) trend = "up";
              else if (latestTotal < previousTotal) trend = "down";
            }

            return {
              lga: stats.lga,
              score: Math.round(stats.statistical_score || 0), 
              trend: trend, 
            };
          } catch (e) {
            console.warn(`Failed to fetch data for ${lga}:`, e);
            return null;
          }
        });
        
        const results = await Promise.all(statsPromises);
        
        const formattedData = results
          .filter((item) => item !== null)
          .sort((a: any, b: any) => b.score - a.score) as RankingItem[];

        console.log("3. Final Formatted Data ready for table:", formattedData);
        setRankingData(formattedData);

      } catch (error) {
        console.error("FATAL ERROR loading ranking data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRankingData();
  }, []);

  if (loading) return <div className="p-8 text-emerald-400 font-mono animate-pulse">Fetching and compiling live threat data...</div>;

  return (
    <div className="max-w-5xl space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-4xl font-extrabold text-white">LGA Threat Ranking</h1>
      </header>

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
        <div className="h-100 w-full"> 
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

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
        <table className="w-full text-left">
          <thead className="bg-zinc-900/80 text-zinc-500 text-[10px] uppercase font-bold tracking-widest border-b border-zinc-800">
            <tr>
              <th className="p-6">LGA Name</th>
              <th className="p-6">Risk Score (Statistical)</th>
              <th className="p-6 text-right">Yearly Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rankingData.map((item, i) => {
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
  );
}