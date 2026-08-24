import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { BRAND, type ToolId } from "@tokenbroke/shared";
import {
  type DeviceKeyPair,
  deviceIdFor,
  generateDeviceKeyPair,
} from "@tokenbroke/shared/node/signing";

export interface Identity extends DeviceKeyPair {
  deviceId: string;
}

/** `identity.json` exists but is not a usable identity. Never carries a filesystem path. */
export class CorruptIdentityError extends Error {
  constructor() {
    super("identity file is unreadable");
    this.name = "CorruptIdentityError";
  }
}

/**
 * Structural undo record for one installed hook. Deliberately holds no bytes of the user's own
 * settings file: `remove` finds our entry by its `tokenbroke` marker, not by remembered content.
 */
export interface HookInstallRecord {
  installedHash: string;
  file: string;
  event: "Stop";
  markerId: string;
}

export interface TokenbrokeConfig {
  anonymousName?: string;
  claimCode?: string;
  hooksPrompted?: boolean;
  hookBundleVersion?: string;
  hookInstalls?: Partial<Record<ToolId, HookInstallRecord>>;
}

export interface LastSubmission {
  deviceId: string;
  windowsHash: string;
  submittedAt: string;
  trigger: string;
}

export interface TokenbrokePaths {
  home: string;
  identity: string;
  config: string;
  lastSubmission: string;
  hookLock: string;
  hookLog: string;
  binDir: string;
  bundledCli: string;
}

export function tokenbrokePaths(env: NodeJS.ProcessEnv = process.env): TokenbrokePaths {
  const home = env.TOKENBROKE_HOME
    ? resolve(env.TOKENBROKE_HOME)
    : join(homedir(), BRAND.configDirName);
  return {
    home,
    identity: join(home, "identity.json"),
    config: join(home, "config.json"),
    lastSubmission: join(home, "last-submission.json"),
    hookLock: join(home, "hook.lock"),
    hookLog: join(home, "hook.log"),
    binDir: join(home, "bin"),
    bundledCli: join(home, "bin", `${BRAND.name}.js`),
  };
}

async function chmodPrivate(path: string, mode: number): Promise<void> {
  if (process.platform !== "win32") await chmod(path, mode).catch(() => undefined);
}

/**
 * Durably publish a rename on POSIX. Windows cannot open a directory as a file handle, and some
 * filesystems reject the fsync; the rename already happened either way, so failures are ignored.
 */
async function syncDirectory(path: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const handle = await open(path, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // EISDIR / EPERM / EINVAL on platforms that do not support directory fsync.
  }
}

export async function atomicWriteText(
  path: string,
  contents: string,
  options: { mode?: number; expected?: string | null } = {},
): Promise<void> {
  const mode = options.mode ?? 0o600;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  if (options.expected !== undefined) {
    const current = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (current !== options.expected) throw new Error("configuration changed during update");
  }
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const handle = await open(temporary, "wx", mode);
  let published = false;
  try {
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmodPrivate(temporary, mode);
    if (options.expected !== undefined) {
      const current = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (current !== options.expected) throw new Error("configuration changed during update");
    }
    await rename(temporary, path);
    published = true;
    await chmodPrivate(path, mode);
    await syncDirectory(dirname(path));
  } finally {
    if (!published) await unlink(temporary).catch(() => undefined);
  }
}

export async function atomicWriteJson(path: string, value: unknown, mode = 0o600): Promise<void> {
  await atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`, { mode });
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function validIdentity(value: unknown): value is Identity {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Identity>;
  return (
    typeof item.deviceId === "string" &&
    typeof item.privateKey === "string" &&
    typeof item.publicKey === "string" &&
    deviceIdFor(item.publicKey) === item.deviceId
  );
}

/** A keypair that is never written to disk. Used by `--dry-run`, which must not claim a row. */
export function ephemeralIdentity(): Identity {
  const keys = generateDeviceKeyPair();
  return { ...keys, deviceId: deviceIdFor(keys.publicKey) };
}

/**
 * Read the identity the race was lost to. The winner creates the file with `wx` before it writes
 * the bytes, so a loser can briefly observe an empty file; poll until it is complete.
 */
async function readSettledIdentity(path: string): Promise<Identity> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const value = await readFile(path, "utf8").then(
      (text) => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      },
      () => null,
    );
    if (validIdentity(value)) return value;
    await new Promise((settle) => setTimeout(settle, 10));
  }
  throw new CorruptIdentityError();
}

export async function loadOrCreateIdentity(
  paths: TokenbrokePaths = tokenbrokePaths(),
): Promise<Identity> {
  const existing = await readJson<unknown>(paths.identity).catch(() => {
    throw new CorruptIdentityError();
  });
  if (existing !== null) {
    if (!validIdentity(existing)) throw new CorruptIdentityError();
    await chmodPrivate(paths.identity, 0o600);
    return existing;
  }
  const identity = ephemeralIdentity();
  await mkdir(dirname(paths.identity), { recursive: true, mode: 0o700 });
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(paths.identity, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return readSettledIdentity(paths.identity);
  }
  try {
    await handle.writeFile(`${JSON.stringify(identity, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmodPrivate(paths.identity, 0o600);
  await syncDirectory(dirname(paths.identity));
  return identity;
}

export async function loadConfig(
  paths: TokenbrokePaths = tokenbrokePaths(),
): Promise<TokenbrokeConfig> {
  const config = (await readJson<TokenbrokeConfig & { hookBackups?: unknown }>(paths.config)) ?? {};
  // Pre-0.1 configs stored a verbatim copy of the user's settings file here. Drop it on sight so
  // the next save purges it: nothing of theirs belongs in our directory.
  delete config.hookBackups;
  return config;
}

export async function saveConfig(
  config: TokenbrokeConfig,
  paths: TokenbrokePaths = tokenbrokePaths(),
): Promise<void> {
  await atomicWriteJson(paths.config, config);
}

export async function loadLastSubmission(
  paths: TokenbrokePaths = tokenbrokePaths(),
): Promise<LastSubmission | null> {
  return readJson<LastSubmission>(paths.lastSubmission);
}

export async function saveLastSubmission(
  submission: LastSubmission,
  paths: TokenbrokePaths = tokenbrokePaths(),
): Promise<void> {
  await atomicWriteJson(paths.lastSubmission, submission);
}

export async function pathExists(path: string): Promise<boolean> {
  return access(path, constants.F_OK).then(
    () => true,
    () => false,
  );
}

export async function fileMode(path: string): Promise<number | null> {
  return stat(path).then(
    (value) => value.mode & 0o777,
    () => null,
  );
}

export async function removeFileIfPresent(path: string): Promise<void> {
  await unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

/** Best-effort tidy-up: leave the directory alone if anything else still lives in it. */
export async function removeDirectoryIfEmpty(path: string): Promise<void> {
  await rmdir(path).catch(() => undefined);
}
