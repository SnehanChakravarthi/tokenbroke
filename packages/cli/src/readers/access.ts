import { constants, lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, normalize, relative } from "node:path";
import type { PathCandidates } from "./paths";

// O_NOFOLLOW closes the window between realpath() and open() in which the final path component
// could be swapped for a symlink. It is undefined on Windows, where the flag is a no-op anyway.
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);

export type FileAccessOperation = "open" | "readdir" | "stat";

/**
 * An instrumentation record of one attempted filesystem operation.
 *
 * `path` is absolute and can name a file the allowlist rejected, so it exists purely for tests and
 * in-process instrumentation. It must never be logged, printed, or included in any submission.
 */
export interface FileAccessAttempt {
  operation: FileAccessOperation;
  path: string;
}

export interface SafeDirectoryEntry {
  name: string;
  kind: "file" | "directory" | "symlink" | "other";
}

export interface SafeFileStat {
  size: number;
  mtimeMs: number;
}

export interface SafeFileHandle {
  size: number;
  read: (position: number, length: number) => Promise<Uint8Array>;
  close: () => Promise<void>;
}

export interface FileSystemAccess {
  pathKind: (path: string) => Promise<"file" | "directory" | "other" | "missing">;
  readDirectory: (path: string) => Promise<SafeDirectoryEntry[]>;
  statFile: (path: string) => Promise<SafeFileStat>;
  openFile: (path: string) => Promise<SafeFileHandle>;
}

export class DisallowedPathError extends Error {
  readonly code = "disallowed-path";

  constructor() {
    super("filesystem path is outside the local-reader allowlist");
    this.name = "DisallowedPathError";
  }
}

export class ReaderFileSystemError extends Error {
  readonly code: "missing" | "unreadable";

  constructor(code: "missing" | "unreadable") {
    super(
      code === "missing" ? "reader filesystem entry is missing" : "reader filesystem access failed",
    );
    this.name = "ReaderFileSystemError";
    this.code = code;
  }
}

function errorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : null;
}

function sanitizedAccessError(error: unknown): ReaderFileSystemError {
  return new ReaderFileSystemError(errorCode(error) === "ENOENT" ? "missing" : "unreadable");
}

function isWithin(root: string, candidate: string): boolean {
  const difference = relative(root, candidate);
  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}

function isRolloutFile(path: string): boolean {
  return /^rollout-.*\.jsonl$/.test(basename(path));
}

function entryKind(entry: {
  isFile: () => boolean;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
}): SafeDirectoryEntry["kind"] {
  if (entry.isFile()) return "file";
  if (entry.isDirectory()) return "directory";
  if (entry.isSymbolicLink()) return "symlink";
  return "other";
}

