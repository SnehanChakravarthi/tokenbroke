import { spawn } from "node:child_process";
import { mkdir, open, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolId } from "@tokenbroke/shared";
import { loadLastSubmission, type TokenbrokePaths, tokenbrokePaths } from "../identity";
import { readAll } from "../readers";
import { hashWindows, submitReadings } from "../submit";

const LEASE_MS = 5 * 60 * 1000;
const MAX_LOG_BYTES = 256 * 1024;

export async function acquireHookLease(
  paths: TokenbrokePaths = tokenbrokePaths(),
  now = Date.now(),
): Promise<boolean> {
  await mkdir(dirname(paths.hookLock), { recursive: true, mode: 0o700 });
  try {
    const handle = await open(paths.hookLock, "wx", 0o600);
    await handle.close();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const lock = await stat(paths.hookLock).catch(() => null);
  if (lock && now - lock.mtimeMs < LEASE_MS) return false;
  await unlink(paths.hookLock).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  return acquireHookLease(paths, now);
}

export async function appendHookError(
  error: unknown,
  paths: TokenbrokePaths = tokenbrokePaths(),
): Promise<void> {
  const name = error instanceof Error ? error.name : "UnknownError";
  const line = `${new Date().toISOString()} ${name}\n`;
  const size = await stat(paths.hookLog).then(
    (value) => value.size,
    () => 0,
  );
  if (size + Buffer.byteLength(line) > MAX_LOG_BYTES) {
    await writeFile(paths.hookLog, line, { mode: 0o600 });
  } else {
    await writeFile(paths.hookLog, line, { flag: "a", mode: 0o600 });
  }
}

export async function runHookWorker(
  tool: ToolId,
  options: { paths?: TokenbrokePaths } = {},
): Promise<boolean> {
  const paths = options.paths ?? tokenbrokePaths();
  try {
    const readings = await readAll();
    const windowsHash = hashWindows(readings);
    const previous = await loadLastSubmission(paths);
    if (previous?.windowsHash === windowsHash) return false;
    const result = await submitReadings(readings, { trigger: `hook:${tool}`, paths });
    return result.response.ok;
  } catch (error) {
    await appendHookError(error, paths).catch(() => undefined);
    return false;
  }
}

export async function coordinateHook(
  tool: ToolId,
  options: { paths?: TokenbrokePaths; scriptPath?: string; execPath?: string } = {},
): Promise<void> {
  const paths = options.paths ?? tokenbrokePaths();
  try {
    if (!(await acquireHookLease(paths))) return;
    const scriptPath = options.scriptPath ?? fileURLToPath(import.meta.url);
    const child = spawn(options.execPath ?? process.execPath, [scriptPath, "hook-worker", tool], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
  } catch (error) {
    await appendHookError(error, paths).catch(() => undefined);
  }
}

export const HOOK_LEASE_MS = LEASE_MS;
