import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAll } from "../../src/readers";
import {
  createTestHome,
  installClaudeFixture,
  installCodexFixture,
  makeRecent,
  readFixture,
  writeFixture,
} from "./helpers";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

describe("readAll", () => {
  it("always returns both tools in fixed order and isolates failure", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    await installClaudeFixture(fixture.home, "v2.1-limits.json");
    await mkdir(join(fixture.home, ".codex"));

    const readings = await readAll({ homeDir: fixture.home });
    expect(readings.map(({ tool }) => tool)).toEqual(["claude-code", "codex"]);
    expect(readings[0].observation).toBe("ok");
    expect(readings[1].observation).toBe("no-snapshot");
  });

  it("marks set but invalid overrides without falling back", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    await installClaudeFixture(fixture.home, "v2.1-limits.json");
    await mkdir(join(fixture.home, ".codex"));
    const notDirectory = join(fixture.home, "not-a-directory");
    await writeFile(notDirectory, "fixture");

    const readings = await readAll({
      homeDir: fixture.home,
      env: {
        CLAUDE_CONFIG_DIR: "relative-config",
        CODEX_HOME: notDirectory,
      },
    });
    expect(readings[0].install).toBe("invalid-override");
    expect(readings[1].install).toBe("invalid-override");
  });

  it("uses one valid root from each environment override", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const claudeRoot = join(fixture.home, "claude-profile");
    const codexHome = join(fixture.home, "codex-profile");
    await writeFixture(
      join(claudeRoot, ".claude.json"),
      await readFixture("claude-code", "v2.1-limits.json"),
    );
    const rollout = join(codexHome, "sessions", "2026", "08", "22", "rollout-fixture.jsonl");
    await writeFixture(rollout, await readFixture("codex", "legacy-rollout.jsonl"));
    await makeRecent(rollout, new Date("2026-08-22T12:00:00.000Z"));

    const readings = await readAll({
      homeDir: fixture.home,
      env: { CLAUDE_CONFIG_DIR: claudeRoot, CODEX_HOME: codexHome },
      now: new Date("2026-08-22T12:00:00.000Z"),
    });
    expect(readings.map(({ install, observation }) => ({ install, observation }))).toEqual([
      { install: "found", observation: "ok" },
      { install: "found", observation: "ok" },
    ]);
  });

  it("uses configurable evidence budgets and degrades on timeout", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const rollout = await installCodexFixture(fixture.home, "legacy-rollout.jsonl");
    await makeRecent(rollout, new Date("2026-08-22T12:00:00.000Z"));

    const [, codex] = await readAll({
      homeDir: fixture.home,
      now: new Date("2026-08-22T12:00:00.000Z"),
      evidenceBudgetMs: 0,
    });
    expect(codex.observation).toBe("ok");
    expect(codex.windows).not.toEqual([]);
    expect(codex.warnings).toContain("evidence-timed-out");
  });
});
