import {
  type InstallStatus,
  type ObservationStatus,
  type ReaderWarning,
  seriesId,
  type ToolId,
} from "../readings";
import { SCHEMA_VERSION, type SubmissionV1 } from "./v1";

export type SubmissionValidationResult = { ok: true; payload: SubmissionV1 } | { ok: false };

const MAX_WINDOWS_PER_TOOL = 128;
const MAX_DRAIN_SAMPLES = 2_000;
const MAX_WARNINGS_PER_TOOL = 32;
const MAX_TIMESTAMP_LENGTH = 64;
const MAX_TOKEN_LENGTH = 128;
const MAX_LABEL_LENGTH = 256;
const MAX_SERIES_ID_LENGTH = 640;
const MAX_WINDOW_MINUTES = 525_600;

const INSTALL_STATUSES = new Set<InstallStatus>(["found", "not-found", "invalid-override"]);
const OBSERVATION_STATUSES = new Set<ObservationStatus>([
  "ok",
  "no-snapshot",
  "unreadable",
  "unsupported-format",
  "timed-out",
]);
const WARNINGS = new Set<ReaderWarning>([
  "snapshot-stale",
  "evidence-timed-out",
  "compressed-rollouts-skipped",
  "malformed-lines-skipped",
  "archived-fallback-used",
  "plan-unknown",
]);
const PLATFORMS = new Set(["darwin", "linux", "win32", "other"]);

type RecordValue = Record<string, unknown>;

