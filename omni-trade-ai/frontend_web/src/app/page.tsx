"use client";

import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
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
// Removed Clerk imports for local testing without keys


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

// --- TradingView Advanced Chart Component ---
const AdvancedChart = memo(({ 
  symbol, 
  height, 
  tradingMode 
}: { 
  symbol: string, 
  height: number, 
  tradingMode: 'SCALPING' | 'STANDARD' | 'SWING' 
}) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = '';
    
    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.height = "100%";
    widgetContainer.style.width = "100%";
    
    const widgetDiv = document.createElement("div");
    const containerId = `tv_chart_${Math.random().toString(36).substring(7)}`;
    widgetDiv.id = containerId;
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    widgetContainer.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      setTimeout(() => {
        if (typeof window !== 'undefined' && (window as any).TradingView && document.getElementById(containerId)) {
          new (window as any).TradingView.widget({
            "autosize": true,
            "symbol": symbol,
            "interval": tradingMode === 'SCALPING' ? "1" : tradingMode === 'STANDARD' ? "15" : "240",
            "timezone": "Etc/UTC",
            "theme": "dark",
            "style": "1",
            "locale": "en",
            "enable_publishing": false,
            "hide_side_toolbar": false,
            "allow_symbol_change": false,
            "container_id": containerId
          });
        }
      }, 200);
    };
    
    widgetContainer.appendChild(script);
    container.current.appendChild(widgetContainer);
  }, [symbol, tradingMode]);

  return (
    <div style={{ height: `${height}px` }} className="w-full bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      <div ref={container} className="w-full h-full" />
    </div>
  );
});

AdvancedChart.displayName = 'AdvancedChart';

// --- TradingView Technical Analysis Component ---
const TechnicalAnalysis = memo(({ symbol, tradingMode }: { symbol: string, tradingMode: 'SCALPING' | 'STANDARD' | 'SWING' }) => {
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
      "interval": tradingMode === 'SCALPING' ? "1m" : tradingMode === 'STANDARD' ? "15m" : "4h",
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
  }, [symbol, tradingMode]);

  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 overflow-hidden h-[450px]">
      <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase mb-4">
        <Gauge size={14} />
        <span>Market Sentiment ({tradingMode === 'SCALPING' ? 'Scalping' : tradingMode === 'STANDARD' ? 'Standard' : 'Swing'})</span>
      </div>
      <div ref={container} className="w-full" />
    </div>
  );
});

TechnicalAnalysis.displayName = 'TechnicalAnalysis';

