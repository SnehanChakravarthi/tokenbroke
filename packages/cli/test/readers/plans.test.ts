import { seriesId } from "@tokenbroke/shared";
import { describe, expect, it } from "vitest";
import { claudePlan, codexPlan } from "../../src/readers/plans";

describe("seriesId", () => {
  it("keeps unknown duration and empty scope stable", () => {
    expect(
      seriesId({ limitId: "codex_other", rawKind: "secondary", windowMinutes: null, scope: null }),
    ).toBe("codex_other:secondary:?:");
  });
});

describe("plan labels", () => {
  it("maps only verified Claude plan tiers", () => {
    expect(claudePlan("default_claude_max_5x")).toEqual({
      raw: "default_claude_max_5x",
      label: "Max 5x",
    });
    expect(claudePlan("claude_max")).toEqual({ raw: "claude_max", label: null });
  });

  it("matches upstream Codex KnownPlan display names", () => {
    expect(codexPlan("plus")).toEqual({ raw: "plus", label: "Plus" });
    expect(codexPlan("self_serve_business_prolite")).toEqual({
      raw: "self_serve_business_prolite",
      label: "Self Serve Business ProLite",
    });
    expect(codexPlan("enterprise_cbp_automation")).toEqual({
      raw: "enterprise_cbp_automation",
      label: "Enterprise (Automation)",
    });
    expect(codexPlan("future_plan")).toEqual({ raw: "future_plan", label: null });
  });
});
