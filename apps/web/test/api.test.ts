import {
  API_PATH_V1,
  SCHEMA_VERSION,
  type SubmissionResponseV1,
  type SubmissionV1,
  seriesId,
  type ToolId,
  type ToolReading,
} from "@tokenbroke/shared";
import {
  canonicalJson,
  deviceIdFor,
  generateDeviceKeyPair,
  signBytes,
} from "@tokenbroke/shared/node/signing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as postReset } from "../app/api/admin/resets/route";
import { GET as claimCallback } from "../app/api/claim/callback/route";
import { POST as claimStart } from "../app/api/claim/start/route";
import { GET as getLeaderboard } from "../app/api/v1/leaderboard/route";
import { POST as postSubmission } from "../app/api/v1/submissions/route";
import { claimIp, handleClaimCallback, mintClaimFormToken } from "../src/lib/claim";
import {
  createPGliteDatabase,
  type Database,
  type DatabaseQuery,
  setDatabaseForTests,
} from "../src/lib/db";
import { invalidateLeaderboardCache } from "../src/lib/leaderboard";
import { admitRateBucket } from "../src/lib/rate-limit";

const CLAIM_SECRET = "test-claim-secret-with-enough-entropy";
const TEST_ORIGIN = "https://example.test";

interface TestIdentity {
  publicKey: string;
  privateKey: string;
  deviceId: string;
}

let database: Database;

function identity(): TestIdentity {
  const pair = generateDeviceKeyPair();
  return { ...pair, deviceId: deviceIdFor(pair.publicKey) };
}

function reading(tool: ToolId, observedAt: Date, usedPercent: number): ToolReading {
  const key = {
    limitId: tool === "codex" ? "codex" : "claude",
    rawKind: tool === "codex" ? "primary" : "session",
    windowMinutes: 300,
    scope: null,
  };
  return {
    tool,
    install: "found",
    observation: "ok",
    toolVersion: "1.0.0",
    plan: { raw: tool === "codex" ? "plus" : "default_claude_max_5x", label: "Plus" },
    observedAt: observedAt.toISOString(),
    sourceFetchedAt: observedAt.toISOString(),
    windows: [
      {
        ...key,
        seriesId: seriesId(key),
        usedPercent,
        resetsAt: new Date(observedAt.getTime() + 4 * 60 * 60 * 1_000).toISOString(),
        group: null,
        severity: null,
        isActive: true,
      },
    ],
    drain: [],
    evidence: null,
    warnings: [],
  };
}

function payload(
  owner: TestIdentity,
  options: { nonce?: string; observedAt?: Date; usedPercent?: number } = {},
): SubmissionV1 {
  const observedAt = options.observedAt ?? new Date();
  return {
    schemaVersion: SCHEMA_VERSION,
    cliVersion: "0.0.0-test",
    deviceId: owner.deviceId,
    publicKey: owner.publicKey,
    submittedAt: new Date().toISOString(),
    nonce: options.nonce ?? `nonce-${crypto.randomUUID()}`,
    trigger: "manual",
    platform: { os: "linux", node: "20" },
    readings: [
      reading("claude-code", observedAt, options.usedPercent ?? 98),
      reading("codex", observedAt, options.usedPercent ?? 96),
    ],
  };
}

function signedRequest(value: unknown, owner: TestIdentity, signature = true): Request {
  const body = Buffer.from(canonicalJson(value));
  return new Request(`${TEST_ORIGIN}${API_PATH_V1}`, {
    method: "POST",
    headers: signature
      ? {
          "content-type": "application/json",
          "x-tokenbroke-signature": `ed25519=${signBytes(body, owner.privateKey)}`,
        }
      : { "content-type": "application/json" },
    body,
  });
}

async function submit(value: SubmissionV1, owner: TestIdentity): Promise<SubmissionResponseV1> {
  return (await (await postSubmission(signedRequest(value, owner))).json()) as SubmissionResponseV1;
}

