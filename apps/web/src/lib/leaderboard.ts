import {
  classify,
  compareRows,
  freshnessState,
  type LeaderboardRow,
  ordinal,
  type SubmissionSuccessV1,
  type ToolId,
  type ToolReading,
  toolMisery,
  type UsageWindow,
} from "@tokenbroke/shared";
import { type Database, getDatabase } from "./db";

const CACHE_TTL_MS = 30_000;

interface StateRow {
  device_id: string;
  anonymous_name: string;
  github_login: string | null;
  avatar_url: string | null;
  install: ToolReading["install"];
  observation: ToolReading["observation"];
  tool_version: string | null;
  observed_at: Date | string;
  source_fetched_at: Date | string | null;
  plan_raw: string | null;
  plan_label: string | null;
  windows: UsageWindow[];
}

interface RankedState {
  deviceId: string;
  reading: ToolReading;
  misery: number;
  row: LeaderboardRow;
}

interface CachedToolLeaderboard {
  expiresAt: number;
  snapshot: ToolLeaderboardInternal;
}

interface ToolLeaderboardInternal {
  tool: ToolId;
  generatedAt: string;
  ranked: RankedState[];
  stale: StaleLeaderboardRow[];
  freshDeviceIds: string[];
  medianRemainingPercent: number | null;
  daysSinceReset: number | null;
}

/**
 * A row that went quiet (RFC 003 §8.3): older than 24 hours, or its binding reset has landed.
 * Visible with numbers frozen at its own last observation; excluded from rank and aggregates.
 */
export interface StaleLeaderboardRow {
  name: string;
  claimed: boolean;
  avatarUrl: string | null;
  plan: string | null;
  /** Remaining % of the window that was binding at the row's last observation. */
  remainingPercent: number;
  observedAt: string;
  /** The binding window's reset has since landed: the sentence was served off-board. */
  servedSentence: boolean;
}

export interface PublicLeaderboardV1 {
  tool: ToolId;
  generatedAt: string;
  rows: LeaderboardRow[];
  staleRows: StaleLeaderboardRow[];
  global: {
    devs: number;
    /** Median remaining percentage over fresh structurally ranked weekly (7d) windows. */
    medianRemainingPercent: number | null;
    daysSinceReset: number | null;
  };
}

