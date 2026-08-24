import { join } from "node:path";
import type { SubmissionSuccessV1 } from "@tokenbroke/shared";
import { verifyBytes } from "@tokenbroke/shared/node/signing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokenbrokePaths } from "../src/identity";
import { submitReadings } from "../src/submit";
import { localReadings, successResponse } from "./fixtures";
import { createTestHome, type TestHome } from "./readers/helpers";

let testHome: TestHome | undefined;
afterEach(async () => testHome?.cleanup());

describe("submitReadings", () => {
  it("makes one request and signs the exact body bytes", async () => {
    testHome = await createTestHome();
    const paths = tokenbrokePaths({ TOKENBROKE_HOME: join(testHome.home, "state") });
    const response = successResponse();
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const bytes = Buffer.from(init?.body as Uint8Array);
      const payload = JSON.parse(bytes.toString("utf8")) as { publicKey: string };
      const header = (init?.headers as Record<string, string>)["x-tokenbroke-signature"] ?? "";
      expect(verifyBytes(bytes, header.slice("ed25519=".length), payload.publicKey)).toBe(true);
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const result = await submitReadings(localReadings(), {
      paths,
      apiUrl: "http://127.0.0.1:9999",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.response).toEqual(response as SubmissionSuccessV1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
