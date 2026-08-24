import type { ToolReading } from "../readings";
import { toolMisery } from "./misery";

export type FreshnessState = "fresh" | "stale" | "hidden";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Three-state freshness (RFC 003).
 *
 * - `hidden`  — observed more than 7 days ago.
 * - `stale`   — never observed, observed more than 24 hours ago, or the binding window's reset
 *               has already passed
 *               (the sentence has been served; the number on the board is no longer true).
 * - `fresh`   — everything else. A reading with no binding window at all (no ranked window, or
 *               every ranked window reports `resetsAt: null`) is fresh purely on its age: there is
 *               no reset that could have expired, so it cannot go stale before 24 hours.
 */
export function freshnessState(reading: ToolReading, now: Date): FreshnessState {
  if (reading.observedAt === null) return "stale";
  const observedAt = Date.parse(reading.observedAt);
  if (!Number.isFinite(observedAt)) return "stale";
  const age = now.getTime() - observedAt;
  if (age > 7 * DAY_MS) return "hidden";
  if (age > DAY_MS) return "stale";

  const binding = toolMisery(reading, now).bindingWindow;
  if (binding === null || binding.resetsAt === null) return "fresh";
  const resetAt = Date.parse(binding.resetsAt);
  if (!Number.isFinite(resetAt) || now.getTime() >= resetAt) return "stale";
  return "fresh";
}
