import { describe, expect, it } from "vitest";
import { logRatio, score } from "../score";
import type { RawMetrics } from "../types";
import fixtures from "./score-fixtures.json";

/**
 * Parity test: the TS port of `score()` must reproduce, byte-for-byte, the output
 * of the canonical Python skill (`fetch_github_profile.py`). Fixtures are the
 * Python `score()` output captured for representative account shapes — see
 * scripts that regenerate them in the README. If these drift, the website and the
 * open-source skill would disagree on the number.
 */
describe("score() parity with Python skill", () => {
  for (const [name, { input, expected }] of Object.entries(fixtures)) {
    it(`matches Python output for "${name}"`, () => {
      const result = score(input as unknown as RawMetrics);
      expect(result).toEqual(expected);
    });
  }
});

describe("logRatio", () => {
  it("returns 0 for non-positive values", () => {
    expect(logRatio(0, 5000)).toBe(0);
    expect(logRatio(-5, 5000)).toBe(0);
  });
  it("caps at 1.0 when value >= full_at", () => {
    expect(logRatio(5000, 5000)).toBe(1);
    expect(logRatio(99999, 5000)).toBe(1);
  });
  it("is monotonic increasing", () => {
    expect(logRatio(10, 5000)).toBeLessThan(logRatio(100, 5000));
  });
});
