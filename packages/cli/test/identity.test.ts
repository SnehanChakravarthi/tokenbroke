import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CorruptIdentityError,
  ephemeralIdentity,
  loadConfig,
  loadOrCreateIdentity,
  saveConfig,
  tokenbrokePaths,
} from "../src/identity";
import { createTestHome, type TestHome } from "./readers/helpers";

let testHome: TestHome | undefined;
afterEach(async () => testHome?.cleanup());

describe("identity", () => {
  it("persists one valid device identity with private file permissions", async () => {
    testHome = await createTestHome();
    const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(testHome.home, "state") });
    const first = await loadOrCreateIdentity(paths);
    const second = await loadOrCreateIdentity(paths);
    expect(second).toEqual(first);
    if (process.platform !== "win32") expect((await stat(paths.identity)).mode & 0o777).toBe(0o600);
  });

  it("hands six concurrent creators the same identity (F1)", async () => {
    testHome = await createTestHome();
    const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(testHome.home, "state") });
    const results = await Promise.all(Array.from({ length: 6 }, () => loadOrCreateIdentity(paths)));
    const deviceIds = new Set(results.map((identity) => identity.deviceId));
    expect(deviceIds.size).toBe(1);
    // The one that won the `wx` race is the one on disk, and it is the only file there.
    const onDisk = JSON.parse(await readFile(paths.identity, "utf8")) as { deviceId: string };
    expect([...deviceIds][0]).toBe(onDisk.deviceId);
    expect((await readdir(paths.home)).filter((name) => name.startsWith("identity"))).toEqual([
      "identity.json",
    ]);
    expect(await loadOrCreateIdentity(paths)).toEqual(results[0]);
  });

  it("refuses to silently replace an unreadable identity (F3)", async () => {
    testHome = await createTestHome();
    const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(testHome.home, "state") });
    await mkdir(paths.home, { recursive: true });
    await writeFile(paths.identity, "{ not json");
    await expect(loadOrCreateIdentity(paths)).rejects.toBeInstanceOf(CorruptIdentityError);

    await writeFile(
      paths.identity,
      JSON.stringify({ deviceId: "wrong", publicKey: "", privateKey: "" }),
    );
    await expect(loadOrCreateIdentity(paths)).rejects.toBeInstanceOf(CorruptIdentityError);
    // The user's file is left exactly where it was for them to move aside or restore.
    expect(await readFile(paths.identity, "utf8")).toContain("wrong");
  });

  it("mints an ephemeral identity without touching the disk (F12d)", async () => {
    testHome = await createTestHome();
    const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(testHome.home, "state") });
    const identity = ephemeralIdentity();
    expect(identity.deviceId).toEqual(expect.any(String));
    expect(ephemeralIdentity().deviceId).not.toBe(identity.deviceId);
    await expect(stat(paths.identity)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("atomically round-trips config", async () => {
    testHome = await createTestHome();
    const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(testHome.home, "state") });
    await mkdir(paths.home, { recursive: true });
    await saveConfig({ anonymousName: "starving-crab-42" }, paths);
    expect(await loadConfig(paths)).toEqual({ anonymousName: "starving-crab-42" });
    expect(await readFile(paths.config, "utf8")).toContain("starving-crab-42");
  });
});
