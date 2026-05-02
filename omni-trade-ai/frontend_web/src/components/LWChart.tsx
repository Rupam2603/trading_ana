"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "@/app/providers";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";

interface Props {
  symbol: string;
  height: number;
  timeframe: string;
  liveData: {
    price: number;
    signal: string;
    entry_price: number;
    stop_loss: number;
    target_price: number;
  };
}

const TF_MINUTES: Record<string, number> = {
  "1": 1, "5": 5, "15": 15, "60": 60, "240": 240, "D": 1440,
};

function generateCandles(basePrice: number, count: number, intervalMin: number): CandlestickData[] {
  const candles: CandlestickData[] = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const step = intervalMin * 60;
  for (let i = count; i >= 0; i--) {
    const vol = price * 0.008;
    const open = price + (Math.random() - 0.5) * vol;
    const close = open + (Math.random() - 0.5) * vol;
    const high = Math.max(open, close) + Math.random() * vol * 0.5;
    const low = Math.min(open, close) - Math.random() * vol * 0.5;
    price = close;
    candles.push({ time: (now - i * step) as Time, open, high, low, close });
  }
  return candles;
}

export function LWChart({ symbol, height, timeframe, liveData }: Props) {
  const { theme } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const isDark = theme === "dark";
  const BG   = isDark ? "#0B0E14" : "#F4F6FB";
  const GRID = isDark ? "#252D3D" : "#D8DCF0";
  const TEXT = isDark ? "#9BA1C6" : "#5D6494";
  const BULL = "#2196F3";
  const BEAR = "#FF9800";
  const CYAN = "#00E5FF";

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.innerHTML = "";

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: BG }, textColor: TEXT },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: GRID },
      timeScale: { borderColor: GRID, timeVisible: true, secondsVisible: false },
    });

    const cs = chart.addSeries(CandlestickSeries, {
      upColor: BULL,
      downColor: BEAR,
      borderUpColor: BULL,
      borderDownColor: BEAR,
      wickUpColor: BULL,
      wickDownColor: BEAR,
    });

    const basePrice = liveData.price || 100;
    const intervalMin = TF_MINUTES[timeframe] ?? 1;
    cs.setData(generateCandles(basePrice, 120, intervalMin));

    chartApi.current = chart;
    candleSeries.current = cs;

    const ro = new ResizeObserver(() => {
      chart.resize(chartRef.current!.clientWidth, height);
    });
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartApi.current = null;
      candleSeries.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, theme]);

  useEffect(() => {
    const cs = candleSeries.current;
    if (!cs || !liveData.price) return;

    const now = Math.floor(Date.now() / 1000) as Time;
    cs.update({
      time: now,
      open: liveData.entry_price || liveData.price,
      high: Math.max(liveData.price, liveData.entry_price || liveData.price),
      low: Math.min(liveData.price, liveData.stop_loss || liveData.price * 0.99),
      close: liveData.price,
    });

    if (liveData.signal !== "HOLD" && liveData.entry_price > 0) {
      cs.createPriceLine({ price: liveData.entry_price, color: CYAN, lineWidth: 1, lineStyle: 2, title: "Entry" });
      cs.createPriceLine({ price: liveData.stop_loss,   color: BEAR, lineWidth: 1, lineStyle: 2, title: "SL" });
      cs.createPriceLine({ price: liveData.target_price, color: CYAN, lineWidth: 1, lineStyle: 2, title: "TP" });

      const markers: SeriesMarker<Time>[] = [{
        time: now,
        position: liveData.signal === "BUY" ? "belowBar" : "aboveBar",
        color: liveData.signal === "BUY" ? BULL : BEAR,
        shape: liveData.signal === "BUY" ? "arrowUp" : "arrowDown",
        text: liveData.signal,
        size: 2,
      }];
      createSeriesMarkers(cs, markers);
    }
  }, [liveData]);

  return (
    <div className="lw-chart-container" style={{ height }}>
      <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
