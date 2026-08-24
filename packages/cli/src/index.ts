import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import type { LocalReadings, SubmissionSuccessV1, ToolId } from "@tokenbroke/shared";
import { canonicalJson } from "@tokenbroke/shared/node/signing";
import { renderBoard, renderDryRun } from "./board";
import { COPY, TOOL_LABELS } from "./copy";
import { coordinateHook, runHookWorker } from "./hooks/coordinator";
import {
  HookToolError,
  type HookToolFailure,
  hookLocations,
  installHooks,
  refreshBundledCli,
} from "./hooks/install";
import { removeHooks } from "./hooks/remove";
import { hookStatus } from "./hooks/status";
import {
  CorruptIdentityError,
  ephemeralIdentity,
  loadConfig,
  pathExists,
  saveConfig,
  type TokenbrokePaths,
  tokenbrokePaths,
} from "./identity";
import { readAll } from "./readers";
import {
  buildSubmission,
  CLI_VERSION,
  redactedSubmission,
  SubmitNetworkError,
  submitReadings,
} from "./submit";

const KNOWN_FLAGS = new Set(["--json", "--dry-run", "--full", "--no-hooks-prompt"]);

function detectedTools(readings: LocalReadings): ToolId[] {
  return readings.filter((reading) => reading.install === "found").map((reading) => reading.tool);
}

function validTool(value: string | undefined): value is ToolId {
  return value === "claude-code" || value === "codex";
}

function reportToolFailures(failures: HookToolFailure[]): void {
  for (const failure of failures) {
    console.error(COPY.hooksToolError(TOOL_LABELS[failure.tool], failure.kind));
  }
}

/**
 * One place that decides which voice a failure gets. `COPY.offline` belongs to the network call and
 * nothing else; a local problem says what is actually broken on this machine.
 */
function reportFailure(error: unknown): number {
  if (error instanceof SubmitNetworkError) console.error(COPY.offline);
  else if (error instanceof CorruptIdentityError) console.error(COPY.identityCorrupt());
  else if (error instanceof HookToolError) {
    console.error(COPY.hooksToolError(TOOL_LABELS[error.tool], error.kind));
  } else {
    // Never echo unknown errors: Node fs errors embed absolute paths.
    console.error(COPY.localFailure);
  }
  return 1;
}

export const reportFailureForTest = reportFailure;

function usage(): number {
  console.error(COPY.usage());
  return 1;
}

export interface HooksOfferOptions {
  paths?: TokenbrokePaths;
  interactive?: boolean;
  ask?: (question: string) => Promise<string>;
}

async function askOnStdin(question: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}

function openInBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(command, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // The URL is printed either way; a missing opener is not an error worth surfacing.
  }
}

export async function maybeOfferClaim(
  response: SubmissionSuccessV1,
  options: HooksOfferOptions = {},
): Promise<void> {
  const interactive = options.interactive ?? process.stdout.isTTY === true;
  if (!interactive || response.identity.claimed || !response.claim) return;
  const paths = options.paths ?? tokenbrokePaths();
  const config = await loadConfig(paths);
  if (config.claimPrompted) return;
  const ask = options.ask ?? askOnStdin;
  const answer = (await ask(COPY.claimOffer(response.claim.url))).trim().toLowerCase();
  config.claimPrompted = true;
  await saveConfig(config, paths);
  if (answer === "" || answer === "y" || answer === "yes") {
    console.log(COPY.claimOpening);
    openInBrowser(response.claim.url);
  } else {
    console.log(COPY.claimLater);
  }
}

export async function maybeOfferHooks(
  readings: LocalReadings,
  scriptPath: string,
  options: HooksOfferOptions = {},
): Promise<void> {
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) return;
  const paths = options.paths ?? tokenbrokePaths();
  const config = await loadConfig(paths);
  if (config.hooksPrompted) return;
  const tools = detectedTools(readings);
  if (tools.length === 0) return;
  console.log("", COPY.hooksOffer(tools.map((tool) => TOOL_LABELS[tool])));
  const answer = await (options.ask ?? askOnStdin)(COPY.hooksPrompt);
  // Only now is the offer spent. A prompt that never returned an answer gets asked again.
  config.hooksPrompted = true;
  await saveConfig(config, paths);
  if (answer.trim().toLowerCase() !== "y") return;
  const result = await installHooks({ tools, paths, scriptPath });
  reportToolFailures(result.failures);
  if (result.installed.length > 0) {
    console.log(COPY.hooksInstalled(result.installed.map((tool) => TOOL_LABELS[tool])));
    if (result.installed.includes("codex")) console.log(COPY.hooksCodexTrust);
  }
}

