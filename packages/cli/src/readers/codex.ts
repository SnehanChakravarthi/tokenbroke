import { join } from "node:path";
import { performance } from "node:perf_hooks";
import {
  type DrainSample,
  type ReaderWarning,
  seriesId,
  type ToolReading,
  type UsageWindow,
} from "@tokenbroke/shared";
import type { FileSystemAccess } from "./access";
import { readJsonlTail, streamJsonl } from "./jsonl";
import type { ResolvedReaderPaths } from "./paths";
import { codexPlan } from "./plans";
import { safeToken } from "./sanitize";

const SNAPSHOT_FILE_LIMIT = 96;
const SNAPSHOT_TAIL_BYTES = 512 * 1024;
const DRAIN_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const DRAIN_SAMPLE_LIMIT = 2000;
const FILE_CONCURRENCY = 4;

export interface CodexReaderContext {
  access: FileSystemAccess;
  path: ResolvedReaderPaths["codex"];
  now: Date;
  snapshotBudgetMs: number;
  evidenceBudgetMs: number;
  onPhaseTiming?: (phase: "snapshot" | "evidence", durationMs: number) => void;
}

interface RolloutFile {
  path: string;
  mtimeMs: number;
}

interface RolloutListing {
  files: RolloutFile[];
  compressed: number;
  skipped: number;
  timedOut: boolean;
}

interface CodexEvent {
  at: string | null;
  planRaw: string | null;
  windows: UsageWindow[];
}

interface SnapshotResult {
  event: CodexEvent | null;
  malformedLines: number;
  compressed: number;
  timedOut: boolean;
  archivedFallback: boolean;
}

