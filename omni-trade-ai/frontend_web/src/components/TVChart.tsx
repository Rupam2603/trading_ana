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

function TVAdvancedChart({ symbol, timeframe, height, liveData }: Props) {
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
  const surface = isDark ? "#151A22" : "#ffffff";
  const border  = isDark ? "#252D3D" : "#D8DCF0";
  const muted   = isDark ? "#9BA1C6" : "#5D6494";

  return (
    <div style={{ position: "relative", height: height, width: "100%" }}>
      {/* TradingView chart fills full area */}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", borderRadius: "12px", overflow: "hidden" }}
      />

    </div>
  );
}

export const TVChart = memo(TVAdvancedChart);
TVAdvancedChart.displayName = "TVChart";