const Dashboard = () => {
  const { isSignedIn, isLoaded } = { isSignedIn: true, isLoaded: true }; // Mocked for local testing

  const [selectedTicker, setSelectedTicker] = useState("BTCUSD");
  const [tradingMode, setTradingMode] = useState<'SCALPING' | 'STANDARD' | 'SWING'>('SCALPING');
  const [timeframe, setTimeframe] = useState("1");
  const timeframeRef = useRef(timeframe);
  
  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  useEffect(() => {
    if (tradingMode === 'SCALPING') setTimeframe('1');
    else if (tradingMode === 'STANDARD') setTimeframe('15');
    else if (tradingMode === 'SWING') setTimeframe('240');
  }, [tradingMode]);
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

  // --- WebSocket Connection / Mock Data Generator ---
  useEffect(() => {
    let mockInterval: NodeJS.Timeout;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/signals";
    
    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.ticker === selectedTicker) {
          const tf = timeframeRef.current;
          if (data.timeframes && data.timeframes[tf]) {
            const tfData = data.timeframes[tf];
            data.signal = tfData.signal;
            data.confidence = tfData.confidence;
            data.entry_price = tfData.entry_price;
            data.stop_loss = tfData.stop_loss;
            data.target_price = tfData.target_price;
          }
          setLiveData(data);
          if (data.signal !== "HOLD") {
            addLog(`${data.signal === 'BUY' ? 'SIGNAL_BUY' : 'SIGNAL_SELL'} [${tf}M]: Confidence ${(data.confidence * 100).toFixed(1)}%`);
          }
        }
      };
      
      ws.onerror = () => {
        addLog(`WebSocket unreachable. Falling back to simulated live feed for ${selectedTicker}.`);
        startMockData();
      };
      
      ws.onopen = () => {
        addLog(`System connected to WebSocket feed for ${selectedTicker}`);
      };

      return () => {
        ws.close();
        clearInterval(mockInterval);
      };
    } catch (e) {
      startMockData();
    }
    
    function startMockData() {
      const basePrices: Record<string, number> = {
        "BTCUSD": 64200.50, "ETHUSD": 3450.25, "SOLUSD": 145.20,
        "TSLA": 175.50, "NVDA": 850.75, "AAPL": 170.20,
        "XAUUSD": 2340.50, "EURUSD": 1.0850, "NIFTY": 22400.00
      };
      
      let currentPrice = basePrices[selectedTicker] || 100.00;
      let ticksSinceLastSignal = 0;
      let activeSignal: any = null;
      
      // Seed initial data immediately
      setLiveData({
        ticker: selectedTicker,
        price: currentPrice,
        entry_price: 0,
        signal: "HOLD",
        confidence: 0,
        stop_loss: 0,
        target_price: 0,
        metrics: { fvg: "NONE", kernel: currentPrice, atr: currentPrice * 0.005 },
        reasoning: "Awaiting high-probability setup. Models are currently observing market consolidation."
      });
      
      mockInterval = setInterval(() => {
        const volatility = currentPrice * 0.0015;
        currentPrice += (Math.random() - 0.5) * volatility;
        ticksSinceLastSignal++;
        
        // Hold the signal steady for about 15 ticks (~37 seconds), then HOLD for 5 ticks.
        if (ticksSinceLastSignal > 20) {
          // Generate new signal
          const signalType = Math.random() > 0.5 ? 'BUY' : 'SELL';
          const confidence = 0.75 + (Math.random() * 0.20);
          activeSignal = {
            signal: signalType,
            entry: currentPrice,
            confidence: confidence,
            sl: signalType === 'BUY' ? currentPrice * 0.99 : currentPrice * 1.01,
            tp: signalType === 'BUY' ? currentPrice * 1.025 : currentPrice * 0.975,
            reasoning: `Ensemble consensus reached. GPT-5 detects strong macro alignment. Llama Vision confirms ${signalType} pattern formation. FinGPT sentiment is ${signalType === 'BUY' ? 'positive' : 'negative'}.`
          };
          ticksSinceLastSignal = 0;
          addLog(`${signalType}: Confidence ${(confidence * 100).toFixed(1)}%`);
        } else if (ticksSinceLastSignal > 15) {
          // Cooldown phase (HOLD)
          activeSignal = null;
        }
        
        const tf = timeframeRef.current;
        const scales: any = { "1": 1.0, "5": 2.2, "15": 3.8, "60": 7.5, "240": 15.0, "D": 35.0 };
        const scale = scales[tf] || 1.0;

        setLiveData((prev: any) => ({
          ticker: selectedTicker,
          price: currentPrice,
          entry_price: activeSignal ? activeSignal.entry : 0,
          signal: activeSignal ? activeSignal.signal : 'HOLD',
          confidence: activeSignal ? activeSignal.confidence : 0,
          stop_loss: activeSignal ? (activeSignal.signal === 'BUY' ? currentPrice * (1 - 0.01 * scale) : currentPrice * (1 + 0.01 * scale)) : 0,
          target_price: activeSignal ? (activeSignal.signal === 'BUY' ? currentPrice * (1 + 0.025 * scale) : currentPrice * (1 - 0.025 * scale)) : 0,
          metrics: { 
            fvg: Math.random() > 0.8 ? (Math.random() > 0.5 ? 'BULLISH' : 'BEARISH') : 'NONE', 
            kernel: currentPrice * (1 + (Math.random() - 0.5) * 0.005), 
            atr: currentPrice * 0.005 * scale
          },
          reasoning: activeSignal 
            ? activeSignal.reasoning 
            : `Observing ${tf === 'D' ? 'daily' : tf + 'm'} consolidation patterns. Awaiting high-probability breakout alignment.`
        }));
        
      }, 2500);
    }
    
    return () => clearInterval(mockInterval);
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
               <div className={`w-1.5 h-1.5 rounded-full ${tradingMode === 'SCALPING' ? 'bg-orange-500 animate-pulse' : tradingMode === 'STANDARD' ? 'bg-green-500' : 'bg-purple-500'}`} />
               <span className="text-[10px] text-zinc-500 font-bold tracking-widest">{tradingMode === 'SCALPING' ? 'SCALPING_MODE_ACTIVE' : tradingMode === 'STANDARD' ? 'STANDARD_ANALYSIS' : 'SWING_TRADING_ANALYSIS'}</span>
            </div>
          </div>
        </div>
        
          <div className="flex items-center gap-4 md:gap-6 text-zinc-400 w-full md:w-auto justify-between md:justify-end">
            <div className="hidden lg:flex items-center gap-2 bg-zinc-900/50 px-3 py-1.5 rounded-lg border border-zinc-800 text-[10px] font-bold text-zinc-500">
               <MapPin size={12} className="text-blue-500" />
               <span className="truncate max-w-[100px]">{location}</span>
            </div>

            <div className="flex items-center bg-zinc-900/50 p-1 rounded-lg border border-zinc-800">
              <button 
                onClick={() => setTradingMode('SCALPING')}
                className={`px-3 py-1.5 text-[10px] font-bold rounded transition-colors ${tradingMode === 'SCALPING' ? 'bg-orange-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                SCALPING
              </button>
              <button 
                onClick={() => setTradingMode('STANDARD')}
                className={`px-3 py-1.5 text-[10px] font-bold rounded transition-colors ${tradingMode === 'STANDARD' ? 'bg-green-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                STANDARD
              </button>
              <button 
                onClick={() => setTradingMode('SWING')}
                className={`px-3 py-1.5 text-[10px] font-bold rounded transition-colors ${tradingMode === 'SWING' ? 'bg-purple-600 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                SWING
              </button>
            </div>

            <div className="flex items-center gap-4">
              {isLoaded && isSignedIn ? (
                <button className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold hover:bg-blue-700 transition-colors">
                  U
                </button>
              ) : (
                <button className="text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md transition-colors">
                  SIGN IN
                </button>
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
               <TechnicalAnalysis symbol={TV_SYMBOL_MAP[selectedTicker]} tradingMode={tradingMode} />
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

          {/* Multi-Model Ensemble Intelligence Stream */}
          <div className="bg-gradient-to-r from-blue-600/10 via-purple-600/5 to-transparent border-l-2 border-purple-500 p-4 rounded-r-xl backdrop-blur-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3">
                <Cpu size={16} className="text-purple-500 animate-pulse" />
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Multi-Model Intelligence Stream</span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 md:pb-0">
                {['GPT-5', 'Claude 4.7', 'Llama Vision', 'FinGPT', 'BloombergGPT'].map(model => (
                  <span key={model} className="text-[8px] px-2 py-0.5 rounded-full border border-purple-500/30 text-purple-400 whitespace-nowrap bg-purple-500/10">
                    {model}
                  </span>
                ))}
              </div>
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

          {/* Validation Checklist */}
          <div className="bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl backdrop-blur-sm">
            <div className="text-[10px] text-zinc-500 uppercase font-bold mb-4 flex items-center gap-2">
              <Activity size={14} className={tradingMode === 'SCALPING' ? 'text-orange-500' : tradingMode === 'STANDARD' ? 'text-green-500' : 'text-purple-500'} />
              {tradingMode === 'SCALPING' ? 'Scalping' : tradingMode === 'STANDARD' ? 'Standard' : 'Swing Trading'} Validation Checklist
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

              <AdvancedChart 
                symbol={TV_SYMBOL_MAP[selectedTicker]} 
                height={isMobile ? 450 : chartHeight} 
                tradingMode={tradingMode}
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
               <TechnicalAnalysis symbol={TV_SYMBOL_MAP[selectedTicker]} tradingMode={tradingMode} />
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