const cache = new Map<ToolId, CachedToolLeaderboard>();

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  values.sort((left, right) => left - right);
  const middle = Math.floor(values.length / 2);
  const upper = values[middle];
  if (upper === undefined) return null;
  if (values.length % 2 === 1) return upper;
  const lower = values[middle - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

function readingFor(row: StateRow, tool: ToolId): ToolReading {
  return {
    tool,
    install: row.install,
    observation: row.observation,
    toolVersion: row.tool_version,
    plan: { raw: row.plan_raw, label: row.plan_label },
    observedAt: iso(row.observed_at),
    sourceFetchedAt: iso(row.source_fetched_at),
    windows: row.windows,
    drain: [],
    evidence: null,
    warnings: [],
  };
}

function leaderboardRow(
  state: Omit<RankedState, "row">,
  row: StateRow,
  rank: number,
  now: Date,
): LeaderboardRow {
  const binding = toolMisery(state.reading, now).bindingWindow;
  return {
    rank,
    name: row.github_login ?? row.anonymous_name,
    claimed: row.github_login !== null,
    avatarUrl: row.avatar_url,
    plan: row.plan_label,
    remainingPercent: binding ? 100 - binding.usedPercent : 100,
    resetsAt: binding?.resetsAt ?? null,
    isYou: false,
    modelScoped: worstScoped(state.reading),
    misery: Math.round(state.misery * 10) / 10,
  };
}

/**
 * A stale row's numbers are evaluated at its OWN observation time, not now: "as of their last
 * run" is the only honest reading once the clock has moved on. Rows that were never rankable
 * (no ranked window with a parseable reset) stay out of the stale lane, mirroring the fresh lane.
 */
function staleLeaderboardRow(
  reading: ToolReading,
  row: StateRow,
  now: Date,
): StaleLeaderboardRow | null {
  const observedAt = iso(row.observed_at);
  if (observedAt === null) return null;
  const asOf = toolMisery(reading, new Date(observedAt));
  if (asOf.misery === null || asOf.bindingWindow === null) return null;
  const resetMs = asOf.bindingWindow.resetsAt
    ? Date.parse(asOf.bindingWindow.resetsAt)
    : Number.NaN;
  return {
    name: row.github_login ?? row.anonymous_name,
    claimed: row.github_login !== null,
    avatarUrl: row.avatar_url,
    plan: row.plan_label,
    remainingPercent: Math.round((100 - asOf.bindingWindow.usedPercent) * 10) / 10,
    observedAt,
    servedSentence: Number.isFinite(resetMs) && resetMs <= now.getTime(),
  };
}

/** Worst model-scoped window (secondary by registry design): shown as a chip, never ranked. */
function worstScoped(reading: ToolReading): { label: string; remainingPercent: number } | null {
  let worst: { label: string; remainingPercent: number } | null = null;
  for (const window of reading.windows) {
    if (window.scope === null) continue;
    const remaining = Math.round((100 - window.usedPercent) * 10) / 10;
    if (worst === null || remaining < worst.remainingPercent) {
      worst = { label: window.scope.toLowerCase(), remainingPercent: remaining };
    }
  }
  return worst;
}

async function rebuild(
  tool: ToolId,
  now: Date,
  database: Database,
): Promise<ToolLeaderboardInternal> {
  const started = performance.now();
  const result = await database.query<StateRow>(
    `select ts.device_id, d.anonymous_name, a.github_login, a.avatar_url,
            ts.install, ts.observation, ts.tool_version, ts.observed_at,
            ts.source_fetched_at, ts.plan_raw, ts.plan_label, ts.windows
       from tool_states ts
       join devices d on d.id = ts.device_id
       left join accounts a on a.id = d.account_id
      where ts.tool = $1
        and ts.observed_at > $2
        and d.shadow_banned = false`,
    [tool, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000)],
  );
  const fresh: Array<{ row: StateRow; reading: ToolReading; hasRankedWindow: boolean }> = [];
  const stale: StaleLeaderboardRow[] = [];
  for (const row of result.rows) {
    const reading = readingFor(row, tool);
    const state = freshnessState(reading, now);
    if (state === "hidden") continue;
    if (state === "stale") {
      const staleRow = staleLeaderboardRow(reading, row, now);
      if (staleRow !== null) stale.push(staleRow);
      continue;
    }
    // A device only "participates" in this tool if it reports at least one structurally ranked
    // window. A reading with empty (or only secondary/hidden) windows is fresh but must not inflate
    // the tool's devs count or median (F11).
    const hasRankedWindow = reading.windows.some(
      (window) => classify(window, tool).role === "ranked",
    );
    fresh.push({ row, reading, hasRankedWindow });
  }
  stale.sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
  const rankedWithoutRows = fresh
    .map(({ row, reading }) => {
      const score = toolMisery(reading, now);
      return score.misery === null
        ? null
        : {
            deviceId: row.device_id,
            observedAt: reading.observedAt ?? "",
            reading,
            misery: score.misery,
            remainingPercent: score.bindingWindow
              ? 100 - score.bindingWindow.usedPercent
              : undefined,
            source: row,
          };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort(compareRows);
  const ranked = rankedWithoutRows.map((state, index) => ({
    deviceId: state.deviceId,
    reading: state.reading,
    misery: state.misery,
    row: leaderboardRow(state, state.source, index + 1, now),
  }));
  const weeklyRemaining = fresh.flatMap(({ reading }) =>
    reading.windows
      .filter((window) => {
        const classified = classify(window, tool);
        return classified.role === "ranked" && classified.durationBand === "7d";
      })
      .map((window) => 100 - window.usedPercent),
  );
  const reset = await database.query<{ landed_at: Date | string }>(
    `select landed_at from resets
      where tool = $1 and landed_at <= $2
      order by landed_at desc limit 1`,
    [tool, now],
  );
  const landedAt = reset.rows[0]?.landed_at;
  const daysSinceReset = landedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(landedAt).getTime()) / 86_400_000))
    : null;
  const snapshot: ToolLeaderboardInternal = {
    tool,
    generatedAt: now.toISOString(),
    ranked,
    stale,
    freshDeviceIds: fresh
      .filter(({ hasRankedWindow }) => hasRankedWindow)
      .map(({ row }) => row.device_id),
    medianRemainingPercent: median(weeklyRemaining),
    daysSinceReset,
  };
  const rebuildMs = performance.now() - started;
  const cacheBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  console.log(
    JSON.stringify({
      event: "leaderboard_cache_rebuild",
      tool,
      rowsScanned: result.rows.length,
      rebuildMs: Math.round(rebuildMs * 100) / 100,
      cacheBytes,
    }),
  );
  return snapshot;
}

