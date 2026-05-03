"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Info,
  Sliders,
  RefreshCw,
} from "lucide-react";
import { useRR } from "@/app/providers";

// ─── Asset multiplier map ─────────────────────────────────────────────────────
const ASSET_MULTIPLIERS: Record<string, number> = {
  BTCUSD: 1, ETHUSD: 1, SOLUSD: 1,
  TSLA: 1, NVDA: 1, AAPL: 1, MSFT: 1, AMZN: 1,
  XAUUSD: 100,
  SILVER: 5000,
  USOIL: 1000,
  EURUSD: 100000, GBPUSD: 100000, USDJPY: 100000,
  SPX: 50, IXIC: 20, DJI: 10,
  NIFTY: 50, BANKNIFTY: 15,
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface LiveData {
  price: number;
  entry_price: number;
  stop_loss: number;
  target_price: number;
  signal: string;
  confidence: number;
}

interface RiskCalculatorProps {
  liveData: LiveData;
  ticker: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getRoundingStep(ticker: string): number {
  if (["EURUSD", "GBPUSD", "USDJPY"].includes(ticker)) return 0.01;
  if (["BTCUSD", "ETHUSD", "SOLUSD"].includes(ticker)) return 0.001;
  if (["XAUUSD", "SILVER", "USOIL"].includes(ticker)) return 0.01;
  return 1;
}

function roundDown(value: number, step: number): number {
  if (step === 0) return 0;
  return Math.floor(value / step) * step;
}

function formatLots(value: number, step: number): string {
  const decimals = step < 1 ? Math.abs(Math.floor(Math.log10(step))) : 0;
  return value.toFixed(decimals);
}

// ─── Validation ───────────────────────────────────────────────────────────────
type CalcError =
  | "NO_SIGNAL"
  | "MISSING_SL"
  | "ZERO_DIVISION"
  | "INVALID_PREDICTION"
  | "INSUFFICIENT_CAPITAL"
  | null;

function validate(
  signal: string, entry: number, sl: number, tp: number, riskAmount: number, ticker: string
): CalcError {
  if (signal === "HOLD" || entry === 0) return "NO_SIGNAL";
  if (sl === 0) return "MISSING_SL";
  if (Math.abs(entry - sl) < 0.000001) return "ZERO_DIVISION";
  if (signal === "BUY" && tp <= entry) return "INVALID_PREDICTION";
  if (signal === "SELL" && tp >= entry) return "INVALID_PREDICTION";
  const step = getRoundingStep(ticker);
  const multiplier = ASSET_MULTIPLIERS[ticker] ?? 1;
  const rawLots = riskAmount / (Math.abs(entry - sl) * multiplier);
  const lots = roundDown(rawLots, step);
  if (lots <= 0) return "INSUFFICIENT_CAPITAL";
  return null;
}

// ─── Derived Target (Scenario A: SL fixed → TP moves with R:R) ───────────────
function deriveTP(signal: string, entry: number, sl: number, rrRatio: number): number {
  if (entry === 0 || sl === 0) return 0;
  const slDist = Math.abs(entry - sl);
  return signal === "BUY" ? entry + slDist * rrRatio : entry - slDist * rrRatio;
}

// ─── Component ────────────────────────────────────────────────────────────────
export const RiskCalculator = React.memo(({ liveData, ticker }: RiskCalculatorProps) => {
  const { rrRatio, lastUpdatedAt } = useRR();
  const { entry_price: entry, stop_loss: sl, signal } = liveData;

  // ── Derive effective TP from global R:R (Scenario A) ─────────────────────
  const effectiveTP = useMemo(() => {
    // If backend gave us a valid TP, use it to cross-check; otherwise derive
    const derivedTP = deriveTP(signal, entry, sl, rrRatio);
    return derivedTP > 0 ? derivedTP : liveData.target_price;
  }, [signal, entry, sl, rrRatio, liveData.target_price]);

  // ── Persisted settings ────────────────────────────────────────────────────
  const [capital, setCapital] = useState<number>(() => {
    if (typeof window === "undefined") return 10000;
    return parseFloat(localStorage.getItem("riskCalc_capital") ?? "10000");
  });
  const [riskPct, setRiskPct] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    return parseFloat(localStorage.getItem("riskCalc_riskPct") ?? "1");
  });

  useEffect(() => { localStorage.setItem("riskCalc_capital", String(capital)); }, [capital]);
  useEffect(() => { localStorage.setItem("riskCalc_riskPct", String(riskPct)); }, [riskPct]);

  // ── Flash feedback when R:R updates ──────────────────────────────────────
  const [isFlashing, setIsFlashing] = useState(false);
  const prevRRUpdatedAt = useRef(lastUpdatedAt);
  useEffect(() => {
    if (lastUpdatedAt !== prevRRUpdatedAt.current) {
      prevRRUpdatedAt.current = lastUpdatedAt;
      setIsFlashing(true);
      const t = setTimeout(() => setIsFlashing(false), 800);
      return () => clearTimeout(t);
    }
  }, [lastUpdatedAt]);

  // ── UI State ──────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(false);
  const [manualLots, setManualLots] = useState<number | null>(null);
  const [isEditingCapital, setIsEditingCapital] = useState(false);
  const [capitalInput, setCapitalInput] = useState(String(capital));

  useEffect(() => { setManualLots(null); }, [signal, entry]);

  // ── Core calculations ─────────────────────────────────────────────────────
  const multiplier = ASSET_MULTIPLIERS[ticker] ?? 1;
  const step = getRoundingStep(ticker);
  const riskAmount = (capital * riskPct) / 100;

  const error: CalcError = validate(signal, entry, sl, effectiveTP, riskAmount, ticker);

  const autoLots = useMemo(() => {
    if (error && error !== "INSUFFICIENT_CAPITAL") return 0;
    const raw = riskAmount / (Math.abs(entry - sl) * multiplier);
    return roundDown(raw, step);
  }, [entry, sl, riskAmount, multiplier, step, error]);

  const activeLots = manualLots !== null ? manualLots : autoLots;

  const projectedProfit = useMemo(() => {
    if (activeLots <= 0 || error === "INVALID_PREDICTION" || error === "ZERO_DIVISION" || error === "MISSING_SL") return 0;
    return activeLots * Math.abs(effectiveTP - entry) * multiplier;
  }, [activeLots, effectiveTP, entry, multiplier, error]);

  const projectedLoss = useMemo(() => {
    if (activeLots <= 0) return 0;
    return activeLots * Math.abs(entry - sl) * multiplier;
  }, [activeLots, entry, sl, multiplier]);

  const rrRatioActual = projectedLoss > 0 ? projectedProfit / projectedLoss : 0;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleCapitalBlur = useCallback(() => {
    const parsed = parseFloat(capitalInput.replace(/[^0-9.]/g, ""));
    if (!isNaN(parsed) && parsed > 0) setCapital(parsed);
    else setCapitalInput(String(capital));
    setIsEditingCapital(false);
  }, [capitalInput, capital]);

  const handleLotsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v) && v >= 0) setManualLots(roundDown(v, step));
  }, [step]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const isBuy = signal === "BUY";
  const isSell = signal === "SELL";
  const signalColor = isBuy ? "#26a69a" : isSell ? "#ef5350" : "#888";

  const errorMessages: Record<Exclude<CalcError, null>, { icon: React.ReactNode; msg: string }> = {
    NO_SIGNAL: { icon: <Info size={12} />, msg: "Awaiting a valid BUY or SELL prediction to calculate lot sizes." },
    MISSING_SL: { icon: <AlertTriangle size={12} />, msg: "A Stop Loss prediction is required to calculate safe lot quantities." },
    ZERO_DIVISION: { icon: <AlertTriangle size={12} />, msg: "Entry price equals Stop Loss — cannot calculate risk. Check prediction." },
    INVALID_PREDICTION: {
      icon: <AlertTriangle size={12} />,
      msg: signal === "BUY"
        ? "Target price is below Entry on a Long position. Prediction flagged as invalid."
        : "Target price is above Entry on a Short position. Prediction flagged as invalid.",
    },
    INSUFFICIENT_CAPITAL: { icon: <AlertTriangle size={12} />, msg: "Account balance insufficient for this trade setup at minimum lot size." },
  };

  return (
    <div
      className="transition-all duration-300"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isFlashing ? "rgba(33,150,243,0.7)" : "var(--border)"}`,
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: isFlashing ? "0 0 24px rgba(33,150,243,0.18)" : "0 4px 24px rgba(0,0,0,0.3)",
        transition: "border-color 0.3s, box-shadow 0.3s",
      }}
    >
      {/* ── Header ── */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5"
        style={{ borderBottom: collapsed ? "none" : "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ background: "var(--surface-2)", color: signalColor }}>
            <Calculator size={14} />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Risk Calculator
          </span>
          {isFlashing && (
            <span
              className="text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase animate-pulse"
              style={{ background: "rgba(33,150,243,0.2)", color: "var(--bullish)" }}
            >
              R:R SYNCED ✓
            </span>
          )}
          {!collapsed && signal !== "HOLD" && !error && (
            <span
              className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase"
              style={{
                background: isBuy ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)",
                color: signalColor,
                border: `1px solid ${signalColor}40`,
              }}
            >
              {signal} ACTIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Compact R:R badge */}
          <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: "var(--blue-soft)", color: "var(--prediction)", fontFamily: "monospace" }}>
            1:{rrRatio.toFixed(1)}
          </span>
          {collapsed ? <ChevronDown size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronUp size={14} style={{ color: "var(--text-muted)" }} />}
        </div>
      </button>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* ── Settings Row ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Capital */}
            <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <label className="text-[9px] uppercase font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>
                Account Capital
              </label>
              {isEditingCapital ? (
                <input
                  type="text"
                  value={capitalInput}
                  onChange={e => setCapitalInput(e.target.value)}
                  onBlur={handleCapitalBlur}
                  onKeyDown={e => e.key === "Enter" && handleCapitalBlur()}
                  autoFocus
                  className="w-full bg-transparent font-bold text-sm mt-1 outline-none"
                  style={{ color: "var(--text-primary)", fontFamily: "monospace" }}
                />
              ) : (
                <div
                  className="text-sm font-bold mt-1 cursor-pointer hover:opacity-80 transition-opacity"
                  style={{ color: "var(--text-primary)", fontFamily: "monospace" }}
                  onClick={() => { setCapitalInput(String(capital)); setIsEditingCapital(true); }}
                >
                  ${capital.toLocaleString()}
                </div>
              )}
            </div>

            {/* Risk % */}
            <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <div className="flex justify-between items-center">
                <label className="text-[9px] uppercase font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Risk Per Trade
                </label>
                <span className="text-[10px] font-bold" style={{ color: "var(--prediction)", fontFamily: "monospace" }}>
                  {riskPct}% = ${riskAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <input
                type="range" min={0.1} max={10} step={0.1} value={riskPct}
                onChange={e => setRiskPct(parseFloat(e.target.value))}
                className="w-full mt-2 cursor-pointer"
                style={{ accentColor: "var(--prediction)", height: 4 }}
              />
              <div className="flex justify-between text-[8px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                <span>0.1%</span><span>10%</span>
              </div>
            </div>
          </div>

          {/* ── Derived TP Row ── */}
          {signal !== "HOLD" && entry > 0 && sl > 0 && (
            <div
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-[9px]"
              style={{
                background: isFlashing ? "rgba(33,150,243,0.08)" : "var(--surface-2)",
                border: `1px solid ${isFlashing ? "rgba(33,150,243,0.4)" : "var(--border)"}`,
                transition: "background 0.3s, border-color 0.3s",
              }}
            >
              <RefreshCw size={10} style={{ color: "var(--prediction)", flexShrink: 0 }} className={isFlashing ? "animate-spin" : ""} />
              <span style={{ color: "var(--text-muted)" }}>
                Derived TP <span style={{ fontFamily: "monospace", color: "var(--prediction)" }}>
                  [{signal === "BUY" ? "Entry + SL_dist × " : "Entry − SL_dist × "}{rrRatio.toFixed(1)}R]
                </span>
              </span>
              <span className="ml-auto font-black tabular-nums" style={{ color: "#26a69a", fontFamily: "monospace" }}>
                {effectiveTP > 0 ? effectiveTP.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "---"}
              </span>
            </div>
          )}

          {/* ── Error Banner ── */}
          {error && (
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[10px] font-medium"
              style={{
                background: error === "NO_SIGNAL" ? "rgba(100,100,100,0.1)" : "rgba(239,83,80,0.1)",
                border: `1px solid ${error === "NO_SIGNAL" ? "var(--border)" : "#ef535040"}`,
                color: error === "NO_SIGNAL" ? "var(--text-muted)" : "#ef8a87",
              }}
            >
              <span className="mt-0.5 shrink-0">{errorMessages[error].icon}</span>
              <span>{errorMessages[error].msg}</span>
            </div>
          )}

          {/* ── Results ── */}
          {!error && (
            <>
              {/* Lot Quantity */}
              <div
                className="rounded-xl p-4"
                style={{ background: "var(--surface-2)", border: `1px solid ${signalColor}40` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sliders size={12} style={{ color: signalColor }} />
                    <span className="text-[9px] uppercase font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>
                      Recommended Lot Size
                    </span>
                  </div>
                  {manualLots !== null && (
                    <button
                      onClick={() => setManualLots(null)}
                      className="text-[8px] px-2 py-0.5 rounded-full hover:opacity-80 transition-opacity"
                      style={{ background: "rgba(100,100,100,0.2)", color: "var(--text-muted)" }}
                    >
                      Reset to Auto
                    </button>
                  )}
                </div>
                <div className="flex items-end gap-4">
                  <div>
                    <div
                      className="text-3xl font-black tabular-nums"
                      style={{ color: signalColor, fontFamily: "monospace", lineHeight: 1 }}
                    >
                      {formatLots(activeLots, step)}
                    </div>
                    <div className="text-[9px] mt-1" style={{ color: "var(--text-muted)" }}>
                      {manualLots !== null ? "MANUAL OVERRIDE" : "AUTO-CALCULATED"}
                    </div>
                  </div>
                  <div className="flex-1">
                    <input
                      type="range" min={0} max={Math.max(autoLots * 3, step)} step={step}
                      value={activeLots} onChange={handleLotsChange}
                      className="w-full cursor-pointer" style={{ accentColor: signalColor }}
                    />
                    <input
                      type="number" min={0} step={step}
                      value={formatLots(activeLots, step)} onChange={handleLotsChange}
                      className="w-full text-center text-[10px] rounded-lg px-2 py-1 mt-1 bg-transparent border font-mono"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                </div>
              </div>

              {/* P&L Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl p-3" style={{ background: "rgba(38,166,154,0.08)", border: "1px solid rgba(38,166,154,0.3)" }}>
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingUp size={10} style={{ color: "#26a69a" }} />
                    <span className="text-[8px] uppercase font-bold tracking-widest" style={{ color: "#26a69a" }}>Projected Profit</span>
                  </div>
                  <div className="text-lg font-black tabular-nums" style={{ color: "#26a69a", fontFamily: "monospace" }}>
                    +${projectedProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(239,83,80,0.08)", border: "1px solid rgba(239,83,80,0.3)" }}>
                  <div className="flex items-center gap-1 mb-1">
                    <TrendingDown size={10} style={{ color: "#ef5350" }} />
                    <span className="text-[8px] uppercase font-bold tracking-widest" style={{ color: "#ef5350" }}>Max Risk</span>
                  </div>
                  <div className="text-lg font-black tabular-nums" style={{ color: "#ef5350", fontFamily: "monospace" }}>
                    -${projectedLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <div className="text-[8px] uppercase font-bold tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>R:R Ratio</div>
                  <div
                    className="text-lg font-black tabular-nums"
                    style={{ color: rrRatioActual >= 2 ? "#26a69a" : rrRatioActual >= 1 ? "#FFA500" : "#ef5350", fontFamily: "monospace" }}
                  >
                    1:{rrRatioActual.toFixed(2)}
                  </div>
                  <div
                    className="text-[8px] font-bold mt-0.5"
                    style={{ color: rrRatioActual >= 2 ? "#26a69a" : rrRatioActual >= 1 ? "#FFA500" : "#ef5350" }}
                  >
                    {rrRatioActual >= 2 ? "EXCELLENT" : rrRatioActual >= 1.5 ? "GOOD" : rrRatioActual >= 1 ? "MARGINAL" : "POOR"}
                  </div>
                </div>
              </div>

              {/* Trade Summary */}
              <div
                className="rounded-xl px-4 py-3 grid grid-cols-4 gap-4 text-center"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                {[
                  { label: "Entry", value: entry.toLocaleString(undefined, { minimumFractionDigits: 2 }), color: "var(--prediction)" },
                  { label: "Stop Loss", value: sl.toLocaleString(undefined, { minimumFractionDigits: 2 }), color: "#ef5350" },
                  { label: "Target TP", value: effectiveTP > 0 ? effectiveTP.toLocaleString(undefined, { minimumFractionDigits: 2 }) : "---", color: "#26a69a" },
                  { label: "Multiplier", value: `×${multiplier.toLocaleString()}`, color: "var(--text-primary)" },
                ].map(item => (
                  <div key={item.label}>
                    <div className="text-[8px] uppercase font-bold mb-0.5" style={{ color: "var(--text-muted)" }}>{item.label}</div>
                    <div className="text-[10px] font-black tabular-nums" style={{ color: item.color, fontFamily: "monospace" }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="text-[8px] leading-relaxed px-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                Lot = (Capital × Risk%) ÷ (|Entry − SL| × Multiplier) · TP = Entry ± SL_dist × {rrRatio.toFixed(1)}R
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

RiskCalculator.displayName = "RiskCalculator";