function responseShape(response: SubmissionResponseV1): unknown {
  if (!response.ok)
    return { ok: false, keys: Object.keys(response).sort(), reason: response.reason };
  return {
    ok: true,
    keys: Object.keys(response).sort(),
    identity: Object.keys(response.identity).sort(),
    claim: response.claim ? Object.keys(response.claim).sort() : null,
    perTool: response.perTool.map((tool) => ({ tool: tool.tool, keys: Object.keys(tool).sort() })),
    global: {
      keys: Object.keys(response.global).sort(),
      perTool: response.global.perTool.map((tool) => ({
        tool: tool.tool,
        keys: Object.keys(tool).sort(),
      })),
    },
  };
}

function cookiePair(response: Response): string {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

beforeEach(async () => {
  process.env.CLAIM_SECRET = CLAIM_SECRET;
  process.env.GITHUB_CLIENT_ID = "github-client-id";
  process.env.GITHUB_CLIENT_SECRET = "github-client-secret";
  process.env.APP_ORIGIN = TEST_ORIGIN;
  database = await createPGliteDatabase();
  setDatabaseForTests(database);
  invalidateLeaderboardCache();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setDatabaseForTests(undefined);
  invalidateLeaderboardCache();
  await database.close?.();
});

// F4: PGlite runs a single connection and serializes transactions, so the "raced" cases below do
// NOT exercise real FOR UPDATE contention or deadlock-freedom. What these tests DO prove:
//   - a rejected transaction rolls back cleanly (no partial writes),
//   - nonce uniqueness admits exactly one copy of a submission,
//   - tool_states stays monotonic (newest observation wins the single-statement upsert),
//   - claim-code issuance and the rate bucket converge to one row under sequential replay.
// What they do NOT prove (needs a real-Postgres CI job with concurrent connections):
//   - true FOR UPDATE lock contention between overlapping transactions,
//   - deadlock-freedom of the canonical lock order (devices -> claim_codes -> rate_buckets).
describe("write-path ordering (PGlite serializes; not a concurrency proof)", () => {
  it("replays the CLI submission flow against migrated PGlite", async () => {
    const owner = identity();
    const firstPayload = payload(owner);
    const firstBody = Buffer.from(canonicalJson(firstPayload));
    const first = await submit(firstPayload, owner);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.identity.deviceId).toBe(owner.deviceId);
    expect(first.claim?.url).toContain("/claim/");
    expect(first.perTool.map((tool) => tool.tool)).toEqual(["claude-code", "codex"]);
    expect(first.perTool.every((tool) => tool.rank === 1)).toBe(true);

    const second = await submit(payload(owner), owner);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.identity.anonymousName).toBe(first.identity.anonymousName);
    expect(second.claim?.code).toBe(first.claim?.code);

    const stored = await database.query<{ raw_body: Uint8Array }>(
      "select raw_body from submissions order by id limit 1",
    );
    expect(Buffer.from(stored.rows[0]?.raw_body ?? [])).toEqual(firstBody);
    expect((await database.query("select 1 from submissions")).rowCount).toBe(2);
    expect((await database.query("select 1 from tool_states")).rowCount).toBe(2);
    expect((await database.query("select 1 from snapshot_obs")).rowCount).toBe(4);

    const replay = await submit(firstPayload, owner);
    expect(replay).toMatchObject({ ok: false, reason: "replay" });
    expect((await database.query("select 1 from submissions")).rowCount).toBe(2);

    const metrics = vi.mocked(console.log);
    metrics.mockClear();
    const leaderboard = await getLeaderboard(
      new Request(`${TEST_ORIGIN}/api/v1/leaderboard?tool=codex`),
    );
    expect(await leaderboard.json()).toMatchObject({
      ok: true,
      tool: "codex",
      rows: [{ rank: 1, name: first.identity.anonymousName }],
    });
    expect(metrics).not.toHaveBeenCalled();
    invalidateLeaderboardCache("codex");
    await getLeaderboard(new Request(`${TEST_ORIGIN}/api/v1/leaderboard?tool=codex`));
    expect(JSON.parse(String(metrics.mock.calls[0]?.[0]))).toMatchObject({
      event: "leaderboard_cache_rebuild",
      tool: "codex",
      rowsScanned: 1,
    });
  });

  it("does not give an unsigned caller a schema-version oracle", async () => {
    const owner = identity();
    const unsupported = { ...payload(owner), schemaVersion: 999 };
    const response = (await (
      await postSubmission(signedRequest(unsupported, owner, false))
    ).json()) as SubmissionResponseV1;
    expect(response).toMatchObject({ ok: false, reason: "signature" });
  });

  it("keeps current state monotonic and admits only one copy of a nonce under races", async () => {
    const owner = identity();
    const older = payload(owner, {
      nonce: "older-nonce",
      observedAt: new Date(Date.now() - 2 * 60_000),
      usedPercent: 70,
    });
    const newer = payload(owner, {
      nonce: "newer-nonce",
      observedAt: new Date(Date.now() - 60_000),
      usedPercent: 99,
    });
    const raced = await Promise.all([submit(older, owner), submit(newer, owner)]);
    expect(raced.every((response) => response.ok)).toBe(true);
    const current = await database.query<{
      observed_at: Date | string;
      windows: Array<{ usedPercent: number }>;
    }>("select observed_at, windows from tool_states where device_id = $1 and tool = 'codex'", [
      owner.deviceId,
    ]);
    expect(new Date(current.rows[0]?.observed_at ?? 0).toISOString()).toBe(
      newer.readings[1].observedAt,
    );
    expect(current.rows[0]?.windows[0]?.usedPercent).toBe(99);

    const sameNonce = payload(owner, { nonce: "one-winner" });
    const duplicate = await Promise.all([submit(sameNonce, owner), submit(sameNonce, owner)]);
    expect(duplicate.filter((response) => response.ok)).toHaveLength(1);
    expect(duplicate.filter((response) => !response.ok)).toEqual([
      expect.objectContaining({ reason: "replay" }),
    ]);
  });

  it("serializes claim-code issuance for two first submissions", async () => {
    const owner = identity();
    const [left, right] = await Promise.all([
      submit(payload(owner, { nonce: "claim-left" }), owner),
      submit(payload(owner, { nonce: "claim-right" }), owner),
    ]);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.claim?.code).toBe(right.claim?.code);
    expect((await database.query("select 1 from claim_codes")).rowCount).toBe(1);
  });

  it("does not over-admit when two requests race for the twentieth hourly slot", async () => {
    const owner = identity();
    for (let index = 0; index < 19; index++) {
      expect((await submit(payload(owner, { nonce: `rate-${index}` }), owner)).ok).toBe(true);
    }
    const raced = await Promise.all([
      submit(payload(owner, { nonce: "rate-left" }), owner),
      submit(payload(owner, { nonce: "rate-right" }), owner),
    ]);
    expect(raced.filter((response) => response.ok)).toHaveLength(1);
    expect(raced.filter((response) => !response.ok)).toEqual([
      expect.objectContaining({ reason: "rate-limited" }),
    ]);
    expect((await database.query("select 1 from submissions")).rowCount).toBe(20);
    expect(
      (
        await database.query<{ count: number }>(
          "select count from rate_buckets where scope = 'submission-device'",
        )
      ).rows[0]?.count,
    ).toBe(20);
  });

  it("rejects a reset horizon years in the future as implausible (F2)", async () => {
    const owner = identity();
    const hostile = payload(owner);
    hostile.readings[0].windows[0].resetsAt = new Date(
      Date.now() + 5 * 365 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    expect(await submit(hostile, owner)).toMatchObject({ ok: false, reason: "implausible" });
  });

  it("rejects an observation timestamp in the future as implausible (F2)", async () => {
    const owner = identity();
    const hostile = payload(owner);
    hostile.readings[0].observedAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    expect(await submit(hostile, owner)).toMatchObject({ ok: false, reason: "implausible" });
  });

  it("reports a DB fault as a bare 503, not a client rejection (F9)", async () => {
    const owner = identity();
    const failing: Database = {
      ...database,
      async transaction<T>(_operation: (tx: DatabaseQuery) => Promise<T>): Promise<T> {
        throw new Error("db down");
      },
    };
    setDatabaseForTests(failing);
    const response = await postSubmission(signedRequest(payload(owner), owner));
    expect(response.status).toBe(503);
    const body = (await response.json()) as Record<string, unknown>;
    // Deliberately NOT a SubmissionFailureV1: no `ok`/`reason`, so the CLI's response validator
    // falls through to SubmitNetworkError (offline/try-again copy), never COPY.rejected.
    expect(body.ok).toBeUndefined();
    expect(body.error).toBe("server-error");
  });

  it("does not count a device with no ranked windows toward tool devs (F11)", async () => {
    const owner = identity();
    const empty = payload(owner);
    empty.readings[0].windows = [];
    expect((await submit(empty, owner)).ok).toBe(true);
    invalidateLeaderboardCache();
    const claude = await (
      await getLeaderboard(new Request(`${TEST_ORIGIN}/api/v1/leaderboard?tool=claude-code`))
    ).json();
    expect(claude).toMatchObject({ ok: true, tool: "claude-code", global: { devs: 0 } });
    const codex = await (
      await getLeaderboard(new Request(`${TEST_ORIGIN}/api/v1/leaderboard?tool=codex`))
    ).json();
    expect(codex).toMatchObject({ ok: true, tool: "codex", global: { devs: 1 } });
  });
});

