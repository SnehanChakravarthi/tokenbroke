import type { SubmissionFailureV1, SubmissionV1 } from "@tokenbroke/shared";
import { API_PATH_V1, SCHEMA_VERSION } from "@tokenbroke/shared";
import { canonicalJson, signBytes } from "@tokenbroke/shared/node/signing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type StubServer, startStubServer } from "../scripts/stub-server";
import { ephemeralIdentity } from "../src/identity";
import { buildSubmission } from "../src/submit";
import { localReadings } from "./fixtures";

let stub: StubServer;
beforeAll(async () => {
  stub = await startStubServer();
});
afterAll(async () => stub?.close());

/** Sign whatever we are told to send, so the server always reaches the check under test. */
async function post(mutate: (payload: SubmissionV1) => unknown): Promise<SubmissionFailureV1> {
  const identity = ephemeralIdentity();
  const payload = buildSubmission(localReadings(), identity);
  const body = Buffer.from(canonicalJson(mutate(payload) as SubmissionV1));
  const response = await fetch(new URL(API_PATH_V1, stub.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tokenbroke-signature": `ed25519=${signBytes(body, identity.privateKey)}`,
    },
    body,
  });
  return (await response.json()) as SubmissionFailureV1;
}

describe("stub submission validation", () => {
  it("rejects an unparseable submittedAt during full validation", async () => {
    for (const submittedAt of ["", "not-a-date", "Invalid Date", "2026-13-45T99:99:99Z"]) {
      expect(await post((payload) => ({ ...payload, submittedAt }))).toMatchObject({
        ok: false,
        reason: "invalid",
      });
    }
    expect(
      await post((payload) => ({ ...payload, submittedAt: null as unknown as string })),
    ).toMatchObject({ ok: false, reason: "invalid" });
    expect(
      await post((payload) => ({
        ...payload,
        submittedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      })),
    ).toMatchObject({ ok: false, reason: "skew" });
  });

  it("does not reveal supported schema versions to an unsigned caller", async () => {
    const identity = ephemeralIdentity();
    const payload = { ...buildSubmission(localReadings(), identity), schemaVersion: 999 };
    const body = Buffer.from(canonicalJson(payload));
    const response = await fetch(new URL(API_PATH_V1, stub.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(await response.json()).toMatchObject({ ok: false, reason: "signature" });
  });

  it("rejects a readings field that is not the two-tool tuple as invalid (F10)", async () => {
    const readings = localReadings();
    const cases: unknown[] = [
      [],
      [readings[0]],
      [readings[0], readings[1], readings[0]],
      [readings[1], readings[0]],
      [readings[0], null],
      [readings[0], { ...readings[1], windows: "lots" }],
      "readings",
      null,
      { "claude-code": readings[0], codex: readings[1] },
    ];
    for (const value of cases) {
      expect(
        await post((payload) => ({ ...payload, readings: value })),
        `readings=${JSON.stringify(value)?.slice(0, 40)}`,
      ).toMatchObject({ ok: false, reason: "invalid" });
    }
  });

  it("still accepts a well-formed submission", async () => {
    const identity = ephemeralIdentity();
    const payload = buildSubmission(localReadings(), identity);
    const body = Buffer.from(canonicalJson(payload));
    const response = await fetch(new URL(API_PATH_V1, stub.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tokenbroke-signature": `ed25519=${signBytes(body, identity.privateKey)}`,
      },
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, schemaVersion: SCHEMA_VERSION });
  });
});
