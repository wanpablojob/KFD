import { POLL_JITTER, MAX_POLL_MS, pollEvery, backoffFor } from "./poll";

/**
 * Polling cadence under load.
 *
 * The defect these guard: every client polled on a fixed interval, so clients
 * that opened together fired together, and a failing endpoint was retried by
 * every client at the same cadence. Both turn a load spike into an outage.
 */

describe("pollEvery", () => {
  it("stays inside the jitter band", () => {
    const base = 15_000;
    const spread = base * POLL_JITTER;
    // random() === 0 is the low edge, random() === 1 is the high edge.
    expect(pollEvery(base, () => 0)).toBe(base - spread);
    expect(pollEvery(base, () => 1)).toBe(base + spread);
    expect(pollEvery(base, () => 0.5)).toBe(base);
  });

  it("never returns zero or a negative interval", () => {
    for (const base of [1, 10, 15_000, 60_000]) {
      const v = pollEvery(base, () => 0);
      expect(v).toBeGreaterThan(0);
    }
    // A degenerate base must still not produce a busy loop.
    expect(pollEvery(0, () => 0)).toBeGreaterThan(0);
  });

  it("spreads clients apart instead of returning one number", () => {
    const base = 15_000;
    const samples = Array.from({ length: 200 }, (_, i) =>
      pollEvery(base, () => i / 200)
    );
    expect(new Set(samples).size).toBeGreaterThan(100);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    expect(min).toBeGreaterThanOrEqual(base * (1 - POLL_JITTER) - 1);
    expect(max).toBeLessThanOrEqual(base * (1 + POLL_JITTER) + 1);
  });
});

describe("backoffFor", () => {
  it("uses the normal cadence with no failures", () => {
    expect(backoffFor(15_000, 0, () => 0.5)).toBe(15_000);
  });

  it("doubles per consecutive failure", () => {
    expect(backoffFor(10_000, 1, () => 0.5)).toBe(20_000);
    expect(backoffFor(10_000, 2, () => 0.5)).toBe(40_000);
    expect(backoffFor(10_000, 3, () => 0.5)).toBe(80_000);
  });

  it("caps at MAX_POLL_MS however long the outage lasts", () => {
    for (const failures of [4, 5, 10, 100, 1e6]) {
      expect(backoffFor(30_000, failures, () => 0.5)).toBeLessThanOrEqual(MAX_POLL_MS);
      expect(backoffFor(30_000, failures, () => 1)).toBeLessThanOrEqual(MAX_POLL_MS);
    }
  });

  it("survives a non-finite failure count", () => {
    expect(backoffFor(15_000, NaN, () => 0.5)).toBe(15_000);
    expect(backoffFor(15_000, Infinity, () => 0.5)).toBeLessThanOrEqual(MAX_POLL_MS);
    expect(backoffFor(15_000, -3, () => 0.5)).toBe(15_000);
  });

  it("still jitters a backed-off interval, so recoveries are not synchronised", () => {
    const low = backoffFor(30_000, 2, () => 0);
    const high = backoffFor(30_000, 2, () => 1);
    expect(low).toBeLessThan(high);
  });
});
