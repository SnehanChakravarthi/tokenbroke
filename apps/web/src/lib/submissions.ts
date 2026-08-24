import { randomInt } from "node:crypto";
import {
  claimUrl,
  generateAnonymousName,
  plausibleReadingTimes,
  REGISTRY_VERSION,
  SCHEMA_VERSION,
  type SubmissionFailureV1,
  type SubmissionSuccessV1,
  type SubmissionV1,
  stableDeviceHash,
  validateSubmissionV1,
} from "@tokenbroke/shared";
import { deviceIdFor, verifyBytes } from "@tokenbroke/shared/node/signing";
import { type Database, type DatabaseQuery, getDatabase } from "./db";
import { invalidateLeaderboardCache, submissionLeaderboard } from "./leaderboard";
import { admitRateBucket } from "./rate-limit";
import { claimCodeDigest, claimCodeFor } from "./security";

const BODY_LIMIT = 2 * 1024 * 1024;
const CLAIM_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
// Semantic-time plausibility bounds. `validateSubmissionV1` is pure and `now`-free, so these
// checks live here where `now` is available (RFC 004 §9.2, F2a). They guard the aggregate against
// self-reported times: a reset horizon further out than the window's own length (plus slack), an
// observation timestamp in the future, or an absurdly old observation.

class SubmissionRejection extends Error {
  constructor(readonly reason: SubmissionFailureV1["reason"]) {
    super(reason);
  }
}

interface ExistingDevice {
  id: string;
  public_key: string;
  anonymous_name: string;
  account_id: string | null;
}

interface IssuedClaim {
  code: string;
  expiresAt: Date;
}

interface TransactionResult {
  device: ExistingDevice;
  githubLogin: string | null;
  claim: IssuedClaim | null;
}

function failure(reason: SubmissionFailureV1["reason"]): SubmissionFailureV1 {
  return { ok: false, reason, notice: reason };
}

export function failureResponse(reason: SubmissionFailureV1["reason"]): Response {
  return Response.json(failure(reason), { status: 400 });
}

/**
 * Server-side fault (missing config, DB/unknown error). 503 with a non-SubmissionFailureV1 body:
 * the CLI treats 5xx-shaped/unrecognized responses as retryable network trouble, not a terminal
 * rejection, so a transient outage never tells a user their offering was "declined".
 */
function serverFault(): Response {
  return Response.json({ error: "server-error", retryable: true }, { status: 503 });
}

async function requestBytes(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > BODY_LIMIT) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > BODY_LIMIT) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function dataField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function signatureKeys(value: unknown): { publicKey: string; deviceId: string } | null {
  const publicKey = dataField(value, "publicKey");
  const deviceId = dataField(value, "deviceId");
  if (
    typeof publicKey !== "string" ||
    publicKey.length === 0 ||
    publicKey.length > 256 ||
    typeof deviceId !== "string" ||
    deviceId.length === 0 ||
    deviceId.length > 64
  ) {
    return null;
  }
  return { publicKey, deviceId };
}

function widerName(): string {
  return generateAnonymousName().replace(/-\d+$/, `-${randomInt(100, 1_000_000)}`);
}

async function createOrLockDevice(
  tx: DatabaseQuery,
  payload: SubmissionV1,
): Promise<ExistingDevice> {
  for (let attempt = 0; attempt < 32; attempt++) {
    const anonymousName = attempt < 16 ? generateAnonymousName() : widerName();
    await tx.query(
      `insert into devices
         (id, public_key, anonymous_name, stable_hash, last_submitted_at,
          last_cli_version, last_platform_os)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict do nothing`,
      [
        payload.deviceId,
        payload.publicKey,
        anonymousName,
        stableDeviceHash(payload.deviceId),
        new Date(payload.submittedAt),
        payload.cliVersion,
        payload.platform.os,
      ],
    );
    const locked = await tx.query<ExistingDevice>(
      `select id, public_key, anonymous_name, account_id
         from devices where id = $1 for update`,
      [payload.deviceId],
    );
    const device = locked.rows[0];
    if (device) {
      if (device.public_key !== payload.publicKey) throw new SubmissionRejection("signature");
      return device;
    }
  }
  throw new Error("anonymous name allocation exhausted");
}

