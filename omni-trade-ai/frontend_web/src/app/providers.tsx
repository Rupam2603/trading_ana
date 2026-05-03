"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

// ─── Theme Context ────────────────────────────────────────────────────────────
type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("omnitrade-theme") as Theme | null;
    if (stored === "light" || stored === "dark") setTheme(stored);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("omnitrade-theme", theme);
  }, [theme, mounted]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// ─── Global R:R Ratio Context ─────────────────────────────────────────────────

const RR_MIN = 0.5;
const RR_MAX = 10;
const RR_DEFAULT = 2.5;
const RR_EXTREME_THRESHOLD = 8;

export type RRLockMode = "sl-fixed" | "tp-fixed";

interface RRContextValue {
  /** The reward multiplier (the "R" in 1:R) */
  rrRatio: number;
  /** Whether the ratio is locked so that changing SL forces TP to move */
  locked: boolean;
  lockMode: RRLockMode;
  /** Validated setter — rejects negatives, warns on extremes */
  setRRRatio: (value: number) => void;
  toggleLock: () => void;
  setLockMode: (mode: RRLockMode) => void;
  /** Fires when any component updates the ratio (for flash animations) */
  lastUpdatedAt: number;
  /** Whether the last-set value triggered an extreme warning */
  extremeWarning: boolean;
  dismissExtremeWarning: () => void;
}

const RRContext = createContext<RRContextValue>({
  rrRatio: RR_DEFAULT,
  locked: false,
  lockMode: "sl-fixed",
  setRRRatio: () => {},
  toggleLock: () => {},
  setLockMode: () => {},
  lastUpdatedAt: 0,
  extremeWarning: false,
  dismissExtremeWarning: () => {},
});

export function RRProvider({ children }: { children: React.ReactNode }) {
  const [rrRatio, _setRRRatio] = useState<number>(() => {
    if (typeof window === "undefined") return RR_DEFAULT;
    const stored = parseFloat(localStorage.getItem("omnitrade-rr") ?? "");
    return isNaN(stored) ? RR_DEFAULT : Math.min(RR_MAX, Math.max(RR_MIN, stored));
  });
  const [locked, setLocked] = useState(false);
  const [lockMode, setLockMode] = useState<RRLockMode>("sl-fixed");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(0);
  const [extremeWarning, setExtremeWarning] = useState(false);

  const setRRRatio = useCallback((value: number) => {
    // Reject negative / zero
    if (value <= 0 || isNaN(value)) return;
    // Cap at max
    const clamped = Math.min(RR_MAX, Math.max(RR_MIN, Math.round(value * 10) / 10));
    // Extreme warning
    if (clamped >= RR_EXTREME_THRESHOLD) setExtremeWarning(true);
    _setRRRatio(clamped);
    setLastUpdatedAt(Date.now());
    localStorage.setItem("omnitrade-rr", String(clamped));
  }, []);

  const toggleLock = useCallback(() => setLocked((l) => !l), []);
  const dismissExtremeWarning = useCallback(() => setExtremeWarning(false), []);

  return (
    <RRContext.Provider
      value={{ rrRatio, locked, lockMode, setRRRatio, toggleLock, setLockMode, lastUpdatedAt, extremeWarning, dismissExtremeWarning }}
    >
      {children}
    </RRContext.Provider>
  );
}

export function useRR(): RRContextValue {
  return useContext(RRContext);
}