describe("claim flow", () => {
  async function startedClaim(): Promise<{ cookie: string; state: string }> {
    const owner = identity();
    const submitted = await submit(payload(owner), owner);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || !submitted.claim) throw new Error("claim fixture failed");
    const form = new FormData();
    form.set("code", submitted.claim.code);
    form.set("xHandle", "@token_user");
    form.set("formToken", mintClaimFormToken(submitted.claim.code, CLAIM_SECRET, new Date()));
    const start = await claimStart(
      new Request(`${TEST_ORIGIN}/api/claim/start`, {
        method: "POST",
        headers: { origin: TEST_ORIGIN, "x-forwarded-for": "203.0.113.1" },
        body: form,
      }),
    );
    expect(start.status).toBe(302);
    const location = new URL(start.headers.get("location") ?? "");
    expect(location.searchParams.has("scope")).toBe(false);
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    return { cookie: cookiePair(start), state: location.searchParams.get("state") ?? "" };
  }

  async function issuedCode(): Promise<string> {
    const owner = identity();
    const submitted = await submit(payload(owner), owner);
    if (!submitted.ok || !submitted.claim) throw new Error("claim fixture failed");
    return submitted.claim.code;
  }

  it("rejects a cross-origin claim start with no form token (F1)", async () => {
    const code = await issuedCode();
    const form = new FormData();
    form.set("code", code);
    const response = await claimStart(
      new Request(`${TEST_ORIGIN}/api/claim/start`, {
        method: "POST",
        headers: { origin: "https://evil.example", "x-forwarded-for": "203.0.113.9" },
        body: form,
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a same-origin claim start that is missing the form token (F1)", async () => {
    const code = await issuedCode();
    const form = new FormData();
    form.set("code", code);
    form.set("xHandle", "");
    const response = await claimStart(
      new Request(`${TEST_ORIGIN}/api/claim/start`, {
        method: "POST",
        headers: { origin: TEST_ORIGIN, "x-forwarded-for": "203.0.113.9" },
        body: form,
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a foreign-origin claim start even with a valid form token (F1)", async () => {
    const code = await issuedCode();
    const form = new FormData();
    form.set("code", code);
    form.set("formToken", mintClaimFormToken(code, CLAIM_SECRET, new Date()));
    const response = await claimStart(
      new Request(`${TEST_ORIGIN}/api/claim/start`, {
        method: "POST",
        headers: { origin: "https://evil.example", "x-forwarded-for": "203.0.113.9" },
        body: form,
      }),
    );
    expect(response.status).toBe(403);
  });

  it("builds the OAuth redirect_uri from APP_ORIGIN (F10)", async () => {
    process.env.APP_ORIGIN = "https://configured.test";
    const code = await issuedCode();
    const form = new FormData();
    form.set("code", code);
    form.set("xHandle", "");
    form.set("formToken", mintClaimFormToken(code, CLAIM_SECRET, new Date()));
    const start = await claimStart(
      new Request(`${TEST_ORIGIN}/api/claim/start`, {
        method: "POST",
        headers: { origin: "https://configured.test", "x-forwarded-for": "203.0.113.1" },
        body: form,
      }),
    );
    expect(start.status).toBe(302);
    const authorize = new URL(start.headers.get("location") ?? "");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "https://configured.test/api/claim/callback",
    );
  });

  it("clears the pending cookie when the callback throws (F7)", async () => {
    const { cookie, state } = await startedClaim();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("access_token")) return Response.json({ access_token: "one-use-token" });
      return Response.json({
        id: 424242,
        login: "octothrow",
        avatar_url: "https://avatars.example/octothrow.png",
        created_at: "2011-01-25T18:44:36.000Z",
      });
    });
    let transactions = 0;
    const throwing: Database = {
      ...database,
      async transaction<T>(operation: (tx: DatabaseQuery) => Promise<T>): Promise<T> {
        transactions += 1;
        // The callback runs claimAttempts (txn 1) then bindClaim (txn 2); fail the bind.
        if (transactions === 2) throw new Error("injected bind failure");
        return database.transaction(operation);
      },
    };
    const response = await handleClaimCallback(
      new Request(
        `${TEST_ORIGIN}/api/claim/callback?state=${encodeURIComponent(state)}&code=oauth-code`,
        { headers: { cookie, "x-forwarded-for": "203.0.113.1" } },
      ),
      { database: throwing, fetchImpl: fetchMock as unknown as typeof fetch },
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rejects a state mismatch and deletes the pending cookie", async () => {
    const { cookie } = await startedClaim();
    const callback = await claimCallback(
      new Request(`${TEST_ORIGIN}/api/claim/callback?state=wrong&code=oauth-code`, {
        headers: { cookie, "x-forwarded-for": "203.0.113.1" },
      }),
    );
    expect(callback.status).toBe(400);
    expect(callback.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("binds once, imports the verified X handle from GitHub socials, discards the token, and rejects cookie replay", async () => {
    const { cookie, state } = await startedClaim();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return Response.json({ access_token: "one-use-token" });
      }
      if (url.includes("social_accounts")) {
        // The X handle now comes verified from the user's own GitHub profile.
        return Response.json([
          { provider: "generic", url: "https://example.com/blog" },
          { provider: "twitter", url: "https://x.com/token_user" },
        ]);
      }
      return Response.json({
        id: 12345,
        login: "octocat",
        avatar_url: "https://avatars.example/octocat.png",
        created_at: "2011-01-25T18:44:36.000Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const callbackUrl = `${TEST_ORIGIN}/api/claim/callback?state=${encodeURIComponent(state)}&code=oauth-code`;
    const first = await claimCallback(
      new Request(callbackUrl, {
        headers: { cookie, "x-forwarded-for": "203.0.113.1" },
      }),
    );
    expect(first.status).toBe(200);
    expect(first.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(
      await database.query("select 1 from accounts where x_handle = 'token_user'"),
    ).toMatchObject({
      rowCount: 1,
    });

    const replay = await claimCallback(
      new Request(callbackUrl, {
        headers: { cookie, "x-forwarded-for": "203.0.113.1" },
      }),
    );
    expect(replay.status).toBe(400);
    expect(replay.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("manual reset admin", () => {
  it("requires the bearer token and appends an admin reset", async () => {
    process.env.ADMIN_TOKEN = "admin-test-token";
    const body = JSON.stringify({
      tool: "claude-code",
      announcedAt: "2026-08-24T10:00:00.000Z",
      landedAt: "2026-08-24T12:00:00.000Z",
      note: "manual confirmation",
    });
    const denied = await postReset(
      new Request(`${TEST_ORIGIN}/api/admin/resets`, {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
        body,
      }),
    );
    expect(denied.status).toBe(401);
    const accepted = await postReset(
      new Request(`${TEST_ORIGIN}/api/admin/resets`, {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` },
        body,
      }),
    );
    expect(accepted.status).toBe(201);
    // 3 migration-seeded historical resets + the one appended above.
    expect((await database.query("select 1 from resets")).rowCount).toBe(4);
  });
});

describe("stub parity", () => {
  it("returns the same discriminated contract shapes for matching fixtures", async () => {
    const { startStubServer } = await import("../../../packages/cli/scripts/stub-server");
    const stub = await startStubServer();
    try {
      const owner = identity();
      const fixtures: unknown[] = [
        payload(owner),
        { ...payload(owner), schemaVersion: 999 },
        { ...payload(owner), submittedAt: "not-a-date" },
      ];
      for (const value of fixtures) {
        const real = (await (
          await postSubmission(signedRequest(value, owner))
        ).json()) as SubmissionResponseV1;
        const body = Buffer.from(canonicalJson(value));
        const stubResponse = await fetch(new URL(API_PATH_V1, stub.url), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-tokenbroke-signature": `ed25519=${signBytes(body, owner.privateKey)}`,
          },
          body,
        });
        const reference = (await stubResponse.json()) as SubmissionResponseV1;
        expect(responseShape(real)).toEqual(responseShape(reference));
      }
    } finally {
      await stub.close();
    }
  });
});

describe("client IP derivation (F6)", () => {
  it("takes the rightmost forwarded hop and prefers the trusted Vercel header", () => {
    expect(claimIp(new Headers({ "x-forwarded-for": "1.2.3.4, 203.0.113.1" }))).toBe("203.0.113.1");
    expect(claimIp(new Headers({ "x-forwarded-for": "203.0.113.1" }))).toBe("203.0.113.1");
    expect(
      claimIp(
        new Headers({
          "x-vercel-forwarded-for": "9.9.9.9",
          "x-forwarded-for": "1.2.3.4, 203.0.113.1",
        }),
      ),
    ).toBe("9.9.9.9");
  });
});

describe("sliding-window rate limit (F8)", () => {
  it("does not admit a second full window immediately across the hour boundary", async () => {
    const durationMs = 60 * 60 * 1_000;
    const limit = 20;
    const bucketOptions = (now: Date) => ({
      scope: "test-slide",
      key: "device-1",
      secret: CLAIM_SECRET,
      now,
      durationMs,
      limit,
    });
    const admit = (now: Date): Promise<boolean> =>
      database.transaction((tx) => admitRateBucket(tx, bucketOptions(now)));

    const hourStart = new Date("2026-08-24T10:00:00.000Z");
    const lateInHour = new Date(hourStart.getTime() + 59 * 60 * 1_000);
    let admittedFirst = 0;
    for (let index = 0; index < 20; index++) {
      if (await admit(lateInHour)) admittedFirst++;
    }
    expect(admittedFirst).toBe(20);

    const justAfterBoundary = new Date(hourStart.getTime() + 61 * 60 * 1_000);
    let admittedSecond = 0;
    for (let index = 0; index < 20; index++) {
      if (await admit(justAfterBoundary)) admittedSecond++;
    }
    // A plain fixed window would admit all 20 again from a fresh bucket; the sliding window still
    // counts the decayed previous bucket (~20) and throttles the boundary burst.
    expect(admittedSecond).toBeLessThan(20);
    expect(admittedFirst + admittedSecond).toBeLessThan(40);
  });
});