async function hooksCommand(action: string | undefined, scriptPath: string): Promise<number> {
  if (action === "status") {
    const { states, failures } = await hookStatus(hookLocations());
    for (const tool of ["claude-code", "codex"] as const) {
      const state = states[tool];
      if (state) console.log(COPY.hooksStatusLine(TOOL_LABELS[tool], state));
    }
    reportToolFailures(failures);
    return failures.length > 0 ? 1 : 0;
  }
  if (action === "remove") {
    const result = await removeHooks();
    reportToolFailures(result.failures);
    if (result.removed.length > 0) console.log(COPY.hooksRemoved);
    return result.failures.length > 0 ? 1 : 0;
  }
  if (action === "install") {
    const readings = await readAll();
    const tools = detectedTools(readings);
    if (tools.length === 0) {
      console.log(COPY.noTools);
      return 2;
    }
    const result = await installHooks({ tools, scriptPath });
    reportToolFailures(result.failures);
    if (result.installed.length > 0) {
      console.log(COPY.hooksInstalled(result.installed.map((tool) => TOOL_LABELS[tool])));
      if (result.installed.includes("codex")) console.log(COPY.hooksCodexTrust);
    }
    return result.failures.length > 0 ? 1 : 0;
  }
  return usage();
}

async function manualCommand(args: string[], scriptPath: string): Promise<number> {
  const json = args.includes("--json");
  const dryRun = args.includes("--dry-run");
  const full = args.includes("--full");
  const noHooksPrompt = args.includes("--no-hooks-prompt");
  if (args.some((arg) => !KNOWN_FLAGS.has(arg)) || (json && dryRun) || (full && !dryRun)) {
    return usage();
  }

  const readings = await readAll();
  const tools = detectedTools(readings);
  if (dryRun) {
    // A rehearsal must not claim a row: the keypair lives and dies inside this process.
    const payload = buildSubmission(readings, ephemeralIdentity());
    const redacted = redactedSubmission(payload);
    if (full) {
      console.log(COPY.dryRun);
      console.log(JSON.stringify(redacted, null, 2));
    } else {
      const bytes = Buffer.byteLength(canonicalJson(payload), "utf8");
      console.log(renderDryRun(readings, redacted, bytes));
    }
    return tools.length === 0 ? 2 : 0;
  }
  if (tools.length === 0) {
    console.log(COPY.noTools);
    return 2;
  }

  let result: Awaited<ReturnType<typeof submitReadings>>;
  try {
    result = await submitReadings(readings);
  } catch (error) {
    return reportFailure(error);
  }
  if (json) {
    console.log(canonicalJson({ response: result.response, readings }));
  } else if (!result.response.ok) {
    console.error(COPY.rejected(result.response.reason));
  } else {
    console.log(renderBoard(result.response, readings));
  }
  if (!result.response.ok) return 1;

  const paths = tokenbrokePaths();
  if (await pathExists(paths.bundledCli)) {
    await refreshBundledCli(scriptPath, paths, CLI_VERSION, true);
  }
  if (!json) await maybeOfferClaim(result.response);
  if (!json && !noHooksPrompt) await maybeOfferHooks(readings, scriptPath);
  return 0;
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const scriptPath = resolve(process.argv[1] ?? "");
  if (args[0] === "hook") {
    if (validTool(args[1])) await coordinateHook(args[1], { scriptPath });
    return 0;
  }
  if (args[0] === "hook-worker") {
    if (validTool(args[1])) await runHookWorker(args[1]);
    return 0;
  }
  try {
    if (args[0] === "hooks") return await hooksCommand(args[1], scriptPath);
    return await manualCommand(args, scriptPath);
  } catch (error) {
    return reportFailure(error);
  }
}

// npm executes bins through a .bin symlink: realpath it, or import.meta.url (the real
// path) never matches and the CLI silently does nothing under npx.
function invokedHref(): string {
  const invoked = process.argv[1];
  if (!invoked) return "";
  try {
    return pathToFileURL(realpathSync(invoked)).href;
  } catch {
    return pathToFileURL(resolve(invoked)).href;
  }
}
if (import.meta.url === invokedHref()) process.exitCode = await main();