async function insertSubmission(
  tx: DatabaseQuery,
  payload: SubmissionV1,
  rawBody: Uint8Array,
  signature: string,
  now: Date,
): Promise<number> {
  const inserted = await tx.query<{ id: string | number }>(
    `insert into submissions
       (device_id, received_at, submitted_at, trigger, schema_version, cli_version,
        platform_os, nonce, raw_body, signature)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (nonce) do nothing
     returning id`,
    [
      payload.deviceId,
      now,
      new Date(payload.submittedAt),
      payload.trigger,
      payload.schemaVersion,
      payload.cliVersion,
      payload.platform.os,
      payload.nonce,
      rawBody,
      signature,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (id === undefined) throw new SubmissionRejection("replay");
  return Number(id);
}

async function writeReadings(
  tx: DatabaseQuery,
  payload: SubmissionV1,
  submissionId: number,
  now: Date,
): Promise<void> {
  for (const reading of payload.readings) {
    if (reading.observedAt === null) continue;
    const observedAt = new Date(reading.observedAt);
    // TODO(perf): batch these per-reading window rows into a single multi-values insert instead of
    // one round-trip per window. Left serial-under-lock for launch; row counts are tiny today.
    for (const window of reading.windows) {
      await tx.query(
        // snapshot_obs PK is (device_id, tool, series_id, observed_at). Two windows in one reading
        // that resolve to the same series_id at the same observed_at collapse to one row here
        // ('do nothing' keeps the first); that is intended — they are the same series snapshot.
        `insert into snapshot_obs
           (device_id, tool, series_id, observed_at, submission_id, source, used_percent,
            resets_at, window_minutes, raw_kind, scope, plan_raw, cli_version, registry_version)
         values ($1, $2, $3, $4, $5, 'snapshot', $6, $7, $8, $9, $10, $11, $12, $13)
         on conflict (device_id, tool, series_id, observed_at) do nothing`,
        [
          payload.deviceId,
          reading.tool,
          window.seriesId,
          observedAt,
          submissionId,
          window.usedPercent,
          window.resetsAt ? new Date(window.resetsAt) : null,
          window.windowMinutes,
          window.rawKind,
          window.scope,
          reading.plan.raw,
          payload.cliVersion,
          REGISTRY_VERSION,
        ],
      );
    }
    await tx.query(
      `insert into tool_states
         (device_id, tool, install, observation, tool_version, observed_at, source_fetched_at,
          plan_raw, plan_label, windows, registry_version, state_nonce, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
       on conflict (device_id, tool) do update set
         install = excluded.install,
         observation = excluded.observation,
         tool_version = excluded.tool_version,
         observed_at = excluded.observed_at,
         source_fetched_at = case
           when tool_states.source_fetched_at is null then excluded.source_fetched_at
           when excluded.source_fetched_at is null then tool_states.source_fetched_at
           else greatest(tool_states.source_fetched_at, excluded.source_fetched_at)
         end,
         plan_raw = excluded.plan_raw,
         plan_label = excluded.plan_label,
         windows = excluded.windows,
         registry_version = excluded.registry_version,
         state_nonce = excluded.state_nonce,
         updated_at = excluded.updated_at
       where excluded.observed_at > tool_states.observed_at
          or (excluded.observed_at = tool_states.observed_at
              and excluded.state_nonce > tool_states.state_nonce)`,
      [
        payload.deviceId,
        reading.tool,
        reading.install,
        reading.observation,
        reading.toolVersion,
        observedAt,
        reading.sourceFetchedAt ? new Date(reading.sourceFetchedAt) : null,
        reading.plan.raw,
        reading.plan.label,
        JSON.stringify(reading.windows),
        REGISTRY_VERSION,
        payload.nonce,
        now,
      ],
    );
  }
}

async function issueOrReuseClaim(
  tx: DatabaseQuery,
  device: ExistingDevice,
  now: Date,
  secret: string,
): Promise<IssuedClaim | null> {
  if (device.account_id !== null) return null;
  const existing = await tx.query<{
    code_digest: string;
    created_at: Date | string;
    expires_at: Date | string;
  }>(
    `select code_digest, created_at, expires_at from claim_codes
      where device_id = $1 and claimed_at is null and expires_at > $2
      order by expires_at desc limit 1`,
    [device.id, now],
  );
  const row = existing.rows[0];
  if (row) {
    const createdAt = new Date(row.created_at);
    const code = claimCodeFor(device.id, createdAt, secret);
    if (claimCodeDigest(code, secret) === row.code_digest) {
      return { code, expiresAt: new Date(row.expires_at) };
    }
  }
  for (let attempt = 0; attempt < 32; attempt++) {
    const createdAt = new Date(now.getTime() + attempt);
    const expiresAt = new Date(createdAt.getTime() + CLAIM_LIFETIME_MS);
    const code = claimCodeFor(device.id, createdAt, secret);
    const digest = claimCodeDigest(code, secret);
    const inserted = await tx.query(
      `insert into claim_codes (code_digest, device_id, created_at, expires_at)
       values ($1, $2, $3, $4) on conflict do nothing returning code_digest`,
      [digest, device.id, createdAt, expiresAt],
    );
    if (inserted.rowCount === 1) return { code, expiresAt };
  }
  throw new Error("claim code allocation exhausted");
}

async function acceptedTransaction(
  database: Database,
  payload: SubmissionV1,
  rawBody: Uint8Array,
  signature: string,
  now: Date,
  claimSecret: string,
): Promise<TransactionResult> {
  return database.transaction(async (tx) => {
    // Canonical lock order (F3): devices -> claim_codes -> rate_buckets. Every write path that
    // locks more than one of these MUST acquire them in this order to stay deadlock-free.
    // This txn locks devices first (createOrLockDevice) and claim_codes later (issueOrReuseClaim);
    // the submission-device rate bucket admitted in between shares no key with any claim_codes or
    // devices lock another path holds, so it cannot invert. bindClaim (claim.ts) MUST likewise
    // lock devices before claim_codes.
    const device = await createOrLockDevice(tx, payload);
    const submissionId = await insertSubmission(tx, payload, rawBody, signature, now);
    const admitted = await admitRateBucket(tx, {
      scope: "submission-device",
      key: payload.deviceId,
      secret: claimSecret,
      now,
      durationMs: 60 * 60 * 1_000,
      limit: 20,
    });
    if (!admitted) throw new SubmissionRejection("rate-limited");
    await writeReadings(tx, payload, submissionId, now);
    const claim = await issueOrReuseClaim(tx, device, now, claimSecret);
    await tx.query(
      `update devices set
         last_submitted_at = greatest(last_submitted_at, $2),
         last_cli_version = case when $2 >= last_submitted_at then $3 else last_cli_version end,
         last_platform_os = case when $2 >= last_submitted_at then $4 else last_platform_os end
       where id = $1`,
      [payload.deviceId, new Date(payload.submittedAt), payload.cliVersion, payload.platform.os],
    );
    const account = device.account_id
      ? await tx.query<{ github_login: string }>(
          "select github_login from accounts where id = $1",
          [device.account_id],
        )
      : null;
    return { device, githubLogin: account?.rows[0]?.github_login ?? null, claim };
  });
}

export async function handleSubmission(
  request: Request,
  options: { database?: Database; now?: Date; claimSecret?: string } = {},
): Promise<Response> {
  const rawBody = await requestBytes(request);
  if (rawBody === null) return failureResponse("invalid");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
  } catch {
    return failureResponse("invalid");
  }
  const keys = signatureKeys(parsed);
  const header = request.headers.get("x-tokenbroke-signature");
  const signature = header?.startsWith("ed25519=") ? header.slice("ed25519=".length) : "";
  if (
    keys === null ||
    signature.length === 0 ||
    signature.length > 256 ||
    deviceIdFor(keys.publicKey) !== keys.deviceId ||
    !verifyBytes(rawBody, signature, keys.publicKey)
  ) {
    return failureResponse("signature");
  }
  if (dataField(parsed, "schemaVersion") !== SCHEMA_VERSION) {
    return failureResponse("unsupported-version");
  }
  const validated = validateSubmissionV1(parsed);
  if (!validated.ok) return failureResponse("invalid");
  const now = options.now ?? new Date();
  if (Math.abs(now.getTime() - Date.parse(validated.payload.submittedAt)) > 10 * 60 * 1_000) {
    return failureResponse("skew");
  }
  if (!plausibleReadingTimes(validated.payload.readings, now.getTime())) {
    return failureResponse("implausible");
  }
  const claimSecret = options.claimSecret ?? process.env.CLAIM_SECRET;
  // A missing secret or a DB/unknown fault is our problem, not the caller's. Return a bare 503
  // whose body is deliberately NOT a SubmissionFailureV1 so the CLI's response validator falls
  // through to SubmitNetworkError (offline/try-again), never COPY.rejected as a terminal verdict.
  if (!claimSecret) return serverFault();
  const database = options.database ?? getDatabase();
  let accepted: TransactionResult;
  try {
    accepted = await acceptedTransaction(
      database,
      validated.payload,
      rawBody,
      signature,
      now,
      claimSecret,
    );
  } catch (error) {
    if (error instanceof SubmissionRejection) return failureResponse(error.reason);
    return serverFault();
  }
  // Invalidate only the tools this submission actually rewrote (readings that carried an
  // observation); untouched tools keep their warm cache. submissionLeaderboard then rebuilds the
  // invalidated ones at this same `now`, so the caller still sees their freshly written row (F12).
  for (const reading of validated.payload.readings) {
    if (reading.observedAt !== null) invalidateLeaderboardCache(reading.tool);
  }
  const board = await submissionLeaderboard(validated.payload.deviceId, now, database);
  const response: SubmissionSuccessV1 = {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    identity: {
      deviceId: validated.payload.deviceId,
      anonymousName: accepted.device.anonymous_name,
      claimed: accepted.githubLogin ? { githubLogin: accepted.githubLogin } : null,
    },
    claim: accepted.claim
      ? {
          code: accepted.claim.code,
          url: claimUrl(accepted.claim.code),
          expiresAt: accepted.claim.expiresAt.toISOString(),
        }
      : null,
    perTool: board.perTool,
    global: board.global,
    notices: [],
  };
  return Response.json(response);
}
