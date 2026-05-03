"use client";

/**
 * RRInput — Reusable Global R:R Ratio Widget
 *
 * Reads from and writes to the global RRContext (single source of truth).
 * Drop this anywhere in the app and all R:R-dependent components update instantly.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Unlock, Target, AlertTriangle, X } from "lucide-react";
import { useRR } from "@/app/providers";

const QUICK_RATIOS = [1, 1.5, 2, 2.5, 3, 4, 5];

interface RRInputProps {
  /** Compact mode: hides the bottom bar and quick picks */
  compact?: boolean;
  /** Show a sync flash origin pulse when ratio changes */
  showSyncPulse?: boolean;
}

export function RRInput({ compact = false, showSyncPulse = true }: RRInputProps) {
  const {
    rrRatio, setRRRatio, locked, toggleLock,
    lastUpdatedAt, extremeWarning, dismissExtremeWarning,
  } = useRR();

  const [textValue, setTextValue] = useState(String(rrRatio));
  const [isEditingText, setIsEditingText] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const prevUpdatedAt = useRef(lastUpdatedAt);

  // Sync text field when global ratio changes from another component
  useEffect(() => {
    if (!isEditingText) setTextValue(rrRatio.toFixed(1));
  }, [rrRatio, isEditingText]);

  // Flash pulse when ratio updated from any source
  useEffect(() => {
    if (showSyncPulse && lastUpdatedAt !== prevUpdatedAt.current) {
      prevUpdatedAt.current = lastUpdatedAt;
      setIsPulsing(true);
      const t = setTimeout(() => setIsPulsing(false), 900);
      return () => clearTimeout(t);
    }
  }, [lastUpdatedAt, showSyncPulse]);

  const commitTextValue = useCallback(() => {
    const parsed = parseFloat(textValue.replace(/[^0-9.]/g, ""));
    if (!isNaN(parsed) && parsed > 0) {
      setRRRatio(parsed);
    } else {
      setTextValue(rrRatio.toFixed(1));
    }
    setIsEditingText(false);
  }, [textValue, rrRatio, setRRRatio]);

  const riskPct = ((1 / (rrRatio + 1)) * 100).toFixed(1);
  const rewardPct = ((rrRatio / (rrRatio + 1)) * 100).toFixed(1);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-300"
      style={{
        background: "var(--surface)",
        border: `1px solid ${isPulsing ? "rgba(33,150,243,0.6)" : "var(--border)"}`,
        boxShadow: isPulsing ? "0 0 20px rgba(33,150,243,0.15)" : "none",
        transition: "border-color 0.3s, box-shadow 0.3s",
      }}
    >
      {/* ── Extreme Warning Banner ── */}
      {extremeWarning && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-[9px] font-bold"
          style={{ background: "rgba(239,83,80,0.15)", borderBottom: "1px solid rgba(239,83,80,0.3)", color: "#ef8a87" }}
        >
          <AlertTriangle size={10} className="shrink-0" />
          <span>Unusually high R:R ratio detected ({rrRatio.toFixed(1)}x). Verify this is intentional.</span>
          <button onClick={dismissExtremeWarning} className="ml-auto shrink-0">
            <X size={10} />
          </button>
        </div>
      )}

      <div className="p-3 space-y-3">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target size={12} style={{ color: "var(--prediction)" }} />
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              R:R Ratio
            </span>
            {isPulsing && (
              <span
                className="text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase animate-pulse"
                style={{ background: "rgba(33,150,243,0.2)", color: "var(--bullish)" }}
              >
                SYNCING
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Live ratio badge with inline text edit */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold" style={{ color: "var(--text-muted)" }}>1 :</span>
              {isEditingText ? (
                <input
                  type="text"
                  value={textValue}
                  autoFocus
                  onChange={e => setTextValue(e.target.value)}
                  onBlur={commitTextValue}
                  onKeyDown={e => { if (e.key === "Enter") commitTextValue(); if (e.key === "Escape") { setTextValue(rrRatio.toFixed(1)); setIsEditingText(false); } }}
                  className="w-12 text-center font-black text-xs bg-transparent outline-none border-b"
                  style={{ color: "var(--prediction)", borderColor: "var(--prediction)", fontFamily: "monospace" }}
                />
              ) : (
                <button
                  onClick={() => { setTextValue(rrRatio.toFixed(1)); setIsEditingText(true); }}
                  className="font-black text-xs px-2 py-0.5 rounded"
                  style={{
                    background: "var(--blue-soft)",
                    color: "var(--prediction)",
                    fontFamily: "monospace",
                    minWidth: 36,
                  }}
                >
                  {rrRatio.toFixed(1)}
                </button>
              )}
            </div>

            {/* Lock toggle */}
            <button
              onClick={toggleLock}
              title={locked ? "Locked: SL changes force TP to maintain ratio" : "Unlocked: Ratio updates freely"}
              className="p-1 rounded transition-colors hover:opacity-80"
              style={{
                background: locked ? "rgba(33,150,243,0.2)" : "var(--surface-2)",
                color: locked ? "var(--bullish)" : "var(--text-muted)",
                border: `1px solid ${locked ? "var(--bullish)" : "var(--border)"}`,
              }}
            >
              {locked ? <Lock size={10} /> : <Unlock size={10} />}
            </button>
          </div>
        </div>

        {/* ── Slider ── */}
        <div className="space-y-1">
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.1}
            value={rrRatio}
            onChange={e => setRRRatio(parseFloat(e.target.value))}
            className="w-full cursor-pointer"
            style={{
              accentColor: "var(--prediction)",
              height: 4,
            }}
          />
          <div className="flex justify-between text-[8px]" style={{ color: "var(--text-muted)" }}>
            <span>0.5x</span>
            <span style={{ color: "var(--prediction)" }}>Current: 1:{rrRatio.toFixed(1)}</span>
            <span>10x</span>
          </div>
        </div>

        {/* ── Quick Picks ── */}
        {!compact && (
          <div className="flex gap-1 flex-wrap">
            {QUICK_RATIOS.map(r => (
              <button
                key={r}
                onClick={() => setRRRatio(r)}
                className="px-2 py-0.5 rounded text-[9px] font-bold transition-all duration-150"
                style={{
                  background: rrRatio === r ? "var(--prediction)" : "var(--surface-2)",
                  color: rrRatio === r ? "#000" : "var(--text-muted)",
                  border: `1px solid ${rrRatio === r ? "var(--prediction)" : "var(--border)"}`,
                }}
              >
                1:{r}
              </button>
            ))}
          </div>
        )}

        {/* ── Risk/Reward breakdown ── */}
        {!compact && (
          <div
            className="grid grid-cols-3 gap-1 text-[9px] font-bold rounded-lg px-2 py-2"
            style={{ background: "var(--surface-2)" }}
          >
            <div className="text-center space-y-0.5">
              <div style={{ color: "#ef5350" }}>RISK</div>
              <div style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>{riskPct}%</div>
            </div>
            <div className="text-center space-y-0.5 border-x" style={{ borderColor: "var(--border)" }}>
              <div style={{ color: "var(--prediction)" }}>RATIO</div>
              <div style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>1:{rrRatio.toFixed(1)}</div>
            </div>
            <div className="text-center space-y-0.5">
              <div style={{ color: "#26a69a" }}>REWARD</div>
              <div style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>{rewardPct}%</div>
            </div>
          </div>
        )}

        {locked && (
          <div
            className="text-[8px] px-2 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ background: "rgba(33,150,243,0.08)", color: "var(--bullish)", border: "1px solid rgba(33,150,243,0.2)" }}
          >
            <Lock size={8} />
            Locked — Stop Loss changes will auto-adjust Target Price to preserve 1:{rrRatio.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  );
}
