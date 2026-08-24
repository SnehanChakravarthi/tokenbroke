import { describe, expect, it } from "vitest";
import {
  API_PATH_V1,
  SCHEMA_VERSION,
  type SubmissionResponseV1,
  type SubmissionV1,
} from "../src/contract/v1";
import { validateSubmissionV1 } from "../src/contract/validate";
import { seriesId } from "../src/readings";

function validSubmission(): SubmissionV1 {
  const reading = (tool: "claude-code" | "codex") => {
    const key = {
      limitId: tool === "codex" ? "codex" : "claude",
      rawKind: tool === "codex" ? "primary" : "session",
      windowMinutes: 300,
      scope: null,
    };
    return {
      tool,
      install: "found" as const,
      observation: "ok" as const,
      toolVersion: "1.2.3",
      plan: { raw: "plus", label: "Plus" },
      observedAt: "2026-08-24T12:00:00.000Z",
      sourceFetchedAt: "2026-08-24T12:00:00.000Z",
      windows: [
        {
          ...key,
          seriesId: seriesId(key),
          usedPercent: 75,
          resetsAt: "2026-08-24T17:00:00.000Z",
          group: null,
          severity: null,
          isActive: true,
        },
      ],
      drain: [
        {
          at: "2026-08-24T11:45:00.000Z",
          seriesId: seriesId(key),
          usedPercent: 74,
          resetsAt: "2026-08-24T17:00:00.000Z",
        },
      ],
      evidence: null,
      warnings: [],
    };
  };
  return {
    schemaVersion: 1,
    cliVersion: "0.0.0",
    deviceId: "1234567890123456789012",
    publicKey: "public-key",
    submittedAt: "2026-08-24T12:00:00.000Z",
    nonce: "1234567890123456789012",
    trigger: "manual",
    platform: { os: "linux", node: "20" },
    readings: [reading("claude-code"), reading("codex")],
  };
}

function replace(payload: SubmissionV1, path: string, value: unknown): unknown {
  const copy = structuredClone(payload) as unknown as Record<string, unknown>;
  const parts = path.split(".");
  let target = copy;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts.at(-1) as string] = value;
  return copy;
}

describe("submission contract v1", () => {
  it("pins the versioned route and discriminates rejection", () => {
    const response: SubmissionResponseV1 = {
      ok: false,
      reason: "unsupported-version",
      notice: "fixture",
    };
    expect(SCHEMA_VERSION).toBe(1);
    expect(API_PATH_V1).toBe("/api/v1/submissions");
    expect(response.ok).toBe(false);
  });

  it("accepts the complete v1 shape and returns the typed payload", () => {
    const payload = validSubmission();
    expect(validateSubmissionV1(payload)).toEqual({ ok: true, payload });
  });

  it.each([
    ["root arrays", []],
    ["unsupported schema", replace(validSubmission(), "schemaVersion", 2)],
    ["unknown trigger", replace(validSubmission(), "trigger", "timer")],
    ["unknown platform", replace(validSubmission(), "platform.os", "freebsd")],
    [
      "reversed tools",
      { ...validSubmission(), readings: [...validSubmission().readings].reverse() },
    ],
    ["non-null evidence", replace(validSubmission(), "readings.0.evidence", {})],
    ["unknown warning", replace(validSubmission(), "readings.0.warnings", ["private-data"])],
    ["NaN percentage", replace(validSubmission(), "readings.0.windows.0.usedPercent", Number.NaN)],
    ["infinite percentage", replace(validSubmission(), "readings.0.drain.0.usedPercent", Infinity)],
    ["negative percentage", replace(validSubmission(), "readings.0.windows.0.usedPercent", -1)],
    ["percentage above 100", replace(validSubmission(), "readings.0.windows.0.usedPercent", 101)],
    [
      "fractional window minutes",
      replace(validSubmission(), "readings.0.windows.0.windowMinutes", 1.5),
    ],
    ["invalid submittedAt", replace(validSubmission(), "submittedAt", "not-a-date")],
    ["invalid observedAt", replace(validSubmission(), "readings.0.observedAt", "not-a-date")],
    ["windows without observedAt", replace(validSubmission(), "readings.0.observedAt", null)],
    ["invalid reset", replace(validSubmission(), "readings.0.windows.0.resetsAt", "not-a-date")],
    ["invalid drain time", replace(validSubmission(), "readings.0.drain.0.at", "not-a-date")],
    ["wrong series id", replace(validSubmission(), "readings.0.windows.0.seriesId", "forged")],
    ["oversized cli version", replace(validSubmission(), "cliVersion", "x".repeat(65))],
    ["oversized windows", replace(validSubmission(), "readings.0.windows", Array(129).fill({}))],
    [
      "control char in plan label",
      replace(validSubmission(), "readings.0.plan.label", "\u001b<img onerror=alert(1)>"),
    ],
    ["control char in scope", replace(validSubmission(), "readings.0.windows.0.scope", "a\u007fb")],
  ])("rejects hostile %s", (_name, value) => {
    expect(validateSubmissionV1(value)).toEqual({ ok: false });
  });

  it("rejects more than 2,000 drain samples across both tools", () => {
    const payload = validSubmission();
    payload.readings[0].drain = Array.from({ length: 1_001 }, () => payload.readings[0].drain[0]);
    payload.readings[1].drain = Array.from({ length: 1_000 }, () => payload.readings[1].drain[0]);
    expect(validateSubmissionV1(payload)).toEqual({ ok: false });
  });

  it("rejects accessor properties without invoking them", () => {
    let invoked = false;
    const payload = validSubmission() as unknown as Record<string, unknown>;
    Object.defineProperty(payload, "nonce", {
      enumerable: true,
      get() {
        invoked = true;
        return "nonce";
      },
    });
    expect(validateSubmissionV1(payload)).toEqual({ ok: false });
    expect(invoked).toBe(false);
  });
});
