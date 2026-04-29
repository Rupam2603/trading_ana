"use client";

import React, { useEffect, useRef, useState, memo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Cpu, 
  Layers, 
  Terminal as TerminalIcon,
  Search,
  Settings,
  Bell,
  BarChart3,
  Gauge
} from 'lucide-react';

// --- Constants & Mapping ---
const TICKERS = [
  "BTCUSD", "ETHUSD", "SOLUSD", 
  "TSLA", "NVDA", "AAPL", "MSFT", "AMZN",
  "XAUUSD", "SILVER", "USOIL",
  "EURUSD", "GBPUSD", "USDJPY",
  "SPX", "IXIC", "DJI",
  "NIFTY", "BANKNIFTY"
];

const TV_SYMBOL_MAP: Record<string, string> = {
  "BTCUSD": "BINANCE:BTCUSDT",
  "ETHUSD": "BINANCE:ETHUSDT",
  "SOLUSD": "BINANCE:SOLUSDT",
  "TSLA": "NASDAQ:TSLA",
  "NVDA": "NASDAQ:NVDA",
  "AAPL": "NASDAQ:AAPL",
  "MSFT": "NASDAQ:MSFT",
  "AMZN": "NASDAQ:AMZN",
  "XAUUSD": "TVC:GOLD",
  "SILVER": "TVC:SILVER",
  "USOIL": "TVC:USOIL",
  "EURUSD": "FX:EURUSD",
  "GBPUSD": "FX:GBPUSD",
  "USDJPY": "FX:USDJPY",
  "SPX": "TVC:SPX",
  "IXIC": "TVC:IXIC",
  "DJI": "TVC:DJI",
  "NIFTY": "NSE:NIFTY",
  "BANKNIFTY": "NSE:BANKNIFTY"
};

// --- TradingView Chart Component ---
const TradingViewChart = memo(({ symbol, height }: { symbol: string, height: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartId = `tv-chart-${symbol.replace(/[:.]/g, '-')}`;

  useEffect(() => {
    let isMounted = true;

    const initWidget = () => {
      if (isMounted && containerRef.current && (window as any).TradingView) {
        new (window as any).TradingView.widget({
          "autosize": true,
          "symbol": symbol,
          "interval": "1",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#f1f3f6",
          "enable_publishing": false,
          "hide_top_toolbar": false,
          "save_image": false,
          "container_id": chartId,
          "backgroundColor": "rgba(0, 0, 0, 1)",
          "gridColor": "rgba(24, 24, 27, 1)",
          "width": "100%",
          "height": "100%",
          "hide_side_toolbar": false,
          "allow_symbol_change": true,
          "details": true,
          "hotlist": true,
          "calendar": true,
          "stocktools": true,
          "show_popup_button": true,
          "popup_width": "1000",
          "popup_height": "650"
        });
      }
    };

    if (!(window as any).TradingView) {
      const script = document.createElement("script");
      script.src = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      initWidget();
    }

    return () => {
      isMounted = false;
    };
  }, [symbol, chartId]);

  return (
    <div style={{ height: `${height}px` }} className="w-full bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      <div id={chartId} ref={containerRef} className="w-full h-full" />
    </div>
  );
});

TradingViewChart.displayName = 'TradingViewChart';

// --- TradingView Technical Analysis Component ---
const TechnicalAnalysis = memo(({ symbol }: { symbol: string }) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';
    
    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    
    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetContainer.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      "interval": "1m",
      "width": "100%",
      "isTransparent": true,
      "height": 380,
      "symbol": symbol,
      "showIntervalTabs": true,
      "displayMode": "single",
      "locale": "en",
      "colorTheme": "dark"
    });
    
    widgetContainer.appendChild(script);
    container.current.appendChild(widgetContainer);
  }, [symbol]);

  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 overflow-hidden h-[450px]">
      <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase mb-4">
        <Gauge size={14} />
        <span>Market Sentiment (TradingView)</span>
      </div>
      <div ref={container} className="w-full" />
    </div>
  );
});

TechnicalAnalysis.displayName = 'TechnicalAnalysis';

