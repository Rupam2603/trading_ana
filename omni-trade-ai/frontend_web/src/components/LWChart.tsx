"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/app/providers";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
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
  onSymbolChange?: (newSymbol: string) => void;
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

export function LWChart({ symbol, height, timeframe, liveData, onSymbolChange }: Props) {
  const { theme } = useTheme();
  const [isEditingSymbol, setIsEditingSymbol] = useState(false);
  const [tempSymbol, setTempSymbol] = useState(symbol);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lastCandleRef = useRef<CandlestickData | null>(null);
  const [candleOpenPrice, setCandleOpenPrice] = useState<number>(0);

  const isDark = theme === "dark";
  const BG   = isDark ? "#131722" : "#ffffff";
  const GRID = isDark ? "rgba(42, 46, 57, 0.5)" : "rgba(240, 243, 250, 0.5)";
  const TEXT = isDark ? "#d1d4dc" : "#131722";
  const BULL = "#26a69a";
  const BEAR = "#ef5350";

  const handleSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempSymbol && tempSymbol !== symbol && onSymbolChange) {
      onSymbolChange(tempSymbol.toUpperCase());
    }
    setIsEditingSymbol(false);
  };

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.innerHTML = "";

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        fontSize: 12,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      },
      grid: {
        vertLines: { color: GRID, style: 2 },
        horzLines: { color: GRID, style: 2 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? "#758696" : "#9598a1",
          width: 1,
          style: 1,
          labelBackgroundColor: isDark ? "#4c525e" : "#131722",
        },
        horzLine: {
          color: isDark ? "#758696" : "#9598a1",
          width: 1,
          style: 1,
          labelBackgroundColor: isDark ? "#4c525e" : "#131722",
        },
      },
      rightPriceScale: {
        borderColor: GRID,
        autoScale: true,
      },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 10,
      },
      handleScroll: true,
      handleScale: true,
    });

    const cs = chart.addSeries(CandlestickSeries, {
      upColor: BULL,
      downColor: BEAR,
      borderUpColor: BULL,
      borderDownColor: BEAR,
      wickUpColor: BULL,
      wickDownColor: BEAR,
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineColor: isDark ? "#758696" : "#131722",
    });

    const basePrice = liveData.price || 100;
    const intervalMin = TF_MINUTES[timeframe] ?? 1;
    
    // Instead of random, let's just start with some history based on the current price
    // to make the chart look active, but consistent.
    const initialCandles = generateCandles(basePrice, 120, intervalMin);
    cs.setData(initialCandles);
    const last = initialCandles[initialCandles.length - 1];
    lastCandleRef.current = last;
    setCandleOpenPrice(last.open);

    chartApi.current = chart;
    candleSeries.current = cs;

    const ro = new ResizeObserver(() => {
      if (chartRef.current) {
        chart.resize(chartRef.current.clientWidth, height);
      }
    });
    ro.observe(chartRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartApi.current = null;
      candleSeries.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeframe, theme, height]);

  useEffect(() => {
    const cs = candleSeries.current;
    if (!cs || !liveData.price) return;

    // Handle first real price arrival to re-seed history if it was based on default 100
    if (liveData.price > 1 && lastCandleRef.current && Math.abs(lastCandleRef.current.close - liveData.price) > liveData.price * 0.5) {
      const intervalMin = TF_MINUTES[timeframe] ?? 1;
      const initialCandles = generateCandles(liveData.price, 120, intervalMin);
      cs.setData(initialCandles);
      const last = initialCandles[initialCandles.length - 1];
      lastCandleRef.current = last;
      setCandleOpenPrice(last.open);
      return;
    }

    const intervalMin = TF_MINUTES[timeframe] ?? 1;
    const intervalSeconds = intervalMin * 60;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const candleTime = (Math.floor(nowSeconds / intervalSeconds) * intervalSeconds) as Time;

    // Use current price for all fields if it's a new candle
    let newCandle: CandlestickData;
    const lastTime = lastCandleRef.current ? (typeof lastCandleRef.current.time === 'number' ? lastCandleRef.current.time : 0) : 0;
    
    if (lastCandleRef.current && lastTime === Number(candleTime)) {
      // Update existing candle
      newCandle = {
        ...lastCandleRef.current,
        high: Math.max(lastCandleRef.current.high, liveData.price),
        low: Math.min(lastCandleRef.current.low, liveData.price),
        close: liveData.price,
      };
    } else if (Number(candleTime) > lastTime) {
      // New candle (only if time is strictly greater)
      newCandle = {
        time: candleTime,
        open: liveData.price,
        high: liveData.price,
        low: liveData.price,
        close: liveData.price,
      };
    } else {
      // Don't update if time is in the past
      return;
    }

    try {
      cs.update(newCandle);
      lastCandleRef.current = newCandle;
      if (newCandle.open !== candleOpenPrice) {
        setCandleOpenPrice(newCandle.open);
      }
    } catch (e) {
      console.error("Chart update error:", e);
    }

    // --- Dynamic Markers ---
    if (liveData.signal !== "HOLD" && liveData.entry_price > 0) {
      const now = Math.floor(Date.now() / 1000) as Time;
      const markers: SeriesMarker<Time>[] = [{
        time: now,
        position: liveData.signal === "BUY" ? "belowBar" : "aboveBar",
        color: liveData.signal === "BUY" ? BULL : BEAR,
        shape: liveData.signal === "BUY" ? "arrowUp" : "arrowDown",
        text: `${liveData.signal}`,
        size: 2,
      }];
      // Use optional chaining or check for existence
      if (typeof cs.setMarkers === 'function') {
        cs.setMarkers(markers);
      }
    } else {
      if (typeof cs.setMarkers === 'function') {
        cs.setMarkers([]);
      }
    }
  }, [liveData, timeframe, candleOpenPrice]);


  return (
    <div className="lw-chart-container" style={{ height, position: "relative" }}>
      <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

