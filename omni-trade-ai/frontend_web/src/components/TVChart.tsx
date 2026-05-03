"use client";

import { useEffect, useRef, memo } from "react";
import { useTheme } from "@/app/providers";

interface Props {
  symbol: string;           // TradingView symbol e.g. "BINANCE:BTCUSDT"
  timeframe: string;        // "1" | "5" | "15" | "60" | "240" | "D"
  height: number;
  liveData: {
    price: number;
    signal: string;
    entry_price: number;
    stop_loss: number;
    target_price: number;
    confidence: number;
  };
  paperPositions?: any[];
  paperBalance?: number;
}

// Map our timeframe keys to TradingView interval strings
const TF_MAP: Record<string, string> = {
  "1": "1",
  "5": "5",
  "15": "15",
  "60": "60",
  "240": "240",
  "D": "1D",
};

function TVAdvancedChart({ symbol, timeframe, height, liveData, paperPositions = [], paperBalance = 100000 }: Props) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    const handleApplyStrategy = (e: any) => {
      const { direction, entry, sl, tp, ticker } = e.detail;
      
      // Safety check: ensure chart matches ticker
      if (symbol.indexOf(ticker) === -1 && ticker.indexOf(symbol) === -1) {
        console.warn(`Chart ticker mismatch: ${symbol} vs ${ticker}`);
        return;
      }

      if (widgetRef.current) {
        widgetRef.current.onChartReady(() => {
          const chart = widgetRef.current.chart();
          
          // 1. Remove previous AI shapes to prevent clutter
          try {
            const allShapes = chart.getAllShapes();
            allShapes.forEach((s: any) => {
              if (s.name === 'long_position' || s.name === 'short_position') {
                chart.removeEntity(s.id);
              }
            });
          } catch (err) {
            console.error("Error clearing shapes:", err);
          }

          // 2. Create new Position Tool
          const shapeType = direction === 'BUY' ? 'long_position' : 'short_position';
          
          chart.createMultipointShape(
            [{ price: entry }], // The anchor point (usually just Entry)
            {
              shape: shapeType,
              lock: false,
              disableSelection: false,
              disableSave: false,
              disableUndo: false,
              overrides: {
                stopLevel: Math.abs(entry - sl),
                profitLevel: Math.abs(tp - entry),
                // Adjust colors based on theme if supported by widget overrides
                linecolor: direction === 'BUY' ? '#2196F3' : '#FF9800',
              }
            }
          );

          // 3. Auto-panning / Visibility
          chart.executeActionById("chartProperties"); // Optional: focus user attention
        });
      }
    };

    window.addEventListener('apply-ai-strategy', handleApplyStrategy);
    return () => window.removeEventListener('apply-ai-strategy', handleApplyStrategy);
  }, [symbol]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous widget
    if (widgetRef.current) {
      try { widgetRef.current.remove?.(); } catch (_) {}
      widgetRef.current = null;
    }
    containerRef.current.innerHTML = "";

    const containerId = `tv_adv_${symbol.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}`;
    const div = document.createElement("div");
    div.id = containerId;
    div.style.height = "100%";
    div.style.width = "100%";
    containerRef.current.appendChild(div);

    const loadWidget = () => {
      if (!(window as any).TradingView) return;
      const widget = new (window as any).TradingView.widget({
        autosize: true,
        symbol: symbol,
        interval: TF_MAP[timeframe] || "1",
        timezone: "Asia/Kolkata",
        theme: theme === "dark" ? "dark" : "light",
        style: "1",
        locale: "en",
        toolbar_bg: theme === "dark" ? "#151A22" : "#ffffff",
        enable_publishing: false,
        allow_symbol_change: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: true,
        container_id: containerId,
        backgroundColor: theme === "dark" ? "#0B0E14" : "#F4F6FB",
        gridColor: theme === "dark" ? "#252D3D" : "#D8DCF0",
        // Pre-load useful studies
        studies: [
          "Volume@tv-basicstudies",
          "RSI@tv-basicstudies",
          "MACD@tv-basicstudies",
        ],
        studies_overrides: {
          "volume.volume.color.0": "#FF9800",
          "volume.volume.color.1": "#2196F3",
          "volume.volume ma.visible": false,
          "RSI.RSI.linewidth": 2,
          "RSI.RSI.color": "#B388FF",
          "MACD.MACD.color": "#2196F3",
          "MACD.Signal.color": "#FF9800",
        },
        overrides: {
          "mainSeriesProperties.candleStyle.upColor": "#2196F3",
          "mainSeriesProperties.candleStyle.downColor": "#FF9800",
          "mainSeriesProperties.candleStyle.borderUpColor": "#2196F3",
          "mainSeriesProperties.candleStyle.borderDownColor": "#FF9800",
          "mainSeriesProperties.candleStyle.wickUpColor": "#2196F3",
          "mainSeriesProperties.candleStyle.wickDownColor": "#FF9800",
          "paneProperties.background": theme === "dark" ? "#0B0E14" : "#F4F6FB",
          "paneProperties.backgroundType": "solid",
          "paneProperties.vertGridProperties.color": theme === "dark" ? "#252D3D" : "#D8DCF0",
          "paneProperties.horzGridProperties.color": theme === "dark" ? "#252D3D" : "#D8DCF0",
          "scalesProperties.textColor": theme === "dark" ? "#9BA1C6" : "#5D6494",
          "scalesProperties.backgroundColor": theme === "dark" ? "#151A22" : "#ffffff",
        },
        disabled_features: [
          "header_symbol_search",
          "header_compare",
        ],
        enabled_features: [
          "study_templates",
          "side_toolbar_in_fullscreen_mode",
          "header_fullscreen_button",
          "header_screenshot",
          "header_saveload",
          "drawing_templates",
        ],
      });
      widgetRef.current = widget;
    };

    // Load TradingView script if not already loaded
    if ((window as any).TradingView) {
      loadWidget();
    } else {
      const existing = document.getElementById("tv-script");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "tv-script";
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = loadWidget;
        document.head.appendChild(script);
      } else {
        existing.addEventListener("load", loadWidget);
      }
    }

    return () => {
      if (widgetRef.current) {
        try { widgetRef.current.remove?.(); } catch (_) {}
        widgetRef.current = null;
      }
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, timeframe, theme]);

  // Signal color helpers
  const signalColor = liveData.signal === "BUY"
    ? "#2196F3"
    : liveData.signal === "SELL"
    ? "#FF9800"
    : "#9BA1C6";

  const fmt = (n: number) =>
    n > 0 ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "---";

  const isDark = theme === "dark";
  const muted   = isDark ? "#9BA1C6" : "#5D6494";

  // --- Overlay Calculations ---
  const activeTrade = paperPositions.find(p => symbol.includes(p.ticker) || p.ticker.includes(symbol));
  
  let pnl = 0;
  let pnlPercent = 0;
  if (activeTrade) {
    pnl = activeTrade.direction === 'BUY' 
      ? (liveData.price - activeTrade.entry_price) * activeTrade.quantity
      : (activeTrade.entry_price - liveData.price) * activeTrade.quantity;
    pnlPercent = (pnl / (activeTrade.entry_price * activeTrade.quantity)) * 100;
  }

  return (
    <div style={{ position: "relative", height: height, width: "100%" }}>
      {/* TradingView chart fills full area */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", borderRadius: "12px", overflow: "hidden" }}
      />

      {/* Floating HUD Overlay */}
      <div 
        className="absolute top-4 left-4 z-10 pointer-events-none select-none flex flex-col gap-2"
        style={{ width: "fit-content" }}
      >
        {/* Account Info */}
        <div className="px-3 py-1.5 rounded-lg backdrop-blur-md border border-white/5 shadow-2xl flex items-center gap-3"
             style={{ background: "rgba(11, 14, 20, 0.7)" }}>
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
           <div className="flex flex-col">
              <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">Paper Account</span>
              <span className="text-[10px] font-black text-zinc-200 tabular-nums">${paperBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
           </div>
        </div>

        {/* Active Trade Stats */}
        {activeTrade && (
          <div className="px-4 py-3 rounded-xl backdrop-blur-xl border border-purple-500/20 shadow-2xl flex flex-col gap-1 min-w-[160px] animate-in fade-in slide-in-from-left-2 duration-500"
               style={{ background: "linear-gradient(135deg, rgba(147, 51, 234, 0.15), rgba(0,0,0,0.85))" }}>
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${activeTrade.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>
                  {activeTrade.direction}
                </span>
                <span className="text-[10px] font-bold text-zinc-100">{activeTrade.ticker}</span>
              </div>
              <span className="text-[8px] font-bold text-zinc-500">LIVE_PNL</span>
            </div>
            
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-black tabular-nums ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
              </span>
              <span className={`text-[10px] font-bold ${pnl >= 0 ? 'text-emerald-500/60' : 'text-rose-500/60'}`}>
                {pnl >= 0 ? '▲' : '▼'} {Math.abs(pnlPercent).toFixed(2)}%
              </span>
            </div>
            
            <div className="mt-2 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[7px] text-zinc-600 font-bold uppercase">Size</span>
                <span className="text-[9px] font-mono text-zinc-400">{activeTrade.quantity}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[7px] text-zinc-600 font-bold uppercase">Entry</span>
                <span className="text-[9px] font-mono text-zinc-400">{activeTrade.entry_price.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Signal Context Pill (Bottom Right) */}
      <div className="absolute bottom-6 right-6 z-10 pointer-events-none select-none flex flex-col items-end gap-2">
         <div className="px-4 py-2 rounded-full backdrop-blur-md border border-white/5 flex items-center gap-3 shadow-2xl"
              style={{ background: "rgba(0,0,0,0.6)" }}>
            <div className="flex flex-col items-end">
               <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">AI Consensus</span>
               <div className="flex items-center gap-2">
                  <span className={`text-xs font-black ${liveData.signal === 'BUY' ? 'text-blue-400' : liveData.signal === 'SELL' ? 'text-orange-400' : 'text-zinc-400'}`}>
                    {liveData.signal}
                  </span>
                  <div className="w-1 h-3 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="w-full bg-blue-500 transition-all duration-1000" style={{ height: `${liveData.confidence * 100}%`, marginTop: 'auto' }} />
                  </div>
               </div>
            </div>
         </div>
      </div>

    </div>
  );
}

export const TVChart = memo(TVAdvancedChart);
TVAdvancedChart.displayName = "TVChart";