export function createFileSystemAccess(
  candidates: PathCandidates,
  onAttempt?: (attempt: FileAccessAttempt) => void,
): FileSystemAccess {
  const claudeConfigRoot = normalize(candidates.claudeConfigRoot);
  const claudeStateFile = normalize(candidates.claudeStateFile);
  const codexHome = normalize(candidates.codexHome);
  const sessionsRoot = join(codexHome, "sessions");
  const archivedRoot = join(codexHome, "archived_sessions");
  let canonicalClaudeConfigRoot: Promise<string> | null = null;
  const canonicalRolloutRoots = new Map<string, Promise<string | null>>();

  const record = (operation: FileAccessOperation, path: string): void => {
    onAttempt?.({ operation, path });
  };

  const codexTreeFor = (path: string): string | null => {
    const normalized = normalize(path);
    if (isWithin(sessionsRoot, normalized)) return sessionsRoot;
    if (isWithin(archivedRoot, normalized)) return archivedRoot;
    return null;
  };

  // A rollout tree can itself be a symlink (sessions/ moved to another volume), so containment has
  // to be checked canonical-root against canonical-file rather than lexically. A root that does not
  // exist can never contain anything, so ENOENT yields null instead of failing the whole read.
  const canonicalRolloutRoot = async (root: string): Promise<string | null> => {
    let canonical = canonicalRolloutRoots.get(root);
    if (canonical === undefined) {
      canonical = realpath(root).catch((error: unknown) => {
        if (errorCode(error) === "ENOENT") return null;
        throw sanitizedAccessError(error);
      });
      canonicalRolloutRoots.set(root, canonical);
    }
    return canonical;
  };

  const canonicalClaudeRoot = async (): Promise<string> => {
    canonicalClaudeConfigRoot ??= realpath(claudeConfigRoot).catch((error: unknown) => {
      throw sanitizedAccessError(error);
    });
    return canonicalClaudeConfigRoot;
  };

  const validateCodexPath = async (path: string, requireRollout: boolean): Promise<string> => {
    const normalized = normalize(path);
    if (codexTreeFor(normalized) === null || (requireRollout && !isRolloutFile(normalized))) {
      throw new DisallowedPathError();
    }
    let resolved: string;
    try {
      resolved = await realpath(normalized);
    } catch (error) {
      throw sanitizedAccessError(error);
    }
    // Re-check against the *resolved* path: a symlink inside sessions/ named like a rollout must not
    // reach auth.json or anything else in the home. Only the two rollout subtrees are ever allowed.
    const [canonicalSessions, canonicalArchived] = await Promise.all([
      canonicalRolloutRoot(sessionsRoot),
      canonicalRolloutRoot(archivedRoot),
    ]);
    const withinRolloutTree =
      (canonicalSessions !== null && isWithin(canonicalSessions, resolved)) ||
      (canonicalArchived !== null && isWithin(canonicalArchived, resolved));
    if (!withinRolloutTree || (requireRollout && !isRolloutFile(resolved))) {
      throw new DisallowedPathError();
    }
    return resolved;
  };

  return {
    async pathKind(path: string): Promise<"file" | "directory" | "other" | "missing"> {
      const normalized = normalize(path);
      // Recorded before the allowlist check so a denied probe is visible to instrumentation too.
      record("stat", normalized);
      const allowedRootProbe =
        normalized === claudeConfigRoot ||
        normalized === claudeStateFile ||
        normalized === codexHome ||
        normalized === sessionsRoot ||
        normalized === archivedRoot;
      if (!allowedRootProbe) throw new DisallowedPathError();
      try {
        const result = await stat(normalized);
        if (result.isFile()) return "file";
        if (result.isDirectory()) return "directory";
        return "other";
      } catch (error) {
        if (errorCode(error) === "ENOENT") return "missing";
        throw sanitizedAccessError(error);
      }
    },

    async readDirectory(path: string): Promise<SafeDirectoryEntry[]> {
      const normalized = normalize(path);
      record("readdir", normalized);
      const resolved = await validateCodexPath(normalized, false);
      try {
        const entries = await readdir(resolved, { withFileTypes: true });
        return entries.map((entry) => ({ name: entry.name, kind: entryKind(entry) }));
      } catch (error) {
        throw sanitizedAccessError(error);
      }
    },

    async statFile(path: string): Promise<SafeFileStat> {
      const normalized = normalize(path);
      record("stat", normalized);
      const resolved = await validateCodexPath(normalized, true);
      let result: Awaited<ReturnType<typeof lstat>>;
      try {
        // lstat, not stat: `resolved` is canonical, so a symlink here means the path was swapped
        // after realpath() returned.
        result = await lstat(resolved);
      } catch (error) {
        throw sanitizedAccessError(error);
      }
      if (result.isSymbolicLink() || result.nlink > 1) throw new DisallowedPathError();
      return { size: result.size, mtimeMs: result.mtimeMs };
    },

    async openFile(path: string): Promise<SafeFileHandle> {
      const normalized = normalize(path);
      record("open", normalized);
      let resolved: string;
      if (normalized === claudeStateFile) {
        try {
          resolved = await realpath(normalized);
        } catch (error) {
          throw sanitizedAccessError(error);
        }
        if (resolved !== join(await canonicalClaudeRoot(), ".claude.json")) {
          throw new DisallowedPathError();
        }
      } else {
        resolved = await validateCodexPath(normalized, true);
      }

      const handle = await open(resolved, READ_FLAGS).catch((error: unknown) => {
        throw sanitizedAccessError(error);
      });
      try {
        const result = await handle.stat();
        // A second link to this inode means the allowlisted name is only one of its names: the file
        // may equally be auth.json. Containment can no longer be reasoned about, so refuse to read.
        if (result.nlink > 1) throw new DisallowedPathError();
        return {
          size: result.size,
          async read(position: number, length: number): Promise<Uint8Array> {
            try {
              const buffer = Buffer.allocUnsafe(length);
              const { bytesRead } = await handle.read(buffer, 0, length, position);
              return buffer.subarray(0, bytesRead);
            } catch (error) {
              throw sanitizedAccessError(error);
            }
          },
          async close(): Promise<void> {
            try {
              await handle.close();
            } catch (error) {
              throw sanitizedAccessError(error);
            }
          },
        };
      } catch (error) {
        await handle.close().catch(() => undefined);
        if (error instanceof DisallowedPathError) throw error;
        throw sanitizedAccessError(error);
      }
    },
  };
}
