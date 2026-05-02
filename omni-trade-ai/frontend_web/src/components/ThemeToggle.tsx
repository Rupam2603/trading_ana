"use client";

import { useTheme } from "@/app/providers";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      style={{
        background: isDark ? "var(--surface-2)" : "var(--surface)",
        border: "1px solid var(--border)",
        color: isDark ? "#B388FF" : "#7C4DFF",
      }}
      className="relative flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
    >
      <span className="transition-all duration-300">
        {isDark ? (
          <Moon size={13} className="text-[#B388FF]" />
        ) : (
          <Sun size={13} className="text-[#E65100]" />
        )}
      </span>
      <span
        style={{ color: "var(--text-muted)" }}
        className="text-[9px] font-bold uppercase tracking-widest hidden sm:block"
      >
        {isDark ? "DARK" : "LIGHT"}
      </span>
    </button>
  );
}
