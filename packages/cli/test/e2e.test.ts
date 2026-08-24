import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, rename, stat, utimes, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { BRAND, type SubmissionSuccessV1 } from "@tokenbroke/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type StubServer, startStubServer } from "../scripts/stub-server";
import { COPY } from "../src/copy";
import { HOOK_LEASE_MS } from "../src/hooks/coordinator";
import { tokenbrokePaths } from "../src/identity";
import { createTestHome, type TestHome } from "./readers/helpers";

const execFile = promisify(execFileCallback);
const CLI_ROOT = resolve(import.meta.dirname, "..");
const DIST = join(CLI_ROOT, "dist", "index.js");

let testHome: TestHome;
let stub: StubServer;
let env: NodeJS.ProcessEnv;
let claudeState: string;

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFile(process.execPath, [DIST, ...args], { env, timeout: 15_000 });
}

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Like runCli, but for the runs we expect to fail: keep the exit code instead of throwing. */
async function runCliExpectingFailure(args: string[]): Promise<CliRun> {
  try {
    const { stdout, stderr } = await runCli(args);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failed.code ?? 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? "" };
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((settle) => {
    setTimeout(settle, ms);
  });

/**
 * The last hook run spawned a detached worker. It writes last-submission.json after the server has
 * already recorded the submission, so the temp home is not safe to delete until that lands.
 */
async function waitForHookWorker(): Promise<void> {
  const paths = tokenbrokePaths(env);
  const expected = stub?.submissions.at(-1)?.submittedAt;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const last = await readFile(paths.lastSubmission, "utf8").catch(() => null);
    if (last !== null && (expected === undefined || last.includes(expected))) break;
    await sleep(50);
  }
  // The lock file outlives the worker by design; give the last handle a beat to close.
  await stat(paths.hookLock).catch(() => null);
  await sleep(100);
}

async function cleanupHome(): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await testHome.cleanup();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOTEMPTY" || attempt >= 5) throw error;
      await sleep(100);
    }
  }
}

async function writeClaude(usedPercent: number): Promise<void> {
  const now = Date.now();
  await writeFile(
    claudeState,
    JSON.stringify({
      oauthAccount: { organizationRateLimitTier: "default_claude_max_5x" },
      cachedUsageUtilization: {
        fetchedAtMs: now,
        utilization: {
          limits: [
            {
              kind: "session",
              group: "session",
              percent: usedPercent,
              resets_at: new Date(now + 4 * 3_600_000).toISOString(),
              scope: null,
              is_active: true,
            },
          ],
        },
      },
    }),
  );
}

async function waitForSubmissions(count: number): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (stub.submissions.length < count && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  expect(stub.submissions).toHaveLength(count);
}

beforeAll(async () => {
  await execFile(
    process.execPath,
    [join(CLI_ROOT, "node_modules", "tsup", "dist", "cli-default.js")],
    { cwd: CLI_ROOT, timeout: 30_000 },
  );
  testHome = await createTestHome();
  stub = await startStubServer();
  const claudeRoot = join(testHome.home, "claude-config");
  const codexHome = join(testHome.home, ".codex");
  claudeState = join(claudeRoot, ".claude.json");
  await mkdir(claudeRoot, { recursive: true });
  await mkdir(join(codexHome, "sessions", "2026", "08", "23"), { recursive: true });
  await writeClaude(98);
  const now = Date.now();
  await writeFile(
    join(codexHome, "sessions", "2026", "08", "23", "rollout-e2e.jsonl"),
    `${JSON.stringify({
      timestamp: new Date(now).toISOString(),
      type: "event_msg",
      payload: {
        type: "token_count",
        rate_limits: {
          limit_id: "codex",
          primary: {
            used_percent: 97,
            window_minutes: 300,
            resets_at: Math.floor((now + 3 * 3_600_000) / 1000),
          },
          plan_type: "plus",
        },
      },
    })}\n`,
  );
  env = {
    ...process.env,
    TOKENBROKE_HOME: join(testHome.home, "state"),
    TOKENBROKE_API_URL: stub.url,
    CLAUDE_CONFIG_DIR: claudeRoot,
    CODEX_HOME: codexHome,
  };
}, 40_000);

