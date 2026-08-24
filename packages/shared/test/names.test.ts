import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_NAME_PATTERN,
  generateAnonymousName,
  NAME_ADJECTIVES,
  NAME_NOUNS,
} from "../src/names";

describe("generateAnonymousName", () => {
  it("matches adjective-noun-number with a 1..99 suffix", () => {
    for (let i = 0; i < 500; i++) expect(generateAnonymousName()).toMatch(ANONYMOUS_NAME_PATTERN);
  });

  it("is deterministic for a given random source", () => {
    const seq = [0.1, 0.5, 0.9];
    expect(generateAnonymousName(() => seq.shift() ?? 0)).toBe(
      `${NAME_ADJECTIVES[Math.floor(0.1 * NAME_ADJECTIVES.length)]}-${NAME_NOUNS[Math.floor(0.5 * NAME_NOUNS.length)]}-90`,
    );
  });

  it("covers both lists and suffix range", () => {
    expect(generateAnonymousName(() => 0)).toBe(`${NAME_ADJECTIVES[0]}-${NAME_NOUNS[0]}-1`);
    expect(generateAnonymousName(() => 0.999999)).toBe(
      `${NAME_ADJECTIVES.at(-1)}-${NAME_NOUNS.at(-1)}-99`,
    );
  });
});