const Dashboard = () => {
  const [selectedTicker, setSelectedTicker] = useState("BTCUSD");
  const [liveData, setLiveData] = useState<any>({
    price: 0,
    signal: "HOLD",
    confidence: 0,
    stop_loss: 0,
    target_price: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  
  // --- Responsive & Resizing State ---
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [chartHeight, setChartHeight] = useState(600);
  const [isMobile, setIsMobile] = useState(false);
  const isResizingW = useRef(false);
  const isResizingH = useRef(false);

  const startResizingW = () => { isResizingW.current = true; document.body.style.cursor = 'col-resize'; };
  const startResizingH = () => { isResizingH.current = true; document.body.style.cursor = 'row-resize'; };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingW.current) {
        const newWidth = Math.max(160, Math.min(450, e.clientX - 16));
        setSidebarWidth(newWidth);
      }
      if (isResizingH.current) {
        setChartHeight(prev => Math.max(400, Math.min(1200, prev + e.movementY)));
      }
    };

    const handleMouseUp = () => {
      isResizingW.current = false;
      isResizingH.current = false;
      document.body.style.cursor = 'default';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  // --- WebSocket Connection ---
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/signals");
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.ticker === selectedTicker) {
        setLiveData(data);
        if (data.signal !== "HOLD") {
          addLog(`${data.signal === 'BUY' ? 'SIGNAL_BUY' : 'SIGNAL_SELL'}: Confidence ${(data.confidence * 100).toFixed(1)}%`);
        }
      }
    };

    addLog(`System connected to WebSocket feed for ${selectedTicker}`);
    return () => ws.close();
  }, [selectedTicker]);

  return (
    <div className="min-h-screen bg-black text-white font-mono p-2 md:p-4 select-none overflow-x-hidden">
      <style jsx global>{`
        :root {
          --sidebar-width: ${isMobile ? '100%' : `${sidebarWidth}px`};
        }
      `}</style>
      
      {/* Header / Nav */}
      <header className="flex flex-col md:flex-row items-center justify-between border-b border-zinc-800 pb-4 mb-4 gap-4 md:gap-0">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            <Cpu size={24} className="text-white" />
          </div>
          <h1 className="text-lg md:text-xl font-bold tracking-tighter uppercase">
            OMNITRADE AI <span className="text-blue-500 text-[10px] md:text-sm ml-1">v2.5 (TV Core)</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-4 md:gap-6 text-zinc-400 w-full md:w-auto justify-between md:justify-end">
          <div className="flex gap-2 items-center bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800 flex-1 md:flex-none max-w-[200px]">
            <Search size={14} />
            <input className="bg-transparent border-none outline-none text-xs w-full" placeholder="Search..." />
          </div>
          <div className="flex items-center gap-4">
            <Bell size={18} className="hover:text-white cursor-pointer" />
            <Settings size={18} className="hover:text-white cursor-pointer" />
          </div>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 items-start h-auto md:h-[calc(100vh-140px)]">
        {/* Sidebar - Ticker Selection */}
        <aside 
          style={{ width: 'var(--sidebar-width)' }} 
          className="flex-shrink-0 flex flex-col gap-4 overflow-hidden"
        >
          <div className="space-y-2">
            <div className="text-[9px] text-zinc-500 uppercase tracking-widest px-2">Instruments</div>
            <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto scrollbar-hide pb-2 md:pb-0 px-1">
              {TICKERS.map(ticker => (
                <button
                  key={ticker}
                  onClick={() => setSelectedTicker(ticker)}
                  className={`flex-shrink-0 md:flex-shrink text-left px-3 py-2 rounded-md border transition-all ${
                    selectedTicker === ticker 
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-400' 
                    : 'bg-zinc-900/30 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-xs font-bold">{ticker}</span>
                    {selectedTicker === ticker && <Activity size={10} className="text-blue-500 animate-pulse" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
          
          {!isMobile && (
            <div className="flex-1 overflow-hidden">
               <TechnicalAnalysis symbol={TV_SYMBOL_MAP[selectedTicker]} />
            </div>
          )}
        </aside>

        {/* Vertical Resizer (Desktop Only) */}
        {!isMobile && (
          <div 
            onMouseDown={startResizingW}
            className="w-1 h-full hover:bg-blue-600/50 cursor-col-resize rounded-full transition-colors active:bg-blue-500 flex-shrink-0"
          />
        )}

        {/* Main Content Area */}
        <main className="flex-1 w-full min-w-0 h-full space-y-6 md:overflow-y-auto scrollbar-hide pb-10 md:pb-0">
          {/* Real-time Stats Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl backdrop-blur-sm shadow-lg">
              <div className="text-zinc-500 text-[10px] uppercase flex justify-between items-center">
                <span>Live Price</span>
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              </div>
              <div className="text-lg md:text-xl font-bold mt-1 tabular-nums truncate tracking-tight">
                {liveData.price > 0 ? liveData.price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "---"}
              </div>
            </div>
            
            <div className={`bg-zinc-900/40 border p-4 rounded-xl transition-all duration-500 backdrop-blur-sm shadow-lg ${
              liveData.signal === 'BUY' ? 'border-green-500/30 shadow-[inset_0_0_20px_rgba(34,197,94,0.05)]' : 
              liveData.signal === 'SELL' ? 'border-red-500/30 shadow-[inset_0_0_20px_rgba(239,68,68,0.05)]' : 'border-zinc-800/50'
            }`}>
              <div className="text-zinc-500 text-[10px] uppercase">AI Prediction</div>
              <div className={`text-lg md:text-xl font-bold mt-1 flex items-center gap-2 ${
                liveData.signal === 'BUY' ? 'text-green-500' : 
                liveData.signal === 'SELL' ? 'text-red-500' : 'text-zinc-400'
              }`}>
                {liveData.signal}
              </div>
            </div>

            <div className={`bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl backdrop-blur-sm transition-opacity shadow-lg ${liveData.stop_loss > 0 ? 'opacity-100' : 'opacity-40'}`}>
              <div className="text-red-500/70 text-[10px] uppercase flex items-center gap-1.5">
                 <div className="w-1 h-1 rounded-full bg-red-500" />
                 Stop Loss
              </div>
              <div className="text-lg md:text-xl font-bold mt-1 text-red-400 tabular-nums truncate">
                {liveData.stop_loss > 0 ? liveData.stop_loss.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "---"}
              </div>
            </div>

            <div className={`bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl backdrop-blur-sm transition-opacity shadow-lg ${liveData.target_price > 0 ? 'opacity-100' : 'opacity-40'}`}>
              <div className="text-green-500/70 text-[10px] uppercase flex items-center gap-1.5">
                 <div className="w-1 h-1 rounded-full bg-green-500" />
                 Target TP
              </div>
              <div className="text-lg md:text-xl font-bold mt-1 text-green-400 tabular-nums truncate">
                {liveData.target_price > 0 ? liveData.target_price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "---"}
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl backdrop-blur-sm shadow-lg col-span-2 lg:col-span-1">
              <div className="flex justify-between items-center mb-2">
                <div className="text-zinc-500 text-[10px] uppercase">AI Confidence</div>
                <div className="text-blue-500 text-xs font-bold tabular-nums">{(liveData.confidence * 100).toFixed(0)}%</div>
              </div>
              <div className="w-full bg-zinc-800/50 h-1 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-1000 ease-out" 
                  style={{ width: `${liveData.confidence * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Chart Section */}
          <div className="relative group rounded-xl overflow-hidden shadow-2xl border border-zinc-800/50 bg-zinc-950">
            
            <div 
              style={{ height: isMobile ? '450px' : `${chartHeight}px` }} 
              className="w-full transition-[height] duration-300"
            >
              <TradingViewChart 
                symbol={TV_SYMBOL_MAP[selectedTicker]} 
                height={isMobile ? 450 : chartHeight} 
              />
            </div>
            
            {/* Horizontal Resizer (Desktop Only) */}
            {!isMobile && (
              <div 
                onMouseDown={startResizingH}
                className="h-1.5 w-full hover:bg-blue-600/50 cursor-row-resize mt-2 rounded-full transition-colors active:bg-blue-500 absolute bottom-0 left-0 z-20"
              />
            )}
          </div>

          {/* Technical Analysis (Mobile/Tablet Only) */}
          {isMobile && (
            <div className="block">
               <TechnicalAnalysis symbol={TV_SYMBOL_MAP[selectedTicker]} />
            </div>
          )}

          {/* Terminal / Logs */}
          <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-4 backdrop-blur-sm shadow-lg mb-10">
            <div className="flex items-center justify-between text-zinc-600 text-[9px] uppercase mb-4 tracking-widest border-b border-zinc-800/50 pb-2">
              <div className="flex items-center gap-2">
                <TerminalIcon size={12} />
                <span>AI Intelligence Stream</span>
              </div>
              <div className="flex items-center gap-1.5 text-blue-500/60 font-bold">
                <span>ACTIVE_LINK</span>
                <div className="w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.5)]" />
              </div>
            </div>
            <div className="space-y-1.5 text-[10px] md:text-[11px] h-32 overflow-y-auto scrollbar-hide flex flex-col-reverse px-1">
              {logs.map((log, i) => (
                <div key={i} className="text-zinc-500 animate-in fade-in slide-in-from-bottom-1 duration-500 border-l border-zinc-800/50 pl-3 ml-1">
                  <span className="text-blue-900/40 mr-2 tabular-nums font-bold">{log.split(' ')[0]}</span>
                  <span className={log.includes('BUY') ? 'text-green-500/70 font-bold' : log.includes('SELL') ? 'text-red-500/70 font-bold' : 'text-zinc-500'}>
                    {log.substring(log.indexOf(' '))}
                  </span>
                </div>
              ))}
              {logs.length === 0 && <div className="text-zinc-700 italic pl-3">Initializing market neural net...</div>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
