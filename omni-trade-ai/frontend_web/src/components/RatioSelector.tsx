"use client";

/**
 * RatioSelector — sidebar widget that wraps RRInput.
 * Kept for backward compatibility; now delegates all state to RRContext.
 */
import { RRInput } from "@/components/RRInput";

// Legacy prop kept for API compatibility — no longer used for state; context is the source of truth.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface RatioSelectorProps {
  onRatioChange?: (ratio: number) => void;
  initialRatio?: number;
}

export function RatioSelector(_props: RatioSelectorProps) {
  return <RRInput />;
}
