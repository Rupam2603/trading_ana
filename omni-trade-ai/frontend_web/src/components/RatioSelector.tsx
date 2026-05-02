"use client";

import { useState, useCallback } from "react";
import { Target } from "lucide-react";

interface RatioSelectorProps {
  onRatioChange: (ratio: number) => void;
  initialRatio?: number;
}

const QUICK_RATIOS = [1.5, 2.0, 2.5, 3.0, 4.0, 5.0];

export function RatioSelector({ onRatioChange, initialRatio = 2.5 }: RatioSelectorProps) {
  const [ratio, setRatio] = useState(initialRatio);

  const handleChange = useCallback(
    (val: number) => {
      const clamped = Math.round(val * 10) / 10;
      setRatio(clamped);
      onRatioChange(clamped);
    },
    [onRatioChange]
  );

  const riskPct = ((1 / ratio) * 100).toFixed(1);
  const rewardPct = (100).toFixed(1);

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={13} style={{ color: "var(--prediction)" }} />
          <span
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            R:R Ratio
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "var(--blue-soft)", color: "var(--bullish)" }}
          >
            1 : {ratio.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Slider */}
      <div className="space-y-1.5">
        <input
          type="range"
          min={1}
          max={5}
          step={0.1}
          value={ratio}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          className="w-full h-1 rounded-full cursor-pointer appearance-none"
          style={{
            accentColor: "var(--prediction)",
            background: `linear-gradient(to right, var(--prediction) ${((ratio - 1) / 4) * 100}%, var(--border) 0%)`,
          }}
        />
        <div className="flex justify-between text-[8px]" style={{ color: "var(--text-muted)" }}>
          <span>1.0x</span>
          <span>5.0x</span>
        </div>
      </div>

      {/* Quick picks */}
      <div className="flex gap-1.5 flex-wrap">
        {QUICK_RATIOS.map((r) => (
          <button
            key={r}
            onClick={() => handleChange(r)}
            className="px-2.5 py-1 rounded text-[9px] font-bold transition-all duration-150"
            style={{
              background: ratio === r ? "var(--prediction)" : "var(--surface-2)",
              color: ratio === r ? "#000" : "var(--text-muted)",
              border: "1px solid",
              borderColor: ratio === r ? "var(--prediction)" : "var(--border)",
            }}
          >
            1:{r}
          </button>
        ))}
      </div>

      {/* Risk/Reward display */}
      <div
        className="flex gap-2 text-[9px] font-bold rounded-lg p-2"
        style={{ background: "var(--surface-2)" }}
      >
        <div className="flex-1 text-center space-y-0.5">
          <div style={{ color: "var(--bearish)" }}>RISK</div>
          <div style={{ color: "var(--text-primary)" }}>{riskPct}%</div>
        </div>
        <div
          className="w-px self-stretch"
          style={{ background: "var(--border)" }}
        />
        <div className="flex-1 text-center space-y-0.5">
          <div style={{ color: "var(--bullish)" }}>REWARD</div>
          <div style={{ color: "var(--text-primary)" }}>{rewardPct}%</div>
        </div>
        <div
          className="w-px self-stretch"
          style={{ background: "var(--border)" }}
        />
        <div className="flex-1 text-center space-y-0.5">
          <div style={{ color: "var(--prediction)" }}>RATIO</div>
          <div style={{ color: "var(--text-primary)" }}>1:{ratio.toFixed(1)}</div>
        </div>
      </div>
    </div>
  );
}
