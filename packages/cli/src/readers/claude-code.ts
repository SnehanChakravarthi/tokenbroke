import { performance } from "node:perf_hooks";
import {
  type ReaderWarning,
  seriesId,
  type ToolReading,
  type UsageWindow,
} from "@tokenbroke/shared";
import type { FileSystemAccess } from "./access";
import type { ResolvedReaderPaths } from "./paths";
import { claudePlan } from "./plans";
import { safeLabel, safeToken } from "./sanitize";

const MAX_STATE_BYTES = 16 * 1024 * 1024;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface ClaudeReaderContext {
  access: FileSystemAccess;
  path: ResolvedReaderPaths["claude"];
  now: Date;
  snapshotBudgetMs: number;
  onPhaseTiming?: (phase: "snapshot" | "evidence", durationMs: number) => void;
}

interface ClaudeSnapshot {
  planRaw: string | null;
  sourceFetchedAt: string | null;
  sourceFetchedAtMs: number | null;
  windows: UsageWindow[];
}

function emptyReading(
  install: ToolReading["install"],
  observation: ToolReading["observation"],
): ToolReading {
  return {
    tool: "claude-code",
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

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? new Date(epoch).toISOString() : null;
}

function fetchedAt(value: unknown): { iso: string | null; epoch: number | null } {
  if (typeof value !== "number" || !Number.isFinite(value)) return { iso: null, epoch: null };
  try {
    return { iso: new Date(value).toISOString(), epoch: value };
  } catch {
    return { iso: null, epoch: null };
  }
}

function claudeWindowMinutes(rawKind: string, group: string | null): number | null {
  if (group === "session" || rawKind === "session" || rawKind === "five_hour") return 300;
  if (group === "weekly" || rawKind === "seven_day" || rawKind.startsWith("weekly")) return 10080;
  return null;
}

function scopedModel(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.model)) return null;
  return safeLabel(value.model.display_name);
}

function limitsWindows(limits: unknown[]): UsageWindow[] {
  const windows: UsageWindow[] = [];
  for (const item of limits) {
    if (!isRecord(item)) continue;
    // A kind that fails the shape check drops the whole window: it is the series identity, so a
    // hostile value cannot be nulled out and kept.
    const rawKind = safeToken(item.kind);
    const percent = usedPercent(item.percent);
    if (rawKind === null || percent === null) continue;
    const group = safeToken(item.group);
    const key = {
      limitId: "claude",
      rawKind,
      windowMinutes: claudeWindowMinutes(rawKind, group),
      scope: scopedModel(item.scope),
    };
    windows.push({
      ...key,
      seriesId: seriesId(key),
      usedPercent: percent,
      resetsAt: isoDate(item.resets_at),
      group,
      severity: safeToken(item.severity),
      isActive: typeof item.is_active === "boolean" ? item.is_active : null,
    });
  }
  return windows;
}

function flatWindow(
  utilization: Record<string, unknown>,
  rawKind: "five_hour" | "seven_day",
): UsageWindow | null {
  const value = utilization[rawKind];
  if (!isRecord(value)) return null;
  const percent = usedPercent(value.utilization);
  if (percent === null) return null;
  const key = {
    limitId: "claude",
    rawKind,
    windowMinutes: rawKind === "five_hour" ? 300 : 10080,
    scope: null,
  };
  return {
    ...key,
    seriesId: seriesId(key),
    usedPercent: percent,
    resetsAt: isoDate(value.resets_at),
    group: null,
    severity: null,
    isActive: null,
  };
}

function extractSnapshot(text: string): ClaudeSnapshot | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;

  const oauthAccount = isRecord(raw.oauthAccount) ? raw.oauthAccount : null;
  const planRaw = oauthAccount
    ? (safeToken(oauthAccount.organizationRateLimitTier) ??
      safeToken(oauthAccount.organizationType) ??
      safeToken(oauthAccount.subscriptionType))
    : null;
  const cached = isRecord(raw.cachedUsageUtilization) ? raw.cachedUsageUtilization : null;
  if (cached === null)
    return { planRaw, sourceFetchedAt: null, sourceFetchedAtMs: null, windows: [] };
  const fetched = fetchedAt(cached.fetchedAtMs);
  const utilization = isRecord(cached.utilization) ? cached.utilization : null;
  if (utilization === null) {
    return {
      planRaw,
      sourceFetchedAt: fetched.iso,
      sourceFetchedAtMs: fetched.epoch,
      windows: [],
    };
  }

  let windows: UsageWindow[];
  if (Array.isArray(utilization.limits)) {
    windows = limitsWindows(utilization.limits);
  } else {
    windows = [flatWindow(utilization, "five_hour"), flatWindow(utilization, "seven_day")].filter(
      (window): window is UsageWindow => window !== null,
    );
  }
  return {
    planRaw,
    sourceFetchedAt: fetched.iso,
    sourceFetchedAtMs: fetched.epoch,
    windows,
  };
}

async function readWholeFile(access: FileSystemAccess, path: string): Promise<string> {
  const handle = await access.openFile(path);
  try {
    if (handle.size > MAX_STATE_BYTES) throw new Error("unsupported-state-size");
    const chunks: Uint8Array[] = [];
    let position = 0;
    while (position < handle.size) {
      const bytes = await handle.read(position, handle.size - position);
      if (bytes.byteLength === 0) break;
      chunks.push(bytes);
      position += bytes.byteLength;
    }
    const combined = new Uint8Array(position);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(combined);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export async function readClaudeCode(ctx: ClaudeReaderContext): Promise<ToolReading> {
  if (ctx.path.install !== "found") {
    return emptyReading(
      ctx.path.install,
      ctx.path.install === "invalid-override" ? "unreadable" : "no-snapshot",
    );
  }
  if (ctx.path.unreadable) return emptyReading("found", "unreadable");

  const startedAt = performance.now();
  const deadlineAt = startedAt + Math.max(0, ctx.snapshotBudgetMs);
  try {
    if (performance.now() >= deadlineAt) return emptyReading("found", "timed-out");
    const text = await readWholeFile(ctx.access, ctx.path.stateFile);
    if (performance.now() > deadlineAt) return emptyReading("found", "timed-out");
    const snapshot = extractSnapshot(text);
    if (snapshot === null) return emptyReading("found", "unsupported-format");

    const warnings: ReaderWarning[] = [];
    const plan = claudePlan(snapshot.planRaw);
    if (plan.label === null) warnings.push("plan-unknown");
    if (
      snapshot.sourceFetchedAtMs !== null &&
      ctx.now.getTime() - snapshot.sourceFetchedAtMs > STALE_AFTER_MS
    ) {
      warnings.push("snapshot-stale");
    }
    return {
      tool: "claude-code",
      install: "found",
      observation: snapshot.windows.length > 0 ? "ok" : "no-snapshot",
      toolVersion: null,
      plan,
      // Claude Code writes the cache at fetch time, so the local observation is the API fetch.
      observedAt: snapshot.sourceFetchedAt,
      sourceFetchedAt: snapshot.sourceFetchedAt,
      windows: snapshot.windows,
      drain: [],
      evidence: null,
      warnings,
    };
  } catch {
    return emptyReading("found", "unreadable");
  } finally {
    ctx.onPhaseTiming?.("snapshot", performance.now() - startedAt);
    ctx.onPhaseTiming?.("evidence", 0);
  }
}
