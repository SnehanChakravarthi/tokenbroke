import type {
  LeaderboardRow,
  LocalReadings,
  SubmissionSuccessV1,
  ToolReading,
  UsageWindow,
} from "@tokenbroke/shared";
import { claimUrl } from "@tokenbroke/shared";

export const TEST_NOW = new Date("2026-08-23T12:00:00.000Z");

function usageWindow(
  tool: "claude-code" | "codex",
  usedPercent: number,
  resetHours: number,
): UsageWindow {
  const isClaude = tool === "claude-code";
  const limitId = isClaude ? "claude" : "codex";
  const rawKind = isClaude ? "session" : "primary";
  return {
    limitId,
    rawKind,
    windowMinutes: 300,
    scope: null,
    seriesId: `${limitId}:${rawKind}:300:`,
    usedPercent,
    resetsAt: new Date(TEST_NOW.getTime() + resetHours * 3_600_000).toISOString(),
    group: null,
    severity: null,
    isActive: null,
  };
}

export function toolReading(
  tool: "claude-code" | "codex",
  usedPercent = 98,
  resetHours = 4,
): ToolReading {
  return {
    tool,
    install: "found",
    observation: "ok",
    toolVersion: null,
    plan: {
      raw: isClaude(tool) ? "default_claude_max_5x" : "plus",
      label: isClaude(tool) ? "Max 5x" : "Plus",
    },
    observedAt: TEST_NOW.toISOString(),
    sourceFetchedAt: TEST_NOW.toISOString(),
    windows: [usageWindow(tool, usedPercent, resetHours)],
    drain: [],
    evidence: null,
    warnings: [],
  };
}

function isClaude(tool: "claude-code" | "codex"): boolean {
  return tool === "claude-code";
}

export function localReadings(): LocalReadings {
  return [toolReading("claude-code"), toolReading("codex", 96, 3)];
}

function row(rank: number, name: string, isYou = false): LeaderboardRow {
  return {
    rank,
    name,
    claimed: rank % 2 === 0,
    avatarUrl: null,
    plan: rank % 2 === 0 ? "Plus" : "Max 5x",
    remainingPercent: rank,
    resetsAt: new Date(TEST_NOW.getTime() + rank * 3_600_000).toISOString(),
    isYou,
  };
}

export function successResponse(): SubmissionSuccessV1 {
  return {
    ok: true,
    schemaVersion: 1,
    identity: { deviceId: "device", anonymousName: "starving-crab-42", claimed: null },
    claim: {
      code: "ABCD-1234",
      url: claimUrl("ABCD-1234"),
      expiresAt: "2026-08-30T12:00:00.000Z",
    },
    perTool: [
      {
        tool: "claude-code",
        rankable: true,
        rank: 5,
        total: 20,
        misery: 3.5,
        bindingSeriesId: "claude:session:300:",
        top: [row(1, "starving-crab-1"), row(2, "tokenless-newt-2"), row(3, "broke-moth-3")],
        neighbors: [
          row(4, "capped-vole-4"),
          row(5, "starving-crab-42", true),
          row(6, "idle-toad-6"),
        ],
        roast: "You are the 5th brokest developer alive. Charity declined.",
      },
      {
        tool: "codex",
        rankable: true,
        rank: 2,
        total: 15,
        misery: 2,
        bindingSeriesId: "codex:primary:300:",
        top: [row(1, "drained-newt-1")],
        neighbors: [
          row(1, "drained-newt-1"),
          row(2, "starving-crab-42", true),
          row(3, "busted-mole-3"),
        ],
        roast: "You are the 2nd brokest developer alive. Charity declined.",
      },
    ],
    global: {
      devs: 4218,
      perTool: [
        { tool: "claude-code", medianRemainingPercent: 9, daysSinceReset: 2 },
        { tool: "codex", medianRemainingPercent: 12, daysSinceReset: null },
      ],
    },
    notices: [],
  };
}
