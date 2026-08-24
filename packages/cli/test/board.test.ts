import { BRAND, type LocalReadings } from "@tokenbroke/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderBoard } from "../src/board";
import { COPY } from "../src/copy";
import { localReadings, successResponse, TEST_NOW, toolReading } from "./fixtures";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TEST_NOW);
});
afterEach(() => vi.useRealTimers());

describe("renderBoard", () => {
  it("renders top rows, neighbors, server roast, collective state, and claim", () => {
    const output = renderBoard(successResponse(), localReadings());
    expect(output).toMatchSnapshot();
    expect(output).toContain(COPY.youMarker);
    expect(output).toContain(`${BRAND.domain}/claim/ABCD-1234`);
    for (const line of output.split("\n")) expect(line.length).toBeLessThanOrEqual(80);
  });

  it("always shows your own windows, even when the verdict is not broke (P1)", () => {
    const response = successResponse();
    const claude = response.perTool[0];
    if (!claude) throw new Error("missing Claude fixture");
    response.perTool[0] = { ...claude, rankable: false, misery: 0 };
    const output = renderBoard(response, [toolReading("claude-code", 12), toolReading("codex")]);
    expect(output).toContain("NOT BROKE");
    expect(output).toContain("come back when it hurts");
    // "not broke" is a verdict on the numbers, so the numbers stay on screen.
    expect(output).toContain("5h");
    expect(output).toContain("88%");
    expect(output).toContain("Max 5x");
  });

  it("renders the absent-tool line under its own heading, never the other tool's rows (F12c)", () => {
    const readings = [toolReading("codex"), toolReading("codex")] as unknown as LocalReadings;
    const output = renderBoard(successResponse(), readings);
    // Receipt sections are headed by the bare uppercase tool name.
    const claudeBlock = output.slice(output.indexOf("CLAUDE CODE"), output.indexOf("CODEX"));
    expect(claudeBlock).toContain(COPY.oneToolMissing("Claude Code"));
    expect(claudeBlock).not.toContain(COPY.youMarker);
    expect(claudeBlock).not.toContain("starving-crab-1");
  });

  it("renders not-broke, sentence-served, no-snapshot, and missing-tool states", () => {
    const response = successResponse();
    const claude = response.perTool[0];
    if (!claude) throw new Error("missing Claude fixture");
    response.perTool[0] = { ...claude, misery: 0 };
    expect(renderBoard(response, [toolReading("claude-code", 40), toolReading("codex")])).toContain(
      "NOT BROKE",
    );

    const expired = toolReading("claude-code", 99, -1);
    response.perTool[0] = { ...claude, rankable: false, misery: null };
    expect(renderBoard(response, [expired, toolReading("codex")])).toContain(
      COPY.sentenceServed.toUpperCase(),
    );

    const noSnapshot = {
      ...toolReading("claude-code"),
      observation: "no-snapshot" as const,
      windows: [],
    };
    expect(
      renderBoard(response, [noSnapshot, toolReading("codex")]).replaceAll("\n", " "),
    ).toContain(COPY.noSnapshot("Claude Code"));

    const missing = { ...toolReading("claude-code"), install: "not-found" as const, windows: [] };
    expect(renderBoard(response, [missing, toolReading("codex")])).toContain(
      COPY.oneToolMissing("Claude Code"),
    );
  });
});
