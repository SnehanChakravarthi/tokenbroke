import { describe, expect, it } from "vitest";
import {
  blockedHoursRemaining,
  brokeFraction,
  classify,
  compareRows,
  depletion,
  devs,
  freshnessState,
  medianRemainingPercent,
  REGISTRY_V1,
  toolMisery,
  validateRegistry,
  windowMisery,
} from "../src";
import type { ToolReading, UsageWindow } from "../src/readings";

const NOW = new Date("2026-08-23T00:00:00.000Z");

function window(
  usedPercent: number,
  hours: number,
  seriesId = "claude:weekly:10080:",
): UsageWindow {
  return {
    seriesId,
    limitId: seriesId.split(":")[0] ?? "claude",
    rawKind: seriesId.split(":")[1] ?? "weekly",
    windowMinutes: seriesId.includes("10080") ? 10_080 : 300,
    scope: null,
    usedPercent,
    resetsAt: new Date(NOW.getTime() + hours * 3_600_000).toISOString(),
    group: null,
    severity: null,
    isActive: null,
  };
}

function reading(windows: UsageWindow[], observedAt = NOW.toISOString()): ToolReading {
  return {
    tool: "claude-code",
    install: "found",
    observation: "ok",
    toolVersion: null,
    plan: { raw: null, label: null },
    observedAt,
    sourceFetchedAt: observedAt,
    windows,
    drain: [],
    evidence: null,
    warnings: [],
  };
}

describe("RFC 003 scoring", () => {
  it("matches every worked example in Decision 8.1 exactly", () => {
    expect(windowMisery(window(100, 96), NOW)).toBe(96);
    expect(windowMisery(window(90, 144), NOW)).toBeCloseTo(73.728, 12);
    expect(windowMisery(window(100, 4, "claude:session:300:"), NOW)).toBe(4);
    expect(windowMisery(window(60, 144), NOW)).toBeCloseTo(1.152, 12);
    expect(windowMisery(window(50, 144), NOW)).toBe(0);
    expect(windowMisery(window(20, 144), NOW)).toBe(0);
    expect(depletion(90)).toBe(0.8);
  });

  it("binds only ranked windows with observed reset times", () => {
    const unknown = { ...window(100, 200, "claude:weird:42:"), windowMinutes: 42 };
    const weekly = window(100, 96);
    expect(toolMisery(reading([unknown, weekly]), NOW)).toMatchObject({
      misery: 96,
      bindingSeriesId: weekly.seriesId,
    });
    expect(toolMisery(reading([{ ...weekly, resetsAt: null }]), NOW).misery).toBeNull();
  });
});

describe("registry", () => {
  it("classifies structurally and keeps unknown windows secondary", () => {
    expect(classify(window(90, 1, "claude:session:300:"), "claude-code").role).toBe("ranked");
    const scoped = { ...window(90, 1), scope: "Fable" };
    expect(classify(scoped, "claude-code")).toMatchObject({
      role: "secondary",
      label: "Weekly · Fable",
    });
    expect(classify({ ...window(90, 1), windowMinutes: 42 }, "codex")).toMatchObject({
      role: "secondary",
      registered: false,
    });
  });

  it("validates the shipped registry at module load", () => {
    expect(() => validateRegistry(REGISTRY_V1)).not.toThrow();
    expect(() => validateRegistry()).not.toThrow();
  });

  it("rejects overlapping ranked rules", () => {
    expect(() =>
      validateRegistry([
        {
          tool: "*",
          durationBand: "5h",
          scoped: null,
          role: "ranked",
          label: "a",
          shortLabel: "a",
        },
        {
          tool: "codex",
          durationBand: "5h",
          scoped: false,
          role: "ranked",
          label: "b",
          shortLabel: "b",
        },
      ]),
    ).toThrow(/Overlapping/);
  });
});

describe("freshness, rank, and aggregates", () => {
  it("implements fresh, stale expired/old, and hidden", () => {
    expect(freshnessState(reading([window(90, 1)]), NOW)).toBe("fresh");
    expect(freshnessState(reading([window(90, -1)]), NOW)).toBe("stale");
    expect(
      freshnessState(
        reading([window(90, 1)], new Date(NOW.getTime() - 25 * 3_600_000).toISOString()),
        NOW,
      ),
    ).toBe("stale");
    expect(
      freshnessState(
        reading([window(90, 1)], new Date(NOW.getTime() - 8 * 86_400_000).toISOString()),
        NOW,
      ),
    ).toBe("hidden");
  });

  it("treats a reading with no binding window as fresh until it is a day old", () => {
    const unbound = reading([{ ...window(90, 1), resetsAt: null }]);
    expect(toolMisery(unbound, NOW).bindingWindow).toBeNull();
    const hourOld = {
      ...unbound,
      observedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
    };
    expect(freshnessState(hourOld, NOW)).toBe("fresh");
    expect(devs([{ deviceId: "a", reading: hourOld }], NOW)).toBe(1);

    const dayOld = {
      ...unbound,
      observedAt: new Date(NOW.getTime() - 25 * 3_600_000).toISOString(),
    };
    expect(freshnessState(dayOld, NOW)).toBe("stale");
    expect(devs([{ deviceId: "a", reading: dayOld }], NOW)).toBe(0);
  });

  it("orders equal-misery rows with unparseable timestamps independently of input order", () => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      misery: 4,
      observedAt: "not-a-timestamp",
      deviceId: `device-${index}`,
    }));
    const forward = [...rows].sort(compareRows).map((row) => row.deviceId);
    const reversed = [...rows]
      .reverse()
      .sort(compareRows)
      .map((row) => row.deviceId);
    expect(reversed).toEqual(forward);
    expect(new Set(forward).size).toBe(12);

    const mixed = [
      { misery: 4, observedAt: "not-a-timestamp", deviceId: "x" },
      { misery: 4, observedAt: NOW.toISOString(), deviceId: "y" },
    ];
    expect([...mixed].sort(compareRows)).toEqual([...mixed].reverse().sort(compareRows));
  });

  it("sorts score, then newer observation, then stable device hash", () => {
    const rows = [
      { misery: 2, observedAt: "2026-08-22T00:00:00Z", deviceId: "a" },
      { misery: 3, observedAt: "2026-08-21T00:00:00Z", deviceId: "b" },
      { misery: 3, observedAt: "2026-08-23T00:00:00Z", deviceId: "c" },
    ].sort(compareRows);
    expect(rows.map((row) => row.deviceId)).toEqual(["c", "b", "a"]);
  });

  it("computes the decided aggregate primitives over fresh rows", () => {
    const first = reading([window(100, 4)]);
    const second = reading([window(90, 4)]);
    const rows = [
      { deviceId: "a", reading: first },
      { deviceId: "b", reading: second },
      { deviceId: "a", reading: first },
    ];
    expect(devs(rows, NOW)).toBe(2);
    expect(medianRemainingPercent(rows, first.windows[0]?.seriesId ?? "", NOW)).toBe(5);
    expect(brokeFraction(rows, NOW)).toBe(0.5);
    expect(blockedHoursRemaining(rows, NOW)).toBe(4);
  });
});
