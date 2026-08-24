import { createHash, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { BRAND, type ToolId } from "@tokenbroke/shared";
import {
  atomicWriteText,
  fileMode,
  loadConfig,
  pathExists,
  saveConfig,
  type TokenbrokePaths,
  tokenbrokePaths,
} from "../identity";
import { CLI_VERSION } from "../submit";

export interface HookLocations {
  claudeSettings: string;
  codexHooks: string;
}

export interface HookInstallOptions {
  tools?: ToolId[];
  paths?: TokenbrokePaths;
  locations?: HookLocations;
  execPath?: string;
  scriptPath?: string;
  version?: string;
}

/** What went wrong with one tool's settings file, in the user's terms rather than errno's. */
export type HookFailureKind = "malformed" | "unreadable" | "unwritable";

export interface HookToolFailure {
  tool: ToolId;
  kind: HookFailureKind;
}

/** One tool's failure, carried so the other tool's install/remove/status can still finish. */
export class HookToolError extends Error {
  readonly tool: ToolId;
  readonly kind: HookFailureKind;
  constructor(tool: ToolId, kind: HookFailureKind, cause?: unknown) {
    super(`${tool} settings file is ${kind}`, { cause });
    this.name = "HookToolError";
    this.tool = tool;
    this.kind = kind;
  }
}

export interface HookInstallResult {
  installed: ToolId[];
  failures: HookToolFailure[];
}

type JsonObject = Record<string, unknown>;

export function hookLocations(env: NodeJS.ProcessEnv = process.env): HookLocations {
  const home = homedir();
  const claudeRoot = env.CLAUDE_CONFIG_DIR ? resolve(env.CLAUDE_CONFIG_DIR) : join(home, ".claude");
  const codexRoot = env.CODEX_HOME ? resolve(env.CODEX_HOME) : join(home, ".codex");
  return {
    claudeSettings: join(claudeRoot, "settings.json"),
    codexHooks: join(codexRoot, "hooks.json"),
  };
}

export function locationFor(tool: ToolId, locations: HookLocations): string {
  return tool === "claude-code" ? locations.claudeSettings : locations.codexHooks;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readConfigText(path: string): Promise<string | null> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
}

/** Read one tool's settings file, tagging any failure with the tool it belongs to. */
export async function readToolConfig(tool: ToolId, path: string): Promise<string | null> {
  try {
    return await readConfigText(path);
  } catch (error) {
    throw new HookToolError(tool, "unreadable", error);
  }
}

export function parseConfig(raw: string | null): JsonObject {
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (!isObject(value)) throw new Error("hook configuration must be a JSON object");
  return value;
}

export function parseToolConfig(tool: ToolId, raw: string | null): JsonObject {
  try {
    return parseConfig(raw);
  } catch (error) {
    throw new HookToolError(tool, "malformed", error);
  }
}

/**
 * The indent the user already writes this file with: the leading whitespace of the first indented
 * line, tabs or spaces. A minified or empty file has none, so fall back to two spaces.
 */
export function detectIndent(raw: string | null): string {
  const match = raw?.match(/\n([ \t]+)\S/);
  return match?.[1] ?? "  ";
}

/** The file's trailing newline, or the empty string if it does not end with one. */
export function detectTrailingNewline(raw: string | null): string {
  if (raw === null || raw.length === 0) return "\n";
  return raw.match(/\r?\n$/)?.[0] ?? "";
}

/** Re-serialize a parsed config in the shape the file was already written in. */
export function serializeConfig(config: JsonObject, original: string | null): string {
  return `${JSON.stringify(config, null, detectIndent(original))}${detectTrailingNewline(original)}`;
}

export function hookHandlers(config: JsonObject): JsonObject[] {
  if (!isObject(config.hooks) || !Array.isArray(config.hooks.Stop)) return [];
  const handlers: JsonObject[] = [];
  for (const group of config.hooks.Stop) {
    if (!isObject(group) || !Array.isArray(group.hooks)) continue;
    for (const handler of group.hooks) if (isObject(handler)) handlers.push(handler);
  }
  return handlers;
}

function commandText(handler: JsonObject): string {
  const command = typeof handler.command === "string" ? handler.command : "";
  const args = Array.isArray(handler.args)
    ? handler.args.filter((value): value is string => typeof value === "string").join(" ")
    : "";
  return `${command} ${args}`;
}

/**
 * Ours iff it carries the `tokenbroke` marker. The marker is a per-install id; `true` is the
 * pre-0.1 form and still matches so old installs remain removable. The command sniff is the last
 * resort for an entry a user hand-copied without the marker.
 */
export function isTokenbrokeHandler(handler: JsonObject): boolean {
  const marker = handler.tokenbroke;
  if (marker === true || (typeof marker === "string" && marker.length > 0)) return true;
  const command = commandText(handler);
  return command.includes(`${BRAND.name}.js`) && command.includes("hook");
}

function appendStopHandler(config: JsonObject, handler: JsonObject): void {
  const hooks = isObject(config.hooks) ? config.hooks : {};
  const stop = Array.isArray(hooks.Stop) ? hooks.Stop : [];
  stop.push({ matcher: "", hooks: [handler] });
  hooks.Stop = stop;
  config.hooks = hooks;
}

function quoteCommand(value: string): string {
  return JSON.stringify(value);
}

function windowsQuote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

function handlerFor(
  tool: ToolId,
  execPath: string,
  scriptPath: string,
  markerId: string,
): JsonObject {
  if (tool === "claude-code") {
    return {
      type: "command",
      command: execPath,
      args: [scriptPath, "hook", tool],
      timeout: 10,
      async: true,
      tokenbroke: markerId,
    };
  }
  return {
    type: "command",
    command: `${quoteCommand(execPath)} ${quoteCommand(scriptPath)} hook ${tool}`,
    commandWindows: `${windowsQuote(execPath)} ${windowsQuote(scriptPath)} hook ${tool}`,
    async: true,
    tokenbroke: markerId,
  };
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export async function refreshBundledCli(
  source: string,
  paths = tokenbrokePaths(),
  version = CLI_VERSION,
  onlyIfNewer = false,
): Promise<void> {
  const config = await loadConfig(paths);
  if (
    onlyIfNewer &&
    config.hookBundleVersion &&
    compareVersions(version, config.hookBundleVersion) <= 0
  ) {
    return;
  }
  const contents = await readFile(source, "utf8");
  const existing = await readConfigText(paths.bundledCli);
  if (existing !== contents) await atomicWriteText(paths.bundledCli, contents, { mode: 0o700 });
  config.hookBundleVersion = version;
  await saveConfig(config, paths);
}

async function installOne(
  tool: ToolId,
  path: string,
  execPath: string,
  scriptPath: string,
  paths: TokenbrokePaths,
): Promise<void> {
  const original = await readToolConfig(tool, path);
  const parsed = parseToolConfig(tool, original);
  if (hookHandlers(parsed).some(isTokenbrokeHandler)) return;
  const markerId = randomBytes(8).toString("hex");
  appendStopHandler(parsed, handlerFor(tool, execPath, scriptPath, markerId));
  const installed = serializeConfig(parsed, original);
  try {
    const mode = (await fileMode(path)) ?? 0o600;
    await atomicWriteText(path, installed, { mode, expected: original });
    const config = await loadConfig(paths);
    config.hookInstalls ??= {};
    // Structural undo only: the hash proves what we wrote, the marker finds it again.
    config.hookInstalls[tool] = {
      installedHash: hashText(installed),
      file: path,
      event: "Stop",
      markerId,
    };
    await saveConfig(config, paths);
  } catch (error) {
    throw new HookToolError(tool, "unwritable", error);
  }
}

export async function installHooks(options: HookInstallOptions = {}): Promise<HookInstallResult> {
  const tools = options.tools ?? ["claude-code", "codex"];
  const paths = options.paths ?? tokenbrokePaths();
  const locations = options.locations ?? hookLocations();
  const execPath = options.execPath ?? process.execPath;
  const version = options.version ?? CLI_VERSION;
  const source = options.scriptPath ?? process.argv[1];
  if (!source) throw new Error("missing CLI script");
  await refreshBundledCli(source, paths, version);
  const installed: ToolId[] = [];
  const failures: HookToolFailure[] = [];
  for (const tool of tools) {
    try {
      await installOne(tool, locationFor(tool, locations), execPath, paths.bundledCli, paths);
      installed.push(tool);
    } catch (error) {
      if (!(error instanceof HookToolError)) throw error;
      failures.push({ tool: error.tool, kind: error.kind });
    }
  }
  return { installed, failures };
}

export async function installedBundleIsCurrent(
  source: string,
  paths: TokenbrokePaths = tokenbrokePaths(),
): Promise<boolean> {
  if (!(await pathExists(paths.bundledCli))) return false;
  const [sourceStat, bundleStat] = await Promise.all([stat(source), stat(paths.bundledCli)]);
  return bundleStat.mtimeMs >= sourceStat.mtimeMs;
}

export { hashText };