function emptyReading(
  install: ToolReading["install"],
  observation: ToolReading["observation"],
): ToolReading {
  return {
    tool: "codex",
    install,
    observation,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usedPercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function observedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

function resetsAt(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  try {
    return new Date(value * 1000).toISOString();
  } catch {
    return null;
  }
}

function windowFromSlot(
  rateLimits: Record<string, unknown>,
  limitId: string,
  rawKind: "primary" | "secondary",
): UsageWindow | null {
  const value = rateLimits[rawKind];
  if (!isRecord(value)) return null;
  const percent = usedPercent(value.used_percent);
  if (percent === null) return null;
  const windowMinutes =
    typeof value.window_minutes === "number" && Number.isFinite(value.window_minutes)
      ? value.window_minutes
      : null;
  const key = { limitId, rawKind, windowMinutes, scope: null };
  return {
    ...key,
    seriesId: seriesId(key),
    usedPercent: percent,
    resetsAt: resetsAt(value.resets_at),
    group: null,
    severity: null,
    isActive: null,
  };
}

function extractCodexEvent(value: unknown): CodexEvent | null {
  if (!isRecord(value) || value.type !== "event_msg" || !isRecord(value.payload)) return null;
  const payload = value.payload;
  if (payload.type !== "token_count" || !isRecord(payload.rate_limits)) return null;
  const rateLimits = payload.rate_limits;
  const limitId = safeToken(rateLimits.limit_id) ?? "codex";
  const windows = [
    windowFromSlot(rateLimits, limitId, "primary"),
    windowFromSlot(rateLimits, limitId, "secondary"),
  ].filter((window): window is UsageWindow => window !== null);
  return {
    at: observedAt(value.timestamp),
    planRaw: safeToken(rateLimits.plan_type),
    windows,
  };
}

async function listRollouts(
  access: FileSystemAccess,
  root: string,
  deadlineAt: number,
  fileLimit = Number.POSITIVE_INFINITY,
): Promise<RolloutListing> {
  if ((await access.pathKind(root)) !== "directory") {
    return { files: [], compressed: 0, skipped: 0, timedOut: false };
  }

  const files: RolloutFile[] = [];
  let compressed = 0;
  let skipped = 0;
  let timedOut = false;

  const walk = async (directory: string, depth: number): Promise<void> => {
    if (performance.now() >= deadlineAt || files.length >= fileLimit) {
      timedOut = performance.now() >= deadlineAt;
      return;
    }
    if (depth > 5) return;
    const entries = (await access.readDirectory(directory)).sort((a, b) =>
      b.name.localeCompare(a.name),
    );
    for (const entry of entries) {
      if (performance.now() >= deadlineAt || files.length >= fileLimit) {
        timedOut = performance.now() >= deadlineAt;
        return;
      }
      const path = join(directory, entry.name);
      if (entry.kind === "directory") {
        await walk(path, depth + 1);
      } else if (entry.kind === "file" && /^rollout-.*\.jsonl$/.test(entry.name)) {
        // A single rejected file (hardlinked backup, vanished mid-walk) must not blank the reading.
        try {
          const file = await access.statFile(path);
          files.push({ path, mtimeMs: file.mtimeMs });
        } catch {
          skipped += 1;
        }
      } else if (entry.kind === "file" && /^rollout-.*\.jsonl\.zst$/.test(entry.name)) {
        compressed += 1;
      }
    }
  };

  await walk(root, 0);
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { files, compressed, skipped, timedOut };
}

/**
 * Codex writes an initializing rate_limits stub at session start, before any real API
 * headers arrive: every window reads 0% used with resets_at anchored to the session's own
 * timestamp plus the window length. Reading one as truth reported a fully-reset account
 * for a dev who was 30% into his weekly (the first field bug report). Skip them unless
 * they are all we have.
 */
function isSessionStartPlaceholder(event: CodexEvent): boolean {
  const atMs = Date.parse(event.at ?? "");
  if (!Number.isFinite(atMs) || event.windows.length === 0) return false;
  return event.windows.every((window) => {
    if (window.usedPercent !== 0 || window.windowMinutes === null) return false;
    const resetMs = Date.parse(window.resetsAt ?? "");
    if (!Number.isFinite(resetMs)) return false;
    return Math.abs(resetMs - atMs - window.windowMinutes * 60_000) <= 120_000;
  });
}

async function snapshotFromFiles(
  ctx: CodexReaderContext,
  files: RolloutFile[],
  deadlineAt: number,
): Promise<{ event: CodexEvent | null; malformedLines: number; timedOut: boolean }> {
  let malformedLines = 0;
  let placeholderFallback: CodexEvent | null = null;
  for (const file of files) {
    if (performance.now() >= deadlineAt) {
      return { event: placeholderFallback, malformedLines, timedOut: true };
    }
    let result: Awaited<ReturnType<typeof readJsonlTail<CodexEvent>>>;
    try {
      result = await readJsonlTail(ctx.access, file.path, SNAPSHOT_TAIL_BYTES, extractCodexEvent);
    } catch {
      continue;
    }
    malformedLines += result.malformedLines;
    for (let index = result.items.length - 1; index >= 0; index -= 1) {
      const event = result.items[index];
      if (event === undefined) continue;
      if (isSessionStartPlaceholder(event)) {
        placeholderFallback ??= event;
        continue;
      }
      return { event, malformedLines, timedOut: false };
    }
  }
  return { event: placeholderFallback, malformedLines, timedOut: false };
}

async function readSnapshot(ctx: CodexReaderContext, deadlineAt: number): Promise<SnapshotResult> {
  const sessionsRoot = join(ctx.path.home, "sessions");
  const active = await listRollouts(ctx.access, sessionsRoot, deadlineAt, SNAPSHOT_FILE_LIMIT);
  const activeSnapshot = await snapshotFromFiles(ctx, active.files, deadlineAt);
  if (activeSnapshot.event !== null || activeSnapshot.timedOut || active.timedOut) {
    return {
      ...activeSnapshot,
      compressed: active.compressed,
      timedOut: activeSnapshot.timedOut || active.timedOut,
      archivedFallback: false,
    };
  }

  const archivedRoot = join(ctx.path.home, "archived_sessions");
  const archived = await listRollouts(ctx.access, archivedRoot, deadlineAt, SNAPSHOT_FILE_LIMIT);
  const archivedSnapshot = await snapshotFromFiles(ctx, archived.files, deadlineAt);
  return {
    ...archivedSnapshot,
    malformedLines: activeSnapshot.malformedLines + archivedSnapshot.malformedLines,
    compressed: active.compressed + archived.compressed,
    timedOut: active.timedOut || archived.timedOut || archivedSnapshot.timedOut,
    archivedFallback: archivedSnapshot.event !== null,
  };
}

async function mapConcurrent<T>(
  values: T[],
  concurrency: number,
  shouldStop: () => boolean,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const run = async (): Promise<void> => {
    while (!shouldStop()) {
      const current = index;
      index += 1;
      const value = values[current];
      if (value === undefined) return;
      await worker(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
}

async function readDrain(
  ctx: CodexReaderContext,
  deadlineAt: number,
): Promise<{
  drain: DrainSample[];
  malformedLines: number;
  compressed: number;
  timedOut: boolean;
}> {
  const roots = [join(ctx.path.home, "sessions"), join(ctx.path.home, "archived_sessions")];
  const listings: RolloutListing[] = [];
  for (const root of roots) {
    if (performance.now() >= deadlineAt) break;
    listings.push(await listRollouts(ctx.access, root, deadlineAt));
  }
  const cutoff = ctx.now.getTime() - DRAIN_LOOKBACK_MS;
  const files = listings.flatMap(({ files }) => files).filter(({ mtimeMs }) => mtimeMs >= cutoff);
  const samples = new Map<string, DrainSample>();
  let malformedLines = 0;
  let timedOut = listings.some((listing) => listing.timedOut) || listings.length < roots.length;

  const shouldStop = (): boolean => performance.now() >= deadlineAt;
  await mapConcurrent(files, FILE_CONCURRENCY, shouldStop, async (file) => {
    let result: Awaited<ReturnType<typeof streamJsonl<CodexEvent>>>;
    try {
      result = await streamJsonl(ctx.access, file.path, extractCodexEvent, { shouldStop });
    } catch {
      return;
    }
    malformedLines += result.malformedLines;
    timedOut ||= result.timedOut;
    for (const event of result.items) {
      if (event.at === null) continue;
      for (const window of event.windows) {
        const sample = {
          at: event.at,
          seriesId: window.seriesId,
          usedPercent: window.usedPercent,
          resetsAt: window.resetsAt,
        };
        samples.set(`${sample.seriesId}\0${sample.at}`, sample);
      }
    }
  });
  timedOut ||= shouldStop();
  const drain = [...samples.values()]
    .sort((a, b) => a.at.localeCompare(b.at) || a.seriesId.localeCompare(b.seriesId))
    .slice(-DRAIN_SAMPLE_LIMIT);
  return {
    drain,
    malformedLines,
    compressed: listings.reduce((sum, listing) => sum + listing.compressed, 0),
    timedOut,
  };
}

function addWarning(warnings: ReaderWarning[], warning: ReaderWarning, when: boolean): void {
  if (when && !warnings.includes(warning)) warnings.push(warning);
}

export async function readCodex(ctx: CodexReaderContext): Promise<ToolReading> {
  if (ctx.path.install !== "found") {
    return emptyReading(
      ctx.path.install,
      ctx.path.install === "invalid-override" ? "unreadable" : "no-snapshot",
    );
  }
  if (ctx.path.unreadable) return emptyReading("found", "unreadable");

  const snapshotStartedAt = performance.now();
  const snapshotDeadline = snapshotStartedAt + Math.max(0, ctx.snapshotBudgetMs);
  let snapshot: SnapshotResult;
  try {
    snapshot = await readSnapshot(ctx, snapshotDeadline);
  } catch {
    ctx.onPhaseTiming?.("snapshot", performance.now() - snapshotStartedAt);
    ctx.onPhaseTiming?.("evidence", 0);
    return emptyReading("found", "unreadable");
  }
  ctx.onPhaseTiming?.("snapshot", performance.now() - snapshotStartedAt);

  const warnings: ReaderWarning[] = [];
  addWarning(warnings, "compressed-rollouts-skipped", snapshot.compressed > 0);
  addWarning(warnings, "malformed-lines-skipped", snapshot.malformedLines > 0);
  addWarning(warnings, "archived-fallback-used", snapshot.archivedFallback);

  if (snapshot.event === null) {
    ctx.onPhaseTiming?.("evidence", 0);
    const observation = snapshot.timedOut
      ? "timed-out"
      : snapshot.compressed > 0
        ? "unsupported-format"
        : "no-snapshot";
    return { ...emptyReading("found", observation), warnings };
  }

  const plan = codexPlan(snapshot.event.planRaw);
  addWarning(warnings, "plan-unknown", plan.label === null);
  const evidenceStartedAt = performance.now();
  const evidenceDeadline = evidenceStartedAt + Math.max(0, ctx.evidenceBudgetMs);
  let drain: Awaited<ReturnType<typeof readDrain>>;
  try {
    drain = await readDrain(ctx, evidenceDeadline);
  } catch {
    drain = { drain: [], malformedLines: 0, compressed: 0, timedOut: true };
  }
  ctx.onPhaseTiming?.("evidence", performance.now() - evidenceStartedAt);
  addWarning(warnings, "evidence-timed-out", drain.timedOut);
  addWarning(warnings, "malformed-lines-skipped", drain.malformedLines > 0);
  addWarning(warnings, "compressed-rollouts-skipped", drain.compressed > 0);

  return {
    tool: "codex",
    install: "found",
    observation: snapshot.event.windows.length > 0 ? "ok" : "no-snapshot",
    toolVersion: null,
    plan,
    observedAt: snapshot.event.at,
    sourceFetchedAt: null,
    windows: snapshot.event.windows,
    drain: drain.drain,
    evidence: null,
    warnings,
  };
}
