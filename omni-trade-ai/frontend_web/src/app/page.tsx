"use client";

import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { createChart, ColorType, ISeriesApi, UTCTimestamp, CandlestickSeries, AreaSeries, createSeriesMarkers } from 'lightweight-charts';
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
  Gauge,
  MapPin,
  X
} from 'lucide-react';
import { 
  UserButton, 
  SignInButton, 
  useAuth
} from "@clerk/nextjs";

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

// --- Advanced Lightweight Chart Component ---
const LightweightChart = memo(({ 
  symbol, 
  height, 
  timeframe, 
  livePrice, 
  signal, 
  markers,
  onMarkerAdd
}: { 
  symbol: string, 
  height: number, 
  timeframe: string, 
  livePrice: number,
  signal: string,
  markers: any[],
  onMarkerAdd: (marker: any) => void
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const lastSignalRef = useRef<string>("HOLD");

  // Fetch Historical Data
  const fetchHistory = useCallback(async (s: string, t: string) => {
    try {
      const cleanSymbol = s.includes(':') ? s.split(':')[1] : s;
      const intervalMap: Record<string, string> = {
        "1": "1m", "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1d"
      };
      const interval = intervalMap[t] || t;
      
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${cleanSymbol}&interval=${interval}&limit=500`);
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      
      return data.map((d: any) => ({
        time: d[0] / 1000 as UTCTimestamp,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        value: parseFloat(d[4]), // for area series fallback
      }));
    } catch (error) {
      console.error("Failed to fetch history:", error);
      return [];
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { color: '#000000' },
          textColor: '#d1d5db',
        },
        grid: {
          vertLines: { color: '#1f2937' },
          horzLines: { color: '#1f2937' },
        },
        width: chartContainerRef.current.clientWidth || 800,
        height: height,
        timeScale: {
          borderColor: '#374151',
          timeVisible: true,
        },
      });

      if (!chart) return;

      // Use addSeries for v5 compliance with PascalCase
      let series: any;
      try {
        series = chart.addSeries(CandlestickSeries, {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderVisible: false,
          wickUpColor: '#22c55e',
          wickDownColor: '#ef4444',
        });
      } catch (e) {
        // Fallback for different environments/versions
        series = chart.addSeries(AreaSeries, {
          lineColor: '#3b82f6',
          topColor: 'rgba(59, 130, 246, 0.4)',
          bottomColor: 'rgba(59, 130, 246, 0.0)',
        });
      }

      candleSeriesRef.current = series;
      chartRef.current = chart;

      // Load History
      fetchHistory(symbol, timeframe).then(data => {
        if (data.length > 0) {
          series.setData(data);
        }
      });

      const handleResize = () => {
        chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (markersRef.current) markersRef.current.detach();
        chart.remove();
      };
    } catch (err) {
      console.error("Chart Error:", err);
    }
  }, [symbol, timeframe, height, fetchHistory]);

  // Update real-time price
  useEffect(() => {
    if (candleSeriesRef.current && livePrice > 0) {
      const timestamp = Math.floor(Date.now() / 1000) as UTCTimestamp;
      candleSeriesRef.current.update({
        time: timestamp,
        open: livePrice,
        high: livePrice,
        low: livePrice,
        close: livePrice,
        value: livePrice, // for area series fallback
      });
    }
  }, [livePrice]);

  // Handle Signal Markers
  useEffect(() => {
    if (signal !== "HOLD" && signal !== lastSignalRef.current && livePrice > 0) {
      const timestamp = Math.floor(Date.now() / 1000) as UTCTimestamp;
      const newMarker = {
        time: timestamp,
        position: signal === "BUY" ? "belowBar" : "aboveBar",
        color: signal === "BUY" ? "#22c55e" : "#ef4444",
        shape: signal === "BUY" ? "arrowUp" : "arrowDown",
        text: signal,
        size: 2
      };
      onMarkerAdd(newMarker);
      lastSignalRef.current = signal;
    }
  }, [signal, livePrice, onMarkerAdd]);

  // Apply all markers (v5 uses plugin)
  useEffect(() => {
    if (candleSeriesRef.current && markers.length > 0) {
      if (!markersRef.current) {
        markersRef.current = createSeriesMarkers(candleSeriesRef.current, markers);
      } else {
        markersRef.current.setMarkers(markers);
      }
    }
  }, [markers]);

  return (
    <div style={{ height: `${height}px` }} className="w-full bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      <div ref={chartContainerRef} className="w-full h-full" />
    </div>
  );
});

LightweightChart.displayName = 'LightweightChart';

// --- TradingView Technical Analysis Component ---
const TechnicalAnalysis = memo(({ symbol, scalpingMode }: { symbol: string, scalpingMode: boolean }) => {
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
      "interval": scalpingMode ? "1m" : "15m",
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
  }, [symbol, scalpingMode]);

  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 overflow-hidden h-[450px]">
      <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase mb-4">
        <Gauge size={14} />
        <span>Market Sentiment {scalpingMode ? '(Scalping)' : '(Standard)'}</span>
      </div>
      <div ref={container} className="w-full" />
    </div>
  );
});

TechnicalAnalysis.displayName = 'TechnicalAnalysis';

const Dashboard = () => {
  const { isSignedIn, isLoaded } = useAuth();
  const [selectedTicker, setSelectedTicker] = useState("BTCUSD");
  const [scalpingMode, setScalpingMode] = useState(true);
  const [timeframe, setTimeframe] = useState("1"); // 1m default for scalping
  const [markers, setMarkers] = useState<any[]>([]);
  const [location, setLocation] = useState<string>("Locating...");
  const [liveData, setLiveData] = useState<any>({
    price: 0,
    entry_price: 0,
    signal: "HOLD",
    confidence: 0,
    stop_loss: 0,
    target_price: 0,
    metrics: { fvg: "NONE", kernel: 0, atr: 0 },
    reasoning: "Market analyzing..."
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    soundEnabled: true,
    autoExecution: false,
    theme: 'dark',
    refreshRate: 5000
  });

  const handleAddMarker = useCallback((marker: any) => {
    setMarkers(prev => {
      // Avoid duplicate markers for the same timestamp/signal
      const last = prev[prev.length - 1];
      if (last && last.text === marker.text && Math.abs(last.time - marker.time) < 60) {
        return prev;
      }
      return [...prev, marker];
    });
  }, []);

  const addNotification = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const newNotif = { id: Date.now(), title, message, type, time: new Date().toLocaleTimeString() };
    setNotifications(prev => [newNotif, ...prev].slice(0, 5));
  };

  useEffect(() => {
    if (liveData.confidence > 0.85 && (liveData.signal === 'BUY' || liveData.signal === 'SELL')) {
      addNotification(
        `High Confidence ${liveData.signal}`,
        `${selectedTicker} signal detected at ${liveData.price}. Confidence: ${(liveData.confidence * 100).toFixed(0)}%`,
        liveData.signal === 'BUY' ? 'success' : 'error'
      );
    }
  }, [liveData.signal, liveData.confidence, selectedTicker]);
  
  // --- Geolocation Logic ---
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
            const data = await res.json();
            setLocation(`${data.city || data.locality}, ${data.countryCode}`);
          } catch {
            setLocation(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
          }
        },
        () => setLocation("Access Denied")
      );
    } else {
      setLocation("Not Supported");
    }
  }, []);

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
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/signals";
    const ws = new WebSocket(wsUrl);
    
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

  const getAtrLevel = (atr: number, price: number) => {
    const rel = (atr / price) * 1000;
    if (rel < 0.5) return { label: "LOW", color: "text-blue-400" };
    if (rel < 1.5) return { label: "MID", color: "text-orange-400" };
    return { label: "HIGH", color: "text-red-400" };
  };

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
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tighter uppercase">
              OMNITRADE AI <span className="text-blue-500 text-[10px] md:text-sm ml-1">v2.5</span>
            </h1>
            <div className="flex items-center gap-2">
               <div className={`w-1.5 h-1.5 rounded-full ${scalpingMode ? 'bg-orange-500 animate-pulse' : 'bg-green-500'}`} />
               <span className="text-[10px] text-zinc-500 font-bold tracking-widest">{scalpingMode ? 'SCALPING_MODE_ACTIVE' : 'STANDARD_ANALYSIS'}</span>
            </div>
          </div>
        </div>
        
          <div className="flex items-center gap-4 md:gap-6 text-zinc-400 w-full md:w-auto justify-between md:justify-end">
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] font-bold text-zinc-500">
               <MapPin size={12} className="text-blue-500" />
               <span className="truncate max-w-[100px]">{location}</span>
            </div>

            <div className="flex items-center gap-3 bg-zinc-900/50 px-4 py-2 rounded-lg border border-zinc-800">
              <span className={`text-[10px] font-bold ${scalpingMode ? 'text-orange-400' : 'text-zinc-500'}`}>SCALPING</span>
              <button 
                onClick={() => setScalpingMode(!scalpingMode)}
                className={`w-10 h-5 rounded-full relative transition-colors duration-300 ${scalpingMode ? 'bg-orange-600' : 'bg-zinc-700'}`}
              >
                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all duration-300 ${scalpingMode ? 'left-6' : 'left-1'}`} />
              </button>
            </div>

            <div className="flex items-center gap-4">
              {isLoaded && isSignedIn ? (
                <UserButton afterSignOutUrl="/" />
              ) : (
                <SignInButton mode="modal">
                  <button className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md transition-colors">
                    SIGN IN
                  </button>
                </SignInButton>
              )}
              <div className="relative group">
                <Bell 
                  size={18} 
                  className={`hover:text-white cursor-pointer hidden md:block transition-colors ${showNotifications ? 'text-white' : ''}`} 
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                    setShowSettings(false);
                  }}
                />
                {notifications.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-black animate-pulse" />
                )}
              </div>
              <Settings 
                size={18} 
                className={`hover:text-white cursor-pointer hidden md:block transition-colors ${showSettings ? 'text-white' : ''}`} 
                onClick={() => {
                  setShowSettings(!showSettings);
                  setShowNotifications(false);
                }}
              />
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
          
          <div className="bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl">
             <div className="text-zinc-500 text-[10px] uppercase mb-2 flex items-center gap-2">
                <MapPin size={12} className="text-blue-500" />
                User Tracking
             </div>
             <div className="space-y-3">
               <div className="text-[11px] text-zinc-300 leading-relaxed italic">
                  {location === "Locating..." ? 
                    "Attempting to establish geolocation via browser API..." :
                    `Current Hub: ${location}. Local market node latency synchronized.`
                  }
               </div>
               <div className="flex items-center gap-4 text-[9px] font-bold">
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <div className={`w-1 h-1 rounded-full ${location !== "Locating..." && location !== "Access Denied" ? 'bg-green-500' : 'bg-red-500'}`} />
                    GEO_LOCKED
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <div className="w-1 h-1 rounded-full bg-blue-500" />
                    IP_SHIELD_ON
                  </div>
               </div>
             </div>
          </div>

          <div className="bg-gradient-to-b from-zinc-900/40 to-black border border-zinc-800/50 p-4 rounded-xl">
             <div className="text-zinc-500 text-[10px] uppercase mb-3 flex items-center gap-2 font-bold tracking-wider">
                <TerminalIcon size={12} className="text-orange-500" />
                Strategy Intelligence
             </div>
             <div className="space-y-3">
                <div className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-800/50">
                  <span className="text-[9px] text-zinc-500">STRUCTURE</span>
                  <span className="text-[10px] font-bold text-blue-400">CHoCH / BOS</span>
                </div>
                <div className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-800/50">
                  <span className="text-[9px] text-zinc-500">CISD_STATE</span>
                  <span className={`text-[10px] font-bold ${liveData.metrics?.fvg !== 'NONE' ? 'text-orange-400' : 'text-zinc-500'}`}>
                    {liveData.metrics?.fvg !== 'NONE' ? 'IMBALANCE_DET' : 'BALANCED'}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-black/40 p-2 rounded border border-zinc-800/50">
                  <span className="text-[9px] text-zinc-500">VOL_FILTER</span>
                  <span className="text-[10px] font-bold text-green-400">OPTIMAL</span>
                </div>
             </div>
          </div>

          {!isMobile && (
            <div className="flex-1 overflow-hidden">
               <TechnicalAnalysis symbol={TV_SYMBOL_MAP[selectedTicker]} scalpingMode={scalpingMode} />
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

            <div className="bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl backdrop-blur-sm shadow-lg">
              <div className="text-blue-500/70 text-[10px] uppercase flex items-center gap-1.5 font-bold tracking-widest">
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                 Entry Point
              </div>
              <div className="text-lg md:text-xl font-bold mt-1 text-blue-400 tabular-nums truncate">
                {liveData.entry_price > 0 ? liveData.entry_price.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "---"}
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

          {/* AI Narrative / Reasoning (Nemotron 3 Integration) */}
          <div className="bg-gradient-to-r from-blue-600/10 to-transparent border-l-2 border-blue-500 p-4 rounded-r-xl backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-1">
              <Cpu size={16} className="text-blue-500 animate-pulse" />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Nemotron AI Narrative</span>
            </div>
            <div className="text-sm md:text-base font-medium text-zinc-200 italic leading-relaxed">
              "{liveData.reasoning}"
            </div>
          </div>

          {/* SMC Dashboard Metrics (Added from GDrive Analysis) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-zinc-900/60 to-black border border-zinc-800/50 p-4 rounded-xl shadow-xl flex items-center gap-4 relative overflow-hidden group">
               <div className={`p-2 rounded-lg transition-colors ${liveData.metrics?.fvg === 'BULLISH' ? 'bg-green-500/20 text-green-500' : liveData.metrics?.fvg === 'BEARISH' ? 'bg-red-500/20 text-red-500' : 'bg-zinc-800 text-zinc-500'}`}>
                  <Layers size={20} />
               </div>
               <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-bold">Fair Value Gap</div>
                  <div className={`text-sm font-bold ${liveData.metrics?.fvg === 'BULLISH' ? 'text-green-400' : liveData.metrics?.fvg === 'BEARISH' ? 'text-red-400' : 'text-zinc-300'}`}>
                    {liveData.metrics?.fvg || "NONE"}
                  </div>
               </div>
               <div className={`absolute right-4 top-1/2 -translate-y-1/2 opacity-20 ${liveData.metrics?.fvg === 'BULLISH' ? 'text-green-500' : liveData.metrics?.fvg === 'BEARISH' ? 'text-red-500' : 'hidden'}`}>
                  {liveData.metrics?.fvg === 'BULLISH' ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
               </div>
            </div>

            <div className="bg-gradient-to-br from-zinc-900/60 to-black border border-zinc-800/50 p-4 rounded-xl shadow-xl flex items-center gap-4 group">
               <div className="p-2 rounded-lg bg-blue-500/20 text-blue-500 group-hover:bg-blue-500/30 transition-colors">
                  <Activity size={20} />
               </div>
               <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-bold flex items-center gap-1">
                    Kernel Smoothing
                    {liveData.metrics?.kernel > liveData.price ? <TrendingDown size={8} className="text-red-400" /> : <TrendingUp size={8} className="text-green-400" />}
                  </div>
                  <div className="text-sm font-bold text-blue-400 tabular-nums">
                    {liveData.metrics?.kernel ? liveData.metrics.kernel.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "---"}
                  </div>
               </div>
            </div>

            <div className="bg-gradient-to-br from-zinc-900/60 to-black border border-zinc-800/50 p-4 rounded-xl shadow-xl flex items-center gap-4 group">
               <div className="p-2 rounded-lg bg-orange-500/20 text-orange-500 group-hover:bg-orange-500/30 transition-colors">
                  <BarChart3 size={20} />
               </div>
               <div>
                  <div className="text-[10px] text-zinc-500 uppercase font-bold flex justify-between w-full">
                    <span>ATR Volatility</span>
                    <span className={`ml-2 font-black ${getAtrLevel(liveData.metrics?.atr, liveData.price).color}`}>
                      {getAtrLevel(liveData.metrics?.atr, liveData.price).label}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-orange-400 tabular-nums">
                    {liveData.metrics?.atr ? liveData.metrics.atr.toLocaleString(undefined, { minimumFractionDigits: 4 }) : "---"}
                  </div>
               </div>
            </div>
          </div>

          {/* Scalping Checklist (from GDrive Analysis) */}
          <div className="bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl backdrop-blur-sm">
            <div className="text-[10px] text-zinc-500 uppercase font-bold mb-4 flex items-center gap-2">
              <Activity size={14} className="text-orange-500" />
              Scalping Validation Checklist
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: "FVG Alignment", status: liveData.metrics?.fvg !== "NONE", detail: liveData.metrics?.fvg },
                { label: "Kernel Trend", status: (liveData.signal === "BUY" && liveData.price > liveData.metrics?.kernel) || (liveData.signal === "SELL" && liveData.price < liveData.metrics?.kernel), detail: liveData.signal === "BUY" ? "BULLISH" : "BEARISH" },
                { label: "ATR Stability", status: getAtrLevel(liveData.metrics?.atr, liveData.price).label !== "HIGH", detail: getAtrLevel(liveData.metrics?.atr, liveData.price).label },
                { label: "POI Entry", status: liveData.confidence > 0.75, detail: "LIQUIDITY_FOUND" }
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-black/30 border border-zinc-800/30">
                  <span className="text-[9px] text-zinc-400">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-zinc-600">{item.detail}</span>
                    <div className={`w-2 h-2 rounded-full ${item.status ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-zinc-800'}`} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart Section */}
          <div className="relative group rounded-xl overflow-hidden shadow-2xl border border-zinc-800/50 bg-zinc-950">
            
            <div 
              style={{ height: isMobile ? '450px' : `${chartHeight}px` }} 
              className="w-full transition-[height] duration-300"
            >
              {/* Timeframe Selector Overlay */}
              <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-black/80 backdrop-blur-md p-1 rounded-lg border border-zinc-700/50">
                {["1", "5", "15", "60", "240", "D"].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 text-[10px] font-bold rounded transition-colors ${
                      timeframe === tf 
                      ? 'bg-blue-600 text-white' 
                      : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {tf === "60" ? "1H" : tf === "240" ? "4H" : tf === "D" ? "1D" : `${tf}M`}
                  </button>
                ))}
              </div>

              <LightweightChart 
                symbol={TV_SYMBOL_MAP[selectedTicker]} 
                height={isMobile ? 450 : chartHeight} 
                timeframe={timeframe}
                livePrice={liveData.price}
                signal={liveData.signal}
                markers={markers}
                onMarkerAdd={handleAddMarker}
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
               <TechnicalAnalysis symbol={TV_SYMBOL_MAP[selectedTicker]} scalpingMode={scalpingMode} />
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
      {/* Notification Dropdown */}
      {showNotifications && (
        <div className="absolute top-20 right-4 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-4">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-black/20">
            <h3 className="text-xs font-bold uppercase tracking-wider">Alert Center</h3>
            <X size={14} className="cursor-pointer text-zinc-500 hover:text-white" onClick={() => setShowNotifications(false)} />
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-zinc-600 text-xs italic">No active alerts</div>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className="p-4 border-b border-zinc-800/50 hover:bg-white/5 transition-colors group">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold uppercase ${
                      notif.type === 'success' ? 'text-green-500' : 
                      notif.type === 'error' ? 'text-red-500' : 'text-blue-500'
                    }`}>{notif.title}</span>
                    <span className="text-[8px] text-zinc-600">{notif.time}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{notif.message}</p>
                </div>
              ))
            )}
          </div>
          {notifications.length > 0 && (
            <div 
              className="p-3 text-center text-[10px] text-zinc-500 hover:text-white cursor-pointer bg-black/40 border-t border-zinc-800"
              onClick={() => setNotifications([])}
            >
              Clear all notifications
            </div>
          )}
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-black/20">
              <div className="flex items-center gap-2">
                <Settings size={20} className="text-blue-500" />
                <h3 className="text-sm font-bold uppercase tracking-widest">Global Settings</h3>
              </div>
              <X size={20} className="cursor-pointer text-zinc-500 hover:text-white" onClick={() => setShowSettings(false)} />
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-zinc-300">Sound Notifications</div>
                  <div className="text-[10px] text-zinc-600">Play alert on high confidence signals</div>
                </div>
                <button 
                  onClick={() => setSettings({...settings, soundEnabled: !settings.soundEnabled})}
                  className={`w-10 h-5 rounded-full relative transition-colors ${settings.soundEnabled ? 'bg-blue-600' : 'bg-zinc-800'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.soundEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold text-zinc-300">Auto Execution (Paper)</div>
                  <div className="text-[10px] text-zinc-600">Simulate trade on high confidence signals</div>
                </div>
                <button 
                  onClick={() => setSettings({...settings, autoExecution: !settings.autoExecution})}
                  className={`w-10 h-5 rounded-full relative transition-colors ${settings.autoExecution ? 'bg-blue-600' : 'bg-zinc-800'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings.autoExecution ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-zinc-300">Data Refresh Rate (ms)</div>
                <div className="grid grid-cols-4 gap-2">
                  {[1000, 2000, 5000, 10000].map(rate => (
                    <button
                      key={rate}
                      onClick={() => setSettings({...settings, refreshRate: rate})}
                      className={`py-1.5 text-[10px] rounded border transition-all ${
                        settings.refreshRate === rate ? 'bg-blue-600 border-blue-500 text-white' : 'bg-black/20 border-zinc-800 text-zinc-500 hover:border-zinc-600'
                      }`}
                    >
                      {rate/1000}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 bg-black/40 border-t border-zinc-800 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="bg-zinc-100 hover:bg-white text-black text-xs font-bold px-6 py-2 rounded-lg transition-colors"
              >
                SAVE CHANGES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
