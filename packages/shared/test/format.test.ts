import { describe, expect, it } from "vitest";
import { ordinal } from "../src";

describe("ordinal", () => {
  it("uses st/nd/rd for 1/2/3 in every decade except the teens", () => {
    expect([1, 2, 3, 4, 5].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "5th"]);
    expect([21, 22, 23, 24].map(ordinal)).toEqual(["21st", "22nd", "23rd", "24th"]);
    expect([101, 102, 103, 104].map(ordinal)).toEqual(["101st", "102nd", "103rd", "104th"]);
  });

  it("keeps th for 11, 12, 13 and every repeat of that teen block", () => {
    expect([11, 12, 13].map(ordinal)).toEqual(["11th", "12th", "13th"]);
    expect([111, 112, 113].map(ordinal)).toEqual(["111th", "112th", "113th"]);
    expect([211, 212, 213].map(ordinal)).toEqual(["211th", "212th", "213th"]);
  });

  it("covers 0, 10, and 20 boundaries", () => {
    expect([0, 10, 20, 100, 110].map(ordinal)).toEqual(["0th", "10th", "20th", "100th", "110th"]);
  });
});
