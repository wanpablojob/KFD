import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeCancellations,
  type CancellationEntry,
} from "./rider-cancellation-summary.ts";

const now = new Date(2026, 10, 18, 15, 0);
const at = (daysAgo: number, hour: number) =>
  new Date(2026, 10, 18 - daysAgo, hour).toISOString();
const entry = (
  riderId: string,
  createdAt: string,
  kind: CancellationEntry["kind"] = "order",
): CancellationEntry => ({
  riderId,
  riderName: riderId === "R1" ? "Ana" : "Ben",
  kind,
  reference: "#KFD-1",
  reason: null,
  createdAt,
});

test("counts today and the week per rider, flags the limit, and ranks the worst first", () => {
  const rows = summarizeCancellations(
    [
      entry("R2", at(3, 10)),
      entry("R1", at(0, 9)),
      entry("R2", at(0, 8), "pabakal"),
      entry("R1", at(0, 11), "trip"),
      entry("R1", at(1, 23)),
    ],
    now,
  );
  assert.deepEqual(
    rows.map((r) => [r.riderName, r.today, r.week, r.atLimit]),
    [
      ["Ana", 2, 3, true],
      ["Ben", 1, 2, false],
    ],
  );
  // Newest first within a rider.
  assert.equal(rows[0].entries[0].kind, "trip");
});
