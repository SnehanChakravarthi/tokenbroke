import { access, chmod, mkdir, readdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireHookLease, HOOK_LEASE_MS } from "../src/hooks/coordinator";
import { installHooks } from "../src/hooks/install";
import { removeHooks } from "../src/hooks/remove";
import { hookStatus } from "../src/hooks/status";
import { loadConfig, tokenbrokePaths } from "../src/identity";
import { createTestHome, type TestHome } from "./readers/helpers";

let testHome: TestHome | undefined;
afterEach(async () => testHome?.cleanup());

async function everyFileUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
}

interface Fixture {
  paths: ReturnType<typeof tokenbrokePaths>;
  locations: { claudeSettings: string; codexHooks: string };
  options: {
    paths: ReturnType<typeof tokenbrokePaths>;
    locations: { claudeSettings: string; codexHooks: string };
    execPath: string;
    scriptPath: string;
  };
}

async function fixture(home: string, claude: string, codex: string): Promise<Fixture> {
  const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(home, "state") });
  const locations = {
    claudeSettings: join(home, ".claude", "settings.json"),
    codexHooks: join(home, ".codex", "hooks.json"),
  };
  await mkdir(join(home, ".claude"), { recursive: true });
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(locations.claudeSettings, claude);
  await writeFile(locations.codexHooks, codex);
  const scriptPath = join(home, "dist.js");
  await writeFile(scriptPath, "console.log('fixture')\n");
  return {
    paths,
    locations,
    options: { paths, locations, execPath: process.execPath, scriptPath },
  };
}

const CLAUDE_PRETTY = `{
  "theme": "dark",
  "hooks": {
    "Stop": []
  }
}
`;
const CODEX_PRETTY = `{
  "notify": [
    "existing",
    "command"
  ],
  "hooks": {
    "Stop": []
  }
}
`;

