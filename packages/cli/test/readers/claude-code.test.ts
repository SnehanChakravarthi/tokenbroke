import { afterEach, describe, expect, it } from "vitest";
import { readAll } from "../../src/readers";
import { createTestHome, installClaudeFixture } from "./helpers";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("Claude Code reader", () => {
  it("prefers versioned limits rows and returns only allowlisted data", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    await installClaudeFixture(fixture.home, "v2.1-limits.json");

    const [reading] = await readAll({
      homeDir: fixture.home,
      now: new Date("2026-08-22T12:00:00.000Z"),
    });

    expect(reading.install).toBe("found");
    expect(reading.observation).toBe("ok");
    expect(reading.plan).toEqual({ raw: "default_claude_max_5x", label: "Max 5x" });
    expect(reading.windows).toHaveLength(2);
    expect(reading.windows[0]).toMatchObject({
      limitId: "claude",
      rawKind: "session",
      windowMinutes: 300,
      usedPercent: 12.5,
      isActive: false,
    });
    expect(reading.windows[1]).toMatchObject({
      rawKind: "weekly_scoped",
      windowMinutes: 10080,
      scope: "Fable",
      usedPercent: 43,
    });
    expect(reading.drain).toEqual([]);
    expect(JSON.stringify(reading)).not.toContain("SENTINEL");
    expect(JSON.stringify(reading)).not.toContain("fixture-account");
  });

  it("falls back to flat windows and marks stale snapshots", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    await installClaudeFixture(fixture.home, "v1-flat.json");

    const [reading] = await readAll({
      homeDir: fixture.home,
      now: new Date("2026-08-24T12:00:00.000Z"),
    });

    expect(reading.windows.map(({ rawKind, usedPercent }) => ({ rawKind, usedPercent }))).toEqual([
      { rawKind: "five_hour", usedPercent: 7 },
      { rawKind: "seven_day", usedPercent: 31 },
    ]);
    expect(reading.warnings).toContain("snapshot-stale");
    expect(reading.warnings).toContain("plan-unknown");
    expect(JSON.stringify(reading)).not.toContain("SENTINEL");
  });
  it("drops hostile limit rows and unbounded plan identifiers", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    await installClaudeFixture(fixture.home, "hostile-limits.json");

    const [reading] = await readAll({
      homeDir: fixture.home,
      now: new Date("2026-08-22T12:00:00.000Z"),
    });

    expect(reading.observation).toBe("ok");
    // organizationType fails the shape check, so the plan falls through to the next allowed field.
    expect(reading.plan).toEqual({ raw: "default_claude_max_20x", label: "Max 20x" });
    expect(reading.windows.map(({ rawKind }) => rawKind)).toEqual(["session"]);
    const serialized = JSON.stringify(reading);
    expect(serialized).not.toContain("user@corp.example");
    expect(serialized).not.toContain("<script>");
    expect(serialized).not.toContain("@");
    expect(serialized).not.toContain("SENTINEL");
  });
});
