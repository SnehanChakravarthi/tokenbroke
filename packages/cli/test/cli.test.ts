import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { BRAND } from "@tokenbroke/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COPY } from "../src/copy";
import { hookStatus } from "../src/hooks/status";
import { loadConfig, tokenbrokePaths } from "../src/identity";
import { main, maybeOfferHooks } from "../src/index";
import { localReadings } from "./fixtures";
import { createTestHome, type TestHome } from "./readers/helpers";

let testHome: TestHome | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await testHome?.cleanup();
});

describe("command surface", () => {
  it("prints the usage block and exits 1 for an unknown flag (F3)", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.join(" "));
    });
    expect(await main(["--turbo"])).toBe(1);
    const printed = errors.join("\n");
    expect(printed).toBe(COPY.usage());
    // The whole documented surface, and nothing that pretends the network was at fault.
    for (const fragment of ["hooks install|remove|status", "--json", "--dry-run", "hook <tool>"]) {
      expect(printed).toContain(fragment);
    }
    expect(printed).not.toContain(COPY.offline);
  });

  it("rejects mutually exclusive flags with the same usage block (F3)", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.join(" "));
    });
    expect(await main(["--json", "--dry-run"])).toBe(1);
    expect(await main(["hooks", "frobnicate"])).toBe(1);
    expect(errors).toEqual([COPY.usage(), COPY.usage()]);
  });

  it("names the identity file without leaking an absolute path (F3)", () => {
    const message = COPY.identityCorrupt();
    expect(message).toContain(`~/${BRAND.configDirName}/identity.json`);
    for (const word of message.split(/\s+/)) {
      expect(isAbsolute(word)).toBe(false);
    }
  });
});

describe("first-run hooks offer", () => {
  it("spends the offer only once the prompt has answered (F12b)", async () => {
    testHome = await createTestHome();
    const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(testHome.home, "state") });
    await mkdir(paths.home, { recursive: true });
    const scriptPath = join(testHome.home, "dist.js");
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    // A prompt that never returns an answer (Ctrl-C, closed pipe) must not burn the offer.
    await expect(
      maybeOfferHooks(localReadings(), scriptPath, {
        paths,
        interactive: true,
        ask: async () => {
          throw new Error("stdin closed");
        },
      }),
    ).rejects.toThrow("stdin closed");
    expect(await loadConfig(paths)).not.toMatchObject({ hooksPrompted: true });

    // A plain "no" is still an answer, so the offer is spent and nothing gets installed.
    await maybeOfferHooks(localReadings(), scriptPath, {
      paths,
      interactive: true,
      ask: async () => "n",
    });
    expect(await loadConfig(paths)).toMatchObject({ hooksPrompted: true });
    expect(
      (
        await hookStatus({
          claudeSettings: join(testHome.home, ".claude", "settings.json"),
          codexHooks: join(testHome.home, ".codex", "hooks.json"),
        })
      ).states,
    ).toEqual({ "claude-code": "missing", codex: "missing" });

    // Answered once, never asked again.
    let asked = false;
    await maybeOfferHooks(localReadings(), scriptPath, {
      paths,
      interactive: true,
      ask: async () => {
        asked = true;
        return "y";
      },
    });
    expect(asked).toBe(false);
    await expect(readFile(paths.bundledCli, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("reportFailure hygiene", () => {
  it("never echoes an unknown error's message (fs errors carry absolute paths)", async () => {
    const { reportFailureForTest } = await import("../src/index");
    const lines: string[] = [];
    const original = console.error;
    console.error = (line: unknown) => {
      lines.push(String(line));
    };
    try {
      reportFailureForTest(
        new Error("EACCES: permission denied, open '/Users/someone/.claude/settings.json'"),
      );
    } finally {
      console.error = original;
    }
    expect(lines.join("\n")).not.toContain("/Users");
    expect(lines.join("\n")).not.toContain("EACCES");
  });
});

describe("bin entry under npx-style symlink", () => {
  it("runs main when invoked through a symlink like npm's .bin shim", async () => {
    const { execFile } = await import("node:child_process");
    const { copyFile, mkdtemp, symlink, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join, resolve } = await import("node:path");
    const { promisify } = await import("node:util");
    const dir = await mkdtemp(join(tmpdir(), "tokenbroke-bin-"));
    const link = join(dir, "tokenbroke");
    // Symlink to a private copy: the live dist/ can be rebuilt by the e2e suite mid-run.
    const target = join(dir, "index.js");
    await copyFile(resolve("dist/index.js"), target);
    await symlink(target, link);
    try {
      // Empty tool homes make this hermetic: with nothing to read, --dry-run exits 2
      // everywhere (dev machines and CI alike). The regression under test is only that
      // the bin entry reaches main() when invoked through npm's .bin symlink.
      const result = await promisify(execFile)("node", [link, "--dry-run"], {
        env: {
          ...process.env,
          TOKENBROKE_HOME: join(dir, "home"),
          CLAUDE_CONFIG_DIR: join(dir, "claude"),
          CODEX_HOME: join(dir, "codex"),
        },
      }).catch((error: { code?: number; stdout?: string }) => {
        if (error.code === 2 && typeof error.stdout === "string") {
          return { stdout: error.stdout };
        }
        throw error;
      });
      expect(result.stdout).toContain("network skipped");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
