import type { LocalReadings, ToolId } from "../readings";

export const SCHEMA_VERSION = 1 as const;
export const API_PATH_V1 = "/api/v1/submissions" as const;

export interface SubmissionV1 {
  schemaVersion: typeof SCHEMA_VERSION;
  cliVersion: string;
  deviceId: string;
  publicKey: string;
  submittedAt: string;
  nonce: string;
  trigger: "manual" | `hook:${ToolId}`;
  platform: {
    os: "darwin" | "linux" | "win32" | "other";
    node: string;
  };
  readings: LocalReadings;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  claimed: boolean;
  avatarUrl: string | null;
  plan: string | null;
  remainingPercent: number;
  resetsAt: string | null;
  isYou: boolean;
  /** Worst model-scoped weekly window (e.g. Claude's Fable limit): visible, never ranked. */
  modelScoped?: { label: string; remainingPercent: number } | null;
}

export interface SubmissionSuccessV1 {
  ok: true;
  schemaVersion: typeof SCHEMA_VERSION;
  identity: {
    deviceId: string;
    anonymousName: string;
    claimed: null | { githubLogin: string };
  };
  claim: null | { code: string; url: string; expiresAt: string };
  perTool: Array<{
    tool: ToolId;
    rankable: boolean;
    rank: number | null;
    total: number;
    misery: number | null;
    bindingSeriesId: string | null;
    top: LeaderboardRow[];
    neighbors: LeaderboardRow[];
    roast: string;
  }>;
  global: {
    devs: number;
    perTool: Array<{
      tool: ToolId;
      medianRemainingPercent: number | null;
      daysSinceReset: number | null;
    }>;
  };
  notices: string[];
}

export type SubmissionRejectReason =
  | "signature"
  | "skew"
  | "replay"
  | "rate-limited"
  | "invalid"
  // Semantic time violations the pure shape validator cannot catch (it is `now`-free):
  // forged reset horizons, future/ancient observation times. Emitted by the web write path.
  | "implausible"
  | "unsupported-version";

export interface SubmissionFailureV1 {
  ok: false;
  reason: SubmissionRejectReason;
  notice: string;
}

export type SubmissionResponseV1 = SubmissionSuccessV1 | SubmissionFailureV1;