describe("hook lifecycle", () => {
  it("is idempotent, preserves notify, and restores both files byte-for-byte", async () => {
    testHome = await createTestHome();
    const { paths, locations, options } = await fixture(testHome.home, CLAUDE_PRETTY, CODEX_PRETTY);

    expect(await installHooks(options)).toMatchObject({ failures: [] });
    const firstClaude = await readFile(locations.claudeSettings, "utf8");
    const firstCodex = await readFile(locations.codexHooks, "utf8");
    expect(JSON.parse(firstCodex).notify).toEqual(["existing", "command"]);
    expect(JSON.parse(firstClaude).hooks.Stop[0].hooks[0]).toMatchObject({
      args: [paths.bundledCli, "hook", "claude-code"],
      async: true,
      timeout: 10,
    });
    expect(JSON.parse(firstCodex).hooks.Stop[0].hooks[0]).toMatchObject({ async: true });

    await installHooks(options);
    expect(await readFile(locations.claudeSettings, "utf8")).toBe(firstClaude);
    expect(await readFile(locations.codexHooks, "utf8")).toBe(firstCodex);
    expect((await hookStatus(locations)).states).toEqual({
      "claude-code": "trusted",
      codex: "installed",
    });
    const trustedCodex = JSON.parse(firstCodex);
    trustedCodex.hooks.Stop[0].enabled = true;
    await writeFile(locations.codexHooks, JSON.stringify(trustedCodex));
    expect((await hookStatus(locations)).states.codex).toBe("trusted");
    await writeFile(locations.codexHooks, firstCodex);

    expect(await removeHooks({ paths, locations })).toMatchObject({ failures: [] });
    expect(await readFile(locations.claudeSettings, "utf8")).toBe(CLAUDE_PRETTY);
    expect(await readFile(locations.codexHooks, "utf8")).toBe(CODEX_PRETTY);
    await expect(access(paths.bundledCli)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports a missing installed node as stale", async () => {
    testHome = await createTestHome();
    const { locations, options } = await fixture(testHome.home, "{}\n", "{}\n");
    await installHooks({ ...options, execPath: join(testHome.home, "gone-node") });
    expect((await hookStatus(locations)).states).toEqual({
      "claude-code": "stale-node",
      codex: "stale-node",
    });
  });

  it("keeps the user's indent and trailing-newline state (F4)", async () => {
    testHome = await createTestHome();
    // Tab-indented, no trailing newline, no hooks block of its own yet.
    const claudeOriginal = '{\n\t"theme": "dark",\n\t"permissions": {\n\t\t"allow": []\n\t}\n}';
    const codexOriginal = '{"notify":["existing"],"hooks":{"Stop":[]}}';
    const { locations, options } = await fixture(testHome.home, claudeOriginal, codexOriginal);
    await installHooks(options);

    const claude = await readFile(locations.claudeSettings, "utf8");
    const claudeLines = claude.split("\n");
    // Every line the user wrote is still there, byte for byte.
    for (const line of claudeOriginal.split("\n").slice(0, -1)) {
      expect(claudeLines).toContain(line);
    }
    // The block we added is tab-indented too, and nothing switched to spaces.
    expect(claude).toContain('\n\t"hooks": {');
    expect(claude).toContain('\n\t\t"Stop": [');
    expect(claude).not.toContain("\n  ");
    // No trailing newline was invented for a file that never had one.
    expect(claude.endsWith("\n")).toBe(false);

    // A fully minified file offers no indent to detect, so the two-space fallback applies.
    const codex = await readFile(locations.codexHooks, "utf8");
    expect(JSON.parse(codex).notify).toEqual(["existing"]);
    expect(codex.endsWith("\n")).toBe(false);
    expect(codex).toContain('\n  "notify"');

    await removeHooks({ paths: options.paths, locations });
    const restored = await readFile(locations.claudeSettings, "utf8");
    expect(restored.endsWith("\n")).toBe(false);
    expect(restored).not.toContain("\n  ");
    expect(JSON.parse(restored)).toMatchObject({ theme: "dark", hooks: { Stop: [] } });
    expect((await readFile(locations.codexHooks, "utf8")).endsWith("\n")).toBe(false);
    expect(JSON.parse(await readFile(locations.codexHooks, "utf8"))).toEqual(
      JSON.parse(codexOriginal),
    );
  });

  it("never copies the user's settings into our own directory (F5)", async () => {
    testHome = await createTestHome();
    const claudeOriginal = `{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-SENTINEL"
  },
  "hooks": {
    "Stop": []
  }
}
`;
    const { paths, locations, options } = await fixture(
      testHome.home,
      claudeOriginal,
      CODEX_PRETTY,
    );
    await installHooks(options);

    const ourFiles = await everyFileUnder(paths.home);
    expect(ourFiles.length).toBeGreaterThan(0);
    for (const file of ourFiles) {
      expect(await readFile(file, "utf8")).not.toContain("SENTINEL");
    }
    const config = await loadConfig(paths);
    expect(config.hookInstalls?.["claude-code"]).toMatchObject({
      file: locations.claudeSettings,
      event: "Stop",
    });
    expect(JSON.stringify(config)).not.toContain("SENTINEL");
    expect(config.hookInstalls?.["claude-code"]?.markerId).toEqual(expect.any(String));

    await removeHooks({ paths, locations });
    expect(await readFile(locations.claudeSettings, "utf8")).toBe(claudeOriginal);
  });

  it("preserves the file mode across install and remove (F6)", async () => {
    testHome = await createTestHome();
    const { paths, locations, options } = await fixture(testHome.home, CLAUDE_PRETTY, CODEX_PRETTY);
    if (process.platform === "win32") return;
    await chmod(locations.claudeSettings, 0o644);
    await chmod(locations.codexHooks, 0o644);

    await installHooks(options);
    expect((await stat(locations.claudeSettings)).mode & 0o777).toBe(0o644);
    expect((await stat(locations.codexHooks)).mode & 0o777).toBe(0o644);

    await removeHooks({ paths, locations });
    expect((await stat(locations.claudeSettings)).mode & 0o777).toBe(0o644);
    expect((await stat(locations.codexHooks)).mode & 0o777).toBe(0o644);
  });

  it("isolates one tool's broken settings file from the other (F2)", async () => {
    testHome = await createTestHome();
    const { paths, locations, options } = await fixture(testHome.home, CLAUDE_PRETTY, CODEX_PRETTY);
    await installHooks(options);
    await writeFile(locations.claudeSettings, "{ this is not json");

    expect(await hookStatus(locations)).toEqual({
      states: { codex: "installed" },
      failures: [{ tool: "claude-code", kind: "malformed" }],
    });

    const removal = await removeHooks({ paths, locations });
    expect(removal.failures).toEqual([{ tool: "claude-code", kind: "malformed" }]);
    expect(removal.removed).toEqual(["codex"]);
    // Codex is clean and the shared bin is gone even though Claude Code failed.
    expect(await readFile(locations.codexHooks, "utf8")).toBe(CODEX_PRETTY);
    await expect(access(paths.bundledCli)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(paths.binDir)).rejects.toMatchObject({ code: "ENOENT" });
    // The broken file is left exactly as the user left it.
    expect(await readFile(locations.claudeSettings, "utf8")).toBe("{ this is not json");

    const reinstall = await installHooks(options);
    expect(reinstall.installed).toEqual(["codex"]);
    expect(reinstall.failures).toEqual([{ tool: "claude-code", kind: "malformed" }]);
  });
});

describe("hook lease", () => {
  it("admits one process per five-minute lease", async () => {
    testHome = await createTestHome();
    const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(testHome.home, "state") });
    await mkdir(paths.home, { recursive: true });
    expect(await acquireHookLease(paths)).toBe(true);
    expect(await acquireHookLease(paths)).toBe(false);
    const stale = new Date(Date.now() - HOOK_LEASE_MS - 1000);
    await utimes(paths.hookLock, stale, stale);
    expect(await acquireHookLease(paths)).toBe(true);
  });
});
