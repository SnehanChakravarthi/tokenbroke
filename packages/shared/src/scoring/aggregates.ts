import type { ToolReading } from "../readings";
import { freshnessState } from "./freshness";
import { toolMisery, windowMisery } from "./misery";
import { classify } from "./registry";

export interface AggregateReading {
  deviceId: string;
  reading: ToolReading;
}

function freshRows(rows: readonly AggregateReading[], now: Date): AggregateReading[] {
  const byDevice = new Map<string, AggregateReading>();
  for (const row of rows) {
    if (freshnessState(row.reading, now) !== "fresh") continue;
    const existing = byDevice.get(row.deviceId);
    const observedAt = Date.parse(row.reading.observedAt ?? "");
    const existingObservedAt = Date.parse(existing?.reading.observedAt ?? "");
    if (!existing || observedAt > existingObservedAt) byDevice.set(row.deviceId, row);
  }
  return [...byDevice.values()];
}

export function devs(rows: readonly AggregateReading[], now: Date): number {
  return new Set(freshRows(rows, now).map((row) => row.deviceId)).size;
}

export function medianRemainingPercent(
  rows: readonly AggregateReading[],
  seriesId: string,
  now: Date,
): number | null {
  const values = freshRows(rows, now)
    .flatMap(({ reading }) =>
      reading.windows
        .filter(
          (window) =>
            window.seriesId === seriesId && classify(window, reading.tool).role === "ranked",
        )
        .map((window) => 100 - window.usedPercent),
    )
    .sort((left, right) => left - right);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  const upper = values[middle];
  if (upper === undefined) return null;
  if (values.length % 2 === 1) return upper;
  const lower = values[middle - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

export function brokeFraction(rows: readonly AggregateReading[], now: Date): number {
  const fresh = freshRows(rows, now);
  if (fresh.length === 0) return 0;
  const broke = fresh.filter(({ reading }) =>
    reading.windows.some(
      (window) => classify(window, reading.tool).role === "ranked" && 100 - window.usedPercent <= 5,
    ),
  ).length;
  return broke / fresh.length;
}

export function blockedHoursRemaining(rows: readonly AggregateReading[], now: Date): number {
  return freshRows(rows, now).reduce((sum, { reading }) => {
    const binding = toolMisery(reading, now).bindingWindow;
    if (binding === null || 100 - binding.usedPercent > 0) return sum;
    const miseryAtFullDepletion = windowMisery({ ...binding, usedPercent: 100 }, now);
    return sum + (miseryAtFullDepletion ?? 0);
  }, 0);
}
