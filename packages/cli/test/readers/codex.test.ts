import { afterEach, describe, expect, it } from "vitest";
import { readAll } from "../../src/readers";
import { createTestHome, installCodexFixture, makeRecent } from "./helpers";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("Codex reader", () => {
  it("reads legacy and paginated rollouts without losing series identity", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const now = new Date("2026-08-22T12:00:00.000Z");
    const files = await Promise.all([
      installCodexFixture(fixture.home, "legacy-rollout.jsonl"),
      installCodexFixture(fixture.home, "paginated-rollout.jsonl"),
      installCodexFixture(fixture.home, "partial-final-line.jsonl"),
      installCodexFixture(fixture.home, "rollout-compressed.jsonl.zst"),
    ]);
    await Promise.all(files.map((path) => makeRecent(path, now)));

    const [, reading] = await readAll({ homeDir: fixture.home, now });

    expect(reading.install).toBe("found");
    expect(reading.observation).toBe("ok");
    expect(reading.plan).toEqual({ raw: "plus", label: "Plus" });
    expect(reading.windows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          limitId: "codex",
          rawKind: "primary",
          windowMinutes: 300,
          usedPercent: 44,
        }),
      ]),
    );
    expect(reading.drain.length).toBeGreaterThanOrEqual(6);
    expect(reading.drain.map((sample) => sample.at)).toEqual(
      [...reading.drain.map((sample) => sample.at)].sort(),
    );
    expect(reading.drain.some(({ seriesId }) => seriesId.startsWith("codex_other:"))).toBe(true);
    expect(reading.drain.some(({ resetsAt }) => resetsAt === null)).toBe(true);
    expect(new Set(reading.drain.map(({ at, seriesId }) => `${seriesId}:${at}`)).size).toBe(
      reading.drain.length,
    );
    expect(reading.warnings).toContain("compressed-rollouts-skipped");
    expect(reading.warnings).toContain("malformed-lines-skipped");
    expect(JSON.stringify(reading)).not.toContain("SENTINEL");
    expect(JSON.stringify(reading)).not.toContain("fixture-session");
  });

  it("falls back to archived sessions", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const now = new Date("2026-08-22T12:00:00.000Z");
    const file = await installCodexFixture(
      fixture.home,
      "legacy-rollout.jsonl",
      "archived_sessions",
    );
    await makeRecent(file, now);

    const [, reading] = await readAll({ homeDir: fixture.home, now });
    expect(reading.observation).toBe("ok");
    expect(reading.warnings).toContain("archived-fallback-used");
  });

  it("reports unsupported format when only compressed rollouts exist", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const file = await installCodexFixture(fixture.home, "rollout-compressed.jsonl.zst");
    await makeRecent(file, new Date("2026-08-22T12:00:00.000Z"));

    const [, reading] = await readAll({
      homeDir: fixture.home,
      now: new Date("2026-08-22T12:00:00.000Z"),
    });
    expect(reading.observation).toBe("unsupported-format");
    expect(reading.windows).toEqual([]);
  });

  it("refuses unbounded identifiers from a hostile rollout", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const now = new Date("2026-08-22T12:00:00.000Z");
    const rollout = await installCodexFixture(fixture.home, "hostile-rollout.jsonl");
    await makeRecent(rollout, now);

    const [, reading] = await readAll({ homeDir: fixture.home, now });

    expect(reading.observation).toBe("ok");
    expect(reading.windows.map(({ limitId }) => limitId)).toEqual(["codex", "codex"]);
    expect(reading.plan).toEqual({ raw: null, label: null });
    expect(reading.warnings).toContain("plan-unknown");
    const serialized = JSON.stringify(reading);
    expect(serialized).not.toContain("user@corp.example");
    expect(serialized).not.toContain("<script>");
    expect(serialized).not.toContain("SENTINEL");
  });
});
