export type ToolId = "claude-code" | "codex";
export type InstallStatus = "found" | "not-found" | "invalid-override";
export type ObservationStatus =
  | "ok"
  | "no-snapshot"
  | "unreadable"
  | "unsupported-format"
  | "timed-out";
export type ReaderWarning =
  | "snapshot-stale"
  | "evidence-timed-out"
  | "compressed-rollouts-skipped"
  | "malformed-lines-skipped"
  | "archived-fallback-used"
  | "plan-unknown";

export interface UsageSeriesKey {
  limitId: string;
  rawKind: string;
  windowMinutes: number | null;
  scope: string | null;
}

export function seriesId(k: UsageSeriesKey): string {
  return `${k.limitId}:${k.rawKind}:${k.windowMinutes ?? "?"}:${k.scope ?? ""}`;
}

export interface UsageWindow extends UsageSeriesKey {
  seriesId: string;
  usedPercent: number;
  resetsAt: string | null;
  group: string | null;
  severity: string | null;
  isActive: boolean | null;
}
export interface DrainSample {
  at: string;
  seriesId: string;
  usedPercent: number;
  resetsAt: string | null;
}
export interface PlanInfo {
  raw: string | null;
  label: string | null;
}

export interface ToolReading {
  tool: ToolId;
  install: InstallStatus;
  observation: ObservationStatus;
  toolVersion: string | null;
  plan: PlanInfo;
  observedAt: string | null;
  sourceFetchedAt: string | null;
  windows: UsageWindow[];
  drain: DrainSample[];
  evidence: null;
  warnings: ReaderWarning[];
}
export type LocalReadings = [claudeCode: ToolReading, codex: ToolReading];