function record(value: unknown, keys: readonly string[]): value is RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function field(value: RecordValue, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function item(value: unknown[], index: number): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/**
 * C0 (0x00–0x1F) and C1 (0x7F–0x9F) control characters have no place in a plan label, series id,
 * or any other string we republish to other users; they enable terminal-escape and markup
 * injection. Rejected everywhere `string()` is used, without invoking a control-char regex.
 */
function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

function string(value: unknown, max: number, allowEmpty = false): value is string {
  return (
    typeof value === "string" &&
    value.length <= max &&
    (allowEmpty || value.length > 0) &&
    !hasControlChar(value)
  );
}

function nullableString(value: unknown, max: number): value is string | null {
  return value === null || string(value, max);
}

function timestamp(value: unknown): value is string {
  return string(value, MAX_TIMESTAMP_LENGTH) && Number.isFinite(Date.parse(value));
}

function nullableTimestamp(value: unknown): value is string | null {
  return value === null || timestamp(value);
}

function percentage(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function nullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

function validPlan(value: unknown): boolean {
  if (!record(value, ["raw", "label"])) return false;
  return (
    nullableString(field(value, "raw"), MAX_LABEL_LENGTH) &&
    nullableString(field(value, "label"), MAX_LABEL_LENGTH)
  );
}

function validWindow(value: unknown): boolean {
  if (
    !record(value, [
      "limitId",
      "rawKind",
      "windowMinutes",
      "scope",
      "seriesId",
      "usedPercent",
      "resetsAt",
      "group",
      "severity",
      "isActive",
    ])
  ) {
    return false;
  }
  const limitId = field(value, "limitId");
  const rawKind = field(value, "rawKind");
  const windowMinutes = field(value, "windowMinutes");
  const scope = field(value, "scope");
  const actualSeriesId = field(value, "seriesId");
  if (
    !string(limitId, MAX_TOKEN_LENGTH) ||
    !string(rawKind, MAX_TOKEN_LENGTH) ||
    !(
      windowMinutes === null ||
      (typeof windowMinutes === "number" &&
        Number.isFinite(windowMinutes) &&
        Number.isInteger(windowMinutes) &&
        windowMinutes > 0 &&
        windowMinutes <= MAX_WINDOW_MINUTES)
    ) ||
    !nullableString(scope, MAX_LABEL_LENGTH) ||
    !string(actualSeriesId, MAX_SERIES_ID_LENGTH)
  ) {
    return false;
  }
  if (actualSeriesId !== seriesId({ limitId, rawKind, windowMinutes, scope })) return false;
  return (
    percentage(field(value, "usedPercent")) &&
    nullableTimestamp(field(value, "resetsAt")) &&
    nullableString(field(value, "group"), MAX_TOKEN_LENGTH) &&
    nullableString(field(value, "severity"), MAX_TOKEN_LENGTH) &&
    nullableBoolean(field(value, "isActive"))
  );
}

function validDrainSample(value: unknown): boolean {
  if (!record(value, ["at", "seriesId", "usedPercent", "resetsAt"])) return false;
  return (
    timestamp(field(value, "at")) &&
    string(field(value, "seriesId"), MAX_SERIES_ID_LENGTH) &&
    percentage(field(value, "usedPercent")) &&
    nullableTimestamp(field(value, "resetsAt"))
  );
}

function boundedArray(value: unknown, max: number, validate: (entry: unknown) => boolean): boolean {
  if (!Array.isArray(value) || value.length > max) return false;
  for (let index = 0; index < value.length; index++) {
    if (!validate(item(value, index))) return false;
  }
  return true;
}

function validReading(value: unknown, tool: ToolId): { ok: boolean; drainCount: number } {
  if (
    !record(value, [
      "tool",
      "install",
      "observation",
      "toolVersion",
      "plan",
      "observedAt",
      "sourceFetchedAt",
      "windows",
      "drain",
      "evidence",
      "warnings",
    ])
  ) {
    return { ok: false, drainCount: 0 };
  }
  const drain = field(value, "drain");
  const observedAt = field(value, "observedAt");
  const windows = field(value, "windows");
  const warnings = field(value, "warnings");
  const validWarnings = boundedArray(warnings, MAX_WARNINGS_PER_TOOL, (warning) =>
    WARNINGS.has(warning as ReaderWarning),
  );
  const ok =
    field(value, "tool") === tool &&
    INSTALL_STATUSES.has(field(value, "install") as InstallStatus) &&
    OBSERVATION_STATUSES.has(field(value, "observation") as ObservationStatus) &&
    nullableString(field(value, "toolVersion"), MAX_TOKEN_LENGTH) &&
    validPlan(field(value, "plan")) &&
    nullableTimestamp(observedAt) &&
    nullableTimestamp(field(value, "sourceFetchedAt")) &&
    boundedArray(windows, MAX_WINDOWS_PER_TOOL, validWindow) &&
    (!Array.isArray(windows) || windows.length === 0 || observedAt !== null) &&
    boundedArray(drain, MAX_DRAIN_SAMPLES, validDrainSample) &&
    field(value, "evidence") === null &&
    validWarnings;
  return { ok, drainCount: Array.isArray(drain) ? drain.length : 0 };
}

/** Full, zero-dependency runtime validation for the signed v1 submission contract. */
export function validateSubmissionV1(value: unknown): SubmissionValidationResult {
  if (
    !record(value, [
      "schemaVersion",
      "cliVersion",
      "deviceId",
      "publicKey",
      "submittedAt",
      "nonce",
      "trigger",
      "platform",
      "readings",
    ])
  ) {
    return { ok: false };
  }
  const trigger = field(value, "trigger");
  const platform = field(value, "platform");
  const readings = field(value, "readings");
  if (
    field(value, "schemaVersion") !== SCHEMA_VERSION ||
    !string(field(value, "cliVersion"), 64) ||
    !string(field(value, "deviceId"), 64) ||
    !string(field(value, "publicKey"), 256) ||
    !timestamp(field(value, "submittedAt")) ||
    !string(field(value, "nonce"), 128) ||
    (trigger !== "manual" && trigger !== "hook:claude-code" && trigger !== "hook:codex") ||
    !record(platform, ["os", "node"]) ||
    !PLATFORMS.has(field(platform, "os") as string) ||
    !string(field(platform, "node"), 32) ||
    !Array.isArray(readings) ||
    readings.length !== 2
  ) {
    return { ok: false };
  }
  const claude = validReading(item(readings, 0), "claude-code");
  const codex = validReading(item(readings, 1), "codex");
  if (!claude.ok || !codex.ok || claude.drainCount + codex.drainCount > MAX_DRAIN_SAMPLES) {
    return { ok: false };
  }
  return { ok: true, payload: value as unknown as SubmissionV1 };
}
