import type { LocalReadings, ToolId, ToolReading, UsageWindow } from "../readings";
import { classify } from "./registry";

export const DEPLETION_FLOOR = 50;
export const DEPLETION_EXPONENT = 3;

export function depletion(usedPercent: number): number {
  return Math.max(0, Math.min(1, (usedPercent - DEPLETION_FLOOR) / (100 - DEPLETION_FLOOR)));
}

export function windowMisery(window: UsageWindow, now: Date): number | null {
  if (window.resetsAt === null) return null;
  const resetMs = Date.parse(window.resetsAt);
  if (!Number.isFinite(resetMs)) return null;
  const rawHoursUntilReset = Math.max(0, (resetMs - now.getTime()) / 3_600_000);
  // A window cannot legitimately reset further out than its own length, so clamp the horizon to
  // windowMinutes/60. This makes a forged `resetsAt` far in the future worthless for scoring even
  // if it slips past the server-side plausibility bounds (submissions.ts). Unknown-length windows
  // (windowMinutes === null) have no defined horizon and are left unclamped.
  const maxHoursUntilReset =
    window.windowMinutes === null ? rawHoursUntilReset : window.windowMinutes / 60;
  const hoursUntilReset = Math.min(rawHoursUntilReset, maxHoursUntilReset);
  return hoursUntilReset * depletion(window.usedPercent) ** DEPLETION_EXPONENT;
}

export interface ToolMisery {
  misery: number | null;
  bindingSeriesId: string | null;
  bindingWindow: UsageWindow | null;
}

export function toolMisery(reading: ToolReading, now: Date): ToolMisery {
  let result: ToolMisery = { misery: null, bindingSeriesId: null, bindingWindow: null };
  for (const window of reading.windows) {
    if (classify(window, reading.tool).role !== "ranked") continue;
    const misery = windowMisery(window, now);
    if (misery === null) continue;
    const candidateReset = window.resetsAt === null ? 0 : Date.parse(window.resetsAt);
    const currentReset = result.bindingWindow?.resetsAt
      ? Date.parse(result.bindingWindow.resetsAt)
      : 0;
    if (
      result.misery === null ||
      misery > result.misery ||
      (misery === result.misery && candidateReset > currentReset)
    ) {
      result = { misery, bindingSeriesId: window.seriesId, bindingWindow: window };
    }
  }
  return result;
}

export interface DevMisery extends ToolMisery {
  bindingTool: ToolId | null;
}

export function devMisery(readings: LocalReadings, now: Date): DevMisery {
  let result: DevMisery = {
    misery: null,
    bindingSeriesId: null,
    bindingWindow: null,
    bindingTool: null,
  };
  for (const reading of readings) {
    const candidate = toolMisery(reading, now);
    if (candidate.misery !== null && (result.misery === null || candidate.misery > result.misery)) {
      result = { ...candidate, bindingTool: reading.tool };
    }
  }
  return result;
}
