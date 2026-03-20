interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, onLogout }: SidebarProps) {
  return (
    <aside className="w-full md:w-64 border-r border-zinc-800 bg-zinc-950/50 p-6 flex flex-col">
      <div className="mb-10">
        <h2 className="text-xl font-bold text-white tracking-tight italic">NOTIVER</h2>
        <span className="text-[8px] text-indigo-400 font-bold uppercase tracking-tighter block">
          CRIME EVENT INTELLIGENCE MICROSERVICE SUITE
        </span>
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
        <button 
          onClick={onLogout} 
          className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-2 transition-colors"
        >
          <span>⏻</span> Sign Out Terminal
        </button>
      </div>
    </aside>
  );
}