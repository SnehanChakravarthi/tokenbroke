import { createHash, randomBytes } from "node:crypto";
import { platform } from "node:os";
import {
  API_PATH_V1,
  BRAND,
  type LocalReadings,
  SCHEMA_VERSION,
  type SubmissionResponseV1,
  type SubmissionSuccessV1,
  type SubmissionV1,
  type ToolId,
} from "@tokenbroke/shared";
import { canonicalJson, signBytes } from "@tokenbroke/shared/node/signing";
import {
  type Identity,
  loadConfig,
  loadOrCreateIdentity,
  saveConfig,
  saveLastSubmission,
  type TokenbrokePaths,
  tokenbrokePaths,
} from "./identity";

declare const __TOKENBROKE_CLI_VERSION__: string;
export const CLI_VERSION =
  typeof __TOKENBROKE_CLI_VERSION__ === "undefined" ? "0.0.0" : __TOKENBROKE_CLI_VERSION__;

export interface SubmitOptions {
  trigger?: "manual" | `hook:${ToolId}`;
  now?: Date;
  paths?: TokenbrokePaths;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SubmitResult {
  payload: SubmissionV1;
  response: SubmissionResponseV1;
}

/**
 * The network call itself failed: DNS, connection, timeout, or a body the board did not send.
 * Local failures (a corrupt identity, an unwritable config) are never this — they get their own copy.
 */
export class SubmitNetworkError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "SubmitNetworkError";
  }
}

function platformOs(): SubmissionV1["platform"]["os"] {
  const os = platform();
  return os === "darwin" || os === "linux" || os === "win32" ? os : "other";
}

export function buildSubmission(
  readings: LocalReadings,
  identity: Identity,
  options: Pick<SubmitOptions, "trigger" | "now"> = {},
): SubmissionV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    cliVersion: CLI_VERSION,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    submittedAt: (options.now ?? new Date()).toISOString(),
    nonce: randomBytes(16).toString("base64url"),
    trigger: options.trigger ?? "manual",
    platform: { os: platformOs(), node: process.versions.node.split(".")[0] ?? "20" },
    readings,
  };
}

export function hashWindows(readings: LocalReadings): string {
  const windows = readings.map((reading) => ({ tool: reading.tool, windows: reading.windows }));
  return createHash("sha256").update(canonicalJson(windows)).digest("base64url");
}

function isResponse(value: unknown): value is SubmissionResponseV1 {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const response = value as { ok?: unknown; reason?: unknown; notice?: unknown };
  if (response.ok === false) {
    return typeof response.reason === "string" && typeof response.notice === "string";
  }
  if (response.ok !== true) return false;
  const success = value as Partial<SubmissionSuccessV1>;
  return (
    success.schemaVersion === SCHEMA_VERSION &&
    typeof success.identity === "object" &&
    Array.isArray(success.perTool) &&
    typeof success.global === "object" &&
    Array.isArray(success.notices)
  );
}

export async function submitReadings(
  readings: LocalReadings,
  options: SubmitOptions = {},
): Promise<SubmitResult> {
  const paths = options.paths ?? tokenbrokePaths();
  const identity = await loadOrCreateIdentity(paths);
  const payload = buildSubmission(readings, identity, options);
  const body = Buffer.from(canonicalJson(payload));
  const signature = signBytes(body, identity.privateKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    const base = options.apiUrl ?? process.env.TOKENBROKE_API_URL ?? BRAND.siteUrl;
    response = await (options.fetchImpl ?? fetch)(new URL(API_PATH_V1, base), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tokenbroke-signature": `ed25519=${signature}`,
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    throw new SubmitNetworkError("could not reach the board", error);
  } finally {
    clearTimeout(timeout);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new SubmitNetworkError("invalid server response", error);
  }
  if (!isResponse(parsed)) throw new SubmitNetworkError("invalid server response");
  if (parsed.ok) {
    const config = await loadConfig(paths);
    config.anonymousName = parsed.identity.anonymousName;
    config.claimCode = parsed.claim?.code;
    await saveConfig(config, paths);
    await saveLastSubmission(
      {
        deviceId: identity.deviceId,
        windowsHash: hashWindows(readings),
        submittedAt: payload.submittedAt,
        trigger: payload.trigger,
      },
      paths,
    );
  }
  return { payload, response: parsed };
}

export function redactedSubmission(payload: SubmissionV1): Record<string, unknown> {
  return { ...payload, publicKey: "[redacted]", nonce: "[redacted]" };
}
