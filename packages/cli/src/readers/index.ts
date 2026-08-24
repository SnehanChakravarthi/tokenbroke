import { performance } from "node:perf_hooks";
import type { LocalReadings, ToolId, ToolReading } from "@tokenbroke/shared";
import { createFileSystemAccess, type FileAccessAttempt, type FileSystemAccess } from "./access";
import { readClaudeCode } from "./claude-code";
import { readCodex } from "./codex";
import { createPathCandidates, type PathCandidateOptions, resolveReaderPaths } from "./paths";

const DEFAULT_SNAPSHOT_BUDGET_MS = 500;
const DEFAULT_EVIDENCE_BUDGET_MS = 1000;

export interface ReaderTiming {
  tool: ToolId;
  phase: "snapshot" | "evidence" | "total";
  durationMs: number;
}

export interface ReadAllOptions extends PathCandidateOptions {
  now?: Date;
  snapshotBudgetMs?: number;
  evidenceBudgetMs?: number;
  onAccessAttempt?: (attempt: FileAccessAttempt) => void;
  onTiming?: (timing: ReaderTiming) => void;
  access?: FileSystemAccess;
}

function unreadableReading(tool: ToolId): ToolReading {
  return {
    tool,
    install: "found",
    observation: "unreadable",
    toolVersion: null,
    plan: { raw: null, label: null },
    observedAt: null,
    sourceFetchedAt: null,
    windows: [],
    drain: [],
    evidence: null,
    warnings: [],
  };
}

async function timed<T>(
  tool: ToolId,
  onTiming: ReadAllOptions["onTiming"],
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    onTiming?.({ tool, phase: "total", durationMs: performance.now() - startedAt });
  }
}

export async function readAll(options: ReadAllOptions = {}): Promise<LocalReadings> {
  const candidates = createPathCandidates(options);
  const access = options.access ?? createFileSystemAccess(candidates, options.onAccessAttempt);
  const paths = await resolveReaderPaths(candidates, access);
  const now = options.now ?? new Date();
  const snapshotBudgetMs = options.snapshotBudgetMs ?? DEFAULT_SNAPSHOT_BUDGET_MS;
  const evidenceBudgetMs = options.evidenceBudgetMs ?? DEFAULT_EVIDENCE_BUDGET_MS;

  const phaseTiming =
    (tool: ToolId) =>
    (phase: "snapshot" | "evidence", durationMs: number): void => {
      options.onTiming?.({ tool, phase, durationMs });
    };

  const results = await Promise.allSettled([
    timed("claude-code", options.onTiming, () =>
      readClaudeCode({
        access,
        path: paths.claude,
        now,
        snapshotBudgetMs,
        onPhaseTiming: phaseTiming("claude-code"),
      }),
    ),
    timed("codex", options.onTiming, () =>
      readCodex({
        access,
        path: paths.codex,
        now,
        snapshotBudgetMs,
        evidenceBudgetMs,
        onPhaseTiming: phaseTiming("codex"),
      }),
    ),
  ]);

  const claude =
    results[0].status === "fulfilled" ? results[0].value : unreadableReading("claude-code");
  const codex = results[1].status === "fulfilled" ? results[1].value : unreadableReading("codex");
  return [claude, codex];
}

export type { FileAccessAttempt, FileSystemAccess } from "./access";
export { DisallowedPathError, ReaderFileSystemError } from "./access";
export { readClaudeCode } from "./claude-code";
export { readCodex } from "./codex";
export { createPathCandidates, resolveReaderPaths } from "./paths";
