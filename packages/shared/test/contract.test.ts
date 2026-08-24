import { describe, expect, it } from "vitest";
import { API_PATH_V1, SCHEMA_VERSION, type SubmissionResponseV1 } from "../src/contract/v1";

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
});