async function internalLeaderboard(
  tool: ToolId,
  now: Date,
  database: Database,
): Promise<ToolLeaderboardInternal> {
  const existing = cache.get(tool);
  if (existing && existing.expiresAt > now.getTime()) return existing.snapshot;
  const snapshot = await rebuild(tool, now, database);
  cache.set(tool, { expiresAt: now.getTime() + CACHE_TTL_MS, snapshot });
  return snapshot;
}

export function invalidateLeaderboardCache(tool?: ToolId): void {
  if (tool) cache.delete(tool);
  else cache.clear();
}

export async function getPublicLeaderboard(
  tool: ToolId,
  options: { now?: Date; database?: Database } = {},
): Promise<PublicLeaderboardV1> {
  const snapshot = await internalLeaderboard(
    tool,
    options.now ?? new Date(),
    options.database ?? getDatabase(),
  );
  return {
    tool,
    generatedAt: snapshot.generatedAt,
    rows: snapshot.ranked.map(({ row }) => row),
    staleRows: snapshot.stale,
    global: {
      devs: snapshot.freshDeviceIds.length,
      medianRemainingPercent: snapshot.medianRemainingPercent,
      daysSinceReset: snapshot.daysSinceReset,
    },
  };
}

function rowsForUser(
  snapshot: ToolLeaderboardInternal,
  deviceId: string,
): {
  result: SubmissionSuccessV1["perTool"][number];
} {
  const userIndex = snapshot.ranked.findIndex((state) => state.deviceId === deviceId);
  const user = userIndex >= 0 ? snapshot.ranked[userIndex] : undefined;
  const neighbors =
    userIndex < 0
      ? []
      : snapshot.ranked
          .slice(Math.max(0, userIndex - 3), userIndex + 4)
          .map(({ row }) => ({ ...row, isYou: row.rank === user?.row.rank }));
  const neighborRanks = new Set(neighbors.map((row) => row.rank));
  const top = snapshot.ranked
    .slice(0, 3)
    .map(({ row }) => ({ ...row, isYou: row.rank === user?.row.rank }))
    .filter((row) => !neighborRanks.has(row.rank));
  return {
    result: {
      tool: snapshot.tool,
      rankable: user !== undefined,
      rank: user?.row.rank ?? null,
      total: snapshot.ranked.length,
      misery: user?.misery ?? null,
      bindingSeriesId: user
        ? toolMisery(user.reading, new Date(snapshot.generatedAt)).bindingSeriesId
        : null,
      top,
      neighbors,
      roast: user
        ? `You are the ${ordinal(user.row.rank)} brokest developer alive. Charity declined.`
        : "No sentence on record.",
    },
  };
}

export async function submissionLeaderboard(
  deviceId: string,
  now: Date,
  database: Database,
): Promise<{
  perTool: SubmissionSuccessV1["perTool"];
  global: SubmissionSuccessV1["global"];
}> {
  const snapshots = await Promise.all([
    internalLeaderboard("claude-code", now, database),
    internalLeaderboard("codex", now, database),
  ]);
  const allDevices = new Set(snapshots.flatMap((snapshot) => snapshot.freshDeviceIds));
  return {
    perTool: snapshots.map((snapshot) => rowsForUser(snapshot, deviceId).result),
    global: {
      devs: allDevices.size,
      perTool: snapshots.map((snapshot) => ({
        tool: snapshot.tool,
        medianRemainingPercent: snapshot.medianRemainingPercent,
        daysSinceReset: snapshot.daysSinceReset,
      })),
    },
  };
}