afterAll(async () => {
  if (testHome) await waitForHookWorker();
  await stub?.close();
  if (testHome) await cleanupHome();
});

describe("built CLI against the local stub", () => {
  it("persists identity/name and submits hooks only for changed windows", async () => {
    const paths = tokenbrokePaths(env);
    const dryRun = await runCli(["--dry-run", "--no-hooks-prompt"]);
    expect(dryRun.stdout).toContain("network skipped");
    expect(dryRun.stdout).not.toContain("PRIVATE KEY");
    // The summary must stay human-sized even with thousands of drain samples in the payload.
    expect(dryRun.stdout.split("\n").length).toBeLessThan(40);
    expect(dryRun.stdout).toContain("bytes");
    const fullDryRun = await runCli(["--dry-run", "--full", "--no-hooks-prompt"]);
    expect(fullDryRun.stdout).toContain('"schemaVersion": 1');
    expect(fullDryRun.stdout).toContain('"publicKey": "[redacted]"');
    expect(fullDryRun.stdout).not.toContain("/Users");
    expect(stub.submissions).toHaveLength(0);
    // A rehearsal claims nothing: no keypair was written (F12d).
    await expect(stat(paths.identity)).rejects.toMatchObject({ code: "ENOENT" });

    const first = await runCli(["--no-hooks-prompt"]);
    expect(first.stderr).toBe("");
    expect(first.stdout).toContain("◀ you");
    expect(first.stdout).toContain(`${BRAND.domain}/claim/`);
    expect(stub.submissions).toHaveLength(1);
    const identity = JSON.parse(await readFile(paths.identity, "utf8")) as { deviceId: string };
    const config = JSON.parse(await readFile(paths.config, "utf8")) as { anonymousName: string };

    const second = await runCli(["--json", "--no-hooks-prompt"]);
    const result = JSON.parse(second.stdout) as { response: SubmissionSuccessV1 };
    expect(result.response.identity.deviceId).toBe(identity.deviceId);
    expect(result.response.identity.anonymousName).toBe(config.anonymousName);
    expect(stub.submissions).toHaveLength(2);

    const unchanged = await runCli(["hook", "claude-code"]);
    expect(unchanged).toEqual({ stdout: "", stderr: "" });
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
    expect(stub.submissions).toHaveLength(2);

    await writeClaude(99);
    const stale = new Date(Date.now() - HOOK_LEASE_MS - 1_000);
    await utimes(paths.hookLock, stale, stale);
    const changed = await runCli(["hook", "claude-code"]);
    expect(changed).toEqual({ stdout: "", stderr: "" });
    await waitForSubmissions(3);
    expect(stub.submissions.at(-1)?.trigger).toBe("hook:claude-code");
  }, 30_000);

  it("blames the local file, not the network, for a corrupt identity (F3)", async () => {
    const paths = tokenbrokePaths(env);
    const aside = `${paths.identity}.aside`;
    await rename(paths.identity, aside);
    await writeFile(paths.identity, "{ half a keypair");
    try {
      const run = await runCliExpectingFailure(["--no-hooks-prompt"]);
      expect(run.code).toBe(1);
      expect(run.stderr).toContain(COPY.identityCorrupt());
      expect(run.stderr).not.toContain(COPY.offline);
      // The advice has to be followable: no absolute path from this machine leaked into it.
      expect(run.stderr).not.toContain(paths.home);
    } finally {
      await rename(aside, paths.identity);
    }
  }, 20_000);

  it("prints the usage block for an unknown flag (F3)", async () => {
    const run = await runCliExpectingFailure(["--freeloader"]);
    expect(run.code).toBe(1);
    expect(run.stderr.trim()).toBe(COPY.usage());
    expect(run.stdout).toBe("");
  }, 20_000);
});
