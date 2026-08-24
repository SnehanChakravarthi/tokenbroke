import { link, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAll } from "../../src/readers";
import {
  createFileSystemAccess,
  DisallowedPathError,
  type FileAccessAttempt,
} from "../../src/readers/access";
import { createPathCandidates } from "../../src/readers/paths";
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

describe("filesystem allowlist", () => {
  it("keeps every readAll open and readdir inside the exact allowlist", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    await installClaudeFixture(fixture.home, "v2.1-limits.json");
    const rollout = await installCodexFixture(fixture.home, "legacy-rollout.jsonl");
    await installCodexFixture(fixture.home, "rollout-compressed.jsonl.zst");
    await writeFixture(join(fixture.home, ".codex", "auth.json"), "SENTINEL_CREDENTIAL");
    await writeFixture(join(fixture.home, ".codex", "history.jsonl"), "SENTINEL_HISTORY");
    await writeFixture(join(fixture.home, ".codex", "state_5.sqlite"), "SENTINEL_SQLITE");
    await writeFixture(join(fixture.home, ".claude", "backups", "state.json"), "SENTINEL_BACKUP");
    await makeRecent(rollout, new Date("2026-08-22T12:00:00.000Z"));
    const attempts: FileAccessAttempt[] = [];

    await readAll({
      homeDir: fixture.home,
      now: new Date("2026-08-22T12:00:00.000Z"),
      onAccessAttempt: (attempt) => attempts.push(attempt),
    });

    const state = join(fixture.home, ".claude.json");
    const sessions = join(fixture.home, ".codex", "sessions");
    const archived = join(fixture.home, ".codex", "archived_sessions");
    const opened = attempts.filter(({ operation }) => operation === "open");
    expect(opened.length).toBeGreaterThan(0);
    for (const { path } of opened) {
      expect(
        path === state ||
          (path.startsWith(`${sessions}/`) &&
            /^rollout-.*\.jsonl$/.test(path.split("/").at(-1) ?? "")) ||
          (path.startsWith(`${archived}/`) &&
            /^rollout-.*\.jsonl$/.test(path.split("/").at(-1) ?? "")),
      ).toBe(true);
      expect(path).not.toMatch(/auth\.json|history\.jsonl|memories|backups|\.sqlite|\.zst$/);
    }
    for (const { path } of attempts.filter(({ operation }) => operation === "readdir")) {
      expect(
        path === sessions ||
          path.startsWith(`${sessions}/`) ||
          path === archived ||
          path.startsWith(`${archived}/`),
      ).toBe(true);
    }
    const rootProbes = new Set([
      fixture.home,
      state,
      join(fixture.home, ".codex"),
      sessions,
      archived,
    ]);
    const statted = attempts.filter(({ operation }) => operation === "stat");
    expect(statted.length).toBeGreaterThan(0);
    for (const { path } of statted) {
      const isRollout =
        (path.startsWith(`${sessions}/`) || path.startsWith(`${archived}/`)) &&
        /^rollout-.*\.jsonl$/.test(path.split("/").at(-1) ?? "");
      expect(rootProbes.has(path) || isRollout).toBe(true);
    }
  });

  it("rejects a rollout symlink that escapes the canonical Codex home", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const outside = join(fixture.home, "outside.jsonl");
    const sessions = join(fixture.home, ".codex", "sessions");
    const escaped = join(sessions, "rollout-escape.jsonl");
    await mkdir(sessions, { recursive: true });
    await writeFile(outside, "{}\n");
    await symlink(outside, escaped);

    const candidates = createPathCandidates({ homeDir: fixture.home });
    const access = createFileSystemAccess(candidates);
    await expect(access.openFile(escaped)).rejects.toBeInstanceOf(DisallowedPathError);
  });

  it("rejects a rollout symlink that stays inside the Codex home but leaves the rollout trees", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const codexHome = join(fixture.home, ".codex");
    const sessions = join(codexHome, "sessions", "2026", "08", "22");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(codexHome, "auth.json"), '{"tokens":"SENTINEL_CREDENTIAL"}');
    await symlink(join(codexHome, "auth.json"), join(sessions, "rollout-evil.jsonl"));

    const candidates = createPathCandidates({ homeDir: fixture.home });
    const access = createFileSystemAccess(candidates);
    await expect(access.openFile(join(sessions, "rollout-evil.jsonl"))).rejects.toBeInstanceOf(
      DisallowedPathError,
    );
    await expect(access.statFile(join(sessions, "rollout-evil.jsonl"))).rejects.toBeInstanceOf(
      DisallowedPathError,
    );
  });

  it("rejects a Claude state symlink instead of following it to a forbidden file", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const credential = join(fixture.home, "credential.json");
    const state = join(fixture.home, ".claude.json");
    await writeFile(credential, '{"token":"SENTINEL_CREDENTIAL"}');
    await symlink(credential, state);

    const candidates = createPathCandidates({ homeDir: fixture.home });
    const access = createFileSystemAccess(candidates);
    await expect(access.openFile(state)).rejects.toBeInstanceOf(DisallowedPathError);
  });

  it("skips a hardlinked rollout without blanking the rest of the Codex reading", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const rollout = await installCodexFixture(fixture.home, "legacy-rollout.jsonl");
    await makeRecent(rollout, new Date("2026-08-22T12:00:00.000Z"));
    const codexHome = join(fixture.home, ".codex");
    await writeFile(join(codexHome, "auth.json"), '{"tokens":"SENTINEL_CREDENTIAL"}');
    await link(
      join(codexHome, "auth.json"),
      join(codexHome, "sessions", "2026", "08", "22", "rollout-zzz-hard.jsonl"),
    );

    const [, codex] = await readAll({
      homeDir: fixture.home,
      now: new Date("2026-08-22T12:00:00.000Z"),
    });
    expect(codex.observation).toBe("ok");
    expect(codex.windows.length).toBeGreaterThan(0);
    expect(JSON.stringify(codex)).not.toContain("SENTINEL");
  });

  it("rejects a rollout hardlinked to a credential file", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const codexHome = join(fixture.home, ".codex");
    const sessions = join(codexHome, "sessions", "2026", "08", "22");
    const hardlink = join(sessions, "rollout-hard.jsonl");
    await mkdir(sessions, { recursive: true });
    await writeFile(join(codexHome, "auth.json"), '{"tokens":"SENTINEL_CREDENTIAL"}');
    await link(join(codexHome, "auth.json"), hardlink);

    const candidates = createPathCandidates({ homeDir: fixture.home });
    const access = createFileSystemAccess(candidates);
    await expect(access.openFile(hardlink)).rejects.toBeInstanceOf(DisallowedPathError);
    await expect(access.statFile(hardlink)).rejects.toBeInstanceOf(DisallowedPathError);

    const [, reading] = await readAll({
      homeDir: fixture.home,
      now: new Date("2026-08-22T12:00:00.000Z"),
    });
    expect(JSON.stringify(reading)).not.toContain("SENTINEL");
  });

  it("reads a sessions tree that is itself a symlink to a canonical directory", async () => {
    const fixture = await createTestHome();
    cleanups.push(fixture.cleanup);
    const now = new Date("2026-08-22T12:00:00.000Z");
    const realSessions = join(fixture.home, "elsewhere", "sessions");
    const rollout = join(realSessions, "2026", "08", "22", "rollout-fixture.jsonl");
    await writeFixture(rollout, await readFixture("codex", "legacy-rollout.jsonl"));
    await mkdir(join(fixture.home, ".codex"), { recursive: true });
    await symlink(realSessions, join(fixture.home, ".codex", "sessions"));
    await makeRecent(rollout, now);

    const [, reading] = await readAll({ homeDir: fixture.home, now });
    expect(reading.install).toBe("found");
    expect(reading.observation).toBe("ok");
  });
});
